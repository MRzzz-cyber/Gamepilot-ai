import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeProduct,upsertProducts,queryProducts} from '../worker/product-index.js';
test('normalize genuine account listing, reject unrelated items and mismatched prices',()=>{
 const row={url:'https://www.dd373.com/goods-123.html',title:'三角洲行动 游戏账号',price:499,game:'三角洲行动',category:'游戏账号'};
 assert.equal(normalizeProduct(row).price,499);
 assert.equal(normalizeProduct({...row,category:'道具'}),null);
 assert.equal(normalizeProduct({...row,price:null}),null);
 assert.equal(normalizeProduct({...row,url:'https://attacker.example/goods-123'}),null);
});
test('batch ingestion validates source and deduplicates IDs',async()=>{
 const prepared=[];
 const db={prepare(sql){return {bind(...args){prepared.push({sql,args});return {sql,args}}}},async batch(stmts){return stmts.map(()=>({success:true}))}};
 const a={url:'https://www.dd373.com/goods-123.html',title:'三角洲账号',price:499,game:'三角洲行动',category:'游戏账号'};
 const result=await upsertProducts(db,[a,a,{...a,category:'护航'}]);
 assert.equal(result.accepted,1);assert.equal(result.rejected,2);assert.equal(prepared.length,1);
});
test('index query caps page size and filters budget in SQL',async()=>{
 const calls=[];
 const db={prepare(sql){return {bind(...args){calls.push({sql,args});return {first:async()=>({n:20000}),all:async()=>({results:[]})}}}}};
 const data=await queryProducts(db,{game:'三角洲行动',max_price:500,limit:999});
 assert.equal(data.total,20000);assert.equal(data.limit,500);
 assert.match(calls[0].sql,/game=\? AND price<=\?/);
 assert.deepEqual(calls[1].args,['三角洲行动',500,500,0]);
});
