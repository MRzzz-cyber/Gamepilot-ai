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
 for(const token of ['HARNESS_LAYERS','INTERVIEW_SCRIPT','sidebarTab','role="tablist"','架构设计','运行记录','本页为架构说明','后端 Trace','harnessStageState'])
  assert.ok(jsx.includes(token),'missing: '+token);
 assert.ok(jsx.includes("useState('architecture')"),'architecture should be available as default interview view');
 assert.ok(jsx.includes("harness?.stages")||jsx.includes("harness.stages"),'runtime view must use actual server stages');
 assert.ok(jsx.includes("trace.filter("),'runtime source trace must be visible');
 assert.ok(!jsx.includes('假装已执行'),'avoid toy status strings');
});

test('architecture cards and statuses have responsive styles',()=>{
 for(const token of ['.harnessArchitectureFlow','.harnessArchitectureLayer','.harnessViewTabs','.harnessOutputGrid','.harnessInterviewDetails','.executionStep.error'])
  assert.ok(css.includes(token),'missing style: '+token);
});

test('harness does not mark zero matches or skipped tools as success',()=>{
 const a=jsx.indexOf('const harnessStageState=');
 const b=jsx.indexOf('const INTERVIEW_SCRIPT=',a);
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
