import { stampCharacters } from "./data/characters.js?v=20261027_ar8";
export async function requireAccess(character = null) {
    try {
        if (character?.free && !character.requiresScan) return;
        const user = await initAnonymousUser();
        const { data, error } = await supabaseClient.from("user_stamps").select("character_id").eq("user_id", user.id);
        if (error) throw error;
        const ids = new Set(data.map(row => Number(row.character_id)));
        const allowed = character ? ids.has(character.id) : stampCharacters.every(item => ids.has(item.id));
        if (!allowed) throw new Error("Content is still locked");
    } catch (error) {
        console.error(error);
        alert("取得状況を確認できませんでした。スタンプラリーをご確認ください。");
        location.replace(character ? "character-list.html" : "stamp-rally.html");
        throw error;
    }
}
