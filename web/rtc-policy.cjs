'use strict';

const os = require('node:os');
const net = require('node:net');

const MAX_BYTES = 64 * 1024;
const DEADLINE_MS = 2000;
const MDNS_NAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.local$/i;
const fail = (code) => { throw Object.assign(new Error(`RTC policy: ${code}`), { code }); };

function ip(value) {
  if (typeof value !== 'string' || value.includes('%') || !net.isIP(value)) return null;
  return net.isIP(value) === 6 ? new URL(`http://[${value}]/`).hostname.slice(1, -1) : value;
}

function localSet(addresses) {
  const values = addresses === undefined
    ? Object.values(os.networkInterfaces()).flat().filter(Boolean).map((entry) => entry.address)
    : addresses;
  if (!Array.isArray(values) && !(values instanceof Set)) fail('INVALID_ADDRESS_CONFIGURATION');
  const result = new Set(['127.0.0.1', '::1']);
  for (const value of values) {
    const normalized = ip(value);
    if (normalized && normalized !== '0.0.0.0' && normalized !== '::') result.add(normalized);
  }
  return result;
}

// Chromium's mDNS responder parses one question per datagram. Bundling A/AAAA
// or several hostnames only appeared to work while unsolicited announcements
// were still cached. Query each record separately, retaining the same bounds,
// local-address validation, retry schedule and two-second deadline.
function lookupBatch(names, signal) {
  return new Promise((resolve, reject) => {
    let client;
    let done = false, packets = 0;
    const retries = [], found = new Map();
    const finish = (error) => {
      if (done) return;
      done = true;
      for (const timer of retries) clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      if (client) { try { client.destroy(); } catch {} }
      if (error) reject(error); else resolve(found);
    };
    const abort = () => finish(new Error('deadline'));
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) return abort();
    try {
      client = require('multicast-dns')();
      client.on('error', () => finish(new Error('socket')));
      client.on('warning', () => finish(new Error('socket_or_packet')));
      client.on('packet', () => { if (++packets > 128) finish(new Error('packet_limit')); });
      client.on('response', packet => {
        if (done) return;
        const records = [...(packet.answers || []), ...(packet.additionals || [])];
        if (records.length > 256) return finish(new Error('record_limit'));
        for (const record of records) {
          const name = String(record.name).replace(/\.$/, '').toLowerCase();
          if (!names.includes(name) || !['A', 'AAAA'].includes(record.type) || record.ttl === 0) continue;
          const addresses = found.get(name) || [];
          addresses.push(record.data);
          const ttl = Number.isInteger(record.ttl) && record.ttl > 0 ? Math.min(record.ttl, 30) : 0;
          addresses.expires = Math.min(addresses.expires ?? Infinity, Date.now() + ttl * 1000);
          if (addresses.length > 32) return finish(new Error('answer_limit'));
          found.set(name, addresses);
        }
        if (names.every(name => found.has(name))) finish();
      });
      client.once('ready', () => {
        const query = () => {
          for (const name of names.filter(name => !found.has(name))) {
            for (const type of ['A', 'AAAA']) {
              if (done) return;
              client.query([{ name, type }], error => { if (error) finish(new Error('query')); });
            }
          }
        };
        if (done) return;
        query();
        for (const ms of [650, 1300]) retries.push(setTimeout(query, ms));
      });
    } catch { finish(new Error('socket')); }
  });
}

function integer(value, min, max) {
  return /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) >= min && Number(value) <= max;
}

function createRtcPolicy({ addresses, lookupMdns } = {}) {
  if (lookupMdns !== undefined && typeof lookupMdns !== 'function') fail('INVALID_LOOKUP_CONFIGURATION');
  // Policy-local pins only for the real resolver. Injected resolvers are never cached.
  // A cached name is not resolved again in Chrome: the literal validated IP is emitted.
  const pins = new Map();
  return {
    async sanitizeOffer(sdp, options = {}) {
      const lookup = options.lookupMdns === undefined ? lookupMdns : options.lookupMdns;
      if (lookup !== undefined && typeof lookup !== 'function') fail('INVALID_LOOKUP_CONFIGURATION');
      if (typeof sdp !== 'string' || Buffer.byteLength(sdp, 'utf8') > MAX_BYTES) fail('SDP_SIZE_OR_TYPE');
      if (/[^\x09\x0a\x0d\x20-\x7e]/.test(sdp) || /\r(?!\n)/.test(sdp)) fail('SDP_ENCODING');
      const lines = sdp.replace(/\r\n/g, '\n').split('\n');
      if (lines.at(-1) === '') lines.pop();
      if (!lines.length || lines.length > 2048 || lines.some((line) => !/^[a-z]=[^\r\n]*$/.test(line) || line.length > 4096)) fail('SDP_SYNTAX');
      let own = localSet(addresses); // Default policy takes a fresh OS snapshot on every call.
      const local = (value, placeholder = false) => {
        const normalized = ip(value);
        if (!normalized || (!own.has(normalized) && !(placeholder && ['0.0.0.0', '::'].includes(normalized)))) fail('NONLOCAL_ADDRESS');
        return normalized;
      };
      const connection = (text) => {
        const match = /^IN (IP4|IP6) (\S+)$/.exec(text);
        if (!match || net.isIP(match[2]) !== (match[1] === 'IP4' ? 4 : 6)) fail('CONNECTION_SYNTAX');
        return `IN ${match[1]} ${local(match[2], true)}`;
      };
      const session = { attrs: new Map(), connection: false };
      const media = [];
      const candidates = [];
      const names = new Set();
      const counts = new Map();
      let scope = session;
      // Attributes with no network destination semantics; all unknown extensions fail closed.
      const inert = new Set(['group', 'msid-semantic', 'mid', 'msid', 'ssrc', 'ssrc-group', 'rtpmap', 'fmtp',
        'rtcp-fb', 'extmap', 'extmap-allow-mixed', 'rtcp-mux', 'rtcp-mux-only', 'rtcp-rsize',
        'sendrecv', 'sendonly', 'recvonly', 'inactive', 'end-of-candidates']);
      for (let index = 0; index < lines.length; index++) {
        const line = lines[index];
        const value = line.slice(2);
        const type = line[0];
        if (type === 'm') {
          const match = /^(audio|video) (\d+) UDP\/TLS\/RTP\/SAVPF (\d+(?: \d+)*)$/.exec(value);
          if (!match || !integer(match[2], 0, 65535) || match[3].split(' ').some((p) => !integer(p, 0, 127))) fail('MEDIA_NOT_ALLOWED');
          if (media.length === 2 || media.some((m) => m.kind === match[1])) fail('MEDIA_LIMIT');
          scope = { kind: match[1], attrs: new Map(), connection: false };
          media.push(scope);
        } else if (type === 'c') {
          if (scope.connection) fail('DUPLICATE_CONNECTION');
          lines[index] = `c=${connection(value)}`;
          scope.connection = true;
        } else if (type === 'a') {
          const colon = value.indexOf(':');
          const name = colon < 0 ? value : value.slice(0, colon);
          const data = colon < 0 ? '' : value.slice(colon + 1);
          if (name === 'candidate') {
            if (scope === session || candidates.length >= 128) fail('CANDIDATE_LIMIT_OR_SCOPE');
            const parts = data.split(' ');
            if (parts.some((part) => !part) || parts.length < 8 || (parts.length - 8) % 2 !== 0 ||
              !/^[a-zA-Z0-9+/]{1,32}$/.test(parts[0]) || !integer(parts[1], 1, 2) ||
              !/^(udp|tcp)$/i.test(parts[2]) || !integer(parts[3], 1, 4294967295) ||
              !integer(parts[5], 1, 65535) || parts[6] !== 'typ' || parts[7] !== 'host') fail('CANDIDATE_NOT_ALLOWED');
            const extras = new Map();
            for (let p = 8; p < parts.length; p += 2) {
              const key = parts[p];
              const val = parts[p + 1];
              if (extras.has(key)) fail('CANDIDATE_EXTENSION');
              extras.set(key, val);
              if (key === 'tcptype') {
                if (!['active', 'passive', 'so'].includes(val)) fail('CANDIDATE_TCP_TYPE');
              } else if (!['generation', 'network-id', 'network-cost'].includes(key) || !integer(val, 0, 4294967295)) fail('CANDIDATE_EXTENSION');
            }
            if ((parts[2].toLowerCase() === 'tcp') !== extras.has('tcptype')) fail('CANDIDATE_TCP_TYPE');
            if (MDNS_NAME.test(parts[4])) names.add(parts[4].toLowerCase());
            else parts[4] = local(parts[4]);
            candidates.push({ index, parts });
          } else if (name === 'rtcp-xr') {
            // XR report negotiation only, not an arbitrary extension/value escape hatch.
            // rcvr-rtt selects all senders or active senders, optionally with a max size;
            // rrtr/dlrr are reference-time report flags. None carries a destination.
            const reports = data.split(' ');
            const seen = new Set();
            if (!data || reports.length > 3) fail('RTCP_XR_INVALID');
            for (const report of reports) {
              const match = /^rcvr-rtt=(all|sender)(?::(\d{1,10}))?$/.exec(report);
              const key = match ? 'rcvr-rtt' : report;
              if ((!match && !['rrtr', 'dlrr'].includes(report)) ||
                (match && match[2] !== undefined && !integer(match[2], 0, 4294967295)) || seen.has(key)) fail('RTCP_XR_INVALID');
              seen.add(key);
            }
            if (scope.attrs.has(name)) fail('DUPLICATE_ATTRIBUTE');
            scope.attrs.set(name, data);
          } else if (name === 'rtcp') {
            const match = /^(\d+)(?: (IN (?:IP4|IP6) \S+))?$/.exec(data);
            if (scope === session || !match || !integer(match[1], 1, 65535)) fail('RTCP_SYNTAX');
            if (scope.attrs.has(name)) fail('DUPLICATE_ATTRIBUTE');
            scope.attrs.set(name, data);
            if (match[2]) lines[index] = `a=rtcp:${match[1]} ${connection(match[2])}`;
          } else if (['fingerprint', 'ice-ufrag', 'ice-pwd', 'setup', 'ice-options'].includes(name)) {
            if (scope.attrs.has(name)) fail('DUPLICATE_ATTRIBUTE');
            scope.attrs.set(name, data);
            if (name === 'fingerprint' && !/^sha-256 (?:[0-9a-f]{2}:){31}[0-9a-f]{2}$/i.test(data)) fail('FINGERPRINT_REQUIRED_SHA256');
            if (name === 'ice-ufrag' && !/^[a-zA-Z0-9+/]{4,256}$/.test(data)) fail('ICE_UFRAG_INVALID');
            if (name === 'ice-pwd' && !/^[a-zA-Z0-9+/]{22,256}$/.test(data)) fail('ICE_PWD_INVALID');
            if (name === 'setup' && data !== 'actpass') fail('OFFER_SETUP_INVALID');
            if (name === 'ice-options') {
              // Bounded capability flags only; candidates/destinations remain
              // validated independently. SPED negotiates DTLS-in-STUN in libwebrtc.
              const options = data.split(' ');
              if (!options.length || options.length > 5 || new Set(options).size !== options.length ||
                options.some(option => !['trickle', 'renomination', 'ice2', 'googspedv1', 'sped'].includes(option))) fail('ICE_OPTIONS_INVALID');
            }
          } else if (!inert.has(name)) fail('ATTRIBUTE_NOT_ALLOWED');
        } else {
          if (scope !== session || !['v', 'o', 's', 't', 'b'].includes(type)) fail('SDP_FIELD_NOT_ALLOWED');
          counts.set(type, (counts.get(type) || 0) + 1);
          if (type === 'v' && (index !== 0 || value !== '0')) fail('SDP_VERSION');
          if (type === 'o') {
            const match = /^(\S+) (\d+) (\d+) (IN (?:IP4|IP6) \S+)$/.exec(value);
            if (!match) fail('ORIGIN_SYNTAX');
            lines[index] = `o=${match[1]} ${match[2]} ${match[3]} ${connection(match[4])}`;
          }
          if (type === 't' && value !== '0 0') fail('SDP_TIMING');
          if (type === 'b' && !/^(AS|TIAS):\d+$/.test(value)) fail('SDP_BANDWIDTH');
        }
      }
      if (['v', 'o', 's', 't'].some((key) => counts.get(key) !== 1) || !media.length) fail('SDP_REQUIRED_FIELDS');
      for (const m of media) {
        if (!m.connection && !session.connection) fail('CONNECTION_REQUIRED');
        for (const key of ['fingerprint', 'ice-ufrag', 'ice-pwd', 'setup']) {
          if (!m.attrs.has(key) && !session.attrs.has(key)) fail('SECURITY_ATTRIBUTE_REQUIRED');
        }
      }
      if (!candidates.length) fail('HOST_CANDIDATE_REQUIRED');
      if (names.size > 16) fail('MDNS_NAME_LIMIT');
      if (names.size) {
        const controller = new AbortController();
        let timer;
        try {
          const deadline = new Promise((_, reject) => {
            timer = setTimeout(() => { controller.abort(); reject(new Error('deadline')); }, DEADLINE_MS);
          });
          const list = [...names];
          for (const [name, pin] of pins) {
            if (pin.expires <= Date.now() || pin.answers.some((address) => !own.has(address))) pins.delete(name);
          }
          const pending = lookup ? list : list.filter((name) => !pins.has(name));
          const work = lookup
            ? Promise.all(list.map(async (name) => [name, await lookup(name, { signal: controller.signal })])).then((pairs) => new Map(pairs))
            : pending.length ? lookupBatch(pending, controller.signal) : Promise.resolve(new Map());
          const resolved = await Promise.race([work, deadline]);
          // Interfaces may change during the async lookup. Recheck before emitting literals.
          own = localSet(addresses);
          const replacements = new Map();
          for (const name of list) {
            const answers = resolved.get(name) ?? (!lookup ? pins.get(name)?.answers : undefined);
            if (!Array.isArray(answers) || !answers.length || answers.length > 32) fail('MDNS_ANSWER_INVALID');
            // Reject a mixed local/foreign answer set, rather than silently selecting a local answer.
            replacements.set(name, answers.map((answer) => local(answer))[0]);
          }
          if (!lookup) for (const [name, answers] of resolved) {
            if (answers.expires <= Date.now()) continue;
            pins.delete(name);
            while (pins.size >= 128) pins.delete(pins.keys().next().value);
            pins.set(name, { answers: answers.map((answer) => local(answer)), expires: answers.expires });
          }
          for (const candidate of candidates) {
            if (MDNS_NAME.test(candidate.parts[4])) candidate.parts[4] = replacements.get(candidate.parts[4].toLowerCase());
          }
        } catch (error) {
          if (error?.code === 'NONLOCAL_ADDRESS' || error?.code === 'MDNS_ANSWER_INVALID') throw error;
          fail('MDNS_LOOKUP_FAILED');
        } finally {
          clearTimeout(timer);
          controller.abort();
        }
      }
      for (const { index, parts } of candidates) lines[index] = `a=candidate:${parts.join(' ')}`;
      const sanitized = `${lines.join('\r\n')}\r\n`;
      if (Buffer.byteLength(sanitized, 'utf8') > MAX_BYTES) fail('SDP_SIZE_OR_TYPE');
      return sanitized;
    }
  };
}

const { sanitizeOffer } = createRtcPolicy();
module.exports = { sanitizeOffer, createRtcPolicy };
