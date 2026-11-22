// Fail closed: historical and synthetic records are not live inventory.
const inventory=[];
const KNOWN_SOLD=new Set(['C8YDZP']);
const HOSTS=new Set(['www.pzds.com','pzds.com','www.5173.com','5173.com','shop.5173.com','s.5173.com','old.5173.com','www.gmmsj.com','gmmsj.com']);
function decodeEntities(s){return String(s||'').replace(/&quot;|&#34;/g,'"').replace(/&amp;/g,'&').replace(/&#39;|&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>')}
function structuredOffers(html){
 const blocks=[...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].slice(0,12);
 const offers=[];function visit(node,depth=0){if(depth>7||!node||typeof node!=='object')return;if(Array.isArray(node)){node.forEach(x=>visit(x,depth+1));return}if(node.offers)visit(node.offers,depth+1);if(node['@graph'])visit(node['@graph'],depth+1);if(node.price!=null){const p=Number(node.price);if(Number.isFinite(p)&&p>0&&p<10000000)offers.push({price:p,currency:node.priceCurrency||null,availability:String(node.availability||'')})}}
 for(const m of blocks){try{visit(JSON.parse(decodeEntities(m[1])))}catch{}}
 return offers;
}
function gmmsjDetail(html){
 const body=decodeEntities(String(html||'').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' '));
 const status=/(?:浏览量|收藏量)[\s\S]{0,100}?已出售/.test(body)?'sold':/(?:浏览量|收藏量)[\s\S]{0,100}?出售中/.test(body)?'listed':'unverified';
 const productContext=/(?:商品详情|编号\s*\d{7,}|账号\s*\[|账号\s*【)/.test(body);
 if(!productContext)return {status,price:null,price_evidence:'unknown'};
 const head=body.split(/(?:猜你喜欢|相似推荐|商品留言|交易流程)/)[0].slice(0,6000);
 // H5 header: coupon banners may show ¥10 before the actual "¥280.00 库存 1 账号".
 const stockPrice=head.match(/[¥￥]\s*([1-9]\d{0,6}(?:\.\d{1,2})?)\s*库存\s*\d+\s*(?:账号|装备|游戏币|道具)/i);
 const labeled=head.match(/(?:商品售价|出售价格|售价|一口价)\s*[:：]?\s*[¥￥]?\s*([1-9]\d{0,6}(?:\.\d{1,2})?)/i);
 const contextual=head.match(/[¥￥]\s*([1-9]\d{0,6}(?:\.\d{1,2})?)\s*(?:账号\s*[【\[]|账号\s+自助验货)/i);
 const saleText=head.split(/(?:保障类型|商品类别)/).at(-1)||head;
 const visible=[...saleText.matchAll(/[¥￥]\s*([1-9]\d{0,6}(?:\.\d{1,2})?)/g)].filter(m=>!/(?:优惠券|可领|领券|返现|抵扣|服务费)\s*[:：]?\s*$/.test(saleText.slice(Math.max(0,m.index-26),m.index))).map(m=>Number(m[1])).filter(n=>n>=10&&n<=1000000);
 const standalone=[...new Set(visible)];
 const selected=stockPrice||labeled||contextual;
 const price=selected?Number(selected[1]):standalone.length===1?standalone[0]:null;
 return {status,price:price!=null&&price>=10&&price<=1000000?price:null,price_evidence:price!=null?'gmmsj_detail_visible_price':'unknown'};
}
function extractDetailPrice(html){
 const offers=structuredOffers(html);const c=offers.find(o=>!o.currency||o.currency==='CNY');if(c)return {price:c.price,price_evidence:'detail_structured',availability:c.availability};
 const meta=[...html.matchAll(/<meta\s+[^>]*>/gi)].map(x=>x[0]);for(const tag of meta){if(!/(?:product:price:amount|og:price:amount|itemprop=["']price)/i.test(tag))continue;const m=tag.match(/content=["']([0-9]+(?:\.[0-9]{1,2})?)["']/i);if(m&&Number(m[1])>0)return {price:Number(m[1]),price_evidence:'detail_meta',availability:null}}
 return {price:null,price_evidence:'unknown',availability:null};
}
function visibleDetailPrice(html){
 const raw=String(html||'');
 const body=decodeEntities(raw.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' '));
 const head=body.split(/(?:交易流程|猜你喜欢|相似推荐|热门推荐|为你推荐)/)[0].slice(0,14000);
 const patterns=[
  /(?:商品售价|出售价格|商品价格|当前售价|一口价|售价|现价|到手价)\s*[:：]?\s*[¥￥]?\s*([1-9]\d{0,6}(?:\.\d{1,2})?)/gi,
  /[¥￥]\s*([1-9]\d{0,6}(?:\.\d{1,2})?)/g
 ];
 for(const re of patterns)for(const m of head.matchAll(re)){
  const n=Number(m[1]),before=head.slice(Math.max(0,m.index-20),m.index);
  if(n>=10&&n<=1000000&&!/(?:可领|领券|优惠券|新人券|满减|返现|运费|服务费|抵扣|优惠|原价|划线价|券后|推荐|相似|起售价)/.test(before))return {price:n,price_evidence:'detail_visible_header'};
 }
 if(/(?:goodsDetails|商品编号|商品详情|商品售价)/i.test(raw)){
  const re=/"(?:sellingPrice|salePrice|goodsPrice|productPrice|priceAmount|sellPrice)"\s*:\s*"?([1-9]\d{0,6}(?:\.\d{1,2})?)/gi;
  for(const m of raw.matchAll(re)){const n=Number(m[1]);if(n>=10&&n<=1000000)return {price:n,price_evidence:'detail_embedded_product_data'}}
 }
 return {price:null,price_evidence:'unknown'};
}
function listingUpdatedAt(html){
 const plain=decodeEntities(String(html||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' '));
 const m=plain.match(/(?:更新|更新时间|上架时间|发布时间)\s*[:：]?\s*(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})/);
 if(!m)return null;
 const date=new Date(Date.UTC(Number(m[1]),Number(m[2])-1,Number(m[3])));
 return Number.isFinite(date.getTime())?date.toISOString():null;
}
function isStaleListing(updatedAt,days=180){return !!updatedAt&&Date.now()-Date.parse(updatedAt)>days*86400000}
// Browser Run is a strictly bounded fallback for approved product URLs only.
// It is NOT a proxy or a way to bypass a seller's login, CAPTCHA, or access controls.
async function browserRenderListing(raw,env){
 const start=Date.now();
 let u;try{u=new URL(raw)}catch{return {ok:false,reason:'invalid_url',duration_ms:0}}
 const domain=u.hostname.endsWith('.5173.com')||u.hostname==='5173.com'?'5173.com':u.hostname.replace(/^www\./,'');
 if(u.protocol!=='https:'||!HOSTS.has(u.hostname)||u.username||u.password||u.port||
    !['5173.com','gmmsj.com'].includes(domain)||!isProductPage(u,domain))
  return {ok:false,reason:'unsupported_listing_url',duration_ms:0};
 if(typeof env?.BROWSER?.quickAction!=='function')
  return {ok:false,reason:'browser_binding_missing',duration_ms:0};
 try{
  const response=await env.BROWSER.quickAction('content',{url:u.href,gotoOptions:{waitUntil:'networkidle2'}});
  if(!response?.ok)return {ok:false,reason:'browser_http_error',http_status:response?.status||null,duration_ms:Date.now()-start};
  const html=(await response.text()).slice(0,500000);
  if(/(?:验证码|人机验证|请登录|访问被拒绝|Access Denied|Just a moment|verify you are human|captcha)/i.test(html.slice(0,15000)))
   return {ok:false,reason:'site_challenge_or_login',duration_ms:Date.now()-start};
  if(html.length<80)return {ok:false,reason:'rendered_html_empty',duration_ms:Date.now()-start};
  return {ok:true,html,duration_ms:Date.now()-start};
 }catch(e){return {ok:false,reason:'browser_render_failed',error_type:String(e?.name||'unknown').slice(0,50),duration_ms:Date.now()-start}}
}
function extractListingAttributes(html){
 const text=decodeEntities(String(html||'').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' '));
 const number=re=>{const m=text.match(re);return m?Number(m[1]):null};
 const field=re=>text.match(re)?.[1]?.trim()||null;
 const server=field(/(?:游戏区服|〖区服〗|区服)\s*[:：]?\s*(?:[\p{Script=Han}A-Za-z0-9·_-]+[-－])?\s*(苹果QQ|苹果微信|安卓QQ|安卓微信|iOS\s*QQ|iOS\s*微信)/iu);
 const skins=number(/(?:〖\s*皮肤(?:数量|数)\s*〗|皮肤(?:数量|数)?)\s*[:：]?\s*(\d{1,4})(?!\d)/u);
 const heroes=number(/(?:〖\s*英雄(?:数量|数)\s*〗|英雄(?:数量|数)?)\s*[:：]?\s*(\d{1,4})(?!\d)/u);
 const realname=/(?:不可二次实名|不可二改|不支持二次实名|不能二次实名)/u.test(text)?false:/(?:可二次实名|支持二次实名|可二改)/u.test(text)?true:null;
 const rank=field(/(?:〖段位〗|当前段位|游戏段位|段位)\s*[:：]?\s*([\p{Script=Han}A-Za-z0-9·]{2,12})/u);
 const noble=number(/(?:贵族等级|贵族)\s*[:：]?\s*(\d{1,2})/u);
 const profession=field(/(?:〖职业〗|职业|职阶)\s*[:：]?\s*([\p{Script=Han}A-Za-z]{2,14})/u);
 const level=number(/(?:角色等级|人物等级|当前等级|等级|〖等级〗)\s*[:：]?\s*(\d{1,4})(?!\d)/u);
 const power=field(/(?:战斗力|战力)\s*[:：]?\s*(\d+(?:\.\d+)?\s*(?:亿|万)?)/u);
 const stock=number(/(?:库存)\s*[:：]?\s*(\d{1,6})(?!\d)/u);
 const listingId=field(/(?:商品编号|账号编号|货号|商品ID|编号)\s*[:：]?\s*([A-Za-z0-9_-]{5,40})/u);
 const description=text.match(/(?:商品描述|账号描述|详细描述)\s*[:：]?\s*(.{10,240})/u)?.[1]?.split(/交易流程|购买须知|售后保障|举报|服务保障/u)[0]?.trim()||null;
 const headline=decodeEntities(String(html).match(/<(?:h1|h2)\b[^>]*>([\s\S]{1,220}?)<\/(?:h1|h2)>/i)?.[1]||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim().slice(0,150);
 return {server:server?server.replace(/^iOS\s*/i,'苹果'):null,skins,heroes,realname,rank,noble,profession,level,power,stock,listing_id:listingId,summary:description?.slice(0,240)||null,title:headline&&!/^(?:商品详情|商品信息|游戏账号|交易流程|猜你喜欢|相关推荐)$/u.test(headline)?headline:null};
}
function normalizeDetailGame(raw){
 const name=String(raw||'').trim();
 if(!name)return null;
 if(name==='枫之谷'||name==='冒险岛M')return '冒险岛';
 const match=GAME_CATALOG.find(g=>g.aliases.some(a=>name===a||name.startsWith(a+'-')||name.startsWith(a+'－')||name.startsWith(a+' ')||name.startsWith(a+'·')));
 return match?.name||name.split(/[-－|｜]/)[0].trim()||null;
}
async function verifyListing(raw,renderedHtml=null){
 let u;try{u=new URL(raw)}catch{return {status:'invalid_url',message:'无效商品链接'}}
 if(u.protocol!=='https:'||!HOSTS.has(u.hostname)||u.username||u.password||u.port)return {status:'unsupported_source',message:'不支持此域名'};
 const id=u.pathname.match(/goodsDetails\/([^/]+)/)?.[1]||null;
 if(KNOWN_SOLD.has(id))return {status:'sold',message:'已知售出商品，排除推荐',source_url:u.href,verified_at:null,price:null};
 try{
 let html;
 if(renderedHtml!==null){html=String(renderedHtml).slice(0,500000)}
 else {
  const r=await fetch(u.href,{redirect:'follow',signal:AbortSignal.timeout(8500),headers:{Accept:'text/html,application/xhtml+xml','User-Agent':'Mozilla/5.0 (compatible; GamePilot/1.0; +public-product-verification)'}});
  const contentType=r.headers.get('content-type')||'';
  if(r.status!==200||!contentType.includes('text/html'))return {status:'unverified',message:'详情页无法读取（HTTP '+r.status+'，可能需要移动端或登录）',http_status:r.status,source_url:u.href};
  html=(await r.text()).slice(0,500000);
 }
 const pageTitle=decodeEntities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]||'').slice(0,180);
 const textBody=decodeEntities(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' '));
 const gameLabel=textBody.match(/(?:所属游戏|游戏名称|游戏分类|游戏区服)\s*[:：]?\s*([\p{Script=Han}A-Za-z0-9·_-]{2,28})/u)?.[1]||null;
 const strongTitleGame=pageTitle.match(/^【?([\p{Script=Han}A-Za-z0-9·：_-]{2,24})】?(?:游戏)?(?:账号|帐号|成品号)(?:\s|[（【|：-]|$)/u)?.[1]||null;
 const titleGame=strongTitleGame&&!/(?:交易|商品|平台|卖号|买号|账号)/.test(strongTitleGame)?strongTitleGame:null;
 const detailGame=normalizeDetailGame(gameLabel)||GAME_CATALOG.find(g=>listingGameMatches(pageTitle,'',g))?.name||titleGame;
 const gmmsj=u.hostname.endsWith('gmmsj.com')?gmmsjDetail(html):null;const updatedAt=listingUpdatedAt(html);const stale=isStaleListing(updatedAt);
 const isProductHtml=/(?:商品编号|账号编号|商品详情|商品信息|商品售价|出售价格|商品价格|goodsDetails|sellingPrice|salePrice|goodsPrice)/i.test(html)||/application\/ld\+json/i.test(html);const detail=isProductHtml?extractDetailPrice(html):{price:null,price_evidence:'unknown',availability:null};const visible=isProductHtml?visibleDetailPrice(html):{price:null,price_evidence:'unknown'};
 // Search only the page title and explicit structured availability for strong sold evidence.
 const sold=gmmsj?.status==='sold'||/(已售出|已下架|已卖出|已售罄|sold out)/i.test(pageTitle)||/(?:OutOfStock|SoldOut|Discontinued)$/i.test(detail.availability||'');
 const live=gmmsj?.status==='listed'||/(?:InStock)$/i.test(detail.availability||'');
 return {status:sold?'sold':stale?'stale':live?'listed':'unverified',message:sold?'详情页明确显示售出或下架':stale?'商品最后更新超过180天，不能作为当前可售报价':live?'结构化库存标记为 InStock，尚未核验交易可完成':'页面可访问，但未找到可信的在售证据',updated_at:updatedAt,detail_game:detailGame,price:gmmsj?.price??detail.price??visible.price,price_evidence:gmmsj?.price!=null?gmmsj.price_evidence:detail.price!=null?detail.price_evidence:visible.price_evidence,availability_evidence:detail.availability||null,source_url:u.href,checked_at:new Date().toISOString(),verification_method:renderedHtml!==null?'Cloudflare Browser Run rendered HTML':'公开HTML与结构化商品数据',page_title:pageTitle,detail_attributes:extractListingAttributes(html)};
 }catch(e){return {status:'unverified',message:'详情页访问超时或受限',fetch_error:String(e?.name||'network_error'),source_url:u.href,price:null}}
}
async function enrichCandidates(candidates,env,trace=[]){
 // Verify unpriced leads first: these are the listings where a detail fetch can create a new price.
 // Round-robin across platforms so a single site's results cannot exhaust verification capacity.
 const byPlatform=new Map();for(const x of candidates){if(!byPlatform.has(x.platform))byPlatform.set(x.platform,[]);byPlatform.get(x.platform).push(x)}
 for(const xs of byPlatform.values())xs.sort((a,b)=>Number(a.price!=null)-Number(b.price!=null));
 const queue=[];while(queue.length<15){let added=false;for(const xs of byPlatform.values()){if(xs.length&&queue.length<15){queue.push(xs.shift());added=true}}if(!added)break}
 const checks=new Map();for(let i=0;i<queue.length;i+=15){const batch=queue.slice(i,i+15);const outcomes=await Promise.all(batch.map(x=>verifyListing(x.url)));batch.forEach((x,j)=>checks.set(x.url,outcomes[j]))}
 // At most two Browser Run sessions per search; prioritize price gaps from the marketplaces.
 // Static HTML remains primary, keeping a fast path for the majority of requests.
 const renderingCandidates=queue.filter(x=>{
  const hostname=new URL(x.url).hostname;
  const domain=hostname.endsWith('.5173.com')||hostname==='5173.com'?'5173.com':hostname.replace(/^www\./,'');
  const result=checks.get(x.url);
  return ['5173.com','gmmsj.com'].includes(domain)&&result&&!['sold','stale','wrong_game'].includes(result.status)&&
   (result.price==null||result.http_status!=null);
 }).slice(0,2);
 if(typeof env?.BROWSER?.quickAction!=='function'){
  trace.push({tool:'browser_render_summary',result:{configured:false,attempted:0,recovered_prices:0,reason:'browser_binding_missing'}});
 }else{
  let recovered=0,success=0;
  for(const candidate of renderingCandidates){
   const rendered=await browserRenderListing(candidate.url,env);
   if(rendered.ok){
    success++;
    const checked=await verifyListing(candidate.url,rendered.html);
    // Trust rendered HTML only when the page is still recognizably a product.
    // A challenge / unrelated page can never erase an existing static result.
    if(checked.price!=null||checked.detail_game||checked.status==='sold'){
     checks.set(candidate.url,{...checked,browser_rendered:true,browser_duration_ms:rendered.duration_ms});
     if(checked.price!=null)recovered++;
    }
   }
   trace.push({tool:'browser_render_detail',source:candidate.platform,result:{
    ok:rendered.ok,reason:rendered.ok?'rendered':rendered.reason,
    recovered_price:rendered.ok&&checks.get(candidate.url)?.browser_rendered===true&&checks.get(candidate.url)?.price!=null,
    http_status:rendered.http_status??null
   },duration_ms:rendered.duration_ms});
  }
  trace.push({tool:'browser_render_summary',result:{configured:true,attempted:renderingCandidates.length,succeeded:success,recovered_prices:recovered}});
 }

 return candidates.map(x=>{
  const v=checks.get(x.url);
  if(!v)return {...x,detail_check:'not_checked',verification:'尚未抓取商品详情'};
  const wrongGame=!!v.detail_game&&v.detail_game!==x.game;
  const gameUnconfirmed=!x.game_confirmed&&v.detail_game!==x.game;
  // A failed/blocked detail fetch cannot validate the index price. Preserve it only as an index lead.
  const detailVerified=v.price!=null&&v.status!=='sold'&&v.status!=='stale'&&!wrongGame;
  const priceConflict=detailVerified&&x.price!=null&&Math.abs(v.price-x.price)>0.01;
  const price=wrongGame||gameUnconfirmed||v.status==='stale'||v.status==='sold'?null:detailVerified?v.price:x.price;
  return {...x,server:v.detail_attributes?.server||x.server,skins:v.detail_attributes?.skins??x.skins,heroes:v.detail_attributes?.heroes??x.heroes,realname:v.detail_attributes?.realname??x.realname,detail_attributes:v.detail_attributes||null,detail_summary:v.detail_attributes?.summary||null,detail_listing_id:v.detail_attributes?.listing_id||null,title:(v.detail_attributes?.title&&(/详情待核验|商品详情|源站商品详情/.test(x.title)||x.title.length<12))?v.detail_attributes.title:x.title,status:wrongGame?'wrong_game':gameUnconfirmed?'game_unconfirmed':v.status,updated_at:v.updated_at||null,detail_game:v.detail_game||null,detail_check:wrongGame?'wrong_game':v.status,detail_http_status:v.http_status||null,detail_fetch_error:v.fetch_error||null,verification:wrongGame?'详情页游戏与搜索需求不一致':v.message,checked_at:v.checked_at||null,price,price_evidence:wrongGame?'wrong_game':gameUnconfirmed?'game_unconfirmed':price==null?(v.status==='stale'?'stale_listing':'unavailable'):detailVerified?v.price_evidence:x.price_evidence,price_source_label:wrongGame?'游戏不匹配（已排除）':price==null?'价格未获取':detailVerified?'商品详情提取价（非实时）':'搜索索引参考价（非实时）',detail_price:wrongGame?null:v.price??null,price_conflict:priceConflict,availability_evidence:v.availability_evidence||null};
 });
}
function coverageReport(candidates,trace){
 const hosts=['盼之账号','5173','G买卖'];
 const platforms=hosts.map(platform=>{const x=candidates.filter(c=>c.platform===platform);return {platform,discovered:x.length,with_price:x.filter(c=>c.price!=null).length,unpriced:x.filter(c=>c.price==null).length,detail_fetch_priced:x.filter(c=>c.detail_price!=null&&c.price_evidence!=='search_snippet').length,detail_checked:x.filter(c=>c.detail_check&&c.detail_check!=='not_checked').length,detail_priced:x.filter(c=>c.detail_price!=null).length,listed:x.filter(c=>c.status==='listed').length,sold:x.filter(c=>c.status==='sold').length,stale:x.filter(c=>c.status==='stale').length,enabled:SEARCH_DOMAINS.find(d=>d.platform===platform)?.enabled!==false,search_errors:trace.filter(t=>t.tool==='discover_'+({ '盼之账号':'pzds.com','5173':'5173.com','G买卖':'gmmsj.com'}[platform])&&t.result?.http_status).map(t=>t.result.http_status)}});
 return {platforms,totals:{discovered:candidates.length,with_price:candidates.filter(c=>c.price!=null).length,detail_checked:candidates.filter(c=>c.detail_check&&c.detail_check!=='not_checked').length,detail_priced:candidates.filter(c=>c.detail_price!=null).length,listed:candidates.filter(c=>c.status==='listed').length,sold:candidates.filter(c=>c.status==='sold').length,stale:candidates.filter(c=>c.status==='stale').length}};
}

const GAME_CATALOG=[
 {name:'王者荣耀',aliases:['王者荣耀','王者'],terms:['账号','成品号','皮肤','英雄'],server:true},
 {name:'冒险岛',aliases:['冒险岛M','冒险岛','MapleStory','枫之谷'],terms:['账号','角色','装备','金币','战力','职业'],server:false},
 {name:'原神',aliases:['原神','Genshin'],terms:['账号','角色','五星','命座','武器'],server:false},
 {name:'和平精英',aliases:['和平精英','吃鸡'],terms:['账号','皮肤','载具','军需'],server:false},
 {name:'地下城与勇士',aliases:['地下城与勇士','DNF','地下城'],terms:['账号','角色','装备','增幅'],server:false},
 {name:'英雄联盟',aliases:['英雄联盟','LOL'],terms:['账号','皮肤','段位','英雄'],server:false},
 {name:'永劫无间',aliases:['永劫无间'],terms:['账号','皮肤','武器'],server:false},
 {name:'逆水寒',aliases:['逆水寒'],terms:['账号','角色','装备'],server:false}
];
function detectGame(q){const text=String(q||'').toLowerCase();return GAME_CATALOG.find(g=>g.aliases.some(a=>text.includes(a.toLowerCase())))||null}
// Universal fallback: extract a game title from an explicit purchase request.
// No fabricated catalog entries; ambiguous messages still require clarification.
// One canonical resolver for search and chat. The latest explicit game wins over old context.
function resolveGame(query,filters={}){
 const input=String(query||'').trim();
 const quoted=input.match(/[《「]([^》」]{2,36})[》」]/u);
 const text=input.replace(/(?:游戏账号|成品号|游戏号|账号|帐号|账户|买号|号\s*$)[\s\S]*$/u,'');
 let candidate=(quoted?.[1]||text)
  .replace(/(?:预算|不超过|低于|最多|上限|价格)?\s*[¥￥]?\s*\d{2,7}\s*(?:元|块)?\s*(?:以内|以下|左右|上下)?\s*(?:的)?/g,' ')
  .replace(/^(?:(?:请|麻烦|可以|能不能|帮我|给我|我想|我需要|我要|想要|需要|推荐|搜索|搜|找|买|购买|看看|求购|一下|一个|一款|一些|个|的)\s*)+/u,'')
  .replace(/^(?:的\s*)+/u,'').replace(/(?:游戏|的)\s*$/u,'').trim();
 // "从原神换成三角洲账号" must resolve to 三角洲, not the old game.
 candidate=candidate.split(/(?:换成|切换到|改找|改搜|改成)/u).at(-1).trim();
 const hasProductIntent=/(?:游戏账号|成品号|游戏号|账号|帐号|账户|买号|号\s*$)/u.test(input)||!!quoted;
 if(hasProductIntent&&candidate.length>=2&&candidate.length<=35&&!/(?:\d{2,7}\s*(?:元|块)|^(?:游戏|一个|高战力|高等级|账号)$)/u.test(candidate)){
  const lookup=candidate.replace(/^(?:(?:苹果|安卓)(?:QQ|微信|区)|iOS区|国际服|台服|国服)\s*/gi,'').replace(/\s*(?:(?:苹果|安卓)(?:QQ|微信|区)|iOS区|国际服|台服|国服)$/gi,'').trim();
  const known=GAME_CATALOG.find(g=>g.aliases.some(a=>{
   const v=lookup.toLowerCase(),p=a.toLowerCase();
   return v===p||(v.startsWith(p)&&/^(?:苹果|安卓|qq|微信|国服|台服|国际服|手游|端游|pc|高战力|高等级|皮肤多|装备好|五星角色)*$/i.test(v.slice(p.length)));
  }));
  return known||{name:candidate,aliases:[candidate],server:false,universal:true};
 }
 // Only if a message lacks a new game may prior state be used.
 const known=detectGame(input);
 if(known)return known;
 const fallback=String(filters.game||'').trim();
 if(!fallback)return null;
 return GAME_CATALOG.find(g=>g.name===fallback||g.aliases.some(a=>a.toLowerCase()===fallback.toLowerCase()))||{name:fallback,aliases:[fallback],server:false,universal:true};
}
function gameMatches(text,game){const t=String(text||'').toLowerCase();return game.aliases.some(a=>t.includes(a.toLowerCase()))}
// Title is the listing identity; descriptions may include unrelated SEO recommendations.
const GAME_EXCLUSION_MARKERS=[
 {game:'冒险岛',re:/(?:剑刃舞者|黑骑士\s*\d{2,3}级|双刀\s*\d+s|冒险岛|枫之谷|MapleStory)/i},
 {game:'王者荣耀',re:/(?:王者荣耀|王者账号|王者皮肤|苹果QQ|安卓QQ|苹果微信|安卓微信)/i},
 {game:'地下城与勇士',re:/(?:地下城与勇士|DNF|地下城账号|增幅\s*\+?\d+)/i},
 {game:'原神',re:/(?:原神|Genshin|命座)/i},
 {game:'和平精英',re:/(?:和平精英|吃鸡账号)/i},
 {game:'英雄联盟',re:/(?:英雄联盟|LOL)/i},
 {game:'永劫无间',re:/(?:永劫无间)/i},
 {game:'逆水寒',re:/(?:逆水寒)/i}
];
function listingGameMatches(title,description,game){
 const t=String(title||'').replace(/(?:[-|_－])\s*(?:盼之代售|盼之账号|G买卖|5173|游戏账号交易平台).*$/i,'').trim();
 const other=GAME_EXCLUSION_MARKERS.filter(x=>x.game!==game.name&&x.re.test(t));
 if(other.length)return false;
 if(gameMatches(t,game))return true;
 // No game-specific evidence in the title: do not trust SEO snippet descriptions.
 return false;
}
// Trust a source's explicitly labeled game category, never an arbitrary SEO recommendation snippet.
// Generic identity evidence for any game, including titles absent from GAME_CATALOG.
// Search snippets are not authoritative: only a title or explicitly labeled category can confirm.
function genericGameEvidence(title,description,game){
 const name=String(game?.name||'').trim();
 if(!name)return false;
 const t=String(title||'').split(/(?:[-|－]\s*(?:盼之代售|盼之账号|G买卖|5173|游戏账号交易平台))/i)[0];
 if(t.toLocaleLowerCase().includes(name.toLocaleLowerCase()))return true;
 const d=String(description||'').slice(0,1600);
 const label=d.match(/(?:所属游戏|游戏名称|游戏分类|游戏区服)\s*[:：]?\s*([^\s,，|｜;；<>]{2,55})/i);
 return !!label&&label[1].toLocaleLowerCase().includes(name.toLocaleLowerCase());
}
function labeledListingGame(title,description,game){
 if(genericGameEvidence(title,description,game))return true;
 if(listingGameMatches(title,'',game))return true;
 const d=String(description||'').slice(0,1500);
 const m=d.match(/(?:游戏区服|所属游戏|游戏名称|游戏分类)\s*[:：]?\s*(王者荣耀|冒险岛M?|枫之谷|原神|和平精英|地下城与勇士|英雄联盟|永劫无间|逆水寒)/i);
 if(!m)return false;
 const category=m[1];if(game.name==='冒险岛')return /^(?:冒险岛|枫之谷)/.test(category);
 return category===game.name;
}
function mapleEditionMatches(title,version){
 if(!version)return true;
 const t=String(title||'');
 const mobile=/(?:冒险岛M|MapleStory\s*M|手游版|手机版)/i.test(t);
 const global=/(?:国际服|Global|GMS)/i.test(t);
 const taiwan=/(?:台服|枫之谷|TMS)/i.test(t);
 const china=/(?:国服|盛趣)/i.test(t);
 if(version==='手游版')return mobile;
 if(mobile)return false;
 if(version==='国际服')return global&&!taiwan&&!china;
 if(version==='台服／枫之谷')return taiwan&&!global&&!china;
 if(version==='国服')return china&&!global&&!taiwan;
 return false;
}
function editionEvidence(text,edition,gameName){
 const version=String(edition||'').trim();if(!version)return true;
 if(gameName==='冒险岛')return mapleEditionMatches(text,version);
 const aliases={ '台服／枫之谷':['台服','枫之谷','TMS'],'台服':['台服','臺服','台湾服','台灣服'],'国际服':['国际服','全球服','GMS','Global'],'国服':['国服','大陆服','简中服'],'日服':['日服','日本服','JP'],'韩服':['韩服','韩国服','KR'],'手游版':['手游版','手机版','移动端']};
 const words=aliases[version]||[version];
 return words.some(word=>String(text||'').toLowerCase().includes(word.toLowerCase()));
}
function requirements(query,filters,game){
 const q=String(query||'');
 const budget=Number(filters.max_price)||1000;
 const hard=[{field:'game',value:game.name},{field:'price',max:budget}];
 if(game.server&&filters.server&&filters.server!=='all')hard.push({field:'server',value:filters.server});
 if(game.server&&filters.realname==='yes')hard.push({field:'realname',value:true});
 const soft=[];
 if(/高战力|战力高|战力越高/.test(q))soft.push('战力高');
 if(/装备好|装备强|毕业装备/.test(q))soft.push('装备好');
 if(/皮肤多|皮肤越多/.test(q))soft.push('皮肤多');
 if(/高等级|等级高/.test(q))soft.push('等级高');
 const profession=q.match(/(?:职业|职阶)\s*[:：为是]?\s*(黑骑士|剑刃舞者|弓箭手|法师|战士|飞侠|海盗|夜使者|双弩精灵|主教)/)?.[1]||filters.profession;
 if(profession)hard.push({field:'profession',value:profession});
 return {game:game.name,hard,soft,budget,flex_budget:Math.round(budget*1.3),price_policy:'只比较有明确价格证据的候选；索引价格非实时',inventory_policy:'未核验在售不得宣称可购买'};
}
function evaluateCandidate(x,req){
 const failures=[],unknown=[],positive=[],full=x.title+' '+x.description;
 for(const h of req.hard){
  if(h.field==='game'&&x.detail_game&&x.detail_game!==req.game)failures.push('详情游戏不匹配');else if(h.field==='game'&&!(x.game_confirmed||x.detail_game===req.game||labeledListingGame(x.title,x.description,GAME_CATALOG.find(g=>g.name===req.game)||{name:req.game,aliases:[req.game]})))failures.push('游戏不匹配');
  if(h.field==='price'&&x.price!=null&&x.price>h.max)failures.push('超过预算');
  if(h.field==='price'&&x.price==null)unknown.push('价格缺失');
  if(h.field==='server'&&x.server&&(h.value==='苹果区'?!x.server.startsWith('苹果'):h.value==='安卓区'?!x.server.startsWith('安卓'):x.server!==h.value))failures.push('区服不匹配');
  if(h.field==='server'&&!x.server)unknown.push('区服未核实');
  if(h.field==='realname'&&x.realname===false)failures.push('不支持二次实名');
  if(h.field==='realname'&&x.realname==null)unknown.push('实名状态未核实');
  if(h.field==='profession'){const known=full.match(/(?:职业|职阶)\s*[:：为是]?\s*(黑骑士|剑刃舞者|弓箭手|法师|战士|飞侠|海盗|夜使者|双弩精灵|主教)/)?.[1]||full.match(/(?:黑骑士|剑刃舞者|夜使者|双弩精灵|主教)/)?.[0];if(known&&known!==h.value)failures.push('职业不匹配');else if(!known)unknown.push('职业未核实')}
 }
 for(const term of req.soft){const hit=term==='战力高'?/战力\s*[:：]?\s*\d{4,}/.test(full):term==='装备好'?/装备|神装|毕业/.test(full):term==='皮肤多'?x.skins!=null&&x.skins>=150:term==='等级高'?/等级\s*[:：]?\s*(?:2\d\d|3\d\d)/.test(full):false;if(hit)positive.push(term);else unknown.push(term+'缺少证据')}
 const fit=failures.length?'rejected':unknown.length?'partial':'matched';
 const score=failures.length?0:Math.max(10,Math.min(95,45+positive.length*12-unknown.length*7+(x.price<=req.budget?15:0)));
 return {fit,score,failures,unknown,positive,reason:failures.length?'硬性条件不符':unknown.length?'部分属性未核实':'已知条件匹配（库存仍待核验）'};
}
function searchPlans(game,filters){
 // Parameterized by game, never manually configure one game's inventory.
 const names=[...new Set([game.name,...(game.aliases||[])])].filter(x=>x&&x.length>=2);
 return SEARCH_DOMAINS.flatMap(d=>{
  const name=names[0];
  const other=names[1]||name;
  const searches=d.host==='5173.com'?[
   ['shop.5173.com',name+' 账号'],
   ['s.5173.com',name+' 商品'],
   ['5173.com',name+' 账号 价格'],
   ['shop.5173.com',other+' 账号'],
   ['s.5173.com',other+' 商品'],
   ['5173.com',name+' 商品详情']
  ]:d.host==='gmmsj.com'?[
   ['gmmsj.com/h5/goods/detail',name+' 账号'],
   ['gmmsj.com/dy',name+' 账号'],
   ['gmmsj.com',name+' 账号 价格'],
   ['gmmsj.com/h5/goods/detail',other+' 商品详情'],
   ['gmmsj.com/dy',other+' 账号'],
   ['gmmsj.com',name+' 商品详情']
  ]:[
   ['pzds.com',name+' 账号 出售'],
   ['pzds.com',name+' 成品号'],
   ['pzds.com',name+' 账号 价格'],
   ['pzds.com',other+' 账号'],
   ['pzds.com',name+' 商品详情'],
   ['pzds.com',other+' 成品号']
  ];
  return searches.map(([site,term],i)=>({d,q:'site:'+site+' '+term,offset:0,variant:i}));
 });
}
const SEARCH_DOMAINS=[{host:'pzds.com',platform:'盼之账号'},{host:'5173.com',platform:'5173'},{host:'gmmsj.com',platform:'G买卖'}];
function isProductPage(u,domain){
 const p=u.pathname,h=u.hostname;
 if(domain==='pzds.com')return /^\/goodsDetails\/[a-z0-9]+(?:\/\d+)?\/?$/i.test(p);
 if(domain==='gmmsj.com'){
  if(/\/detail_[a-z0-9]+\.shtml$/i.test(p))return true;
  return /^\/h5\/goods\/detail\/index\.html$/i.test(p)&&/^\d{12,50}$/.test(u.searchParams.get('book_id')||'');
 }
 if(domain==='5173.com'){
  if(!['5173.com','www.5173.com','shop.5173.com','s.5173.com','old.5173.com'].includes(h))return false;
  // Recognize stable product IDs even when 5173 changes its detail route.
  // Never classify search, category, cart, checkout or login URLs as products.
  if(/\/(?:search|list|category|cart|checkout|order|login|register|payment)(?:\/|\.|$)/i.test(p))return false;
  const last=p.split('/').filter(Boolean).at(-1)||'';
  const queryId=['goodsId','goodsid','productId','itemId','bizOfferId'].map(k=>u.searchParams.get(k)).find(x=>/^[a-z0-9_-]{8,}$/i.test(x||''));
  const detailPath=/(?:goods?|products?|details?|items?|offers?|account|sale|trade)/i.test(p);
  return !!(detailPath&&((/^[a-z0-9_-]{8,}$/i.test(last)&&/[\d_-]/.test(last))||queryId));
 }
 return false;
}
function extractPrice(s,opts={}){
 const t=String(s||'').replace(/,/g,'').replace(/\s+/g,' ');
 const label=/(?:商品售价|出售价格|商品价格|当前售价|一口价|售价|现价|到手价|标价)\s*[:：]?\s*[¥￥]?\s*([1-9]\d{0,6}(?:\.\d{1,2})?)(?!\s*(?:级|s|S|刀|双刀))/g;
 const currency=/[¥￥]\s*([1-9]\d{0,6}(?:\.\d{1,2})?)(?!\s*(?:级|s|S|刀|双刀))/g;
 const patterns=opts.requireLabel?[label]:[label,currency];
 for(const re of patterns)for(const m of t.matchAll(re)){
  const v=Number(m[1]),before=t.slice(Math.max(0,m.index-25),m.index);
  if(v>=10&&v<=1000000&&!/(?:优惠券|可领|领券|新人券|返现|满减|运费|服务费|原价|划线价|推荐|相似)/.test(before))return v;
 }
 return null;
}
function isGenericPage(title,description,game){
 const t=String(title||'').trim(),d=String(description||'');
 const generic=/(?:交易平台|交易网|账号交易平台|游戏账号交易|游戏交易平台|账号买卖平台|首页|商品列表|账号交易网)/;
 // Platform SEO suffixes often contain 交易平台 even for real individual listings.
 const listingEvidence=/(?:账号编号|商品编号|货号|编号\s*[A-Z0-9]{5,}|皮肤\s*\d+|英雄\s*\d+|等级\s*\d+|[¥￥]\s*\d+|售价\s*[:：]?\s*\d+)/i.test(t+' '+d);
 return !gameMatches(t+' '+d,game)||(!listingEvidence&&generic.test(t));
}
function cleanText(s){return String(s||'').replace(/<[^>]*>/g,' ').replace(/&[^; ]+;/g,' ').replace(/\s+/g,' ').slice(0,700)}
// First-party public category feed: source is explicitly mainland MapleStory, never TMS/GMS.
// Extract a price only from a short source HTML card enclosing this exact product ID.
// This prevents coupons and prices of neighboring cards from becoming fabricated quotes.
function gmmsjCardEvidence(html,linkIndex,productId){
 const source=String(html||''),start=Math.max(0,linkIndex-6000);
 const opens=[...source.slice(start,linkIndex).matchAll(/<(li|article|section|div)\b[^>]*>/gi)].reverse().slice(0,48);
 for(const opening of opens){
  const tag=opening[1].toLowerCase(),offset=start+opening.index;
  if(linkIndex-offset>4500)continue;
  const tags=new RegExp('<(/?)'+tag+'\\b[^>]*>','gi');
  let depth=0,end=-1;
  for(const token of source.slice(offset,offset+9000).matchAll(tags)){
   depth+=token[1]?-1:1;
   if(depth===0){end=offset+token.index+token[0].length;break}
  }
  if(end<=linkIndex||end-offset>7000)continue;
  const card=source.slice(offset,end);
  const ids=[...card.matchAll(/detail_([a-z0-9]+)\.shtml/gi)].map(m=>m[1].toLowerCase());
  if(!ids.length||new Set(ids).size!==1||ids[0]!==String(productId).toLowerCase())continue;
  const plain=decodeEntities(card.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ')).trim();
  if(plain.length>1800)continue;
  const labeled=[...plain.matchAll(/(?:商品售价|当前售价|出售价格|售价|现价|一口价)\s*[:：]?\s*[¥￥]?\s*([1-9]\d{0,6}(?:\.\d{1,2})?)/gi)].map(m=>Number(m[1])).filter(v=>v>=10&&v<=1000000);
  const prices=[...plain.matchAll(/[¥￥]\s*([1-9]\d{0,6}(?:\.\d{1,2})?)/g)].filter(m=>!/(?:优惠券|可领|领券|返券|返现|抵扣|满减|折扣|运费|服务费|原价|划线价)\s*[:：]?\s*$/.test(plain.slice(Math.max(0,m.index-32),m.index))).map(m=>Number(m[1])).filter(v=>v>=10&&v<=1000000);
  const unique=[...new Set(labeled.length?labeled:prices)];
  if(unique.length!==1)continue;
  const title=plain.match(/(?:账号|帐号)\s*(\[[^\]]{2,45}\][\s\S]{5,145}?)(?=\s*(?:可用优惠券|商品类型|游戏区服|[¥￥]|查看详情|立即购买))/u)?.[1]?.trim().slice(0,125)||null;
  return {price:unique[0],title};
 }
 return {price:null,title:null};
}
async function gmmsjCategoryLeads(game,filters){
 if(game?.name!=='冒险岛'||(filters.version&&filters.version!=='国服'))return {items:[],diagnostic:'edition_not_supported'};
 const source='https://www.gmmsj.com/dy/5_zh.shtml?sourceType=4&special=1';
 try{
  const response=await fetch(source,{signal:AbortSignal.timeout(8500),headers:{Accept:'text/html','User-Agent':'Mozilla/5.0 (compatible; GamePilot/1.0)'}});
  if(!response.ok)return {items:[],diagnostic:'http_'+response.status};
  const html=(await response.text()).slice(0,1100000);
  const links=[...html.matchAll(/(?:href\s*=\s*["'])([^"']*(?:\/dy\/5_zh\/)?detail_[a-z0-9]+\.shtml[^"']*)["']/gi)];
  // Some marketplace cards expose product URLs in data attributes or inline navigation, not href.
  const fallback=[...html.matchAll(/(?:\/dy\/5_zh\/)?detail_[a-z0-9]+\.shtml/gi)];
  for(const m of fallback)if(!links.some(x=>x[1]===m[0]))links.push([m[0],m[0],m.index]);
  const unique=new Map();
  for(const m of links){
   let url;try{const href=decodeEntities((m[1]||m[0]).replace(/&amp;/g,'&'));url=new URL(href.startsWith('detail_')?'/dy/5_zh/'+href:href,source)}catch{continue}
   if(url.hostname!=='www.gmmsj.com'||!isProductPage(url,'gmmsj.com')||unique.has(url.pathname))continue;
   // Only attach title information from this link's own anchor; nearby links may belong to OTHER products.
   const tagStart=html.lastIndexOf('<a',m.index);
   const tagEnd=html.indexOf('</a>',m.index);
   const anchorHtml=tagStart>=0&&tagStart>m.index-900&&tagEnd>m.index&&tagEnd<m.index+1200?html.slice(tagStart,tagEnd+4):'';
   const anchorTitle=cleanText(decodeEntities(anchorHtml.replace(/<[^>]+>/g,' '))).trim();
   const titleFromLink=anchorTitle.length>=10&&!/^(?:查看详情|立即购买|点击查看|商品详情|账号商品详细信息)/.test(anchorTitle)?anchorTitle.slice(0,125):null;
   const productId=url.pathname.split('/').pop().replace(/\.shtml$/,'').replace(/^detail_/,'');
   const card=gmmsjCardEvidence(html,m.index,productId);
   const listingTitle=titleFromLink||card.title;
   const title=listingTitle?'冒险岛 '+listingTitle:'冒险岛商品 '+productId.slice(-10)+'（详情待核验）';
   const nearby=listingTitle?'商品卡片文字：'+listingTitle:'来自G买卖冒险岛分类页，账号属性等待详情验证';
   unique.set(url.pathname,{id:'gmmsj.com:'+url.pathname.split('/').pop(),game:'冒险岛',platform:'G买卖',url:url.href,title,description:nearby+' 【冒险岛国服分类页】',server:null,price:card.price,price_evidence:card.price!=null?'gmmsj_category_visible_price':'unknown',price_source_label:card.price!=null?'G买卖商品列表标价（非实时）':'详情待核验',status:'unverified',game_confirmed:true,skins:null,heroes:null,realname:null,verification:card.price!=null?'官方分类页商品卡片可见标价，库存与详情价格仍需核验':'官方冒险岛国服分类页商品链接，详情信息尚未核验',discovered_at:new Date().toISOString(),kind:'category_lead',match_score:45,match_reasons:[]});
   if(unique.size>=35)break;
  }
  return {items:[...unique.values()],diagnostic:unique.size?'ok':'no_product_links_in_html',links_found:links.length};
 }catch(e){return {items:[],diagnostic:'fetch_failed'};}
}
// Browser-assisted discovery from search-indexed CATEGORY pages, not random SEO pages.
// Category URLs are selected only when the result explicitly references the requested game.
function isMarketplaceCategoryPage(u,domain){
 if(u.protocol!=='https:'||!HOSTS.has(u.hostname)||u.username||u.password||u.port||isProductPage(u,domain))return false;
 if(domain==='gmmsj.com')return /^\/dy\/\d+_zh\.shtml$/i.test(u.pathname);
 if(domain==='5173.com')return /\/(?:search|list|category|game|account|shop)(?:\/|\.|$)/i.test(u.pathname)&&u.pathname.length>6;
 return false;
}
function extractProductLinksFromHtml(html,source,game,domain,platform){
 const refs=[];
 for(const m of String(html||'').matchAll(/\b(?:href|data-href|data-url)\s*=\s*["']([^"'<>]+)["']/gi))refs.push(m[1]);
 if(domain==='gmmsj.com'){
  for(const m of String(html||'').matchAll(/(?:\/h5\/goods\/detail\/index\.html\?book_id=\d+[^"'\s<>]*|(?:\/dy\/\d+_zh\/)?detail_[a-z0-9]+\.shtml)/gi))refs.push(m[0]);
 }
 const leads=new Map();
 for(const raw of refs){
  let u;try{
   let href=decodeEntities(raw);
   const categoryPath=new URL(source).pathname;
   if(/^detail_[a-z0-9]+\.shtml/i.test(href)&&/^\/dy\/\d+_zh\.shtml$/i.test(categoryPath))
    href=categoryPath.replace(/\.shtml$/i,'/')+href;
   u=new URL(href,source);
  }catch{continue}
  if(u.protocol!=='https:'||!HOSTS.has(u.hostname)||!isProductPage(u,domain))continue;
  const id=u.searchParams.get('book_id')||u.pathname.split('/').filter(Boolean).at(-1);
  if(!id||leads.has(u.href))continue;
  leads.set(u.href,{
   id:domain+':'+id,game:game.name,platform,url:u.href,
   title:'源站商品详情（标题待核验）',
   description:'由公开游戏分类页发现，游戏和价格以商品详情页为准',
   server:null,price:null,price_evidence:'unknown',price_source_label:'未取得价格',
   status:'unverified',game_confirmed:false,identity_pending:true,
   skins:null,heroes:null,realname:null,
   verification:'Browser Run 识别到商品详情链接，尚未核验商品身份和价格',
   discovered_at:new Date().toISOString(),kind:'browser_category_lead',match_score:0,match_reasons:[]
  });
  if(leads.size>=12)break;
 }
 return [...leads.values()];
}
async function browserDiscoverCategory(category,game,env){
 let u;try{u=new URL(category.url)}catch{return {items:[],status:'invalid_url'}};
 if(!isMarketplaceCategoryPage(u,category.domain))return {items:[],status:'unsupported_category'};
 if(typeof env?.BROWSER?.quickAction!=='function')return {items:[],status:'browser_binding_missing'};
 try{
  const response=await env.BROWSER.quickAction('content',{url:u.href,gotoOptions:{waitUntil:'networkidle2'}});
  if(!response?.ok)return {items:[],status:'http_'+(response?.status||'unknown')};
  const html=(await response.text()).slice(0,900000);
  if(/(?:人机验证|Access Denied|Just a moment|captcha)/i.test(html.slice(0,14000)))return {items:[],status:'source_challenge'};
  const items=extractProductLinksFromHtml(html,u.href,game,category.domain,category.platform);
  return {items,status:items.length?'ok':'no_detail_links'};
 }catch(e){return {items:[],status:'render_failed',error_type:String(e?.name||'unknown').slice(0,40)}}
}
async function discover(query,filters,env,options={}){
 // Public category feeds can still discover leads when Brave is missing or rate-limited.
 const trace=[],results=new Map(),categoryPages=new Map(),game=resolveGame(query,filters),server=game?.server&&filters.server!=='all'?filters.server:'';
 if(!game)return {candidates:[],trace:[{tool:'resolve_game',result:{error:'missing_game_name'}}],reason:'missing_game_name',message:'请提供具体游戏名称，例如「找鸣潮账号」'};
 // Limit request fan-out to avoid exhausting search API quotas; distribute across all platforms.
 const feed=game.universal?{items:[],diagnostic:'universal_search'}:await gmmsjCategoryLeads(game,filters);for(const item of feed.items)results.set(item.url,item);trace.push({tool:'gmmsj_category',result:{status:feed.diagnostic,detail_pages:feed.items.length,links_found:feed.links_found||0}});
 const allPlans=env.BRAVE_SEARCH_API_KEY?searchPlans(game,filters):[];
 if(!env.BRAVE_SEARCH_API_KEY)trace.push({tool:'search_configuration',result:{error:'BRAVE_SEARCH_API_KEY_missing',message:'搜索引擎未配置，无法检索国际服等非直连商品'}});
 const plans=[];const startIndex=options.retry?2:0,endIndex=options.retry?6:2;for(let i=startIndex;i<endIndex;i++)for(const host of SEARCH_DOMAINS){const p=allPlans.filter(x=>x.d.host===host.host)[i];if(p)plans.push(p)}
 for(let batch=0;batch<plans.length;batch+=4){await Promise.all(plans.slice(batch,batch+4).map(async({d,q,offset})=>{
  const t=Date.now();try{
   const u=new URL('https://api.search.brave.com/res/v1/web/search');u.searchParams.set('q',q);u.searchParams.set('count','20');u.searchParams.set('offset',String(offset));u.searchParams.set('text_decorations','false');
   const r=await fetch(u,{headers:{Accept:'application/json','X-Subscription-Token':env.BRAVE_SEARCH_API_KEY},signal:AbortSignal.timeout(8500)});
   if(!r.ok){let detail='';try{const err=await r.json();detail=String(err?.error?.detail||err?.detail||'').slice(0,180);const fields=err?.error?.meta?.errors;if(Array.isArray(fields))detail+=' '+fields.map(x=>String(x.loc?.join('.')||'')+': '+String(x.msg||'')).join('; ').slice(0,220)}catch{}trace.push({tool:'discover_'+d.host,query:q,result:{http_status:r.status,error_detail:detail||'upstream_error'},duration_ms:Date.now()-t});return}
   const j=await r.json();let valid=0,hostMatched=0,productMatched=0,serverRejected=0,soldRejected=0,priced=0,genericRejected=0,duplicateRejected=0;for(const hit of j.web?.results||[]){
    let link;try{link=new URL(hit.url)}catch{continue}
    if(link.protocol!=='https:'||!(link.hostname===d.host||link.hostname.endsWith('.'+d.host)))continue;
    hostMatched++;
    if(!isProductPage(link,d.host)){
     const title=cleanText(hit.title),description=cleanText(hit.description);
     if(!categoryPages.has(d.host)&&isMarketplaceCategoryPage(link,d.host)&&
        labeledListingGame(title,description,game))categoryPages.set(d.host,{url:link.href,domain:d.host,platform:d.platform});
     continue;
    }
    productMatched++;
    const id=link.searchParams.get('book_id')||link.pathname.match(/goodsDetails\/([^/]+)/)?.[1]||link.pathname.split('/').filter(Boolean).pop();
    if(KNOWN_SOLD.has(id)){soldRejected++;continue}if(results.has(link.href)){duplicateRejected++;continue}
    const title=cleanText(hit.title),description=cleanText(hit.description),full=title+' '+description;const gameConfirmed=labeledListingGame(title,description,game);const hasOtherGame=GAME_CATALOG.some(g=>g.name!==game.name&&listingGameMatches(title,'',g));if(!gameConfirmed&&hasOtherGame){genericRejected++;continue}
    // Strong product URLs may have generic index titles; let the actual detail page establish game identity.
    // Keep them provisional, never display them as recommendations until identity is verified.
    const pendingIdentity=!gameConfirmed;
    if(pendingIdentity&&!isProductPage(link,d.host)){genericRejected++;continue;}
    // Edition is validated after fetching detail evidence; do not discard indexed leads here.
    const foundServer=game.server?(title.match(/安卓QQ|苹果QQ|安卓微信|苹果微信/)?.[0]||null):null;
    if(server&&foundServer&&foundServer!==server){serverRejected++;continue}
    if(/已下架|已售出|已卖出|已售罄|已下单|已交易|sold out/i.test(full)){soldRejected++;continue}const rawPrice=extractPrice(title)??extractPrice(description,{requireLabel:true});const price=rawPrice!=null&&rawPrice<10?null:rawPrice;if(price!=null)priced++;const skins=Number(title.match(/(?:皮肤(?:数量|数)?|皮肤)\s*[:：]?\s*(\d{2,4})/)?.[1])||null;
    const heroes=Number(title.match(/(?:英雄(?:数量|数)?|英雄)\s*[:：]?\s*(\d{2,4})/)?.[1])||null;
    const realname=/不可二次实名|不可二改|不支持二次实名/.test(title)?false:/可二次实名|支持二次实名|可二改/.test(title)?true:null;
    results.set(link.href,{id:d.host+':'+id,game:game.name,platform:d.platform,url:link.href,title,description,server:foundServer,price,price_evidence:price===null?'unknown':'search_snippet',price_source_label:price===null?'价格未获取':'搜索索引参考价（非实时）',status:'unverified',game_confirmed:gameConfirmed,identity_pending:pendingIdentity,skins,heroes,realname,verification:'搜索索引，未核验实时在售',discovered_at:new Date().toISOString(),kind:'discovered',match_score:0,match_reasons:[]});valid++;
   }
   trace.push({tool:'discover_'+d.host,query:q,result:{raw_results:(j.web?.results||[]).length,host_matched:hostMatched,product_url_matched:productMatched,server_rejected:serverRejected,known_sold_rejected:soldRejected,generic_rejected:genericRejected,duplicate_rejected:duplicateRejected,priced_in_snippet:priced,detail_pages:valid},duration_ms:Date.now()-t});
  }catch(e){trace.push({tool:'discover_'+d.host,query:q,result:{error:'timeout_or_network_error'},duration_ms:Date.now()-t})}
 }));}
 if(typeof env?.BROWSER?.quickAction==='function'){
  // Render at most one indexed category per marketplace and only when it has no direct products.
  for(const d of SEARCH_DOMAINS.filter(x=>x.host==='5173.com'||x.host==='gmmsj.com')){
   const category=categoryPages.get(d.host);
   if(!category||[...results.values()].some(x=>x.platform===d.platform))continue;
   const start=Date.now(),rendered=await browserDiscoverCategory(category,game,env);
   let added=0;for(const lead of rendered.items){if(!results.has(lead.url)){results.set(lead.url,lead);added++}}
   trace.push({tool:'browser_category_'+d.host,source_url:category.url,result:{status:rendered.status,detail_pages:added,rendered:true},duration_ms:Date.now()-start});
  }
 }
 // Official 5173 account marketplace fallback: submit the game via the public site's search UI.
 if(!options.retry&&typeof env?.BROWSER?.quickAction==='function'&&![...results.values()].some(x=>x.platform==='5173')){
  let status='not_run',added=0,attempts=[],ms=0;
  const start=Date.now();
  try{
   const module=await import('./platform5173.js');
   const found=await module.browserSearch5173(game.name,env.BROWSER);
   status=found.status;attempts=found.trace||[];
   if(found.html&&found.url){
    const links=extractProductLinksFromHtml(found.html,found.url,game,'5173.com','5173');
    for(const lead of links){if(!results.has(lead.url)){results.set(lead.url,lead);added++}}
   }
  }catch(e){status='native_browser_error';attempts.push({result:'module_or_launch_failed',error_type:String(e?.name||'unknown').slice(0,50)})}
  ms=Date.now()-start;
  trace.push({tool:'browser_native_5173',result:{status,detail_pages:added,steps:attempts},duration_ms:ms});
 }
 const all=[...results.values()];
 // Do not silently discard unknown attributes. Instead label uncertainty and rank lower.
 for(const x of all){let score=40,reasons=[];if(server){if(x.server===server){score+=25;reasons.push('区服匹配')}else if(!x.server){score-=12;reasons.push('区服未知')}else score-=100}
 if(x.price!=null){if(x.price<=filters.max_price){score+=20;reasons.push('索引价在预算内')}else if(x.price<=filters.max_price*1.1){score+=6;reasons.push('索引价略超预算（10%内）')}else if(x.price<=filters.max_price*1.3){score-=12;reasons.push('索引价超预算10%至30%')}else{score-=35;reasons.push('索引价超出弹性预算')}}else{score-=15;reasons.push('价格未知')}
 if(game.server&&filters.realname==='yes'){if(x.realname===true){score+=15;reasons.push('索引注明可二次实名')}else if(x.realname===false){score-=40;reasons.push('不满足实名条件')}else{score-=8;reasons.push('实名未知')}}
 if(game.name==='王者荣耀'&&x.skins!=null){score+=Math.min(12,Math.floor(x.skins/30));reasons.push('皮肤数量可提取')}
 x.match_score=Math.max(0,Math.min(100,score));x.match_reasons=reasons;x.match_level=(server&&x.server!==server)||(game.server&&filters.realname==='yes'&&x.realname!==true)||(x.price===null)?'incomplete':'candidate';
 }
 all.sort((a,b)=>{const tier=x=>x.price===null?2:x.price<=filters.max_price?0:x.price<=filters.max_price*1.1?1:3;return tier(a)-tier(b)||b.match_score-a.match_score});
 return {candidates:all.slice(0,80),trace,reason:all.length?'found':'no_detail_candidates',message:all.length?'已发现商品线索；无明确报价的线索不会展示为比价卡片':'未找到可识别的商品详情页；不代表市场无货'};
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
function parse(q){const game=resolveGame(q);const server=game?.server?(q.match(/安卓QQ|苹果QQ|安卓微信|苹果微信|苹果区|安卓区|iOS区/i)?.[0]?.replace(/iOS区/i,'苹果区')||'all'):'all';const budget=q.match(/(\d{2,6})\s*(?:元|块|预算|以内)/)?.[1];return {game:game?.name||null,server,max_price:budget?Number(budget):1000,realname:/可二次实名|支持二次实名/.test(q)?'yes':'all',sort:/皮肤/.test(q)?'skins':'fit',source:'all'}}
// Progressive requirement collection before searching ambiguous game editions.
// Canonical intent parser; no per-game prompt filter in demo mode.
function interpretIntent(message,context={}){
 const text=String(message||'').trim();
 const game=resolveGame(text,context);
 if(!game)return {needs_clarification:true,requirements:{...context},question:'想找哪个游戏的账号？例如「1000元以内的三角洲账号」。',options:[]};
 const switching=!!context.game&&context.game!==game.name;
 const prior=switching?{}:context;
 const budgetMatch=text.match(/(?:预算|不超过|以内|低于|提高到|改成|调整到|降到|最多|上限)\s*[¥￥]?\s*(\d{2,7})|(?:[¥￥]\s*)?(\d{2,7})\s*(?:元|块)\s*(?:以内|以下)?/u);
 const bare=text.match(/^[¥￥]?\s*(\d{2,7})\s*$/);
 const max_price=budgetMatch?Number(budgetMatch[1]||budgetMatch[2]):bare?Number(bare[1]):/不限预算|先看看价格|不知道预算/u.test(text)?100000:prior.max_price??null;
 const server=text.match(/(?:安卓QQ|苹果QQ|安卓微信|苹果微信|苹果区|安卓区|iOS区)/iu)?.[0]?.replace(/iOS区/i,'苹果区')||(/不限区服|全部区服/u.test(text)?'all':null)||prior.server||'all';
 const realname=/(?:不可二次实名|不支持二次实名|不可二改)/u.test(text)?'no':/(?:支持二次实名|可二次实名|可二改)/u.test(text)?'yes':prior.realname||'all';
 const version=text.match(/(?:国际服|台服|国服|日服|韩服|美服|欧服|东南亚服|怀旧服|经典服|手游版|PC版|GMS|TMS)/iu)?.[0]||prior.version||null;
 const profession=text.match(/(?:职业|职阶)\s*(?:为|是|[:：])\s*([\p{Script=Han}A-Za-z0-9]{2,12})/u)?.[1]||prior.profession||null;
 const preferences=[...new Set([...(Array.isArray(prior.preferences)?prior.preferences:[]),...(/皮肤越多|皮肤多/u.test(text)?['皮肤越多越好']:[]),...(/英雄越多|英雄多/u.test(text)?['英雄越多越好']:[]),...(/五星角色越多|五星角色多/u.test(text)?['五星角色越多越好']:[]),...(/等级越高|高等级/u.test(text)?['等级越高越好']:[]),...(/装备越好|装备好|毕业装备/u.test(text)?['装备越好越好']:[]),...(/高战力|战力越高/u.test(text)?['战力越高越好']:[])])];
 const requirements={game:game.name,version,server,max_price,realname,profession,preferences};
 if(max_price===null)return {needs_clarification:true,requirements,question:'预算大概多少？回复数字即可，也可以说「不限预算」。',options:['500','1000','2000','不限预算']};
 return {needs_clarification:false,requirements};
}
// Compatibility wrappers only; both routes use the canonical parser.
function clarifyGameEdition(message,context={}){const game=resolveGame(message,context);return game?.name==='冒险岛'?interpretIntent(message,context):null}
function clarifyGeneralGame(message,context={}){const game=resolveGame(message,context);return game?.name!=='冒险岛'?interpretIntent(message,context):null}
// Shared evidence-grounded listing pipeline for chat tool calls.
async function agentSearchListings(query,args,env){
 const parsed=parse(query),game=resolveGame(query,args);
 const filters={...parsed,...args,game:game?.name||parsed.game,version:null,requested_version:args?.version||String(query).match(/(?:手游版|国际服|台服／枫之谷|国服)/)?.[0]||null,max_price:Number(args?.max_price)>0?Number(args.max_price):parsed.max_price,server:args?.server&&args.server!=='all'?args.server:parsed.server,realname:args?.realname&&args.realname!=='all'?args.realname:parsed.realname};
 let discovery=await discover(query,filters,env);
 const stages=[{stage:'discover_primary',count:discovery.candidates.length,requests:discovery.trace.filter(t=>t.tool.startsWith('discover_')).length}];
 if((discovery.candidates.length===0||!discovery.candidates.some(x=>x.price!=null&&x.price<=filters.max_price))&&env.BRAVE_SEARCH_API_KEY&&!discovery.trace.some(t=>t.result?.http_status===429)){
  const retry=await discover(query,filters,env,{retry:true});
  const unique=new Map([...discovery.candidates,...retry.candidates].map(x=>[x.url,x]));
  discovery={...discovery,candidates:[...unique.values()],trace:[...discovery.trace,...retry.trace]};
  stages.push({stage:'discover_fallback',count:retry.candidates.length,requests:retry.trace.filter(t=>t.tool.startsWith('discover_')).length});
 }
 const native5173=discovery.trace.find(t=>t.tool==='browser_native_5173')||null;
 if(native5173)stages.push({stage:'native_5173',count:native5173.result?.detail_pages||0,status:native5173.result?.status||'unknown'});
 const enriched=await enrichCandidates(discovery.candidates,env,discovery.trace);
 stages.push({stage:'verify_details',count:enriched.filter(x=>x.detail_check&&x.detail_check!=='not_checked').length,priced:enriched.filter(x=>x.price!=null).length,pending_count:enriched.filter(x=>x.detail_check==='not_checked').length,batch_limit:15});
 const browserSummary=discovery.trace.findLast(t=>t.tool==='browser_render_summary')?.result||{configured:false,attempted:0,recovered_prices:0};
 stages.push({stage:'browser_render',count:browserSummary.attempted,priced:browserSummary.recovered_prices,configured:browserSummary.configured});
 // Preserve unknown-edition leads for diagnostics; do not silently treat CN accounts as TMS/GMS.
 const editionSafe=enriched.filter(x=>!x.detail_game||x.detail_game===game?.name); // DEMO: version is not a hard filter.
 const editionRejected=enriched.length-editionSafe.length;
 stages.push({stage:'edition_filter',count:editionSafe.length,rejected:editionRejected,skipped:true,reason:'demo_version_filter_disabled'});
 const req=game?requirements(query,filters,game):null;
 const items=editionSafe
  .filter(x=>(x.game_confirmed||x.detail_game===game?.name)&&!['sold','stale','wrong_game','game_unconfirmed'].includes(x.status))
  .map(x=>({...x,requirement_evaluation:req?evaluateCandidate(x,req):null}))
  .filter(x=>x.price!=null&&x.requirement_evaluation?.fit!=='rejected'&&(!req.hard.some(h=>h.field==='server')||x.server)&&(!req.hard.some(h=>h.field==='realname')||x.realname===true))
  .sort((a,b)=>(b.requirement_evaluation?.score||0)-(a.requirement_evaluation?.score||0))
  .slice(0,20)
  .map(x=>{
   const detailPrice=/^(?:detail_|gmmsj_detail_)/.test(x.price_evidence||'');
   const sourceLabel=detailPrice?'商品详情页':x.price_evidence==='gmmsj_category_visible_price'?'源站商品列表（非实时）':'搜索索引（非实时）';
   const full=(x.title||'')+' '+(x.description||'');
   return {id:x.id,game:game.name,title:x.title,description:x.description,platform:x.platform,url:x.url,
    price:x.price,price_evidence:x.price_evidence,price_source_label:x.price_source_label,detail_summary:x.detail_summary||null,detail_listing_id:x.detail_listing_id||null,
    price_audit:{amount:x.price,currency:'CNY',source:sourceLabel,is_realtime:false,confidence:detailPrice?'medium':'low',verified_at:detailPrice?x.checked_at:null},
    status:x.status,detail_check:x.detail_check,server:x.server,skins:x.skins,heroes:x.heroes,realname:x.realname,detail_attributes:x.detail_attributes||null,
    match_score:x.requirement_evaluation?.score??x.match_score,requirement_evaluation:x.requirement_evaluation,
    price_conflict:x.price_conflict||false,
    key_attributes:{game:game.name,server:x.server,skins:x.skins,heroes:x.heroes,realname:x.realname,rank:x.detail_attributes?.rank||null,noble:x.detail_attributes?.noble??null,level:x.detail_attributes?.level??null,
     profession:x.detail_attributes?.profession||full.match(/(?:职业|职阶)\s*(?:[:：为是])\s*([\p{Script=Han}A-Za-z0-9]{2,12})/u)?.[1]||null,
     power:x.detail_attributes?.power||full.match(/(?:战斗力|战力)\s*[:：]?\s*(\d+(?:\.\d+)?\s*(?:万|亿)?)/u)?.[1]||null},
    version_label:filters.requested_version?'用户要求'+filters.requested_version+' · 版本未核验':'版本未核验'};
  });
 stages.push({stage:'hard_filter_and_rank',count:items.length});
 // Every discovered URL has an auditable outcome. Not all index leads are valid product recommendations.
 const excludedStatuses=new Set(['sold','stale','wrong_game','game_unconfirmed']);
 const admissible=x=>(x.game_confirmed||x.detail_game===game?.name)&&(!x.detail_game||x.detail_game===game?.name)&&!excludedStatuses.has(x.status);
 const leadView=(x,category)=>({
  game:game?.name||null,platform:x.platform,title:x.title,url:x.url,id:x.id,detail_summary:x.detail_summary||null,detail_attributes:x.detail_attributes||null,detail_listing_id:x.detail_listing_id||null,
  price:x.price??null,category,detail_status:x.detail_check||'not_checked',
  http_status:x.detail_http_status||null,fetch_error:x.detail_fetch_error||null,
  reason:x.price==null?(x.detail_http_status?'源站详情请求失败：HTTP '+x.detail_http_status:x.detail_fetch_error?'源站详情抓取失败：'+x.detail_fetch_error:x.detail_check==='not_checked'?'尚未读取详情页':x.status==='sold'?'商品已售出':x.status==='stale'?'商品信息已过期':x.status==='wrong_game'||x.status==='game_unconfirmed'?'游戏身份未核实':'详情页未识别到可靠价格字段'):(x.requirement_evaluation?.failures?.[0]||x.requirement_evaluation?.unknown?.[0]||(!x.server&&req.hard.some(h=>h.field==='server')?'区服未核实':x.realname==null&&req.hard.some(h=>h.field==='realname')?'实名状态未核实':x.verification)||'其他条件未通过'),
  evidence:x.price_evidence||'unknown',
  status:x.status||'unverified'
 });
 const unpricedLeads=enriched.filter(x=>admissible(x)&&x.price==null).map(x=>leadView(x,'price_unknown'));
 const excludedLeads=enriched.filter(x=>!admissible(x)||x.price!=null&&!items.some(y=>y.url===x.url)).map(x=>leadView(x,'excluded'));
 const pricingGate={
  discovered:enriched.length,
  with_price:enriched.filter(x=>x.price!=null).length,
  correct_game_priced:enriched.filter(x=>admissible(x)&&x.price!=null).length,
  within_budget:enriched.filter(x=>admissible(x)&&x.price!=null&&x.price<=req.budget).length,
  over_budget:enriched.filter(x=>admissible(x)&&x.price!=null&&x.price>req.budget).length,
  game_or_status_rejected:enriched.filter(x=>!admissible(x)).length,
  price_missing:unpricedLeads.length,
  matched:items.length,
  budget:req.budget
 };
 // These are stage outcomes, NOT an assertion that search matched a purchasable item.
 for(const step of stages){
  step.outcome=step.skipped?'skipped':
   step.stage==='hard_filter_and_rank'?(items.length?'matched':'no_match'):
   step.stage==='browser_render'?(step.count?step.priced?'recovered':'no_price_recovered':'not_used'):
   step.stage==='native_5173'?(step.status==='rendered_search'?'searched':'blocked'):
   step.stage==='verify_details'?(step.priced?'price_found':step.count?'price_missing':'not_checked'):
   step.count?'discovered':'empty';
 }
 const zeroReason=items.length?null:
  !env.BRAVE_SEARCH_API_KEY?'search_not_configured':
  !discovery.candidates.length?'no_product_leads':
  !pricingGate.with_price?'no_price_evidence':
  pricingGate.over_budget&&pricingGate.correct_game_priced===pricingGate.over_budget?'over_budget':
  !pricingGate.correct_game_priced?'identity_or_availability_unverified':
  pricingGate.within_budget?'other_constraints_unmet':'constraints_or_identity_not_verified';
 const skillFlow=[
  {id:'requirements-parsing',status:'completed',input:'用户自然语言',output:{game:game?.name||null,budget:req?.budget??null,server:filters.server||'all'}},
  {id:'marketplace-discovery',status:discovery.candidates.length?'completed':'empty',output:{leads:discovery.candidates.length,platforms:SEARCH_DOMAINS.map(d=>d.platform)}},
  {id:'detail-verification',status:enriched.some(x=>x.detail_check!=='not_checked')?'completed':'not_executed',output:{checked:enriched.filter(x=>x.detail_check!=='not_checked').length,with_price:enriched.filter(x=>x.price!=null).length,browser_used:browserSummary.attempted||0}},
  {id:'evidence-filtering',status:items.length?'completed':'no_match',output:{eligible:items.length,unpriced:unpricedLeads.length,excluded:excludedLeads.length}},
  {id:'preference-ranking',status:items.length?'completed':'skipped_no_matches',output:{ranked:items.length,sort:'preference_score'}}
 ];
 const detailDiagnostics={
  source_health:SEARCH_DOMAINS.map(d=>({platform:d.platform,domain:d.host,
   leads:discovery.candidates.filter(x=>x.platform===d.platform).length,
   priced:enriched.filter(x=>x.platform===d.platform&&x.price!=null).length,
   search_requests:discovery.trace.filter(x=>x.tool==='discover_'+d.host).length,
   search_http_errors:discovery.trace.filter(x=>x.tool==='discover_'+d.host&&x.result?.http_status&&x.result.http_status!==200).map(x=>x.result.http_status),
   detail_http_errors:enriched.filter(x=>x.platform===d.platform&&x.detail_http_status&&x.detail_http_status!==200).map(x=>x.detail_http_status),
   detail_network_errors:enriched.filter(x=>x.platform===d.platform&&x.detail_fetch_error).length})),
  http_errors:enriched.filter(x=>x.detail_http_status&&x.detail_http_status!==200).length,
  http_statuses:enriched.reduce((acc,x)=>{if(x.detail_http_status)acc[x.detail_http_status]=(acc[x.detail_http_status]||0)+1;return acc},{}),
  network_errors:enriched.filter(x=>x.detail_fetch_error).length,
  unpriced_leads:unpricedLeads,
  excluded_leads:excludedLeads,
  audit_counts:{discovered:enriched.length,qualified:items.length,unpriced:unpricedLeads.length,excluded:excludedLeads.length}
 };
 const searchDiagnostics={...detailDiagnostics,filter_gate:pricingGate,browser:browserSummary,native_5173:native5173?.result||null,configured:!!env.BRAVE_SEARCH_API_KEY,requests:discovery.trace.filter(t=>t.tool.startsWith('discover_')).length,upstream_errors:discovery.trace.filter(t=>t.result?.http_status>=400||t.result?.error).length,raw_search_hits:discovery.trace.reduce((n,t)=>n+(t.result?.raw_results||0),0),product_urls:discovery.trace.reduce((n,t)=>n+(t.result?.product_url_matched||0),0),identity_matched:discovery.candidates.length,detail_checked:enriched.filter(x=>x.detail_check&&x.detail_check!=='not_checked').length,priced:enriched.filter(x=>x.price!=null).length,qualified:items.length};
 return {items,unpriced_leads:unpricedLeads,excluded_leads:excludedLeads,lead_audit:detailDiagnostics.audit_counts,harness:{version:'progressive-search-v1',stages,attempts:stages.filter(x=>x.stage.startsWith('discover_')).length,result_status:items.length?'matched':'no_matches',zero_result_reason:zeroReason,filter_gate:pricingGate,skill_flow:{schema:'gamepilot.skill-flow.v1',execution_mode:'deterministic-code',steps:skillFlow}},search_diagnostics:searchDiagnostics,trace:discovery.trace,coverage:coverageReport(enriched,discovery.trace),discovery_reason:discovery.reason,discovered_count:discovery.candidates.length,priced_count:enriched.filter(x=>x.price!=null).length,edition_rejected_count:editionRejected,search_error_count:discovery.trace.filter(x=>x.result?.http_status>=400||x.result?.error).length,search_error_samples:discovery.trace.filter(x=>x.result?.http_status>=400||x.result?.error).slice(0,3).map(x=>({source:x.tool,status:x.result?.http_status,detail:x.result?.error_detail||x.result?.error})),note:'仅展示具有明确报价证据的候选；价格和库存可能已变化，未核验属性不得宣称满足要求'};
}
// On-demand price watch. Bind Cloudflare KV as PRICE_HISTORY to persist snapshots.
async function watchPrice(raw,env){
 let u;try{u=new URL(raw)}catch{return {error:'invalid_url'}};
 if(u.protocol!=='https:'||!HOSTS.has(u.hostname)||u.username||u.password||u.port||!isProductPage(u,u.hostname.replace(/^www\./,'')))return {error:'unsupported_listing_url'};
 const checked=await verifyListing(u.href);
 const key='price-watch:'+u.hostname+u.pathname;
 let previous=null,history=[];
 if(env.PRICE_HISTORY){try{const saved=await env.PRICE_HISTORY.get(key,'json');history=Array.isArray(saved)?saved.slice(-29):[];previous=[...history].reverse().find(x=>x.price!=null)||null}catch{}}
 const validPrice=checked.price!=null&&checked.status!=='sold'&&checked.status!=='stale'&&checked.price_evidence!=='search_snippet';
 const current=validPrice?{price:checked.price,checked_at:checked.checked_at||new Date().toISOString(),evidence:checked.price_evidence,status:checked.status}:null;
 const change=current&&previous?{amount:Number((current.price-previous.price).toFixed(2)),percent:previous.price?Number(((current.price-previous.price)/previous.price*100).toFixed(2)):null,direction:current.price<previous.price?'down':current.price>previous.price?'up':'unchanged'}:null;
 if(env.PRICE_HISTORY&&current){try{history.push(current);await env.PRICE_HISTORY.put(key,JSON.stringify(history.slice(-30)),{expirationTtl:60*60*24*90})}catch{return {url:u.href,current,previous,change,history_saved:false,warning:'历史价格保存失败',status:checked.status}}}
 return {url:u.href,current,previous,change,history_saved:!!env.PRICE_HISTORY&&!!current,history_points:history.length,availability:checked.status,updated_at:checked.updated_at||null,warning:!validPrice?'当前详情页无可信价格，或商品已售出/过期；不生成价格变化':!env.PRICE_HISTORY?'未绑定 PRICE_HISTORY KV，当前仅支持即时价格检查':'历史价格为此前检查时的快照，并非连续实时监控'};
}
export default {async fetch(request,env){const url=new URL(request.url);if(url.pathname==='/api/health'&&request.method==='GET')return json({ok:true,build:'2026-11-23-harness-evidence-v2',browser_configured:typeof env.BROWSER?.quickAction==='function',search_configured:!!env.BRAVE_SEARCH_API_KEY,model_configured:!!env.OPENROUTER_API_KEY,architecture:'canonical-intent + progressive-search + verified-evidence',note:'配置状态不代表搜索源站实时可访问'});if(url.pathname==='/api/models'&&request.method==='GET')return json(await listModels(env));if(url.pathname==='/api/universal-smoke'&&request.method==='GET'){
 const cases=[
  ['帮我找一个鸣潮账号 2000元以内','鸣潮'],
  ['搜索《崩坏：星穹铁道》账号 1500元以内','崩坏：星穹铁道'],
  ['找一个冒险岛台服账号','冒险岛'],
  ['找一个王者荣耀苹果QQ账号','王者荣耀'],
  ['1000元以内的三角洲账号','三角洲'],
  ['帮我找800元以内的三角洲行动账号','三角洲行动'],
  ['从原神换成三角洲账号，预算1000元','三角洲'],
  ['找500元的明日方舟账号','明日方舟']
 ];
 const checks=cases.map(([query,expected])=>{const game=resolveGame(query,{game:'原神'}),clarification=interpretIntent(query,{game:'原神'}),plans=game?searchPlans(game,{}):[];return {query,game:game?.name||null,queries:plans.length,clarification_ready:!!clarification,passed:game?.name===expected&&clarification.requirements?.game===expected&&plans.length>0}});
 return json({version:'universal-smoke-v2',checks,passed:checks.every(x=>x.passed),note:'离线确定性逻辑测试，不代表真实搜索服务或商品价格可用'});
}if(url.pathname==='/api/acceptance'&&request.method==='GET'){const started=Date.now();const game=GAME_CATALOG.find(g=>g.name==='冒险岛');const feed=await gmmsjCategoryLeads(game,{version:'国服'});const sample=feed.items.slice(0,3);const checks=await Promise.all(sample.map(async x=>{const v=await verifyListing(x.url);return {url:x.url,title:x.title,price:v.price??null,status:v.status,detail_game:v.detail_game||null,updated_at:v.updated_at||null,detail_check:v.message||null}}));return json({version:'2026-11-23-feed-acceptance-v1',source:'G买卖 冒险岛国服',category_status:feed.diagnostic,category_links:feed.links_found||0,unique_product_links:feed.items.length,detail_samples:checks,elapsed_ms:Date.now()-started,passed:feed.items.length>0&&checks.some(x=>x.price!=null&&x.status!=='sold'&&x.status!=='stale'),note:'仅检查公开商品页面；不代表库存或购买能力得到确认。'});}if(url.pathname==='/api/assets'&&request.method==='GET')return json(inventory);if(url.pathname==='/api/price-watch'&&request.method==='POST'){let b;try{b=await request.json()}catch{return json({error:'无效JSON'},400)}return json(await watchPrice(String(b.url||'').slice(0,500),env))}if(url.pathname==='/api/verify'&&request.method==='POST'){let b;try{b=await request.json()}catch{return json({error:'无效JSON'},400)}return json(await verifyListing(String(b.url||'').slice(0,500)))}if(url.pathname==='/api/analyze'&&request.method==='POST'){
 let body;try{body=await request.json()}catch{return json({error:'无效JSON'},400)}
 const query=String(body.query||'').slice(0,1000);
 const game=resolveGame(query,{game:body.game});
 if(!game)return json({error:'没有明确的游戏名称'},400);
 const candidates=(Array.isArray(body.candidates)?body.candidates:[]).slice(0,15).filter(x=>{
  try{const u=new URL(String(x.url||''));return u.protocol==='https:'&&HOSTS.has(u.hostname)&&x.game===game.name&&Number(x.price)>0}catch{return false}
 }).map(x=>({id:String(x.id||'').slice(0,100),game:game.name,title:String(x.title||'').slice(0,250),platform:String(x.platform||'').slice(0,80),price:Number(x.price),server:x.server||null,skins:x.skins??null,realname:x.realname??null,match_score:Number(x.match_score)||0}));
 const chosen=String(body.model||'').slice(0,120);
 const result=await agentReview(query,candidates,{game:game.name,max_price:Number(body.max_price)||null},env,chosen||undefined);
 const msg=result.status==='completed'?result.summary:result.status==='skipped'?'没有可分析的商品或未配置 OpenRouter API。':'模型分析暂不可用：'+(result.reason||'unknown');
 return json({answer:msg,model:result.model||null,usage:result.usage||null,notes:result.notes||[],status:result.status,analyzed_count:candidates.length});
}
if(url.pathname==='/api/verify-lead'&&request.method==='POST'){
 let body;try{body=await request.json()}catch{return json({error:'无效JSON'},400)}
 const requestedGame=String(body.game||'').trim().slice(0,60);
 let productUrl;try{productUrl=new URL(String(body.url||''))}catch{return json({error:'无效商品链接'},400)}
 const domain=productUrl.hostname.endsWith('.5173.com')||productUrl.hostname==='5173.com'?'5173.com':productUrl.hostname.replace(/^www\./,'');
 if(!requestedGame||productUrl.protocol!=='https:'||!HOSTS.has(productUrl.hostname)||
   productUrl.username||productUrl.password||productUrl.port||!isProductPage(productUrl,domain))
  return json({error:'仅支持核验已知交易平台的有效商品详情链接'},400);
 const start=Date.now();
 let verified=await verifyListing(productUrl.href);
 const steps=[{tool:'http_detail',status:verified.status,http_status:verified.http_status||null,price_found:verified.price!=null}];
 if(verified.price==null&&typeof env.BROWSER?.quickAction==='function'&&['gmmsj.com','5173.com'].includes(domain)&&
   !['sold','stale'].includes(verified.status)){
  const rendered=await browserRenderListing(productUrl.href,env);
  steps.push({tool:'browser_run',status:rendered.ok?'rendered':rendered.reason||'failed',duration_ms:rendered.duration_ms});
  if(rendered.ok){
   const retry=await verifyListing(productUrl.href,rendered.html);
   if(retry.price!=null||retry.detail_attributes?.summary||retry.detail_game||retry.status==='sold')verified=retry;
  }
 }
 const gameMatched=verified.detail_game===requestedGame;
 const amount=verified.price!=null&&verified.status!=='sold'&&verified.status!=='stale'?verified.price:null;
 const attrs=verified.detail_attributes||{};
 const requestedBudget=Number(body.max_price)||null;
 const requestedServer=String(body.server||'all');
 const serverMatch=requestedServer==='all'||!attrs.server?null:
  requestedServer==='苹果区'?attrs.server.startsWith('苹果'):
  requestedServer==='安卓区'?attrs.server.startsWith('安卓'):
  attrs.server===requestedServer;
 return json({url:productUrl.href,game:requestedGame,detail_game:verified.detail_game||null,game_match:gameMatched,
  price:amount,price_evidence:amount!=null?verified.price_evidence:'unknown',
  price_status:amount==null?'unknown':!gameMatched?'unconfirmed_game':requestedBudget!=null&&amount>requestedBudget?'over_budget':'price_found',
  budget_match:amount!=null&&requestedBudget!=null?amount<=requestedBudget:null,server_match:serverMatch,
  status:verified.status,reason:verified.message||'详情信息不足',
  attributes:attrs,title:attrs.title||verified.page_title||null,checked_at:verified.checked_at||null,
  source:'public_marketplace_detail',steps,duration_ms:Date.now()-start});
}
if(url.pathname==='/api/search'&&request.method==='POST'){
 let body;try{body=await request.json()}catch{return json({error:'无效JSON'},400)}
 const query=String(body.query||'').slice(0,1000),incoming=body.filters||{};
 const game=resolveGame(query,incoming);
 if(!game)return json({error:'请提供游戏名称',status:'needs_clarification',candidates:[]},400);
 const parsedFilters=parse(query);const filters={...parsedFilters,...incoming,game:game.name,server:incoming.server&&incoming.server!=='all'?incoming.server:parsedFilters.server,realname:incoming.realname&&incoming.realname!=='all'?incoming.realname:parsedFilters.realname};
 const result=await agentSearchListings(query,filters,env);
 const candidates=result.items; // Canonical card schema is produced once by the Harness.
 return json({items:result.items,candidates,coverage:result.coverage,requirements:filters,filters,discovery_status:result.harness?.zero_result_reason||'searched',summary:candidates.length?'找到 '+candidates.length+' 条满足硬条件的有价线索，商品在售状态仍需源站核验。':({over_budget:'找到商品价格，但符合游戏身份的有价线索均超过预算。',identity_or_availability_unverified:'检索到商品价格，但没有可确认游戏身份及有效状态的推荐商品。',no_price_evidence:'发现商品详情线索，但尚未获得可信价格。',other_constraints_unmet:'有预算内线索，但其他硬条件未满足。'})[result.harness?.zero_result_reason]||'没有商品通过本次硬条件筛选；并不代表平台无货。',agent:{status:'harness',summary:'由 Progressive Search Harness 执行，不依赖 OpenRouter。'},trace:result.trace,harness:result.harness,search_diagnostics:result.search_diagnostics,discovered_count:result.discovered_count,priced_count:result.priced_count,unpriced_leads:result.unpriced_leads,excluded_leads:result.excluded_leads,lead_audit:result.lead_audit});
}
if(url.pathname==='/api/chat'&&request.method==='POST'){let body;try{body=await request.json()}catch{return json({error:'无效JSON'},400)}const prompt=String(body.message||'').slice(0,1500);if(!prompt.trim())return json({error:'请输入需求'},400);
 // Reconstruct requirements from prior chat turns when the UI sends history instead of a separate context object.
 const history=Array.isArray(body.history)?body.history.slice(-16):Array.isArray(body.messages)?body.messages.slice(-16):[];
 let prior={...(body.context||{}),...(body.requirements||{})};
 for(const turn of history){const content=typeof turn==='string'?turn:String(turn?.content||turn?.message||'');if(!content||turn?.role==='assistant')continue;const update=interpretIntent(content,prior);if(update?.requirements)prior={...prior,...update.requirements}}
 // New explicit game requests start a fresh search context; only follow-ups inherit prior game.
 const explicitGame=resolveGame(prompt,{});
 if(explicitGame&&prior.game&&explicitGame.name!==prior.game)prior={game:explicitGame.name};
 const clarification=interpretIntent(prompt,prior);
 if(clarification?.needs_clarification)return json({answer:clarification.question,clarification,requirements:clarification.requirements,items:[],trace:[],status:'needs_clarification',suggested_replies:clarification.options||[]});
 // Deterministic Progressive Search Harness: retrieval must not depend on model tool-call decisions.
 if(clarification?.requirements?.game){
  const req=clarification.requirements;
  const searchText=[req.game,req.server||'',req.profession||'',...(req.preferences||[])].filter(Boolean).join(' ');
  const result=await agentSearchListings(searchText,req,env);
  const reason=result.harness?.zero_result_reason;
  const messages={search_not_configured:'搜索服务未配置，不能判断市场缺货。',no_product_leads:'尚未找到可确认的商品详情链接，不能判断市场无货。',no_price_evidence:'发现商品线索，但没有可靠的商品价格，暂不能判断是否符合预算。',over_budget:'找到有价格证据的商品，但当前报价均超出预算。',identity_or_availability_unverified:'发现有参考价格的线索，但游戏身份或商品状态未通过核验。',other_constraints_unmet:'找到预算内商品线索，但还有其他硬条件未满足。',constraints_or_identity_not_verified:'有商品线索，但当前没有商品满足所有硬性条件。'};
  return json({answer:result.items.length?'找到 '+result.items.length+' 条有价格证据的商品线索（Demo 暂不按版本过滤，版本和在售状态需以源站为准）。':messages[reason]||'本轮未获得可展示的商品，请查看诊断信息。',items:result.items,unpriced_leads:result.unpriced_leads,excluded_leads:result.excluded_leads,lead_audit:result.lead_audit,requirements:req,trace:result.trace,coverage:result.coverage,search_diagnostics:result.search_diagnostics,harness:result.harness,status:result.items.length?'results':'search_incomplete',suggested_replies:[]});
 }
 return json({error:'需求尚未完整解析',status:'needs_clarification',requirements:clarification?.requirements||prior},400);
}
if(url.pathname.startsWith('/api/'))return json({error:'接口不存在'},404);return env.ASSETS.fetch(request)}};