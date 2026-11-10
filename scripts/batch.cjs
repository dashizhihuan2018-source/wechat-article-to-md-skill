#!/usr/bin/env node
'use strict';
// Serial orchestration only. Parsing and HTTP behavior stay in the existing bundle.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {performance}=require('node:perf_hooks');
const {spawnSync}=require('node:child_process');

const MIN_INTERVAL_MS=60000;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function articleUrl(value) {
  if(typeof value!=='string')throw Error('Every link must contain a URL string');
  const u=new URL(value.trim().replace(/&amp;/g,'&'));
  if(u.protocol!=='https:'||u.hostname!=='mp.weixin.qq.com'||u.port||u.username||u.password||!/^\/s(?:\/|$)/.test(u.pathname))throw Error('Only HTTPS mp.weixin.qq.com /s article URLs are allowed');
  u.hash='';return u.toString();
}
function readLinks(filename) {
  const absolute=path.resolve(filename);
  const text=fs.readFileSync(absolute,'utf8').replace(/^\uFEFF/,'').trim();
  if(!text)throw Error('Links file is empty');
  let parsed,ordering;
  if(text.startsWith('[')||text.startsWith('{')) {
    parsed=JSON.parse(text);
    if(!Array.isArray(parsed)){ordering=parsed.ordering;parsed=parsed.links;}
  } else parsed=text.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  if(!Array.isArray(parsed)||!parsed.length)throw Error('Provide a nonempty JSON array, {links:[...]} or one URL per line');
  const seen=new Set();
  const links=parsed.map((entry,i)=>{
    const original=typeof entry==='string'?{url:entry}:entry;
    if(!original||typeof original!=='object'||Array.isArray(original))throw Error('Invalid link at index '+i);
    const url=articleUrl(original.url);
    if(seen.has(url))throw Error('Duplicate article URL at index '+i);seen.add(url);
    for(const k of ['title','published_at','reuse_markdown'])if(original[k]!==undefined&&typeof original[k]!=='string')throw Error(k+' must be a string');
    const result={url};
    for(const k of ['title','published_at','discovery','reuse_markdown'])if(original[k]!==undefined)result[k]=original[k];
    return result;
  });
  return {links,ordering:ordering??'provided_order; operator must verify ordering',directory:path.dirname(absolute)};
}
function readArticle(filename) {
  const text=fs.readFileSync(filename,'utf8');
  const match=text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if(!match||!match[2].trim())throw Error('Markdown has no supported frontmatter or body');
  const fields={};
  for(const line of match[1].split(/\r?\n/)){
    const m=line.match(/^([a-z_]+):\s*(.*)$/);if(!m)continue;
    try{fields[m[1]]=JSON.parse(m[2]);}catch{throw Error('Expected JSON-valued converter frontmatter: '+m[1]);}
  }
  if(fields.parse_status!=='ok')throw Error('Markdown parse_status is not ok');
  return {text,fields,bytes:Buffer.byteLength(text),sha256:crypto.createHash('sha256').update(text).digest('hex')};
}
function summarize(items,inputCount) {
  const converted=items.filter(x=>x.status==='converted').length,reused=items.filter(x=>x.status==='reused').length;
  return {input:inputCount,selected:items.length,unselected:inputCount-items.length,attempted:items.filter(x=>x.status!=='pending').length,converter_invocations:items.filter(x=>x.converter_invoked).length,converted,reused,completed:converted+reused,failed:items.filter(x=>!['pending','in_progress','converted','reused'].includes(x.status)).length,pending:items.filter(x=>x.status==='pending').length};
}
async function runBatch(options,runtime={}) {
  const limit=options.limit===undefined?null:Number(options.limit);
  const interval=options.intervalSeconds===undefined?60:Number(options.intervalSeconds);
  if(limit!==null&&(!Number.isSafeInteger(limit)||limit<1))throw Error('--limit must be a positive integer when provided');
  if(!Number.isFinite(interval)||interval<60||interval>86400)throw Error('--interval must be between 60 and 86400 seconds');
  if(!options.links||!options.outputDir)throw Error('--links and --output-dir are required');
  if(options.account!==undefined&&(typeof options.account!=='string'||!options.account.trim()))throw Error('--account must be a nonempty expected account name');
  const expectedAccount=options.account?.trim()??null;
  const source=readLinks(options.links),selected=limit===null?source.links:source.links.slice(0,limit),out=path.resolve(options.outputDir);
  const now=runtime.now??Date.now,sleep=runtime.sleep??delay;
  const elapsed=runtime.elapsed??runtime.now??(()=>performance.now());
  // Test injection is programmatic only. The public CLI cannot choose another converter or clock.
  const converter=runtime.converterPath??path.join(__dirname,'wechat-to-md.cjs');
  const iso=()=>new Date(now()).toISOString();
  fs.mkdirSync(path.dirname(out),{recursive:true});
  fs.mkdirSync(out); // Atomic refusal of existing folders, including symlinks.
  const index={schema_version:1,status:'running',created_at:iso(),finished_at:null,expected_account:expectedAccount,selection:limit===null?'all':'limited',limit,interval_seconds:interval,ordering:source.ordering,next_index:0,stop_reason:null,counts:null,items:selected.map((x,i)=>({index:i,number:String(i+1).padStart(3,'0'),url:x.url,supplied_title:x.title??null,supplied_published_at:x.published_at??null,discovery:x.discovery??null,status:'pending',title:null,account:null,published_at:null,retrieved_at:null,source_of_date:{published_at:'unavailable',supplied_published_at:x.published_at?'links_file_unverified':'unavailable',retrieved_at:'unavailable'}})),resume:{file:'remaining-links.json',automatic_retry:false,note:'After normal access is restored, review remaining links and use a new output directory. Never automatically retry a stopped batch.'}};
  let sequence=0,lastRequestCompletedAt=null;
  function atomic(name,value) {
    const temp=path.join(out,`.${name}.${process.pid}.${sequence++}.tmp`);
    fs.writeFileSync(temp,JSON.stringify(value,null,2)+'\n',{flag:'wx'});fs.renameSync(temp,path.join(out,name));
  }
  function checkpoint() {
    index.counts=summarize(index.items,source.links.length);
    index.next_index=index.items.findIndex(x=>!['converted','reused'].includes(x.status));
    if(index.next_index<0)index.next_index=selected.length;
    atomic('batch-index.json',index);
    atomic('manifest.json',{schema_version:1,status:index.status,created_at:index.created_at,finished_at:index.finished_at,counts:index.counts,index:'batch-index.json',remaining:'remaining-links.json',images_offline:false});
    atomic('remaining-links.json',{ordering:source.ordering,resumes_from_index:index.next_index,links:source.links.slice(index.next_index).map(entry=>entry.reuse_markdown?{...entry,reuse_markdown:path.resolve(source.directory,entry.reuse_markdown)}:entry)});
  }
  function stop(item,status,reason,message) {
    item.status=status;item.reason=reason;item.message=message;item.finished_at=iso();index.status='stopped';index.stop_reason=reason;
  }
  checkpoint();
  for(let i=0;i<selected.length;i++) {
    const input=selected[i],item=index.items[i],directory=path.join(out,item.number),markdown=path.join(directory,'article.md');
    try {
      item.status='in_progress';item.started_at=iso();checkpoint();fs.mkdirSync(directory);
      let article;
      if(input.reuse_markdown) {
        try {
          const seed=path.resolve(source.directory,input.reuse_markdown),status=JSON.parse(fs.readFileSync(seed+'.status.json','utf8'));
          article=readArticle(seed);
          if(!status.ok||status.status!=='converted'||!['http','local_html'].includes(status.input_mode)||articleUrl(article.fields.source_url)!==input.url||(status.source_url&&articleUrl(status.source_url)!==input.url))throw Error('Existing Markdown/status does not verify the supplied source URL');
          fs.writeFileSync(markdown,article.text,{flag:'wx'});
          fs.writeFileSync(markdown+'.status.json',JSON.stringify({ok:true,status:'reused',source_url:input.url,input_mode:'existing_markdown',images_offline:false,bytes:article.bytes,sha256:article.sha256},null,2)+'\n',{flag:'wx'});
          item.retrieved_at=typeof article.fields.saved_at==='string'&&!Number.isNaN(Date.parse(article.fields.saved_at))?article.fields.saved_at:null;
          item.source_of_date.retrieved_at=item.retrieved_at?'existing_markdown_saved_at':'unavailable';
        } catch(error) {stop(item,'failed','invalid_existing_markdown',error.message);checkpoint();break;}
      } else {
        if(lastRequestCompletedAt!==null){const wait=Math.max(0,Math.max(MIN_INTERVAL_MS,interval*1000)-(elapsed()-lastRequestCompletedAt));if(wait)await sleep(wait);}
        item.request_started_at=iso();item.converter_invoked=true;checkpoint();
        const args=[converter,'--url',input.url,'--output',markdown];if(input.title)args.push('--title',input.title);
        const child=spawnSync(process.execPath,args,{encoding:'utf8',shell:false,timeout:180000,maxBuffer:4*1024*1024});
        lastRequestCompletedAt=elapsed();item.request_completed_at=iso();item.retrieved_at=item.request_completed_at;item.source_of_date.retrieved_at='actual_converter_completion';
        let result;
        try{result=JSON.parse(fs.readFileSync(markdown+'.status.json','utf8'));}catch{result={ok:false,status:'failed',reason:'missing_converter_status',message:'Converter did not produce a valid status file'};}
        if(child.error||child.status!==0||!result.ok||!fs.existsSync(markdown)){
          stop(item,result.status==='blocked'?'blocked':'failed',child.error?'converter_process_error':result.reason??'conversion_failed',child.error?.message??result.message??'Conversion failed');checkpoint();break;
        }
        article=readArticle(markdown);
        if(articleUrl(article.fields.source_url)!==input.url)throw Error('Converted article source URL differs from supplied URL');
      }
      item.markdown=item.number+'/article.md';item.title=article.fields.title??null;item.account=article.fields.account??null;item.published_at=article.fields.published_at??null;item.bytes=article.bytes;item.sha256=article.sha256;item.images_offline=false;
      item.source_of_date.published_at=item.published_at!==null?'article_frontmatter':'unavailable';
      if(expectedAccount&&item.account!==expectedAccount){stop(item,'account_mismatch','account_mismatch','The extracted account is missing or differs from --account; existing files were retained');checkpoint();break;}
      item.status=input.reuse_markdown?'reused':'converted';item.finished_at=iso();checkpoint();
    } catch(error) {stop(item,'failed','batch_item_error',error.message);checkpoint();break;}
  }
  if(index.status==='running')index.status='completed';
  index.finished_at=iso();checkpoint();return index;
}
async function main(argv) {
  if(argv.length===1&&argv[0]==='--help'){
    console.log('node scripts/batch.cjs --links verified-links.json --output-dir NEW_DIRECTORY [--limit POSITIVE_INTEGER] [--account EXPECTED_ACCOUNT] [--interval SECONDS>=60]\nAll verified links are processed by default. --limit selects a shorter trial run. Stops at the first blocked, failed or account-mismatched item.');return;
  }
  const map={'--links':'links','--output-dir':'outputDir','--limit':'limit','--account':'account','--interval':'intervalSeconds'},options={};
  for(let i=0;i<argv.length;i++){
    const name=map[argv[i]];if(!name||i+1>=argv.length||argv[i+1].startsWith('--')||options[name]!==undefined)throw Error('Unknown, duplicate or incomplete argument: '+argv[i]);options[name]=argv[++i];
  }
  const index=await runBatch(options);console.log(JSON.stringify({ok:index.status==='completed',status:index.status,counts:index.counts,next_index:index.next_index,index:path.join(path.resolve(options.outputDir),'batch-index.json')}));
  if(index.status!=='completed')process.exitCode=index.items.some(x=>x.status==='blocked'||x.status==='account_mismatch')?2:1;
}
if(require.main===module)main(process.argv.slice(2)).catch(error=>{console.error(JSON.stringify({ok:false,status:'failed',message:error.message}));process.exitCode=1;});
module.exports={runBatch,readLinks,articleUrl,MIN_INTERVAL_MS};
