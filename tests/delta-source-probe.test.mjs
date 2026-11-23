import test from 'node:test';
const base='https://www.taoshouyou.com/game/sanjiaozhouxingdong-36881-0-0';
const get=async url=>{const r=await fetch(url,{signal:AbortSignal.timeout(10000),headers:{Accept:'text/html'}});return {status:r.status,url:r.url,h:await r.text()};};
const around=(h,k,l=120,r=550)=>{const i=h.indexOf(k);return i<0?'':h.slice(Math.max(0,i-l),i+r).replace(/\s+/g,' ');};
const display=(label,s)=>{
 const nav=[...s.h.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>\s*(下一页|末页|尾页|首页|\d+)\s*<\/a>/g)].slice(-14).map(m=>[m[2],m[1]]);
 const ids=[...new Set([...s.h.matchAll(/href="\/taoid_(\d+)\.html"/g)].map(m=>m[1]))];
 const priceFilter=(s.h.match(/<div class="[^"]*price-area[^"]*">([\s\S]{0,9000}?)(?=<div class="item flex">)/)||[])[1];
 console.log('TAO_PAGING',JSON.stringify({label,status:s.status,url:s.url,nav,ids:ids.slice(0,20),totalPages:around(s.h,'总共',80,130),cards:around(s.h,'href="/taoid_',450,2200),price:around(s.h,'acc-price',100,250),priceFilter:priceFilter?.slice(0,4200),seo:around(s.h,'235?',150,250)}));
 return nav;
};
test('validate Tao marketplace card, budget filter and true page controls',async()=>{
 const first=await get(base);
 const nav=display('first',first);
 const links=[...first.h.matchAll(/data-href="([^"]+)"[^>]*>\s*(0-50元|50-100元|100-500元)\s*<\/div>/g)].map(m=>[m[2],m[1]]);
 console.log('TAO_FILTERS',JSON.stringify(links));
 const next=nav.find(x=>x[0]==='下一页');
 for(const [label,href] of [...links,...(next?[next]:[])])display(label,await get(new URL(href,base).href));
});
