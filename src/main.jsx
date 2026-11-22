import React,{useEffect,useMemo,useState,useRef} from 'react';
import{createRoot}from'react-dom/client';
import{Gamepad2,Search,SlidersHorizontal,ExternalLink,ArrowRight,Check,AlertTriangle,ChevronDown,RefreshCw,Activity,Sparkles,Layers3}from'lucide-react';
import './style.css';
const samples=['1000元以内的王者荣耀苹果QQ账号，支持二次实名，皮肤越多越好','找1500元以内冒险岛账号，优先高战力角色','2000元以内原神账号，五星角色越多越好','找800元以内地下城与勇士装备好的角色'];
const HARNESS_LAYERS=[
 {id:'intent',step:'01',type:'Skill',title:'需求解析',desc:'自然语言 → 游戏 / 预算 / 偏好',tag:'Intent Parser'},
 {id:'controller',step:'02',type:'Harness',title:'流程编排与回退',desc:'状态管理 · 换源重试 · 失败归因',tag:'Progressive Search'},
 {id:'retrieval',step:'03',type:'Tools',title:'多平台商品发现',desc:'Brave / 5173 / G买卖 / 盼之',tag:'Marketplace Adapters'},
 {id:'evidence',step:'04',type:'Tools',title:'详情与证据验证',desc:'HTTP → Browser Run 回退核价',tag:'Evidence Engine'},
 {id:'ranking',step:'05',type:'Policy',title:'精确筛选与排序',desc:'游戏、预算硬约束 · 偏好软排序',tag:'Filter & Rank'}
];
const harnessStageState=step=>{
 const result=step?.outcome;
 if(step.skipped||result==='skipped'||result==='not_used')return 'pending';
 if(['no_match','blocked','no_price_recovered','price_missing','not_checked','empty'].includes(result))return 'warning';
 if(step.stage==='hard_filter_and_rank'&&step.count===0)return 'warning';
 if(step.stage==='browser_render'&&(!step.configured||!step.count))return 'pending';
 if(step.stage==='native_5173'&&step.status!=='rendered_search')return 'warning';
 return 'finished';
};
const harnessResultDescription=(harness,items)=>{
 if(!harness)return '等待搜索';
 if(items.length)return '已找到 '+items.length+' 条满足硬条件的线索';
 const counts=harness.filter_gate||{};
 const why={
  over_budget:'价格超过预算 · '+(counts.over_budget||0)+' 条',
  no_price_evidence:'价格证据不足 · 无可核验报价',
  identity_or_availability_unverified:'游戏或商品身份尚未核实',
  other_constraints_unmet:'其他硬性条件不满足',
  constraints_or_identity_not_verified:'未找到符合全部硬条件的商品',
  no_product_leads:'未发现商品详情链接',
   search_api_credit_exhausted:'Brave Search 余额不足 · 请检查搜索服务或使用官网商品源',
  search_not_configured:'商品搜索尚未配置'
 };
 return why[harness.zero_result_reason]||'本次未匹配到商品';
};
const GAME_NAMES=['王者荣耀','冒险岛','原神','和平精英','地下城与勇士','英雄联盟','永劫无间','逆水寒'];
const GAME_ALIASES=[['王者荣耀',['王者荣耀','王者']],['冒险岛',['冒险岛','MapleStory','枫之谷']],['原神',['原神','Genshin']],['和平精英',['和平精英','吃鸡']],['地下城与勇士',['地下城与勇士','DNF','地下城']],['英雄联盟',['英雄联盟','LOL']],['永劫无间',['永劫无间']],['逆水寒',['逆水寒']]];
// UI hint only. Backend /api/chat and /api/search are authoritative for game identity.
const extractRequestedGame=q=>{
 const text=String(q||'').trim();
 const quoted=text.match(/[《「]([^》」]{2,36})[》」]/u);
 if(!quoted&&!/(?:账号|帐号|游戏号|成品号|账户|买号|号\s*$)/u.test(text))return null;
 const before=text.replace(/(?:游戏账号|成品号|游戏号|账号|帐号|账户|买号|号\s*$)[\s\S]*$/u,'');
 let name=(quoted?.[1]||before)
 .replace(/(?:预算|不超过|低于|最多|上限|价格)?\s*[¥￥]?\s*\d{2,7}\s*(?:元|块)?\s*(?:以内|以下|左右|上下)?\s*(?:的)?/g,' ')
 .replace(/^(?:(?:请|麻烦|可以|能不能|帮我|给我|我想|我需要|我要|想要|需要|推荐|搜索|搜|找|买|购买|看看|求购|一下|一个|一款|一些|个|的)\s*)+/u,'').replace(/^(?:的\s*)+/u,'')
 .split(/(?:换成|切换到|改找|改搜|改成)/u).at(-1).trim();
 const lookup=name.replace(/^(?:(?:苹果|安卓)(?:QQ|微信|区)|iOS区|国际服|台服|国服)\s*/gi,'').replace(/\s*(?:(?:苹果|安卓)(?:QQ|微信|区)|iOS区|国际服|台服|国服)$/gi,'').trim();
 const known=GAME_ALIASES.find(([,aliases])=>aliases.some(alias=>lookup.toLowerCase()===alias.toLowerCase()||lookup.toLowerCase().startsWith(alias.toLowerCase())&&/^(?:苹果|安卓|qq|微信|国服|台服|国际服)*$/i.test(lookup.slice(alias.length))));
 if(known)return known[0];
 return name.length>=2&&name.length<=35?name:null;
};
const inferGame=q=>GAME_ALIASES.find(([,aliases])=>aliases.some(a=>String(q||'').toLowerCase().includes(a.toLowerCase())))?.[0]||null;
const withoutGame=q=>{const v=String(q||'').trim();const g=inferGame(v);return g&&v.startsWith(g)?v.slice(g.length).trim():v};
const fmt=v=>v==null?'价格未公开':'¥'+Number(v).toLocaleString('zh-CN');
const attr=(x,k)=>x.key_attributes?.[k]??null;
const attrLabel=(x)=>x.game==='王者荣耀'?'皮肤 / 英雄':x.game==='冒险岛'?'职业 / 战力':x.game==='原神'?'角色 / 武器':'角色 / 装备';
const attrValue=(x)=>x.game==='王者荣耀'?`${attr(x,'skins')??'—'} / ${attr(x,'heroes')??'—'}`:x.game==='冒险岛'?`${attr(x,'profession')??'职业未知'} / ${attr(x,'power')??'战力未知'}`:'详情待核实';
const detailFields=a=>{
 if(!a)return [];
 const entries=[['区服',a.server],['皮肤',a.skins],['英雄',a.heroes],['段位',a.rank],['贵族',a.noble],['等级',a.level],['职业',a.profession],['战力',a.power],['库存标记',a.stock],['实名',a.realname===true?'可二次实名':a.realname===false?'不可二次实名':null]];
 return entries.filter(([,v])=>v!==null&&v!==undefined&&v!=='').slice(0,8);
};
function App(){
 const searchEpoch=useRef(0),searchAbort=useRef(null),analysisEpoch=useRef(0),analysisAbort=useRef(null);
 const [showAllPending,setShowAllPending]=useState(false),[showAllExcluded,setShowAllExcluded]=useState(false);
 const [detailStates,setDetailStates]=useState({});
 const [health,setHealth]=useState(null),[analysisBusy,setAnalysisBusy]=useState(false),[unpricedLeads,setUnpricedLeads]=useState([]),[excludedLeads,setExcludedLeads]=useState([]),[leadAudit,setLeadAudit]=useState(null),[harness,setHarness]=useState(null),[searchDiagnostics,setSearchDiagnostics]=useState(null),[chatInput,setChatInput]=useState(''),[chatHistory,setChatHistory]=useState([]),[requirementsState,setRequirementsState]=useState({}),[chatBusy,setChatBusy]=useState(false),[chatError,setChatError]=useState(''),[suggestedReplies,setSuggestedReplies]=useState([]),[query,setQuery]=useState(''),[game,setGame]=useState('王者荣耀'),[page,setPage]=useState('home'),[server,setServer]=useState('all'),[budget,setBudget]=useState(1000),[realname,setRealname]=useState('all'),[models,setModels]=useState([]),[model,setModel]=useState('openai/gpt-4o-mini'),[modelsReady,setModelsReady]=useState(false),[items,setItems]=useState([]),[trace,setTrace]=useState([]),[status,setStatus]=useState(''),[summary,setSummary]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[chosen,setChosen]=useState([]),[analysis,setAnalysis]=useState(''),[usage,setUsage]=useState(null),[usedModel,setUsedModel]=useState(''),[agent,setAgent]=useState(null),[coverage,setCoverage]=useState(null);
 useEffect(()=>{fetch('/api/health',{cache:'no-store'}).then(r=>r.json()).then(setHealth).catch(()=>setHealth({ok:false,search_configured:false}))},[]);
 useEffect(()=>{fetch('/api/models').then(r=>r.json()).then(d=>{setModels(d.models||[]);setModel(d.default_model||d.models?.[0]?.id||'openai/gpt-4o-mini');setModelsReady(true)}).catch(()=>setModelsReady(true))},[]);
 const priced=useMemo(()=>items.filter(x=>x.price!=null),[items]);
 const byPlatform=useMemo(()=>({pzds:coverage?.platforms?.find(x=>x.platform==='盼之账号')?.discovered??items.filter(x=>x.platform==='盼之账号').length,market5173:coverage?.platforms?.find(x=>x.platform==='5173')?.discovered??items.filter(x=>x.platform==='5173').length,gmmsj:coverage?.platforms?.find(x=>x.platform==='G买卖')?.discovered??items.filter(x=>x.platform==='G买卖').length}),[items,coverage]);
 const selected=items.filter(x=>chosen.includes(x.id));
 async function verifyLead(lead){
  if(!lead?.url||detailStates[lead.url]?.loading)return;
  const epoch=searchEpoch.current;
  setDetailStates(prev=>({...prev,[lead.url]:{loading:true}}));
  try{
   const response=await fetch('/api/verify-lead',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({url:lead.url,game:lead.game||game,max_price:Number(requirementsState.max_price||budget),server:requirementsState.server||server})});
   const payload=await response.json();
   if(epoch!==searchEpoch.current)return;
   if(!response.ok)throw Error(payload.error||'详情核验失败');
   setDetailStates(prev=>({...prev,[lead.url]:{...payload,loading:false}}));
   setTrace(prev=>[...prev,{tool:'verify_lead',source_url:lead.url,result:{status:payload.status,price_found:payload.price!=null,game_match:payload.game_match,via_browser:payload.steps?.some(x=>x.tool==='browser_run')||false},duration_ms:payload.duration_ms||0}]);
  }catch(e){if(epoch===searchEpoch.current)setDetailStates(prev=>({...prev,[lead.url]:{error:String(e.message||'核验失败'),loading:false}}))}
 }
 function beginSearch(){
  searchAbort.current?.abort();analysisAbort.current?.abort();analysisEpoch.current+=1;
  setAnalysisBusy(false);
  const controller=new AbortController(),id=++searchEpoch.current;
  searchAbort.current=controller;
  return {id,signal:controller.signal};
 }
 function isLatest(id){return searchEpoch.current===id}
 function resetDiscovery(){
  setItems([]);setUnpricedLeads([]);setExcludedLeads([]);setDetailStates({});setLeadAudit(null);setShowAllPending(false);setShowAllExcluded(false);setChosen([]);setTrace([]);setCoverage(null);
  setHarness(null);setSearchDiagnostics(null);setSummary('');setAnalysis('');
  setUsage(null);setUsedModel('');setAgent(null);setError('');setChatError('');
 }
 function changeGame(value){
  const next=String(value||'').trimStart();
  searchAbort.current?.abort();analysisAbort.current?.abort();
  searchEpoch.current+=1;analysisEpoch.current+=1;
  setGame(next);setQuery('');setChatHistory([]);setRequirementsState({});
  resetDiscovery();setChatInput('');setSuggestedReplies([]);setServer('all');setRealname('all');
  setBusy(false);setChatBusy(false);setAnalysisBusy(false);
 }
 function applySearchResult(d){
  const expectedGame=d.requirements?.game||d.filters?.game||null;
  setItems((d.items||d.candidates||[]).filter(x=>!expectedGame||x.game===expectedGame));
  setUnpricedLeads((d.unpriced_leads||[]).filter(x=>!expectedGame||!x.game||x.game===expectedGame));
  setExcludedLeads((d.excluded_leads||[]).filter(x=>!expectedGame||!x.game||x.game===expectedGame));
  setLeadAudit(d.lead_audit||null);
  setTrace(d.trace||[]);
  setCoverage(d.coverage||null);
  setHarness(d.harness||null);
  setSearchDiagnostics({discovered:d.discovered_count??d.search_diagnostics?.identity_matched??d.coverage?.totals?.discovered??0,
   priced:d.priced_count??d.search_diagnostics?.priced??d.coverage?.totals?.with_price??0,
   editionRejected:d.edition_rejected_count??d.harness?.stages?.find(x=>x.stage==='edition_filter')?.rejected??0,
   errors:d.search_error_count??d.search_diagnostics?.upstream_errors??0,
   errorSamples:d.search_error_samples||[]});
 }
 async function run(q=query,filters=null){
  const text=String(q||'').trim();if(!text)return;
  const {id,signal}=beginSearch();
  const hintedGame=extractRequestedGame(text);if(hintedGame)setGame(hintedGame);
  setBusy(true);setChatBusy(false);resetDiscovery();setQuery(text);setPage('results');
  setChatHistory([]);setRequirementsState({});setSuggestedReplies([]);
  try{
   // Send the raw query. Do NOT prepend a stale game name to an explicit new request.
   const payload={query:text,model,filters:{...(filters||{}),game}};
   const r=await fetch('/api/search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal});
   const d=await r.json();if(!isLatest(id))return;
   if(!r.ok)throw Error(d.error||'搜索失败');
   applySearchResult(d);setStatus(d.discovery_status||'searched');setSummary(d.summary||'');
   setAgent(d.agent||null);
   if(d.filters){setGame(d.filters.game||game);setServer(d.filters.server||'all');setBudget(d.filters.max_price||1000);setRealname(d.filters.realname||'all')}
  }catch(e){if(isLatest(id)&&e.name!=='AbortError')setError(e.message)}
  finally{if(isLatest(id))setBusy(false)}
 }
 async function analyze(){
  if(!query||!items.length||analysisBusy)return;
  analysisAbort.current?.abort();
  const controller=new AbortController(),id=++analysisEpoch.current;analysisAbort.current=controller;
  setAnalysisBusy(true);setAnalysis('');setError('');
  try{
   const r=await fetch('/api/analyze',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({query,game,max_price:Number(budget),model,candidates:items}),signal:controller.signal});
   const d=await r.json();if(id!==analysisEpoch.current)return;
   if(!r.ok)throw Error(d.error||'模型分析失败');
   setAnalysis(d.answer||'未返回分析结论');setUsage(d.usage||null);setUsedModel(d.model||'');
  }catch(e){if(id===analysisEpoch.current&&e.name!=='AbortError')setError(e.message)}
  finally{if(id===analysisEpoch.current)setAnalysisBusy(false)}
 }
 async function sendChat(value=chatInput){
  const message=String(value||'').trim();if(!message)return;
  const {id,signal}=beginSearch();
  const nextGame=extractRequestedGame(message);
  const switchingGame=!!(nextGame&&nextGame!==requirementsState?.game);
  const previous=switchingGame?[]:chatHistory;
  const nextHistory=[...previous,{role:'user',content:message}];
  setChatHistory(nextHistory);setChatInput('');setBusy(false);setChatBusy(true);if(switchingGame){setGame(nextGame);setServer('all');setRealname('all');setRequirementsState({})}
  resetDiscovery();setSuggestedReplies([]);setPage('results');setQuery(message);
  try{
   const r=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({message,model,requirements:switchingGame?{}:requirementsState,history:previous}),signal});
   const d=await r.json();if(!isLatest(id))return;
   if(!r.ok)throw Error(d.error||'Agent 对话失败');
   const requirements=d.requirements||(switchingGame?{}:requirementsState);
   setRequirementsState(requirements);
   setChatHistory([...(requirements.game&&requirementsState?.game&&requirements.game!==requirementsState.game?[{role:'user',content:message}]:nextHistory),{role:'assistant',content:d.answer||'已完成搜索'}]);
   setSuggestedReplies(d.suggested_replies||[]);
   if(requirements.game){setGame(requirements.game);setServer(requirements.server||'all');setRealname(requirements.realname||'all')}
   if(requirements.max_price!=null)setBudget(requirements.max_price);
   setQuery([requirements.game,requirements.version,requirements.max_price!=null?'预算'+requirements.max_price+'元':null].filter(Boolean).join(' · ')||message);
   if(d.status==='needs_clarification'){
    setSummary('正在确认关键条件，尚未搜索商品');setStatus('needs_clarification');
   }else{
    applySearchResult(d);setSummary(d.answer||'');setStatus(d.status||'searched');
   }
  }catch(e){
   if(isLatest(id)&&e.name!=='AbortError'){
    setChatError(e.message);setChatHistory([...nextHistory,{role:'assistant',content:'请求失败：'+e.message}]);
   }
  }finally{if(isLatest(id))setChatBusy(false)}
 }
 function toggle(id){setChosen(v=>v.includes(id)?v.filter(x=>x!==id):v.length<3?[...v,id]:v)}
 const modelOptions=models.length?models:[{id:model,name:model}];
 return <div className="shell">
 <header className="topbar"><div className="brand" onClick={()=>setPage('home')}><div className="brandMark"><Gamepad2 size={22}/></div><strong>GamePilot<span> AI</span></strong><span className="beta">V1.0 · HARNESS MAP</span></div><nav><button className={page==='home'?'active':''} onClick={()=>setPage('home')}>智能找货</button><button className={page==='results'?'active':''} onClick={()=>setPage('results')}>搜索结果</button><button className={page==='compare'?'active':''} onClick={()=>setPage('compare')} disabled={!selected.length}>卡片对比 {chosen.length?chosen.length:''}</button></nav><div className="topStatus" title={health?.build||"搜索配置状态待确认"}><span className="statusDot"/>{health===null?'检查搜索配置中':!health.ok?'服务状态未知':health.search_configured?(health.browser_configured?'搜索与浏览器已配置 · 商品待核验':'搜索已配置 · 浏览器未启用'):'搜索服务未配置'}</div></header>
 {page==='home'?<main className="landing"><div className="heroBadge"><Sparkles size={14}/> AI GAME ASSET DISCOVERY</div><h1>找到值得买的游戏账号<span>价格、配置、风险，一眼看清。</span></h1><p className="heroSub">一句话描述需求，自动发现不同平台的账号，整理为清晰的商品卡片。</p><div className="searchPanel"><div className="searchMain"><Search size={22}/><input value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>e.key==='Enter'&&sendChat(query)} placeholder="例如：1500元以内的冒险岛账号，战力高、装备好…"/><button className="accent" disabled={busy||chatBusy||!query.trim()} onClick={()=>sendChat(query)}>Agent 对话找货 <ArrowRight size={17}/></button></div><div className="searchFooter"><div className="modelPicker"><Sparkles size={15}/><span>分析模型</span><select value={model} onChange={e=>setModel(e.target.value)}>{modelOptions.map(x=><option value={x.id} key={x.id}>{x.name}</option>)}</select></div><span className="tiny">自动搜索 · 多平台发现 · 证据透明</span></div></div><div className="suggestions"><span>试试搜索</span>{samples.map(s=><button key={s} onClick={()=>sendChat(s)}>{s}<ArrowRight size={13}/></button>)}</div><div className="featureGrid"><div><Search/><b>跨平台发现</b><p>搜索盼之、5173、G买卖的公开商品索引</p></div><div><Layers3/><b>商品卡片对比</b><p>统一呈现价格、区服和配置字段</p></div><div><AlertTriangle/><b>来源与风险标识</b><p>区分搜索参考价和真实在售报价</p></div></div></main>:page==='results'?<main className="resultsLayout"><aside className="filters"><div className="sideTitle"><SlidersHorizontal size={17}/> 筛选条件</div><label>游戏（可输入任意名称）</label><input list="gamepilot-games" value={game} onChange={e=>changeGame(e.target.value)} placeholder="输入游戏名称" /><datalist id="gamepilot-games">{GAME_NAMES.map(g=><option value={g} key={g}/>)}</datalist>{game==='王者荣耀'&&<><label>区服</label><select value={server} onChange={e=>setServer(e.target.value)}><option value="all">全部区服</option>{['苹果区','安卓区','苹果QQ','安卓QQ','苹果微信','安卓微信'].map(s=><option key={s}>{s}</option>)}</select></>}<label>最高预算（元）</label><input type="number" min="1" value={budget} onChange={e=>setBudget(e.target.value)}/>{game==='王者荣耀'&&<><label>实名要求</label><select value={realname} onChange={e=>setRealname(e.target.value)}><option value="all">不限</option><option value="yes">可二次实名</option><option value="no">不可二次实名</option></select></>}<button className="accent wide" disabled={busy||!game.trim()} onClick={()=>run((query&&query.includes(game)?query:game+' 账号'),{server:game==='王者荣耀'?server:'all',max_price:Number(budget),realname:game==='王者荣耀'?realname:'all'})}><RefreshCw size={15}/> 重新搜索</button><div className="sideNote">搜索索引可能过期。缺失价格、区服或库存证据的商品不能被视为已核验在售。</div></aside>
 <section className="resultsContent"><section className="agentChatPanel" style={{padding:18,border:'1px solid #34435b',borderRadius:14,marginBottom:20,background:'rgba(40,54,77,.18)'}}><div className="sideTitle"><Sparkles size={17}/> Agent 边聊边找货</div><div style={{display:'flex',flexWrap:'wrap',gap:8,margin:'12px 0'}}>{Object.entries(requirementsState).filter(([k,v])=>v!=null&&v!==''&&(!Array.isArray(v)||v.length)).map(([k,v])=><span key={k} style={{border:'1px solid #465875',padding:'5px 9px',borderRadius:9,fontSize:12}}>{({game:'游戏',version:'版本',max_price:'预算',profession:'职业',preferences:'偏好'})[k]||k}：{Array.isArray(v)?v.join('、'):k==='max_price'?'¥'+v:v}</span>)}</div><div style={{maxHeight:220,overflowY:'auto'}}>{chatHistory.map((m,i)=><p key={i} style={{margin:'7px 0',fontSize:13,whiteSpace:'pre-wrap'}}><b>{m.role==='user'?'你':'Agent'}：</b>{m.content}</p>)}</div>{suggestedReplies.length>0&&<div style={{display:'flex',flexWrap:'wrap',gap:6,margin:'10px 0'}}>{suggestedReplies.map(v=><button className="ghost" key={v} disabled={chatBusy} onClick={()=>sendChat(v)}>{v}</button>)}</div>}<div className="agentChatComposer" style={{display:'flex',gap:8,marginTop:12}}><input style={{flex:1,minWidth:0}} value={chatInput} onChange={e=>setChatInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&sendChat()} placeholder="输入新游戏或补充需求，例如：1000元以内三角洲账号" /><button className="accent" disabled={!chatInput.trim()} onClick={()=>sendChat()}>{chatBusy?'理解与搜索中…':'发送并找货'}</button></div>{chatError&&<div className="warning">{chatError}</div>}<small>支持任意游戏名称；切换游戏会重置旧条件和搜索结果。未核验报价需复查。</small></section><div className="resultsHeading"><div><div className="overline">DISCOVERY RESULTS</div><h1>为你找到的账号</h1><p>根据你的需求自动搜索多个交易平台</p></div><button className="ghost" onClick={()=>setPage('home')}>修改需求</button></div><div className="queryPill"><Search size={16}/><span><b>{game}</b> · {withoutGame(query)||'账号搜索'}</span></div><div className="statGrid"><div><small>候选线索（非商品库存）</small><strong>{leadAudit?.discovered??searchDiagnostics?.discovered??items.length}</strong></div><div><small>盼之商品线索</small><strong>{byPlatform.pzds}</strong></div><div><small>5173 商品线索</small><strong>{byPlatform.market5173}</strong></div><div><small>G买卖商品线索</small><strong>{byPlatform.gmmsj}</strong></div><div><small>含参考价格</small><strong>{searchDiagnostics?.priced??priced.length}</strong></div></div>{harness&&<section className="coveragePanel" style={{marginBottom:14}}><div className="coverageTitle"><Layers3 size={17}/> Progressive Search Harness</div><p>检索轮次：{harness.attempts} · <strong style={{color:items.length?'#70e4c6':'#f1c089'}}>{harnessResultDescription(harness,items)}</strong></p>{(harness.stages||[]).map((stage,i)=><p key={i} style={{fontSize:13}}>{i+1}. {({discover_primary:'初始商品检索',discover_fallback:'补充检索',verify_details:'HTTP 详情验证',browser_render:'浏览器渲染核价',native_5173:'5173 站内搜索',edition_filter:'版本筛选',hard_filter_and_rank:'条件筛选与排序'})[stage.stage]||stage.stage}：{stage.count} 条{stage.priced!=null?' · 有价格 '+stage.priced+' 条':''}</p>)}</section>}{searchDiagnostics&&<section className="coveragePanel" style={{marginBottom:14}}><div className="coverageTitle"><Activity size={17}/> 搜索漏斗诊断</div><p>发现 {searchDiagnostics.discovered} 条线索 · 提取参考价 {searchDiagnostics.priced} 条 · 版本/游戏身份排除 {searchDiagnostics.editionRejected} 条 · 搜索服务错误 {searchDiagnostics.errors} 次 · 最终匹配 {items.length} 条</p>{searchDiagnostics.errorSamples.map((e,i)=><p key={i} style={{fontSize:12,overflowWrap:'anywhere'}}>⚠ {e.source}：HTTP {e.status||'未知'} {e.detail||''}</p>)}{!items.length&&<p style={{fontSize:13}}>0 条最终结果不代表平台无货。请根据上面的搜索错误、版本过滤和价格获取情况定位问题。</p>}</section>}{coverage&&<section className="coveragePanel"><div className="coverageTitle"><Activity size={17}/> 平台数据覆盖 <span>本次搜索 · 详情页抽样核验</span></div><div className="coverageGrid">{coverage.platforms.map(p=><div className="coverageItem" key={p.platform}><b>{p.platform}</b><strong>{p.discovered} <small>条线索</small></strong><span>含价格 {p.with_price} · 详情价格 {p.detail_priced}</span><span>已核验详情 {p.detail_checked} · 在售标记 {p.listed}</span>{p.search_errors?.length>0&&<em>搜索错误 {p.search_errors.join(', ')}</em>}</div>)}</div><div className="coverageFooter">合计 {coverage.totals.discovered} 条 · 详情提取价格 {coverage.totals.detail_priced} 条 · 排除已售 {coverage.totals.sold} 条。结构化在售标记不等于真实可下单。</div></section>}{busy&&<div className="loadingState"><RefreshCw className="spin" size={18}/> 正在搜索并整理商品线索…</div>}{error&&<div className="warning">{error}</div>}{!busy&&<div className="infoBanner"><AlertTriangle size={17}/><div>{items.length?'以下为公开搜索索引线索，不代表当前在售。参考价未经实时确认，不作为购买报价。':summary||'未发现商品详情线索，不代表市场无货。'}</div></div>}
 {agent&&<div className="agentSummary"><div className="agentSummaryHead"><Sparkles size={17}/> AI 商品匹配 <span>{agent.status==='completed'?'已分析 '+(agent.model||''):'自动分析 '+(agent.reason||agent.status)}</span></div><p>{agent.summary||'已执行自动找货与确定性匹配；模型分析暂不可用。'}</p></div>}{leadAudit&&<div className="coveragePanel" style={{margin:'12px 0 18px'}}><div className="coverageTitle"><Layers3 size={16}/> 商品线索去向（共 {leadAudit.discovered} 条）</div><p>检索发现的线索不等于可购买商品。下方按来源与证据状态分别展示，每条商品仅计入一个分类。</p><div className="auditSummaryGrid"><div><small>有价格且通过条件</small><strong>{items.length}</strong></div><div><small>价格未核实</small><strong>{unpricedLeads.length}</strong></div><div><small>排除或条件不符</small><strong>{excludedLeads.length}</strong></div></div>{(items.length+unpricedLeads.length+excludedLeads.length)!==leadAudit.discovered&&<p className="warning">统计口径存在差异：总计 {leadAudit.discovered}，分类合计 {items.length+unpricedLeads.length+excludedLeads.length}。请检查筛选日志。</p>}</div>}{items.length>0&&<div className="coverageTitle" style={{margin:'16px 0 12px'}}><Search size={17}/> 有价格证据的商品 <span>{items.length} 条 · 非实时报价</span></div>}<div className="cards">{items.map(x=><article className="productCard" key={x.id}><div className="cardTop"><span className="platformTag">{x.platform}</span><span className="unverified">{x.status==='listed'?'详情标记在售':x.status==='sold'?'已售出':x.detail_check==='unverified'?'详情待核验':'索引待核验'}</span></div><div className="cardPrice"><strong>{fmt(x.price)}</strong><span>{x.price==null?'未取得可核对报价':x.price_audit?.source==='商品详情页'?'商品详情提取价 · 非实时':x.price_audit?.source==='源站商品列表（非实时）'?'官方商品列表标价 · 非实时':'搜索索引参考价 · 非实时'}</span></div><h3>{x.title||(x.game||game)+'游戏账号'}</h3>{x.detail_summary&&<p className="leadSummary">{x.detail_summary}</p>}{x.detail_attributes&&detailFields(x.detail_attributes).length>0&&<div className="leadAttributeGrid">{detailFields(x.detail_attributes).map(([label,value])=><span key={label}>{label}：<b>{value}</b></span>)}</div>}{x.version_label&&<div className="evidenceLine">{x.version_label} · Demo 暂不按版本筛选</div>}<div className="attributeGrid"><div><small>区服</small><b>{x.server||'待确认'}</b></div><div><small>{attrLabel(x)}</small><b>{attrValue(x)}</b></div><div><small>实名状态</small><b>{x.realname===true?'索引显示可二次实名':x.realname===false?'索引显示不可二次实名':'待确认'}</b></div><div><small>库存状态</small><b>{x.status==='listed'?'结构化标记在售':'未核验'}</b></div></div>{x.price_conflict&&<div className="warning">索引价与详情页提取价不一致，已优先展示详情价，请复核</div>}<div className="matchScore">需求匹配参考分 <b>{x.match_score??'—'}</b> / 100 <span> · {x.requirement_evaluation?.fit==='matched'?'已知条件符合':x.requirement_evaluation?.fit==='partial'?'属性待核实':'条件待评估'}</span></div>{x.requirement_evaluation?.unknown?.length>0&&<div className="evidenceLine">待核实：{x.requirement_evaluation.unknown.slice(0,3).join('、')}</div>}{x.price_audit&&<div className="evidenceLine">价格来源：{x.price_audit.source} · {x.price_audit.confidence==='medium'?'中':'低'}可信度 · 非实时{ x.price_audit.verified_at?' · 核验 '+new Date(x.price_audit.verified_at).toLocaleString('zh-CN'):''}</div>}{x.agent_note&&<div className="agentCardNote"><Sparkles size={13}/><span>{x.agent_note.reason} · 风险：{x.agent_note.risk}</span></div>}<p className="cardDescription">{x.description||'商品信息待补全'}</p><div className="cardFoot"><a href={x.url} target="_blank" rel="noopener noreferrer">查看来源 <ExternalLink size={14}/></a><button className={chosen.includes(x.id)?'choose chosen':'choose'} onClick={()=>toggle(x.id)}>{chosen.includes(x.id)?<><Check size={15}/> 已加入</>:<><Layers3 size={15}/> 加入对比</>}</button></div></article>)}</div>
 {unpricedLeads.length>0&&<section className="coveragePanel" style={{margin:'18px 0'}}><div className="coverageTitle"><AlertTriangle size={17}/> 价格待核验的商品线索 <span>{unpricedLeads.length} 条 · 可查看来源</span></div><p>搜索先发现商品链接，每轮仅自动读取最多15条详情；其余请点击卡片的「读取商品详情」进行按需验证。没有可靠价格的账号不计入预算内匹配，也不代表在售。</p><div className="cards">{(showAllPending?unpricedLeads:unpricedLeads.slice(0,12)).map((x,i)=><article className="productCard" key={x.url||i}><div className="cardTop"><span className="platformTag">{x.platform}</span><span className="unverified">价格待核验</span></div><div className="cardPrice"><strong>{detailStates[x.url]?.price!=null&&detailStates[x.url]?.game_match?'¥'+detailStates[x.url].price:'¥ —'}</strong><span>{detailStates[x.url]?.price!=null&&detailStates[x.url]?.game_match?'本次详情核验获取 · 非实时':'目标游戏价格未核实'}</span></div><h3>{detailStates[x.url]?.attributes?.title||x.title||'商品详情线索'}</h3>{(x.detail_listing_id||x.id)&&<div className="leadProductId">商品编号：{x.detail_listing_id||x.id}</div>}{x.detail_summary&&<p className="leadSummary">{x.detail_summary}</p>}<div className="evidenceLine">{x.http_status?'详情页 HTTP '+x.http_status:x.fetch_error?'抓取失败：'+x.fetch_error:x.detail_status==='not_checked'?'尚未读取商品详情':x.reason||'价格字段缺失或动态加载'}</div>{detailStates[x.url]&&!detailStates[x.url].loading&&!detailStates[x.url].error&&<div className="leadVerifyDetails"><p>{detailStates[x.url].game_match?'游戏身份已在详情中确认':'详情未能确认目标游戏'} · {detailStates[x.url].price_status==='over_budget'?'超出当前预算':detailStates[x.url].price!=null?'提取到参考价格':'价格仍未取得'}{detailStates[x.url].reason?' · '+detailStates[x.url].reason:''}</p>{detailStates[x.url].attributes?.summary&&<p>{detailStates[x.url].attributes.summary}</p>}<div className="leadAttributeGrid">{detailFields(detailStates[x.url].attributes).map(([label,value])=><span key={label}>{label}：<b>{value}</b></span>)}</div></div>}{detailStates[x.url]?.error&&<p className="warning">{detailStates[x.url].error}</p>}<div className="cardFoot"><button type="button" className="leadVerifyButton" onClick={()=>verifyLead(x)} disabled={detailStates[x.url]?.loading}>{detailStates[x.url]?.loading?'正在读取…':detailStates[x.url]?.checked_at?'重新核验详情':'读取商品详情'}</button><a href={x.url} target="_blank" rel="noopener noreferrer">打开源站核价 <ExternalLink size={14}/></a></div></article>)}</div>{unpricedLeads.length>12&&<button className="ghost" style={{marginTop:12}} onClick={()=>setShowAllPending(!showAllPending)}>{showAllPending?'收起其余线索':'展开全部 '+unpricedLeads.length+' 条待核价线索'}</button>}</section>}
 {excludedLeads.length>0&&<details className="diagnostics" open style={{margin:'18px 0'}}><summary><AlertTriangle size={16}/> 另外 {excludedLeads.length} 条线索未纳入推荐（查看原因） <ChevronDown size={15}/></summary><p>可能是游戏身份不匹配、已售、超出预算或存在其他证据问题。这些不是可购买商品推荐。</p><div className="cards">{(showAllExcluded?excludedLeads:excludedLeads.slice(0,12)).map((x,i)=><article className="productCard" key={x.url||i}><div className="cardTop"><span className="platformTag">{x.platform}</span><span className="unverified">已排除</span></div><h3>{x.title||'未通过验证的线索'}</h3><div className="cardPrice"><strong>{x.price!=null?fmt(x.price):'¥ —'}</strong><span>不计入符合条件商品</span></div><p className="evidenceLine">原因：{x.status==='wrong_game'||x.status==='game_unconfirmed'?'游戏身份不匹配或缺少证据':x.status==='sold'?'源站标记售出':x.status==='stale'?'商品信息过期':x.price!=null?'预算或其他硬条件未通过':x.reason||'商品未通过验证'}</p><div className="cardFoot"><a href={x.url} target="_blank" rel="noopener noreferrer">查看来源 <ExternalLink size={14}/></a></div></article>)}</div>{excludedLeads.length>12&&<button className="ghost" style={{marginTop:12}} onClick={()=>setShowAllExcluded(!showAllExcluded)}>{showAllExcluded?'收起其余线索':'显示全部 '+excludedLeads.length+' 条排除线索'}</button>}</details>}
 {!busy&&!items.length&&!unpricedLeads.length&&<div className="emptyState"><Search size={32}/><h3>还没有找到可展示的商品详情</h3><p>请展开下方数据诊断，检查平台搜索返回数量与详情页过滤数量。不会使用模拟数据填充。</p></div>}
 <details className="diagnostics"><summary><Activity size={16}/> 开发者诊断（默认折叠） <ChevronDown size={15}/></summary><div className="diagnosticInner">{trace.map((t,i)=><div className="diagnosticRow" key={i}><b>{t.tool}</b><span>{t.duration_ms??0} ms</span><pre>{JSON.stringify(t.result||{},null,2)}</pre></div>)}{!trace.length&&<p>尚无执行记录</p>}</div></details></section>
 <aside className="insights executionAside harnessExplorer">
 <div className="harnessExplorerTop">
  <span className="harnessExplorerKicker">GAMEPILOT / SEARCH HARNESS</span>
  <div className="harnessExplorerTitle"><Activity size={19}/><strong>Agent 执行路径</strong></div>
  <div className="harnessExplorerSubtitle">Progressive Search · 实际执行与结果</div>
  <div className="harnessArchitectureRibbon"><span>工具调用可追踪</span><span>筛选结果可解释</span></div>
 </div>
   <div className="executionHeader harnessRuntimeHeader"><div className="sideTitle"><Activity size={16}/> 本次执行</div><span className={'executionState '+(busy||chatBusy?'running':harness?(items.length?'done':'warning'):'idle')}>{busy||chatBusy?'检索中':harness?(items.length?'有匹配':'未匹配'):'待搜索'}</span></div>
  {harness?<>
   <div className={'harnessRuntimeSummary '+(items.length?'matchFound':'noMatch')}><strong>{harnessResultDescription(harness,items)}</strong><span>{harness.version||'Progressive Search'} · {harness.attempts??0} 轮发现 · {leadAudit?.discovered??searchDiagnostics?.discovered??0} 条线索</span></div>
   <div className="executionFlow">
    {(harness.stages||[]).map((step,i)=><div className={'executionStep '+harnessStageState(step)} key={i}><span className="executionNode">{harnessStageState(step)==='finished'?'✓':harnessStageState(step)==='warning'?'!':i+1}</span><div className="executionStepBody"><strong>{({discover_primary:'发现商品',discover_fallback:'补充搜索',verify_details:'HTTP 验证详情',browser_render:'Browser Run 渲染核价',native_5173:'5173 官网站内搜索',edition_filter:'核对游戏',hard_filter_and_rank:'筛选与排序'})[step.stage]||step.stage}</strong><small>{step.stage==='browser_render'&&!step.configured?'未启用浏览器绑定':step.stage==='browser_render'&&!step.count?'未触发浏览器回退':step.stage==='native_5173'?(step.status==='rendered_search'?'已提交站内查询':'未完成：'+step.status)+' · '+step.count+' 条链接':step.stage==='hard_filter_and_rank'&&!step.count?'0 条匹配 · 不代表筛选成功':step.stage==='verify_details'?step.count+' 条已读详情 · '+(step.pending_count||0)+' 条待按需读取 · '+(step.priced||0)+' 条有价格':step.stage==='browser_render'?step.count+' 次渲染 · 恢复 '+(step.priced||0)+' 条价格':step.count+' 条'+(step.priced!=null?' · 有价格 '+step.priced+' 条':'')+(step.requests!=null?' · '+step.requests+' 次请求':'')}</small></div></div>)}
   </div>
   {harness.zero_result_reason&&<div className="executionAlert"><AlertTriangle size={15}/><span>{({search_not_configured:'搜索服务尚未配置',no_product_leads:'未发现可确认的商品详情链接',search_api_credit_exhausted:'Brave Search 额度不足，搜索尚未完成',no_price_evidence:'价格证据不足',edition_evidence_missing:'版本证据不足',constraints_or_identity_not_verified:'没有商品通过全部硬条件',over_budget:'已有报价均超过预算',identity_or_availability_unverified:'游戏身份或商品状态未通过核验',other_constraints_unmet:'商品存在其他硬性条件不符'})[harness.zero_result_reason]||harness.zero_result_reason}</span></div>}
   {harness.filter_gate&&<div className="harnessGateBreakdown"><span>有价格 {harness.filter_gate.with_price??0} 条</span><span>目标游戏有价 {harness.filter_gate.correct_game_priced??0} 条</span><span>超预算 {harness.filter_gate.over_budget??0} 条</span></div>}<div className="harnessRunCounts"><div>可推荐<strong>{items.length}</strong></div><div>待核价<strong>{unpricedLeads.length}</strong></div><div>已排除<strong>{excludedLeads.length}</strong></div></div>
  </>:<div className="harnessRuntimeEmpty"><Search size={20}/><p>{busy||chatBusy?'搜索请求执行中，完成后显示服务端真实日志。':'搜索后这里会显示真实执行的 Skill、工具及结果状态。'}</p></div>}
  <details className="executionDetails"><summary><Layers3 size={14}/> 数据源及工具调用 <ChevronDown size={14}/></summary><div className="executionDetailBody">{trace.filter(t=>t.tool?.startsWith('discover_')||t.tool==='gmmsj_category'||t.tool==='pzds_category'||t.tool==='search_configuration'||t.tool?.startsWith('browser_')||t.tool==='verify_lead').map((t,i)=><p key={i}>{t.tool==='verify_lead'?'逐条商品详情核验 · '+(t.result?.price_found?'取得价格':'价格未取得')+' · '+(t.result?.game_match?'游戏已确认':'游戏未确认'):t.tool==='browser_native_5173'?'5173 站内搜索 · '+(t.result?.status||'未知')+' · '+(t.result?.detail_pages||0)+' 条链接':t.tool==='browser_render_summary'?'Browser Run · '+(t.result?.configured?'已配置':'未启用')+' · 恢复价格 '+(t.result?.recovered_prices||0)+' 条':t.tool==='browser_render_detail'?'浏览器核价 ('+(t.source||'平台')+') · '+(t.result?.recovered_price?'成功':'未恢复'):t.tool.startsWith('browser_category_')?'渲染分类页 · '+(t.result?.detail_pages||0)+' 条链接':t.tool.replace('discover_','')+' · '+(t.result?.detail_pages??t.result?.raw_results??0)+' 条'}{t.duration_ms!=null?' · '+t.duration_ms+'ms':''}</p>)}{!trace.length&&<p>暂无后端来源记录</p>}</div></details>
  <p className="executionFootnote">这里的步骤数量来自后端 Trace；不是模拟的实时进度。</p>
 <details className="harnessArchitectureDetails" open>
  <summary className="harnessArchitectureToggle"><span><Layers3 size={16}/> Harness 框架</span><ChevronDown size={16}/></summary>
  <div className="harnessArchitectureBody">
   <p className="harnessArchitectureIntro">五层执行架构 · 需求解析到商品证据</p>
  <div className="harnessArchitectureCaption"><span>CONTROL PLANE + EXECUTION TOOLS</span><b>5 LAYERS</b></div>
  <div className="harnessArchitectureFlow">
   {HARNESS_LAYERS.map(layer=><div className={'harnessArchitectureLayer layer-'+layer.id} key={layer.id}>
    <div className="harnessLayerRail"><span>{layer.step}</span></div>
    <div className="harnessLayerContent">
     <div className="harnessLayerType">{layer.type} <span>{layer.tag}</span></div>
     <strong>{layer.title}</strong>
     <p>{layer.desc}</p>
    </div>
   </div>)}
  </div>
  <div className="harnessOutputLabel">OUTPUT · EVIDENCE FIRST</div>
  <div className="harnessOutputGrid">
   <div><span className="outputBullet ready"/><b>符合条件</b><small>有价格证据</small></div>
   <div><span className="outputBullet pending"/><b>待核验</b><small>保留来源链接</small></div>
   <div><span className="outputBullet excluded"/><b>已排除</b><small>保留排除原因</small></div>
  </div>
  <div className="harnessDesignPrinciple"><Sparkles size={15}/><span>结构化解析需求；Harness 控制执行；代码核验商品。</span></div>
   <details className="harnessSkillAudit"><summary><Layers3 size={14}/> 本轮 Skill 执行契约 <ChevronDown size={14}/></summary>
    <div className="harnessSkillRows">{harness?.skill_flow?.steps?.length?harness.skill_flow.steps.map(step=><div key={step.id}><strong>{({'requirements-parsing':'需求解析','marketplace-discovery':'平台发现','detail-verification':'详情核验','evidence-filtering':'证据过滤','preference-ranking':'偏好排序'})[step.id]||step.id}</strong><span>{({'completed':'已执行','empty':'没有线索','not_executed':'未执行','no_match':'未匹配','skipped_no_matches':'没有候选可排序'})[step.status]||step.status}</span></div>):<p>搜索后展示后端真实执行的 Skill 阶段。</p>}</div>
    <p>SKILL.md 是标准化能力契约；当前执行引擎是确定性代码，并非模型自动加载 Skill。</p>
   </details>

   <p className="harnessArchitectureDisclaimer">框架展示系统职责，实际调用以顶部执行路径及后端记录为准。</p>
  </div>
 </details>
  <details className="executionDetails harnessAnalysisDetails"><summary><Sparkles size={14}/> OpenRouter 结果分析 <ChevronDown size={14}/></summary><div className="executionDetailBody"><label>模型选择</label><select value={model} onChange={e=>setModel(e.target.value)}>{modelOptions.map(x=><option value={x.id} key={x.id}>{x.name}</option>)}</select><button className="accent wide" onClick={analyze} disabled={busy||chatBusy||analysisBusy||!items.length}>{analysisBusy?'分析中…':'运行分析'} <ArrowRight size={15}/></button>{analysis&&<div className="analysisText">{analysis}</div>}{usedModel&&<div className="modelMeta">实际调用：{usedModel}{usage&&<p>Token：{usage.total_tokens??'—'}</p>}</div>}</div></details>

</aside></main>:<main className="comparePage"><button className="ghost" onClick={()=>setPage('results')}>← 返回商品结果</button><div className="overline">SIDE BY SIDE</div><h1>商品卡片对比</h1><p>已选 {selected.length} 个商品。所有价格均为未核验的搜索索引参考价。</p><div className="compareGrid">{selected.map(x=><article className="productCard" key={x.id}><div className="cardTop"><span className="platformTag">{x.platform}</span><span className="unverified">待核验</span></div><div className="cardPrice"><strong>{fmt(x.price)}</strong><span>{x.price_audit?.source||'索引参考价'} · 非实时</span></div><h3>{x.title}</h3>{[['游戏区服',x.server||'待确认'],[attrLabel(x),attrValue(x)],['实名状态',x.realname===true?'索引显示可二次实名':x.realname===false?'索引显示不可二次实名':'待确认'],['在售状态',x.status==='listed'?'详情标记在售（未验证可下单）':'未核验'],['交易费用','未知'],['最终到手价','费用未知，无法确认'],['价格证据',x.price_audit?.source||'搜索索引']].map(([k,v])=><div className="compareLine" key={k}><span>{k}</span><b>{v}</b></div>)}<a className="compareSource" href={x.url} target="_blank" rel="noopener noreferrer">查看原始来源 <ExternalLink size={14}/></a></article>)}</div><div className="infoBanner"><AlertTriangle size={18}/> 不同区服或账号配置不可视为同款；缺少可信库存与费用信息时，不计算“全网最低价”。</div></main>}
 {page==='results'&&chosen.length>0&&<div className="compareDock"><span>已选 <b>{chosen.length}</b> / 3 个账号</span><button className="accent" onClick={()=>setPage('compare')}>查看卡片对比 <ArrowRight size={16}/></button></div>}
 </div>
}
createRoot(document.getElementById('root')).render(<App/>);
