#!/usr/bin/env node
'use strict';
// 「要求」归一化：把 --days / --since / --until 这类时间要求转成可审计的日期区间。
// 微信 published_at 形如 "2026-11-09 07:30"（账号展示时区），故只比较前 10 位日期，
// 不做本地时区换算，避免同一篇在不同机器上落入不同窗口。
const DATE_ONLY=/^(\d{4})-(\d{2})-(\d{2})$/;

function isoDate(value,label){
  const text=typeof value==='string'?value.trim():'';
  const match=DATE_ONLY.exec(text);
  if(!match)throw Error(label+' must be YYYY-MM-DD (for example 2026-11-01)');
  const [y,m,d]=[Number(match[1]),Number(match[2]),Number(match[3])];
  const probe=new Date(Date.UTC(y,m-1,d));
  if(probe.getUTCFullYear()!==y||probe.getUTCMonth()!==m-1||probe.getUTCDate()!==d)throw Error(label+' is not a real calendar date: '+text);
  return text;
}
function shiftDays(date,delta){
  const [y,m,d]=date.split('-').map(Number);
  return new Date(Date.UTC(y,m-1,d+delta)).toISOString().slice(0,10);
}
function present(value){return value!==undefined&&value!==null&&value!=='';}
// now 可为函数或毫秒数；窗口依赖运行日期，故在结果里保留 computed_at 供复核。
function parseDateWindow(options={},now=Date.now){
  const requested={};
  for(const key of ['since','until','days'])if(present(options[key]))requested[key]=String(options[key]).trim();
  if(!Object.keys(requested).length)return null;
  const stamp=new Date(typeof now==='function'?now():now).toISOString();
  const today=stamp.slice(0,10);
  if(present(requested.days)){
    if(present(requested.since)||present(requested.until))throw Error('--days cannot be combined with --since or --until');
    const days=Number(requested.days);
    if(!/^\d+$/.test(requested.days)||!Number.isSafeInteger(days)||days<1||days>3650)throw Error('--days must be an integer between 1 and 3650');
    const since=shiftDays(today,-(days-1));
    return Object.freeze({requested:{days},since,until:today,days,computed_at:stamp,label:'近 '+days+' 天（'+since+' 至 '+today+'，含今天）'});
  }
  const until=present(requested.until)?isoDate(requested.until,'--until'):today;
  const since=present(requested.since)?isoDate(requested.since,'--since'):until;
  if(since>until)throw Error('--since must not be later than --until ('+since+' > '+until+')');
  const days=Math.round((Date.parse(until+'T00:00:00Z')-Date.parse(since+'T00:00:00Z'))/86400000)+1;
  return Object.freeze({requested:{...(present(requested.since)?{since}:{}),...(present(requested.until)?{until}:{}),since_explicit:present(requested.since),until_explicit:present(requested.until)},since,until,days,computed_at:stamp,label:since+' 至 '+until+'（'+days+' 天）'});
}
function dateOf(publishedAt){
  return typeof publishedAt==='string'&&/^\d{4}-\d{2}-\d{2}/.test(publishedAt)?publishedAt.slice(0,10):null;
}
// undated:'exclude' 用于归档（发现阶段已由原文详情页核对日期，窗口必须是闭合范围）；
// undated:'attempt' 用于批处理（下载后再从正文核对，逐篇标注，避免静默丢链接）。
function applyDateWindow(links,window,{undated='exclude'}={}){
  if(!window)return {links,filter:null};
  if(!['exclude','attempt'].includes(undated))throw Error("undated policy must be 'exclude' or 'attempt'");
  const kept=[],before=[],after=[],unknown=[];
  for(const link of links){
    const date=dateOf(link.published_at);
    if(date===null)unknown.push(link);
    else if(date<window.since)before.push(link);
    else if(date>window.until)after.push(link);
    else kept.push(link);
  }
  const attempted=undated==='attempt'?kept.concat(unknown):kept;
  return {links:attempted,filter:{requested:window.requested,since:window.since,until:window.until,computed_at:window.computed_at,undated_policy:undated,counts:{input:links.length,kept:kept.length,before:before.length,after:after.length,undated:unknown.length,selected:attempted.length},undated_urls:unknown.slice(0,20).map(x=>x.url)}};
}
module.exports={parseDateWindow,applyDateWindow,dateOf,isoDate,shiftDays};
