import test from 'node:test';
const origin='https://www.pzds.com', category=origin+'/goodsList/391/6';
const get=async url=>(await fetch(url,{signal:AbortSignal.timeout(9000)})).text();
const context=(s,re,l=180,r=290,n=15)=>[...s.matchAll(re)].slice(0,n).map(m=>s.slice(Math.max(0,m.index-l),m.index+r).replace(/\s+/g,' '));
test('identify public list options and check representative SSR pages',async()=>{
 const h=await get(category);
 const assets=[...h.matchAll(/<script\b[^>]*\bsrc="(https:\/\/oss\.pzds\.com\/pzdspcssr\/[^"]+\.js)"/g)].map(m=>m[1]);
 const urls=assets.filter(a=>/\/(?:e93ac7f|c38a10e|b3d2277|258842e)\.js$/.test(a));
 await Promise.all(urls.map(async u=>{
  const s=await get(u);
  const hints=context(s,/goodsTotalNum=|\.getGoodsList\b|\.goodsPublicPage\b|goodsPublic\/page|\.searchGoods\b|formatParams\)|\.queryData|currentPage|\.pageSize=|\.search\)\(/g,260,460,45);
  const f=context(s,/maxPrice|minPrice|价格筛选|placeholder:"最高值"|\.emit\("search"|\.query[,.)]/g,100,200,28);
  for(const item of [...hints,...f])console.log('CATALOGUE_BUNDLE',u.split('/').pop(),item);
 }));
 console.log('CATALOGUE_HTML',JSON.stringify(context(h,/(?:更多筛选|确认筛选|应用筛选|清空筛选|确认搜索|确定筛选|class="[^"]*(?:filter-btn|search-btn|reset-btn|more-filter)[^"]*")/g,100,250,24)));
 for(const [page,extra] of [[1,'&minPrice=1'],[2,'&minPrice=1'],[101,'&minPrice=1'],[130,'&minPrice=1'],[101,''],[1000,'']]){
  const s=await get(category+'?currentPage='+page+'&maxPrice=500'+extra);
  console.log('CATALOGUE_CHECK',JSON.stringify({page,extra,prices:[...s.matchAll(/class="newGoodsList_box_pir"[^>]*>¥\s+([\d.]+)/g)].map(x=>Number(x[1])),ids:[...s.matchAll(/href="\/goodsDetails\/([^/]+)/g)].map(x=>x[1]).slice(0,10)}));
 }
});
