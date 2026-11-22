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
   const host=q.match(/site:([^\s]+)/)?.[1];
   const game=q.includes('浏览器测试')?'浏览器测试':q.includes('青空测试')?'青空测试':q.includes('七条测试')?'七条测试':q.includes('三角洲')?'三角洲':q.includes('原神')||q.includes('Genshin')?'原神':q.includes('没价')?'没价':q.includes('阻断')?'阻断':null;
   const matches=host==='shop.5173.com'&&game==='浏览器测试'?[{url:'https://shop.5173.com/goods/123456789012',title:'浏览器测试账号 商品详情',description:'所属游戏：浏览器测试'}]:host==='gmmsj.com/h5/goods/detail'&&game==='浏览器测试'?[{url:'https://www.gmmsj.com/h5/goods/detail/index.html?book_id=12345678901234567',title:'浏览器测试账号 商品详情',description:'所属游戏：浏览器测试'}]:host==='gmmsj.com/h5/goods/detail'&&game==='青空测试'?[{url:'https://www.gmmsj.com/h5/goods/detail/index.html?book_id=00005000000015363821794470004765&game_id=5',title:'G买卖-商品详情',description:'商品详情 账号'}]:host==='pzds.com'&&game==='七条测试'?Array.from({length:7},(_,i)=>({url:'https://www.pzds.com/goodsDetails/DEMO'+(i+1)+'/6',title:'七条测试账号 '+(i+1)+(i===0?' 商品售价 ¥899':''),description:'所属游戏：七条测试'})):host==='pzds.com'&&game&&game!=='浏览器测试'?[{
    url:'https://www.pzds.com/goodsDetails/'+({三角洲:'TRI123',原神:'GEN123',没价:'NOP123',阻断:'BAD123'}[game])+'/6',
    title:game+'游戏账号'+(game==='没价'||game==='阻断'?'':' 商品售价 ¥899'),
    description:'所属游戏：'+game
   }]:[];
   if(host==='pzds.com'&&game==='三角洲')matches.push({url:'https://www.pzds.com/goodsDetails/WRONG123/6',title:'原神账号 商品售价 ¥100',description:'猜你喜欢三角洲'});
   return new Response(JSON.stringify({web:{results:matches}}),{status:200,headers:{'Content-Type':'application/json'}});
  }
  if(url.hostname==='shop.5173.com')return new Response('Access restricted',{status:403});
  if(url.hostname==='www.gmmsj.com'&&url.searchParams.get('book_id')==='12345678901234567')return new Response('Forbidden',{status:403});
  if(url.hostname==='www.gmmsj.com')return new Response('<html><title>G买卖-商品详情</title><body>商品详情 可领优惠券 ￥10 ￥280.00 库存 1 账号 编号 4470004765 游戏名称 青空测试 游戏区 演示区</body></html>',{status:200,headers:{'Content-Type':'text/html'}});
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
