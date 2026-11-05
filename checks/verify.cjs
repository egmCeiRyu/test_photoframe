
const fs = require('fs'), vm = require('vm'), assert = require('assert/strict'), path = require('path');
process.chdir(path.resolve(__dirname, '..'));
const read = f => fs.readFileSync(f,'utf8');
(async () => {
    for (const f of fs.readdirSync('js', {recursive:true}).filter(f=>f.endsWith('.js'))) {
        const src=read('js/'+f);
        if (/^\s*(import|export)\b/m.test(src)) new vm.SourceTextModule(src);
        else new vm.Script(src);
    }
    const names = read('js/data/character-names.js').replace(/export const/g,'const');
    const defs = read('js/data/characters.js').replace(/^import.*$/m,'').replace(/export const/g,'const');
    const {characters, stampCharacters} = vm.runInNewContext(names+'\n'+defs+'\n({characters, stampCharacters})');
    assert.equal(stampCharacters.length,8);
    assert.equal(characters.filter(c=>c.arOnly && c.requiresScan).length,3);
    assert.equal(new Set(characters.map(c=>c.id)).size,11);
    assert.deepEqual(Array.from(characters,c=>c.id),[5,9,6,4,7,10,8,11,13,14,12]);
    assert.deepEqual(Array.from(stampCharacters,c=>c.id),[5,9,6,4,7,10,8,11]);
    assert.equal(characters.filter(c=>c.free).length,0);
    for(const c of characters) {
        assert.equal(c.markerIndex,c.id-4);
        const number=String(c.id-3).padStart(2,'0');
        assert.equal(c.card,`./assets/cards/character${number}.webp`);
        assert.equal(c.model,`./assets/models/character${number}.glb`);
        assert.equal(c.voice,c.id===11 ? null : `./assets/sounds/voice${number}.mp3`);
    }
    const stampIds=Array.from(read('stamp-rally.html').matchAll(/class="stamp-card locked" data-character-id="(\d+)"/g),m=>Number(m[1]));
    assert.deepEqual(stampIds,Array.from(stampCharacters,c=>c.id));
    for(const c of characters) for(const k of ['marker','stamp','card','portrait','model','voice'])
        if(c[k]) assert(fs.existsSync(c[k]),c[k]);
    for(let i=1;i<=91;i++) {
        const n=String(i).padStart(2,'0');
        for(const p of ['assets/photoframe/frame'+n+'.webp','assets/photoframe/thumbs/frame'+n+'.webp']) assert(fs.statSync(p).size>0,p);
    }
    assert.match(read('js/photoframe.js'),/TOTAL_FRAMES = 91/);
    assert.match(read('js/photoframe.js'),/pageSize = 6/);
    let logins=0;
    const context=vm.createContext({supabase:{createClient:()=>({auth:{
        getSession:async()=>({data:{session:null},error:null}),
        signInAnonymously:async()=>{logins++;return {data:{user:{id:'test'}},error:null};}
    }})}});
    vm.runInContext(read('js/supabase.js'),context);
    await Promise.all([context.initAnonymousUser(),context.initAnonymousUser(),context.initAnonymousUser()]);
    assert.equal(logins,1);
    // A failed request must be retryable.
    let attempts=0;
    const retry=vm.createContext({supabase:{createClient:()=>({auth:{
        getSession:async()=>({data:{session:null},error:null}),
        signInAnonymously:async()=> ++attempts===1 ? {error:new Error('offline')} : {data:{user:{id:'retry'}},error:null}
    }})}});
    vm.runInContext(read('js/supabase.js'),retry);
    await assert.rejects(retry.initAnonymousUser());
    assert.equal((await retry.initAnonymousUser()).id,'retry');
    const scan=read('js/stamp-scan.js').match(/async function saveCharacterStamp\(character\) \{[\s\S]*?\n\}/)[0];
    async function scenario(results, expected, modalExpected) {
        let modals=0,stores=0,messages=0,inserted=0;
        const chain={select(){return this},eq(){return this},limit(){return Promise.resolve(results.shift())},
            insert:async()=>{inserted++;return results.shift()}};
        const ctx=vm.createContext({
            getCurrentUser:async()=>({id:'test'}),
            prepareCharacterMedia:async()=>{}, setScanningUI(){}, log(){},
            supabaseClient:{from:()=>chain},
            saveLastScannedCharacter:()=>stores++,
            openCharacterModal:()=>modals++,
            showStampMessage:()=>messages++,
            console:{error(){}}
        });
        vm.runInContext(scan,ctx);
        assert.equal(await ctx.saveCharacterStamp({id:4}),expected);
        assert.equal(modals,modalExpected);
        assert.equal(stores,modalExpected);
        if(!expected) assert.equal(messages,1);
        return inserted;
    }
    assert.equal(await scenario([{data:[],error:null},{error:null},{data:[{character_id:4}],error:null}],true,1),1);
    assert.equal(await scenario([{data:[{character_id:4}],error:null}],true,1),0);
    await scenario([{error:{message:'offline'}}],false,0);
    await scenario([{data:[],error:null},{error:{code:'42501'}}],false,0);
    await scenario([{data:[],error:null},{error:null},{data:[],error:null}],false,0);
    await scenario([{data:[],error:null},{error:{code:'23505'}},{data:[{character_id:4}],error:null}],true,1);
    const gate=read('js/access.js').replace(/^import.*$/m,'').replace('export async','async');
    async function access(rows,char,allowed,error=null) {
        let redirects=0,queries=0;
        const ctx=vm.createContext({
            characters,stampCharacters,initAnonymousUser:async()=>({id:'test'}),
            supabaseClient:{from:()=>({select:()=>({eq:async()=>{queries++;return {data:rows,error};}})})},
            alert(){},location:{replace:()=>redirects++},console:{error(){}}
        });
        vm.runInContext(gate,ctx);
        if(allowed) await ctx.requireAccess(char);
        else await assert.rejects(ctx.requireAccess(char));
        assert.equal(redirects,allowed?0:1);
        return queries;
    }
    await access([],characters.find(c=>c.id===12),false);
    await access([{character_id:12}],characters.find(c=>c.id===12),true);
    await access([],characters[0],false);
    await access([{character_id:'5'}],characters[0],true);
    await access([4,5,6,7,8,9,10].map(character_id=>({character_id})),null,false);
    await access([4,5,6,7,8,9,10,11].map(character_id=>({character_id})),null,true);
    await access(null,characters[0],false,{message:'offline'});
    for(const f of ['character-card.html','character-ar.html','complete.html']) {
        const html=read(f);
        assert.match(html,/js\/supabase.js/);
        assert.match(html,/type="module"/);
    }
    console.log('PASS: syntax, 8 stamps, 3 scan-unlocked AR characters, 91 frames + thumbnails, six frames per page, display order, asset paths and voice associations, concurrent login and retry, save confirmation/error/duplicate cases, access and completion guards.');
})().catch(error=>{console.error(error);process.exitCode=1});

