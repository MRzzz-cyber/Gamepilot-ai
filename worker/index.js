const inventory = [
 {id:'GP-101',game:'王者荣耀',title:'典藏皮肤收藏账号',price:980,skins:86,rare:5,risk:'低',verified:true},
 {id:'GP-102',game:'王者荣耀',title:'高段位英雄全收集',price:1280,skins:112,rare:3,risk:'中',verified:true},
 {id:'GP-103',game:'王者荣耀',title:'限定皮肤精选账号',price:760,skins:71,rare:7,risk:'低',verified:true},
 {id:'GP-104',game:'王者荣耀',title:'热门英雄入门账号',price:420,skins:34,rare:1,risk:'中',verified:false},
 {id:'GP-201',game:'原神',title:'多五星角色冒险账号',price:880,skins:0,rare:6,risk:'中',verified:true}
];
const tools = [
 {type:'function',function:{name:'search_game_assets',description:'按游戏、最高预算和限定皮肤数量搜索演示商品',parameters:{type:'object',properties:{game:{type:'string'},max_price:{type:'number'},min_rare:{type:'number'}},required:[]}}},
 {type:'function',function:{name:'estimate_account',description:'根据英雄、皮肤、限定皮肤数量计算模拟估值，非真实市场价格',parameters:{type:'object',properties:{heroes:{type:'number'},skins:{type:'number'},rare:{type:'number'}},required:['heroes','skins','rare']}}},
 {type:'function',function:{name:'check_trade_risk',description:'检查演示商品的风险标记',parameters:{type:'object',properties:{asset_id:{type:'string'}},required:['asset_id']}}}
];
function execute(name,args){
 if(name==='search_game_assets')return inventory.filter(x=>(!args.game||x.game.includes(args.game))&&(!args.max_price||x.price<=args.max_price)&&(!args.min_rare||x.rare>=args.min_rare));
 if(name==='estimate_account'){
  const heroes=Math.max(0,Math.min(500,Number(args.heroes)||0)),skins=Math.max(0,Math.min(1000,Number(args.skins)||0)),rare=Math.max(0,Math.min(skins,Number(args.rare)||0));
  const base=heroes*2+skins*6+rare*55;return {currency:'CNY',range:[Math.round(base*.75),Math.round(base*1.25)],basis:'演示用固定系数，未使用真实市场成交数据',not_financial_quote:true};
 }
 if(name==='check_trade_risk'){const x=inventory.find(x=>x.id===args.asset_id);return x?{id:x.id,risk:x.risk,verified:x.verified,warning:'仅为模拟标记；真实交易需核验归属、找回风险及平台规则'}:{error:'未找到商品'};}
 return {error:'未知工具'};
}
const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'};
const reply=(obj,status=200)=>new Response(JSON.stringify(obj),{status,headers});
export default {async fetch(request,env){
 const url=new URL(request.url);
 if(url.pathname==='/api/assets'&&request.method==='GET')return reply(inventory);
 if(url.pathname==='/api/chat'&&request.method==='POST'){
  if(!env.OPENROUTER_API_KEY)return reply({error:'尚未配置 OPENROUTER_API_KEY'},503);
  let body;try{body=await request.json()}catch{return reply({error:'请求 JSON 无效'},400)}
  const prompt=String(body.message||'').slice(0,1500);if(!prompt.trim())return reply({error:'请输入问题'},400);
  const model=env.OPENROUTER_MODEL||'openai/gpt-4o-mini';
  const messages=[{role:'system',content:'你是 GamePilot AI 游戏资产助手。只使用工具返回的商品和价格，不得捏造库存、市场价格或交易结果。估值是模拟计算，明确说明不代表真实行情。你不能进行真实交易。对用户使用简洁中文。涉及交易时提示需要用户确认及平台合规核验。'}, {role:'user',content:prompt}];
  const trace=[];let answer='';let usage={};
  try{
   for(let step=0;step<4;step++){
    const response=await fetch('https://openrouter.ai/api/v1/chat/completions',{method:'POST',headers:{'Authorization':`Bearer ${env.OPENROUTER_API_KEY}`,'Content-Type':'application/json','HTTP-Referer':url.origin,'X-Title':'GamePilot AI'},body:JSON.stringify({model,messages,tools,tool_choice:'auto',temperature:0.2})});
    if(!response.ok)return reply({error:`模型服务返回 ${response.status}`,details:(await response.text()).slice(0,300)},502);
    const data=await response.json();usage=data.usage||usage;const msg=data.choices?.[0]?.message;if(!msg)return reply({error:'模型未返回消息'},502);
    messages.push(msg);
    if(!msg.tool_calls?.length){answer=msg.content||'任务已完成';break;}
    for(const call of msg.tool_calls){let args={};try{args=JSON.parse(call.function.arguments||'{}')}catch{args={}}const result=execute(call.function.name,args);trace.push({tool:call.function.name,args,result});messages.push({role:'tool',tool_call_id:call.id,content:JSON.stringify(result)});}
   }
   if(!answer)answer='已达到本次工具调用轮次上限，请缩小需求后重试。';
   return reply({answer,trace,usage,model});
  }catch(e){return reply({error:'请求失败，请检查网络和模型配置'},502)}
 }
 if(url.pathname.startsWith('/api/'))return reply({error:'接口不存在'},404);
 return env.ASSETS.fetch(request);
}};
