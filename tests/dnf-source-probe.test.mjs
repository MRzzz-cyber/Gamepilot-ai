import {test} from 'node:test';
const start='https://www.pzds.com/goodsList/13/6';
const clean=s=>s.replace(/\s+/g,' ').trim();
const around=(s,key,left=100,right=350)=>{const p=s.indexOf(key);return p<0?'':clean(s.slice(Math.max(0,p-left),p+right))};
const urls=[start,start+'?currentPage=2',start+'?page=2','https://www.sanlewang.com/dnf','https://shua688.com/dnf/index/index.html','https://www.dd373.com/s-rbg22w-br53m0-0-0-0-0-7rrfjk%7C2pps7x-0-2-0-0-0-1-0-0-0.html'];
test('inspect official DNF desktop marketplace listings and public pagination',async()=>{
 for(let i=0;i<urls.length;i+=3)await Promise.all(urls.slice(i,i+3).map(async u=>{
  try{
   const r=await fetch(u,{headers:{Accept:'text/html'},signal:AbortSignal.timeout(11000)});
   const h=await r.text();
   const anchors=[...h.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi)].map(m=>m[1].trim());
   const product=[...new Set(anchors.filter(x=>/goodsDetails|\/account\/|\/goods\/|detail|\/item|\/dnf\/[^/]+\/\w/i.test(x)))].slice(0,42);
   const prices=[...h.matchAll(/[¥￥]\s*(?:<[^>]+>\s*){0,2}(\d[\d,]*(?:\.\d{1,2})?)/g)].map(m=>Number(m[1].replaceAll(',','')));
   console.log('DNF_SOURCE',JSON.stringify({u,status:r.status,final:r.url,title:h.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1],len:h.length,priceCount:prices.length,under:prices.filter(x=>x>0&&x<=1000).length,price:prices.slice(0,25),product,firstProduct:product[0]?around(h,product[0],120,850):null,paging:around(h,'下一页',220,650),priceFilter:around(h,'500-999',320,550),firstPrice:around(h,'¥',200,380),root:h.slice(0,160),scripts:[...h.matchAll(/<script\b[^>]*src=["']([^"']+)/gi)].map(x=>x[1]).slice(-14)}));
   if(u.includes('shua688.com')){
    console.log('SHUA_MARKUP',JSON.stringify({details:anchors.filter(x=>/\/dnf\//.test(x)).slice(0,15),pages:anchors.filter(x=>/page|index_\d|index\/.*index/i.test(x)).slice(-20),price:[...h.matchAll(/[￥¥]\s*\d/g)].slice(0,3).map(m=>clean(h.slice(m.index-620,m.index+350)))}));
   }
   if(u.includes('sanlewang')){
    console.log('SANLE_MARKUP',JSON.stringify({links:anchors.filter(x=>!x.startsWith('javascript')&&/\/dnf\//.test(x)).slice(0,22),data:around(h,'500-999',1100,1400),price:[...h.matchAll(/(?:[￥¥]|543\.2)\s*\d*/g)].slice(0,2).map(m=>clean(h.slice(m.index-380,m.index+220))),api:[...h.matchAll(/.{0,30}(?:getGoodsList|productList|searchList|\/api\/|pageIndex).{0,45}/gi)].slice(0,25).map(x=>x[0])}));
   }
  }catch(e){console.log('DNF_SOURCE',JSON.stringify({u,error:String(e.cause||e)}));}
 }));
});
