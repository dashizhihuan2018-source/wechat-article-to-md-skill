'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {discover}=require('../scripts/discover.cjs');
const id='gh_test',url=n=>'https://mp.weixin.qq.com/s/test'+n;
const item=n=>({url:url(n),title:'Synthetic '+n,author:{id}});
const page=(items,more=false,cursor=null)=>({ok:true,json:async()=>({code:'ok',data:{items},page:{has_more:more,next_cursor:cursor}})});
function setup(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'wechat-discover-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return {root,out:path.join(root,'out')};}
test('all visible pages use opaque cursors, deduplicate and produce batch-compatible links without credentials',async t=>{
  const {out}=setup(t),requests=[],waits=[];
  const result=await discover({id,outputDir:out,pages:'all'},{key:'synthetic-secret',sleep:async ms=>waits.push(ms),fetch:async(u,o)=>{requests.push({u:new URL(u),o});return requests.length===1?page([item(1)],true,'opaque+/='):page([item(1),item(2)]);}});
  assert.equal(result.status,'provider_exhausted');assert.equal(result.complete_history_verified,false);assert.equal(requests[1].u.searchParams.get('cursor'),'opaque+/=');assert.deepEqual(waits,[60000]);
  const links=JSON.parse(fs.readFileSync(path.join(out,'discovered-links.json')));assert.equal(links.links.length,2);
  assert.equal(require('../scripts/batch.cjs').readLinks(path.join(out,'discovered-links.json')).links.length,2);
  for(const f of fs.readdirSync(out))assert.ok(!fs.readFileSync(path.join(out,f),'utf8').includes('synthetic-secret'));
  assert.equal(requests[0].o.redirect,'error');
});
test('page budget saves continuation instead of claiming complete history',async t=>{
  const {out}=setup(t);let calls=0;
  const state=await discover({id,outputDir:out},{key:'test',fetch:async()=>{calls++;return page([item(1)],true,'next');}});
  assert.equal(calls,1);assert.equal(state.status,'page_budget_reached');assert.equal(state.next_cursor,'next');
});
test('HTTP denial, mismatched account, malformed schema and cursor cycles stop without retry',async t=>{
  const {root}=setup(t);
  const bad=[{ok:false,status:401},page([{...item(1),author:{id:'gh_other'}}]),{ok:true,json:async()=>({code:'ok',data:{items:[]}})},page([item(1)],true,'same')];
  for(let i=0;i<bad.length;i++){let calls=0;const out=path.join(root,String(i));const state=await discover({id,outputDir:out,cursor:'same',pages:'all'},{key:'test',fetch:async()=>{calls++;return bad[i];}});assert.equal(state.status,'stopped');assert.equal(calls,1);assert.ok(fs.existsSync(path.join(out,'discovery.json')));}
});
test('missing key or invalid parameters never request or create outputs',async t=>{
  const {out}=setup(t);let calls=0;
  for(const options of [{id},{id,pages:'0'},{id:'bad'}])await assert.rejects(discover({...options,outputDir:out},{key:'',fetch:async()=>{calls++;}}));
  assert.equal(calls,0);assert.equal(fs.existsSync(out),false);
});
