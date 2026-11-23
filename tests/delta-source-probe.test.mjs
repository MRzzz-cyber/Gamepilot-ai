import test from 'node:test';

const origin='https://www.pzds.com', route='/goodsList/391/6';
const fetchText=async path=>{
 const r=await fetch(new URL(path,origin),{signal:AbortSignal.timeout(10000),headers:{Accept:'text/html,*/*'}});
 return {status:r.status,text:await r.text()};
};
const fragments=(s,re,left=90,right=130,cap=10)=>[...s.matchAll(re)].slice(0,cap).map(m=>s.slice(Math.max(0,m.index-left),m.index+right).replace(/\s+/g,' '));
test('probe public PZDS budget and page metadata',async()=>{
 const first=await fetchText(route);
 const nuxt=first.text.match(/window\.__NUXT__=([\s\S]*?)<\/script>/)?.[1]||'';
 console.log('PZ_STATE',JSON.stringify({keys:[...new Set([...nuxt.matchAll(/\b(\w*(?:Price|otal|Page|ount|sort|Filter)\w*):/g)].map(x=>x[1]))].slice(0,100),hints:fragments(nuxt,/\b(?:total|totalCount|currentPage|pageSize|maxPrice|goodsList|sellingPrice|queryGoodsList):/g,40,120,35),nav:fragments(first.text,/(?:pagination|最高价|最低价|价格|下一页|分页|btn-next)/gi,50,110,30)}));
 const assets=[...new Set([...first.text.matchAll(/(?:src|href)="([^"]+\/_nuxt\/[^"]+\.js|\/_nuxt\/[^"]+\.js)"/g)].map(m=>m[1]))].filter(x=>new URL(x,origin).hostname==='www.pzds.com');
 for(let i=0;i<assets.length;i+=4){
  await Promise.all(assets.slice(i,i+4).map(async p=>{
   try{
    const {text:s}=await fetchText(p);
    const hints=fragments(s,/\b(?:currentPage|startPrice|endPrice|maxPrice|minPrice|priceMax|highPrice|lowestPrice|highestPrice|goodsPriceMin|goodsPriceMax|priceRange)\s*[:=]|(?:\bquery|\broute)\.(?:currentPage|maxPrice|startPrice|endPrice)|newGoodsList/g,65,95,30);
    if(hints.length)console.log('PZ_ASSET',JSON.stringify({p,len:s.length,hints}));
   }catch(e){console.log('PZ_ASSET_ERROR',JSON.stringify({p,error:String(e.cause||e)}));}
  }));
 }
});
