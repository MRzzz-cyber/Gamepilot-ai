// Bounded public-page diagnostic: 1 HTTP GET, no paid APIs or auth bypass.
const u='https://www.dd373.com/s-gp1gaj-f4wdcm-sxbrka-0-0-0-04q04w-0-0-0-0-0-1-0-0-0.html?MaxPrice=500.00&MinPrice=200.00';
try{
 const res=await fetch(u,{signal:AbortSignal.timeout(15000),headers:{'User-Agent':'Mozilla/5.0 (compatible; GamePilotResearch/1.0)','Accept':'text/html'}});
 const html=(await res.text()).slice(0,2500000);
 const all=[...html.matchAll(/detail-ZH[\w-]+\.html/gi)];
 console.log('DD373_PROBE',JSON.stringify({status:res.status,bytes:html.length,detail_occurrences:all.length,title:html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.slice(0,160),total_text:html.match(/为您找到[^<]{0,100}/)?.[0],final_url:res.url,content_type:res.headers.get('content-type'),challenge:/captcha|verify|challenge|__jsl|访问验证|安全验证|风控|人机|blocked|waf|javascript/i.test(html),sample:html.slice(0,650)}));
 for(const m of all.slice(0,2)){
  console.log('DETAIL_MARKUP_SAMPLE',JSON.stringify(html.slice(Math.max(0,m.index-700),Math.min(html.length,m.index+1100))));
 }
}catch(e){console.log('DD373_PROBE_ERROR',String(e).slice(0,180))}
