export function protectedCharacter(pathname) {
    const portrait = /^\/assets\/characters\/character(09|10|11)\.webp$/.exec(pathname);
    if (portrait) return Number(portrait[1]) + 3;
    const match = /^\/assets\/(?:stamps\/stamp(0[1-9]|1[01])\.png|models\/character(0[1-9]|1[01])\.glb|cards\/character(0[1-9]|1[01])\.webp|sounds\/voice(0[1-9]|1[01])\.(?:mp3|wav))$/.exec(pathname);
    return match ? Number(match[1] || match[2] || match[3] || match[4] || match[5]) + 3 : null;
}
export const REQUIRED_STAMPS = [4,5,6,7,8,9,10,11];
const rewardPaths = new Set(["/assets/reward/reward.webp", "/assets/sounds/complete.mp3"]);
const protectedFolder = /^\/assets\/(?:cards|models|sounds|stamps|reward)(?:\/|$)/;
const deny = (status, message) => new Response(JSON.stringify({error:message}), {
    status, headers: {"Content-Type":"application/json","Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","CDN-Cache-Control":"no-store","Cloudflare-CDN-Cache-Control":"no-store"}
});
export async function serve(request, env, fetcher = fetch) {
    if (!["GET","HEAD"].includes(request.method)) return deny(405,"Method not allowed");
    const url = new URL(request.url);
    let pathname;
    try { pathname = decodeURIComponent(url.pathname); } catch { return deny(400,"Invalid path"); }
    if (pathname.includes("\\") || pathname.includes("%") || pathname.split("/").some(p=>p.startsWith("."))) return deny(404,"Not found");
    const publicRoute = pathname === "/" || /^\/[a-z-]+\.html$/.test(pathname)
        || /^\/(?:assets|css|js|external)\//.test(pathname);
    if (!publicRoute) return deny(404,"Not found");
    if (pathname.startsWith("/assets/characters/") && !/^\/assets\/characters\/character(0[1-9]|1[01])\.webp$/.test(pathname)) return deny(403,"Unknown portrait");
    const characterId = protectedCharacter(pathname);
    const isReward = rewardPaths.has(pathname);
    const protectedAsset = characterId !== null || isReward;
    if (protectedFolder.test(pathname) && !protectedAsset && pathname !== "/assets/sounds/stamp.mp3") return deny(403,"Unknown protected asset");
    if (protectedAsset) {
        const authorization = request.headers.get("Authorization") || "";
        if (!/^Bearer [^\s]+$/i.test(authorization)) return deny(403,"Authentication required");
        if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) return deny(503,"Authorization unavailable");
        try {
            const headers = {apikey:env.SUPABASE_PUBLISHABLE_KEY, Authorization:authorization};
            const auth = await fetcher(env.SUPABASE_URL + "/auth/v1/user", {headers, signal:AbortSignal.timeout(8000)});
            if (auth.status===401 || auth.status===403) return deny(403,"Session expired");
            if (!auth.ok) return deny(503,"Authorization unavailable");
            const user = await auth.json();
            if (!/^[0-9a-f-]{36}$/i.test(user.id || "")) return deny(403,"Invalid user");
            const query = new URLSearchParams({select:"character_id",user_id:"eq."+user.id});
            if (isReward) query.set("character_id", "in.(" + REQUIRED_STAMPS.join(",") + ")");
            else { query.set("character_id", "eq."+characterId); query.set("limit", "1"); }
            const result = await fetcher(env.SUPABASE_URL + "/rest/v1/user_stamps?" + query, {headers, signal:AbortSignal.timeout(8000)});
            if (!result.ok) return deny(503,"Collection verification unavailable");
            const rows = await result.json();
            if (!Array.isArray(rows)) return deny(503,"Invalid collection response");
            const ids = new Set(rows.map(row => Number(row.character_id)));
            if (isReward ? !REQUIRED_STAMPS.every(id => ids.has(id)) : !ids.has(characterId)) return deny(403,"Content locked");
        } catch { return deny(503,"Authorization unavailable"); }
    }
    url.pathname = pathname;
    const response = await env.ASSETS.fetch(new Request(url,request));
    const headers = new Headers(response.headers);
    headers.set("X-Content-Type-Options","nosniff");
    if (protectedAsset) {
        headers.set("Cache-Control","private, no-store");
        headers.set("Vary","Authorization");
        headers.set("CDN-Cache-Control","no-store");
        headers.set("Cloudflare-CDN-Cache-Control","no-store");
        headers.delete("Access-Control-Allow-Origin");
    }
    if (/\.(?:html|js)$/.test(pathname) || pathname === "/") headers.set("Cache-Control","no-store");
    return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}
export default {fetch(request, env) { return serve(request, env); }};

