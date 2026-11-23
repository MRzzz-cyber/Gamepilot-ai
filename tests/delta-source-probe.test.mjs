import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';
test('validate real Delta catalogue pages with a 500 yuan limit and no Brave key',async()=>{
 const query='三角洲500元以内的账号';
 const run=async (path,body)=>{
  const req=new Request('https://gamepilot.example'+path,{method:'POST',body:JSON.stringify(body)});
  const res=await worker.fetch(req,{});
  const d=await res.json();
  console.log('DELTA_FIX',JSON.stringify({status:res.status,page:body.page||1,count:d.items?.length,price:d.items?.slice(0,3).map(x=>x.price),ids:d.items?.slice(0,3).map(x=>x.id),listing:d.listing_page,trace:d.trace?.map(t=>[t.tool,t.result]),error:d.error}));
  assert.equal(res.status,200);
  assert.ok(d.items.every(x=>x.price>0&&x.price<=500));
  assert.equal(new Set(d.items.map(x=>x.id)).size,d.items.length);
  return d;
 };
 const a=await run('/api/chat',{message:query});
 assert.ok(a.items.length>=10);
 assert.ok(a.listing_page?.next_page>1);
 assert.equal(a.search_diagnostics.brave.requests,0);
 const b=await run('/api/search',{query,page:a.listing_page.next_page,cursor:a.listing_page.next_cursor});
 const already=new Set(a.items.map(x=>x.id));
 assert.ok(b.items.filter(x=>!already.has(x.id)).length>=5);
 const range=a.trace.find(t=>t.result?.bucket===3)?.result?.page_count;
 if(range>=20){
  const deep=await run('/api/search',{query,page:20,cursor:[{bucket:3,page:20}]});
  assert.ok(deep.items.some(x=>!already.has(x.id)));
 }
});
