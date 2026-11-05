import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {serve} from "../server/worker.mjs";
const require=createRequire(import.meta.url);
const {chromium}=require("C:/Users/egami/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const user="11111111-1111-4111-8111-111111111111";
let ids=[];
const types={".js":"text/javascript",".html":"text/html; charset=utf-8",".css":"text/css",".webp":"image/webp",".png":"image/png",".mp3":"audio/mpeg",".glb":"model/gltf-binary"};
const env={SUPABASE_URL:"https://mock.invalid",SUPABASE_PUBLISHABLE_KEY:"test",ASSETS:{fetch:async req=>{
 const rel=decodeURIComponent(new URL(req.url).pathname).slice(1)||"index.html";
 if(rel==="js/supabase.js")return new Response(`window.initAnonymousUser=async()=>({id:'${user}'});window.supabaseClient={from:()=>({select:()=>({eq:async()=>({data:${JSON.stringify(ids.map(character_id=>({character_id})))},error:null})})}),auth:{getSession:async()=>({data:{session:{access_token:'test',user:{id:'${user}'}}},error:null})}};`,{headers:{"Content-Type":"text/javascript"}});
 try{return new Response(await fs.readFile(path.join(root,rel)),{headers:{"Content-Type":types[path.extname(rel)]||"application/octet-stream"}});}catch{return new Response("not found",{status:404});}
}}};
const backend=async url=>new Response(JSON.stringify(url.includes("/auth/v1/user")?{id:user}:ids.map(character_id=>({character_id}))));
const server=http.createServer(async(req,res)=>{try{const r=await serve(new Request("http://localhost"+req.url,{method:req.method,headers:req.headers}),env,backend);res.writeHead(r.status,Object.fromEntries(r.headers));res.end(Buffer.from(await r.arrayBuffer()));}catch(e){res.writeHead(500);res.end(String(e));}});
await new Promise(r=>server.listen(0,"127.0.0.1",r));
const base="http://127.0.0.1:"+server.address().port;
const browser=await chromium.launch({channel:"msedge",headless:true});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});
 await page.route("https://**/*",r=>r.abort());
 page.on("dialog",d=>d.dismiss());
 const errors=[];page.on("pageerror",e=>errors.push(e.message));
 for(const scenario of [[],[12],[4,5,6,7,8,9,10,12,13,14],[4,5,6,7,8,9,10,11,12,13,14]]){
  ids=scenario;
  const full=[4,5,6,7,8,9,10,11].every(id=>ids.includes(id));
  for(const file of ["/assets/stamps/stamp01.png","/assets/cards/character01.webp","/assets/sounds/voice01.mp3","/assets/models/character01.glb","/assets/reward/reward.webp","/assets/sounds/complete.mp3"]){
   const deny=await fetch(base+file);assert.equal(deny.status,403);
   const r=await fetch(base+file,{headers:{Authorization:"Bearer test"}});
   assert.equal(r.status,file.includes("reward")||file.includes("complete")?(full?200:403):(ids.includes(4)?200:403));
   assert.equal(r.headers.get("Cloudflare-CDN-Cache-Control"),"no-store");
  }
  await page.goto(base+"/stamp-rally.html?from=complete");
  await page.waitForFunction(()=>document.querySelector("#progressText").textContent.includes(" / 8"));
  const expected=ids.filter(id=>id>=4&&id<=11).length;
  await page.waitForFunction(n=>document.querySelector("#progressText").textContent===n+" / 8",expected);
  if(expected)await page.waitForFunction(n=>[...document.querySelectorAll(".stamp-card img")].filter(e=>e.src.startsWith("blob:")&&e.naturalWidth>0).length===n,expected);
  assert.equal(await page.locator("#giftButton").isVisible(),full);
  if(full)await page.waitForFunction(()=>document.querySelector("#rewardBox img").src.startsWith("blob:"));
  if(ids.length===0 || full) await page.screenshot({path:path.join("D:/01_Works/ARcharacter_photoframe/syuusei_20261029",full?"protecao-rally-liberado.png":"protecao-rally-bloqueado.png"),fullPage:true});
  await page.goto(base+"/character-list.html");
  await page.waitForFunction(n=>document.querySelectorAll(".character-card.collected").length===n,ids.length);
  if(ids.includes(12))await page.waitForFunction(()=>document.querySelector('[data-character-id="12"] img').src.startsWith("blob:"));
  await page.goto(base+"/complete.html");
  if(full){await page.locator("#playVoiceButton").waitFor({state:"visible"});await page.waitForFunction(()=>document.querySelector("#completeRewardImage").naturalWidth>0);assert((await page.locator("#completeVoice").getAttribute("src")).startsWith("blob:"));}
  else await page.waitForURL("**/stamp-rally.html");
  console.log("PASS HTTP + UI:",JSON.stringify(ids),"reward",full);
 }
 // Denied-page redirects intentionally throw after redirect; reject unrelated errors.
 assert(errors.every(e=>e.includes("Content is still locked")),JSON.stringify(errors));
}finally{await browser.close();await new Promise(r=>server.close(r));}
