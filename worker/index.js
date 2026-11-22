// Fail closed: historical and synthetic records are not live inventory.
const inventory=[];
const KNOWN_SOLD=new Set(['C8YDZP']);
const HOSTS=new Set(['www.pzds.com','pzds.com','www.pxb7.com','pxb7.com','www.5173.com','5173.com','www.gmmsj.com','gmmsj.com']);
async function verifyListing(raw){
 let u;try{u=new URL(raw)}catch{return {status:'invalid_url',message:'无效商品链接'}}
 if(u.protocol!=='https:'||!HOSTS.has(u.hostname)||u.username||u.password||u.port)return {status:'unsupported_source',message:'不支持此域名'};
 const id=u.pathname.split('/').includes('goodsDetails')?u.pathname.split('/')[u.pathname.split('/').indexOf('goodsDetails')+1]:null;
 if(KNOWN_SOLD.has(id))return {status:'sold',message:'用户已提供售出截图，排除推荐；未重新联网核验',source_url:u.href,verified_at:null};
 try{
 const r=await fetch(u.href,{redirect:'manual',signal:AbortSignal.timeout(7000),headers:{Accept:'text/html'}});
 if(r.status!==200||!(r.headers.get('content-type')||'').includes('text/html'))return {status:'unverified',message:'商品页面不可核验',http_status:r.status};
 const html=(await r.text()).slice(0,300000);
 const sold=/(已售出|商品已下架|该商品已售|已被购买|sold out|out of stock)/i.test(html);
 return {status:sold?'sold':'unverified',message:sold?'页面包含售出或下架提示，已排除':'没有可信的在售和价格证据，禁止推荐',checked_at:new Date().toISOString(),verification_method:'公开HTML检查'};
 }catch{return {status:'unverified',message:'页面访问失败，不能确认在售'}}
}

const SEARCH_DOMAINS=[{host:'pzds.com',platform:'盼之账号',query:'site:pzds.com/goodsDetails/ 王者荣耀 价格'},{host:'pxb7.com',platform:'螃蟹账号',query:'site:pxb7.com/seo/buy/ 王者荣耀 账号 价格'}];
function isProductPage(u,domain){if(domain==='pzds.com')return /^\/goodsDetails\/[a-z0-9]+\/\d+\/?$/i.test(u.pathname);if(domain==='pxb7.com')return /^\/seo\/buy\/\d+\/\d+\/?$/i.test(u.pathname);return false}
function extractPrice(s){const matches=[...s.matchAll(/(?:[¥￥]\s*|(?:售价|价格|卖价|现价|到手价)\s*[:：]?\s*)([1-9]\d{1,5})(?:\.\d{1,2})?\s*(?:元)?/g)].map(x=>Number(x[1]));return matches.length?matches[0]:null}
function cleanText(s){return String(s||'').replace(/<[^>]*>/g,' ').replace(/&[^; ]+;/g,' ').replace(/\s+/g,' ').slice(0,700)}
async function discover(query,filters,env){
 if(!env.BRAVE_SEARCH_API_KEY)return {candidates:[],reason:'missing_search_key',message:'尚未配置 BRAVE_SEARCH_API_KEY；无法自动发现真实候选'};
 const candidates=[],trace=[];const terms=['王者荣耀',filters.server==='all'?'账号':filters.server,filters.realname==='yes'?'二次实名':'',String(query||'').slice(0,60)].filter(Boolean).join(' ');
 for(const d of SEARCH_DOMAINS){
  const start=Date.now();
  try{
   const u=new URL('https://api.search.brave.com/res/v1/web/search');u.searchParams.set('q',d.query+' '+terms);u.searchParams.set('count','8');
   const r=await fetch(u,{headers:{'Accept':'application/json','X-Subscription-Token':env.BRAVE_SEARCH_API_KEY},signal:AbortSignal.timeout(8000)});
   if(!r.ok){trace.push({tool:'discover_'+d.host,mode:'Brave Search API',result:{http_status:r.status},duration_ms:Date.now()-start});continue}
   const data=await r.json();let count=0;
   for(const item of data.web?.results||[]){
    let link;try{link=new URL(item.url)}catch{continue}
    if(link.protocol!=='https:'||!(link.hostname===d.host||link.hostname.endsWith('.'+d.host))||!isProductPage(link,d.host))continue;
    const title=cleanText(item.title),snippet=cleanText(item.description);
    const id=link.pathname.match(/goodsDetails\/([^/]+)/)?.[1]||link.pathname.split('/').filter(Boolean).pop()||'unknown';
    if(KNOWN_SOLD.has(id))continue;
    if(candidates.some(x=>x.url===link.href))continue;
    const combined=title+' '+snippet;
    const foundServer=combined.match(/安卓QQ|苹果QQ|安卓微信|苹果微信/)?.[0]||null;
    if(filters.server!=='all'&&foundServer&&foundServer!==filters.server)continue;
    const price=extractPrice(combined);
    // Without a price, there is no meaningful comparison. Keep only priced detail candidates.
    if(price===null)continue;
    if(price!=null&&Number(filters.max_price)>0&&price>Number(filters.max_price))continue;
    candidates.push({id:d.host+':'+id,platform:d.platform,url:link.href,title,description:snippet,server:foundServer,price,source:'搜索索引 · 未核验',status:'unverified',discovered_at:new Date().toISOString(),verification:'搜索引擎缓存，不代表在售',kind:'discovered',heroes:null,skins:null,rare:'未核验',realname:null,time:'发现时间：'+new Date().toLocaleDateString('zh-CN')});count++;
   }
   trace.push({tool:'discover_'+d.host,mode:'Brave Search API',result:{candidates:count},duration_ms:Date.now()-start});
  }catch(e){trace.push({tool:'discover_'+d.host,mode:'Brave Search API',result:{error:'请求失败或超时'},duration_ms:Date.now()-start})}
 }
 return {candidates:candidates.slice(0,12),trace,reason:candidates.length?'found':'no_priced_details',message:candidates.length?'已筛选有索引价格的商品详情页；价格与在售状态仍需核验':'未发现同时具有商品详情链接和明确索引价格的候选。未展示首页、教程或无价页面。'};
}

const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
function parse(q){const server=q.match(/安卓QQ|苹果QQ|安卓微信/)?.[0]||'all';const budget=q.match(/(\d{2,6})\s*(?:元|块|预算)/)?.[1];return {server,max_price:budget?Number(budget):1000,realname:/可二次实名|支持二次实名/.test(q)?'yes':'all',sort:/皮肤/.test(q)?'skins':'fit',source:'all'}}
function search(filters={}){const f={server:'all',max_price:1000,realname:'all',sort:'fit',source:'all',...filters};const max=Number(f.max_price);let items=inventory.filter(x=>(f.server==='all'||x.server===f.server)&&(!Number.isFinite(max)||max<=0||x.price<=max)&&(f.realname==='all'||x.realname===(f.realname==='yes'))&&(f.source==='all'||x.kind===f.source));items.sort((a,b)=>f.sort==='low'?a.price-b.price:f.sort==='skins'?b.skins-a.skins:b.skins/b.price-a.skins/a.price);return items}
function execute(name,args){if(name==='search_listings')return {items:search(args),note:'未接入授权实时库存，禁止推荐历史或模拟商品'};if(name==='compare_prices'){const ids=Array.isArray(args.ids)?args.ids:[];return ids.map(id=>{const x=inventory.find(v=>v.id===id);return x?{id,platform:x.platform,listed_price_cny:x.price,required_fees:'unknown',final_price:'unknown',source:x.source}: {id,error:'商品不存在'}})}if(name==='check_risks'){const ids=Array.isArray(args.ids)?args.ids:[];return ids.map(id=>{const x=inventory.find(v=>v.id===id);return x?{id,realname_changeable:x.realname,fees:'unknown',status:'not_live_verified',warning:'账号归属、交易保障和找回风险需在源站核验'}:{id,error:'商品不存在'}})}return {error:'未知工具'}}
const tools=[{type:'function',function:{name:'search_listings',description:'自动通过配置的搜索服务发现盼之和螃蟹的商品索引候选；候选未核验在售，不能作为可购买推荐',parameters:{type:'object',properties:{server:{type:'string',enum:['all','安卓QQ','苹果QQ','安卓微信']},max_price:{type:'number'},realname:{type:'string',enum:['all','yes','no']},sort:{type:'string',enum:['fit','low','skins']},source:{type:'string',enum:['all','public','demo']}},required:[]}}},{type:'function',function:{name:'compare_prices',description:'比较挂牌参考价并明确未知服务费',parameters:{type:'object',properties:{ids:{type:'array',items:{type:'string'}}},required:['ids']}}},{type:'function',function:{name:'check_risks',description:'检查实名与未核验交易风险',parameters:{type:'object',properties:{ids:{type:'array',items:{type:'string'}}},required:['ids']}}}];
export default {async fetch(request,env){const url=new URL(request.url);if(url.pathname==='/api/assets'&&request.method==='GET')return json(inventory);if(url.pathname==='/api/verify'&&request.method==='POST'){let b;try{b=await request.json()}catch{return json({error:'无效JSON'},400)}return json(await verifyListing(String(b.url||'').slice(0,500)))}if(url.pathname==='/api/search'&&request.method==='POST'){let body;try{body=await request.json()}catch{return json({error:'无效JSON'},400)}const query=String(body.query||'').slice(0,1000),filters={...parse(query),...(body.filters||{})};const start=Date.now(),items=search(filters);const discovery=await discover(query,filters,env);return json({items,candidates:discovery.candidates,discovery_status:discovery.reason,filters,summary:discovery.message,trace:[...discovery.trace,{tool:'parse_requirements',args:{query},result:filters,mode:'服务端规则',duration_ms:0},{tool:'search_listings',args:filters,result:{count:items.length},mode:'离线索引',duration_ms:Date.now()-start},{tool:'check_risks',args:{ids:items.map(x=>x.id)},result:{warning:'必需服务费与实时在售状态未知'},mode:'确定性规则',duration_ms:0}]})}
if(url.pathname==='/api/chat'&&request.method==='POST'){if(!env.OPENROUTER_API_KEY)return json({error:'尚未配置 OPENROUTER_API_KEY；基础搜索和比较仍可使用'},503);let body;try{body=await request.json()}catch{return json({error:'无效JSON'},400)}const prompt=String(body.message||'').slice(0,1500);if(!prompt.trim())return json({error:'请输入需求'},400);const model=env.OPENROUTER_MODEL||'openai/gpt-4o-mini';const messages=[{role:'system',content:'你是GamePilot游戏账号购买决策Agent。必须先调用search_listings获取商品；可能找到搜索索引候选，但未核验在售，禁止将索引候选称为可购买商品；禁止编造商品、价格或实时库存。不要编造商品、价格、服务费、账号同一性。仅比较相似账号；不同区服不得判定同款。回复简洁中文，说明来源和交易风险。不可执行支付。'}, {role:'user',content:prompt}];const trace=[];let answer='';let usage={};let items=[];try{for(let step=0;step<4;step++){const start=Date.now();const response=await fetch('https://openrouter.ai/api/v1/chat/completions',{method:'POST',headers:{Authorization:'Bearer '+env.OPENROUTER_API_KEY,'Content-Type':'application/json','HTTP-Referer':url.origin,'X-Title':'GamePilot AI'},body:JSON.stringify({model,messages,tools,tool_choice:step===0?'required':'auto',temperature:0.1}),signal:AbortSignal.timeout(20000)});if(!response.ok)return json({error:'模型服务返回 '+response.status,details:(await response.text()).slice(0,180)},502);const data=await response.json();usage=data.usage||usage;const msg=data.choices?.[0]?.message;if(!msg)return json({error:'模型没有返回消息'},502);messages.push(msg);if(!msg.tool_calls?.length){answer=msg.content||'分析完成';break}for(const call of msg.tool_calls.slice(0,5)){let args={};try{args=JSON.parse(call.function.arguments||'{}')}catch{}const result=call.function.name==='search_listings'?{items:[],discovery:await discover(prompt,args,env)}:execute(call.function.name,args);if(call.function.name==='search_listings')items=result.items||[];trace.push({tool:call.function.name,args,result,mode:'OpenRouter 工具调用',duration_ms:Date.now()-start});messages.push({role:'tool',tool_call_id:call.id,content:JSON.stringify(result)})}}return json({answer:answer||'已达到调用上限，请缩小需求',trace,items,usage,model})}catch{return json({error:'Agent 调用失败，请检查 OpenRouter 配置和网络'},502)}}
if(url.pathname.startsWith('/api/'))return json({error:'接口不存在'},404);return env.ASSETS.fetch(request)}};