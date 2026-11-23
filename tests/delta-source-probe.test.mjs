import test from 'node:test';
import {spawn} from 'node:child_process';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as pause} from 'node:timers/promises';

const source='https://www.pzds.com/goodsList/391/6';
const events=[];
test('observe the public catalogue controls and pagination',async()=>{
 const p=spawn('google-chrome',['--headless','--no-sandbox','--disable-dev-shm-usage','--remote-debugging-port=39221','--user-data-dir='+mkdtempSync(join(tmpdir(),'pzds-chrome-')),'about:blank'],{stdio:'ignore'});
 p.on('error',e=>console.log('CHROME_ERROR',String(e)));
 let ws;
 try{
  let targets;
  for(let tries=0;!targets&&tries<30;tries++){
   try{targets=await (await fetch('http://localhost:39221/json/list')).json();}catch{await pause(200);}
  }
  if(!targets)return;
  ws=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject});
  let id=0;
  const pending=new Map();
  ws.onmessage=ev=>{
   const data=JSON.parse(ev.data);
   if(data.id){pending.get(data.id)?.(data.result);pending.delete(data.id);}
   else if(data.method?.startsWith('Network.'))events.push(data);
  };
  const send=(method,params={})=>new Promise(resolve=>{pending.set(++id,resolve);ws.send(JSON.stringify({id,method,params}));});
  const evaluate=expr=>send('Runtime.evaluate',{expression:expr,returnByValue:true}).then(x=>x?.result?.value??x?.exceptionDetails?.text);
  await send('Page.enable');await send('Network.enable');
  await send('Page.navigate',{url:source});
  await pause(5500);
  const summary=()=>evaluate("({title:document.title,url:location.href,cardCount:document.querySelectorAll('a[href*=\"/goodsDetails/\"]').length,ids:[...document.querySelectorAll('a[href*=\"/goodsDetails/\"]')].slice(0,5).map(x=>x.getAttribute('href')),pages:document.querySelector('.el-pagination')?.innerText,boxes:[...document.querySelectorAll('.item-label')].filter(x=>x.textContent.trim()==='价格').map(x=>x.parentElement.outerHTML.slice(0,2100)),paging:document.body.innerText.match(/.{0,20}共\\s*\\d+\\s*条.{0,20}/g)?.slice(0,4)})");
  console.log('PZ_BROWSER_INITIAL',JSON.stringify(await summary()));
  console.log('PZ_BROWSER_FILTER_ACTION',await evaluate("(()=>{const box=[...document.querySelectorAll('.item-label')].find(x=>x.textContent.trim()==='价格')?.parentElement;const input=box?.querySelectorAll('input')[1];if(!input)return false;input.focus();input.value='500';input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new FocusEvent('blur'));input.dispatchEvent(new Event('change',{bubbles:true}));return {visible:input.getClientRects().length>0,value:input.value,parents:[box.parentElement,box.parentElement.parentElement,box.parentElement.parentElement.parentElement].map(x=>({class:x.className,buttons:[...x.querySelectorAll('button,.confirm-btn')].map(q=>q.innerText.trim()).filter(Boolean).slice(0,8)}))}})()"));
  await pause(4200);
  console.log('PZ_BROWSER_FILTER',JSON.stringify(await summary()));
  console.log('PZ_BROWSER_PAGE_ACTION',await evaluate("(()=>{const btn=document.querySelector('.el-pagination .btn-next');if(btn&&!btn.disabled){btn.click();return 'next_button'} window.scrollTo(0,document.documentElement.scrollHeight);return 'scroll'})()"));
  await pause(3400);
  console.log('PZ_BROWSER_NEXT',JSON.stringify(await summary()));
  const relevance = e=>['XHR','Fetch'].includes(e.params.type)&&e.params.request?.url.includes('pzds.com')&&/goods|search|product/i.test(e.params.request.url);
  for(const e of events.filter(e=>e.method==='Network.requestWillBeSent'&&relevance(e)).slice(0,25)){
   const {request,requestId}=e.params;
   const res=events.find(e=>e.method==='Network.responseReceived'&&e.params.requestId===requestId);
   const body=await send('Network.getResponseBody',{requestId});
   let shape=null;
   try{const j=JSON.parse(body?.body);const d=j.data||j.result||j;shape={keys:Object.keys(d),total:d.total??d.count??d.totalCount??null,page:d.page??null,records:(d.records||d.items||d.list||[]).length,first:Object.fromEntries(Object.entries(d.records?.[0]||{}).filter(([k])=>/^(?:gameId|goodsNo|goodsCatalogueId|goodsTitle|price|status|salePrice|goodsStatus|gameIdName|goodsCatalogueIdName)$/.test(k))),fields:Object.keys(d.records?.[0]||{}).slice(0,37)};}catch{}
   console.log('PZ_CATALOG_REQUEST',JSON.stringify({url:request.url,method:request.method,payload:request.postData?.slice(0,1400),status:res?.params.response.status,shape}));
  }
 }finally{ws?.close();p.kill();}
});

test('inspect the published catalogue request format',async()=>{
 for(const [script,re,tail] of [['e93ac7f.js',/getGoodsList:function|asyncData:function|goodsTotalNum=/g,5500],['b3d2277.js',/validatePriceRange:function/g,2100]]){
  const s=await (await fetch('https://oss.pzds.com/pzdspcssr/202611171833/'+script,{signal:AbortSignal.timeout(9000)})).text();
  for(const x of [...s.matchAll(re)].slice(0,4))console.log('CAT_FORMAT',script,s.slice(Math.max(0,x.index-120),x.index+tail));
 }
});
