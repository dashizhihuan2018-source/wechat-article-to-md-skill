#!/usr/bin/env node
'use strict';
// 「手机复制链接 → 一键转」入口：把粘贴来的杂乱文本清洗成已核验清单，再串行下载并归类。
// 设计约束：只接受 mp.weixin.qq.com 的 /s 系文章地址；不猜补标题、不猜补日期、不保留会话凭证参数。
const fs=require('node:fs'),path=require('node:path');
const {articleUrl,runBatch}=require('./batch.cjs');
const {parseDateWindow}=require('./date-window.cjs');

// 微信分享文本里常混着标题、换行、全角标点，故先按协议头抓出候选，再由 normalize 严格判定。
const URL_RE=/https?:\/\/mp\.weixin\.qq\.com\/[^\s"'<>()（）\[\]{}，。、；;、]+/gi;
// 只保留定位文章所必需的参数；key / pass_ticket / uin 等会话凭证一律丢弃，避免随归档落盘。
const KEEP=new Set(['__biz','mid','idx','sn','chksm']);
const MAX_SOURCE_BYTES=64*1024*1024;

function normalize(raw){
  const text=String(raw).trim().replace(/&amp;/g,'&').replace(/^http:/i,'https:');
  let parsed;
  try{parsed=new URL(text);}catch{return null;}
  if(parsed.hostname!=='mp.weixin.qq.com'||parsed.port||parsed.username||parsed.password)return null;
  if(!/^\/s(?:\/|$)/.test(parsed.pathname))return null;
  const kept=[],stripped=[];
  for(const [key,value] of parsed.searchParams){
    if(KEEP.has(key))kept.push([key,value]);
    else stripped.push(key);
  }
  const query=kept.map(([k,v])=>k+'='+encodeURIComponent(v)).join('&');
  let url='https://mp.weixin.qq.com'+parsed.pathname+(query?'?'+query:'');
  try{url=articleUrl(url);}catch{return null;}          // 与批次下载器共用同一套校验
  const params=new URL(url).searchParams;
  const mid=params.get('mid'),idx=params.get('idx');
  return {url,identity:mid&&idx?'mid:'+mid+':idx:'+idx:url,stripped:[...new Set(stripped)].sort()};
}
function readSource(source){
  if(source==='-'){
    if(process.stdin.isTTY)throw Error('--from - expects piped input, for example: pbpaste | sh scripts/run.sh --import --from - --output-dir ./out');
    return fs.readFileSync(0,'utf8');
  }
  const absolute=path.resolve(source);
  const stat=fs.statSync(absolute);
  if(!stat.isFile())throw Error('--from must be a regular text file, or - to read stdin');
  if(stat.size>MAX_SOURCE_BYTES)throw Error('--from file is larger than 64 MiB; split it into several runs');
  return fs.readFileSync(absolute,'utf8');
}
function collect(text){
  const accepted=[],duplicates=[],rejected=[],seen=new Map(),stripped=new Set();
  const lines=text.replace(/^\uFEFF/,'').split(/\r?\n/);
  // 微信分享面板的标准格式是「标题换行链接」，所以链接上一行的纯文字视为标题候选；
  // 但纯日期、纯序号行不当标题，避免把批次标注吃成标题。
  const DATE_ONLY=/^\s*\d{4}[-/年]\d{1,2}([-/月]\d{1,2})?[日]?([ T]\d{1,2}:\d{2})?\s*$/;
  const TITLE_OK=t=>t.length>1&&t.length<=200&&!DATE_ONLY.test(t)&&!/^\d{4}[-/年]/.test(t)&&!/^\d+[.、)）]?$/.test(t);
  let pendingTitle=null,pendingTitleLine=null;
  // 被当成下一行标题用掉的行不算「未采纳」，否则报告会把每个标题行都列成无效行。
  const usedTitleLines=new Set();
  for(let i=0;i<lines.length;i++){
    const line=lines[i];
    const urls=[...line.matchAll(URL_RE)].map(m=>m[0]);
    if(!urls.length){
      const plain=line.trim();
      if(plain)rejected.push({line:i+1,text:plain.slice(0,160),reason:/https?:\/\//i.test(plain)?'link is not an mp.weixin.qq.com /s article':'no WeChat article URL on this line'});
      // 空行意味着上一篇文章结束，候选标题随之作废，避免串到下一篇。
      pendingTitle=plain&&TITLE_OK(plain)&&!/https?:\/\//i.test(plain)?plain:null;
      pendingTitleLine=pendingTitle?i+1:null;
      continue;
    }
    // 同行的链接外文字优先；没有则回退到上一行标题，两者都不猜归属到多个链接。
    const inline=line.replace(URL_RE,' ').replace(/[|·:：\-—\s]+/g,' ').trim();
    const rest=inline||(pendingTitle&&urls.length===1?pendingTitle:'');
    if(!inline&&rest&&pendingTitleLine)usedTitleLines.add(pendingTitleLine);
    for(const raw of urls){
      const link=normalize(raw);
      if(!link){rejected.push({line:i+1,text:raw.slice(0,160),reason:'not an https mp.weixin.qq.com /s article URL'});continue;}
      link.stripped.forEach(k=>stripped.add(k));
      if(seen.has(link.identity)){
        duplicates.push({line:i+1,url:link.url,first_seen_at_line:seen.get(link.identity)});
        continue;
      }
      seen.set(link.identity,i+1);
      const entry={url:link.url};
      if(urls.length===1&&rest&&rest.length<=200)entry.title=rest;
      entry.discovered={method:'manual_import',line:i+1};
      accepted.push(entry);
    }
  }
  return {accepted,duplicates,rejected:rejected.filter(x=>!usedTitleLines.has(x.line)),stripped:[...stripped].sort()};
}
function report(state,out){
  const lines=[
    '# 链接导入报告','',
    `- 来源：${state.source.label}`,
    `- 导入时间：${state.imported_at}`,
    `- 读入行数：${state.counts.lines}；有效链接：${state.counts.accepted}；重复跳过：${state.counts.duplicates}；无效行：${state.counts.rejected}`,
  ];
  if(state.stripped_params.length)lines.push(`- 已丢弃的跟踪/会话参数：\`${state.stripped_params.join('` `')}\``);
  lines.push('','## 将按此顺序处理','');
  state.links.forEach((x,i)=>lines.push(`${String(i+1).padStart(3,'0')}. ${x.title?'**'+x.title+'** — ':''}${x.url}`));
  if(state.duplicates.length){lines.push('','## 重复链接（已跳过）','');state.duplicates.forEach(d=>lines.push(`- 第 ${d.line} 行：${d.url}（首次出现于第 ${d.first_seen_at_line} 行）`));}
  if(state.rejected.length){lines.push('','## 未采纳的行','');state.rejected.forEach(r=>lines.push(`- 第 ${r.line} 行：${r.reason} — \`${r.text}\``));}
  fs.writeFileSync(path.join(out,'import-report.md'),lines.join('\n')+'\n');
}
async function importLinks(options,runtime={}){
  if(!options.from)throw Error('--from is required (a text file path, or - for stdin)');
  if(!options.outputDir)throw Error('--output-dir is required');
  const dateWindow=parseDateWindow(options);
  const limit=options.limit===undefined?undefined:Number(options.limit);
  if(limit!==undefined&&(!Number.isSafeInteger(limit)||limit<1))throw Error('--limit must be a positive integer');
  const interval=options.intervalSeconds===undefined?undefined:Number(options.intervalSeconds);
  const account=options.account===undefined?undefined:String(options.account);
  const text=readSource(options.from);
  const collected=collect(text);
  if(!collected.accepted.length)throw Error('No valid mp.weixin.qq.com article URL found; nothing was written');
  const out=path.resolve(options.outputDir);fs.mkdirSync(path.dirname(out),{recursive:true});fs.mkdirSync(out);
  const importedAt=new Date().toISOString();
  const state={
    schema_version:1,status:options.listOnly?'list_ready':'downloading',stage:options.listOnly?'list':'download',
    imported_at:importedAt,date_window:dateWindow?{requested:dateWindow.requested,since:dateWindow.since,until:dateWindow.until,days:dateWindow.days,computed_at:dateWindow.computed_at,label:dateWindow.label}:null,
    source:{method:'manual_import',label:options.from==='-'?'stdin':path.resolve(options.from)},
    counts:{lines:text.replace(/^\uFEFF/,'').split(/\r?\n/).length,accepted:collected.accepted.length,duplicates:collected.duplicates.length,rejected:collected.rejected.length,completed:0,classified:0},
    stripped_params:collected.stripped,duplicates:collected.duplicates,rejected:collected.rejected,links:collected.accepted,error:null,
  };
  const save=(name,value)=>fs.writeFileSync(path.join(out,name),JSON.stringify(value,null,2)+'\n');
  save('links.json',{ordering:'manual import; paste order is processing order',imported_at:importedAt,source:state.source,date_window:state.date_window,links:state.links});
  save('import.json',state);
  report(state,out);
  if(options.listOnly){state.status='list_ready';state.finished_at=new Date().toISOString();save('import.json',state);return state;}
  try{
    const batch=await runBatch({links:path.join(out,'links.json'),outputDir:path.join(out,'articles'),...(limit===undefined?{}:{limit}),...(account===undefined?{}:{account}),...(interval===undefined?{}:{intervalSeconds:interval}),...(dateWindow?{since:dateWindow.since,until:dateWindow.until}:{})},runtime.batch);
    state.batch_status=batch.status;state.counts.completed=batch.counts.completed;state.counts.out_of_window=batch.counts.out_of_window;
    if(batch.counts.completed){
      state.status='classifying';state.stage='classification';save('import.json',state);
      const {runClassification}=require('./classify.cjs');
      const classified=runClassification({batchDir:path.join(out,'articles'),outputDir:path.join(out,'classified'),...(options.rules?{rules:options.rules}:{})});
      state.classification=classified.counts;state.counts.classified=classified.counts.classified??classified.counts.completed??classified.counts.total??0;
    }
    state.stage='finished';state.status=batch.status==='completed'?'imported_and_downloaded':'stopped';
    if(batch.status!=='completed')state.error=batch.stop_reason??'batch stopped';
  }catch(error){state.status='stopped';state.error=error.message;}
  state.finished_at=new Date().toISOString();save('import.json',state);return state;
}
async function main(args){
  if(args.length===1&&args[0]==='--help'){
    console.log('import --from TEXT_FILE_OR_- --output-dir NEW_DIRECTORY [--list-only] [--limit N] [--days N | --since YYYY-MM-DD [--until YYYY-MM-DD]] [--account EXPECTED_ACCOUNT] [--interval SECONDS>=60] [--rules RULES_JSON]\nPaste WeChat share text or one URL per line. Extraction keeps only https mp.weixin.qq.com /s URLs, drops tracking and session parameters (key, pass_ticket, uin...), removes duplicates and writes links.json plus import-report.md. By default it then downloads every link serially and classifies the body; --list-only stops after the list so you can review it first. No page or article cap is imposed by the tool.');return;
  }
  const map={'--from':'from','--output-dir':'outputDir','--limit':'limit','--days':'days','--since':'since','--until':'until','--account':'account','--interval':'intervalSeconds','--rules':'rules'},o={};
  for(let i=0;i<args.length;i++){
    if(args[i]==='--list-only'){o.listOnly=true;continue;}
    const key=map[args[i]];
    if(!key||o[key]!==undefined||!args[i+1]||args[i+1].startsWith('--'))throw Error('Invalid import arguments');
    o[key]=args[++i];
  }
  const state=await importLinks(o);
  console.log(JSON.stringify({status:state.status,counts:state.counts,...(state.date_window?{date_window:state.date_window.label}:{}),output:path.resolve(o.outputDir),report:path.join(path.resolve(o.outputDir),'import-report.md')}));
  if(!['list_ready','imported_and_downloaded'].includes(state.status))process.exitCode=1;
}
if(require.main===module)main(process.argv.slice(2)).catch(error=>{console.error(JSON.stringify({ok:false,status:'failed',message:error.message}));process.exitCode=1;});
module.exports={importLinks,collect,normalize,URL_RE};
