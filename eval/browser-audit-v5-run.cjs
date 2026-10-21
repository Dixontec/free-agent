'use strict';
const {spawnSync}=require('node:child_process'),path=require('node:path');
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const r=spawnSync(require('electron'),[path.join(__dirname,'browser-audit-v5-eval.cjs')],{env,stdio:'inherit',windowsHide:true,timeout:100000});
if(r.error)console.error(r.error.message);process.exitCode=r.status===0?0:1;
