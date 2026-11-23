import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';

const jsx=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/style.css',import.meta.url),'utf8');

test('main.jsx is syntactically valid React JSX',()=>{
 const file=ts.createSourceFile('src/main.jsx',jsx,ts.ScriptTarget.Latest,true,ts.ScriptKind.JSX);
 const diagnostics=file.parseDiagnostics.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' '));
 assert.deepEqual(diagnostics,[]);
});

test('interview architecture is separate from actual backend execution',()=>{
 for(const token of ['HARNESS_LAYERS','harnessArchitectureDetails','Agent 执行路径','本次执行','数据源及工具调用','后端 Trace','harnessStageState'])
  assert.ok(jsx.includes(token),'missing: '+token);
 assert.ok(jsx.includes('<details className="harnessArchitectureDetails" open>'),'architecture should open by default below execution path');
 assert.ok(jsx.indexOf('本次执行')<jsx.indexOf('className="harnessArchitectureDetails"'),'real execution must appear above architecture');
 for(const removed of ['INTERVIEW_SCRIPT','copyInterviewScript','面试讲解','复制讲解稿','INTERVIEW EDITION'])assert.ok(!jsx.includes(removed),'removed interview UI should not remain: '+removed);
 assert.ok(jsx.includes("harness?.stages")||jsx.includes("harness.stages"),'runtime view must use actual server stages');
 assert.ok(jsx.includes("trace.filter("),'runtime source trace must be visible');
 assert.ok(!jsx.includes('假装已执行'),'avoid toy status strings');
});

test('architecture cards and statuses have responsive styles',()=>{
 for(const token of ['.harnessArchitectureFlow','.harnessArchitectureLayer','.harnessArchitectureDetails','.harnessArchitectureToggle','.harnessOutputGrid','.executionStep.warning'])
  assert.ok(css.includes(token),'missing style: '+token);
});

test('harness does not mark zero matches or skipped tools as success',()=>{
 const a=jsx.indexOf('const harnessStageState=');
 const b=jsx.indexOf('const GAME_NAMES=',a);
 assert.ok(a>=0&&b>a,'status helpers must be included in the product UI');
 const {harnessStageState,harnessResultDescription}=new Function(jsx.slice(a,b)+';return {harnessStageState,harnessResultDescription}')();
 assert.equal(harnessStageState({stage:'hard_filter_and_rank',count:0,outcome:'no_match'}),'warning');
 assert.equal(harnessStageState({stage:'hard_filter_and_rank',count:3,outcome:'matched'}),'finished');
 assert.equal(harnessStageState({stage:'edition_filter',skipped:true,count:37,outcome:'skipped'}),'pending');
 assert.equal(harnessStageState({stage:'browser_render',count:0,configured:true,outcome:'not_used'}),'pending');
 assert.equal(harnessStageState({stage:'browser_render',count:2,priced:0,outcome:'no_price_recovered'}),'warning');
 assert.match(harnessResultDescription({zero_result_reason:'over_budget',filter_gate:{over_budget:1}},[]),/预算/);
 assert.ok(jsx.includes('V1.0 · HARNESS MAP'),'visible version must identify newly deployed UI');
});

test('continuation cards are deduplicated and re-ranked by budget across both batches',()=>{
 const a=jsx.indexOf('function mergeListingCards(');
 const b=jsx.indexOf('function App()',a);
 assert.ok(a>=0&&b>a);
 const merge=new Function(jsx.slice(a,b)+';return mergeListingCards')();
 const previous=[{id:'low',price:50},{id:'mid',price:480,match_score:70}];
 const incoming=[{id:'new',price:499},{id:'mid',price:470,match_score:70},{id:'tie',price:470,match_score:80}];
 assert.deepEqual(merge(previous,incoming,'price_desc').map(x=>[x.id,x.price]),[['new',499],['tie',470],['mid',470],['low',50]]);
 assert.ok(jsx.includes('mergeListingCards(previous,cards,d.listing_page?.sort)'));
});

test('Delta cards show sourced facts and omit fields absent from the listing',()=>{
 const start=jsx.indexOf('function deltaListingFields(');
 const end=jsx.indexOf('function DeltaProductCard(',start);
 const fields=new Function(jsx.slice(start,end)+';return deltaListingFields')();
 assert.deepEqual(fields({server:'苹果QQ',delta_attributes:{total_assets:'201M',hafcoins:'5413W',operation_level:'60',operator_skin_count:0}},null),
  [['登录方式','苹果QQ'],['总资产','201M'],['哈夫币','5413W'],['行动等级','60'],['干员外观',0]]);
 assert.deepEqual(fields({},null),[]);
 assert.ok(jsx.includes('onVerify={()=>verifyLead(x)}'));
 assert.ok(jsx.includes('className="diagnostics deltaDiagnostics"'));
 assert.ok(css.includes('.cards.deltaCards'));
});
