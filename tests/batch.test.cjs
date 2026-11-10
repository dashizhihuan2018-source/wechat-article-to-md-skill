const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const batchFile=path.resolve(__dirname,'../scripts/batch.cjs');
const articleUrl=name=>'https://mp.weixin.qq.com/s/'+name;

function fixture(t,entries) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'wechat-batch-test-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const links=path.join(dir,'links.json'),out=path.join(dir,'new-batch');
  fs.writeFileSync(links,JSON.stringify(entries));
  const converter=path.join(dir,'fake-converter.cjs');
  fs.writeFileSync(converter,`const fs=require('node:fs'),path=require('node:path');
const args=process.argv.slice(2),url=args[args.indexOf('--url')+1],out=args[args.indexOf('--output')+1];
fs.appendFileSync(path.join(__dirname,'calls.jsonl'),JSON.stringify({url,args,node:process.execPath})+'\\n');
const name=new URL(url).pathname.split('/').pop();
let status;
if(['blocked','403','429','missing'].includes(name))status={ok:false,status:name==='missing'?'failed':'blocked',reason:name==='missing'?'parse_failed':'access_restricted',message:name==='missing'?'Readability returned no article content':'Stopped at '+name,markdown_written:false};
else{
 const account=name==='wrong'?'Different synthetic account':name==='no-account'?null:'Synthetic account';
 const fields={source_url:url,title:'Synthetic '+name,account,published_at:'2020-01-02',saved_at:new Date().toISOString(),parse_status:'ok'};
 const md='---\\n'+Object.entries(fields).map(([k,v])=>k+': '+JSON.stringify(v)).join('\\n')+'\\n---\\n\\n# Synthetic article\\n\\n'+ 'Offline synthetic body. '.repeat(8);
 fs.writeFileSync(out,md,{flag:'wx'});status={ok:true,status:'converted',source_url:url,output:out,bytes:Buffer.byteLength(md),input_mode:'http',images_offline:false};
}
fs.writeFileSync(out+'.status.json',JSON.stringify(status),{flag:'wx'});console.log(JSON.stringify(status));process.exitCode=status.ok?0:status.status==='blocked'?2:1;
`);
  let time=Date.parse('2026-01-01T00:00:00Z');const sleeps=[];
  const runtime={converterPath:converter,now:()=>time,sleep:async ms=>{sleeps.push(ms);time+=ms;}};
  return {dir,links,out,converter,runtime,sleeps,calls:()=>fs.existsSync(path.join(dir,'calls.jsonl'))?fs.readFileSync(path.join(dir,'calls.jsonl'),'utf8').trim().split('\n').map(JSON.parse):[]};
}
function api(){assert.ok(fs.existsSync(batchFile),'serial batch runner must exist');return require(batchFile);}

test('serial inputs reject unsafe URLs, invalid limits and fast production intervals before creating outputs',async t=>{
  const {runBatch}=api();
  for(const [entries,extra] of [[['https://example.test/s/a'],{}],[[articleUrl('a')],{limit:0}],[[articleUrl('a')],{limit:1.5}],[[articleUrl('a')],{intervalSeconds:59}],[[articleUrl('a'),articleUrl('a')],{}]]){
    const f=fixture(t,entries);await assert.rejects(runBatch({links:f.links,outputDir:f.out,...extra},f.runtime));assert.equal(fs.existsSync(f.out),false);assert.equal(f.calls().length,0);
  }
});
test('ordered real subprocesses are serial, retain date provenance and wait at least 60 seconds after completion',async t=>{
  const f=fixture(t,{ordering:'User verified newest first',links:[{url:articleUrl('a'),title:'Supplied title',published_at:'1999-12-31',discovery:{method:'authorized history list',rank:1}},articleUrl('b')]});
  const r=await api().runBatch({links:f.links,outputDir:f.out,account:'Synthetic account'},f.runtime);
  assert.equal(r.status,'completed');assert.deepEqual(f.sleeps,[60000]);assert.deepEqual(f.calls().map(x=>x.url),[articleUrl('a'),articleUrl('b')]);
  assert.ok(f.calls().every(x=>x.node===process.execPath));assert.equal(r.counts.converted,2);assert.equal(r.next_index,2);
  const a=r.items[0];assert.equal(a.supplied_published_at,'1999-12-31');assert.equal(a.published_at,'2020-01-02');assert.equal(a.source_of_date.published_at,'article_frontmatter');assert.equal(a.source_of_date.supplied_published_at,'links_file_unverified');assert.equal(a.retrieved_at,'2026-01-01T00:00:00.000Z');
  assert.equal(a.discovery.rank,1);assert.equal(a.title,'Synthetic a');assert.ok(fs.existsSync(path.join(f.out,'001','article.md')));assert.ok(fs.existsSync(path.join(f.out,'manifest.json')));
});
test('first verification, 403, 429 or missing body stops all subsequent requests and writes a resumable cursor',async t=>{
  for(const failure of ['blocked','403','429','missing']){
    const f=fixture(t,[articleUrl('a'),articleUrl(failure),articleUrl('never')]);
    const r=await api().runBatch({links:f.links,outputDir:f.out},f.runtime);
    assert.equal(r.status,'stopped');assert.equal(r.next_index,1);assert.equal(f.calls().length,2);assert.equal(r.items[2].status,'pending');assert.equal(r.counts.converted,1);
    const remaining=JSON.parse(fs.readFileSync(path.join(f.out,'remaining-links.json')));assert.deepEqual(remaining.links.map(x=>x.url),[articleUrl(failure),articleUrl('never')]);assert.equal(fs.existsSync(path.join(f.out,'003')),false);
    assert.equal(JSON.parse(fs.readFileSync(path.join(f.out,'batch-index.json'))).status,'stopped');
  }
});
test('an account mismatch or missing account preserves the article but stops the batch',async t=>{
  for(const bad of ['wrong','no-account']){
    const f=fixture(t,[articleUrl(bad),articleUrl('never')]);const r=await api().runBatch({links:f.links,outputDir:f.out,account:'Synthetic account'},f.runtime);
    assert.equal(r.items[0].status,'account_mismatch');assert.equal(r.counts.converted,0);assert.equal(f.calls().length,1);assert.ok(fs.existsSync(path.join(f.out,'001','article.md')));
  }
});
test('all entries are selected by default while an optional positive limit supports a shorter trial',async t=>{
  const entries=Array.from({length:12},(_,i)=>articleUrl('all-'+i));
  const all=fixture(t,entries);
  const complete=await api().runBatch({links:all.links,outputDir:all.out},all.runtime);
  assert.equal(complete.status,'completed');assert.equal(complete.items.length,12);assert.equal(complete.counts.converted,12);assert.equal(complete.selection,'all');assert.equal(complete.limit,null);assert.equal(all.sleeps.length,11);
  const trial=fixture(t,entries);
  const limited=await api().runBatch({links:trial.links,outputDir:trial.out,limit:2},trial.runtime);
  assert.equal(limited.items.length,2);assert.equal(limited.counts.unselected,10);assert.equal(limited.selection,'limited');assert.equal(limited.limit,2);
});
test('existing output is never overwritten and plain-text order is retained',async t=>{
  const f=fixture(t,[]);fs.writeFileSync(f.links,articleUrl('a')+'\n\n'+articleUrl('b')+'\n');
  const r=await api().runBatch({links:f.links,outputDir:f.out,limit:1},f.runtime);assert.equal(r.items.length,1);assert.equal(r.counts.unselected,1);
  const before=fs.readFileSync(path.join(f.out,'001','article.md'),'utf8');await assert.rejects(api().runBatch({links:f.links,outputDir:f.out},f.runtime),/exist/i);assert.equal(fs.readFileSync(path.join(f.out,'001','article.md'),'utf8'),before);
});
test('a verified existing Markdown seed is copied without another request and with original retrieval provenance',async t=>{
  const f=fixture(t,[]);const seed=path.join(f.dir,'seed.md');const md='---\nsource_url: '+JSON.stringify(articleUrl('seed'))+'\naccount: "Synthetic account"\ntitle: "Existing synthetic seed"\npublished_at: "2021-01-02"\nsaved_at: "2026-01-01T00:00:00.000Z"\nparse_status: "ok"\n---\n\n# Existing seed\n'+ 'Synthetic body '.repeat(10);
  fs.writeFileSync(seed,md);fs.writeFileSync(seed+'.status.json',JSON.stringify({ok:true,input_mode:'http',status:'converted',source_url:articleUrl('seed')}));
  fs.writeFileSync(f.links,JSON.stringify([{url:articleUrl('seed'),reuse_markdown:'seed.md'},articleUrl('a')]));
  const r=await api().runBatch({links:f.links,outputDir:f.out,account:'Synthetic account'},f.runtime);assert.equal(r.counts.reused,1);assert.equal(r.counts.converted,1);assert.equal(f.calls().length,1);assert.deepEqual(f.sleeps,[]);assert.equal(fs.readFileSync(seed,'utf8'),md);assert.equal(r.items[0].source_of_date.retrieved_at,'existing_markdown_saved_at');
});
test('a seed whose source URL does not match stops without fetching a replacement',async t=>{
  const f=fixture(t,[{url:articleUrl('a'),reuse_markdown:'seed.md'},articleUrl('never')]);fs.writeFileSync(path.join(f.dir,'seed.md'),'---\nsource_url: '+JSON.stringify(articleUrl('other'))+'\nparse_status: "ok"\n---\n\nBody');fs.writeFileSync(path.join(f.dir,'seed.md.status.json'),JSON.stringify({ok:true,input_mode:'http'}));
  const r=await api().runBatch({links:f.links,outputDir:f.out},f.runtime);assert.equal(r.status,'stopped');assert.equal(f.calls().length,0);assert.equal(r.items[0].reason,'invalid_existing_markdown');
});
test('CLI validates offline and both standalone and bootstrap --batch help work without fetching',t=>{
  api();const f=fixture(t,['https://example.test/s/rejected']);
  const invalid=spawnSync(process.execPath,[batchFile,'--links',f.links,'--output-dir',f.out],{encoding:'utf8'});assert.equal(invalid.status,1);assert.equal(fs.existsSync(f.out),false);
  const help=spawnSync(process.execPath,[batchFile,'--help'],{encoding:'utf8'});assert.equal(help.status,0);assert.match(help.stdout,/--limit/);
  if(process.platform!=='win32'){
    const boot=spawnSync('sh',[path.resolve(__dirname,'../scripts/run.sh'),'--batch','--help'],{encoding:'utf8'});assert.equal(boot.status,0,boot.stderr);assert.match(boot.stdout,/--output-dir/);
  }
});
