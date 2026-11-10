#!/usr/bin/env node
'use strict';
// Local, explainable keyword classification. Article text is data, never executable.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {articleUrl}=require('./batch.cjs');
const DEFAULT_RULES={
  categories:[
    {name:'医药健康',keywords:['医药','药物','药品','制药','临床','疗法','治疗','糖尿病','肿瘤','抗体','生物类似药','GLP-1','FDA','biotech']},
    {name:'旅行地理',keywords:['旅行','旅游','景区','景点','游记','旅程','自驾','徒步','民宿','酒店','风景','日出','山川','城市漫步']},
    {name:'科技数码',keywords:['人工智能','大模型','机器学习','算法','芯片','软件','开源','编程','机器人','量子','AI','GPU','API']},
    {name:'财经商业',keywords:['营收','净利润','财报','融资','上市','IPO','EPS','投资','股价','收购','资本','估值','市场份额']},
    {name:'教育文化',keywords:['教育','课程','学生','教学','读书','文学','博物馆','历史文化','非遗','艺术','文化遗产']},
    {name:'社会生活',keywords:['社区','公益','养老','就业','住房','消费','家庭','公共服务','交通','城市更新']}
  ],defaultCategory:'未分类'
};
function safeName(value){
  if(typeof value!=='string'||!value.trim()||value!==value.trim()||value.length>100||/[\x00-\x1f<>:"/\\|?*]/.test(value)||/[. ]$/.test(value)||value==='.'||value==='..'||/^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(value))throw Error('Category names must be safe portable directory names');
  return value.normalize('NFC');
}
function validateRules(value){
  if(!value||!Array.isArray(value.categories)||!value.categories.length)throw Error('Rules must contain a nonempty categories array');
  const names=new Set();
  const categories=value.categories.map(rule=>{
    if(!rule||typeof rule!=='object')throw Error('Invalid category rule');
    const name=safeName(rule.name),key=name.toLowerCase();if(names.has(key))throw Error('Duplicate category name');names.add(key);
    if(!Array.isArray(rule.keywords)||!rule.keywords.length||rule.keywords.some(x=>typeof x!=='string'||!x.trim()||x!==x.trim()||x.length>100))throw Error('Every category needs nonempty literal keywords');
    const keywords=[...new Set(rule.keywords.map(x=>x.toLocaleLowerCase()))];
    const minMatches=rule.minMatches??1;if(!Number.isSafeInteger(minMatches)||minMatches<1||minMatches>keywords.length)throw Error('minMatches must fit the category keyword count');
    return {name,keywords,minMatches};
  });
  const defaultCategory=safeName(value.defaultCategory??'未分类');if(names.has(defaultCategory.toLowerCase()))throw Error('Fallback category must differ from rule categories');
  return {categories,defaultCategory};
}
function readRules(filename){
  if(!filename)return validateRules(DEFAULT_RULES);
  if(fs.statSync(filename).size>1024*1024)throw Error('Rules file exceeds 1 MiB');
  return validateRules(JSON.parse(fs.readFileSync(filename,'utf8').replace(/^\uFEFF/,'')));
}
function parseMarkdown(text){
  const match=text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);if(!match)throw Error('Article has no converter frontmatter');
  const fields={};for(const line of match[1].split(/\r?\n/)){const m=line.match(/^([a-z_]+):\s*(.*)$/);if(m){try{fields[m[1]]=JSON.parse(m[2]);}catch{throw Error('Unsupported converter frontmatter');}}}
  if(fields.parse_status!=='ok')throw Error('Article parse_status must be ok');
  const lines=match[2].split(/\r?\n/),first=lines.findIndex(line=>line.trim());
  if(first>=0){const value=lines[first].trim().replace(/^#{1,6}\s+/,'').replace(/\\([\\`*_[\]<>|])/g,'$1');if(value===fields.title)lines[first]='';}
  let body=lines.join('\n');
  // URLs and metadata must not supply classification keywords.
  body=body.replace(/<!--[\s\S]*?-->/g,' ').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,' ').replace(/!\[[^\]]*\]\([^\n]*?\)/g,' ').replace(/\[([^\]]+)\]\([^\n]*?\)/g,'$1').replace(/https?:\/\/\S+/g,' ').replace(/<[^>]+>/g,' ').replace(/^[ \t]*\[[^\]]+\]:\s*\S+.*$/gm,' ').replace(/[*_`>#]/g,'').replace(/\s+/g,' ').trim();
  if(!body)throw Error('Article has no text beyond its title');
  return {fields,body};
}
function keywordIndex(text,keyword){
  const lower=text.toLocaleLowerCase();let from=0;
  while(from<=lower.length){const i=lower.indexOf(keyword,from);if(i<0)return -1;
    const latin=/^[a-z0-9][a-z0-9 +.-]*$/i.test(keyword);
    if(!latin||(!/[a-z0-9_]/i.test(lower[i-1]??'')&&!/[a-z0-9_]/i.test(lower[i+keyword.length]??'')))return i;
    from=i+1;
  }return -1;
}
function classifyBody(body,rules){
  const matches=[];
  for(const rule of rules.categories){const evidence=[];
    for(const keyword of rule.keywords){const index=keywordIndex(body,keyword);if(index>=0)evidence.push({keyword,body_offset:index,excerpt:body.slice(Math.max(0,index-35),Math.min(body.length,index+keyword.length+55))});}
    if(evidence.length>=rule.minMatches)matches.push({category:rule.name,score:evidence.length,evidence});
  }
  matches.sort((a,b)=>b.score-a.score);
  return {category:matches[0]?.category??rules.defaultCategory,tags:matches.map(x=>x.category),matches,method:'literal_body_keyword_rules',confidence:'rule_match_only; not semantic verification'};
}
function inDirectory(root,target){const relative=path.relative(root,target);return relative!==''&&!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative);}
function articlePath(root,relative){
  if(typeof relative!=='string'||relative.includes('\0')||path.isAbsolute(relative)||path.win32.isAbsolute(relative)||relative.split(/[\\/]/).some(x=>x==='..'))throw Error('Article path must remain inside the batch directory');
  const absolute=fs.realpathSync(path.resolve(root,relative));if(!inDirectory(root,absolute)||!fs.statSync(absolute).isFile())throw Error('Article path escapes the batch directory');return absolute;
}
function markdownText(value){return String(value??'').replace(/[\r\n]/g,' ').replace(/[\\`*_[\]<>|]/g,x=>'\\'+x);}
function runClassification(options){
  if(!options.batchDir||!options.outputDir)throw Error('--batch-dir and --output-dir are required');
  const root=fs.realpathSync(path.resolve(options.batchDir)),out=path.resolve(options.outputDir),rules=readRules(options.rules);
  const index=JSON.parse(fs.readFileSync(path.join(root,'batch-index.json'),'utf8'));
  if(!Array.isArray(index.items))throw Error('Batch index must contain items');
  const expectedAccount=options.account??index.expected_account;if(typeof expectedAccount!=='string'||!expectedAccount.trim())throw Error('A verified expected_account or --account is required');
  const articles=[];
  for(const item of index.items){
    if(!['converted','reused'].includes(item.status))continue;
    const source=articlePath(root,item.markdown),buffer=fs.readFileSync(source),sha256=crypto.createHash('sha256').update(buffer).digest('hex');
    if(typeof item.sha256!=='string'||sha256!==item.sha256)throw Error('Article SHA256 does not match batch index');
    const {fields,body}=parseMarkdown(buffer.toString('utf8'));
    if(fields.account!==expectedAccount||item.account!==expectedAccount)throw Error('Article account does not match expected account');
    if(articleUrl(fields.source_url)!==articleUrl(item.url))throw Error('Article source URL does not match batch index');
    const classification=classifyBody(body,rules),number=String(articles.length+1).padStart(4,'0');
    articles.push({number,title:fields.title??item.title??'未命名文章',account:expectedAccount,url:item.url,published_at:fields.published_at??null,supplied_published_at:item.supplied_published_at??null,retrieved_at:item.retrieved_at??null,source_markdown:item.markdown,markdown:classification.category+'/'+number+'.md',sha256,bytes:buffer.length,...classification,_buffer:buffer});
  }
  // Validate every input before creating output; a tampered source cannot yield a partial classification.
  fs.mkdirSync(path.dirname(out),{recursive:true});fs.mkdirSync(out);
  const categoryCounts=Object.create(null);
  for(const article of articles){fs.mkdirSync(path.join(out,article.category),{recursive:true});fs.writeFileSync(path.join(out,article.markdown),article._buffer,{flag:'wx'});delete article._buffer;categoryCounts[article.category]=(categoryCounts[article.category]??0)+1;}
  const counts={input:index.items.length,classified:articles.length,skipped:index.items.length-articles.length,unclassified:articles.filter(x=>x.category===rules.defaultCategory).length,categories:categoryCounts};
  const catalog={schema_version:1,created_at:new Date().toISOString(),source_status:index.status??null,account:expectedAccount,method:'literal_body_keyword_rules',complete_history_verified:false,images_offline:false,counts,rules,articles};
  fs.writeFileSync(path.join(out,'catalog.json'),JSON.stringify(catalog,null,2)+'\n',{flag:'wx'});
  let md='# '+markdownText(expectedAccount)+'：文章分类索引\n\n基于实际保存的正文关键词归类；多标签与命中片段见 catalog.json。原 Markdown 保留不变，图片仍为远程链接。分类为规则判断，不代表完整历史覆盖。\n\n已归类 '+articles.length+' 篇；跳过未成功项 '+counts.skipped+' 篇。\n';
  for(const category of Object.keys(categoryCounts)){md+='\n## '+markdownText(category)+'\n\n';for(const article of articles.filter(x=>x.category===category)){const href=article.markdown.split('/').map(part=>encodeURIComponent(part).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase())).join('/');md+='- ['+markdownText(article.title)+']('+href+')';if(article.tags.length)md+=' — '+article.tags.map(markdownText).join('、');md+='\n';}}
  fs.writeFileSync(path.join(out,'INDEX.md'),md,{flag:'wx'});
  return {ok:true,outputDir:out,counts,catalog:path.join(out,'catalog.json'),index:path.join(out,'INDEX.md')};
}
function main(args){
  if(args.length===1&&args[0]==='--help'){console.log('classify --batch-dir BATCH_DIRECTORY --output-dir NEW_DIRECTORY [--rules RULES_JSON] [--account EXPECTED_ACCOUNT]\nClassifies verified successful Markdown by body keywords; preserves originals. No network or extra dependencies.');return;}
  const map={'--batch-dir':'batchDir','--output-dir':'outputDir','--rules':'rules','--account':'account'},options={};
  for(let i=0;i<args.length;i++){const key=map[args[i]];if(!key||options[key]!==undefined||!args[i+1]||args[i+1].startsWith('--'))throw Error('Invalid classification arguments');options[key]=args[++i];}
  console.log(JSON.stringify(runClassification(options)));
}
if(require.main===module){try{main(process.argv.slice(2));}catch(error){console.error(JSON.stringify({ok:false,status:'failed',message:error.message}));process.exitCode=1;}}
module.exports={runClassification,classifyBody,parseMarkdown,validateRules,DEFAULT_RULES};
