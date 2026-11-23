import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import assert from 'node:assert/strict';

const source=readFileSync(new URL('../worker/index.js',import.meta.url),'utf8');
const factory=new Function('fetch','URL','Response','AbortSignal',source.replace('export default {','const worker = {')+
 ';return {worker,resolveGame,interpretIntent,genericGameEvidence,searchPlans,extractPrice,gmmsjDetail,isProductPage}');

function runtime(){
 const calls=[];
 const mockFetch=async input=>{
  const url=new URL(String(input));
  if(url.hostname==='api.search.brave.com'){
   const q=url.searchParams.get('q')||'';calls.push(q);
   // One Brave request now searches all three trusted domains via OR operators.
   const hosts=[...q.matchAll(/site:([^\s)]+)/g)].flatMap(m=>m[1]==='gmmsj.com'?['gmmsj.com/h5/goods/detail','gmmsj.com/dy','gmmsj.com']:m[1]==='5173.com'?['shop.5173.com','s.5173.com','5173.com']:[m[1]]);
   const game=q.includes('目录测试')?'目录测试':q.includes('浏览器测试')?'浏览器测试':q.includes('青空测试')?'青空测试':q.includes('七条测试')?'七条测试':q.includes('三角洲')?'三角洲':q.includes('原神')||q.includes('Genshin')?'原神':q.includes('没价')?'没价':q.includes('阻断')?'阻断':null;
   const matches=[];
   for(const host of hosts){
   const match=host==='gmmsj.com/dy'&&game==='目录测试'?[{url:'https://www.gmmsj.com/dy/5_zh.shtml',title:'目录测试账号商品列表',description:'所属游戏：目录测试'}]:host==='shop.5173.com'&&game==='浏览器测试'?[{url:'https://shop.5173.com/goods/123456789012',title:'浏览器测试账号 商品详情',description:'所属游戏：浏览器测试'}]:host==='gmmsj.com/h5/goods/detail'&&game==='浏览器测试'?[{url:'https://www.gmmsj.com/h5/goods/detail/index.html?book_id=12345678901234567',title:'浏览器测试账号 商品详情',description:'所属游戏：浏览器测试'}]:host==='gmmsj.com/h5/goods/detail'&&game==='青空测试'?[{url:'https://www.gmmsj.com/h5/goods/detail/index.html?book_id=00005000000015363821794470004765&game_id=5',title:'G买卖-商品详情',description:'商品详情 账号'}]:host==='pzds.com'&&game==='七条测试'?Array.from({length:7},(_,i)=>({url:'https://www.pzds.com/goodsDetails/DEMO'+(i+1)+'/6',title:'七条测试账号 '+(i+1)+(i===0?' 商品售价 ¥899':''),description:'所属游戏：七条测试'})):host==='pzds.com'&&game&&game!=='浏览器测试'?[{
    url:'https://www.pzds.com/goodsDetails/'+({三角洲:'TRI123',原神:'GEN123',没价:'NOP123',阻断:'BAD123'}[game])+'/6',
    title:game+'游戏账号'+(game==='没价'||game==='阻断'?'':' 商品售价 ¥899'),
    description:'所属游戏：'+game
   }]:[];
   matches.push(...match);
   if(host==='pzds.com'&&game==='三角洲')matches.push({url:'https://www.pzds.com/goodsDetails/WRONG123/6',title:'原神账号 商品售价 ¥100',description:'猜你喜欢三角洲'});
   }
   return new Response(JSON.stringify({web:{results:matches}}),{status:200,headers:{'Content-Type':'application/json'}});
  }
  if(url.hostname==='shop.5173.com')return new Response('Access restricted',{status:403});
  if(url.hostname==='www.gmmsj.com'&&url.searchParams.get('book_id')==='12345678901234567')return new Response('Forbidden',{status:403});
  if(url.hostname==='www.gmmsj.com'&&url.pathname.includes('detail_9999999999999.shtml'))return new Response('<html><title>目录测试账号 商品详情</title><body>商品详情 ￥450.00 库存 1 账号 编号 9999999999999 游戏名称 目录测试 账号正常</body></html>',{status:200,headers:{'Content-Type':'text/html'}});
  if(url.hostname==='www.gmmsj.com')return new Response('<html><title>G买卖-商品详情</title><body>商品详情 可领优惠券 ￥10 ￥280.00 库存 1 账号 编号 4470004765 游戏名称 青空测试 游戏区 演示区</body></html>',{status:200,headers:{'Content-Type':'text/html'}});
  if(url.hostname==='www.pzds.com'&&url.pathname.includes('KINGTEST'))return new Response('<html><title>王者荣耀高皮肤账号</title><body>商品编号 KINGTEST 商品售价 ¥899 游戏区服 王者荣耀-苹果QQ 贵族等级 贵族1 皮肤数306 英雄128 〖段位〗荣耀黄金 实名情况 可二次实名 商品描述 〖英雄数量〗128 〖皮肤数量〗306 苹果QQ成品账号可以交易交易流程</body></html>',{status:200,headers:{'Content-Type':'text/html'}});
  if(url.hostname==='www.pzds.com'){
   if(url.pathname.includes('BAD123'))return new Response('Access denied',{status:403});
   const game=url.pathname.includes('DEMO')?'七条测试':url.pathname.includes('GEN')?'原神':url.pathname.includes('NOP')?'没价':'三角洲';
   const price=game==='没价'||(game==='七条测试'&&!url.pathname.includes('DEMO1/6'))?'':' 商品售价：¥899';
   return new Response('<html><title>'+game+'账号 商品详情</title><body>商品编号 12345 '+game+' 账号'+price+'</body></html>',{status:200,headers:{'Content-Type':'text/html'}});
  }
  throw Error('Unexpected fetch '+url);
 };
 return {...factory(mockFetch,URL,Response,AbortSignal),calls};
}
async function post(worker,path,payload,extraEnv={}){
 const res=await worker.fetch({method:'POST',url:'https://gamepilot.example'+path,json:async()=>payload},{BRAVE_SEARCH_API_KEY:'test',...extraEnv});
 return {status:res.status,data:await res.json()};
}

test('unseen games, budgets, game switching, follow-ups and quoted titles',()=>{
 const {resolveGame,interpretIntent}=runtime();
 const cases=[['帮我找1000元以内的三角洲账号','三角洲',1000],
  ['1000元以内的三角洲行动账号','三角洲行动',1000],
  ['搜索《明日方舟》账号，预算500元','明日方舟',500],
  ['找2000元以内的原神账号，五星角色越多越好','原神',2000],
  ['从原神换成三角洲账号，预算1000元','三角洲',1000]];
 for(const [q,name,price] of cases){
  assert.equal(resolveGame(q,{game:'原神'}).name,name);
  const intent=interpretIntent(q,{game:'原神',max_price:3000,profession:'夜使者'});
  assert.equal(intent.requirements.game,name);
  assert.equal(intent.requirements.max_price,price);
  if(name!=='原神')assert.equal(intent.requirements.profession,null);
 }
 const first=interpretIntent('帮我找三角洲账号');
 assert.equal(first.needs_clarification,true);
 const second=interpretIntent('1000',{...first.requirements});
 assert.equal(second.needs_clarification,false);
 assert.equal(second.requirements.game,'三角洲');
 assert.equal(second.requirements.max_price,1000);
 assert.equal(interpretIntent('原神账号，五星角色越多越好，预算2000元').requirements.profession,null);
});

test('game category evidence is extracted only from labeled fields',()=>{
 const {genericGameEvidence}=runtime();
 const game={name:'三角洲',aliases:['三角洲']};
 assert.equal(genericGameEvidence('普通成品号','所属游戏：三角洲行动',game),true);
 assert.equal(genericGameEvidence('原神账号','猜你喜欢三角洲',game),false);
 assert.equal(genericGameEvidence('三角洲行动成品号','',game),true);
});

test('search and chat use the same product identity and price gate',async()=>{
 const {worker}=runtime();
 const old=await post(worker,'/api/chat',{message:'找2000元以内的原神账号',requirements:{},history:[]});
 assert.equal(old.status,200);
 assert.equal(old.data.items[0].game,'原神');
 const next=await post(worker,'/api/chat',{message:'找1000元以内的三角洲账号',requirements:{game:'原神',max_price:2000,profession:'夜使者'},history:[{role:'user',content:'原神账号 2000元'}]});
 assert.equal(next.status,200);
 assert.equal(next.data.requirements.game,'三角洲');
 assert.equal(next.data.requirements.profession,null);
 assert.equal(next.data.items[0].game,'三角洲');
 assert.equal(next.data.items[0].price,899);
 assert.ok(next.data.items[0].url.includes('TRI123'));
 assert.ok(next.data.items[0].price_audit);
 assert.ok(next.data.items[0].requirement_evaluation);
 const direct=await post(worker,'/api/search',{query:'1000元以内的三角洲账号',filters:{game:'原神'}});
 assert.equal(direct.status,200);
 assert.equal(direct.data.filters.game,'三角洲');
 assert.deepEqual(direct.data.candidates.map(x=>x.game),['三角洲']);
 assert.equal(direct.data.candidates[0].price,899);
 const underBudget=await post(worker,'/api/search',{query:'500元以内的三角洲账号',filters:{game:'原神'}});
 assert.equal(underBudget.data.candidates.length,0);
 assert.equal(underBudget.data.harness.zero_result_reason,'over_budget');
 assert.equal(underBudget.data.harness.result_status,'no_matches');
 assert.equal(underBudget.data.harness.filter_gate.over_budget,1);
 assert.equal(underBudget.data.harness.stages.at(-1).outcome,'no_match');
});

test('unpriced and blocked results preserve source links without inventing prices',async()=>{
 const {worker}=runtime();
 for(const [game,http] of [['没价',null],['阻断',403]]){
  const res=await post(worker,'/api/search',{query:'1000元以内的'+game+'账号',filters:{}});
  assert.equal(res.status,200);
  assert.equal(res.data.candidates.length,0);
  assert.ok(res.data.unpriced_leads.length>=1);
  assert.equal(res.data.unpriced_leads[0].platform,'盼之账号');
  assert.equal(res.data.unpriced_leads[0].http_status,http);
  assert.ok(res.data.unpriced_leads[0].url.startsWith('https://www.pzds.com/goodsDetails/'));
 }
});

test('seven discovered leads remain visible as one priced and six unpriced source cards',async()=>{
 const {worker}=runtime();
 const response=await post(worker,'/api/search',{query:'1000元以内的七条测试账号',filters:{}});
 assert.equal(response.status,200);
 assert.equal(response.data.lead_audit.discovered,7);
 assert.equal(response.data.candidates.length,1);
 assert.equal(response.data.unpriced_leads.length,6);
 assert.equal(response.data.excluded_leads.length,0);
 assert.ok(response.data.unpriced_leads.every(x=>x.price===null&&x.url.startsWith('https://www.pzds.com/goodsDetails/')));
 assert.ok(response.data.unpriced_leads.every(x=>x.reason.includes('价格字段')));
});

test('modern G买卖 H5 product paths and sale price vs coupon are parsed correctly',()=>{
 const {isProductPage,gmmsjDetail,searchPlans,resolveGame}=runtime();
 const detail=new URL('https://www.gmmsj.com/h5/goods/detail/index.html?book_id=00005000000015363821794470004765&game_id=5&goods_type=10');
 assert.equal(isProductPage(detail,'gmmsj.com'),true);
 assert.equal(isProductPage(new URL('https://www.gmmsj.com/h5/goods/detail/index.html'),'gmmsj.com'),false);
 assert.equal(isProductPage(new URL('https://www.gmmsj.com/dy/78_zh/detail_00078000000017940402211650003255.shtml'),'gmmsj.com'),true);
 assert.equal(isProductPage(new URL('https://shop.5173.com/goods/1234567890'),'5173.com'),true);
 assert.equal(isProductPage(new URL('https://shop.5173.com/'),'5173.com'),false);
 assert.equal(gmmsjDetail('<div>商品详情 可领优惠券 ￥10 1/0 ￥280.00 库存 1 账号 编号 0960009368 游戏名称 冒险岛</div>').price,280);
 assert.equal(gmmsjDetail('<div>商品详情 可领优惠券 ￥10 编号 0960009368</div>').price,null);
 const plans=searchPlans(resolveGame('三角洲账号'),{});
 assert.ok(plans.some(x=>x.q.includes('site:shop.5173.com')));
 assert.ok(plans.some(x=>x.q.includes('site:gmmsj.com/h5/goods/detail')));
});

test('G买卖 indexed H5 detail with generic title is verified against actual game name before display',async()=>{
 const {worker}=runtime();
 const response=await post(worker,'/api/search',{query:'500元以内的青空测试账号',filters:{}});
 assert.equal(response.status,200);
 assert.equal(response.data.candidates.length,1);
 assert.equal(response.data.candidates[0].game,'青空测试');
 assert.equal(response.data.candidates[0].price,280);
 assert.equal(response.data.candidates[0].id,'gmmsj.com:00005000000015363821794470004765');
 assert.ok(response.data.candidates[0].url.includes('book_id='));
 assert.equal(response.data.candidates[0].price_evidence,'gmmsj_detail_visible_price');
});

test('Cloudflare Browser Run rescues 5173 and G买卖 prices only after plain HTTP is blocked',async()=>{
 const {worker}=runtime();
 const called=[];
 const BROWSER={quickAction:async(action,options)=>{
  assert.equal(action,'content');
  called.push(options.url);
  const html=options.url.includes('gmmsj.com')?'<html><title>浏览器测试账号 商品详情</title><body>商品详情 5折优惠券 ￥10 ￥280.00 库存 1 账号 编号 12345678901234567 游戏名称 浏览器测试 特价在售</body></html>':'<html><title>浏览器测试账号 商品详情</title><body>商品编号 123456789012 所属游戏：浏览器测试 商品售价 ¥590 本商品信息展示在账号交易平台详情页</body></html>';
  return new Response(html,{status:200,headers:{'Content-Type':'text/html'}});
 }};
 const result=await post(worker,'/api/search',{query:'1000元以内的浏览器测试账号',filters:{}},{BROWSER});
 assert.equal(result.status,200);
 assert.equal(result.data.candidates.length,2);
 assert.deepEqual(result.data.candidates.map(x=>x.price).sort((a,b)=>a-b),[280,590]);
 assert.ok(result.data.candidates.every(x=>x.price_audit?.confidence==='medium'));
 assert.equal(result.data.search_diagnostics.browser.configured,true);
 assert.equal(result.data.search_diagnostics.browser.attempted,2);
 assert.equal(result.data.search_diagnostics.browser.recovered_prices,2);
 assert.equal(called.length,2);
 assert.ok(called.some(x=>x.includes('shop.5173.com')));
 assert.ok(called.some(x=>x.includes('gmmsj.com/h5/goods/detail')));
});

test('Browser Run is optional and does not fabricate prices when binding is missing',async()=>{
 const {worker}=runtime();
 const result=await post(worker,'/api/search',{query:'1000元以内的浏览器测试账号',filters:{}});
 assert.equal(result.status,200);
 assert.equal(result.data.candidates.length,0);
 assert.equal(result.data.unpriced_leads.length,2);
 assert.equal(result.data.search_diagnostics.browser.configured,false);
 assert.equal(result.data.search_diagnostics.browser.reason,'browser_binding_missing');
});

test('Browser Run reads a game-matched G买卖 category page and extracts real-looking detail URLs',async()=>{
 const {worker}=runtime();
 const calls=[];
 const BROWSER={quickAction:async(action,options)=>{
  assert.equal(action,'content');
  calls.push(options.url);
  assert.ok(options.url.includes('/dy/5_zh.shtml'));
  return new Response('<html><title>目录测试账号列表</title><body>目录测试游戏账号 <a href="detail_9999999999999.shtml">账号商品详细信息</a><a href="/dy/5_zh/detail_9999999999999.shtml">查看此商品</a></body></html>',{status:200,headers:{'Content-Type':'text/html'}});
 }};
 const result=await post(worker,'/api/search',{query:'1000元以内的目录测试账号',filters:{}},{BROWSER});
 assert.equal(result.status,200);
 assert.equal(result.data.candidates.length,1);
 assert.equal(result.data.candidates[0].price,450);
 assert.ok(result.data.candidates[0].url.includes('/dy/5_zh/detail_9999999999999.shtml'));
 assert.ok(result.data.trace.some(x=>x.tool==='browser_category_gmmsj.com'&&x.result.detail_pages>=1));
 assert.equal(calls.length,1);
});

test('5173 adapter accepts stable detail IDs, rejects search pages and never fabricates listings',()=>{
 const {isProductPage}=runtime();
 assert.equal(isProductPage(new URL('https://shop.5173.com/goods/123456789012'),'5173.com'),true);
 assert.equal(isProductPage(new URL('https://shop.5173.com/account/details/abc123456789'),'5173.com'),true);
 assert.equal(isProductPage(new URL('https://shop.5173.com/product?goodsId=abcdef123456'),'5173.com'),true);
 assert.equal(isProductPage(new URL('https://s.5173.com/search/abcdef123456'),'5173.com'),false);
 assert.equal(isProductPage(new URL('https://shop.5173.com/checkout/123456789012'),'5173.com'),false);
 assert.equal(isProductPage(new URL('https://shop.5173.com/'),'5173.com'),false);
});

test('on-demand verification reads actual 王者荣耀 product attributes and distinguishes 苹果区 from 苹果QQ',async()=>{
 const {worker}=runtime();
 const url='https://www.pzds.com/goodsDetails/KINGTEST/6';
 const apple=await post(worker,'/api/verify-lead',{url,game:'王者荣耀',max_price:1000,server:'苹果区'});
 assert.equal(apple.status,200);
 assert.equal(apple.data.detail_game,'王者荣耀');
 assert.equal(apple.data.game_match,true);
 assert.equal(apple.data.price,899);
 assert.equal(apple.data.attributes.server,'苹果QQ');
 assert.equal(apple.data.attributes.skins,306);
 assert.equal(apple.data.attributes.heroes,128);
 assert.equal(apple.data.attributes.realname,true);
 assert.equal(apple.data.attributes.rank,'荣耀黄金');
 assert.equal(apple.data.server_match,true);
 assert.equal(apple.data.price_status,'price_found');
 const android=await post(worker,'/api/verify-lead',{url,game:'王者荣耀',max_price:800,server:'安卓区'});
 assert.equal(android.data.price_status,'over_budget');
 assert.equal(android.data.server_match,false);
 const blocked=await post(worker,'/api/verify-lead',{url:'https://evil.example/listing/123456789',game:'王者荣耀'});
 assert.equal(blocked.status,400);
});

test('on-demand verification falls back to Browser Run for blocked G买卖 detail',async()=>{
 const {worker}=runtime();
 const BROWSER={quickAction:async()=>new Response('<html><title>G买卖-商品详情</title><body>商品详情 可领优惠券 ￥10 ￥280.00 库存 1 账号 编号 12345678901234567 游戏名称 浏览器测试 账号物品</body></html>',{status:200,headers:{'Content-Type':'text/html'}})};
 const result=await post(worker,'/api/verify-lead',{url:'https://www.gmmsj.com/h5/goods/detail/index.html?book_id=12345678901234567',game:'浏览器测试',max_price:500},{BROWSER});
 assert.equal(result.status,200);
 assert.equal(result.data.price,280);
 assert.equal(result.data.game_match,true);
 assert.equal(result.data.price_status,'price_found');
 assert.equal(result.data.steps[0].http_status,403);
 assert.equal(result.data.steps[1].status,'rendered');
});

test('search response retains 苹果区 intent even when the old sidebar sent server=all',async()=>{
 const {worker}=runtime();
 const result=await post(worker,'/api/search',{query:'找1000元以内苹果区王者荣耀账号',filters:{game:'原神',server:'all'}});
 assert.equal(result.status,200);
 assert.equal(result.data.filters.game,'王者荣耀');
 assert.equal(result.data.filters.server,'苹果区');
 assert.ok(result.data.harness.skill_flow.steps.some(x=>x.id==='requirements-parsing'));
});

test('G买卖 category cards preserve distinct IDs rather than copying adjacent product descriptions',async()=>{
 const html='<html><body><a href="/dy/5_zh/detail_1000000000001.shtml">查看详情</a><a href="/dy/5_zh/detail_1000000000002.shtml">查看详情</a></body></html>';
 const adapter=new Function('fetch','URL','AbortSignal',source.replace('export default {','const __worker = {')+';return {gmmsjCategoryLeads}')(
  async()=>new Response(html,{status:200,headers:{'Content-Type':'text/html'}}),URL,AbortSignal);
 const result=await adapter.gmmsjCategoryLeads({name:'冒险岛'},{version:null});
 assert.equal(result.items.length,2);
 assert.ok(result.items[0].title!==result.items[1].title);
 assert.ok(result.items.every(x=>x.price===null&&x.title.includes('详情待核验')));
});


test('G买卖 category prices stay attached to their own card; coupon and neighboring prices never leak',async()=>{
 const html='<html><body><ul>'+
 '<li><a href="/dy/5_zh/detail_1000000000001.shtml">账号 [剑豪 290级]高战力通用账号</a><span>可领优惠券 ¥10</span><div class="sell-price">¥1800.00</div></li>'+
 '<li><a href="/dy/5_zh/detail_1000000000002.shtml">账号 [莲 280级]高等级绝版装备</a><div class="sell-price">¥2555.00</div></li>'+
 '<li><a href="/dy/5_zh/detail_1000000000003.shtml">查看详情</a></li>'+
 '<li><a href="/dy/5_zh/detail_1000000000004.shtml">账号 [火毒 290级]待核验</a><div>¥1500.00 ¥1700.00</div></li>'+
 '</ul></body></html>';
 const api=new Function('fetch','URL','AbortSignal',source.replace('export default {','const __worker = {')+';return {gmmsjCategoryLeads}')(
  async()=>new Response(html,{status:200,headers:{'Content-Type':'text/html'}}),URL,AbortSignal);
 const result=await api.gmmsjCategoryLeads({name:'冒险岛'},{version:null});
 assert.equal(result.items.length,4);
 assert.equal(result.items[0].price,1800);
 assert.equal(result.items[1].price,2555);
 assert.equal(result.items[2].price,null);
 assert.equal(result.items[3].price,null);
 assert.equal(result.items[0].price_evidence,'gmmsj_category_visible_price');
 assert.match(result.items[0].title,/剑豪/);
 assert.match(result.items[1].title,/莲/);
});

test('G买卖 detail price after 保障类型 overrides listing and is not confused with coupons',()=>{
 const {gmmsjDetail}=runtime();
 const html='<html><title>冒险岛账号</title><body>商品编号：1890009016 浏览量（100） 收藏量（） 出售中 游戏区服：风之大陆 保障类型：已购买保障服务 商品类别：账号转卖 ¥8888.00 成交返元优惠券 猜你喜欢 ¥88</body></html>';
 assert.equal(gmmsjDetail(html).price,8888);
 assert.equal(gmmsjDetail(html).status,'listed');
});

test('G买卖 visible list prices survive blocked detail fetch and remain labeled non-realtime',async()=>{
 const html='<html><body><ul><li><a href="/dy/5_zh/detail_1000000000001.shtml">账号 [剑豪 290级]高战力通用账号</a><div>¥1800.00</div></li></ul></body></html>';
 const fakeFetch=async input=>{
  const url=new URL(String(input));
  if(url.hostname==='www.gmmsj.com'&&url.pathname==='/dy/5_zh.shtml')return new Response(html,{status:200,headers:{'Content-Type':'text/html'}});
  return new Response('Restricted',{status:403});
 };
 const api=new Function('fetch','URL','Response','AbortSignal',source.replace('export default {','const worker = {')+';return {worker}')(
  fakeFetch,URL,Response,AbortSignal);
 const res=await api.worker.fetch({method:'POST',url:'https://gamepilot.example/api/search',json:async()=>({query:'2000元以内冒险岛账号',filters:{}})},{});
 assert.equal(res.status,200);
 const data=await res.json();
 assert.equal(data.items.length,1);
 assert.equal(data.items[0].price,1800);
 assert.equal(data.items[0].price_evidence,'gmmsj_category_visible_price');
 assert.equal(data.items[0].price_audit.source,'源站商品列表（非实时）');
 assert.equal(data.items[0].price_audit.is_realtime,false);
});


test('G买卖 linked card root can be an <a> element and keeps matching 4860003785 price',async()=>{
 const id='000050000000017951759544860003785';
 const html='<html><body><div class="list">'+
 '<a class="product-item" href="/dy/5_zh/detail_'+id+'.shtml"><div>账号 [夜光法师 290级]1.5亿战力 克制3</div><span>可领优惠券 ¥10</span><p>商品类型：账号</p><strong>¥1700.00</strong></a>'+
 '<a class="product-item" href="/dy/5_zh/detail_000050000000017945833707520002917.shtml"><div>账号 [莲 280级]另一商品</div><b>¥850.00</b></a>'+
 '</div></body></html>';
 const api=new Function('fetch','URL','AbortSignal',source.replace('export default {','const __worker = {')+';return {gmmsjCategoryLeads}')(
  async()=>new Response(html,{status:200,headers:{'Content-Type':'text/html'}}),URL,AbortSignal);
 const result=await api.gmmsjCategoryLeads({name:'冒险岛'},{version:null});
 assert.equal(result.items.length,2);
 assert.equal(result.items[0].price,1700);
 assert.equal(result.items[1].price,850);
 assert.match(result.items[0].title,/夜光法师/);
 assert.equal(result.items[0].price_evidence,'gmmsj_category_visible_price');
});

test('G买卖 browser-renders list once when static feed has only links and details are blocked',async()=>{
 const id='000050000000017951759544860003785';
 const sourceUrl='https://www.gmmsj.com/dy/5_zh/detail_'+id+'.shtml';
 const links='<a href="'+sourceUrl+'">查看详情</a>';
 const rendered='<html><body><a class="product-card" href="'+sourceUrl+'"><div>账号 [夜光法师 290级]1.5亿战力</div><div>可用优惠券 ¥10</div><strong>¥1700.00</strong></a></body></html>';
 const calls=[];
 const BROWSER={quickAction:async(_action,opts)=>{
  calls.push(opts.url);
  if(opts.url.includes('5_zh.shtml'))return new Response(rendered,{status:200});
  return new Response('Not available',{status:403});
 }};
 const fakeFetch=async url=>{
  const u=new URL(String(url));
  if(u.pathname==='/dy/5_zh.shtml')return new Response(links,{status:200,headers:{'Content-Type':'text/html'}});
  return new Response('Blocked',{status:403});
 };
 const api=new Function('fetch','URL','Response','AbortSignal',source.replace('export default {','const worker = {')+';return {worker}')(
  fakeFetch,URL,Response,AbortSignal);
 const response=await api.worker.fetch({method:'POST',url:'https://gamepilot.example/api/search',json:async()=>({query:'2000元以内冒险岛账号',filters:{}})},{BROWSER});
 assert.equal(response.status,200);
 const data=await response.json();
 assert.equal(data.items.length,1);
 assert.equal(data.items[0].price,1700);
 assert.equal(data.items[0].price_audit.source,'源站商品列表（非实时）');
 assert.ok(data.trace.some(x=>x.tool==='gmmsj_category_price_render'&&x.result.priced===1));
 assert.equal(calls.filter(url=>url.includes('5_zh.shtml')).length,1);
});

test('G买卖 已下架 detail is excluded even if historical price exists',()=>{
 const {gmmsjDetail}=runtime();
 const r=gmmsjDetail('<div>商品编号：1234567890 浏览量（12） 收藏量（） 已下架 保障类型: 无 商品类别: 账号 ¥1500.00 猜你喜欢</div>');
 assert.equal(r.status,'sold');
});


test('G买卖冒险岛真实标题优先于隐藏编辑表单的「游戏名称 商品分类」',async()=>{
 const url='https://www.gmmsj.com/dy/5_zh/detail_00005000000017951759544860003785.shtml';
 const html='<html><head><title>冒险岛账号交易平台-G买卖- 夜光法师 290级</title></head><body>'+
  '<div>商品编号：4860003785 发布时间：2026-11-22 23:47:37 <h1>[夜光法师 290级]1.5亿战力</h1> 浏览量（167） 收藏量（） 出售中 游戏区服：风之大陆（电信）-威尔 保障类型：已购买保障服务 商品类别：账号转卖</div>'+
  '<p class="price"><i>¥</i>1700.00</p><div>猜你喜欢</div><div>商品留言</div>'+
  '<form>商品信息填写 游戏名称： 商品分类 游戏区服：商品分类</form></body></html>';
 const api=new Function('fetch','URL','Response','AbortSignal',source.replace('export default {','const worker = {')+';return {verifyListing}')(
  async()=>new Response(html,{status:200,headers:{'Content-Type':'text/html'}}),URL,Response,AbortSignal);
 const detail=await api.verifyListing(url);
 assert.equal(detail.detail_game,'冒险岛');
 assert.equal(detail.price,1700);
 assert.equal(detail.status,'listed');
});


test('G买卖官方 data-bookid 大型商品卡片提取真实价，忽略优惠券和相邻商品',async()=>{
 const id1='00005000000017951759544860003785',id2='00005000000017945833707520002917';
 const card=(id,title,price)=>'<li class="media" data-bookid="'+id+'">'+
  '<div class="media-body"><h4 class="media-heading">账号 ['+title+']高战力账号</h4><div class="coupon" data-bind="visible: Number('+price+'.00) < $root.minCoupon()">可用优惠券</div>'+
  '<div class="details">冒险岛-风之大陆（电信）-威尔</div>'+
  '<div class="extra">'+('<span data-bind="click:noop">其他商品描述</span>'.repeat(250))+'</div>'+
  '<div class="text-center price col-md-1" style="white-space: nowrap;">¥<i>'+price+'.00</i></div>'+
  '<a href="/dy/5_zh/detail_'+id+'.shtml">查看详情</a></div></li>';
 const html='<html><body><ul>'+card(id1,'夜光法师 290级',1700)+card(id2,'剑豪 289级',2888)+'</ul></body></html>';
 const api=new Function('fetch','URL','AbortSignal',source.replace('export default {','const __worker = {')+';return {gmmsjCategoryLeads,gmmsjStructuredCategoryCards}')(
  async()=>new Response(html,{status:200,headers:{'Content-Type':'text/html'}}),URL,AbortSignal);
 const raw=api.gmmsjStructuredCategoryCards(html);
 assert.equal(raw.get(id1).price,1700);
 assert.equal(raw.get(id2).price,2888);
 assert.match(raw.get(id1).title,/夜光法师/);
 const result=await api.gmmsjCategoryLeads({name:'冒险岛'},{version:'国服'});
 assert.equal(result.items.length,2);
 assert.equal(result.priced,2);
 assert.equal(result.items[0].price,1700);
 assert.equal(result.items[1].price,2888);
 assert.match(result.items[0].title,/夜光法师/);
 assert.match(result.items[1].title,/剑豪/);
 assert.equal(result.items[0].price_evidence,'gmmsj_category_visible_price');
});


test('官方盼之王者荣耀列表在 Brave 402 时仍提取正确商品价格并严格筛选区服、实名',async()=>{
 const card=(id,title,server,realname,amount)=>'<a href="/goodsDetails/'+id+'/6?from=official" title="'+title+'" data-track-click="goods" >'+
  '<div class="newGoodsList_box"><div>商品 '+id+'</div><div>'+server+' '+realname+'</div>'+
  '<div class="money"><span>¥</span><span>'+amount+'</span></div><span>已减311</span></div></a>';
 const html='<html><head><title>王者荣耀游戏账号交易平台_王者荣耀账号购买-盼之账号</title></head><body>'+
  card('KING1','皮肤数量311 英雄数量121 荣耀王者','苹果QQ','可二次实名','565')+
  card('KING2','皮肤数量280 英雄数量111 荣耀黄金','苹果QQ','不可二次实名','735')+
  card('KING3','皮肤数量250 英雄数量102 荣耀王者','安卓QQ','可二次实名','475')+
  '</body></html>';
 const calls=[];
 const fakeFetch=async input=>{
  const url=new URL(String(input));calls.push(url.href);
  if(url.hostname==='api.search.brave.com')return new Response(JSON.stringify({error:{detail:'Prepaid credit balance is insufficient'}}),{status:402,headers:{'Content-Type':'application/json'}});
  if(url.hostname==='www.pzds.com'&&url.pathname==='/goodsList/7/6')return new Response(html,{status:200,headers:{'Content-Type':'text/html'}});
  if(url.hostname==='www.pzds.com'&&url.pathname.includes('/goodsDetails/'))return new Response('Forbidden',{status:403});
  throw Error('Unexpected network call '+url.href);
 };
 const api=new Function('fetch','URL','Response','AbortSignal',source.replace('export default {','const worker = {')+';return {worker,pzdsCategoryLeads,pzdsCategoryCards}')(
  fakeFetch,URL,Response,AbortSignal);
 const feed=await api.pzdsCategoryLeads({name:'王者荣耀'},{});
 assert.equal(feed.priced,3);
 assert.deepEqual(feed.items.map(x=>x.price),[565,735,475]);
 assert.equal(feed.items[0].server,'苹果QQ');
 assert.equal(feed.items[0].realname,true);
 assert.equal(feed.items[1].realname,false);
 const res=await api.worker.fetch({url:'https://gamepilot.example/api/search',method:'POST',
  json:async()=>({query:'1000元以内的王者荣耀苹果QQ账号，支持二次实名，皮肤越多越好',filters:{game:'王者荣耀',max_price:1000,server:'苹果QQ',realname:'yes'}})},{BRAVE_SEARCH_API_KEY:'test'});
 const data=await res.json();
 assert.equal(res.status,200);
 assert.equal(data.candidates.length,1);
 assert.equal(data.candidates[0].price,565);
 assert.equal(data.candidates[0].server,'苹果QQ');
 assert.equal(data.candidates[0].realname,true);
 assert.equal(data.candidates[0].price_audit.source,'源站商品列表（非实时）');
 assert.equal(data.excluded_leads.length,2);
 assert.equal(data.coverage.platforms.find(x=>x.platform==='盼之账号').with_price,3);
 assert.ok(data.trace.some(x=>x.tool==='pzds_category'&&x.result.priced===3));
 assert.ok(data.trace.some(x=>x.tool==='discover_brave'&&x.result.http_status===402));
 assert.ok(calls.some(x=>x.includes('/goodsList/7/6')));
});


test('Brave caps to one request and 10 results; cache avoids a second paid call',async()=>{
 const requests=[],stored=new Map();
 const localCache={match:async req=>stored.get(req.url)?.clone()||null,put:async(req,response)=>{stored.set(req.url,response.clone())}};
 const mock=async input=>{
  const url=new URL(String(input));
  if(url.hostname==='api.search.brave.com'){
   requests.push({q:url.searchParams.get('q'),count:url.searchParams.get('count')});
   return new Response(JSON.stringify({web:{results:[]}}),{status:200,headers:{'Content-Type':'application/json'}});
  }
  if(url.hostname==='www.pzds.com'&&url.pathname==='/goodsList/7/6')return new Response('Not Found',{status:404});
  if(url.hostname==='www.gmmsj.com')return new Response('Not Found',{status:404});
  if(url.hostname==='shop.5173.com')return new Response('Not Found',{status:404});
  throw Error('Unexpected '+url.href);
 };
 const api=new Function('fetch','URL','Response','AbortSignal','caches',source.replace('export default {','const worker = {')+';return {worker}')(
  mock,URL,Response,AbortSignal,{default:localCache});
 const search=async()=>{const response=await api.worker.fetch({method:'POST',url:'https://gamepilot.example/api/search',
   json:async()=>({query:'500元以内的原神账号',filters:{game:'原神',max_price:500}})},{BRAVE_SEARCH_API_KEY:'test'});return response.json()};
 const first=await search();
 assert.equal(requests.length,1);
 assert.equal(requests[0].count,'10');
 assert.equal(first.search_diagnostics.brave.requests,1);
 assert.equal(first.search_diagnostics.brave.max_results,10);
 const second=await search();
 assert.equal(requests.length,1);
 assert.equal(second.search_diagnostics.brave.requests,0);
 assert.equal(second.search_diagnostics.brave.cache_hits,1);
});


function taoCard(id,price,title='三角洲账号'){
 const link='/taoid_'+id+'.html';
 return '<div class="item"><a class="acc-img auto-img-wrap" href="'+link+'"><img src="/img"></a>'+
  '<div class="des"><div class="line-2 title"><a href="'+link+'">'+title+'</a></div>'+
  '<div class="line-1 sub">安卓QQ | 全部区服</div>'+
  '<div class="price-sts"><div class="price">￥<span>'+price+'</span></div></div></div></div>';
}

function taoFixture(page,last,cards,bucket){
 const query='?quotaid=0&isinsurance=0&isCertificationShop=2&isActivity=0&tags=&isPreviewRank=0&bornType=-1&popularize=0&antiAddictionStatus=0';
 const next=page<last?'<a href="/game/sanjiaozhouxingdong-36881-0-0/0-0-0-0-'+bucket+'-13-0-0-0-'+(page+1)+query+'">下一页</a>':'';
 return '<title>三角洲行动交易平台</title><div data-current-page="'+page+'"></div>'+
  '<div id="account-list">'+cards+'</div><li><a>'+page+'/'+last+'</a></li>'+next;
}

test('Delta budget searches use native catalogue pagination and price evidence across chat and direct search',async()=>{
 const calls=[];
 const mock=async (input,init)=>{
  assert.equal(init?.redirect,'manual','Cloudflare Workers only accepts manual or follow');
  const url=new URL(String(input));
  calls.push(url.href);
  if(url.hostname==='www.pzds.com')return new Response('unavailable',{status:503});
  assert.equal(url.hostname,'www.taoshouyou.com');
  const parts=url.pathname.split('/').at(-1).split('-').map(Number),bucket=parts[4],page=parts.at(-1);
  const html=page===2?taoFixture(2,2,taoCard(80000005,'466'),bucket):
   taoFixture(1,bucket===3?2:1,bucket===3?taoCard(80000003,'500')+taoCard(80000004,'500.01'):
    bucket===1?taoCard(80000001,'45'):taoCard(80000002,'85')+taoCard(80000006,'96','首充账号 上号充值'),bucket);
  return new Response(html);
 };
 const {worker}=factory(mock,URL,Response,AbortSignal);
 const query='三角洲500元以内的账号';
 const {status,data:first}=await post(worker,'/api/search',{query,filters:{}});
 assert.equal(status,200);
 assert.deepEqual(first.items.map(x=>x.price),[45,85,500]);
 assert.ok(first.items.every(x=>x.price_evidence==='tao_category_visible_price'&&x.status==='unverified'));
 assert.equal(first.listing_page.source_pages,4);
 assert.deepEqual(first.listing_page.next_cursor,[{bucket:3,page:2}]);
 const {data:page2}=await post(worker,'/api/search',{query,page:first.listing_page.next_page,cursor:first.listing_page.next_cursor});
 assert.deepEqual(page2.items.map(x=>x.price),[466]);
 assert.equal(page2.listing_page.next_page,null);
 const {data:chat}=await post(worker,'/api/chat',{message:'三角洲行动500元以内的账号'});
 assert.deepEqual(chat.items.map(x=>x.price),[45,85,500]);
 assert.ok(chat.items.every(x=>x.game==='三角洲行动'));
 assert.ok(!calls.some(x=>x.includes('brave.com')||x.includes('/taoid_')));
 const invalid=await post(worker,'/api/search',{query,page:2,cursor:[{bucket:6,page:2}]});
 assert.equal(invalid.status,400);
});

test('catalogue requests retain failed price buckets for retry and reject a repeated upstream page',async()=>{
 const mock=async input=>{
  const url=new URL(String(input));
  if(url.hostname==='www.pzds.com')return new Response('',{status:503});
  const parts=url.pathname.split('/').at(-1).split('-').map(Number),bucket=parts[4],page=parts.at(-1);
  if(bucket===2)return new Response('',{status:429});
  return new Response(taoFixture(1,2,taoCard(81000000+bucket,'38'),bucket));
 };
 const {worker}=factory(mock,URL,Response,AbortSignal);
 const query='三角洲500元以内的账号';
 const {data:first}=await post(worker,'/api/search',{query});
 assert.deepEqual(first.listing_page.next_cursor,[{bucket:1,page:2},{bucket:2,page:1},{bucket:3,page:2}]);
 assert.equal(first.listing_page.source_pages,null);
 const next=await post(worker,'/api/search',{query,page:first.listing_page.next_page,cursor:first.listing_page.next_cursor});
 assert.equal(next.status,502);
 assert.ok(next.data.trace.some(x=>x.result.status==='unexpected_category_or_page'));
});
