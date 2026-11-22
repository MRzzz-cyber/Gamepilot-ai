import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const source=readFileSync(new URL('../worker/platform5173.js',import.meta.url),'utf8')
 .replace(/^import \{ launch \} from '@cloudflare\/playwright';\s*/m,'')
 .replace('export async function browserSearch5173','async function browserSearch5173');

function withMockBrowser(page){
 const events=[];
 const launch=async()=>({
  newPage:async()=>page,
  close:async()=>{events.push('closed')}
 });
 const api=new Function('launch',source+';return {browserSearch5173}')(launch);
 return {api,events};
}

test('native 5173 browser visits first-party search UI and submits arbitrary game name',async()=>{
 const called=[];
 const page={
  goto:async url=>{called.push(['goto',url])},
  url:()=> 'https://shop.5173.com/',
  locator:selector=>({first:()=>({
   count:async()=>selector.includes('搜索的游戏名')?1:0,
   fill:async value=>called.push(['fill',value]),
   press:async key=>called.push(['press',key])
  })}),
  waitForTimeout:async()=>{},
  content:async()=>'<html><body><a href="/goods/1234567890">测试账号</a></body></html>'.repeat(3)
 };
 const {api,events}=withMockBrowser(page);
 const res=await api.browserSearch5173('三角洲', {binding:'test'});
 assert.equal(res.status,'rendered_search');
 assert.ok(called.some(x=>x[0]==='fill'&&x[1]==='三角洲'));
 assert.ok(called.some(x=>x[0]==='press'&&x[1]==='Enter'));
 assert.equal(res.trace[0].result,'searched');
 assert.deepEqual(events,['closed']);
});

test('native 5173 browser does not present a page without a real search control as a successful search',async()=>{
 const page={
  goto:async()=>{},url:()=> 'https://shop.5173.com/',
  locator:()=>({first:()=>({count:async()=>0})}),
  content:async()=>'<html><body>普通商城页面</body></html>'
 };
 const {api,events}=withMockBrowser(page);
 const res=await api.browserSearch5173('冒险岛',{binding:'test'});
 assert.equal(res.status,'no_searchable_page');
 assert.equal(res.html,'');
 assert.equal(res.trace.length,2);
 assert.deepEqual(events,['closed']);
});
