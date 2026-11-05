import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import {serve,protectedCharacter} from "../server/worker.mjs";
const user="11111111-1111-4111-8111-111111111111";
let assetReads=0;
const env={SUPABASE_URL:"https://example.supabase.co",SUPABASE_PUBLISHABLE_KEY:"public-test",ASSETS:{fetch:async()=>{assetReads++;return new Response("protected content", {headers:{"Cache-Control":"public, max-age=3600"}});}}};
const req=(file,token="valid",method="GET")=>new Request("http://localhost"+file,{method,headers:token?{Authorization:"Bearer "+token}:{}});
const backend=(rows,authStatus=200,restStatus=200)=>async(url,opts)=>{
    assert.equal(opts.headers.Authorization,"Bearer valid");
    if(url.includes("/auth/v1/user"))return new Response(JSON.stringify({id:user}),{status:authStatus});
    const u=new URL(url);
    assert.equal(u.searchParams.get("user_id"),"eq."+user);
    return new Response(JSON.stringify(rows),{status:restStatus});
};
for(let i=1;i<=11;i++){
    const n=String(i).padStart(2,"0"),id=i+3;
    for(const file of ["/assets/stamps/stamp"+n+".png","/assets/models/character"+n+".glb","/assets/cards/character"+n+".webp","/assets/sounds/voice"+n+".mp3","/assets/sounds/voice"+n+".wav"]){
        assert.equal(protectedCharacter(file),id);
        const before=assetReads;
        assert.equal((await serve(req(file,null),env)).status,403);
        assert.equal((await serve(req(file),env,backend([]))).status,403);
        assert.equal((await serve(req(file),env,backend([{character_id:id+1}]))).status,403);
        assert.equal(assetReads,before,"Denied requests must never reach assets");
        const allowed=await serve(req(file),env,backend([{character_id:String(id)}]));
        assert.equal(allowed.status,200);
        assert.equal(allowed.headers.get("Cache-Control"),"private, no-store");
        assert.equal(allowed.headers.get("Vary"),"Authorization");
    }
}
assert.equal((await serve(req("/assets/models/character01.glb"),env,backend([],401))).status,403);
assert.equal((await serve(req("/assets/models/character01.glb"),env,backend([],200,500))).status,503);
assert.equal((await serve(req("/assets/models/character01.glb"),env,async()=>{throw Error("offline")})).status,503);
assert.equal((await serve(req("/assets/models/character01.glb"),{ASSETS:env.ASSETS})).status,503);
for(const file of ["/.git/config","/server/worker.mjs","/checks/security-test.mjs","/wrangler.jsonc","/_backups/file","/assets/models/%2563haracter01.glb"])assert.equal((await serve(req(file,null),env)).status,404);
assert.equal((await serve(req("/assets/models/%63haracter01.glb",null),env)).status,403);
assert.equal((await serve(req("/assets/models/character01.glb",null,"HEAD"),env)).status,403);
assert.equal((await serve(req("/home.html",null,"POST"),env)).status,405);
assert.equal((await serve(req("/home.html",null),env)).status,200);
for(const f of fs.readdirSync("js").filter(f=>f.endsWith(".js"))){
    const source=fs.readFileSync("js/"+f,"utf8");
    if(/^\s*(?:import|export)\b/m.test(source))new vm.SourceTextModule(source);
    else new vm.Script(source);
}
const media=fs.readFileSync("js/protected-media.js","utf8").replace(/export async/g,"async");
let downloads=0;
const ctx=vm.createContext({initAnonymousUser:async()=>({id:user}),supabaseClient:{auth:{getSession:async()=>({data:{session:{user:{id:user},access_token:"valid"}},error:null})}},
fetch:async(source,options)=>{downloads++;assert.equal(options.headers.Authorization,"Bearer valid");return {ok:true,blob:async()=>({})};},URL:{createObjectURL:()=>"blob:test-"+downloads}});
vm.runInContext(media,ctx);
const char={model:"/assets/models/character01.glb",voice:"/assets/sounds/voice01.mp3"};
await ctx.prepareCharacterMedia(char,["model"]);
assert.match(char.model,/^blob:/);assert.equal(char.voice,"/assets/sounds/voice01.mp3");
await ctx.prepareCharacterMedia(char,["model"]);assert.equal(downloads,1);
await ctx.prepareCharacterMedia({free:true,model:"free.glb"},["model"]);assert.equal(downloads,1);
for(const f of fs.readdirSync("assets/models").filter(f=>f.endsWith(".glb"))){
    const b=fs.readFileSync("assets/models/"+f);
    assert.equal(b.toString("ascii",0,4),"glTF");
    const len=b.readUInt32LE(12);
    const gltf=JSON.parse(b.toString("utf8",20,20+len).trim());
    for(const item of [...(gltf.buffers||[]),...(gltf.images||[])])
        if(item.uri)assert(item.uri.startsWith("data:"),f+" requires external resource: "+item.uri);
}
console.log("PASS: all 11 protected IDs and media types, invalid/locked/expired sessions, backend failures, encoded paths, HEAD, private cache, client media cache, JS syntax and self-contained GLB models.");


for(const file of ["/assets/reward/reward.webp", "/assets/sounds/complete.mp3"]) {
    assert.equal((await serve(req(file,null),env)).status,403);
    for(const ids of [[],[12,13,14],[4,5,6,7,8,9,10,12,13,14]]) {
        assert.equal((await serve(req(file),env,backend(ids.map(character_id=>({character_id}))))).status,403);
    }
    const response=await serve(req(file),env,backend([4,5,6,7,8,9,10,11].map(character_id=>({character_id}))));
    assert.equal(response.status,200);
    assert.equal(response.headers.get("Cloudflare-CDN-Cache-Control"),"no-store");
}
for(const file of ["/assets/cards/alternate.webp","/assets/models/character01.glb.bak","/assets/stamps/other.png","/assets/sounds/voice01.ogg","/assets/reward/other.webp"])
    assert.equal((await serve(req(file,null),env)).status,403);
console.log("PASS: protected stamps; reward requires eight rally IDs; conductors do not count; unknown files denied; CDN cache disabled.");

for(let id=12;id<=14;id++) {
    const file="/assets/characters/character"+String(id-3).padStart(2,"0")+".webp";
    assert.equal((await serve(req(file,null),env)).status,403);
    assert.equal((await serve(req(file),env,backend([]))).status,403);
    assert.equal((await serve(req(file),env,backend([{character_id:id}]))).status,200);
}
console.log("PASS: duplicated conductor portraits require individual unlocks.");
