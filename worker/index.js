// Fail closed: historical and synthetic records are not live inventory.
const inventory=[];
const KNOWN_SOLD=new Set(['C8YDZP']);
const HOSTS=new Set(['www.pzds.com','pzds.com','www.5173.com','5173.com','www.gmmsj.com','gmmsj.com']);
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
 // Mobile G买卖 pages often show the main price BEFORE the product title and metadata.
 // Require the product number or account product context, not a random price from recommendations.
 const productContext=/(?:商品详情|编号\s*\d{7,}|账号\s*\[|账号\s*【)/.test(body);
 const candidates=[];
 if(productContext){
  const m=body.match(/(?:商品详情[\s\S]{0,350}?|库存\s*\d+[\s\S]{0,80}?)[¥￥]\s*([1-9]\d{1,6}(?:\.\d{1,2})?)/);
  if(m)candidates.push(Number(m[1]));
  const beforeTitle=body.match(/[¥￥]\s*([1-9]\d{1,6}(?:\.\d{1,2})?)\s*(?:库存\s*\d+\s*)?(?:账号|\[|【)/);
  if(beforeTitle)candidates.push(Number(beforeTitle[1]));
  const labeled=body.match(/(?:商品售价|出售价格|售价|一口价)\s*[:：]?\s*[¥￥]?\s*([1-9]\d{1,6}(?:\.\d{1,2})?)/);
  if(labeled)candidates.push(Number(labeled[1]));
 }
 const price=candidates.find(x=>x>=10&&x<=1000000)??null;
 return {status,price,price_evidence:price!=null?'gmmsj_detail_visible_price':'unknown'};
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
async function verifyListing(raw){
 let u;try{u=new URL(raw)}catch{return {status:'invalid_url',message:'无效商品链接'}}
 if(u.protocol!=='https:'||!HOSTS.has(u.hostname)||u.username||u.password||u.port)return {status:'unsupported_source',message:'不支持此域名'};
 const id=u.pathname.match(/goodsDetails\/([^/]+)/)?.[1]||null;
 if(KNOWN_SOLD.has(id))return {status:'sold',message:'已知售出商品，排除推荐',source_url:u.href,verified_at:null,price:null};
 try{
 const r=await fetch(u.href,{redirect:'follow',signal:AbortSignal.timeout(8500),headers:{Accept:'text/html,application/xhtml+xml','User-Agent':'Mozilla/5.0 (compatible; GamePilot/1.0; +public-product-verification)'}});
 const contentType=r.headers.get('content-type')||'';
 if(r.status!==200||!contentType.includes('text/html'))return {status:'unverified',message:'详情页无法读取（HTTP '+r.status+'，可能需要移动端或登录）',http_status:r.status,source_url:u.href};
 const html=(await r.text()).slice(0,500000);
 const pageTitle=decodeEntities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]||'').slice(0,180);
 const gameLabel=html.match(/(?:游戏区服|所属游戏|游戏名称|游戏分类)\s*[:：]?\s*(?:<[^>]+>\s*){0,3}(王者荣耀|冒险岛M?|枫之谷|原神|和平精英|地下城与勇士|英雄联盟|永劫无间|逆水寒)/i)?.[1]||null;
 const detailGame=GAME_CATALOG.find(g=>listingGameMatches(pageTitle,'',g))?.name||(gameLabel==='枫之谷'||gameLabel==='冒险岛M'?'冒险岛':gameLabel);
 const gmmsj=u.hostname.endsWith('gmmsj.com')?gmmsjDetail(html):null;const updatedAt=listingUpdatedAt(html);const stale=isStaleListing(updatedAt);
 const isProductHtml=/(?:商品编号|账号编号|商品详情|商品信息|商品售价|出售价格|商品价格|goodsDetails|sellingPrice|salePrice|goodsPrice)/i.test(html)||/application\/ld\+json/i.test(html);const detail=isProductHtml?extractDetailPrice(html):{price:null,price_evidence:'unknown',availability:null};const visible=isProductHtml?visibleDetailPrice(html):{price:null,price_evidence:'unknown'};
 // Search only the page title and explicit structured availability for strong sold evidence.
 const sold=gmmsj?.status==='sold'||/(已售出|已下架|已卖出|已售罄|sold out)/i.test(pageTitle)||/(?:OutOfStock|SoldOut|Discontinued)$/i.test(detail.availability||'');
 const live=gmmsj?.status==='listed'||/(?:InStock)$/i.test(detail.availability||'');
 return {status:sold?'sold':stale?'stale':live?'listed':'unverified',message:sold?'详情页明确显示售出或下架':stale?'商品最后更新超过180天，不能作为当前可售报价':live?'结构化库存标记为 InStock，尚未核验交易可完成':'页面可访问，但未找到可信的在售证据',updated_at:updatedAt,detail_game:detailGame,price:gmmsj?.price??detail.price??visible.price,price_evidence:gmmsj?.price!=null?gmmsj.price_evidence:detail.price!=null?detail.price_evidence:visible.price_evidence,availability_evidence:detail.availability||null,source_url:u.href,checked_at:new Date().toISOString(),verification_method:'公开HTML与结构化商品数据',page_title:pageTitle};
 }catch(e){return {status:'unverified',message:'详情页访问超时或受限',fetch_error:String(e?.name||'network_error'),source_url:u.href,price:null}}
}
async function enrichCandidates(candidates){
 // Verify unpriced leads first: these are the listings where a detail fetch can create a new price.
 // Round-robin across platforms so a single site's results cannot exhaust verification capacity.
 const byPlatform=new Map();for(const x of candidates){if(!byPlatform.has(x.platform))byPlatform.set(x.platform,[]);byPlatform.get(x.platform).push(x)}
 for(const xs of byPlatform.values())xs.sort((a,b)=>Number(a.price!=null)-Number(b.price!=null));
 const queue=[];while(queue.length<15){let added=false;for(const xs of byPlatform.values()){if(xs.length&&queue.length<15){queue.push(xs.shift());added=true}}if(!added)break}
 const checks=new Map();for(let i=0;i<queue.length;i+=15){const batch=queue.slice(i,i+15);const outcomes=await Promise.all(batch.map(x=>verifyListing(x.url)));batch.forEach((x,j)=>checks.set(x.url,outcomes[j]))}
 return candidates.map(x=>{
  const v=checks.get(x.url);
  if(!v)return {...x,detail_check:'not_checked',verification:'尚未抓取商品详情'};
  const wrongGame=!!v.detail_game&&v.detail_game!==x.game;
  const gameUnconfirmed=!x.game_confirmed&&v.detail_game!==x.game;
  // A failed/blocked detail fetch cannot validate the index price. Preserve it only as an index lead.
  const detailVerified=v.price!=null&&v.status!=='sold'&&v.status!=='stale'&&!wrongGame;
  const priceConflict=detailVerified&&x.price!=null&&Math.abs(v.price-x.price)>0.01;
  const price=wrongGame||gameUnconfirmed||v.status==='stale'||v.status==='sold'?null:detailVerified?v.price:x.price;
  return {...x,status:wrongGame?'wrong_game':gameUnconfirmed?'game_unconfirmed':v.status,updated_at:v.updated_at||null,detail_game:v.detail_game||null,detail_check:wrongGame?'wrong_game':v.status,detail_http_status:v.http_status||null,detail_fetch_error:v.fetch_error||null,verification:wrongGame?'详情页游戏与搜索需求不一致':v.message,checked_at:v.checked_at||null,price,price_evidence:wrongGame?'wrong_game':gameUnconfirmed?'game_unconfirmed':price==null?(v.status==='stale'?'stale_listing':'unavailable'):detailVerified?v.price_evidence:x.price_evidence,price_source_label:wrongGame?'游戏不匹配（已排除）':price==null?'价格未获取':detailVerified?'商品详情提取价（非实时）':'搜索索引参考价（非实时）',detail_price:wrongGame?null:v.price??null,price_conflict:priceConflict,availability_evidence:v.availability_evidence||null};
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
 const text=input.replace(/(?:游戏账号|成品号|游戏号|账号|帐号|账户|买号)[\s\S]*$/u,'');
 let candidate=(quoted?.[1]||text)
  .replace(/(?:预算|不超过|低于|最多|上限|价格)?\s*[¥￥]?\s*\d{2,7}\s*(?:元|块)?\s*(?:以内|以下|左右|上下)?\s*(?:的)?/g,' ')
  .replace(/^(?:(?:请|麻烦|可以|能不能|帮我|给我|我想|我需要|我要|想要|需要|推荐|搜索|找|买|购买|看看|求购|一下|一个|一款|一些|个|的)\s*)+/u,'')
  .replace(/^(?:的\s*)+/u,'').replace(/(?:游戏|的)\s*$/u,'').trim();
 // "从原神换成三角洲账号" must resolve to 三角洲, not the old game.
 candidate=candidate.split(/(?:换成|切换到|改找|改搜|改成)/u).at(-1).trim();
 const hasProductIntent=/(?:游戏账号|成品号|游戏号|账号|帐号|账户|买号)/u.test(input)||!!quoted;
 if(hasProductIntent&&candidate.length>=2&&candidate.length<=35&&!/(?:\d{2,7}\s*(?:元|块)|^(?:游戏|一个|高战力|高等级|账号)$)/u.test(candidate)){
  const known=GAME_CATALOG.find(g=>g.aliases.some(a=>{
   const v=candidate.toLowerCase(),p=a.toLowerCase();
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
 const t=String(title||'').split(/(?:[-|－]\\s*(?:盼之代售|盼之账号|G买卖|5173|游戏账号交易平台))/i)[0];
 if(t.toLocaleLowerCase().includes(name.toLocaleLowerCase()))return true;
 const d=String(description||'').slice(0,1600);
 const label=d.match(/(?:所属游戏|游戏名称|游戏分类|游戏区服)\\s*[:：]?\\s*([^\\s,，|｜;；<>]{2,55})/i);
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
  if(h.field==='server'&&x.server&&x.server!==h.value)failures.push('区服不匹配');
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
 // Generic query plans: the game is a parameter, not a per-title code path.
 // Queries discover product URLs; all hard filters are applied AFTER discovery.
 const names=[...new Set([game.name,...(game.aliases||[])])].filter(x=>x&&x.length>=2);
 const terms=[];
 for(const name of names.slice(0,3)){
  terms.push(name+' 账号 出售',name+' 成品号',name+' 账号 价格',name+' 商品详情');
  if(/^[a-z0-9 ._-]+$/i.test(name))terms.push(name+' account for sale');
 }
 return SEARCH_DOMAINS.flatMap(d=>[...new Set(terms)].slice(0,6).map((term,i)=>({d,q:'site:'+d.host+' '+term,offset:0,variant:i})));
}
const SEARCH_DOMAINS=[{host:'pzds.com',platform:'盼之账号'},{host:'5173.com',platform:'5173'},{host:'gmmsj.com',platform:'G买卖'}];
function isProductPage(u,domain){
 const p=u.pathname;
 if(domain==='pzds.com')return /^\/goodsDetails\/[a-z0-9]+(?:\/\d+)?\/?$/i.test(p);
 if(domain==='gmmsj.com')return /\/detail_[a-z0-9]+\.shtml$/i.test(p);
 if(domain==='5173.com')return /(?:goods?|product|detail|item|sale|account|game|trade|order)/i.test(p)&&p.split('/').filter(Boolean).length>=2;
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
   const nearby=cleanText(decodeEntities(html.slice(Math.max(0,m.index-650),m.index+1200).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<[^>]+>/g,' ')));
   const titles=[...nearby.matchAll(/(?:账号\s*)?\[([^\]]{2,80})\]([^¥￥]{0,110})/g)];
   const candidate=titles.at(-1);
   const title=candidate?('冒险岛 '+candidate[1]+' '+candidate[2]).slice(0,160):('冒险岛 '+(nearby.match(/(?:黑骑士|剑刃舞者|夜使者|主教|暗影双刀|风灵使者|\d{2,3}级)[^。\n]{0,75}/)?.[0]||'账号（详情待核验）')).slice(0,160);
   unique.set(url.pathname,{id:'gmmsj.com:'+url.pathname.split('/').pop(),game:'冒险岛',platform:'G买卖',url:url.href,title,description:nearby.slice(0,650)+' 【冒险岛国服分类页】',server:null,price:null,price_evidence:'unknown',price_source_label:'详情待核验',status:'unverified',game_confirmed:true,skins:null,heroes:null,realname:null,verification:'官方冒险岛国服分类页线索，需核验详情价格与库存',discovered_at:new Date().toISOString(),kind:'category_lead',match_score:45,match_reasons:[]});
   if(unique.size>=35)break;
  }
  return {items:[...unique.values()],diagnostic:unique.size?'ok':'no_product_links_in_html',links_found:links.length};
 }catch(e){return {items:[],diagnostic:'fetch_failed'};}
}
async function discover(query,filters,env,options={}){
 // Public category feeds can still discover leads when Brave is missing or rate-limited.
 const trace=[],results=new Map(),game=resolveGame(query,filters),server=game?.server&&filters.server!=='all'?filters.server:'';
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
    if(link.protocol!=='https:'||!(link.hostname===d.host||link.hostname.endsWith('.'+d.host)))continue;hostMatched++;if(!isProductPage(link,d.host))continue;productMatched++;
    const id=link.pathname.match(/goodsDetails\/([^/]+)/)?.[1]||link.pathname.split('/').filter(Boolean).pop();
    if(KNOWN_SOLD.has(id)){soldRejected++;continue}if(results.has(link.href)){duplicateRejected++;continue}
    const title=cleanText(hit.title),description=cleanText(hit.description),full=title+' '+description;const gameConfirmed=labeledListingGame(title,description,game);const hasOtherGame=GAME_CATALOG.some(g=>g.name!==game.name&&listingGameMatches(title,'',g));if(!gameConfirmed&&hasOtherGame){genericRejected++;continue}if(isGenericPage(title,description,game)&&!gameConfirmed){genericRejected++;continue}if(!gameConfirmed) {genericRejected++;continue;}
    // Edition is validated after fetching detail evidence; do not discard indexed leads here.
    const foundServer=game.server?(title.match(/安卓QQ|苹果QQ|安卓微信|苹果微信/)?.[0]||null):null;
    if(server&&foundServer&&foundServer!==server){serverRejected++;continue}
    if(/已下架|已售出|已卖出|已售罄|已下单|已交易|sold out/i.test(full)){soldRejected++;continue}const rawPrice=extractPrice(title)??extractPrice(description,{requireLabel:true});const price=rawPrice!=null&&rawPrice<10?null:rawPrice;if(price!=null)priced++;const skins=Number(title.match(/(?:皮肤(?:数量|数)?|皮肤)\s*[:：]?\s*(\d{2,4})/)?.[1])||null;
    const heroes=Number(title.match(/(?:英雄(?:数量|数)?|英雄)\s*[:：]?\s*(\d{2,4})/)?.[1])||null;
    const realname=/不可二次实名|不可二改|不支持二次实名/.test(title)?false:/可二次实名|支持二次实名|可二改/.test(title)?true:null;
    results.set(link.href,{id:d.host+':'+id,game:game.name,platform:d.platform,url:link.href,title,description,server:foundServer,price,price_evidence:price===null?'unknown':'search_snippet',price_source_label:price===null?'价格未获取':'搜索索引参考价（非实时）',status:'unverified',game_confirmed:gameConfirmed,skins,heroes,realname,verification:'搜索索引，未核验实时在售',discovered_at:new Date().toISOString(),kind:'discovered',match_score:0,match_reasons:[]});valid++;
   }
   trace.push({tool:'discover_'+d.host,query:q,result:{raw_results:(j.web?.results||[]).length,host_matched:hostMatched,product_url_matched:productMatched,server_rejected:serverRejected,known_sold_rejected:soldRejected,generic_rejected:genericRejected,duplicate_rejected:duplicateRejected,priced_in_snippet:priced,detail_pages:valid},duration_ms:Date.now()-t});
  }catch(e){trace.push({tool:'discover_'+d.host,query:q,result:{error:'timeout_or_network_error'},duration_ms:Date.now()-t})}
 }));}
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
function parse(q){const game=resolveGame(q);const server=game?.server?(q.match(/安卓QQ|苹果QQ|安卓微信|苹果微信/)?.[0]||'all'):'all';const budget=q.match(/(\d{2,6})\s*(?:元|块|预算|以内)/)?.[1];return {game:game?.name||null,server,max_price:budget?Number(budget):1000,realname:/可二次实名|支持二次实名/.test(q)?'yes':'all',sort:/皮肤/.test(q)?'skins':'fit',source:'all'}}
function search(filters={}){const f={server:'all',max_price:1000,realname:'all',sort:'fit',source:'all',...filters};const max=Number(f.max_price);let items=inventory.filter(x=>(f.server==='all'||x.server===f.server)&&(!Number.isFinite(max)||max<=0||x.price<=max)&&(f.realname==='all'||x.realname===(f.realname==='yes'))&&(f.source==='all'||x.kind===f.source));items.sort((a,b)=>f.sort==='low'?a.price-b.price:f.sort==='skins'?b.skins-a.skins:b.skins/b.price-a.skins/a.price);return items}
function execute(name,args){if(name==='search_listings')return {items:search(args),note:'未接入授权实时库存，禁止推荐历史或模拟商品'};if(name==='compare_prices'){const ids=Array.isArray(args.ids)?args.ids:[];return ids.map(id=>{const x=inventory.find(v=>v.id===id);return x?{id,platform:x.platform,listed_price_cny:x.price,required_fees:'unknown',final_price:'unknown',source:x.source}: {id,error:'商品不存在'}})}if(name==='check_risks'){const ids=Array.isArray(args.ids)?args.ids:[];return ids.map(id=>{const x=inventory.find(v=>v.id===id);return x?{id,realname_changeable:x.realname,fees:'unknown',status:'not_live_verified',warning:'账号归属、交易保障和找回风险需在源站核验'}:{id,error:'商品不存在'}})}return {error:'未知工具'}}
const tools=[{type:'function',function:{name:'search_listings',description:'自动通过配置的搜索服务发现盼之、5173、G买卖的公开商品索引；候选未核验在售，不能作为可购买推荐',parameters:{type:'object',properties:{server:{type:'string',enum:['all','安卓QQ','苹果QQ','安卓微信']},max_price:{type:'number'},realname:{type:'string',enum:['all','yes','no']},sort:{type:'string',enum:['fit','low','skins']},source:{type:'string',enum:['all','public','demo']}},required:[]}}},{type:'function',function:{name:'compare_prices',description:'比较挂牌参考价并明确未知服务费',parameters:{type:'object',properties:{ids:{type:'array',items:{type:'string'}}},required:['ids']}}},{type:'function',function:{name:'check_risks',description:'检查实名与未核验交易风险',parameters:{type:'object',properties:{ids:{type:'array',items:{type:'string'}}},required:['ids']}}}];
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
 const server=text.match(/(?:安卓QQ|苹果QQ|安卓微信|苹果微信)/u)?.[0]||(/不限区服|全部区服/u.test(text)?'all':null)||prior.server||'all';
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
 const enriched=await enrichCandidates(discovery.candidates);
 stages.push({stage:'verify_details',count:enriched.filter(x=>x.detail_check&&x.detail_check!=='not_checked').length,priced:enriched.filter(x=>x.price!=null).length});
 // Preserve unknown-edition leads for diagnostics; do not silently treat CN accounts as TMS/GMS.
 const editionSafe=enriched.filter(x=>!x.detail_game||x.detail_game===game?.name); // DEMO: version is not a hard filter.
 const editionRejected=enriched.length-editionSafe.length;
 stages.push({stage:'edition_filter',count:editionSafe.length,rejected:editionRejected,skipped:true,reason:'demo_version_filter_disabled'});
 const req=game?requirements(query,filters,game):null;
 const items=editionSafe
  .filter(x=>(x.game_confirmed||x.detail_game===game?.name)&&!['sold','stale','wrong_game','game_unconfirmed'].includes(x.status))
  .map(x=>({...x,requirement_evaluation:req?evaluateCandidate(x,req):null}))
  .filter(x=>x.price!=null&&x.requirement_evaluation?.fit!=='rejected')
  .sort((a,b)=>(b.requirement_evaluation?.score||0)-(a.requirement_evaluation?.score||0))
  .slice(0,20)
  .map(x=>{
   const detailPrice=/^(?:detail_|gmmsj_)/.test(x.price_evidence||'');
   const sourceLabel=detailPrice?'商品详情页':'搜索索引（非实时）';
   const full=(x.title||'')+' '+(x.description||'');
   return {id:x.id,game:game.name,title:x.title,description:x.description,platform:x.platform,url:x.url,
    price:x.price,price_evidence:x.price_evidence,price_source_label:x.price_source_label,
    price_audit:{amount:x.price,currency:'CNY',source:sourceLabel,is_realtime:false,confidence:detailPrice?'medium':'low',verified_at:detailPrice?x.checked_at:null},
    status:x.status,detail_check:x.detail_check,server:x.server,skins:x.skins,heroes:x.heroes,realname:x.realname,
    match_score:x.requirement_evaluation?.score??x.match_score,requirement_evaluation:x.requirement_evaluation,
    price_conflict:x.price_conflict||false,
    key_attributes:{game:game.name,server:x.server,skins:x.skins,heroes:x.heroes,realname:x.realname,
     profession:full.match(/(?:职业|职阶)\s*(?:[:：为是])\s*([\p{Script=Han}A-Za-z0-9]{2,12})/u)?.[1]||null,
     power:full.match(/(?:战斗力|战力)\s*[:：]?\s*(\d+(?:\.\d+)?\s*(?:万|亿)?)/u)?.[1]||null},
    version_label:filters.requested_version?'用户要求'+filters.requested_version+' · 版本未核验':'版本未核验'};
  });
 stages.push({stage:'hard_filter_and_rank',count:items.length});
 const detailDiagnostics={source_health:SEARCH_DOMAINS.map(d=>({platform:d.platform,domain:d.host,leads:discovery.candidates.filter(x=>x.platform===d.platform).length,priced:enriched.filter(x=>x.platform===d.platform&&x.price!=null).length,search_requests:discovery.trace.filter(x=>x.tool==='discover_'+d.host).length,search_http_errors:discovery.trace.filter(x=>x.tool==='discover_'+d.host&&x.result?.http_status&&x.result.http_status!==200).map(x=>x.result.http_status),detail_http_errors:enriched.filter(x=>x.platform===d.platform&&x.detail_http_status&&x.detail_http_status!==200).map(x=>x.detail_http_status),detail_network_errors:enriched.filter(x=>x.platform===d.platform&&x.detail_fetch_error).length})),http_errors:enriched.filter(x=>x.detail_http_status&&x.detail_http_status!==200).length,http_statuses:enriched.reduce((acc,x)=>{if(x.detail_http_status)acc[x.detail_http_status]=(acc[x.detail_http_status]||0)+1;return acc},{}),network_errors:enriched.filter(x=>x.detail_fetch_error).length,unpriced_leads:enriched.filter(x=>x.price==null&&x.game_confirmed&&(!x.detail_game||x.detail_game===game?.name)&&!['sold','stale','wrong_game','game_unconfirmed'].includes(x.status)).slice(0,12).map(x=>({platform:x.platform,title:x.title,url:x.url,detail_status:x.detail_check,http_status:x.detail_http_status,fetch_error:x.detail_fetch_error,reason:x.verification}))};
 const searchDiagnostics={...detailDiagnostics,configured:!!env.BRAVE_SEARCH_API_KEY,requests:discovery.trace.filter(t=>t.tool.startsWith('discover_')).length,upstream_errors:discovery.trace.filter(t=>t.result?.http_status>=400||t.result?.error).length,raw_search_hits:discovery.trace.reduce((n,t)=>n+(t.result?.raw_results||0),0),product_urls:discovery.trace.reduce((n,t)=>n+(t.result?.product_url_matched||0),0),identity_matched:discovery.candidates.length,detail_checked:enriched.filter(x=>x.detail_check&&x.detail_check!=='not_checked').length,priced:enriched.filter(x=>x.price!=null).length,qualified:items.length};
 return {items,unpriced_leads:detailDiagnostics.unpriced_leads,harness:{version:'progressive-search-v1',stages,attempts:stages.filter(x=>x.stage.startsWith('discover_')).length,zero_result_reason:items.length?null:!env.BRAVE_SEARCH_API_KEY?'search_not_configured':!discovery.candidates.length?'no_product_leads':!enriched.some(x=>x.price!=null)?'no_price_evidence':!editionSafe.length?'edition_evidence_missing':'constraints_or_identity_not_verified'},search_diagnostics:searchDiagnostics,trace:discovery.trace,coverage:coverageReport(enriched,discovery.trace),discovery_reason:discovery.reason,discovered_count:discovery.candidates.length,priced_count:enriched.filter(x=>x.price!=null).length,edition_rejected_count:editionRejected,search_error_count:discovery.trace.filter(x=>x.result?.http_status>=400||x.result?.error).length,search_error_samples:discovery.trace.filter(x=>x.result?.http_status>=400||x.result?.error).slice(0,3).map(x=>({source:x.tool,status:x.result?.http_status,detail:x.result?.error_detail||x.result?.error})),note:'仅展示具有明确报价证据的候选；价格和库存可能已变化，未核验属性不得宣称满足要求'};
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
export default {async fetch(request,env){const url=new URL(request.url);if(url.pathname==='/api/models'&&request.method==='GET')return json(await listModels(env));if(url.pathname==='/api/universal-smoke'&&request.method==='GET'){
 const cases=[
  ['帮我找一个鸣潮账号 2000元以内','鸣潮'],
  ['搜索《崩坏：星穹铁道》账号 1500元以内','崩坏：星穹铁道'],
  ['找一个冒险岛台服账号','冒险岛'],
  ['找一个王者荣耀苹果QQ账号','王者荣耀']
 ];
 const checks=cases.map(([query,expected])=>{const game=resolveGame(query),clarification=clarifyGameEdition(query)||clarifyGeneralGame(query),plans=game?searchPlans(game,{}):[];return {query,game:game?.name||null,queries:plans.length,clarification_ready:!!clarification,passed:game?.name===expected&&plans.length>0}});
 return json({version:'universal-smoke-v1',checks,passed:checks.every(x=>x.passed),note:'离线确定性逻辑测试，不代表真实搜索服务或商品价格可用'});
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
if(url.pathname==='/api/search'&&request.method==='POST'){
 let body;try{body=await request.json()}catch{return json({error:'无效JSON'},400)}
 const query=String(body.query||'').slice(0,1000),incoming=body.filters||{};
 const game=resolveGame(query,incoming);
 if(!game)return json({error:'请提供游戏名称',status:'needs_clarification',candidates:[]},400);
 const filters={...parse(query),...incoming,game:game.name};
 const result=await agentSearchListings(query,filters,env);
 const candidates=result.items; // Canonical card schema is produced once by the Harness.
 return json({items:result.items,candidates,coverage:result.coverage,requirements:filters,filters,discovery_status:result.harness?.zero_result_reason||'searched',summary:candidates.length?'找到 '+candidates.length+' 条有价格证据的商品线索；在售状态请以源站为准。':'未获得符合条件且有价格证据的商品，不能据此判断平台无货。',agent:{status:'harness',summary:'由 Progressive Search Harness 执行，不依赖 OpenRouter。'},trace:result.trace,harness:result.harness,search_diagnostics:result.search_diagnostics,discovered_count:result.discovered_count,priced_count:result.priced_count,unpriced_leads:result.unpriced_leads});
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
 if(clarification?.requirements?.game&&body.mode!=='legacy_agent'){
  const req=clarification.requirements;
  const searchText=[req.game,req.server||'',req.profession||'',...(req.preferences||[])].filter(Boolean).join(' ');
  const result=await agentSearchListings(searchText,req,env);
  const reason=result.harness?.zero_result_reason;
  const messages={search_not_configured:'商品搜索服务尚未配置，不能判断市场缺货。',no_product_leads:'已尝试初始检索和补充检索，仍未发现可确认的商品详情链接。不能判断市场无货。',no_price_evidence:'找到商品线索，但未取得可靠的价格证据。',edition_evidence_missing:'Demo 模式不按版本过滤，请以源站详情确认版本。',constraints_or_identity_not_verified:'找到商品线索，但未有商品通过身份、预算和属性筛选。'};
  return json({answer:result.items.length?'找到 '+result.items.length+' 条有价格证据的商品线索（Demo 暂不按版本过滤，版本和在售状态需以源站为准）。':messages[reason]||'本轮未获得可展示的商品，请查看诊断信息。',items:result.items,unpriced_leads:result.unpriced_leads,requirements:req,trace:result.trace,coverage:result.coverage,search_diagnostics:result.search_diagnostics,harness:result.harness,status:result.items.length?'results':'search_incomplete',suggested_replies:[]});
 }
 const searchPrompt=clarification?.requirements?.game==='冒险岛'&&clarification?.requirements?.version?('冒险岛 '+clarification.requirements.version+' '+(clarification.requirements.max_price?'预算'+clarification.requirements.max_price+'元 ':'不限预算 ')+(clarification.requirements.profession||'')+' '+(clarification.requirements.preferences||[]).join(' ')+' '+prompt):clarification?.requirements?.game?[clarification.requirements.game,clarification.requirements.version||'',clarification.requirements.server||'',clarification.requirements.profession||'',clarification.requirements.max_price?'预算'+clarification.requirements.max_price+'元':'',clarification.requirements.realname==='yes'?'支持二次实名':'',...(clarification.requirements.preferences||[]),prompt].filter(Boolean).join(' '):prompt;const requested=String(body.model||'').slice(0,150);const available=await listModels(env);const model=requested&&available.models.some(x=>x.id===requested)?requested:env.OPENROUTER_MODEL||DEFAULT_MODEL;const messages=[{role:'system',content:'你是GamePilot游戏账号购买决策Agent。遇到版本不明确的游戏必须先澄清，严禁混合不同版本商品。必须先调用search_listings获取商品；可能找到搜索索引候选，但未核验在售，禁止将索引候选称为可购买商品；禁止编造商品、价格或实时库存。不要编造商品、价格、服务费、账号同一性。仅比较相似账号；不同区服不得判定同款。回复简洁中文，说明来源和交易风险。不可执行支付。'}, {role:'user',content:searchPrompt}];const trace=[];let answer='';let usage={};let items=[];try{for(let step=0;step<4;step++){const start=Date.now();const response=await fetch('https://openrouter.ai/api/v1/chat/completions',{method:'POST',headers:{Authorization:'Bearer '+env.OPENROUTER_API_KEY,'Content-Type':'application/json','HTTP-Referer':url.origin,'X-Title':'GamePilot AI'},body:JSON.stringify({model,messages,tools,tool_choice:step===0?'required':'auto',temperature:0.1}),signal:AbortSignal.timeout(20000)});if(!response.ok)return json({error:'模型服务返回 '+response.status,details:(await response.text()).slice(0,180)},502);const data=await response.json();usage=data.usage||usage;const msg=data.choices?.[0]?.message;if(!msg)return json({error:'模型没有返回消息'},502);messages.push(msg);if(!msg.tool_calls?.length){answer=msg.content||'分析完成';break}for(const call of msg.tool_calls.slice(0,5)){let args={};try{args=JSON.parse(call.function.arguments||'{}')}catch{}let result;
 if(call.function.name==='search_listings'){result=await agentSearchListings(searchPrompt,{...args,version:clarification?.requirements?.version||args.version},env);items=result.items||[]}
 else if(call.function.name==='compare_prices'){const ids=Array.isArray(args.ids)?args.ids:[];result=ids.map(id=>{const x=items.find(v=>v.id===id);return x?{id,platform:x.platform,price_cny:x.price,price_evidence:x.price_evidence,source_url:x.url,fees:'unknown',total_price:'unknown',status:x.status}:{id,error:'商品不在本轮真实搜索结果中'}})}
 else if(call.function.name==='check_risks'){const ids=Array.isArray(args.ids)?args.ids:[];result=ids.map(id=>{const x=items.find(v=>v.id===id);return x?{id,realname:x.realname,stock_status:x.status,warning:x.realname===true?'索引声称可二次实名，仍需源站确认':'实名条件未核验，谨慎交易',source_url:x.url}:{id,error:'商品不在本轮真实搜索结果中'}})}
 else result={error:'未知工具'};trace.push({tool:call.function.name,args,result,mode:'OpenRouter 工具调用',duration_ms:Date.now()-start});messages.push({role:'tool',tool_call_id:call.id,content:JSON.stringify(result)})}}return json({answer:answer||'已达到调用上限，请缩小需求',trace,items,usage,model,requirements:clarification?.requirements||prior})}catch{return json({error:'Agent 调用失败，请检查 OpenRouter 配置和网络'},502)}}
if(url.pathname.startsWith('/api/'))return json({error:'接口不存在'},404);return env.ASSETS.fetch(request)}};