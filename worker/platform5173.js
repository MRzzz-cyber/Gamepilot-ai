import { launch } from '@cloudflare/playwright';

// Uses only publicly accessible first-party search UI. No authentication,
// CAPTCHA handling, hidden APIs, purchasing, or arbitrary user-provided URLs.
const PAGES=['https://shop.5173.com/','https://www.5173.com/'];

export async function browserSearch5173(game,binding){
 const trace=[];
 if(!binding)return {status:'browser_binding_missing',html:'',url:null,trace};
 let browser;
 try{
  browser=await launch(binding);
  const page=await browser.newPage();
  for(const source of PAGES){
   const start=Date.now();
   try{
    await page.goto(source,{waitUntil:'domcontentloaded',timeout:12000});
    const before=page.url();
    if(!/^https:\/\/(?:shop\.5173\.com|www\.5173\.com|5173\.com)(?:\/|$)/i.test(before)){
     trace.push({site:source,result:'unexpected_redirect',ms:Date.now()-start});
     continue;
    }
    const selectors=[
     'input[placeholder*="搜索的游戏名"]',
     'input[placeholder*="搜索游戏"]',
     'input[placeholder*="游戏名"]',
     'input[type="search"]',
     'input[placeholder*="商品关键词"]'
    ];
    let searched=false;
    for(const selector of selectors){
     const input=page.locator(selector).first();
     if(await input.count()){
      await input.fill(String(game||'').slice(0,50));
      await input.press('Enter');
      searched=true;break;
     }
    }
    if(searched)await page.waitForTimeout(900);
    const after=page.url();
    if(!/^https:\/\/(?:(?:[\w-]+\.)?5173\.com)(?:\/|$)/i.test(after)){
     trace.push({site:source,result:'external_redirect',ms:Date.now()-start});
     continue;
    }
    // Record only the actual DOM after the attempted first-party game search.
    const html=(await page.content()).slice(0,900000);
    trace.push({site:source,result:searched?'searched':'no_search_input',ms:Date.now()-start,html_bytes:html.length});
    if(searched&&html.length>160)return {status:'rendered_search',html,url:after,trace};
   }catch(e){
    trace.push({site:source,result:'navigation_failed',error_type:String(e?.name||'Error'),ms:Date.now()-start});
   }
  }
  return {status:'no_searchable_page',html:'',url:null,trace};
 }catch(e){
  return {status:'browser_session_failed',html:'',url:null,trace,error_type:String(e?.name||'Error')};
 }finally{if(browser)try{await browser.close()}catch{}}
}
