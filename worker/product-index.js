// Persistent, source-attributed marketplace index. No search-engine quota or LLM required.
const ALLOWED=new Set(['www.dd373.com','dd373.com','www.pzds.com','pzds.com','www.gmmsj.com','gmmsj.com','www.5173.com','5173.com']);
const clean=s=>String(s||'').replace(/<script\\b[^>]*>[\\s\\S]*?<\\/script>/gi,' ').replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&').replace(/&nbsp;/g,' ').replace(/\\s+/g,' ').trim();
export function normalizeProduct(row){
 let u;try{u=new URL(row.url)}catch{return null}
 if(u.protocol!=='https:'||!ALLOWED.has(u.hostname)||u.username||u.password||u.port)return null;
 const title=clean(row.title).slice(0,240),price=Number(row.price);
 if(!title||!Number.isFinite(price)||price<1||price>10000000)return null;
 const game=String(row.game||'').trim();
 if(!['三角洲行动','王者荣耀','冒险岛'].includes(game))return null;
 if(game==='三角洲行动'&&/(?:道具|护航|代肝|陪玩|哈夫币|点券|纯币号)/.test(String(row.category||'')))return null;
 const platform=u.hostname.replace(/^www\\./,'');
 const productId=String(row.product_id||u.pathname+u.search).slice(0,180);
 return {id:platform+':'+productId,platform,game,title,price,url:u.href,category:String(row.category||'游戏账号').slice(0,70),server:String(row.server||'').slice(0,80),status:'unverified',source:'marketplace_public_listing'};
}
export async function upsertProducts(db,records){
 if(!db)throw Error('D1_NOT_CONFIGURED');
 if(!Array.isArray(records)||records.length>500)throw Error('BATCH_LIMIT_500');
 const items=[...new Map(records.map(normalizeProduct).filter(Boolean).map(x=>[x.id,x])).values()];
 let inserted=0;
 for(let i=0;i<items.length;i+=50){
  const batch=items.slice(i,i+50).map(x=>db.prepare(
   'INSERT INTO products (id,platform,game,title,price,url,category,server,status,source,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET title=excluded.title,price=excluded.price,server=excluded.server,category=excluded.category,updated_at=CURRENT_TIMESTAMP'
  ).bind(x.id,x.platform,x.game,x.title,x.price,x.url,x.category,x.server,x.status,x.source));
  await db.batch(batch);inserted+=batch.length;
 }
 return {received:records.length,accepted:items.length,upserted:inserted,rejected:records.length-items.length};
}
export async function queryProducts(db,{game,max_price=500,limit=200,offset=0}={}){
 if(!db)return {configured:false,items:[],total:0};
 const price=Math.min(Math.max(Number(max_price)||500,1),10000000),size=Math.min(Math.max(Number(limit)||200,1),500),skip=Math.max(Number(offset)||0,0);
 const count=await db.prepare('SELECT COUNT(*) AS n FROM products WHERE game=? AND price<=?').bind(game,price).first();
 const res=await db.prepare('SELECT id,platform,game,title,price,url,server,category,updated_at FROM products WHERE game=? AND price<=? ORDER BY price ASC LIMIT ? OFFSET ?').bind(game,price,size,skip).all();
 return {configured:true,total:Number(count?.n||0),items:res.results||[],limit:size,offset:skip};
}
export function parseDD373Listing(html,pageUrl){
 // Strictly use one listing card's link, title and price. No cross-card price association.
 const source=String(html||''),records=[],seen=new Set();
 const anchors=[...source.matchAll(/<a\\b[^>]*href=["']([^"']+)["'][^>]*>[\\s\\S]*?<\\/a>/gi)];
 for(const a of anchors){
  let u;try{u=new URL(a[1].replace(/&amp;/g,'&'),pageUrl)}catch{continue}
  if(!/^(?:www\\.)?dd373\\.com$/.test(u.hostname)||!/\\/goods-|\\/product\\/|\\/detail\\//i.test(u.pathname))continue;
  const text=clean(a[0]),context=source.slice(Math.max(0,a.index-400),Math.min(source.length,a.index+a[0].length+450));
  if(!/三角洲|游戏账号|账号/.test(context))continue;
  if(/(?:道具|护航|代肝|陪玩|哈夫币)/.test(context.slice(0,180)))continue;
  const prices=[...clean(context).matchAll(/[¥￥]\\s*([1-9][\\d,]*(?:\\.\\d{1,2})?)/g)].map(x=>Number(x[1].replace(/,/g,'')));
  if(prices.length!==1||seen.has(u.href))continue;
  const row=normalizeProduct({game:'三角洲行动',title:text,price:prices[0],url:u.href,category:'游戏账号'});
  if(row){seen.add(u.href);records.push(row)}
 }
 return records;
}
