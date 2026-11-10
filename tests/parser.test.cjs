const test=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {parse,allowed,checkpoint}=require('../scripts/wechat-to-md.cjs');
const url='https://mp.weixin.qq.com/s/synthetic';
const content='这是一段用于验证正文保留规则的合成内容。'.repeat(6);
test('metadata, lazy images and article body survive; ad and script are removed',()=>{
  const result=parse(`<meta property="og:title" content="合成标题"><b id="js_name">合成公众号</b><div id="js_content"><p>${content}</p><img data-src="/real.jpg" src="/placeholder.jpg" alt="图片"><div class="js_ad_link">广告</div><script>throw Error("must not run")</script></div>`,url);
  assert.equal(result.parseStatus,'ok'); assert.equal(result.title,'合成标题'); assert.equal(result.account,'合成公众号');
  assert.ok(result.markdown.includes(content)); assert.ok(result.markdown.includes('![图片](https://mp.weixin.qq.com/real.jpg)'));
  assert.ok(!result.markdown.includes('placeholder')); assert.ok(!result.markdown.includes('must not run')); assert.ok(!result.markdown.includes('广告'));
});
test('exact body thresholds and candidate order match v13',()=>{
  assert.equal(parse(`<div id="js_content">${'甲'.repeat(60)}</div>`,url).parseStatus,'ok');
  assert.equal(parse(`<div id="js_content">${'甲'.repeat(59)}</div>`,url).parseError,'Article body is incomplete');
  assert.equal(parse(`<div id="js_content">${'甲'.repeat(20)}<img src="/1"><img src="/2"></div>`,url).parseStatus,'ok');
  assert.equal(parse(`<div id="js_content">${'甲'.repeat(20)}</div><div class="rich_media_content">${content}</div>`,url).parseStatus,'failed');
});
test('nullish image precedence and filtered navigation match v13',()=>{
  const result=parse(`<div id="js_content"><p>${content}</p><img data-src="" src="/not-fallback"><p>阅读原文</p><figcaption>图注</figcaption></div>`,url);
  assert.equal(result.parseStatus,'ok'); assert.ok(!result.markdown.includes('not-fallback')); assert.ok(!result.markdown.includes('阅读原文')); assert.ok(!result.markdown.includes('图注'));
});
test('verification, non-WeChat redirects and credentials are rejected',()=>{
  assert.throws(()=>allowed('https://mp.weixin.qq.com/mp/wappoc_appmsgcaptcha?target_url=hidden'),/verification/);
  assert.throws(()=>allowed('https://example.test/'),/Only HTTPS/);
  assert.throws(()=>allowed('https://secret@mp.weixin.qq.com/s/a'),/Only HTTPS/);
  assert.equal(checkpoint('环境异常，完成验证后即可继续访问'),true);
});
test('self-contained CLI writes a file without node_modules and refuses overwrite',()=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'wechat-skill-test-'));
  const html=path.join(temp,'page.html'), out=path.join(temp,'article.md');
  fs.writeFileSync(html,`<div id="js_content"><p>${content}</p></div>`);
  const cli=path.resolve(__dirname,'../scripts/wechat-to-md.cjs');
  const run=spawnSync(process.execPath,[cli,'--url',url,'--html',html,'--output',out],{cwd:temp,encoding:'utf8',env:{...process.env,NODE_PATH:''}});
  assert.equal(run.status,0,run.stderr); assert.equal(JSON.parse(run.stdout).ok,true); assert.ok(fs.readFileSync(out,'utf8').includes(content));
  const before=fs.readFileSync(out,'utf8');
  const retry=spawnSync(process.execPath,[cli,'--url',url,'--html',html,'--output',out],{cwd:temp,encoding:'utf8'});
  assert.notEqual(retry.status,0); assert.equal(fs.readFileSync(out,'utf8'),before);
});
test('checkpoint HTML produces status only and no article',()=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'wechat-skill-checkpoint-'));
  const html=path.join(temp,'blocked.html'),out=path.join(temp,'blocked.md');
  fs.writeFileSync(html,'<html>环境异常，完成验证后即可继续访问</html>');
  const run=spawnSync(process.execPath,[path.resolve(__dirname,'../scripts/wechat-to-md.cjs'),'--url',url,'--html',html,'--output',out],{encoding:'utf8'});
  assert.equal(run.status,2); assert.equal(fs.existsSync(out),false); assert.equal(JSON.parse(fs.readFileSync(out+'.status.json','utf8')).status,'blocked');
});
