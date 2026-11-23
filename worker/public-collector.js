import {upsertProducts,normalizeProduct,parseDD373Listing} from './product-index.js';

// Opt-in, direct first-party listing fetch. No Brave, browser rendering or LLM calls.
// Source adapters are intentionally explicit; unknown markup must fail closed.
const HOSTS=new Set(['www.dd373.com','dd373.com','www.pzds.com','pzds.com','www.gmmsj.com','gmmsj.com','www.5173.com','5173.com']);
const clean=s=>String(s||'').replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&').replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim();
export function parseEmbeddedJSONListings(html,sourceUrl,config){
 const rows=[],seen=new Set();
 // Source-specific JSON-LD Product is acceptable only when the same node contains name, offer price and URL.
 for(const match of String(html).matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){
  let doc;try{doc=JSON.parse(match[1])}catch{continue}
  const nodes=Array.isArray(doc)?doc:[doc],stack=[...nodes];
  while(stack.length){
   const x=stack.pop();if(!x||typeof x!=='object')continue;
   if(Array.isArray(x)){stack.push(...x);continue}
   if(x['@graph'])stack.push(x['@graph']);
   if(x['@type']!=='Product'&&!(Array.isArray(x['@type'])&&x['@type'].includes('Product')))continue;
   const offer=Array.isArray(x.offers)?x.offers[0]:x.offers;
   const price=Number(offer?.price),title=clean(x.name);
   let url;try{url=new URL(x.url||offer?.url||'',sourceUrl)}catch{continue}
   if(!HOSTS.has(url.hostname)||url.protocol!=='https:'||!Number.isFinite(price)||price<=0||!title||seen.has(url.href))continue;
   if(!/三角洲/.test(title)||!/(账号|帐号|角色)/.test(title))continue;
   if(/道具|护航|代肝|陪玩|哈夫币|点券/.test(title))continue;
   seen.add(url.href);rows.push({game:'三角洲行动',category:'游戏账号',title,price,url:url.href,product_id:x.sku||x.productID||url.pathname});
  }
 }
 return rows;
}

export function parsePzdsDeltaListing(html){
 const source=String(html||''),items=new Map();
 if(!/三角洲行动/.test(source.slice(0,130000)))return [];
 for(const a of source.matchAll(/<a\b[^>]*\bhref=["'](\/goodsDetails\/([a-z0-9_-]{4,24})\/6(?:\?[^"']*)?)["'][^>]*>/gi)){
  const id=a[2].toUpperCase();
  if(items.has(id))continue;
  const end=source.indexOf('</a>',a.index);
  if(end<a.index||end-a.index>16000)continue;
  const card=source.slice(a.index,end+4);
  const plain=clean(card);
  if(/已售出|已下架|商品已售/.test(plain))continue;
  const amount=[...plain.matchAll(/[¥￥]\s*([1-9][\d,]{0,8}(?:\.\d{1,2})?)/g)].map(m=>Number(m[1].replace(/,/g,'')));
  const unique=[...new Set(amount)].filter(n=>n>=1&&n<=10000000);
  if(unique.length!==1)continue;
  const title=clean(card.match(/class=["'][^"']*(?:game-title|goods-title|account-title)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1]||'');
  const fallback=plain.slice(0,160);
  const name=(title||fallback).slice(0,220);
  if(!name||name.length<5)continue;
  const server=/微信/.test(plain)?'微信':/QQ/.test(plain)?'QQ':'';
  const row=normalizeProduct({game:'三角洲行动',category:'游戏账号',title:name,price:unique[0],url:'https://www.pzds.com/goodsDetails/'+id+'/6',product_id:id,server});
  if(row)items.set(id,row);
 }
 return [...items.values()];
}
function defaultDeltaSources(start,cap){
 const low='https://www.dd373.com/s-gp1gaj-f4wdcm-sxbrka-0-0-0-04q04w-0-0-0-0-0-1-0-0-0.html?MaxPrice=200.00&MinPrice=0.00';
 const mid='https://www.dd373.com/s-gp1gaj-f4wdcm-sxbrka-0-0-0-04q04w-0-0-0-0-0-1-0-0-0.html?MaxPrice=500.00&MinPrice=200.00';
 const pages=(base)=>Array.from({length:cap},(_,i)=>base.replace(/-(\d+)-0-0-0\.html/, '-'+(start+i)+'-0-0-0.html'));
 return [
  {name:'pzds_delta_391',pages:Array.from({length:cap},(_,i)=>'https://www.pzds.com/goodsList/391/6?currentPage='+(start+i))},
  {name:'dd373_delta_0_200',pages:pages(low)},
  {name:'dd373_delta_200_500',pages:pages(mid)}
 ];
}

export async function collectPublicListings(env,{maxPages=2,startPage=1,dryRun=false}={}){
 if(!env.PRODUCTS_DB)throw Error('PRODUCTS_DB binding missing');
 const cap=Math.min(Math.max(Number(maxPages)||2,1),5),start=Math.min(Math.max(Number(startPage)||1,1),1000);
 let configs;try{configs=env.LISTING_SOURCES_JSON?JSON.parse(env.LISTING_SOURCES_JSON):defaultDeltaSources(start,cap)}catch{throw Error('Invalid LISTING_SOURCES_JSON')}
 if(!Array.isArray(configs)||configs.length===0)return {status:'no_sources_configured',brave_requests:0,pages:0,accepted:0,source_results:[]};
 const results=[];let pages=0,accepted=0;
 for(const source of configs.slice(0,3)){
  if(!Array.isArray(source.pages))continue;
  const out={source:source.name||'public_listing',pages:0,parsed:0,errors:[]};
  for(const page of source.pages.slice(0,cap)){
   let u;try{u=new URL(page)}catch{out.errors.push('invalid_url');continue}
   if(u.protocol!=='https:'||!HOSTS.has(u.hostname)||u.username||u.password||u.port){out.errors.push('unsupported_host');continue}
   try{
    const response=await fetch(u.href,{signal:AbortSignal.timeout(8000),headers:{Accept:'text/html','User-Agent':'GamePilotPublicIndexer/1.0'}});
    pages++;out.pages++;
    if(!response.ok){out.errors.push('http_'+response.status);continue}
    const html=(await response.text()).slice(0,1500000);
    if(/captcha|人机验证|访问验证|Access Denied|Just a moment|_waf_is_mobile|<!doctypehtml>/i.test(html.slice(0,30000))){out.errors.push('access_challenge_stop');break}
    const rows=u.hostname.endsWith('pzds.com')?parsePzdsDeltaListing(html):u.hostname.endsWith('dd373.com')?parseDD373Listing(html,u.href):parseEmbeddedJSONListings(html,u.href,source);
    out.parsed+=rows.length;
    if(!dryRun&&rows.length){const result=await upsertProducts(env.PRODUCTS_DB,rows);accepted+=result.accepted}
   }catch(e){out.errors.push('fetch_failed:'+String(e?.name||'error').slice(0,30))}
  }
  results.push(out);
 }
 return {status:'completed',brave_requests:0,llm_requests:0,pages,accepted,start_page:start,max_pages:cap,dry_run:dryRun,source_results:results};
}
