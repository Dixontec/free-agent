'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const BASE='https://raw.githubusercontent.com/ghostery/adblocker/';
const SOURCES=['easylist/easylist.txt','peter-lowe/serverlist.txt',...['badware','filters-2020','filters-2021','filters-2022','filters-2023','filters-2024','filters','quick-fixes','resource-abuse','unbreak'].map(n=>'ublock-origin/'+n+'.txt'),'easylist/easyprivacy.txt','ublock-origin/privacy.txt','ublock-origin/resources.json'];
const sha=text=>crypto.createHash('sha256').update(text).digest('hex');
function validate(bundle){
 if(!bundle||bundle.version!==1||!/^[a-f0-9]{40}$/.test(bundle.commit)||!Array.isArray(bundle.files)||bundle.files.length!==SOURCES.length)throw Error('Pacote de filtros inválido.');
 let total=0;
 for(const name of SOURCES){const f=bundle.files.find(f=>f.name===name);if(!f||typeof f.text!=='string'||f.text.length>12*1024*1024||sha(f.text)!==f.sha256)throw Error('Falha na integridade dos filtros.');total+=f.text.length}
 if(total>24*1024*1024)throw Error('Pacote de filtros excede o limite.');return bundle;
}
function load(dataDirectory){
 for(const file of[path.join(dataDirectory,'browser-filter-bundle.json'),path.join(__dirname,'../assets/browser/enhanced/bundle.json')]){
  try{return validate(JSON.parse(fs.readFileSync(file,'utf8')))}catch{}
 }throw Error('Pacote de filtros não encontrado.');
}
async function bounded(url,limit){const response=await fetch(url,{signal:AbortSignal.timeout(12000),headers:{'User-Agent':'Free-Agent-Filter-Updater'}});if(!response.ok)throw Error('Não foi possível obter os filtros oficiais.');let size=0;const chunks=[];for await(const chunk of response.body){size+=chunk.length;if(size>limit)throw Error('Resposta de filtros excedeu o limite.');chunks.push(chunk)}return Buffer.concat(chunks).toString('utf8')}
async function download(){
 const commit=JSON.parse(await bounded('https://api.github.com/repos/ghostery/adblocker/commits/master',1024*1024)).sha;
 if(!/^[a-f0-9]{40}$/.test(commit))throw Error('Revisão de filtros inválida.');
 const files=[];
 // Bound downloads and parse one complete revision before replacing the cache.
 for(let i=0;i<SOURCES.length;i+=3)files.push(...await Promise.all(SOURCES.slice(i,i+3).map(async name=>{const url=BASE+commit+'/packages/adblocker/assets/'+name;const text=await bounded(url,12*1024*1024);return{name,url,text,sha256:sha(text)}})));
 return validate({version:1,commit,fetchedAt:new Date().toISOString(),files});
}
function engine(lib,bundle){validate(bundle);const lists=bundle.files.filter(f=>f.name.endsWith('.txt')).map(f=>f.text).join('\n');const result=lib.FiltersEngine.parse(lists,{loadCosmeticFilters:true,enableCompression:true});const resources=bundle.files.find(f=>f.name.endsWith('resources.json'));result.updateResources(resources.text,resources.sha256);return result}
function save(directory,bundle){validate(bundle);fs.mkdirSync(directory,{recursive:true});const target=path.join(directory,'browser-filter-bundle.json');fs.writeFileSync(target+'.tmp',JSON.stringify(bundle));fs.renameSync(target+'.tmp',target)}
module.exports={load,download,engine,save,validate};
