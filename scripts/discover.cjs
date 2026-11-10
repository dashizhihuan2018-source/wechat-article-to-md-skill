#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path');
const {articleUrl}=require('./batch.cjs');
const ENDPOINT='https://api.dataxapi.com/v1/wechat_mp/accounts/articles/list';
async function discover(options,runtime={}) {
  if(!/^gh_[A-Za-z0-9_]+$/.test(options.id||''))throw Error('--id must be a verified gh_ account ID');
  if(!options.outputDir)throw Error('--output-dir is required');
  const budget=options.pages==='all'?Infinity:Number(options.pages??1);
  if(budget!==Infinity&&(!Number.isSafeInteger(budget)||budget<1))throw Error('--pages must be a positive integer or all');
  const key=runtime.key??process.env.DATAXAPI_API_KEY;
  if(!key||/[\r\n]/.test(key))throw Error('Set DATAXAPI_API_KEY in the local environment; no request sent');
  const out=path.resolve(options.outputDir);fs.mkdirSync(path.dirname(out),{recursive:true});fs.mkdirSync(out);
  const links=[],seen=new Set(),cursors=new Set();let cursor=options.cursor||null;
  if(cursor)cursors.add(cursor);
  const state={provider:'dataxapi',account_id:options.id,account_name:options.account??null,started_at:new Date().toISOString(),status:'running',pages_fetched:0,next_cursor:cursor,coverage:'provider_visible_results_only',complete_history_verified:false,error:null};
  let revision=0;
  function save(name,value){const tmp=path.join(out,'.checkpoint-'+revision++);fs.writeFileSync(tmp,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});fs.renameSync(tmp,path.join(out,name));}
  function checkpoint(){save('discovery.json',state);save('discovered-links.json',{ordering:'provider newest-first; per-article account identity still checked by batch --account',account_id:options.id,coverage:state.coverage,links});}
  checkpoint();
  try {
    while(state.pages_fetched<budget){
      if(state.pages_fetched)await(runtime.sleep??(ms=>new Promise(r=>setTimeout(r,ms))))(60000);
      const url=new URL(ENDPOINT);url.searchParams.set('id',options.id);if(cursor)url.searchParams.set('cursor',cursor);
      let response;
      try{response=await(runtime.fetch??fetch)(url,{headers:{Authorization:'Bearer '+key,Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(120000)});}catch{throw Error('Provider network request failed; progress retained');}
      if(!response.ok)throw Error('Provider HTTP '+response.status+'; stopped without retry');
      let body;try{body=await response.json();}catch{throw Error('Provider did not return JSON');}
      if(body.code!=='ok')throw Error('Provider returned a business error; inspect provider dashboard');
      if(!Array.isArray(body.data?.items)||typeof body.page?.has_more!=='boolean')throw Error('Unsupported provider response schema');
      const pageLinks=[];
      for(const item of body.data.items){
        if(item.author?.id!==options.id)throw Error('Provider article account ID is missing or mismatched');
        const url=articleUrl(item.url);
        if(seen.has(url)||pageLinks.some(x=>x.url===url))continue;
        pageLinks.push({url,...(typeof item.title==='string'?{title:item.title}:{}),...(typeof item.published_at==='string'?{published_at:item.published_at}:{}),discovery:{provider:'dataxapi',account_id:options.id,fetched_at:new Date().toISOString(),page:state.pages_fetched+1}});
      }
      for(const entry of pageLinks){links.push(entry);seen.add(entry.url);}state.pages_fetched++;
      if(!body.page.has_more){state.next_cursor=null;state.status='provider_exhausted';checkpoint();return state;}
      const next=body.page.next_cursor;
      if(typeof next!=='string'||!next||cursors.has(next))throw Error('Missing or repeated pagination cursor');
      cursor=next;cursors.add(next);state.next_cursor=cursor;checkpoint();
    }
    state.status='page_budget_reached';checkpoint();return state;
  }catch(error){state.status='stopped';state.error=error.message;checkpoint();return state;}
}
async function main(args){
  if(args.length===1&&args[0]==='--help'){console.log('discover --id gh_ACCOUNT --output-dir NEW_DIRECTORY [--account NAME] [--pages N|all] [--cursor OPAQUE_CURSOR]\nNo WeChat login. Requires DATAXAPI_API_KEY. Default: one provider page; --pages all follows all visible pages. 60s between pages. No automatic retry.');return;}
  const map={'--id':'id','--output-dir':'outputDir','--account':'account','--pages':'pages','--cursor':'cursor'},o={};
  for(let i=0;i<args.length;i++){const k=map[args[i]];if(!k||o[k]!==undefined||!args[i+1]||args[i+1].startsWith('--'))throw Error('Invalid discovery arguments');o[k]=args[++i];}
  const state=await discover(o);console.log(JSON.stringify({status:state.status,pages:state.pages_fetched,output:path.resolve(o.outputDir)}));if(state.status==='stopped')process.exitCode=1;
}
if(require.main===module)main(process.argv.slice(2)).catch(error=>{console.error(JSON.stringify({ok:false,message:error.message}));process.exitCode=1;});
module.exports={discover,ENDPOINT};
