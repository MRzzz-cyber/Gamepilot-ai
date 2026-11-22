import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import assert from 'node:assert/strict';

const names=['requirements-parsing','marketplace-discovery','detail-verification','evidence-filtering','preference-ranking'];
const worker=readFileSync(new URL('../worker/index.js',import.meta.url),'utf8');
const frontend=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');

test('all five GamePilot skill contracts conform to core Agent Skills SKILL.md metadata',()=>{
 for(const name of names){
  const md=readFileSync(new URL('../skills/'+name+'/SKILL.md',import.meta.url),'utf8');
  assert.match(md,/^---\n[\s\S]+?\n---\n/,'missing frontmatter: '+name);
  assert.match(md,new RegExp('^name: '+name+'$','m'));
  const desc=md.match(/^description:\s*(.+)$/m)?.[1];
  assert.ok(desc&&desc.length<=1024&&desc.length>10,'invalid description for '+name);
  assert.match(md,/\*\*Input:\*\*|\*\*Output:\*\*/,'skill should explain input and output: '+name);
  assert.ok(worker.includes("id:'"+name+"'"),'real Harness must report skill '+name);
 }
 assert.ok(worker.includes("execution_mode:'deterministic-code'"),'must not pretend Skills auto load');
 assert.ok(frontend.includes('本轮 Skill 执行契约'),'front-end should expose actual execution');
});

test('all clickable product detail refreshes use allowlisted API and never invent prices',()=>{
 assert.ok(worker.includes("'/api/verify-lead'"),'missing product detail API');
 assert.ok(worker.includes('isProductPage(productUrl,domain)'),'missing marketplace URL gate');
 assert.ok(frontend.includes("fetch('/api/verify-lead'"),'missing card verification action');
 assert.ok(frontend.includes('detailStates[x.url]?.loading'),'loading state must be visible');
 assert.ok(frontend.includes('detailFields(detailStates[x.url].attributes)'),'verified detail attributes must be rendered');
 assert.ok(!/useState\([^)]*\),const\s+\[/.test(frontend),'invalid React state declaration');
});
