import { prepareCharacterMedia, prepareRewardMedia } from "./protected-media.js";
import { characters, stampCharacters } from "./data/characters.js?v=20261027_ar8";

const MAX_STAMPS =
    stampCharacters.length;

let USER_ID = null;
let confettiPlayed = false;

const fromComplete =
    new URLSearchParams(window.location.search)
        .get("from") === "complete";

async function initStampRally() {
    const user = await initAnonymousUser();
    USER_ID = user.id;
    await loadStamps();
}

async function loadStamps() {
    if (!USER_ID) return;

    const { data, error } =
        await supabaseClient
            .from("user_stamps")
            .select("character_id")
            .eq("user_id", USER_ID);

    if (error) throw error;

    document.querySelectorAll(".stamp-card").forEach(card => {
        card.classList.add("locked");
        card.classList.remove("unlocked");

        card.disabled = true;
        card.onclick = null;
        const image = card.querySelector("img");
        if (image?.dataset.previewSrc) image.src = image.dataset.previewSrc;
    });

    const rewardPreview = document.querySelector("#rewardBox img");
    rewardPreview.src = rewardPreview.dataset.previewSrc;
    const unlocked = new Set();

    data.forEach(item => {
        const character =
            stampCharacters.find(c => c.id === Number(item.character_id));

        if (!character) return;

        const card =
            document.querySelector(
                `.stamp-card[data-character-id="${character.id}"]`
            );

        if (!card) return;

        card.classList.remove("locked");
        card.classList.add("unlocked");

        card.disabled = true;
        card.onclick = null;

        unlocked.add(character.id);
    });

    updateStampLevel(unlocked.size);
    const tasks = stampCharacters.filter(c => unlocked.has(c.id)).map(async character => {
        await prepareCharacterMedia(character, ["stamp"]);
        const image = document.querySelector(`.stamp-card[data-character-id="${character.id}"] img`);
        if (image) image.src = character.stamp;
    });
    if (unlocked.size === MAX_STAMPS) tasks.push((async () => {
        const reward = await prepareRewardMedia(["card"]);
        document.querySelector("#rewardBox img").src = reward.card;
    })());
    const mediaResults = await Promise.allSettled(tasks);
    mediaResults.forEach(result => { if (result.status === "rejected") console.error(result.reason); });

    if (unlocked.size >= MAX_STAMPS && !fromComplete) {
        launchConfetti();
    }
}

function updateStampLevel(total) {
    const percent =
        Math.min((total / MAX_STAMPS) * 100, 100);

    const progressText =
        document.getElementById("progressText");

    const progressFill =
        document.getElementById("progressFill");

    const rewardBox =
        document.getElementById("rewardBox");

    const completeBox =
        document.getElementById("completeBox");

    if (progressText) {
        progressText.textContent =
            `${total} / ${MAX_STAMPS}`;
    }

    if (progressFill) {
        progressFill.style.width =
            `${percent}%`;
    }

    if (rewardBox && completeBox) {

        if (total >= MAX_STAMPS) {

            rewardBox.classList.add("completed");
            completeBox.style.display = "block";

            rewardBox.style.cursor = "default";
            completeBox.style.cursor = "default";

            rewardBox.onclick = null;

            completeBox.onclick = null;

        } else {

            rewardBox.classList.remove("completed");
            completeBox.style.display = "none";

            rewardBox.style.cursor = "default";
            completeBox.style.cursor = "default";

            rewardBox.onclick = null;
            completeBox.onclick = null;

        }

    }
}

async function resetStamps() {
    if (!USER_ID) return;

    const { error } = await supabaseClient
        .from("user_stamps")
        .delete()
        .eq("user_id", USER_ID);

    if (error) {
        console.error(error);
        alert("リセットに失敗しました。もう一度お試しください。");
        return;
    }
    confettiPlayed = false;

    await loadStamps();
}

function launchConfetti() {
    if (confettiPlayed) return;
    if (typeof confetti !== "function") return;

    confettiPlayed = true;

    confetti({
        particleCount: 120,
        spread: 80,
        origin: { y: 0.6 }
    });

    setTimeout(() => {
        confetti({
            particleCount: 80,
            spread: 100,
            origin: { y: 0.7 }
        });
    }, 400);
}

window.resetStamps = resetStamps;

initStampRally().catch(error => { console.error(error); alert("通信エラー。再読み込みしてください。"); });
