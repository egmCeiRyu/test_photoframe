import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {serve} from "../server/worker.mjs";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const config=JSON.parse(fs.readFileSync(path.join(root,"wrangler.jsonc"),"utf8"));
const types={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8",".webp":"image/webp",".png":"image/png",".svg":"image/svg+xml",".mp3":"audio/mpeg",".wav":"audio/wav",".glb":"model/gltf-binary"};
const env={...config.vars,ASSETS:{fetch:async(request)=>{
    const rel=decodeURIComponent(new URL(request.url).pathname).replace(/^\/+/,"")||"index.html";
    const file=path.resolve(root,rel);
    if(!file.startsWith(root+path.sep))return new Response("Not found",{status:404});
    try{
        const b=await fs.promises.readFile(file);
        return new Response(request.method==="HEAD"?null:b,{headers:{"Content-Type":types[path.extname(file)]||"application/octet-stream","Content-Length":b.length}});
    }catch{return new Response("Not found",{status:404});}
}}};
http.createServer(async(req,res)=>{
    try{
        const request=new Request("http://127.0.0.1:8088"+req.url,{method:req.method,headers:req.headers});
        const response=await serve(request,env);
        res.writeHead(response.status,Object.fromEntries(response.headers));
        res.end(Buffer.from(await response.arrayBuffer()));
    }catch{res.writeHead(503);res.end("Service unavailable");}
}).listen(Number(process.env.AR_PREVIEW_PORT || 8088),"127.0.0.1",()=>console.log("Secure preview: http://localhost:8088"));

