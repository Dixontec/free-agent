'use strict';
const {spawnSync}=require('node:child_process'),path=require('node:path');
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const result=spawnSync(require('electron'),[path.join(__dirname,'browser-controls-eval.cjs')],{env,stdio:'inherit',windowsHide:true,timeout:60000});
if(result.error)console.error(result.error.message);process.exitCode=result.status===0?0:1;
