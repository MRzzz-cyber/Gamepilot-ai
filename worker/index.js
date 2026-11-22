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
function isProductPage(u,domain){const p=u.pathname;if(domain==='pzds.com')return /^\/goodsDetails\/[a-z0-9]+(?:\/\d+)?\/?$/i.test(p);if(domain==='pxb7.com')return /^\/(?:seo\/buy\/\d+(?:\/\d+)?|goods?\/[a-z0-9_-]+|detail\/[a-z0-9_-]+)\/?$/i.test(p);return false}
function extractPrice(s){const matches=[...s.matchAll(/(?:[¥￥]\s*|(?:售价|价格|卖价|现价|到手价)\s*[:：]?\s*)([1-9]\d{1,5})(?:\.\d{1,2})?\s*(?:元)?/g)].map(x=>Number(x[1]));return matches.length?matches[0]:null}
function cleanText(s){return String(s||'').replace(/<[^>]*>/g,' ').replace(/&[^; ]+;/g,' ').replace(/\s+/g,' ').slice(0,700)}
async function discover(query,filters,env){
 if(!env.BRAVE_SEARCH_API_KEY)return {candidates:[],trace:[{tool:'search',result:{error:'BRAVE_SEARCH_API_KEY 未配置'}}],reason:'missing_search_key',message:'搜索服务未配置'};
 const trace=[],results=new Map(),server=filters.server==='all'?'':filters.server;
 const plans=SEARCH_DOMAINS.flatMap(d=>[d.host==='pzds.com'?'site:pzds.com/goodsDetails 王者荣耀 账号':'site:pxb7.com/seo/buy 王者荣耀 账号', 'site:'+d.host+' 王者荣耀 账号 '+(server||'苹果QQ')].map(q=>({d,q:q.trim()})));
 await Promise.all(plans.map(async({d,q})=>{
  const t=Date.now();try{
   const u=new URL('https://api.search.brave.com/res/v1/web/search');u.searchParams.set('q',q);u.searchParams.set('count','20');u.searchParams.set('search_lang','zh-hans');u.searchParams.set('country','CN');
   const r=await fetch(u,{headers:{Accept:'application/json','X-Subscription-Token':env.BRAVE_SEARCH_API_KEY},signal:AbortSignal.timeout(8500)});
   if(!r.ok){let detail='';try{const err=await r.json();detail=String(err?.error?.detail||err?.detail||'').slice(0,180);const fields=err?.error?.meta?.errors;if(Array.isArray(fields))detail+=' '+fields.map(x=>String(x.loc?.join('.')||'')+': '+String(x.msg||'')).join('; ').slice(0,220)}catch{}trace.push({tool:'discover_'+d.host,query:q,result:{http_status:r.status,error_detail:detail||'upstream_error'},duration_ms:Date.now()-t});return}
   const j=await r.json();let valid=0,hostMatched=0,productMatched=0,serverRejected=0,soldRejected=0;for(const hit of j.web?.results||[]){
    let link;try{link=new URL(hit.url)}catch{continue}
    if(link.protocol!=='https:'||!(link.hostname===d.host||link.hostname.endsWith('.'+d.host)))continue;hostMatched++;if(!isProductPage(link,d.host))continue;productMatched++;
    const id=link.pathname.match(/goodsDetails\/([^/]+)/)?.[1]||link.pathname.split('/').filter(Boolean).pop();
    if(KNOWN_SOLD.has(id)){soldRejected++;continue}if(results.has(link.href))continue;
    const title=cleanText(hit.title),description=cleanText(hit.description),full=title+' '+description;
    const foundServer=full.match(/安卓QQ|苹果QQ|安卓微信|苹果微信/)?.[0]||null;
    if(server&&foundServer&&foundServer!==server){serverRejected++;continue}
    const price=extractPrice(full),skins=Number(full.match(/(?:皮肤(?:数量|数)?|皮肤)\s*[:：]?\s*(\d{2,4})/)?.[1])||null;
    const heroes=Number(full.match(/(?:英雄(?:数量|数)?|英雄)\s*[:：]?\s*(\d{2,4})/)?.[1])||null;
    const realname=/不可二次实名|不可二改|不支持二次实名/.test(full)?false:/可二次实名|支持二次实名|可二改/.test(full)?true:null;
    results.set(link.href,{id:d.host+':'+id,platform:d.platform,url:link.href,title,description,server:foundServer,price,price_evidence:price===null?'unknown':'search_snippet',status:'unverified',skins,heroes,realname,verification:'搜索索引，未核验实时在售',discovered_at:new Date().toISOString(),kind:'discovered',match_score:0,match_reasons:[]});valid++;
   }
   trace.push({tool:'discover_'+d.host,query:q,result:{raw_results:(j.web?.results||[]).length,host_matched:hostMatched,product_url_matched:productMatched,server_rejected:serverRejected,known_sold_rejected:soldRejected,detail_pages:valid},duration_ms:Date.now()-t});
  }catch(e){trace.push({tool:'discover_'+d.host,query:q,result:{error:'timeout_or_network_error'},duration_ms:Date.now()-t})}
 }));
 const all=[...results.values()];
 // Do not silently discard unknown attributes. Instead label uncertainty and rank lower.
 for(const x of all){let score=40,reasons=[];if(server){if(x.server===server){score+=25;reasons.push('区服匹配')}else if(!x.server){score-=12;reasons.push('区服未知')}else score-=100}
 if(x.price!=null){if(x.price<=filters.max_price){score+=20;reasons.push('索引价在预算内')}else{score-=30;reasons.push('索引价超预算')}}else{score-=15;reasons.push('价格未知')}
 if(filters.realname==='yes'){if(x.realname===true){score+=15;reasons.push('索引注明可二次实名')}else if(x.realname===false){score-=40;reasons.push('不满足实名条件')}else{score-=8;reasons.push('实名未知')}}
 if(x.skins!=null){score+=Math.min(12,Math.floor(x.skins/30));reasons.push('皮肤数量可提取')}
 x.match_score=Math.max(0,Math.min(100,score));x.match_reasons=reasons;x.match_level=(server&&x.server!==server)||(filters.realname==='yes'&&x.realname!==true)||(x.price===null)?'incomplete':'candidate';
 }
 all.sort((a,b)=>b.match_score-a.match_score);
 return {candidates:all.slice(0,24),trace,reason:all.length?'found':'no_detail_candidates',message:all.length?'发现公开商品线索；价格、库存与部分属性仍需核验':'未找到可识别的商品详情页；不代表市场无货'};
}



const DEFAULT_MODEL='openai/gpt-4o-mini';
async function listModels(env){
 if(!env.OPENROUTER_API_KEY)return {models:[{id:env.OPENROUTER_MODEL||DEFAULT_MODEL,name:'默认模型（未连接 OpenRouter）'}],configured:false};
 try{const r=await fetch('https://openrouter.ai/api/v1/models',{headers:{Authorization:'Bearer '+env.OPENROUTER_API_KEY},signal:AbortSignal.timeout(6500)});
 if(!r.ok)throw Error('HTTP '+r.status);const j=await r.json();
 const models=(j.data||[]).filter(x=>Array.isArray(x.supported_parameters)&&x.supported_parameters.includes('tools')).map(x=>({id:x.id,name:x.name||x.id,prompt_price:x.pricing?.prompt,completion_price:x.pricing?.completion,context_length:x.context_length})).sort((a,b)=>a.name.localeCompare(b.name)).slice(0,350);
 return {models,configured:true,default_model:env.OPENROUTER_MODEL||DEFAULT_MODEL};
 }catch{return {models:[{id:env.OPENROUTER_MODEL||DEFAULT_MODEL,name:'默认模型（模型列表暂不可用）'}],configured:true,warning:'无法获取动态模型列表'}}
}

async function agentReview(query,candidates,filters,env,model){
 if(!env.OPENROUTER_API_KEY||!candidates.length)return {status:'skipped',reason:!env.OPENROUTER_API_KEY?'missing_openrouter_key':'no_candidates',model:null,usage:null,notes:[]};
 const allow=new Set(candidates.map(x=>x.id));
 const compact=candidates.slice(0,15).map(x=>({id:x.id,platform:x.platform,title:x.title.slice(0,110),price:x.price,server:x.server,skins:x.skins,realname:x.realname,match_score:x.match_score}));
 try{const r=await fetch('https://openrouter.ai/api/v1/chat/completions',{method:'POST',headers:{Authorization:'Bearer '+env.OPENROUTER_API_KEY,'Content-Type':'application/json','X-Title':'GamePilot AI'},body:JSON.stringify({model: model||env.OPENROUTER_MODEL||DEFAULT_MODEL,temperature:0,max_tokens:650,response_format:{type:'json_object'},messages:[{role:'system',content:'你是游戏账号比价分析Agent。只分析提供的候选，不得生成新商品、价格、库存、区服或来源。返回JSON对象，格式为 {"notes":[{"id":"原始ID","reason":"15字以内的匹配解释","risk":"15字以内的主要未知风险"}],"summary":"80字以内的客观结论"}。未知价格或库存必须说明，禁止声称在售、最低价或可购买。'},{role:'user',content:JSON.stringify({query,filters,candidates:compact})}]}),signal:AbortSignal.timeout(12000)});
 if(!r.ok)return {status:'error',reason:'model_http_'+r.status,notes:[]};
 const j=await r.json(),data=JSON.parse(j.choices?.[0]?.message?.content||'{}');
 const notes=(Array.isArray(data.notes)?data.notes:[]).filter(x=>allow.has(x.id)).map(x=>({id:x.id,reason:String(x.reason||'').slice(0,90),risk:String(x.risk||'').slice(0,90)}));
 return {status:'completed',model:j.model||model||DEFAULT_MODEL,usage:j.usage||null,notes,summary:String(data.summary||'').slice(0,350)};
 }catch{return {status:'error',reason:'model_timeout_or_invalid_json',notes:[]}}
}

const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
function parse(q){const server=q.match(/安卓QQ|苹果QQ|安卓微信|苹果微信/)?.[0]||'all';const budget=q.match(/(\d{2,6})\s*(?:元|块|预算|以内)/)?.[1];return {server,max_price:budget?Number(budget):1000,realname:/可二次实名|支持二次实名/.test(q)?'yes':'all',sort:/皮肤/.test(q)?'skins':'fit',source:'all'}}
function search(filters={}){const f={server:'all',max_price:1000,realname:'all',sort:'fit',source:'all',...filters};const max=Number(f.max_price);let items=inventory.filter(x=>(f.server==='all'||x.server===f.server)&&(!Number.isFinite(max)||max<=0||x.price<=max)&&(f.realname==='all'||x.realname===(f.realname==='yes'))&&(f.source==='all'||x.kind===f.source));items.sort((a,b)=>f.sort==='low'?a.price-b.price:f.sort==='skins'?b.skins-a.skins:b.skins/b.price-a.skins/a.price);return items}
function execute(name,args){if(name==='search_listings')return {items:search(args),note:'未接入授权实时库存，禁止推荐历史或模拟商品'};if(name==='compare_prices'){const ids=Array.isArray(args.ids)?args.ids:[];return ids.map(id=>{const x=inventory.find(v=>v.id===id);return x?{id,platform:x.platform,listed_price_cny:x.price,required_fees:'unknown',final_price:'unknown',source:x.source}: {id,error:'商品不存在'}})}if(name==='check_risks'){const ids=Array.isArray(args.ids)?args.ids:[];return ids.map(id=>{const x=inventory.find(v=>v.id===id);return x?{id,realname_changeable:x.realname,fees:'unknown',status:'not_live_verified',warning:'账号归属、交易保障和找回风险需在源站核验'}:{id,error:'商品不存在'}})}return {error:'未知工具'}}
const tools=[{type:'function',function:{name:'search_listings',description:'自动通过配置的搜索服务发现盼之和螃蟹的商品索引候选；候选未核验在售，不能作为可购买推荐',parameters:{type:'object',properties:{server:{type:'string',enum:['all','安卓QQ','苹果QQ','安卓微信']},max_price:{type:'number'},realname:{type:'string',enum:['all','yes','no']},sort:{type:'string',enum:['fit','low','skins']},source:{type:'string',enum:['all','public','demo']}},required:[]}}},{type:'function',function:{name:'compare_prices',description:'比较挂牌参考价并明确未知服务费',parameters:{type:'object',properties:{ids:{type:'array',items:{type:'string'}}},required:['ids']}}},{type:'function',function:{name:'check_risks',description:'检查实名与未核验交易风险',parameters:{type:'object',properties:{ids:{type:'array',items:{type:'string'}}},required:['ids']}}}];
export default {async fetch(request,env){const url=new URL(request.url);if(url.pathname==='/api/models'&&request.method==='GET')return json(await listModels(env));if(url.pathname==='/api/assets'&&request.method==='GET')return json(inventory);if(url.pathname==='/api/verify'&&request.method==='POST'){let b;try{b=await request.json()}catch{return json({error:'无效JSON'},400)}return json(await verifyListing(String(b.url||'').slice(0,500)))}if(url.pathname==='/api/search'&&request.method==='POST'){
 let body;try{body=await request.json()}catch{return json({error:'无效JSON'},400)}
 const query=String(body.query||'').slice(0,1000),parsed=parse(query),incoming=body.filters||{};
 const filters={...parsed,...incoming,server:incoming.server&&incoming.server!=='all'?incoming.server:parsed.server,realname:incoming.realname&&incoming.realname!=='all'?incoming.realname:parsed.realname,max_price:Number(incoming.max_price)>0?Number(incoming.max_price):parsed.max_price};
 const discovery=await discover(query,filters,env);
 const requested=String(body.model||'').slice(0,150);
 const model=requested&&/^[a-z0-9._-]+\/[a-z0-9._:/-]+$/i.test(requested)?requested:env.OPENROUTER_MODEL||DEFAULT_MODEL;
 const ai=await agentReview(query,discovery.candidates,filters,env,model);
 const noteMap=new Map((ai.notes||[]).map(n=>[n.id,n]));
 const candidates=discovery.candidates.map(x=>({...x,agent_note:noteMap.get(x.id)||null}));
 return json({items:[],candidates,discovery_status:discovery.reason,filters,summary:discovery.message,agent:{status:ai.status,model:ai.model,usage:ai.usage,summary:ai.summary,reason:ai.reason},trace:[...discovery.trace,{tool:'agent_review',mode:'OpenRouter 真实调用',result:{status:ai.status,model:ai.model,reviewed:ai.notes?.length||0,reason:ai.reason}}]});
}

if(url.pathname==='/api/chat'&&request.method==='POST'){if(!env.OPENROUTER_API_KEY)return json({error:'尚未配置 OPENROUTER_API_KEY；基础搜索和比较仍可使用'},503);let body;try{body=await request.json()}catch{return json({error:'无效JSON'},400)}const prompt=String(body.message||'').slice(0,1500);if(!prompt.trim())return json({error:'请输入需求'},400);const requested=String(body.model||'').slice(0,150);const available=await listModels(env);const model=requested&&available.models.some(x=>x.id===requested)?requested:env.OPENROUTER_MODEL||DEFAULT_MODEL;const messages=[{role:'system',content:'你是GamePilot游戏账号购买决策Agent。必须先调用search_listings获取商品；可能找到搜索索引候选，但未核验在售，禁止将索引候选称为可购买商品；禁止编造商品、价格或实时库存。不要编造商品、价格、服务费、账号同一性。仅比较相似账号；不同区服不得判定同款。回复简洁中文，说明来源和交易风险。不可执行支付。'}, {role:'user',content:prompt}];const trace=[];let answer='';let usage={};let items=[];try{for(let step=0;step<4;step++){const start=Date.now();const response=await fetch('https://openrouter.ai/api/v1/chat/completions',{method:'POST',headers:{Authorization:'Bearer '+env.OPENROUTER_API_KEY,'Content-Type':'application/json','HTTP-Referer':url.origin,'X-Title':'GamePilot AI'},body:JSON.stringify({model,messages,tools,tool_choice:step===0?'required':'auto',temperature:0.1}),signal:AbortSignal.timeout(20000)});if(!response.ok)return json({error:'模型服务返回 '+response.status,details:(await response.text()).slice(0,180)},502);const data=await response.json();usage=data.usage||usage;const msg=data.choices?.[0]?.message;if(!msg)return json({error:'模型没有返回消息'},502);messages.push(msg);if(!msg.tool_calls?.length){answer=msg.content||'分析完成';break}for(const call of msg.tool_calls.slice(0,5)){let args={};try{args=JSON.parse(call.function.arguments||'{}')}catch{}const result=call.function.name==='search_listings'?{items:[],discovery:await discover(prompt,args,env)}:execute(call.function.name,args);if(call.function.name==='search_listings')items=result.items||[];trace.push({tool:call.function.name,args,result,mode:'OpenRouter 工具调用',duration_ms:Date.now()-start});messages.push({role:'tool',tool_call_id:call.id,content:JSON.stringify(result)})}}return json({answer:answer||'已达到调用上限，请缩小需求',trace,items,usage,model})}catch{return json({error:'Agent 调用失败，请检查 OpenRouter 配置和网络'},502)}}
if(url.pathname.startsWith('/api/'))return json({error:'接口不存在'},404);return env.ASSETS.fetch(request)}};