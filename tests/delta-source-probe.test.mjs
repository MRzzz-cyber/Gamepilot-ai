import test from 'node:test';

const origin = 'https://gamepilot-ai.zqsanjingshou.workers.dev';
const dd = 'https://www.dd373.com/s-gp1gaj-f4wdcm-0-0-0-0-0-0-0-0-0-0-';
const pz = 'https://www.pzds.com/goodsList/391/6';
const brief = html => html.replace(/\s+/g,' ').slice(0,400);
const windowAround = (html,re,pre=170,post=280) => {
 const m=re.exec(html);
 return m ? html.slice(Math.max(0,m.index-pre),m.index+post).replace(/\s+/g,' ') : '';
};
const inspect = async (url) => {
 try{
 const response=await fetch(url,{signal:AbortSignal.timeout(14000),headers:{Accept:'text/html'}});
 const h=await response.text();
 const anchors=[...h.matchAll(/<a\b[^>]{0,1800}(?:goodsDetails\/|goods-|查看详情|s-gp1gaj)[^>]{0,400}/gi)].map(m=>m[0].slice(0,280));
 const pt=[...h.matchAll(/<a\b[^>]*href=["'][^"']*\/goodsDetails\/[^"']*["'][^>]*>[\s\S]{0,18000}?<\/a>/gi)];
 console.log('SOURCE',JSON.stringify({url,status:response.status,final:response.url,length:h.length,title:h.match(/<title[^>]*>([\s\S]{0,300}?)<\/title>/i)?.[1],fallback:!response.ok?brief(h):null,details:[...new Set(anchors.filter(a=>/goodsDetails|goods-/.test(a)))].slice(0,3),total:windowAround(h,/为您找到|共\s*[\d,]+\s*条|el-pagination__total/,70,130),priceControl:windowAround(h,/MaxPrice|最高价|价格区间|最高价格/,160,420),pages:[...new Set(anchors.filter(a=>a.includes('s-gp1gaj')))].slice(-7),card:windowAround(h,/商品类型：|查看详情/,350,700),ddPrices:[...h.matchAll(/(?:￥|&yen;|¥)\s*(?:<[^>]{0,130}>\s*){0,3}(\d+(?:\.\d{1,2})?)/g)].slice(0,25).map(m=>m[1]),priceMarkup:pt.slice(0,2).map(m=>({len:m[0].length,price:windowAround(m[0],/[¥￥]/,190,200),title:m[0].slice(0,210)})),cardCount:pt.length,nuxt:windowAround(h,/window\.__NUXT__/,0,200)}));
 }catch(e){console.log('SOURCE',JSON.stringify({url,error:String(e.cause||e)}));}
};
test('probe first-party catalogue pages and deployed Delta search',async()=>{
 await Promise.all([inspect(pz),inspect(pz+'?currentPage=2'),inspect(dd+'1-0-0-0.html?MaxPrice=500.00'),inspect(dd+'2-0-0-0.html?MaxPrice=500.00'),(async()=>{
 try{
 const res=await fetch(origin+'/api/search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:'三角洲500元以内的账号',filters:{}}),signal:AbortSignal.timeout(45000)});
 const d=await res.json();
 console.log('BASELINE',JSON.stringify({status:res.status,matched:d.items?.length,filters:d.filters,harness:d.harness?.stages,trace:d.trace?.slice(0,8).map(t=>({tool:t.tool,result:t.result}))}));
 }catch(e){console.log('BASELINE',String(e.cause||e));}
 })()]);
});
