#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path');
const {parsePublicIndex,parsePublicDetail}=require('./wechat-to-md.cjs');
const {isoDate:assertIsoDate}=require('./date-window.cjs');
const BASE='https://bydrug.pharmcube.com';
async function freeDiscover(options,runtime={}){
  if(typeof options.name!=='string'||!options.name.trim()||options.name.length>200)throw Error('A nonempty account name is required');
  if(!options.outputDir)throw Error('--output-dir is required');
  const limit=options.limit===undefined?Infinity:Number(options.limit);if(limit!==Infinity&&(!Number.isSafeInteger(limit)||limit<1))throw Error('--limit must be positive');
  // --since 只作为提前停止的提示：索引为新到旧排列，整页都早于窗口起点时不再翻页。
  const since=options.since===undefined||options.since===null||options.since===''?null:assertIsoDate(options.since,'--since');
  const out=path.resolve(options.outputDir);fs.mkdirSync(path.dirname(out),{recursive:true});fs.mkdirSync(out);
  const links=[],seen=new Set();const state={provider:'bydrug_public',account:options.name.trim(),status:'running',started_at:new Date().toISOString(),history_since:since,index_pages:0,details_fetched:0,reported_total:null,expected_biz:options.biz??null,complete_history_verified:false,coverage:'public_index_only',public_page_limit:3,error:null};
  let revision=0,requests=0;
  const write=(name,value)=>{const tmp=path.join(out,'.public-'+revision++);fs.writeFileSync(tmp,JSON.stringify(value,null,2)+'\n',{flag:'wx'});fs.renameSync(tmp,path.join(out,name));};
  const checkpoint=()=>{write('discovery.json',state);write('discovered-links.json',{ordering:'public author index visible newest-first order; complete WeChat history not proven',account:state.account,coverage:state.coverage,links});};
  async function get(url){
    const u=new URL(url);if(u.origin!==BASE||u.username||u.password)throw Error('Public request outside selected provider refused');
    if(requests++)await(runtime.sleep??(ms=>new Promise(r=>setTimeout(r,ms))))(2000);
    let response;try{response=await(runtime.fetch??fetch)(u,{headers:{Accept:'text/html'},redirect:'error',signal:AbortSignal.timeout(30000)});}catch{throw Error('Public index network error; progress retained');}
    if(!response.ok)throw Error('Public index HTTP '+response.status);
    const html=await response.text();if(/<title[^>]*>[^<]*(?:验证|captcha)/i.test(html))throw Error('Public index requires verification');return html;
  }
  checkpoint();
  try{
    let page=1;
    while(links.length<limit){
      const indexUrl=BASE+'/news/summary/source/'+encodeURIComponent(state.account)+(page===1?'':'?page='+page);
      const index=parsePublicIndex(await get(indexUrl),state.account);
      if(index.page!==page)throw Error('Public index did not advance to requested page');
      state.index_pages++;state.reported_total=Math.max(state.reported_total??0,index.total);checkpoint();
      let added=0;const pageDays=[];
      for(const row of index.links){
        if(links.length>=limit)break;
        const detail=parsePublicDetail(await get(row.detail_url),state.account);state.details_fetched++;
        if(detail.title!==row.title)throw Error('Public index and detail titles differ');
        if(state.expected_biz&&detail.biz!==state.expected_biz)throw Error('Original WeChat account identifier mismatch');
        state.expected_biz??=detail.biz;
        const identity=detail.biz+':'+new URL(detail.url).searchParams.get('mid')+':'+new URL(detail.url).searchParams.get('idx');
        if(seen.has(identity))continue;seen.add(identity);added++;
        if(typeof detail.published_at==='string'&&/^\d{4}-\d{2}-\d{2}/.test(detail.published_at))pageDays.push(detail.published_at.slice(0,10));
        links.push({url:detail.url,title:detail.title,...(detail.published_at?{published_at:detail.published_at}:{}),discovery:{provider:'bydrug_public',index_url:indexUrl,detail_url:row.detail_url,rank:links.length+1,account:detail.account,biz:detail.biz,retrieved_at:new Date().toISOString()}});checkpoint();
      }
      if(links.length>=limit){state.status=links.length<state.reported_total?'trial_limit_reached':'provider_exhausted';break;}
      if(links.length>=state.reported_total||!index.links.length){state.status='provider_exhausted';break;}
      if(!added)throw Error('Public pagination repeated articles');
      if(since&&pageDays.length===index.links.length&&pageDays.every(day=>day<since)){state.status='window_reached';state.stopped_before=since;break;}
      if(page>=state.public_page_limit){state.status='public_access_limit';break;}page++;
    }
    state.finished_at=new Date().toISOString();checkpoint();return state;
  }catch(error){state.status='stopped';state.error=error.message;state.finished_at=new Date().toISOString();checkpoint();return state;}
}
async function main(args){
  if(args.length===1&&args[0]==='--help'){console.log('free-discover --name ACCOUNT_NAME --output-dir NEW_DIRECTORY [--limit N] [--since YYYY-MM-DD] [--biz VERIFIED_BIZ]\nFree public author index; no key or WeChat login. Only listed coverage is available. Original URLs are verified before batch downloads. --since stops pagination once a whole page predates the window start.');return;}
  const map={'--name':'name','--output-dir':'outputDir','--limit':'limit','--biz':'biz','--since':'since'},o={};
  for(let i=0;i<args.length;i++){const k=map[args[i]];if(!k||o[k]!==undefined||!args[i+1]||args[i+1].startsWith('--'))throw Error('Invalid free-discovery arguments');o[k]=args[++i];}
  const state=await freeDiscover(o);console.log(JSON.stringify({status:state.status,details:state.details_fetched,output:path.resolve(o.outputDir)}));if(state.status==='stopped')process.exitCode=1;
}
if(require.main===module)main(process.argv.slice(2)).catch(error=>{console.error(JSON.stringify({ok:false,message:error.message}));process.exitCode=1;});
module.exports={freeDiscover};
