import React,{useEffect,useMemo,useState,useRef} from 'react';
import{createRoot}from'react-dom/client';
import{Gamepad2,Search,SlidersHorizontal,ExternalLink,ArrowRight,Check,AlertTriangle,ChevronDown,RefreshCw,Activity,Sparkles,Layers3}from'lucide-react';
import './style.css';
const samples=['1000元以内的王者荣耀苹果QQ账号，支持二次实名，皮肤越多越好','找1500元以内冒险岛账号，优先高战力角色','2000元以内原神账号，五星角色越多越好','找800元以内地下城与勇士装备好的角色'];
const GAME_NAMES=['王者荣耀','冒险岛','原神','和平精英','地下城与勇士','英雄联盟','永劫无间','逆水寒'];
const GAME_ALIASES=[['王者荣耀',['王者荣耀','王者']],['冒险岛',['冒险岛','MapleStory','枫之谷']],['原神',['原神','Genshin']],['和平精英',['和平精英','吃鸡']],['地下城与勇士',['地下城与勇士','DNF','地下城']],['英雄联盟',['英雄联盟','LOL']],['永劫无间',['永劫无间']],['逆水寒',['逆水寒']]];
// UI hint only. Backend /api/chat and /api/search are authoritative for game identity.
const extractRequestedGame=q=>{
 const text=String(q||'').trim();
 const quoted=text.match(/[《「]([^》」]{2,36})[》」]/u);
 if(!quoted&&!/(?:账号|帐号|游戏号|成品号|账户|买号)/u.test(text))return null;
 const before=text.replace(/(?:游戏账号|成品号|游戏号|账号|帐号|账户|买号)[\s\S]*$/u,'');
 let name=(quoted?.[1]||before)
 .replace(/(?:预算|不超过|低于|最多|上限|价格)?\s*[¥￥]?\s*\d{2,7}\s*(?:元|块)?\s*(?:以内|以下|左右|上下)?\s*(?:的)?/g,' ')
 .replace(/^(?:(?:请|麻烦|可以|能不能|帮我|给我|我想|我需要|我要|想要|需要|推荐|搜索|找|买|购买|看看|求购|一下|一个|一款|一些|个|的)\s*)+/u,'').replace(/^(?:的\s*)+/u,'')
 .split(/(?:换成|切换到|改找|改搜|改成)/u).at(-1).trim();
 const known=GAME_ALIASES.find(([,aliases])=>aliases.some(alias=>name.toLowerCase()===alias.toLowerCase()||name.toLowerCase().startsWith(alias.toLowerCase())&&/^(?:苹果|安卓|qq|微信|国服|台服|国际服)*$/i.test(name.slice(alias.length))));
 if(known)return known[0];
 return name.length>=2&&name.length<=35?name:null;
};
const inferGame=q=>GAME_ALIASES.find(([,aliases])=>aliases.some(a=>String(q||'').toLowerCase().includes(a.toLowerCase())))?.[0]||null;
const withoutGame=q=>{const v=String(q||'').trim();const g=inferGame(v);return g&&v.startsWith(g)?v.slice(g.length).trim():v};
const fmt=v=>v==null?'价格未公开':'¥'+Number(v).toLocaleString('zh-CN');
const attr=(x,k)=>x.key_attributes?.[k]??null;
const attrLabel=(x)=>x.game==='王者荣耀'?'皮肤 / 英雄':x.game==='冒险岛'?'职业 / 战力':x.game==='原神'?'角色 / 武器':'角色 / 装备';
const attrValue=(x)=>x.game==='王者荣耀'?`${attr(x,'skins')??'—'} / ${attr(x,'heroes')??'—'}`:x.game==='冒险岛'?`${attr(x,'profession')??'职业未知'} / ${attr(x,'power')??'战力未知'}`:'详情待核实';
function App(){
 const searchEpoch=useRef(0),searchAbort=useRef(null),analysisEpoch=useRef(0),analysisAbort=useRef(null);
 const [showAllPending,setShowAllPending]=useState(false),[showAllExcluded,setShowAllExcluded]=useState(false),const [health,setHealth]=useState(null),[analysisBusy,setAnalysisBusy]=useState(false),[unpricedLeads,setUnpricedLeads]=useState([]),[excludedLeads,setExcludedLeads]=useState([]),[leadAudit,setLeadAudit]=useState(null),[harness,setHarness]=useState(null),[searchDiagnostics,setSearchDiagnostics]=useState(null),[chatInput,setChatInput]=useState(''),[chatHistory,setChatHistory]=useState([]),[requirementsState,setRequirementsState]=useState({}),[chatBusy,setChatBusy]=useState(false),[chatError,setChatError]=useState(''),[suggestedReplies,setSuggestedReplies]=useState([]),[query,setQuery]=useState(''),[game,setGame]=useState('王者荣耀'),[page,setPage]=useState('home'),[server,setServer]=useState('all'),[budget,setBudget]=useState(1000),[realname,setRealname]=useState('all'),[models,setModels]=useState([]),[model,setModel]=useState('openai/gpt-4o-mini'),[modelsReady,setModelsReady]=useState(false),[items,setItems]=useState([]),[trace,setTrace]=useState([]),[status,setStatus]=useState(''),[summary,setSummary]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[chosen,setChosen]=useState([]),[analysis,setAnalysis]=useState(''),[usage,setUsage]=useState(null),[usedModel,setUsedModel]=useState(''),[agent,setAgent]=useState(null),[coverage,setCoverage]=useState(null);
 useEffect(()=>{fetch('/api/health',{cache:'no-store'}).then(r=>r.json()).then(setHealth).catch(()=>setHealth({ok:false,search_configured:false}))},[]);
 useEffect(()=>{fetch('/api/models').then(r=>r.json()).then(d=>{setModels(d.models||[]);setModel(d.default_model||d.models?.[0]?.id||'openai/gpt-4o-mini');setModelsReady(true)}).catch(()=>setModelsReady(true))},[]);
 const priced=useMemo(()=>items.filter(x=>x.price!=null),[items]);
 const byPlatform=useMemo(()=>({pzds:coverage?.platforms?.find(x=>x.platform==='盼之账号')?.discovered??items.filter(x=>x.platform==='盼之账号').length,market5173:coverage?.platforms?.find(x=>x.platform==='5173')?.discovered??items.filter(x=>x.platform==='5173').length,gmmsj:coverage?.platforms?.find(x=>x.platform==='G买卖')?.discovered??items.filter(x=>x.platform==='G买卖').length}),[items,coverage]);
 const selected=items.filter(x=>chosen.includes(x.id));
 function beginSearch(){
  searchAbort.current?.abort();analysisAbort.current?.abort();analysisEpoch.current+=1;
  setAnalysisBusy(false);
  const controller=new AbortController(),id=++searchEpoch.current;
  searchAbort.current=controller;
  return {id,signal:controller.signal};
 }
 function isLatest(id){return searchEpoch.current===id}
 function resetDiscovery(){
  setItems([]);setUnpricedLeads([]);setExcludedLeads([]);setLeadAudit(null);setShowAllPending(false);setShowAllExcluded(false);setChosen([]);setTrace([]);setCoverage(null);
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
 <header className="topbar"><div className="brand" onClick={()=>setPage('home')}><div className="brandMark"><Gamepad2 size={22}/></div><strong>GamePilot<span> AI</span></strong><span className="beta">V0.9 · DATA EVIDENCE</span></div><nav><button className={page==='home'?'active':''} onClick={()=>setPage('home')}>智能找货</button><button className={page==='results'?'active':''} onClick={()=>setPage('results')}>搜索结果</button><button className={page==='compare'?'active':''} onClick={()=>setPage('compare')} disabled={!selected.length}>卡片对比 {chosen.length?chosen.length:''}</button></nav><div className="topStatus" title={health?.build||"搜索配置状态待确认"}><span className="statusDot"/>{health===null?'检查搜索配置中':!health.ok?'服务状态未知':health.search_configured?(health.browser_configured?'搜索与浏览器已配置 · 商品待核验':'搜索已配置 · 浏览器未启用'):'搜索服务未配置'}</div></header>
 {page==='home'?<main className="landing"><div className="heroBadge"><Sparkles size={14}/> AI GAME ASSET DISCOVERY</div><h1>找到值得买的游戏账号<span>价格、配置、风险，一眼看清。</span></h1><p className="heroSub">一句话描述需求，自动发现不同平台的账号，整理为清晰的商品卡片。</p><div className="searchPanel"><div className="searchMain"><Search size={22}/><input value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>e.key==='Enter'&&sendChat(query)} placeholder="例如：1500元以内的冒险岛账号，战力高、装备好…"/><button className="accent" disabled={busy||chatBusy||!query.trim()} onClick={()=>sendChat(query)}>Agent 对话找货 <ArrowRight size={17}/></button></div><div className="searchFooter"><div className="modelPicker"><Sparkles size={15}/><span>分析模型</span><select value={model} onChange={e=>setModel(e.target.value)}>{modelOptions.map(x=><option value={x.id} key={x.id}>{x.name}</option>)}</select></div><span className="tiny">自动搜索 · 多平台发现 · 证据透明</span></div></div><div className="suggestions"><span>试试搜索</span>{samples.map(s=><button key={s} onClick={()=>sendChat(s)}>{s}<ArrowRight size={13}/></button>)}</div><div className="featureGrid"><div><Search/><b>跨平台发现</b><p>搜索盼之、5173、G买卖的公开商品索引</p></div><div><Layers3/><b>商品卡片对比</b><p>统一呈现价格、区服和配置字段</p></div><div><AlertTriangle/><b>来源与风险标识</b><p>区分搜索参考价和真实在售报价</p></div></div></main>:page==='results'?<main className="resultsLayout"><aside className="filters"><div className="sideTitle"><SlidersHorizontal size={17}/> 筛选条件</div><label>游戏（可输入任意名称）</label><input list="gamepilot-games" value={game} onChange={e=>changeGame(e.target.value)} placeholder="输入游戏名称" /><datalist id="gamepilot-games">{GAME_NAMES.map(g=><option value={g} key={g}/>)}</datalist>{game==='王者荣耀'&&<><label>区服</label><select value={server} onChange={e=>setServer(e.target.value)}><option value="all">全部区服</option>{['苹果QQ','安卓QQ','苹果微信','安卓微信'].map(s=><option key={s}>{s}</option>)}</select></>}<label>最高预算（元）</label><input type="number" min="1" value={budget} onChange={e=>setBudget(e.target.value)}/>{game==='王者荣耀'&&<><label>实名要求</label><select value={realname} onChange={e=>setRealname(e.target.value)}><option value="all">不限</option><option value="yes">可二次实名</option><option value="no">不可二次实名</option></select></>}<button className="accent wide" disabled={busy||!game.trim()} onClick={()=>run((query&&query.includes(game)?query:game+' 账号'),{server:game==='王者荣耀'?server:'all',max_price:Number(budget),realname:game==='王者荣耀'?realname:'all'})}><RefreshCw size={15}/> 重新搜索</button><div className="sideNote">搜索索引可能过期。缺失价格、区服或库存证据的商品不能被视为已核验在售。</div></aside>
 <section className="resultsContent"><section className="agentChatPanel" style={{padding:18,border:'1px solid #34435b',borderRadius:14,marginBottom:20,background:'rgba(40,54,77,.18)'}}><div className="sideTitle"><Sparkles size={17}/> Agent 边聊边找货</div><div style={{display:'flex',flexWrap:'wrap',gap:8,margin:'12px 0'}}>{Object.entries(requirementsState).filter(([k,v])=>v!=null&&v!==''&&(!Array.isArray(v)||v.length)).map(([k,v])=><span key={k} style={{border:'1px solid #465875',padding:'5px 9px',borderRadius:9,fontSize:12}}>{({game:'游戏',version:'版本',max_price:'预算',profession:'职业',preferences:'偏好'})[k]||k}：{Array.isArray(v)?v.join('、'):k==='max_price'?'¥'+v:v}</span>)}</div><div style={{maxHeight:220,overflowY:'auto'}}>{chatHistory.map((m,i)=><p key={i} style={{margin:'7px 0',fontSize:13,whiteSpace:'pre-wrap'}}><b>{m.role==='user'?'你':'Agent'}：</b>{m.content}</p>)}</div>{suggestedReplies.length>0&&<div style={{display:'flex',flexWrap:'wrap',gap:6,margin:'10px 0'}}>{suggestedReplies.map(v=><button className="ghost" key={v} disabled={chatBusy} onClick={()=>sendChat(v)}>{v}</button>)}</div>}<div className="agentChatComposer" style={{display:'flex',gap:8,marginTop:12}}><input style={{flex:1,minWidth:0}} value={chatInput} onChange={e=>setChatInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&sendChat()} placeholder="输入新游戏或补充需求，例如：1000元以内三角洲账号" /><button className="accent" disabled={!chatInput.trim()} onClick={()=>sendChat()}>{chatBusy?'理解与搜索中…':'发送并找货'}</button></div>{chatError&&<div className="warning">{chatError}</div>}<small>支持任意游戏名称；切换游戏会重置旧条件和搜索结果。未核验报价需复查。</small></section><div className="resultsHeading"><div><div className="overline">DISCOVERY RESULTS</div><h1>为你找到的账号</h1><p>根据你的需求自动搜索多个交易平台</p></div><button className="ghost" onClick={()=>setPage('home')}>修改需求</button></div><div className="queryPill"><Search size={16}/><span><b>{game}</b> · {withoutGame(query)||'账号搜索'}</span></div><div className="statGrid"><div><small>候选线索（非商品库存）</small><strong>{leadAudit?.discovered??searchDiagnostics?.discovered??items.length}</strong></div><div><small>盼之商品线索</small><strong>{byPlatform.pzds}</strong></div><div><small>5173 商品线索</small><strong>{byPlatform.market5173}</strong></div><div><small>G买卖商品线索</small><strong>{byPlatform.gmmsj}</strong></div><div><small>含参考价格</small><strong>{searchDiagnostics?.priced??priced.length}</strong></div></div>{harness&&<section className="coveragePanel" style={{marginBottom:14}}><div className="coverageTitle"><Layers3 size={17}/> Progressive Search Harness</div><p>检索轮次：{harness.attempts} · {harness.zero_result_reason?'未完成：'+harness.zero_result_reason:'已生成候选结果'}</p>{(harness.stages||[]).map((stage,i)=><p key={i} style={{fontSize:13}}>{i+1}. {({discover_primary:'初始商品检索',discover_fallback:'补充检索',verify_details:'HTTP 详情验证',browser_render:'浏览器渲染核价',edition_filter:'版本筛选',hard_filter_and_rank:'条件筛选与排序'})[stage.stage]||stage.stage}：{stage.count} 条{stage.priced!=null?' · 有价格 '+stage.priced+' 条':''}</p>)}</section>}{searchDiagnostics&&<section className="coveragePanel" style={{marginBottom:14}}><div className="coverageTitle"><Activity size={17}/> 搜索漏斗诊断</div><p>发现 {searchDiagnostics.discovered} 条线索 · 提取参考价 {searchDiagnostics.priced} 条 · 版本/游戏身份排除 {searchDiagnostics.editionRejected} 条 · 搜索服务错误 {searchDiagnostics.errors} 次 · 最终匹配 {items.length} 条</p>{searchDiagnostics.errorSamples.map((e,i)=><p key={i} style={{fontSize:12,overflowWrap:'anywhere'}}>⚠ {e.source}：HTTP {e.status||'未知'} {e.detail||''}</p>)}{!items.length&&<p style={{fontSize:13}}>0 条最终结果不代表平台无货。请根据上面的搜索错误、版本过滤和价格获取情况定位问题。</p>}</section>}{coverage&&<section className="coveragePanel"><div className="coverageTitle"><Activity size={17}/> 平台数据覆盖 <span>本次搜索 · 详情页抽样核验</span></div><div className="coverageGrid">{coverage.platforms.map(p=><div className="coverageItem" key={p.platform}><b>{p.platform}</b><strong>{p.discovered} <small>条线索</small></strong><span>含价格 {p.with_price} · 详情价格 {p.detail_priced}</span><span>已核验详情 {p.detail_checked} · 在售标记 {p.listed}</span>{p.search_errors?.length>0&&<em>搜索错误 {p.search_errors.join(', ')}</em>}</div>)}</div><div className="coverageFooter">合计 {coverage.totals.discovered} 条 · 详情提取价格 {coverage.totals.detail_priced} 条 · 排除已售 {coverage.totals.sold} 条。结构化在售标记不等于真实可下单。</div></section>}{busy&&<div className="loadingState"><RefreshCw className="spin" size={18}/> 正在搜索并整理商品线索…</div>}{error&&<div className="warning">{error}</div>}{!busy&&<div className="infoBanner"><AlertTriangle size={17}/><div>{items.length?'以下为公开搜索索引线索，不代表当前在售。参考价未经实时确认，不作为购买报价。':summary||'未发现商品详情线索，不代表市场无货。'}</div></div>}
 {agent&&<div className="agentSummary"><div className="agentSummaryHead"><Sparkles size={17}/> AI 商品匹配 <span>{agent.status==='completed'?'已分析 '+(agent.model||''):'自动分析 '+(agent.reason||agent.status)}</span></div><p>{agent.summary||'已执行自动找货与确定性匹配；模型分析暂不可用。'}</p></div>}{leadAudit&&<div className="coveragePanel" style={{margin:'12px 0 18px'}}><div className="coverageTitle"><Layers3 size={16}/> 商品线索去向（共 {leadAudit.discovered} 条）</div><p>检索发现的线索不等于可购买商品。下方按来源与证据状态分别展示，每条商品仅计入一个分类。</p><div className="auditSummaryGrid"><div><small>有价格且通过条件</small><strong>{items.length}</strong></div><div><small>价格未核实</small><strong>{unpricedLeads.length}</strong></div><div><small>排除或条件不符</small><strong>{excludedLeads.length}</strong></div></div>{(items.length+unpricedLeads.length+excludedLeads.length)!==leadAudit.discovered&&<p className="warning">统计口径存在差异：总计 {leadAudit.discovered}，分类合计 {items.length+unpricedLeads.length+excludedLeads.length}。请检查筛选日志。</p>}</div>}{items.length>0&&<div className="coverageTitle" style={{margin:'16px 0 12px'}}><Search size={17}/> 有价格证据的商品 <span>{items.length} 条 · 非实时报价</span></div>}<div className="cards">{items.map(x=><article className="productCard" key={x.id}><div className="cardTop"><span className="platformTag">{x.platform}</span><span className="unverified">{x.status==='listed'?'详情标记在售':x.status==='sold'?'已售出':x.detail_check==='unverified'?'详情待核验':'索引待核验'}</span></div><div className="cardPrice"><strong>{fmt(x.price)}</strong><span>{x.price==null?'未取得可核对报价':x.price_audit?.source==='商品详情页'?'商品详情提取价 · 非实时':'搜索索引参考价 · 非实时'}</span></div><h3>{x.title||(x.game||game)+'游戏账号'}</h3>{x.version_label&&<div className="evidenceLine">{x.version_label} · Demo 暂不按版本筛选</div>}<div className="attributeGrid"><div><small>区服</small><b>{x.server||'待确认'}</b></div><div><small>{attrLabel(x)}</small><b>{attrValue(x)}</b></div><div><small>实名状态</small><b>{x.realname===true?'索引显示可二次实名':x.realname===false?'索引显示不可二次实名':'待确认'}</b></div><div><small>库存状态</small><b>{x.status==='listed'?'结构化标记在售':'未核验'}</b></div></div>{x.price_conflict&&<div className="warning">索引价与详情页提取价不一致，已优先展示详情价，请复核</div>}<div className="matchScore">需求匹配参考分 <b>{x.match_score??'—'}</b> / 100 <span> · {x.requirement_evaluation?.fit==='matched'?'已知条件符合':x.requirement_evaluation?.fit==='partial'?'属性待核实':'条件待评估'}</span></div>{x.requirement_evaluation?.unknown?.length>0&&<div className="evidenceLine">待核实：{x.requirement_evaluation.unknown.slice(0,3).join('、')}</div>}{x.price_audit&&<div className="evidenceLine">价格来源：{x.price_audit.source} · {x.price_audit.confidence==='medium'?'中':'低'}可信度 · 非实时{ x.price_audit.verified_at?' · 核验 '+new Date(x.price_audit.verified_at).toLocaleString('zh-CN'):''}</div>}{x.agent_note&&<div className="agentCardNote"><Sparkles size={13}/><span>{x.agent_note.reason} · 风险：{x.agent_note.risk}</span></div>}<p className="cardDescription">{x.description||'商品信息待补全'}</p><div className="cardFoot"><a href={x.url} target="_blank" rel="noopener noreferrer">查看来源 <ExternalLink size={14}/></a><button className={chosen.includes(x.id)?'choose chosen':'choose'} onClick={()=>toggle(x.id)}>{chosen.includes(x.id)?<><Check size={15}/> 已加入</>:<><Layers3 size={15}/> 加入对比</>}</button></div></article>)}</div>
 {unpricedLeads.length>0&&<section className="coveragePanel" style={{margin:'18px 0'}}><div className="coverageTitle"><AlertTriangle size={17}/> 价格待核验的商品线索 <span>{unpricedLeads.length} 条 · 可查看来源</span></div><p>这组结果已找到对应的商品详情链接，但尚未获取可信价格。它们不计入预算内的已匹配商品，也不代表当前在售。</p><div className="cards">{(showAllPending?unpricedLeads:unpricedLeads.slice(0,12)).map((x,i)=><article className="productCard" key={x.url||i}><div className="cardTop"><span className="platformTag">{x.platform}</span><span className="unverified">价格待核验</span></div><div className="cardPrice"><strong>¥ —</strong><span>未取得可信报价</span></div><h3>{x.title||'商品详情线索'}</h3><div className="evidenceLine">{x.http_status?'详情页 HTTP '+x.http_status:x.fetch_error?'抓取失败：'+x.fetch_error:x.detail_status==='not_checked'?'尚未读取商品详情':x.reason||'价格字段缺失或动态加载'}</div><div className="cardFoot"><a href={x.url} target="_blank" rel="noopener noreferrer">打开源站核价 <ExternalLink size={14}/></a></div></article>)}</div>{unpricedLeads.length>12&&<button className="ghost" style={{marginTop:12}} onClick={()=>setShowAllPending(!showAllPending)}>{showAllPending?'收起其余线索':'展开全部 '+unpricedLeads.length+' 条待核价线索'}</button>}</section>}
 {excludedLeads.length>0&&<details className="diagnostics" open style={{margin:'18px 0'}}><summary><AlertTriangle size={16}/> 另外 {excludedLeads.length} 条线索未纳入推荐（查看原因） <ChevronDown size={15}/></summary><p>可能是游戏身份不匹配、已售、超出预算或存在其他证据问题。这些不是可购买商品推荐。</p><div className="cards">{(showAllExcluded?excludedLeads:excludedLeads.slice(0,12)).map((x,i)=><article className="productCard" key={x.url||i}><div className="cardTop"><span className="platformTag">{x.platform}</span><span className="unverified">已排除</span></div><h3>{x.title||'未通过验证的线索'}</h3><div className="cardPrice"><strong>{x.price!=null?fmt(x.price):'¥ —'}</strong><span>不计入符合条件商品</span></div><p className="evidenceLine">原因：{x.status==='wrong_game'||x.status==='game_unconfirmed'?'游戏身份不匹配或缺少证据':x.status==='sold'?'源站标记售出':x.status==='stale'?'商品信息过期':x.price!=null?'预算或其他硬条件未通过':x.reason||'商品未通过验证'}</p><div className="cardFoot"><a href={x.url} target="_blank" rel="noopener noreferrer">查看来源 <ExternalLink size={14}/></a></div></article>)}</div>{excludedLeads.length>12&&<button className="ghost" style={{marginTop:12}} onClick={()=>setShowAllExcluded(!showAllExcluded)}>{showAllExcluded?'收起其余线索':'显示全部 '+excludedLeads.length+' 条排除线索'}</button>}</details>}
 {!busy&&!items.length&&!unpricedLeads.length&&<div className="emptyState"><Search size={32}/><h3>还没有找到可展示的商品详情</h3><p>请展开下方数据诊断，检查平台搜索返回数量与详情页过滤数量。不会使用模拟数据填充。</p></div>}
 <details className="diagnostics"><summary><Activity size={16}/> 开发者诊断（默认折叠） <ChevronDown size={15}/></summary><div className="diagnosticInner">{trace.map((t,i)=><div className="diagnosticRow" key={i}><b>{t.tool}</b><span>{t.duration_ms??0} ms</span><pre>{JSON.stringify(t.result||{},null,2)}</pre></div>)}{!trace.length&&<p>尚无执行记录</p>}</div></details></section>
 <aside className="insights executionAside">
 <div className="executionHeader"><div className="sideTitle"><Activity size={17}/> Agent 执行路径</div><span className={'executionState '+(busy||chatBusy?'running':harness?'done':'idle')}>{busy||chatBusy?'检索中':harness?'已完成':'待开始'}</span></div>
 <div className="executionFlow">
 {(harness?.stages?.length?harness.stages:[{stage:'discover_primary'},{stage:'verify_details'},{stage:'edition_filter'},{stage:'hard_filter_and_rank'}]).map((step,i)=><div className={'executionStep '+(harness?(step.stage==='browser_render'&&!step.configured?'pending':'finished'):busy||chatBusy&&i===0?'running':'pending')} key={i}><span className="executionNode">{harness&&!(step.stage==='browser_render'&&!step.configured)?'✓':i+1}</span><div className="executionStepBody"><strong>{({discover_primary:'发现商品',discover_fallback:'扩大搜索',verify_details:'HTTP 验证详情',browser_render:'Browser Run 渲染核价',edition_filter:'核对游戏',hard_filter_and_rank:'筛选与排序'})[step.stage]||step.stage}</strong><small>{harness?(step.stage==='browser_render'&&!step.configured?'未启用浏览器绑定':step.stage==='browser_render'?step.count+' 次渲染 · 恢复 '+(step.priced||0)+' 条价格':step.count+' 条'+(step.priced!=null?' · '+step.priced+' 条有价格':'')+(step.requests!=null?' · '+step.requests+' 次请求':'')):'等待执行记录'}</small></div></div>)}
 </div>
 {harness?.zero_result_reason&&<div className="executionAlert"><AlertTriangle size={15}/><span>{({search_not_configured:'搜索服务尚未配置',no_product_leads:'未取得商品详情链接',no_price_evidence:'商品价格证据不足',edition_evidence_missing:'版本证据不足',constraints_or_identity_not_verified:'商品未通过筛选'})[harness.zero_result_reason]||'检索尚未完成'}</span></div>}
 <div className="executionMeta"><span>Harness</span><b>{harness?.version||'Progressive Search'}</b></div>
 <details className="executionDetails"><summary><Layers3 size={14}/> Skill 与数据源 <ChevronDown size={14}/></summary><div className="executionDetailBody"><p>需求解析 → 商品发现 → 详情核验 → 条件筛选 → 排序</p>{trace.filter(t=>t.tool?.startsWith('discover_')||t.tool==='gmmsj_category'||(t.tool==='search_configuration'||t.tool?.startsWith('browser_'))).map((t,i)=><p key={i}>{t.tool==='browser_render_summary'?'Browser Run 汇总 · '+(t.result?.configured?'浏览器可用':'未启用')+' · 恢复价格 '+(t.result?.recovered_prices||0)+' 条':t.tool==='browser_render_detail'?'渲染详情 ('+(t.source||'平台')+') · '+(t.result?.recovered_price?'成功提取价格':t.result?.reason||'未恢复价格'):t.tool.startsWith('browser_category_')?'渲染目录 ('+t.tool.replace('browser_category_','')+') · '+(t.result?.detail_pages||0)+' 个商品链接':t.tool.replace('discover_','')+' · '+(t.result?.error?'错误：'+t.result.error:(t.result?.detail_pages??t.result?.raw_results??0)+' 条')}{t.duration_ms!=null?' · '+t.duration_ms+'ms':''}</p>)}{!trace.length&&<p>暂无来源日志</p>}</div></details>
 <details className="executionDetails"><summary><Sparkles size={14}/> AI 模型分析 <ChevronDown size={14}/></summary><div className="executionDetailBody"><label>OpenRouter 模型</label><select value={model} onChange={e=>setModel(e.target.value)}>{modelOptions.map(x=><option value={x.id} key={x.id}>{x.name}</option>)}</select><button className="accent wide" onClick={analyze} disabled={busy||chatBusy||analysisBusy||!items.length}>{analysisBusy?'分析中…':'运行分析'} <ArrowRight size={15}/></button>{analysis&&<div className="analysisText">{analysis}</div>}{usedModel&&<div className="modelMeta">模型：{usedModel}{usage&&<p>Token：{usage.total_tokens??'—'}</p>}</div>}</div></details>
 <p className="executionFootnote">展示服务端返回的执行记录，非实时流式进度。</p>
 </aside></main>:<main className="comparePage"><button className="ghost" onClick={()=>setPage('results')}>← 返回商品结果</button><div className="overline">SIDE BY SIDE</div><h1>商品卡片对比</h1><p>已选 {selected.length} 个商品。所有价格均为未核验的搜索索引参考价。</p><div className="compareGrid">{selected.map(x=><article className="productCard" key={x.id}><div className="cardTop"><span className="platformTag">{x.platform}</span><span className="unverified">待核验</span></div><div className="cardPrice"><strong>{fmt(x.price)}</strong><span>{x.price_audit?.source||'索引参考价'} · 非实时</span></div><h3>{x.title}</h3>{[['游戏区服',x.server||'待确认'],[attrLabel(x),attrValue(x)],['实名状态',x.realname===true?'索引显示可二次实名':x.realname===false?'索引显示不可二次实名':'待确认'],['在售状态',x.status==='listed'?'详情标记在售（未验证可下单）':'未核验'],['交易费用','未知'],['最终到手价','费用未知，无法确认'],['价格证据',x.price_audit?.source||'搜索索引']].map(([k,v])=><div className="compareLine" key={k}><span>{k}</span><b>{v}</b></div>)}<a className="compareSource" href={x.url} target="_blank" rel="noopener noreferrer">查看原始来源 <ExternalLink size={14}/></a></article>)}</div><div className="infoBanner"><AlertTriangle size={18}/> 不同区服或账号配置不可视为同款；缺少可信库存与费用信息时，不计算“全网最低价”。</div></main>}
 {page==='results'&&chosen.length>0&&<div className="compareDock"><span>已选 <b>{chosen.length}</b> / 3 个账号</span><button className="accent" onClick={()=>setPage('compare')}>查看卡片对比 <ArrowRight size={16}/></button></div>}
 </div>
}
createRoot(document.getElementById('root')).render(<App/>);
