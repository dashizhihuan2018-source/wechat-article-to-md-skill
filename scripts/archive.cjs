#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path');
const {searchAccounts,providerKey,validId}=require('./accounts.cjs');
const {discover}=require('./discover.cjs');
const {runBatch}=require('./batch.cjs');
async function archive(options,runtime={}) {
  if(typeof options.name!=='string'||!options.name.trim()||options.name.length>200)throw Error('--name is required (up to 200 characters)');
  if(!options.outputDir)throw Error('--output-dir is required');
  if(options.id!==undefined&&!validId(options.id))throw Error('Invalid --id');
  if(options.searchPages!==undefined&&options.searchPages!=='all'&&(!Number.isSafeInteger(Number(options.searchPages))||Number(options.searchPages)<1))throw Error('--search-pages must be a positive integer or all');
  const trial=options.trial===undefined?undefined:Number(options.trial);
  if(trial!==undefined&&(!Number.isSafeInteger(trial)||trial<1))throw Error('--trial must be a positive integer');
  providerKey(runtime.provider);
  const out=path.resolve(options.outputDir);fs.mkdirSync(path.dirname(out),{recursive:true});fs.mkdirSync(out);
  const state={schema_version:1,requested_account:options.name.trim(),selection:trial===undefined?'all_available_history':'trial',trial_limit:trial??null,started_at:new Date().toISOString(),status:'searching',stage:'search',complete_history_verified:false,account:null,counts:{discovered:0,completed:0,classified:0},error:null};
  let revision=0;
  const save=(name,value)=>{const tmp=path.join(out,'.archive-'+revision++);fs.writeFileSync(tmp,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});fs.renameSync(tmp,path.join(out,name));};
  const checkpoint=()=>save('archive.json',state);
  checkpoint();
  try{
    const results=options.id?{status:'provided_id',matches:[{id:options.id,name:options.name.trim(),username:null}],pages:0,accounts:[]}:await searchAccounts(options.name,runtime.provider,p=>save('accounts.json',p),{pages:options.searchPages});
    save('accounts.json',results);
    if(results.status==='search_budget_reached'){state.status='search_budget_reached';state.error='Account search budget reached; inspect accounts.json or increase --search-pages';checkpoint();return state;}
    const matches=options.id?results.matches.filter(x=>x.id===options.id):results.matches;
    if(matches.length!==1){state.status=results.status==='not_found'?'account_not_found':'account_selection_required';state.error='No unique exact-name account; inspect accounts.json and use --id to disambiguate';checkpoint();return state;}
    const account=matches[0];state.account=account;state.account_resolution=options.id?'provided_id; checked_against_downloaded_articles':'unique_exact_name';state.status='discovering';state.stage='discovery';checkpoint();
    const history=await discover({id:account.id,account:account.name,pages:'all',articleLimit:trial,outputDir:path.join(out,'discovery')},runtime.provider);
    const linkFile=path.join(out,'discovery','discovered-links.json'),links=JSON.parse(fs.readFileSync(linkFile,'utf8')).links;
    state.discovery_status=history.status;state.counts.discovered=links.length;state.next_history_cursor=history.next_cursor;
    if(!links.length){state.status=history.status==='provider_exhausted'?'no_articles_returned':'stopped';state.error=history.error;checkpoint();return state;}
    state.status='downloading';state.stage='download';checkpoint();
    const batch=await runBatch({links:linkFile,outputDir:path.join(out,'articles'),account:account.name,limit:trial},runtime.batch);
    state.download_status=batch.status;state.counts.completed=batch.counts.completed;state.stop_reason=batch.stop_reason;
    if(batch.counts.completed){
      state.status='classifying';state.stage='classification';checkpoint();
      const {runClassification}=require('./classify.cjs');
      const classified=runClassification({batchDir:path.join(out,'articles'),outputDir:path.join(out,'classified'),...(options.rules?{rules:options.rules}:{})});
      state.classification=classified.counts;state.counts.classified=classified.counts.classified??classified.counts.completed??classified.counts.total??0;
    }
    state.stage='finished';
    state.trial_shortfall=trial===undefined?null:Math.max(0,trial-batch.counts.completed);
    state.status=batch.status!=='completed'||history.status==='stopped'?'stopped':trial===undefined?'available_history_archived':state.trial_shortfall?'trial_shortfall':'trial_archived';
    state.error=history.error??null;state.finished_at=new Date().toISOString();checkpoint();return state;
  }catch(error){state.status='stopped';state.error=error.message;state.finished_at=new Date().toISOString();checkpoint();return state;}
}
async function main(args){
  if(args.length===1&&args[0]==='--help'){console.log('archive --name ACCOUNT_NAME --output-dir NEW_DIRECTORY [--trial N] [--id VERIFIED_ACCOUNT_ID] [--search-pages N|all] [--rules RULES_JSON]\nSearch exact account name (default search budget: 3 pages), paginate all provider-visible history, download Markdown and classify by body. --id skips search and checks account in downloaded articles. Requires DATAXAPI_API_KEY. --trial only limits this run.');return;}
  const map={'--name':'name','--output-dir':'outputDir','--trial':'trial','--id':'id','--rules':'rules','--search-pages':'searchPages'},o={};
  for(let i=0;i<args.length;i++){const k=map[args[i]];if(!k||o[k]!==undefined||!args[i+1]||args[i+1].startsWith('--'))throw Error('Invalid archive arguments');o[k]=args[++i];}
  const state=await archive(o);console.log(JSON.stringify({status:state.status,counts:state.counts,output:path.resolve(o.outputDir)}));if(!['available_history_archived','trial_archived','no_articles_returned'].includes(state.status))process.exitCode=1;
}
if(require.main===module)main(process.argv.slice(2)).catch(error=>{console.error(JSON.stringify({ok:false,message:error.message}));process.exitCode=1;});
module.exports={archive};
