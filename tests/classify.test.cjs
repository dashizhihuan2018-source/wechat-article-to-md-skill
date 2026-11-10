'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const {runClassification,validateRules,classifyBody,DEFAULT_RULES}=require('../scripts/classify.cjs');
function setup(t,entries){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'wechat-classify-')),batch=path.join(root,'batch'),out=path.join(root,'classified');fs.mkdirSync(batch);
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const items=entries.map((entry,i)=>{
    const rel=String(i+1).padStart(3,'0')+'/article.md',filename=path.join(batch,rel),url='https://mp.weixin.qq.com/s/synthetic'+i;
    const fields={source_url:url,title:entry.title??'Synthetic title',account:entry.account??'Synthetic Account',parse_status:'ok'};
    const text='---\n'+Object.entries(fields).map(([key,value])=>key+': '+JSON.stringify(value)).join('\n')+'\n---\n\n# '+fields.title+'\n\n'+entry.body+'\n';
    fs.mkdirSync(path.dirname(filename));fs.writeFileSync(filename,text);
    return {status:entry.status??'converted',markdown:rel,account:'Synthetic Account',url,title:fields.title,sha256:crypto.createHash('sha256').update(text).digest('hex')};
  });
  const index={status:'completed',expected_account:'Synthetic Account',items};
  const save=()=>fs.writeFileSync(path.join(batch,'batch-index.json'),JSON.stringify(index));save();return {root,batch,out,index,save};
}
test('body-based categories, multi-tags and evidence preserve verified original bytes and skip pending items',t=>{
  const f=setup(t,[{body:'这项临床研究开发新药物，为肿瘤治疗提供疗法。公司完成融资并计划IPO上市。'},{body:'我们徒步看日出，记录旅行沿途的山川风景。'},{body:'记录普通的一天。',status:'pending'}]);
  const result=runClassification({batchDir:f.batch,outputDir:f.out});assert.equal(result.counts.classified,2);assert.equal(result.counts.skipped,1);
  const catalog=JSON.parse(fs.readFileSync(result.catalog));assert.deepEqual(catalog.articles[0].tags,['医药健康','财经商业']);assert.equal(catalog.articles[1].category,'旅行地理');
  assert.ok(catalog.articles[0].matches[0].evidence.every(e=>e.excerpt.includes(e.keyword)||e.excerpt.toLowerCase().includes(e.keyword)));
  for(const article of catalog.articles){assert.deepEqual(fs.readFileSync(path.join(f.out,article.markdown)),fs.readFileSync(path.join(f.batch,article.source_markdown)));}
  assert.equal(catalog.complete_history_verified,false);assert.ok(fs.readFileSync(result.index,'utf8').includes('旅行地理'));
  assert.throws(()=>runClassification({batchDir:f.batch,outputDir:f.out}),/EEXIST/);
});
test('title, frontmatter, image alt text and URLs cannot supply body evidence',t=>{
  const f=setup(t,[{title:'旅行旅游徒步日出',body:'普通文字。 ![人工智能药物](https://example.com/IPO) [来源](https://example.com/FDA)'}]);
  const result=runClassification({batchDir:f.batch,outputDir:f.out}),article=JSON.parse(fs.readFileSync(result.catalog)).articles[0];
  assert.equal(article.category,'未分类');assert.deepEqual(article.tags,[]);assert.deepEqual(article.matches,[]);
});
test('tampered hash, account mismatch, URL mismatch and traversal stop before output creation',t=>{
  const changes=[f=>{fs.appendFileSync(path.join(f.batch,'001/article.md'),'tampered');},f=>{f.index.items[0].account='Other';f.save();},f=>{f.index.items[0].url='https://mp.weixin.qq.com/s/wrong';f.save();},f=>{f.index.items[0].markdown='../outside.md';f.save();}];
  for(const change of changes){const f=setup(t,[{body:'人工智能与芯片的软件实现。'}]);change(f);assert.throws(()=>runClassification({batchDir:f.batch,outputDir:f.out}));assert.equal(fs.existsSync(f.out),false);}
});
test('symlinks cannot redirect article reads outside the batch',t=>{
  const f=setup(t,[{body:'旅行记录。'}]),outside=path.join(f.root,'outside.md'),original=path.join(f.batch,'001/article.md');fs.copyFileSync(original,outside);fs.unlinkSync(original);
  try{fs.symlinkSync(outside,original,'file');}catch(error){if(['EPERM','EACCES','ENOSYS'].includes(error.code)){t.skip('Symlink creation unavailable');return;}throw error;}
  assert.throws(()=>runClassification({batchDir:f.batch,outputDir:f.out}),/escapes/);assert.equal(fs.existsSync(f.out),false);
});
test('custom literal rules and minimum distinct matches give deterministic fallback and tags',t=>{
  const f=setup(t,[{body:'用户讨论ADC这一缩写。'},{body:'本项目研究ADC与抗体。'}]),rules=path.join(f.root,'rules.json');
  fs.writeFileSync(rules,JSON.stringify({categories:[{name:'生物药',keywords:['ADC','抗体'],minMatches:2}],defaultCategory:'待审阅'}));
  const result=runClassification({batchDir:f.batch,outputDir:f.out,rules}),articles=JSON.parse(fs.readFileSync(result.catalog)).articles;assert.equal(articles[0].category,'待审阅');assert.equal(articles[1].category,'生物药');
  assert.throws(()=>validateRules({categories:[{name:'../escape',keywords:['word']}]}));assert.throws(()=>validateRules({categories:[{name:'Topic',keywords:['a']},{name:'topic',keywords:['b']}]}));
  assert.equal(classifyBody('An ordinary detail.',validateRules(DEFAULT_RULES)).category,'未分类');
});
test('standalone CLI creates an actual local catalog without dependencies',t=>{
  const f=setup(t,[{body:'通过开源软件学习编程算法。'}]);const result=spawnSync(process.execPath,[path.resolve(__dirname,'../scripts/classify.cjs'),'--batch-dir',f.batch,'--output-dir',f.out],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);assert.equal(JSON.parse(result.stdout).counts.classified,1);assert.ok(fs.existsSync(path.join(f.out,'科技数码','0001.md')));
});
