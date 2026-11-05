import { prepareCharacterMedia } from "./protected-media.js";
import * as THREE from "three";
import { MindARThree } from "mindar-image-three";
import { characters } from "./data/characters.js?v=20261027_ar8";

const debugText = document.getElementById("debugText");
const scanText = document.getElementById("scanText");
const startARButton = document.getElementById("startARButton");
const stampMessage = document.getElementById("stampMessage");
const safetyMessage = document.getElementById("safetyMessage");

const characterModal = document.getElementById("characterModal");
const modalCharacterName = document.getElementById("modalCharacterName");
const modalCharacterImage = document.getElementById("modalCharacterImage");
const modalText = document.getElementById("modalText");
const modalCloseButton = document.getElementById("modalCloseButton");
const characterScanVoice = document.getElementById("characterScanVoice");
const characterVoiceButton = document.getElementById("characterVoiceButton");

const scannedCharacters = new Set();
let lastScannedIsAROnly = false;

// Áudio silencioso (MP3 de ~0.1s, 1 sample) usado só pra "destravar" o
// elemento <audio> dentro do gesto de clique do usuário. Sem isso,
// SILENT_AUDIO_SRC ficava undefined -> ReferenceError -> o unlock real
// (o await characterScanVoice.play() logo abaixo) nunca rodava, e a voz
// do personagem era bloqueada pelo Chrome/Safari por não ter gesto.
const SILENT_AUDIO_SRC =
    "data:audio/wav;base64,UklGRiQAAAAAV0FWRWZtdCAQAAAAAQABAEANDwEAQA8BAAgAZGF0YQAAAAA=";

let arStarted = false;

let scanLocked = false;
let activeCandidateId = null;
let globalScanTimer = null;

function log(message) {
    console.log(message);

    if (debugText) {
        debugText.textContent = message;
    }
}

function showStampMessage(message, duration = 900) {
    if (!stampMessage) return;
    if (document.body.classList.contains("modal-open")) return;

    stampMessage.textContent = message;
    stampMessage.style.display = "block";

    setTimeout(() => {
        stampMessage.style.display = "none";
    }, duration);
}

function hideScanOverlays() {
    if (scanText) scanText.style.display = "none";
    if (safetyMessage) safetyMessage.style.display = "none";
    if (debugText) debugText.style.display = "none";
    if (stampMessage) stampMessage.style.display = "none";

    document
        .querySelectorAll(".mindar-ui-overlay, .mindar-ui-scanning, .mindar-ui-loading")
        .forEach(element => {
            element.style.display = "none";
            element.style.opacity = "0";
            element.style.pointerEvents = "none";
        });
}

function setScanningUI(isScanning) {
    if (document.body.classList.contains("modal-open")) {
        hideScanOverlays();
        return;
    }

    if (scanText) {
        scanText.style.display = isScanning ? "block" : "none";
    }

    if (safetyMessage) {
        safetyMessage.style.display = isScanning ? "block" : "none";
    }
}

async function playCharacterVoice(character) {
    if (!characterScanVoice || !character?.voice) return;

    try {
        characterScanVoice.pause();
        characterScanVoice.currentTime = 0;

        characterScanVoice.src = character.voice;
        characterScanVoice.muted = false;
        characterScanVoice.volume = 1;
        characterScanVoice.load();

        await characterScanVoice.play();
    } catch (error) {
        console.log("Voice play error:", character.voice, error);
    }
}

function stopCharacterVoice() {
    if (!characterScanVoice) return;

    characterScanVoice.pause();
    characterScanVoice.currentTime = 0;
}

function openCharacterModal(character, alreadyOwned = false) {
    lastScannedIsAROnly = character.arOnly === true;
    document.body.classList.add("modal-open");

    hideScanOverlays();

    if (modalCharacterName) {
        modalCharacterName.textContent = character.name;
    }

    if (modalCharacterImage) {
        modalCharacterImage.src = character.card;
        modalCharacterImage.alt = character.name;
    }

    if (modalText) {
        modalText.textContent = character.arOnly
            ? (alreadyOwned ? "このキャラクターのARはすでに解放されています。" : "キャラクターのARを解放しました！")
            : (alreadyOwned ? "このキャラクターはすでに取得済みです。" : "キャラクターカードを獲得しました！");
    }

    if (characterModal) {
        const badge = characterModal.querySelector(".modal-badge");
        if (badge) badge.textContent = character.arOnly ? "AR" : "GET";
        characterModal.classList.remove("hidden");
    }

    setTimeout(async () => {
        try {
            await playCharacterVoice(character);
        } catch (e) {
            console.log(e);
        }
    }, 250);

    if (characterVoiceButton) {
        characterVoiceButton.disabled = !character.voice;
        characterVoiceButton.textContent = character.voice ? "音声を聞く" : "音声なし";
        characterVoiceButton.onclick = async () => {
            characterVoiceButton.disabled = true;

            try {
                await playCharacterVoice(character);
            } finally {
                setTimeout(() => {
                    characterVoiceButton.disabled = false;
                }, 300);
            }
        };
    }
}

function closeCharacterModal() {
    document.body.classList.remove("modal-open");

    stopCharacterVoice();

    location.href = lastScannedIsAROnly ? "character-list.html" : "stamp-rally.html";
}

async function getCurrentUser() {
    try { return await initAnonymousUser(); }
    catch (error) { console.error(error); showStampMessage("ログインエラー"); return null; }
}

function saveLastScannedCharacter(character) {
    try { sessionStorage.setItem(
        "lastScannedCharacter",
        JSON.stringify({
            id: character.id,
            name: character.name,
            card: "",
            voice: ""
        })
    ); } catch (error) { console.warn("Unable to cache last scan:", error); }
}

// user_stamps also stores scan-based AR entitlements; stampCharacters defines rally credit.
async function saveCharacterStamp(character) {
    try {
        const user = await getCurrentUser();
        if (!user) return false;
        const findStamp = () => supabaseClient.from("user_stamps")
            .select("character_id").eq("user_id", user.id).eq("character_id", character.id).limit(1);
        const existing = await findStamp();
        if (existing.error) throw existing.error;
        if (existing.data?.length) {
            await prepareCharacterMedia(character, ["card", "voice"]);
            saveLastScannedCharacter(character);
            openCharacterModal(character, true);
            return true;
        }
        const { error } = await supabaseClient.from("user_stamps").insert({ user_id: user.id, character_id: character.id });
        if (error && error.code !== "23505") throw error;
        const confirmed = await findStamp();
        if (confirmed.error) throw confirmed.error;
        if (!confirmed.data?.length) throw new Error("Stamp was not persisted");
        await prepareCharacterMedia(character, ["card", "voice"]);
        saveLastScannedCharacter(character);
        openCharacterModal(character, Boolean(error));
        return true;
    } catch (error) {
        console.error("Stamp save failed:", error);
        const detail = [error.code, error.message, error.details].filter(Boolean).join(" / ");
        setScanningUI(true);
        log("保存エラー: " + detail);
        showStampMessage("保存できませんでした: " + detail, 15000);
        return false;
    }
}


function fixMindARVideoLayer() {
    const container = document.querySelector("#arContainer");

    if (!container) return;

    container.querySelectorAll("video").forEach(video => {
        video.style.position = "absolute";
        video.style.inset = "0";
        video.style.width = "100%";
        video.style.height = "100%";
        video.style.objectFit = "cover";
        video.style.zIndex = "1";
    });

    container.querySelectorAll("canvas").forEach(canvas => {
        canvas.style.position = "absolute";
        canvas.style.inset = "0";
        canvas.style.width = "100%";
        canvas.style.height = "100%";
        canvas.style.background = "transparent";
        canvas.style.zIndex = "2";
    });
}

async function unlockCharacterAudio() {
    if (!characterScanVoice) return;

    try {
        characterScanVoice.setAttribute("playsinline", "");
        characterScanVoice.preload = "auto";

        characterScanVoice.pause();
        characterScanVoice.currentTime = 0;

        // usa áudio silencioso, não voz de personagem
        characterScanVoice.src = SILENT_AUDIO_SRC;
        characterScanVoice.muted = false;
        characterScanVoice.volume = 1;
        characterScanVoice.load();

        await characterScanVoice.play();

        characterScanVoice.pause();
        characterScanVoice.currentTime = 0;

        console.log("Character audio unlocked");
    } catch (error) {
        console.log("Character audio unlock error:", error);

        characterScanVoice.pause();
        characterScanVoice.currentTime = 0;
        characterScanVoice.muted = false;
        characterScanVoice.volume = 1;
    }
}

async function startAR() {
    if (arStarted) return;

    arStarted = true;

    try {
        log("MindAR読み込み中...");

        const mindarThree = new MindARThree({
            container: document.querySelector("#arContainer"),
            imageTargetSrc: "./assets/targets/targets-V2.mind?v=68d570f",
            maxTrack: 1,
            warmupTolerance: 2,
            missTolerance: 8,
            filterMinCF: 0.001,
            filterBeta: 0.01
        });

        const { renderer, scene, camera } = mindarThree;

        renderer.setClearColor(0x000000, 0);
        renderer.setClearAlpha(0);
        renderer.outputColorSpace = THREE.SRGBColorSpace;

        characters
            .filter(character => Number.isInteger(character.markerIndex))
            .forEach(character => {
            const anchor =
                mindarThree.addAnchor(character.markerIndex);

            let foundTimer = null;
            let foundConfirmed = false;

            anchor.onTargetFound = () => {
                if (document.body.classList.contains("modal-open")) return;
                if (scanLocked) return;

                hideScanOverlays();
                log(character.name + " 認識中...");

                clearTimeout(globalScanTimer);

                activeCandidateId = character.id;

                globalScanTimer = setTimeout(async () => {
                    if (document.body.classList.contains("modal-open")) return;
                    if (scanLocked) return;
                    if (activeCandidateId !== character.id) return;

                    scanLocked = true;

                    log(`${character.name} 検出`);

                    const saved = await saveCharacterStamp(character);

                    if (!saved) {
                        scanLocked = false;
                    }

                }, character.requiresScan ? 200 : 1500);
            };

            anchor.onTargetLost = () => {
                if (activeCandidateId === character.id) {
                    clearTimeout(globalScanTimer);
                    activeCandidateId = null;
                }

                if (document.body.classList.contains("modal-open")) {
                    hideScanOverlays();
                    return;
                }

                if (!scanLocked) {
                    log("マーカーをスキャンしてください");
                    setScanningUI(true);
                }
            };
        });

        log("カメラ起動中...");

        await mindarThree.start();

        fixMindARVideoLayer();

        setTimeout(fixMindARVideoLayer, 300);
        setTimeout(fixMindARVideoLayer, 800);
        setTimeout(fixMindARVideoLayer, 1500);

        log("マーカーをスキャンしてください");

        setScanningUI(true);

        renderer.setAnimationLoop(() => {
            renderer.render(scene, camera);
        });

    } catch (error) {
        console.error(error);

        arStarted = false;
        document.body.classList.remove("is-ar-started");
        document.body.classList.remove("modal-open");

        log("ERROR: " + error.message);

        alert("ARを開始できませんでした。");
    }
}

// Corre unlockCharacterAudio() contra um timeout: se o play() do áudio
// travar em vez de resolver/rejeitar (ex: fonte inválida, navegador
// estranho), o AR ainda assim abre depois de 1.5s no máximo — o unlock
// de áudio nunca mais consegue bloquear a câmera.
function withTimeout(promise, ms) {
    return Promise.race([
        promise,
        new Promise(resolve => setTimeout(resolve, ms))
    ]);
}

if (startARButton) {
    startARButton.addEventListener("click", async () => {
        document.body.classList.add("is-ar-started");

        await withTimeout(unlockCharacterAudio(), 1500);

        await startAR();
    });
}

if (modalCloseButton) {
    modalCloseButton.addEventListener("click", closeCharacterModal);
}

window.addEventListener("pagehide", stopCharacterVoice);
