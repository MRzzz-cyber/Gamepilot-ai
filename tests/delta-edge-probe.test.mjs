import test from 'node:test';
const base='https://gamepilot-ai.zqsanjingshou.workers.dev';
test('diagnose source differences on deployed Workers',async()=>{
 const health=await fetch(base+'/api/health',{signal:AbortSignal.timeout(11000)});
 console.log('DELTA_EDGE_HEALTH',health.status,await health.text());
 for(const [path,body] of [['/api/search',{query:'三角洲500元以内的账号',disable_brave:true}],['/api/chat',{message:'三角洲500元以内的账号'}]]){
  const r=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(35000)});
  const x=await r.json();
  console.log('DELTA_EDGE',JSON.stringify({path,status:r.status,items:x.items?.length,listing:x.listing_page,trace:x.trace?.map(({tool,result})=>({tool,result})),error:x.error}));
  if(x.listing_page)break;
 }
});
