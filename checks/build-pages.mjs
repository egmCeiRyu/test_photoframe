import {createHash} from "node:crypto";
import {protectedCharacter} from "../server/worker.mjs";
import fs from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const out=path.join(root,"_pages-build/release");
// Fail the build if protected bytes also exist at a public asset URL.
async function inventory(dir) {
    const files=[];
    for(const entry of await fs.readdir(dir,{withFileTypes:true})) {
        const file=path.join(dir,entry.name);
        if(entry.isDirectory()) files.push(...await inventory(file)); else files.push(file);
    }
    return files;
}
const assetFiles=await inventory(path.join(root,"assets"));
const hashes=new Map();
for(const file of assetFiles) {
    const url="/"+path.relative(root,file).split(path.sep).join("/");
    const digest=createHash("sha256").update(await fs.readFile(file)).digest("hex");
    if(!hashes.has(digest)) hashes.set(digest,[]);
    hashes.get(digest).push({url,protected:protectedCharacter(url)!==null||url==="/assets/reward/reward.webp"||url==="/assets/sounds/complete.mp3"});
}
for(const copies of hashes.values()) if(copies.some(x=>x.protected)&&copies.some(x=>!x.protected)) throw new Error("Public duplicate of protected asset: "+JSON.stringify(copies));
console.log("PASS: no byte-identical public copies of protected files");
await fs.mkdir(out,{recursive:true});
for(const entry of await fs.readdir(out)) throw new Error("Build output must be empty: " + out);
for(const dir of ["assets","css","js","external"]) await fs.cp(path.join(root,dir),path.join(out,dir),{recursive:true});
for(const name of await fs.readdir(root)) if(name.endsWith(".html")) await fs.copyFile(path.join(root,name),path.join(out,name));
await fs.copyFile(path.join(root,"server/worker.mjs"),path.join(out,"_worker.js"));
await fs.writeFile(path.join(out,"_routes.json"),JSON.stringify({version:1,include:["/*"],exclude:[]},null,2));
console.log("Prepared Pages output (not deployed): " + out);
