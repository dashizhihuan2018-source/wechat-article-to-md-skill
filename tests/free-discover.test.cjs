'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {freeDiscover}=require('../scripts/free-discover.cjs');
const {parsePublicIndex,parsePublicDetail}=require('../scripts/wechat-to-md.cjs');
const name='Synthetic account',biz='TW9jaw==',sn='a'.repeat(32);
const index=(page,ids,total=12)=>`<title>⌈${name}⌋-新闻来源聚合 -共${total}条- 第${page}页</title>`+ids.map(n=>`<div class="item-news"><a class="news-title" href="/news/detail/${String(n).padStart(32,'0')}">Synthetic ${n}</a><a href="/news/summary/source/Synthetic%20account">${name}</a></div>`).join('');
const detail=(n,author=name)=>`<div id="source-box"><a class="source-box"><span class="dark-link">${author}</span></a></div><div class="top-container"><div class="title">Synthetic ${n}</div><div class="desc"><span class="text">2026-01-01 12:30</span><a class="origin_link" href="https://mp.weixin.qq.com/s?__biz=${biz}&amp;mid=${n}&amp;idx=1&amp;sn=${sn}&amp;sessionid=0">查看原文</a></div></div>`;
function setup(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'wechat-free-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return {root,out:path.join(root,'out')};}
function transport(){const requests=[],sleeps=[];return {requests,sleeps,runtime:{sleep:async ms=>sleeps.push(ms),fetch:async(url,options)=>{const u=new URL(url);requests.push({url:u.href,options});assert.equal(u.origin,'https://bydrug.pharmcube.com');assert.equal(options.headers.Authorization,undefined);if(u.pathname.includes('/summary/')){const page=Number(u.searchParams.get('page')||1);return {ok:true,text:async()=>index(page,page===1?Array.from({length:10},(_,i)=>i+1):[11,12])};}return {ok:true,text:async()=>detail(Number(u.pathname.split('/').pop()))};}}};}
test('free public discovery paginates beyond ten, verifies original identities and produces batch input without credentials',async t=>{
 const f=setup(t),net=transport(),state=await freeDiscover({name,outputDir:f.out},net.runtime);
 assert.equal(state.status,'provider_exhausted',state.error);assert.equal(state.reported_total,12);assert.equal(state.details_fetched,12);assert.equal(state.complete_history_verified,false);assert.equal(net.requests.length,14);assert.ok(net.requests.every(x=>x.options.redirect==='error'));assert.deepEqual(net.sleeps,Array(13).fill(2000));
 const file=path.join(f.out,'discovered-links.json'),links=require('../scripts/batch.cjs').readLinks(file).links;assert.equal(links.length,12);assert.equal(new URL(links[0].url).searchParams.get('sessionid'),null);assert.equal(links[0].discovery.rank,1);
});
test('trial stops at requested number of original links',async t=>{const f=setup(t),net=transport(),state=await freeDiscover({name,outputDir:f.out,limit:2},net.runtime);assert.equal(state.status,'trial_limit_reached');assert.equal(state.details_fetched,2);assert.equal(net.requests.length,3);});
test('wrong original biz or wrong detail account stops before appending unrelated data',async t=>{
 for(const wrong of ['biz','account']){const f=setup(t),net=transport();if(wrong==='account')net.runtime.fetch=async url=>({ok:true,text:async()=>url.pathname.includes('/summary/')?index(1,[1],1):detail(1,'Different account')});const state=await freeDiscover({name,biz:wrong==='biz'?'wrong':biz,outputDir:f.out},net.runtime);assert.equal(state.status,'stopped');assert.equal(JSON.parse(fs.readFileSync(path.join(f.out,'discovered-links.json'))).links.length,0);}
});
test('public HTML cannot redirect originals or supply a mismatched source title',()=>{
 assert.throws(()=>parsePublicIndex(index(1,[1]).replace(name,'Wrong account'),name),/account/);
 assert.throws(()=>parsePublicDetail(detail(1).replace('https://mp.weixin.qq.com/s?','https://example.test/s?'),name),/original URL/);
 assert.throws(()=>parsePublicDetail(detail(1).replace(`mid=1`,`mid=bad`),name),/invalid/);
});
test('pagination that silently returns page one is detected without repeated article requests',async t=>{
 const f=setup(t),net=transport();let calls=0;net.runtime.fetch=async url=>{calls++;return {ok:true,text:async()=>url.pathname.includes('/summary/')?index(1,[1],2):detail(1)};};const state=await freeDiscover({name,outputDir:f.out},net.runtime);assert.equal(state.status,'stopped');assert.match(state.error,/advance/);assert.equal(calls,3);
});
test('public three-page access limit is respected and later zero totals do not erase the first-page count',async t=>{
 const f=setup(t);let detailCalls=0;const runtime={sleep:async()=>{},fetch:async u=>({ok:true,text:async()=>{if(u.pathname.includes('/summary/')){const page=Number(u.searchParams.get('page')||1);assert.ok(page<=3);return index(page,Array.from({length:10},(_,i)=>(page-1)*10+i+1),page===1?62:0);}detailCalls++;return detail(Number(u.pathname.split('/').pop()));}})};
 const state=await freeDiscover({name,outputDir:f.out},runtime);assert.equal(state.status,'public_access_limit',state.error);assert.equal(state.reported_total,62);assert.equal(detailCalls,30);assert.equal(state.index_pages,3);
});
