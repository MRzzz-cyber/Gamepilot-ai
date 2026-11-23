import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {execFileSync,spawn} from 'node:child_process';
import {mkdtempSync,readFileSync} from 'node:fs';
import {resolve,join,extname} from 'node:path';
import {tmpdir} from 'node:os';
import {setTimeout as pause} from 'node:timers/promises';

const rows=Array.from({length:6},(_,i)=>({
 id:'delta-'+i,game:'三角洲',platform:i%2?'盼之账号':'淘手游',url:'https://www.taoshouyou.com/taoid_80518089.html',
 title:'总资产229M 哈夫币2146W 行动等级60 传说近战数3  三端互通',price:1000-i*35,
 server:'安卓QQ',realname:i===0?false:null,status:'unverified',price_audit:{source:'源站商品列表（非实时）'},
 delta_attributes:{total_assets:'229M',hafcoins:'2146W',operation_level:'60',melee_count:'3'}
}));
test('render compact Delta cards on desktop and mobile',async()=>{
 execFileSync('npm',['run','build'],{stdio:'ignore'});
 const dist=resolve('dist');
 const server=createServer((req,res)=>{
  const path=new URL(req.url,'http://localhost').pathname;
  if(path.startsWith('/api/')){
   res.setHeader('Content-Type','application/json');
   const payload=path==='/api/chat'?{items:rows,answer:'找到六条商品',status:'results',requirements:{game:'三角洲',max_price:1000},listing_page:{sort:'price_desc',page:1,query:'三角洲1000元以内',source:'淘手游'},coverage:{platforms:[],totals:{discovered:6}}}:path==='/api/verify-lead'?{game_match:true,price:999,budget_match:true,reason:'公开详情页',attributes:{server:'安卓QQ'}}:{ok:true};
   res.end(JSON.stringify(payload));return;
  }
  const file=path==='/'?join(dist,'index.html'):resolve(dist,'.'+path);
  if(!file.startsWith(dist+'/')){res.statusCode=404;res.end();return;}
  try{
   res.setHeader('Content-Type',{'.html':'text/html','.js':'text/javascript','.css':'text/css'}[extname(file)]||'application/octet-stream');
   res.end(readFileSync(file));
  }catch{res.statusCode=404;res.end();}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const tmp=mkdtempSync(join(tmpdir(),'delta-layout-'));
 const child=spawn('google-chrome',['--headless','--no-sandbox','--disable-dev-shm-usage','--remote-debugging-port=0','--user-data-dir='+tmp,'about:blank'],{stdio:'ignore'});
 let ws;
 try{
  let target;
  for(let n=0;n<70&&!target;n++){
   try{
    const port=readFileSync(join(tmp,'DevToolsActivePort'),'utf8').split('\n')[0];
    target=(await (await fetch('http://127.0.0.1:'+port+'/json/list')).json()).find(x=>x.type==='page');
   }catch{await pause(200);}
  }
  assert.ok(target);
  ws=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
  let id=0;
  const callbacks=new Map();
  ws.onmessage=e=>{const x=JSON.parse(e.data);if(x.id){callbacks.get(x.id)?.(x.result);callbacks.delete(x.id);}};
  const send=(method,params={})=>new Promise(resolve=>{callbacks.set(++id,resolve);ws.send(JSON.stringify({id,method,params}));});
  const evalPage=async expression=>(await send('Runtime.evaluate',{expression,returnByValue:true}))?.result?.value;
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/'});
  for(let n=0;n<30&&!await evalPage("!!document.querySelector('.suggestions button')");n++)await pause(180);
  await evalPage("document.querySelector('.suggestions button').click()");
  for(let n=0;n<30&&!await evalPage("!!document.querySelector('.deltaProductCard')");n++)await pause(180);
  const getLayout=()=>evalPage("(()=>{const grid=document.querySelector('.deltaCards');const c=grid?.firstElementChild;const r=c?.getBoundingClientRect();return {cards:grid?.children.length,columns:grid&&getComputedStyle(grid).gridTemplateColumns.split(' ').length,width:r?.width,height:r?.height,detailsOpen:document.querySelector('.deltaDiagnostics')?.open,overflow:c?.scrollWidth>c?.clientWidth,text:c?.innerText}})()");
  const desktop=await getLayout();
  assert.equal(desktop.cards,6);
  assert.ok(desktop.columns>=2&&desktop.height<360&&!desktop.overflow);
  assert.equal(desktop.detailsOpen,false);
  assert.match(desktop.text,/229M/);
  await evalPage("document.querySelector('.deltaVerify').click()");
  for(let n=0;n<20&&!await evalPage("!!document.querySelector('.deltaDetail')");n++)await pause(100);
  assert.match(await evalPage("document.querySelector('.deltaDetail')?.innerText"),/999/);
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});
  await pause(300);
  const mobile=await getLayout();
  assert.equal(mobile.columns,1);
  assert.ok(mobile.width<=390&&!mobile.overflow);
  console.log('DELTA_LAYOUT',JSON.stringify({desktop:{columns:desktop.columns,height:desktop.height},mobile:{columns:mobile.columns,width:mobile.width},fields:true,details:true}));
 }finally{ws?.close();child.kill();server.close();}
});
