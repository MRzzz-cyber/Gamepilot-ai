import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import assert from 'node:assert/strict';

const source=readFileSync(new URL('../worker/index.js',import.meta.url),'utf8');
const factory=new Function('fetch','URL','Response','AbortSignal',source.replace('export default {','const worker = {')+
 ';return {worker,resolveGame,interpretIntent,genericGameEvidence,searchPlans,extractPrice}');

function runtime(){
 const calls=[];
 const mockFetch=async input=>{
  const url=new URL(String(input));
  if(url.hostname==='api.search.brave.com'){
   const q=url.searchParams.get('q')||'';calls.push(q);
   const host=q.match(/site:([^\s]+)/)?.[1];
   const game=q.includes('三角洲')?'三角洲':q.includes('原神')||q.includes('Genshin')?'原神':q.includes('没价')?'没价':q.includes('阻断')?'阻断':null;
   const matches=host==='pzds.com'&&game?[{
    url:'https://www.pzds.com/goodsDetails/'+({三角洲:'TRI123',原神:'GEN123',没价:'NOP123',阻断:'BAD123'}[game])+'/6',
    title:game+'游戏账号'+(game==='没价'||game==='阻断'?'':' 商品售价 ¥899'),
    description:'所属游戏：'+game
   }]:[];
   if(host==='pzds.com'&&game==='三角洲')matches.push({url:'https://www.pzds.com/goodsDetails/WRONG123/6',title:'原神账号 商品售价 ¥100',description:'猜你喜欢三角洲'});
   return new Response(JSON.stringify({web:{results:matches}}),{status:200,headers:{'Content-Type':'application/json'}});
  }
  if(url.hostname==='www.pzds.com'){
   if(url.pathname.includes('BAD123'))return new Response('Access denied',{status:403});
   const game=url.pathname.includes('GEN')?'原神':url.pathname.includes('NOP')?'没价':'三角洲';
   const price=game==='没价'?'':' 商品售价：¥899';
   return new Response('<html><title>'+game+'账号 商品详情</title><body>商品编号 12345 '+game+' 账号'+price+'</body></html>',{status:200,headers:{'Content-Type':'text/html'}});
  }
  throw Error('Unexpected fetch '+url);
 };
 return {...factory(mockFetch,URL,Response,AbortSignal),calls};
}
async function post(worker,path,payload){
 const res=await worker.fetch({method:'POST',url:'https://gamepilot.example'+path,json:async()=>payload},{BRAVE_SEARCH_API_KEY:'test'});
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
