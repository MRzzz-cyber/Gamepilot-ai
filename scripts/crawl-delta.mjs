// Public PZDS Delta Force account listing collector. Zero Brave / LLM calls.
// This is an offline evidence export, NOT proof that any account remains in stock.
import {parsePzdsDeltaListing} from '../worker/public-collector.js';
import {mkdir,writeFile} from 'node:fs/promises';
const maxPages=Math.min(Math.max(Number(process.env.PAGES||5),1),10);
const start=Math.min(Math.max(Number(process.env.START_PAGE||1),1),1000);
const products=new Map(),pages=[],fetchedAt=new Date().toISOString();
let repeated=0,priorFingerprint='';
for(let n=start;n<start+maxPages;n++){
 const url='https://www.pzds.com/goodsList/391/6?currentPage='+n;
 let status=0,rows=[],error=null;
 try{
  const res=await fetch(url,{signal:AbortSignal.timeout(15000),headers:{Accept:'text/html','User-Agent':'GamePilotPublicIndexer/1.0'}});
  status=res.status;
  if(!res.ok){error='HTTP_'+status;break}
  const html=(await res.text()).slice(0,1800000);
  if(/captcha|人机验证|访问验证|Access Denied|Just a moment/i.test(html.slice(0,15000))){error='access_challenge_stop';break}
  rows=parsePzdsDeltaListing(html);
  const fingerprint=rows.map(x=>x.id).sort().join('|');
  if(fingerprint&&fingerprint===priorFingerprint){repeated++;error='repeated_page';}
  priorFingerprint=fingerprint;
  for(const row of rows)products.set(row.id,{...row,observed_at:fetchedAt});
 }catch(e){error=String(e?.name||'fetch_failed')}
 pages.push({page:n,status,parsed:rows.length,total_unique:products.size,error});
 console.log('PAGE',JSON.stringify(pages.at(-1)));
 if(error||rows.length===0)break;
 if(n<start+maxPages-1)await new Promise(r=>setTimeout(r,900));
}
await mkdir('artifacts',{recursive:true});
const summary={source:'pzds.com/goodsList/391/6',game:'三角洲行动',requested_pages:maxPages,start_page:start,visited_pages:pages.length,unique_products:products.size,under_500:[...products.values()].filter(x=>x.price<=500).length,brave_requests:0,llm_requests:0,fetched_at:fetchedAt,pages};
await writeFile('artifacts/delta-force-index.json',JSON.stringify([...products.values()],null,2));
await writeFile('artifacts/delta-force-summary.json',JSON.stringify(summary,null,2));
console.log('DELTA_CRAWL_SUMMARY',JSON.stringify(summary));
if(products.size===0)process.exitCode=1;
