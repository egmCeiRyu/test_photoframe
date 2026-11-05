const {chromium}=require("C:/Users/egami/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const fs=require("fs"),http=require("http"),path=require("path"),assert=require("assert/strict");
const server=http.createServer((req,res)=>{const f=path.join(__dirname,req.url.split("?")[0]);if(!fs.existsSync(f)||!fs.statSync(f).isFile()){res.writeHead(404);return res.end();}res.setHeader("Content-Type",({".html":"text/html",".js":"text/javascript",".css":"text/css",".webp":"image/webp"})[path.extname(f)]||"application/octet-stream");res.end(fs.readFileSync(f));});
(async()=>{await new Promise(r=>server.listen(0,"127.0.0.1",r));let browser;
try{
browser=await chromium.launch({channel:"msedge",headless:true,args:["--use-fake-device-for-media-stream","--use-fake-ui-for-media-stream"]});
const page=await browser.newPage({viewport:{width:960,height:540}});
await page.route("https://**/*",r=>r.abort());
const errors=[];page.on("pageerror",e=>errors.push(e.message));
await page.goto("http://127.0.0.1:"+server.address().port+"/photoframe.html");
await page.locator(".instructions-start-btn").click();
await page.waitForFunction(()=>cameraVideo.videoWidth>0);
await page.evaluate(()=>{
 const mask=document.createElement("canvas");mask.width=1920;mask.height=1080;
 const ctx=mask.getContext("2d");ctx.fillStyle="black";ctx.fillRect(0,0,1920,1080);
 ctx.fillStyle="white";ctx.fillRect(800,300,320,780);
 segmentCurrentCameraFrame=async()=>({image:cameraVideo,segmentationMask:mask});
 livePreviewCanvas.setPointerCapture=()=>{};
 const originalToBlob=canvasToBlob;
 canvasToBlob=(canvas,type)=>{
 const a=canvas.getContext("2d").getImageData(0,0,1920,1080).data;
 const b=livePreviewCanvas.getContext("2d").getImageData(0,0,1920,1080).data;
 window.captureMatches=a.every((v,i)=>v===b[i]);
 return originalToBlob(canvas,type);
 };
});
await page.locator("#openFramePanelBtn").click();await page.locator(".frame-btn").first().click();
await page.waitForFunction(()=>selectedFrameReady&&latestPreviewReady);
assert.equal(await page.locator(".frame-btn").count(),91);
await page.evaluate(()=>{
 const fire=(type,id,x,y)=>livePreviewCanvas.dispatchEvent(new PointerEvent(type,{pointerId:id,pointerType:"touch",clientX:x,clientY:y,bubbles:true,cancelable:true}));
 const check=(ok,msg)=>{if(!ok)throw Error(msg)};
 check(frameTransform.scale===1&&frameTransform.x===0,"initial");
 fire("pointerdown",1,300,200);fire("pointermove",1,350,225);
 check(frameTransform.x===100&&frameTransform.y===50,"drag");
 fire("pointerdown",2,450,225);fire("pointermove",2,550,225);
 check(frameTransform.scale===2,"pinch");
 // Pinch start center 800,450; frame center 1060,590.
 check(frameTransform.x===460&&frameTransform.y===190,"pinch anchor");
 fire("pointerup",2,550,225);
 const before={...frameTransform};fire("pointermove",1,360,230);
 check(frameTransform.x-before.x===20&&frameTransform.y-before.y===10,"resume drag");
 fire("pointercancel",1,360,230);check(framePointers.size===0,"cancel");
});
for(const mode of ["behind","front"]){
 await page.evaluate(mode=>{frameLayerMode=mode;requestLivePreviewRefresh()},mode);
 await page.waitForFunction(()=>latestPreviewReady);
 await page.locator("#captureBtn").click();await page.waitForFunction(()=>!previewArea.classList.contains("hidden"));
 assert(await page.evaluate(()=>window.captureMatches));
 await page.locator("#retakeBtn").click();
}
await page.locator("#resetFrameBtn").click();
assert.deepEqual(await page.evaluate(()=>frameTransform),{x:0,y:0,scale:1});
await page.evaluate(()=>{frameTransform={x:200,y:100,scale:.5}});
await page.locator("#openFramePanelBtn").click();await page.locator(".frame-btn").nth(1).click();
await page.waitForFunction(()=>selectedFrameReady);
assert.deepEqual(await page.evaluate(()=>frameTransform),{x:0,y:0,scale:1});
await page.screenshot({path:path.join(__dirname,"touch-test-desktop.png")});
assert.deepEqual(errors,[]);
console.log("PASS: 91 frames; initial display; drag; pinch anchor; resume drag; cancel; reset; frame change; both layer modes; exact capture pixels. ML mask and camera simulated.");
}finally{if(browser)await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close()});

