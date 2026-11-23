import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeProduct,upsertProducts,queryProducts,parseDD373Listing} from '../worker/product-index.js';
import {parsePzdsDeltaListing} from '../worker/public-collector.js';
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

test('PZDS Delta Force SSR cards extract same-card prices and reject sold cards',()=>{
 const html='<title>三角洲行动 商品列表</title>'+
 '<a href="/goodsDetails/SA12345/6"><div class="game-title">SA12345号 总资产 80M</div><div>三角洲行动-QQ</div><span>¥</span><span>399</span></a>'+
 '<a href="/goodsDetails/SA23456/6"><div class="game-title">SA23456号 总资产 90M</div><span>¥</span><span>888</span></a>'+
 '<a href="/goodsDetails/SA34567/6"><div class="game-title">SA34567号 已售出</div><span>¥</span><span>450</span></a>';
 const rows=parsePzdsDeltaListing(html);
 assert.equal(rows.length,2);
 assert.deepEqual(rows.map(x=>x.price),[399,888]);
 assert.equal(rows[0].id,'pzds.com:SA12345');
 assert.equal(rows[0].server,'QQ');
});
test('DD373 account listing price is attached to matching detail URL, not next card',()=>{
 const html='<h1>三角洲行动</h1>'+
 '<a href="/detail-ZH20261113151224-46447.html">总资产22M账号</a><span>商品类型：游戏账号</span><b>￥232.00</b><a href="/detail-ZH20261113151224-46447.html">查看详情</a>'+
 '<a href="/detail-ZH20261113151224-46448.html">总资产32M账号</a><span>商品类型：游戏账号</span><b>￥490.00</b><a href="/detail-ZH20261113151224-46448.html">查看详情</a>';
 const rows=parseDD373Listing(html,'https://www.dd373.com/s-gp1gaj.html');
 assert.equal(rows.length,2);
 assert.deepEqual(rows.map(x=>x.price),[232,490]);
 assert.notEqual(rows[0].url,rows[1].url);
});
