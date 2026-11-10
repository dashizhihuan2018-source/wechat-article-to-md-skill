'use strict';
const SEARCH_ENDPOINT='https://api.dataxapi.com/v1/wechat/accounts/search';
const validId=id=>typeof id==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(id);
const normalized=name=>name.normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase();
function providerKey(runtime={}) {
  const key=runtime.key??process.env.DATAXAPI_API_KEY;
  if(typeof key!=='string'||!key.trim()||/[\r\n]/.test(key))throw Error('Set DATAXAPI_API_KEY in the local environment; no request sent');
  return key;
}
async function request(url,runtime={}) {
  const key=providerKey(runtime);let response;
  try{response=await(runtime.fetch??fetch)(url,{headers:{Authorization:'Bearer '+key,Accept:'application/json','X-Max-Price':'0.0200'},redirect:'error',signal:AbortSignal.timeout(120000)});}catch{throw Error('Provider network request failed; stopped without retry');}
  if(!response.ok)throw Error('Provider HTTP '+response.status+'; stopped without retry');
  let body;try{body=await response.json();}catch{throw Error('Provider did not return JSON');}
  if(body.code!=='ok')throw Error('Provider returned a business error; inspect provider dashboard');
  if(!Array.isArray(body.data?.items)||typeof body.page?.has_more!=='boolean')throw Error('Unsupported provider response schema');
  return body;
}
async function searchAccounts(name,runtime={},onPage=()=>{},options={}) {
  if(typeof name!=='string'||!name.trim()||name.length>200)throw Error('Provide a nonempty account name of at most 200 characters');
  providerKey(runtime);
  const budget=options.pages==='all'?Infinity:Number(options.pages??3);
  if(budget!==Infinity&&(!Number.isSafeInteger(budget)||budget<1))throw Error('Search pages must be a positive integer or all');
  const accounts=new Map(),seen=new Set();let cursor=null,pages=0;
  for(;;){
    if(pages)await(runtime.sleep??(ms=>new Promise(r=>setTimeout(r,ms))))(60000);
    const url=new URL(SEARCH_ENDPOINT);url.searchParams.set('query',name.trim());if(cursor)url.searchParams.set('cursor',cursor);
    const body=await request(url,runtime);pages++;
    for(const item of body.data.items){
      if(!validId(item.id)||typeof item.name!=='string')throw Error('Invalid account search result');
      const account={id:item.id,name:item.name,username:typeof item.username==='string'?item.username:null,bio:typeof item.bio==='string'?item.bio:null};
      const previous=accounts.get(item.id);
      if(previous&&(normalized(previous.name)!==normalized(account.name)||previous.username!==account.username))throw Error('Account identity changed during search');
      accounts.set(item.id,account);
    }
    onPage({pages,accounts:[...accounts.values()],next_cursor:body.page.next_cursor??null});
    if(!body.page.has_more)break;
    const next=body.page.next_cursor;if(typeof next!=='string'||!next||seen.has(next))throw Error('Missing or repeated account-search cursor');
    if(pages>=budget)return {pages,accounts:[...accounts.values()],matches:[...accounts.values()].filter(x=>normalized(x.name)===normalized(name)),selected:null,status:'search_budget_reached',next_cursor:next};
    cursor=next;seen.add(next);
  }
  const matches=[...accounts.values()].filter(x=>normalized(x.name)===normalized(name));
  return {pages,accounts:[...accounts.values()],matches,selected:matches.length===1?matches[0]:null,status:matches.length===1?'resolved':matches.length?'ambiguous':'not_found'};
}
module.exports={SEARCH_ENDPOINT,validId,normalized,providerKey,request,searchAccounts};
