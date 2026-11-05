const http = require("http"), fs = require("fs"), path = require("path");
const root = path.resolve(__dirname, "..");
const types = {".html":"text/html; charset=utf-8",".css":"text/css; charset=utf-8",".js":"text/javascript; charset=utf-8",".webp":"image/webp",".png":"image/png",".svg":"image/svg+xml",".mp3":"audio/mpeg",".wav":"audio/wav",".glb":"model/gltf-binary"};
http.createServer((req,res)=>{
 try {
  const rel=decodeURIComponent(new URL(req.url,"http://localhost").pathname).replace(/^\/+/,"")||"index.html";
  const parts=rel.split(/[\\/]/), file=path.resolve(root,rel);
  if(parts.some(p=>p.startsWith(".")||p==="_backups"||p==="checks")||!file.startsWith(root+path.sep)) {res.writeHead(404);return res.end();}
  if(rel==="js/supabase.js"){res.writeHead(200,{"Content-Type":"text/javascript; charset=utf-8","Cache-Control":"no-store"});return res.end("window.initAnonymousUser=async()=>({id:'local-check-only'});\nwindow.supabaseClient={from:()=>({select:()=>({eq:async()=>({data:Array.from({length:11},(_,i)=>({character_id:i+4})),error:null})})}),auth:{getSession:async()=>({data:{session:{access_token:'local-check-only',user:{id:'local-check-only'}}},error:null})}};\n");}
  fs.stat(file,(err,stat)=>{
   if(err||!stat.isFile()){res.writeHead(404);return res.end();}
   res.writeHead(200,{"Content-Type":types[path.extname(file)]||"application/octet-stream","Content-Length":stat.size,"Cache-Control":"no-store"});
   if(req.method==="HEAD") return res.end();
   fs.createReadStream(file).on("error",()=>res.destroy()).pipe(res);
  });
 }catch(err){res.writeHead(400);res.end();}
}).listen(8089,"127.0.0.1",()=>console.log("Local only: http://localhost:8089"));

