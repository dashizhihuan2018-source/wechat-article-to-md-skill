'use strict';
// 第三条路径：手机复制链接 → 粘贴 → 一键转。
// 这里锁住四件事：只认 /s 文章地址、丢掉会话凭证参数、按 mid+idx 去重、标题只做「上一行」回退而不猜。
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const {importLinks,collect,normalize}=require('../scripts/import-links.cjs');
const biz='TW9jaw==',sn='a'.repeat(32);
const link=(mid,idx=1,extra='')=>`https://mp.weixin.qq.com/s?__biz=${biz}&mid=${mid}&idx=${idx}&sn=${sn}${extra}`;
function setup(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'wechat-import-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return {root,out:path.join(root,'import'),source:path.join(root,'paste.txt')};}

test('normalize keeps article identity parameters and drops session credentials',()=>{
  const kept=normalize(link(901)+'&chksm=deadbeef&scene=21&from=timeline&key=SESSIONKEY&pass_ticket=TICKET&uin=123456&sharer_sharetime=1762200000');
  assert.equal(new URL(kept.url).searchParams.get('key'),null);
  assert.equal(new URL(kept.url).searchParams.get('pass_ticket'),null);
  assert.equal(new URL(kept.url).searchParams.get('uin'),null);
  assert.equal(new URL(kept.url).searchParams.get('scene'),null);
  assert.equal(new URL(kept.url).searchParams.get('from'),null);
  assert.equal(new URL(kept.url).searchParams.get('sharer_sharetime'),null);
  assert.equal(new URL(kept.url).searchParams.get('chksm'),'deadbeef');
  assert.equal(new URL(kept.url).searchParams.get('mid'),'901');
  assert.deepEqual(kept.stripped,['from','key','pass_ticket','scene','sharer_sharetime','uin']);
  assert.equal(kept.identity,'mid:901:idx:1');
  // http 明文链接升级为 https；实体转义先还原再解析。
  assert.equal(normalize(link(902).replace('https:','http:')).url.startsWith('https://'),true);
  assert.match(normalize(`https://mp.weixin.qq.com/s?__biz=${biz}&amp;mid=903&amp;idx=1&amp;sn=${sn}`).url,/mid=903/);
  // 不是文章地址的一律不认：主页、话题页、非微信域、带端口或账号的伪地址。
  for(const bad of ['https://mp.weixin.qq.com/mp/appmsgalbum?__biz=x','https://mp.weixin.qq.com/','https://example.test/s?mid=1','https://mp.weixin.qq.com:8443/s?mid=1','https://user:pw@mp.weixin.qq.com/s?mid=1','not a url'])
    assert.equal(normalize(bad),null,bad);
});

test('collect deduplicates by mid+idx and never guesses titles it cannot attribute',()=>{
  const text=[
    '好的文章一',
    link(11)+'&scene=21',
    '',
    '第二篇 创新药的临床证据',
    link(12),
    '2026-11-05',
    link(13),
    '短链文章 https://mp.weixin.qq.com/s/AbCdEfGhIj',
    link(11)+'&from=timeline',
    'https://example.test/not-wechat',
    '一行两个链接 '+link(14)+' '+link(15),
  ].join('\n');
  const r=collect(text);
  assert.equal(r.accepted.length,6);
  assert.deepEqual(r.accepted.map(x=>x.title??null),['好的文章一','第二篇 创新药的临床证据',null,'短链文章',null,null]);
  // 纯日期行不当标题（否则「2026-11-05」会被写成标题），故第 13 条无标题。
  assert.equal(r.accepted[2].title,undefined);
  // 同一 mid+idx 只保留首次出现。
  assert.equal(r.duplicates.length,1);assert.equal(r.duplicates[0].first_seen_at_line,2);assert.equal(r.duplicates[0].line,9);
  assert.deepEqual(r.accepted.map(x=>x.discovered.line),[2,5,7,8,11,11]);
  assert.deepEqual(r.stripped,['from','scene']);
  // 非微信行、以及无链接也无标题价值的纯日期行进「未采纳」；一行多链接不猜归属但照样收下。
  assert.deepEqual(r.rejected.map(x=>x.line),[6,10]);
  // 被下一行链接当成标题用掉的行不算无效行，否则报告里每个标题都会显示成失败。
  assert.equal(r.rejected.some(x=>x.line===1||x.line===4),false);
});

test('--list-only writes a reviewable manifest and report without touching the network',async t=>{
  const f=setup(t);
  fs.writeFileSync(f.source,['标题甲',link(201),'', '标题乙',link(202,'2'),'','标题丙',link(203)].join('\n'));
  const state=await importLinks({from:f.source,outputDir:f.out,listOnly:true});
  assert.equal(state.status,'list_ready');assert.equal(state.stage,'list');
  assert.deepEqual(state.counts,{lines:8,accepted:3,duplicates:0,rejected:0,completed:0,classified:0});
  assert.deepEqual(state.links.map(x=>x.title),['标题甲','标题乙','标题丙']);
  const links=JSON.parse(fs.readFileSync(path.join(f.out,'links.json'),'utf8'));
  assert.equal(links.links.length,3);assert.equal(links.links[0].discovered.method,'manual_import');
  const saved=JSON.parse(fs.readFileSync(path.join(f.out,'import.json'),'utf8'));
  assert.equal(saved.status,'list_ready');assert.ok(saved.finished_at);
  const report=fs.readFileSync(path.join(f.out,'import-report.md'),'utf8');
  assert.match(report,/将按此顺序处理/);assert.match(report,/001\. \*\*标题甲\*\*/);
  // 只出清单时不应该生成下载目录。
  assert.equal(fs.existsSync(path.join(f.out,'articles')),false);
});

test('a full import downloads serially, classifies, and keeps the pasted order',async t=>{
  const f=setup(t),name='Synthetic imported account';
  const seed=path.join(f.root,'page.html');
  fs.writeFileSync(seed,`<meta property="og:title" content="Synthetic imported"><b id="js_name">${name}</b><b id="publish_time">2026-11-04 08:00</b><div id="js_content"><p>${'临床治疗药物和糖尿病研究，这是用于离线测试的合成正文。'.repeat(8)}</p></div>`);
  const wrapper=path.join(f.root,'converter.cjs'),real=path.resolve(__dirname,'../scripts/wechat-to-md.cjs');
  fs.writeFileSync(wrapper,`const cp=require('node:child_process');const r=cp.spawnSync(process.execPath,[${JSON.stringify(real)},...process.argv.slice(2),'--html',${JSON.stringify(seed)}],{stdio:'inherit'});process.exitCode=r.status??1;`);
  fs.writeFileSync(f.source,['甲篇报道',link(301),'乙篇报道',link(302,'2')].join('\n'));
  const state=await importLinks({from:f.source,outputDir:f.out,account:name},{batch:{converterPath:wrapper,sleep:async()=>{},elapsed:()=>0}});
  assert.equal(state.status,'imported_and_downloaded',state.error);
  assert.equal(state.counts.completed,2);assert.equal(state.counts.classified,2);
  assert.equal(state.batch_status,'completed');
  const index=JSON.parse(fs.readFileSync(path.join(f.out,'articles','batch-index.json'),'utf8'));
  assert.deepEqual(index.items.map(x=>x.supplied_title),['甲篇报道','乙篇报道']);
  assert.ok(fs.existsSync(path.join(f.out,'articles','001','article.md')));
  assert.ok(fs.existsSync(path.join(f.out,'classified','catalog.json')));
  const saved=JSON.parse(fs.readFileSync(path.join(f.out,'import.json'),'utf8'));
  assert.equal(saved.stage,'finished');assert.equal(saved.classification.input,2);
});

test('a date requirement travels from the import entry into the batch index',async t=>{
  const f=setup(t),name='Synthetic windowed import';
  const seed=path.join(f.root,'page.html');
  fs.writeFileSync(seed,`<meta property="og:title" content="Synthetic windowed"><b id="js_name">${name}</b><b id="publish_time">2026-11-04 08:00</b><div id="js_content"><p>${'临床治疗药物和糖尿病研究，这是用于离线测试的合成正文。'.repeat(8)}</p></div>`);
  const wrapper=path.join(f.root,'converter.cjs'),real=path.resolve(__dirname,'../scripts/wechat-to-md.cjs');
  fs.writeFileSync(wrapper,`const cp=require('node:child_process');const r=cp.spawnSync(process.execPath,[${JSON.stringify(real)},...process.argv.slice(2),'--html',${JSON.stringify(seed)}],{stdio:'inherit'});process.exitCode=r.status??1;`);
  fs.writeFileSync(f.source,link(401));
  const state=await importLinks({from:f.source,outputDir:f.out,account:name,since:'2026-11-01',until:'2026-11-10'},{batch:{converterPath:wrapper,sleep:async()=>{},elapsed:()=>0}});
  assert.equal(state.date_window.label,'2026-11-01 至 2026-11-10（10 天）');
  const links=JSON.parse(fs.readFileSync(path.join(f.out,'links.json'),'utf8'));
  assert.equal(links.date_window.until,'2026-11-10');
  const index=JSON.parse(fs.readFileSync(path.join(f.out,'articles','batch-index.json'),'utf8'));
  assert.equal(index.date_window.label,'2026-11-01 至 2026-11-10（10 天）');
  assert.equal(index.selection,'date_window');
  assert.equal(state.counts.out_of_window,0);
});

test('piped share text works through --from - so a phone paste needs no file',async t=>{
  const f=setup(t);
  const r=cp.spawnSync(process.execPath,[path.resolve(__dirname,'../scripts/import-links.cjs'),'--from','-','--list-only','--output-dir',f.out],{input:`标题A\n${link(501)}\n`,encoding:'utf8'});
  assert.equal(r.status,0,r.stderr);
  const printed=JSON.parse(r.stdout.trim());
  assert.equal(printed.status,'list_ready');assert.equal(printed.counts.accepted,1);
  assert.match(fs.readFileSync(path.join(f.out,'import-report.md'),'utf8'),/标题A/);
});

test('missing requirements and empty pastes fail before creating an output directory',async t=>{
  const f=setup(t);
  await assert.rejects(importLinks({outputDir:f.out}),/--from is required/);
  await assert.rejects(importLinks({from:f.source}),/--output-dir is required/);
  fs.writeFileSync(f.source,'这里没有任何链接\nhttps://example.test/a\n');
  await assert.rejects(importLinks({from:f.source,outputDir:f.out}),/No valid mp\.weixin\.qq\.com article URL/);
  assert.equal(fs.existsSync(f.out),false);
  // 已存在的目录不覆盖：导入是新建归档，避免把上一次的结果冲掉。
  fs.writeFileSync(f.source,link(601));
  fs.mkdirSync(f.out);
  await assert.rejects(importLinks({from:f.source,outputDir:f.out,listOnly:true}),/EEXIST/);
});
