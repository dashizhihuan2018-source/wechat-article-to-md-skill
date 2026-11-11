'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {parseDateWindow,applyDateWindow,dateOf,shiftDays}=require('../scripts/date-window.cjs');
const NOW=Date.parse('2026-11-11T02:00:00Z');

test('no requirement means no window and no filtering',()=>{
  assert.equal(parseDateWindow({},()=>NOW),null);
  const links=[{url:'u1'},{url:'u2',published_at:'2020-01-01 08:00'}];
  const result=applyDateWindow(links,null);
  assert.equal(result.filter,null);assert.equal(result.links.length,2);
});
test('--days counts today as the last day, matching how editors say 近十日',()=>{
  const w=parseDateWindow({days:'10'},()=>NOW);
  assert.equal(w.since,'2026-11-02');assert.equal(w.until,'2026-11-11');assert.equal(w.days,10);
  assert.equal(w.computed_at,'2026-11-11T02:00:00.000Z');
  assert.match(w.label,/近 10 天/);
  assert.equal(parseDateWindow({days:'1'},()=>NOW).since,'2026-11-11');
});
test('--since defaults --until to the run date and both ends are inclusive',()=>{
  const w=parseDateWindow({since:'2026-10-31'},()=>NOW);
  assert.equal(w.until,'2026-11-11');
  const links=[
    {url:'before',published_at:'2026-10-30 23:59'},
    {url:'first',published_at:'2026-10-31 00:01'},
    {url:'last',published_at:'2026-11-11 23:59'},
    {url:'after',published_at:'2026-11-12 00:01'},
  ];
  const r=applyDateWindow(links,w);
  assert.deepEqual(r.links.map(x=>x.url),['first','last']);
  assert.deepEqual(r.filter.counts,{input:4,kept:2,before:1,after:1,undated:0,selected:2});
  assert.equal(r.filter.since,'2026-10-31');assert.equal(r.filter.until,'2026-11-11');
});
test('undated links are excluded from archives but retained as an auditable list',()=>{
  const w=parseDateWindow({days:'10'},()=>NOW);
  const links=[{url:'dated',published_at:'2026-11-05 09:00'},{url:'undated'}];
  const archived=applyDateWindow(links,w);
  assert.deepEqual(archived.links.map(x=>x.url),['dated']);
  assert.deepEqual(archived.filter.undated_urls,['undated']);
  assert.equal(archived.filter.undated_policy,'exclude');
  const attempted=applyDateWindow(links,w,{undated:'attempt'});
  assert.deepEqual(attempted.links.map(x=>x.url),['dated','undated']);
  assert.equal(attempted.filter.counts.undated,1);assert.equal(attempted.filter.counts.kept,1);
});
test('impossible or contradictory requirements fail before any request',()=>{
  assert.throws(()=>parseDateWindow({days:'10',since:'2026-11-01'},()=>NOW),/cannot be combined/);
  assert.throws(()=>parseDateWindow({since:'2026-11-05',until:'2026-11-01'},()=>NOW),/must not be later/);
  assert.throws(()=>parseDateWindow({days:'0'},()=>NOW),/between 1 and 3650/);
  assert.throws(()=>parseDateWindow({days:'10天'},()=>NOW),/between 1 and 3650/);
  assert.throws(()=>parseDateWindow({since:'2026-02-30'},()=>NOW),/not a real calendar date/);
  assert.throws(()=>parseDateWindow({since:'20261101'},()=>NOW),/must be YYYY-MM-DD/);
  const explicit=parseDateWindow({since:'2026-11-01',until:'2026-11-03'},()=>NOW);
  assert.equal(explicit.days,3);assert.equal(explicit.label,'2026-11-01 至 2026-11-03（3 天）');
  assert.deepEqual(explicit.requested,{since:'2026-11-01',until:'2026-11-03',since_explicit:true,until_explicit:true});
});
test('date helpers keep the ISO prefix used by WeChat frontmatter',()=>{
  assert.equal(dateOf('2026-11-09 07:30'),'2026-11-09');
  assert.equal(dateOf('2026-11-09'),'2026-11-09');
  assert.equal(dateOf('2026/11/09'),null);assert.equal(dateOf(undefined),null);assert.equal(dateOf(20261109),null);
  assert.equal(shiftDays('2026-03-01',-1),'2026-02-28');assert.equal(shiftDays('2026-12-31',1),'2027-01-01');
});
