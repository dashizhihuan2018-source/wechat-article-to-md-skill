const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const {parse} = require('./parser.cjs');
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36 MicroMessenger';
class Blocked extends Error { constructor() { super('WeChat requires verification; no article was saved.'); this.code='verification_required'; } }
function allowed(value) {
  const u = new URL(value);
  if (u.protocol !== 'https:' || u.hostname !== 'mp.weixin.qq.com' || u.port || u.username || u.password) throw Error('Only HTTPS mp.weixin.qq.com article URLs are supported');
  if (/captcha|verify|wappoc/i.test(u.pathname)) throw new Blocked();
  u.hash='';
  return u;
}
function checkpoint(html) {
  return /wappoc_appmsgcaptcha|环境异常|完成验证后即可继续访问|访问过于频繁|操作频繁，请稍后再试|该内容已被发布者删除|此内容因违规无法查看/i.test(html);
}
function getPage(value,remaining=5) {
  const url = allowed(value);
  return new Promise((resolve,reject)=>{
    const request=https.get(url,{headers:{'accept-encoding':'identity','user-agent':USER_AGENT,referer:'https://mp.weixin.qq.com/'}},response=>{
      const status=response.statusCode || 0;
      if (response.headers.location && status>=300 && status<400) {
        response.resume();
        if (remaining<=0) return reject(Error('Too many redirects'));
        let next;
        try { next=allowed(new URL(response.headers.location,url)); } catch(e) { reject(e); return; }
        getPage(next,remaining-1).then(resolve,reject);
        return;
      }
      if (status<200 || status>=300) { response.resume(); const e=Error(`Fetch failed with ${status}`); e.code=status===403||status===429?'access_restricted':'http_error'; reject(e); return; }
      let bytes=0,body='';
      response.setEncoding('utf8');
      response.on('data',chunk=>{bytes+=Buffer.byteLength(chunk); if(bytes>20*1024*1024) request.destroy(Error('HTML exceeds 20 MiB')); else body+=chunk;});
      response.on('error',reject);
      response.on('end',()=>checkpoint(body)?reject(new Blocked()):resolve(body));
    });
    request.setTimeout(15000,()=>request.destroy(Error('HTTP request timed out')));
    request.on('error',reject);
  });
}
function frontmatter(article,url,savedAt) {
  const fields={source_url:url,title:article.title,account:article.account,author:article.author,published_at:article.publishedAt,saved_at:savedAt,parse_status:article.parseStatus};
  return '---\n'+Object.entries(fields).filter(([,v])=>v!==undefined).map(([k,v])=>`${k}: ${JSON.stringify(v)}`).join('\n')+'\n---\n\n'+`# ${article.title}\n\n`+article.markdown.trim()+'\n';
}
async function main(argv) {
  const options={};
  for(let i=0;i<argv.length;i++) {
    if(argv[i]==='--help') { console.log('node scripts/wechat-to-md.cjs --url URL --output article.md [--html saved-page.html] [--title TITLE]'); return; }
    if(!['--url','--output','--html','--title'].includes(argv[i]) || !argv[i+1]) throw Error('Unknown or incomplete argument: '+argv[i]);
    options[argv[i].slice(2)]=argv[++i];
  }
  if(!options.url || !options.output) throw Error('--url and --output are required');
  const url=allowed(options.url.replace(/&amp;/g,'&')).toString();
  if(!/^\/s(?:\/|$)/.test(new URL(url).pathname)) throw Error('An article /s URL is required');
  const output=path.resolve(options.output), statusFile=output+'.status.json';
  if(fs.existsSync(output)||fs.existsSync(statusFile)) throw Error('Output already exists; choose a new output path');
  let status;
  try {
    const html=options.html?fs.readFileSync(options.html,'utf8'):await getPage(url);
    if(checkpoint(html)) throw new Blocked();
    let article=parse(html,url,options.title);
    if(!options.html && article.parseStatus!=='ok' && ['Readability returned no article content','Article body is incomplete'].includes(article.parseError)) {
      await new Promise(resolve=>setTimeout(resolve,1200));
      article=parse(await getPage(url),url,options.title);
    }
    if(article.parseStatus!=='ok') { const e=Error(article.parseError); e.code='parse_failed'; throw e; }
    const text=frontmatter(article,url,new Date().toISOString());
    fs.mkdirSync(path.dirname(output),{recursive:true});
    fs.writeFileSync(output,text,{flag:'wx'});
    status={ok:true,status:'converted',source_url:url,title:article.title,output,bytes:Buffer.byteLength(text),input_mode:options.html?'local_html':'http',images_offline:false,mechanism:'obsync-v13-reader-reproduction'};
  } catch(error) {
    status={ok:false,status:error.code==='verification_required'||error.code==='access_restricted'?'blocked':'failed',reason:error.code||'conversion_error',message:error.message,source_url:url,markdown_written:false};
    process.exitCode=error.code==='verification_required'||error.code==='access_restricted'?2:1;
  }
  fs.mkdirSync(path.dirname(statusFile),{recursive:true});
  fs.writeFileSync(statusFile,JSON.stringify(status,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify(status));
}
if(require.main===module) main(process.argv.slice(2)).catch(e=>{console.error(JSON.stringify({ok:false,status:'failed',message:e.message}));process.exitCode=1;});
module.exports={main,parse,frontmatter,allowed,checkpoint,USER_AGENT,...require('./public-index.cjs')};
