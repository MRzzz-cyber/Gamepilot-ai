import {test} from 'node:test';
const base='https://www.sanlewang.com';
const endpoint=base+'/Mian/GetAccounts_BSTable?Gm='+encodeURIComponent('地下城与勇士');
const around=(s,idx,l=130,r=230)=>s.slice(Math.max(0,idx-l),idx+r).replace(/\s+/g,' ');
test('validate price and page parameters from the source public listing',async()=>{
 const html=await (await fetch(base+'/dnf',{signal:AbortSignal.timeout(9000)})).text();
 for(const m of [...html.matchAll(/row\.(?:Gameid|title|showprice)|\$\.post\("Mian\/GetAccounts_BSTable|where\.price|bstbconfig\.pageList|params\.success/gi)].slice(0,24))console.log('SANLE_CONTRACT',around(html,m.index));
 const tests=[['1-1000',0],['1-1000',20],['500-999',0],['1-499',0],['1000-1000',0]];
 for(const [price,offset] of tests){
  try{
   const params=new URLSearchParams({offset:String(offset),limit:'20',price,job:'',secondJob:'',area:'',server:'',title:'',kq:'',secondAuth:'',mw:'',fullLevelCount:'',haveLP:'',creditScore:'',weaponLevel:''});
   const r=await fetch(endpoint,{method:'POST',body:params,headers:{Accept:'application/json'},signal:AbortSignal.timeout(9000)});
   const d=await r.json();
   const rows=Array.isArray(d.data)?d.data:[];
   console.log('SANLE_PRICE_TEST',JSON.stringify({price,offset,status:r.status,code:d.code,count:d.count,rows:rows.length,ids:rows.slice(0,4).map(x=>x.Gameid),
    prices:rows.map(x=>x.showprice),first:rows[0]&&{gamename:rows[0].gamename,server:rows[0].servername,cross:rows[0].crossname,role:rows[0].role,title:rows[0].title,flags:{state:rows[0].state,is_del:rows[0].is_del},fields:Object.keys(rows[0]).filter(k=>/^(?:Id|Gameid|showprice|gamename|rolename|mw|fame|server.*|cross.*|state|is_del|secondAuth)$/i.test(k))}}));
   if(price==='1-1000'&&offset===0&&rows[0]?.Gameid){
    const url=base+'/dnf/details/'+encodeURIComponent(rows[0].Gameid);
    const r=await fetch(url,{signal:AbortSignal.timeout(9000)});const h=await r.text();
    console.log('SANLE_DETAIL_CHECK',JSON.stringify({url,status:r.status,final:r.url,title:h.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1],id:rows[0].Gameid,gameFound:h.includes('地下城与勇士')}));
   }
  }catch(e){console.log('SANLE_PRICE_TEST',JSON.stringify({price,offset,error:String(e.cause||e)}));}
 }
});
