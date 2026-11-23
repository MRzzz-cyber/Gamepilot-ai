import {test} from 'node:test';
const targets=['https://www.sanlewang.com/dnf','https://shua688.com/dnf/goods/index.html'];
function around(s,idx,l=120,r=320){return s.slice(Math.max(0,idx-l),idx+r).replace(/\s+/g,' ');}
test('inspect marketplace list request handlers and HTML price filters',async()=>{
 for(const u of targets){
  const h=await (await fetch(u,{signal:AbortSignal.timeout(10000)})).text();
  const hits=Array.from(h.matchAll(/\bbstbconfig\b|queryParams|search-url|searchUrl|goodsList|data-main|controllername|ajax\b|price_(?:min|max)|(?:name=["']max_price)|\breturnUrl\b/gi));
  for(const m of hits.slice(0,28))console.log('DNF_CONTRACT',new URL(u).hostname,m[0],around(h,m.index));
  for(const m of [...h.matchAll(/\b(?:url|href|data-main)\s*[:=]\s*["']([^"']+)["']/gi)].filter(m=>/goods|search|list|ajax|require-frontend|dnf.*get/i.test(m[1])).slice(-30))console.log('DNF_URL',new URL(u).hostname,m[1]);
  if(u.includes('shua688')){
   for(const params of ['?max_price=1000','?max_price=1000&sort=price_desc&page=2']){
    const r=await fetch(u+params,{signal:AbortSignal.timeout(8000),headers:{Accept:'application/json','X-Requested-With':'XMLHttpRequest'}});
    const s=await r.text();let data=null;try{data=JSON.parse(s)}catch{}
    console.log('SHUA_WEB_LIST',JSON.stringify({params,status:r.status,ctype:r.headers.get('content-type'),size:s.length,goods:[...new Set([...s.matchAll(/\/dnf\/goods\/detail\/id\/(\d+)\.html/g)].map(x=>x[1]))].slice(0,5),head:data?Object.keys(data):null,total:data?.total??data?.data?.total,best:data?.rows?.[0]?Object.keys(data.rows[0]):null}));
   }
  }
 }
});
import {spawn} from 'node:child_process';
import {mkdtempSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {setTimeout as pause} from 'node:timers/promises';
test('observe the public DNF price filter and returned rows in Chrome',async()=>{
 const tmp=mkdtempSync(join(tmpdir(),'dnf-source-chrome-'));
 const p=spawn('google-chrome',['--headless','--no-sandbox','--disable-dev-shm-usage','--remote-debugging-port=0','--user-data-dir='+tmp,'about:blank'],{stdio:'ignore'});
 let ws;
 try{
  let target;
  for(let tries=0;!target&&tries<60;tries++){
   try{const port=readFileSync(join(tmp,'DevToolsActivePort'),'utf8').split('\n')[0];target=(await (await fetch('http://127.0.0.1:'+port+'/json/list')).json()).find(t=>t.type==='page');}catch{await pause(200);}
  }
  if(!target)return;
  ws=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
  let id=0;const pending=new Map(),events=[];
  ws.onmessage=ev=>{const x=JSON.parse(ev.data);if(x.id){pending.get(x.id)?.(x.result);pending.delete(x.id);}else if(x.method?.startsWith('Network.'))events.push(x);};
  const send=(method,params={})=>new Promise(resolve=>{pending.set(++id,resolve);ws.send(JSON.stringify({id,method,params}));});
  await send('Page.enable');await send('Network.enable');
  for(const url of targets){
   events.length=0;
   await send('Page.navigate',{url});await pause(4500);
   await send('Runtime.evaluate',{expression:url.includes('sanlewang')?
    "document.querySelector('#prices a[data-value=\"500-999\"]')?.click()":
    "(()=>{const x=document.querySelector('#f-max-price');if(x)x.value='1000';document.querySelector('#filter-form button[type=\"submit\"]')?.click()})()"});
   await pause(2600);
   for(const e of events.filter(x=>x.method==='Network.requestWillBeSent'&&['XHR','Fetch'].includes(x.params.type)).slice(0,18)){
    const {request,requestId}=e.params;
    if(new URL(request.url).hostname!==new URL(url).hostname)continue;
    const response=events.find(x=>x.method==='Network.responseReceived'&&x.params.requestId===requestId);
    if(!response)continue;
    const raw=await send('Network.getResponseBody',{requestId});
    let shape;try{const j=JSON.parse(raw?.body);const d=j.data||j.result||j;const rows=Array.isArray(d)?d:d.rows||d.list||d.records||[];shape={keys:Object.keys(j).slice(0,12),members:Object.keys(d).slice(0,12),total:d.total??d.count??j.total,rows:rows.length,first:rows[0]&&Object.fromEntries(Object.entries(rows[0]).filter(([k])=>/^(?:id|goodsid|name|title|showprice|price|servername|crossname|role|gamename|gameid|goodsno|status|stock|goodscode)$/i.test(k))),fields:Object.keys(rows[0]||{}).slice(0,38)};}catch{}
    console.log('DNF_PUBLIC_REQUEST',JSON.stringify({url:request.url,method:request.method,payload:request.postData?.slice(0,1800),status:response?.params.response.status,shape}));
   }
  }
 }finally{ws?.close();p.kill();}
});
