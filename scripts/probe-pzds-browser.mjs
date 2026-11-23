import {chromium} from 'playwright';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:1365,height:900},locale:'zh-CN'});
const calls=[];
page.on('request',r=>{
 try{
  const u=new URL(r.url());
  if(!u.hostname.endsWith('pzds.com')||r.resourceType()==='document'||r.resourceType()==='image'||r.resourceType()==='script'||r.resourceType()==='stylesheet')return;
  if(calls.length>=40)return;
  let payload={};
  try{const j=JSON.parse(r.postData()||'{}');payload={keys:Object.keys(j),page:j.page??j.pageNum??j.currentPage??null,actionKeys:Object.keys(j.action||{})}}catch{}
  calls.push({path:u.pathname,method:r.method(),payload});
 }catch{}
});
try{
 await page.goto('https://www.pzds.com/goodsList/391/6',{waitUntil:'domcontentloaded',timeout:30000});
 await page.waitForTimeout(3500);
 const getIds=()=>page.locator('a[href*="/goodsDetails/"]').evaluateAll(xs=>[...new Set(xs.map(x=>x.getAttribute('href')?.match(/goodsDetails\/([^/]+)/)?.[1]).filter(Boolean))].slice(0,15));
 const first=await getIds();
 console.log('PZDS_BROWSER_PAGE1',JSON.stringify({count:first.length,ids:first.slice(0,5),url:page.url()}));
 const next=page.locator('.el-pagination .btn-next, .pagination .next, button[aria-label="Next"]').first();
 if(await next.count()&&await next.isVisible()&&!await next.isDisabled()){
  await next.click({timeout:6000});await page.waitForTimeout(3500);
  const second=await getIds();
  console.log('PZDS_BROWSER_PAGE2',JSON.stringify({count:second.length,ids:second.slice(0,5),changed:JSON.stringify(first)!==JSON.stringify(second),url:page.url()}));
 }else{
  await page.goto('https://www.pzds.com/goodsList/391/6?page=2',{waitUntil:'domcontentloaded',timeout:30000});
  await page.waitForTimeout(3500);
  const second=await getIds();
  console.log('PZDS_BROWSER_PAGE2_NAV',JSON.stringify({count:second.length,ids:second.slice(0,5),changed:JSON.stringify(first)!==JSON.stringify(second),url:page.url()}));
 }
 console.log('PZDS_BROWSER_NETWORK',JSON.stringify(calls));
}catch(e){console.log('PZDS_BROWSER_ERROR',String(e).slice(0,500));process.exitCode=1}
finally{await browser.close()}
