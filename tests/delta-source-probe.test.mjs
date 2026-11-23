import test from 'node:test';

const origin='https://www.pzds.com', route='/goodsList/391/6';
const fetchText=async path=>{
 const u=new URL(path,origin);
 const r=await fetch(u,{signal:AbortSignal.timeout(10000),headers:{Accept:'text/html,*/*'}});
 return {status:r.status,text:await r.text()};
};
const fragments=(s,re,left=90,right=130,cap=10)=>[...s.matchAll(re)].slice(0,cap).map(m=>s.slice(Math.max(0,m.index-left),m.index+right).replace(/\s+/g,' '));
test('probe PZDS published catalogue filter and pagination code',async()=>{
 const first=await fetchText(route);
 const scripts=[...new Set([...first.text.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+\.js(?:\?[^"']*)?)["']/gi)].map(m=>new URL(m[1],origin).href))];
 console.log('PZ_SCRIPTS',JSON.stringify(scripts));
 const paths=[...new Set(scripts.filter(p=>{const host=new URL(p).hostname;return host==='pzds.com'||host.endsWith('.pzds.com')}))];
 for(let i=0;i<paths.length;i+=4){
  await Promise.all(paths.slice(i,i+4).map(async p=>{
   try{
    const {text:s}=await fetchText(p);
    const hints=fragments(s,/\b(?:goodsTotalNum|goodsSearchActions|filterSearchPropertyIds|filterSearchRecord|currentPage)\b|(?:\bquery|\broute)\.(?:page|maxPrice|startPrice|endPrice)|\b(?:maxPrice|minPrice|priceMax|startPrice|endPrice)\s*[:=]/g,100,120,38);
    if(hints.length)console.log('PZ_BUNDLE',JSON.stringify({p,len:s.length,hints}));
   }catch(e){console.log('PZ_BUNDLE_ERROR',JSON.stringify({p,error:String(e.cause||e)}));}
  }));
 }
 for(const params of ['','?currentPage=100','?currentPage=2&maxPrice=500','?page=2&maxPrice=500','?currentPage=2&minPrice=0&maxPrice=500']){
  const r=await fetchText(route+params);
  const n=r.text.match(/window\.__NUXT__=([\s\S]*?)<\/script>/)?.[1]||'';
  const prices=fragments(r.text,/class="newGoodsList_box_pir"/g,0,75,12);
  console.log('PZ_PAGE',JSON.stringify({params,status:r.status,prices,ids:[...r.text.matchAll(/href="\/goodsDetails\/([^/]+)/g)].map(m=>m[1]).slice(0,10),header:fragments(n,/data:\[\{searchWords:/g,0,350,1)[0],args:n.match(/\}\((.{0,700})/)?.[1],nav:fragments(r.text,/class="[^"]*(?:pagination|pager|btn-next|no-data|empty)[^"]*"/gi,0,135,10)}));
 }
});
