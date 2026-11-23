import test from 'node:test';
import worker from '../worker/index.js';
const base='https://gamepilot-ai.zqsanjingshou.workers.dev';
test('inspect the 1000 yuan search and the upper price tier',async()=>{
 const query='三角洲1000元以内的账号';
 const run=async body=>{
  const response=await worker.fetch(new Request(base+'/api/search',{method:'POST',body:JSON.stringify({query,disable_brave:true,...body})}),{});
  const d=await response.json();
  console.log('DELTA_1000_SOURCE',JSON.stringify({body,status:response.status,total:d.items?.length,near:d.items?.filter(x=>x.price>=700).length,top:d.items?.slice(0,5).map(x=>[x.price,x.title,x.url]),trace:d.trace?.map(t=>[t.result?.bucket,t.result?.page,t.result?.status,t.result?.page_count,t.result?.detail_pages])}));
 };
 const [online]=await Promise.allSettled([fetch(base+'/api/search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query,disable_brave:true}),signal:AbortSignal.timeout(35000)}),run({page:2,cursor:[{bucket:4,page:1}]}),run({page:3,cursor:[{bucket:4,page:2}]}),run({page:4,cursor:[{bucket:4,page:3}]})]);
 if(online.status==='fulfilled'){
  const d=await online.value.json();
  console.log('DELTA_1000_BASELINE',JSON.stringify({status:online.value.status,total:d.items?.length,near:d.items?.filter(x=>x.price>=700).length,top:d.items?.slice(0,4).map(x=>[x.price,x.title]),trace:d.trace?.map(t=>[t.result?.bucket,t.result?.page,t.result?.status,t.result?.page_count])}));
 }
});
