import { prepareCharacterMedia } from "./protected-media.js";
import { requireAccess } from "./access.js?v=20261027_ar8";
import { characters } from "./data/characters.js?v=20261027_ar8";

const characterName = document.getElementById("characterName");
const characterCardImage = document.getElementById("characterCardImage");
const voiceButton = document.getElementById("voiceButton");
const closeButton = document.getElementById("closeButton");
const characterVoice = document.getElementById("characterVoice");

function getUrlParams() {
    const params = new URLSearchParams(location.search);

    return {
        id: Number(params.get("id")),
        from: params.get("from") || "rally",
        autoplay: params.get("autoplay") === "1"
    };
}

const { id, from, autoplay } = getUrlParams();

const character = characters.find(item => item.id === id);

function initCharacterCard() {
    if (!character) {
        alert("キャラクターが見つかりませんでした。");
        location.href = "stamp-rally.html";
        return;
    }

    characterName.textContent = character.name;

    characterCardImage.src = character.card;
    characterCardImage.alt = character.name;

    if (character.voice) {
        voiceButton.disabled = true;
        voiceButton.textContent = "音声を読み込み中…";
        loadCardVoice();
    } else {
        voiceButton.disabled = true;
        voiceButton.textContent = "音声なし";
    }
}

let voiceReady = false;

async function loadCardVoice(attempt = 0) {
    try {
        await prepareCharacterMedia(character, ["voice"]);
        characterVoice.src = character.voice;
        voiceReady = true;
        voiceButton.disabled = false;
        voiceButton.textContent = "音声再生";
        if (autoplay) playVoice();
    } catch (error) {
        console.error("Voice download failed:", error);
        if (attempt < 2) {
            voiceButton.textContent = "音声を再読み込み中…";
            setTimeout(() => loadCardVoice(attempt + 1), 1000 * (attempt + 1));
            return;
        }
        voiceButton.disabled = true;
        voiceButton.textContent = "音声を読み込めませんでした";
    }
}

function playVoice() {
    if (!characterVoice || !character?.voice || !voiceReady) return;

    characterVoice.pause();
    characterVoice.currentTime = 0;
    characterVoice.volume = 1;
    characterVoice.muted = false;

    characterVoice.play().catch(error => {
        console.log("Voice play error:", error);
    });
}

function closeCard() {
    if (characterVoice) {
        characterVoice.pause();
        characterVoice.currentTime = 0;
    }

    location.href =
        from === "character-list"
            ? "character-list.html"
            : "stamp-rally.html";
}

voiceButton.addEventListener("click", playVoice);
closeButton.addEventListener("click", closeCard);

if (character) {
    await requireAccess(character);
    await prepareCharacterMedia(character, ["card"]);
}
initCharacterCard();
