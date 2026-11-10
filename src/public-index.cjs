'use strict';
const {JSDOM}=require('jsdom');
const compact=s=>String(s??'').normalize('NFKC').replace(/\s+/g,' ').trim();
const same=(a,b)=>compact(a).toLowerCase()===compact(b).toLowerCase();
const BASE='https://bydrug.pharmcube.com';
function parsePublicIndex(html,name){
  const d=new JSDOM(html).window.document;
  const label=d.title.match(/^⌈(.+)⌋/);
  if(!label||!same(label[1],name))throw Error('Public index account title is missing or mismatched');
  const count=d.title.match(/共(\d+)条/),page=d.title.match(/第(\d+)页/),links=[];
  for(const row of d.querySelectorAll('.item-news')){
    const a=row.querySelector('a.news-title[href]'),author=row.querySelector('a[href*="/news/summary/source/"]');
    if(!a||!author||!same(author.textContent,name))throw Error('Public index row account mismatch');
    const u=new URL(a.getAttribute('href'),BASE);
    if(u.origin!==BASE||!/^\/news\/detail\/[a-f0-9]{32}$/.test(u.pathname)||u.username||u.password)throw Error('Invalid public detail URL');
    const title=compact(a.textContent);if(!title)throw Error('Empty public article title');
    links.push({detail_url:u.href,title,account:compact(author.textContent)});
  }
  if(!count||!page)throw Error('Public index pagination metadata missing');
  return {account:compact(label[1]),total:Number(count[1]),page:Number(page[1]),links};
}
function parsePublicDetail(html,name){
  const d=new JSDOM(html).window.document;
  const author=compact(d.querySelector('#source-box .dark-link')?.textContent);
  if(!same(author,name))throw Error('Public detail account mismatch');
  const original=d.querySelector('a.origin_link[href]');if(!original)throw Error('Public detail has no original article URL');
  const u=new URL(original.getAttribute('href'));
  if(u.protocol!=='https:'||u.hostname!=='mp.weixin.qq.com'||u.username||u.password||u.port||u.pathname!=='/s')throw Error('Public detail original URL is not a supported WeChat article');
  const keys=['__biz','mid','idx','sn'];
  if(keys.some(k=>!u.searchParams.get(k)))throw Error('Original article identity is incomplete');
  if(!/^\d+$/.test(u.searchParams.get('mid'))||!/^\d+$/.test(u.searchParams.get('idx'))||!/^[a-f0-9]{32}$/i.test(u.searchParams.get('sn')))throw Error('Original article identity is invalid');
  const clean=new URL('https://mp.weixin.qq.com/s');for(const k of keys)clean.searchParams.set(k,u.searchParams.get(k));
  const title=compact(d.querySelector('.top-container > .title')?.textContent);if(!title)throw Error('Public detail title missing');
  const displayedDate=compact(d.querySelector('.top-container .desc .text')?.textContent);
  return {url:clean.href,title,account:author,biz:u.searchParams.get('__biz'),published_at:/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(displayedDate)?displayedDate:null};
}
module.exports={parsePublicIndex,parsePublicDetail};
