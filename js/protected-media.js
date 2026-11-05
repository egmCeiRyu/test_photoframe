const originalPaths = new WeakMap();
const downloads = new Map();
export async function prepareCharacterMedia(character, fields) {
    if (character.free) return;
    let paths = originalPaths.get(character);
    if (!paths) {
        paths = {model:character.model, card:character.card, portrait:character.portrait, voice:character.voice, stamp:character.stamp};
        originalPaths.set(character, paths);
    }
    await initAnonymousUser();
    const {data, error} = await supabaseClient.auth.getSession();
    if (error) throw error;
    const token = data.session?.access_token;
    if (!token) throw new Error("Session required");
    const urls = await Promise.all(fields.map(async field => {
        const source = paths[field];
        if (!source) return null;
        const key = data.session.user.id + ":" + source;
        let download = downloads.get(key);
        if (!download) {
            download = (async () => {
                const response = await fetch(source, {
                    headers:{Authorization:"Bearer " + token},
                    cache:"no-store"
                });
                if (!response.ok) throw new Error("Protected asset unavailable (" + response.status + ")");
                return URL.createObjectURL(await response.blob());
            })().catch(error => { downloads.delete(key); throw error; });
            downloads.set(key,download);
        }
        return download;
    }));
    fields.forEach((field,index) => { if(urls[index]) character[field]=urls[index]; });
}


// Uses the same authenticated loader; the server checks all eight required stamps.
const rewardMedia = {card:"./assets/reward/reward.webp", voice:"./assets/sounds/complete.mp3"};
export async function prepareRewardMedia(fields = ["card", "voice"]) {
    await prepareCharacterMedia(rewardMedia, fields);
    return rewardMedia;
}
