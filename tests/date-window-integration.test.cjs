'use strict';
// 端到端证明：日期要求在建目录/发请求之前校验，且过滤发生在下载之前。
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {archive}=require('../scripts/archive.cjs'),{runBatch}=require('../scripts/batch.cjs');
const name='Synthetic windowed account',biz='TW9jaw==',sn='a'.repeat(32);
const rows=[
  {mid:101,day:'2026-10-30',title:'Synthetic autumn'},
  {mid:102,day:'2026-11-01',title:'Synthetic november first'},
  {mid:103,day:'2026-11-03',title:'Synthetic november third'},
  {mid:104,day:'2026-11-06',title:'Synthetic november sixth'},
];
function detail(row,{dated=true}={}){
  const date=dated?`<div class="desc"><span class="text">${row.day} 09:00</span></div>`:'';
  return `<div id="source-box"><span class="dark-link">${name}</span></div><div class="top-container"><div class="title">${row.title}</div>${date}<a class="origin_link" href="https://mp.weixin.qq.com/s?__biz=${biz}&amp;mid=${row.mid}&amp;idx=1&amp;sn=${sn}"></a></div>`;
}
function fixture(t,{dated=true}={}) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'wechat-window-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const seed=path.join(root,'page.html');
  fs.writeFileSync(seed,`<meta property="og:title" content="Synthetic windowed"><b id="js_name">${name}</b><div id="js_content"><p>${'临床治疗药物和糖尿病研究，这是用于离线测试的合成正文。'.repeat(8)}</p></div>`);
  const wrapper=path.join(root,'converter.cjs'),real=path.resolve(__dirname,'../scripts/wechat-to-md.cjs');
  fs.writeFileSync(wrapper,`const cp=require('node:child_process');const r=cp.spawnSync(process.execPath,[${JSON.stringify(real)},...process.argv.slice(2),'--html',${JSON.stringify(seed)}],{stdio:'inherit'});process.exitCode=r.status??1;`);
  const conversions=[];
  const indexHtml=`<title>⌈${name}⌋-新闻来源聚合 -共${rows.length}条- 第1页</title>`+rows.map(row=>`<div class="item-news"><a class="news-title" href="/news/detail/${String(row.mid).padStart(32,'0')}">${row.title}</a><a href="/news/summary/source/${encodeURIComponent(name)}">${name}</a></div>`).join('');
  const runtime={
    public:{sleep:async()=>{},fetch:async url=>{
      const u=new URL(url);
      if(u.pathname.includes('/summary/'))return {ok:true,text:async()=>indexHtml};
      const mid=Number(u.pathname.split('/').pop()),row=rows.find(x=>x.mid===mid);
      return {ok:true,text:async()=>detail(row,{dated})};
    }},
    batch:{converterPath:wrapper,sleep:async()=>{},elapsed:()=>0,
      // 转换次数即真实下载次数：窗口外的原文一次都不应被请求。
      ...( {onSpawn:undefined} )},
  };
  return {root,out:path.join(root,'archive'),runtime,conversions,indexHtml};
}
test('a date window filters verified publication dates before any article download',async t=>{
  const f=fixture(t),state=await archive({name,since:'2026-11-03',until:'2026-11-05',outputDir:f.out},f.runtime);
  assert.equal(state.status,'available_history_archived',state.error);
  assert.deepEqual(state.date_window.requested,{since:'2026-11-03',until:'2026-11-05',since_explicit:true,until_explicit:true});
  assert.equal(state.date_window.label,'2026-11-03 至 2026-11-05（3 天）');
  assert.deepEqual(state.date_filter.counts,{input:4,kept:1,before:2,after:1,undated:0,selected:1});
  assert.equal(state.counts.discovered,1);assert.equal(state.counts.completed,1);assert.equal(state.counts.classified,1);
  const inWindow=JSON.parse(fs.readFileSync(path.join(f.out,'in-window-links.json'),'utf8'));
  assert.equal(inWindow.links.length,1);assert.match(inWindow.links[0].url,/mid=103/);
  assert.ok(fs.existsSync(path.join(f.out,'articles','001','article.md')));
  assert.equal(fs.existsSync(path.join(f.out,'articles','002')),false);
  const untouched=JSON.parse(fs.readFileSync(path.join(f.out,'discovery','discovered-links.json'),'utf8'));
  assert.equal(untouched.links.length,4);
});
test('a window matching nothing stops with a named status and downloads nothing',async t=>{
  const f=fixture(t),state=await archive({name,since:'2026-12-01',until:'2026-12-31',outputDir:f.out},f.runtime);
  assert.equal(state.status,'no_articles_in_window');assert.match(state.error,/widen --days|dataxapi/);
  assert.equal(state.counts.discovered,0);assert.equal(state.counts.completed,0);
  assert.equal(fs.existsSync(path.join(f.out,'articles')),false);
  assert.equal(fs.existsSync(path.join(f.out,'in-window-links.json')),false);
});
test('undated discovery results are excluded from an archive instead of being guessed into the window',async t=>{
  const f=fixture(t,{dated:false}),state=await archive({name,since:'2026-11-03',until:'2026-11-05',outputDir:f.out},f.runtime);
  assert.equal(state.status,'no_articles_in_window');
  assert.deepEqual(state.date_filter.counts,{input:4,kept:0,before:0,after:0,undated:4,selected:0});
  assert.equal(state.date_filter.undated_urls.length,4);
  assert.equal(fs.existsSync(path.join(f.out,'articles')),false);
});
test('invalid or self-contradictory requirements fail before creating output',async t=>{
  const f=fixture(t);
  for(const bad of [{days:'10',since:'2026-11-01'},{since:'2026-11-05',until:'2026-11-01'},{days:'zero'},{since:'2026-02-30'}]){
    const dir=path.join(f.root,'bad-'+Math.random().toString(16).slice(2));
    await assert.rejects(archive({name,...bad,outputDir:dir},f.runtime));
    assert.equal(fs.existsSync(dir),false);
  }
});
test('batch keeps only links whose known date is inside the window and annotates the rest',async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'wechat-window-batch-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const seed=path.join(root,'page.html');
  fs.writeFileSync(seed,`<meta property="og:title" content="Synthetic batch window"><b id="js_name">${name}</b><div id="js_content"><p>${'临床治疗药物和糖尿病研究，这是用于离线测试的合成正文。'.repeat(8)}</p></div><b id="publish_time">2026-11-04 08:00</b>`);
  const wrapper=path.join(root,'converter.cjs'),real=path.resolve(__dirname,'../scripts/wechat-to-md.cjs');
  fs.writeFileSync(wrapper,`const cp=require('node:child_process');const r=cp.spawnSync(process.execPath,[${JSON.stringify(real)},...process.argv.slice(2),'--html',${JSON.stringify(seed)}],{stdio:'inherit'});process.exitCode=r.status??1;`);
  const links=path.join(root,'links.json');
  fs.writeFileSync(links,JSON.stringify({ordering:'synthetic newest-first',links:[
    {url:'https://mp.weixin.qq.com/s/too-old',published_at:'2026-10-20 08:00'},
    {url:'https://mp.weixin.qq.com/s/in-window',published_at:'2026-11-04 08:00'},
    {url:'https://mp.weixin.qq.com/s/too-new',published_at:'2026-11-20 08:00'},
    {url:'https://mp.weixin.qq.com/s/no-date'},
  ]}));
  const out=path.join(root,'articles');
  const index=await runBatch({links,outputDir:out,since:'2026-11-01',until:'2026-11-10'},{converterPath:wrapper,sleep:async()=>{},elapsed:()=>0});
  assert.equal(index.status,'completed');
  assert.deepEqual(index.date_filter.counts,{input:4,kept:1,before:1,after:1,undated:1,selected:2});
  assert.equal(index.date_filter.undated_policy,'attempt');
  assert.deepEqual(index.items.map(x=>x.url),['https://mp.weixin.qq.com/s/in-window','https://mp.weixin.qq.com/s/no-date']);
  assert.equal(index.items[0].within_date_window,true);
  assert.equal(index.items[1].within_date_window,true);
  assert.equal(index.date_window.label,'2026-11-01 至 2026-11-10（10 天）');
  assert.equal(index.counts.out_of_window,0);
  assert.equal(index.selection,'date_window');
  // 供应日期缺失的链接会被下载，再用正文日期逐篇判定；此处窗口为 12 月，故标记为窗口外但不丢文件。
  const lateOut=path.join(root,'articles-late');
  const late=await runBatch({links,outputDir:lateOut,since:'2026-12-01',until:'2026-12-31'},{converterPath:wrapper,sleep:async()=>{},elapsed:()=>0});
  assert.deepEqual(late.items.map(x=>x.url),['https://mp.weixin.qq.com/s/no-date']);
  assert.equal(late.items[0].within_date_window,false);
  assert.equal(late.counts.out_of_window,1);
  assert.ok(fs.existsSync(path.join(lateOut,'001','article.md')));
});
