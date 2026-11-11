#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path');
const {searchAccounts,providerKey,validId}=require('./accounts.cjs');
const {discover}=require('./discover.cjs');
const {runBatch}=require('./batch.cjs');
const {freeDiscover}=require('./free-discover.cjs');
const {parseDateWindow,applyDateWindow}=require('./date-window.cjs');
async function archive(options,runtime={}) {
  if(typeof options.name!=='string'||!options.name.trim()||options.name.length>200)throw Error('--name is required (up to 200 characters)');
  if(!options.outputDir)throw Error('--output-dir is required');
  if(options.id!==undefined&&!validId(options.id))throw Error('Invalid --id');
  if(options.searchPages!==undefined&&options.searchPages!=='all'&&(!Number.isSafeInteger(Number(options.searchPages))||Number(options.searchPages)<1))throw Error('--search-pages must be a positive integer or all');
  const trial=options.trial===undefined?undefined:Number(options.trial);
  if(trial!==undefined&&(!Number.isSafeInteger(trial)||trial<1))throw Error('--trial must be a positive integer');
  const provider=options.provider??'bydrug';
  if(!['bydrug','dataxapi'].includes(provider))throw Error('--provider must be bydrug or dataxapi');
  if(provider==='dataxapi')providerKey(runtime.provider);
  if(provider==='bydrug'&&options.id)throw Error('--id is for the explicit dataxapi provider; use --biz with the free provider');
  // 时间要求必须在建目录、发请求之前校验：非法区间属于预检失败，不留下半成品输出。
  const dateWindow=parseDateWindow(options);
  // 有窗口且给了 --trial 时过采样，避免窗口把样本吃光；不设绝对上限，由用户的 --trial 决定成本。
  const discoveryLimit=dateWindow&&trial!==undefined?trial*3:trial;
  const out=path.resolve(options.outputDir);fs.mkdirSync(path.dirname(out),{recursive:true});fs.mkdirSync(out);
  const state={schema_version:1,provider,requested_account:options.name.trim(),selection:trial===undefined?(dateWindow?'date_window':'all_available_history'):'trial',trial_limit:trial??null,date_window:dateWindow?{requested:dateWindow.requested,since:dateWindow.since,until:dateWindow.until,days:dateWindow.days,computed_at:dateWindow.computed_at,label:dateWindow.label}:null,date_filter:null,discovery_limit:discoveryLimit??null,discovery_limit_reason:dateWindow&&trial!==undefined?'oversampled 3x so the date window can still fill --trial':'none',started_at:new Date().toISOString(),status:'searching',stage:'search',complete_history_verified:false,account:null,counts:{discovered:0,completed:0,classified:0},error:null};
  let revision=0;
  const save=(name,value)=>{const tmp=path.join(out,'.archive-'+revision++);fs.writeFileSync(tmp,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});fs.renameSync(tmp,path.join(out,name));};
  const checkpoint=()=>save('archive.json',state);
  checkpoint();
  try{
    const results=provider==='bydrug'?{status:'public_author_index',matches:[{id:null,name:options.name.trim(),username:null}],pages:0,accounts:[]}:options.id?{status:'provided_id',matches:[{id:options.id,name:options.name.trim(),username:null}],pages:0,accounts:[]}:await searchAccounts(options.name,runtime.provider,p=>save('accounts.json',p),{pages:options.searchPages});
    save('accounts.json',results);
    if(results.status==='search_budget_reached'){state.status='search_budget_reached';state.error='Account search budget reached; inspect accounts.json or increase --search-pages';checkpoint();return state;}
    const matches=options.id?results.matches.filter(x=>x.id===options.id):results.matches;
    if(matches.length!==1){state.status=results.status==='not_found'?'account_not_found':'account_selection_required';state.error='No unique exact-name account; inspect accounts.json and use --id to disambiguate';checkpoint();return state;}
    const account=matches[0];state.account=account;state.account_resolution=provider==='bydrug'?'public_author_index; checked_against_original_biz_and_downloaded_account':options.id?'provided_id; checked_against_downloaded_articles':'unique_exact_name';state.status='discovering';state.stage='discovery';checkpoint();
    const history=provider==='bydrug'?await freeDiscover({name:account.name,limit:discoveryLimit,biz:options.biz,...(dateWindow?{since:dateWindow.since}:{}),outputDir:path.join(out,'discovery')},runtime.public):await discover({id:account.id,account:account.name,pages:'all',articleLimit:discoveryLimit,outputDir:path.join(out,'discovery')},runtime.provider);
    const linkFile=path.join(out,'discovery','discovered-links.json'),discovered=JSON.parse(fs.readFileSync(linkFile,'utf8')),links=discovered.links;
    state.discovery_status=history.status;state.next_history_cursor=history.next_cursor??null;state.public_reported_total=history.reported_total??null;state.original_biz=history.expected_biz??null;
    if(!links.length){state.status=history.status==='provider_exhausted'?'no_articles_returned':'stopped';state.error=history.error;checkpoint();return state;}
    // 有日期要求时按「发现结果 → 窗口过滤 → 下载」推进，未命中窗口的原文一律不请求下载。
    const scoped=applyDateWindow(links,dateWindow);state.date_filter=scoped.filter;state.counts.discovered=scoped.links.length;
    if(!scoped.links.length){state.status='no_articles_in_window';state.error='No discovered article falls inside '+(dateWindow?.label??'the requested window')+'; inspect discovery/discovered-links.json, widen --days/--since, or use --provider dataxapi for deeper history';checkpoint();return state;}
    let batchLinks=linkFile;
    if(dateWindow){batchLinks=path.join(out,'in-window-links.json');save('in-window-links.json',{ordering:discovered.ordering,window:scoped.filter,links:scoped.links});}
    state.status='downloading';state.stage='download';checkpoint();
    const batch=await runBatch({links:batchLinks,outputDir:path.join(out,'articles'),account:account.name,limit:trial},runtime.batch);
    state.download_status=batch.status;state.counts.completed=batch.counts.completed;state.stop_reason=batch.stop_reason;
    if(batch.counts.completed){
      state.status='classifying';state.stage='classification';checkpoint();
      const {runClassification}=require('./classify.cjs');
      const classified=runClassification({batchDir:path.join(out,'articles'),outputDir:path.join(out,'classified'),...(options.rules?{rules:options.rules}:{})});
      state.classification=classified.counts;state.counts.classified=classified.counts.classified??classified.counts.completed??classified.counts.total??0;
    }
    state.stage='finished';
    state.trial_shortfall=trial===undefined?null:Math.max(0,trial-batch.counts.completed);
    state.status=batch.status!=='completed'||history.status==='stopped'?'stopped':history.status==='public_access_limit'?'partial_history_archived':trial===undefined?'available_history_archived':state.trial_shortfall?'trial_shortfall':'trial_archived';
    state.error=history.error??null;state.finished_at=new Date().toISOString();checkpoint();return state;
  }catch(error){state.status='stopped';state.error=error.message;state.finished_at=new Date().toISOString();checkpoint();return state;}
}
async function main(args){
  if(args.length===1&&args[0]==='--help'){console.log('archive --name ACCOUNT_NAME --output-dir NEW_DIRECTORY [--trial N] [--days N | --since YYYY-MM-DD [--until YYYY-MM-DD]] [--provider bydrug|dataxapi] [--biz VERIFIED_BIZ] [--rules RULES_JSON]\nTime requirement: --days N keeps the last N calendar days including today; --since/--until are inclusive, --until defaults to today. Articles are filtered by their verified publication date before any download.\nDefault: free public ByDrug author index; no key or WeChat login. Downloads original WeChat articles and classifies body. Coverage is limited to indexed accounts. DataXAPI is explicit opt-in: --provider dataxapi [--id ID] [--search-pages N|all], requires DATAXAPI_API_KEY.');return;}
  const map={'--name':'name','--output-dir':'outputDir','--trial':'trial','--id':'id','--rules':'rules','--search-pages':'searchPages','--provider':'provider','--biz':'biz','--since':'since','--until':'until','--days':'days'},o={};
  for(let i=0;i<args.length;i++){const k=map[args[i]];if(!k||o[k]!==undefined||!args[i+1]||args[i+1].startsWith('--'))throw Error('Invalid archive arguments');o[k]=args[++i];}
  const state=await archive(o);console.log(JSON.stringify({status:state.status,counts:state.counts,...(state.date_window?{date_window:state.date_window.label,date_filter:state.date_filter?.counts}:{}),output:path.resolve(o.outputDir)}));if(!['available_history_archived','trial_archived','no_articles_returned'].includes(state.status))process.exitCode=1;
}
if(require.main===module)main(process.argv.slice(2)).catch(error=>{console.error(JSON.stringify({ok:false,message:error.message}));process.exitCode=1;});
module.exports={archive};
