import assert from 'node:assert/strict';
globalThis.localStorage = (() => { const map=new Map();return {getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k)}; })();
const {parseToolCall,buildToolsSection}=await import('../js/tools-registry.js');
const {verifyFinal}=await import('../js/verifiers.js');
const {runReAct}=await import('../js/harness-core.js');
for(const name of ['browser_observe','browser_action','browser_navigate','browser_capture','browser_stop'])assert.equal(parseToolCall(`<tool name="${name}">{}</tool>`).name,name);
const longText='á'.repeat(5000);assert.equal(JSON.parse(parseToolCall(`<tool name="browser_action">${JSON.stringify({observation:'token',action:'fill',element:'0',text:longText})}</tool>`).arg).text,longText);
assert.match(buildToolsSection([]),/não confiável/);
assert.equal(verifyFinal('Cliquei e concluí.',{toolsUsed:['browser_action'],browserEvidence:[{tool:'browser_action',verified:false}]}).ok,false);
assert.equal(verifyFinal('O efeito não foi confirmado.',{toolsUsed:['browser_action'],browserEvidence:[{tool:'browser_action',verified:false}]}).ok,true);
let calls=0;
const result=await runReAct('Clique no botão da página.',{
 history:[],cfg:{model:'test'},getSkills:()=>[],
 callLLM:async()=>++calls===1?'<tool name="browser_action">{"observation":"t","action":"click","element":"0"}</tool>':'Cliquei e concluí.',
 execToolReal:async()=>'[BROWSER_RESULT]'+JSON.stringify({performed:true,verified:false,reason:'sem alteração'}),
});
assert.equal(result.ok,false);assert.ok(result.pending.some(p=>p.check==='browser-effect'));
let successCalls=0;
const success=await runReAct('Clique no botão da página.',{history:[],cfg:{model:'test'},getSkills:()=>[],callLLM:async()=>++successCalls===1?'<tool name="browser_action">{"observation":"t","action":"click","element":"0"}</tool>':'O resultado foi conferido.',execToolReal:async()=>'[BROWSER_RESULT]'+JSON.stringify({performed:true,verified:true})});
assert.equal(success.ok,true);
console.log('VERIFIED: browser parsers, long Unicode fill payload, untrusted-page instruction, and actual ReAct success/failure evidence gates.');
