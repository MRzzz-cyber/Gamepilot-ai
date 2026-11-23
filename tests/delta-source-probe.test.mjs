import test from 'node:test';
const ldds='https://m.ldds.com/pages/buy/list?gameId=95683';
const tao='https://www.taoshouyou.com/game/sanjiaozhouxingdong-36881-0-0';
const contexts=(h,re,l=80,r=160,n=5)=>[...h.matchAll(re)].slice(0,n).map(x=>h.slice(Math.max(0,x.index-l),x.index+r).replace(/\s+/g,' '));
const inspect=async (name,url)=>{
 try{
  const r=await fetch(url,{signal:AbortSignal.timeout(10000),headers:{Accept:'text/html'}});
  const h=await r.text(),items=[...h.matchAll(/<a\b[^>]*href=["']([^"']*(?:\/pages\/buy\/item\?id=|\/taoid_)[^"']*)["'][^>]*>[\s\S]{0,6000}?<\/a>/g)];
  console.log('ALTERNATE',JSON.stringify({name,url,status:r.status,final:r.url,size:h.length,title:h.match(/<title[^>]*>([\s\S]{1,200}?)<\/title>/i)?.[1],counts:contexts(h,/在售账号（共|总共|下一页|价格区间/g),items:items.slice(0,2).map(m=>m[0].slice(0,520)),prices:items.map(x=>[x[1],x[0].match(/[¥￥]\s*(?:<[^>]+>\s*)?(\d+(?:\.\d{1,2})?)/)?.[1]]),scripts:contexts(h,/<script\b[^>]*src=/g,0,300,8),challenge:h.slice(0,200)}));
 }catch(e){console.log('ALTERNATE',JSON.stringify({name,url,error:String(e.cause||e)}));}
};
test('check native pagination on alternative marketplace sources',async()=>{
 await Promise.all([inspect('ldds1',ldds),inspect('ldds2',ldds+'&page=2'),inspect('ldds-max',ldds+'&maxPrice=500'),inspect('ldds-probe10',ldds+'&page=10'),inspect('tao',tao)]);
});
