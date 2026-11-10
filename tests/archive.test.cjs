'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {archive:archiveImpl}=require('../scripts/archive.cjs'),{searchAccounts}=require('../scripts/accounts.cjs');
const archive=(options,runtime)=>archiveImpl({provider:'dataxapi',...options},runtime);
const id='gh_synthetic',name='Synthetic account';
const response=(items,more=false,cursor=null)=>({ok:true,json:async()=>({code:'ok',data:{items},page:{has_more:more,next_cursor:cursor}})});
function fixture(t){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'wechat-archive-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const html=path.join(root,'page.html');fs.writeFileSync(html,`<meta property="og:title" content="Synthetic title"><b id="js_name">${name}</b><div id="js_content"><p>${'临床治疗药物和糖尿病研究，这是用于离线测试的合成正文。'.repeat(8)}</p></div>`);
  const wrapper=path.join(root,'converter.cjs'),real=path.resolve(__dirname,'../scripts/wechat-to-md.cjs');
  fs.writeFileSync(wrapper,`const cp=require('node:child_process');const r=cp.spawnSync(process.execPath,[${JSON.stringify(real)},...process.argv.slice(2),'--html',${JSON.stringify(html)}],{stdio:'inherit'});process.exitCode=r.status??1;`);
  const requests=[],waits=[];
  const runtime={provider:{key:'SYNTHETIC_SECRET',sleep:async ms=>waits.push(ms),fetch:async u=>{
    const url=new URL(u);requests.push(url);
    if(url.pathname.includes('/accounts/search'))return response([{id,name,username:'synthetic'}]);
    const page=url.searchParams.has('cursor')?1:0;
    return response(Array.from({length:6},(_,i)=>({url:'https://mp.weixin.qq.com/s/fixture-'+(i+6*page),author:{id},title:'Synthetic '+i})),page===0,page===0?'opaque-next':null);
  }},batch:{converterPath:wrapper,sleep:async ms=>waits.push(ms),elapsed:()=>0}};
  return {root,out:path.join(root,'archive'),runtime,requests,waits};
}
test('name → paginated history → real parser subprocesses → body classification archives more than ten articles',async t=>{
  const f=fixture(t),state=await archive({name,outputDir:f.out},f.runtime);
  assert.equal(state.status,'available_history_archived',state.error);assert.deepEqual(state.counts,{discovered:12,completed:12,classified:12});
  assert.equal(f.requests.length,3);assert.equal(f.requests[2].searchParams.get('cursor'),'opaque-next');assert.equal(state.complete_history_verified,false);
  const catalog=JSON.parse(fs.readFileSync(path.join(f.out,'classified/catalog.json')));assert.equal(catalog.articles.length,12);assert.ok(catalog.articles.every(x=>x.category==='医药健康'));
  for(const item of catalog.articles){assert.ok(fs.existsSync(path.join(f.out,'classified',item.markdown)));assert.ok(item.matches.length);}
  const archiveText=fs.readFileSync(path.join(f.out,'archive.json'),'utf8');assert.ok(!archiveText.includes('SYNTHETIC_SECRET'));
});
test('trial only downloads requested sample while retaining discovery continuation',async t=>{
  const f=fixture(t),state=await archive({name,trial:2,outputDir:f.out},f.runtime);
  assert.equal(state.status,'trial_archived',state.error);assert.equal(state.counts.completed,2);assert.equal(state.counts.classified,2);assert.equal(f.requests.length,2);assert.equal(state.next_history_cursor,'opaque-next');
  const remaining=JSON.parse(fs.readFileSync(path.join(f.out,'articles/remaining-links.json')));assert.equal(remaining.links.length,4);assert.equal(remaining.links[0].url,'https://mp.weixin.qq.com/s/fixture-2');
});
test('exact-name ambiguity stops before history; later search pages are considered',async t=>{
  const f=fixture(t);let calls=0;
  f.runtime.provider.fetch=async()=>{calls++;return calls===1?response([{id,name}],true,'search-next'):response([{id:'gh_second',name}]);};
  const state=await archive({name,outputDir:f.out},f.runtime);
  assert.equal(state.status,'account_selection_required');assert.equal(calls,2);assert.equal(fs.existsSync(path.join(f.out,'discovery')),false);
});
test('known account ID skips search; partial-name search results are never selected',async t=>{
  const f=fixture(t);const result=await searchAccounts('Synthetic',{key:'test',fetch:async()=>response([{id,name}])});assert.equal(result.status,'not_found');
  const state=await archive({name,id,trial:2,outputDir:f.out},f.runtime);assert.equal(state.status,'trial_archived',state.error);assert.equal(f.requests.length,1);assert.ok(f.requests.every(x=>!x.pathname.includes('/accounts/search')));
});
test('search budget stops even a unique exact match when later pages have not been inspected',async t=>{
  const f=fixture(t);let calls=0;f.runtime.provider.fetch=async()=>{calls++;return response([{id,name}],true,'search-next');};
  const state=await archive({name,searchPages:1,outputDir:f.out},f.runtime);assert.equal(state.status,'search_budget_reached');assert.equal(calls,1);assert.equal(state.counts.discovered,0);
});
test('short trial reports the shortfall explicitly and retains classified results',async t=>{
  const f=fixture(t),state=await archive({name,trial:20,outputDir:f.out},f.runtime);assert.equal(state.status,'trial_shortfall');assert.equal(state.trial_shortfall,8);assert.equal(state.counts.classified,12);
});
test('missing key is a preflight failure without network or output',async t=>{
  const f=fixture(t);f.runtime.provider.key='';await assert.rejects(archive({name,outputDir:f.out},f.runtime),/DATAXAPI_API_KEY/);assert.equal(f.requests.length,0);assert.equal(fs.existsSync(f.out),false);
});
test('default name archive is free: public index → originals → real converter → classification without provider credentials',async t=>{
 const f=fixture(t),biz='TW9jaw==',sn='a'.repeat(32);let paidCalls=0;
 f.runtime.provider={key:'',fetch:async()=>{paidCalls++;throw Error('Paid provider forbidden');}};
 f.runtime.public={sleep:async()=>{},fetch:async u=>({ok:true,text:async()=>u.pathname.includes('/summary/')?`<title>⌈${name}⌋-新闻来源聚合 -共2条- 第1页</title>`+[1,2].map(n=>`<div class="item-news"><a class="news-title" href="/news/detail/${String(n).padStart(32,'0')}">Synthetic ${n}</a><a href="/news/summary/source/Synthetic%20account">${name}</a></div>`).join(''):`<div id="source-box"><span class="dark-link">${name}</span></div><div class="top-container"><div class="title">Synthetic ${Number(u.pathname.split('/').pop())}</div><a class="origin_link" href="https://mp.weixin.qq.com/s?__biz=${biz}&amp;mid=${Number(u.pathname.split('/').pop())}&amp;idx=1&amp;sn=${sn}"></a></div>`})};
 const state=await archiveImpl({name,trial:2,outputDir:f.out},f.runtime);assert.equal(state.status,'trial_archived',state.error);assert.equal(state.provider,'bydrug');assert.equal(state.counts.classified,2);assert.equal(paidCalls,0);
});
