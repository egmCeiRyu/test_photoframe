import { prepareRewardMedia } from "./protected-media.js";
import { requireAccess } from "./access.js?v=20261027_ar8";
document.querySelector("main").hidden = true;
await requireAccess();
const reward = await prepareRewardMedia();
document.getElementById("completeRewardImage").src = reward.card;
document.getElementById("completeVoice").src = reward.voice;
document.querySelector("main").hidden = false;
const completeVoice = document.getElementById("completeVoice");
const playVoiceButton = document.getElementById("playVoiceButton");

let autoPlayed = false;

// Tenta tocar automaticamente ao abrir a página
async function playCompletionVoice() {

    try {

        completeVoice.currentTime = 0;

        await completeVoice.play();

        autoPlayed = true;

        if (playVoiceButton) {
            playVoiceButton.textContent = "▶ もう一度再生";
        }

    } catch (error) {

        console.log("Autoplay failed:", error);

    }

}
if (document.readyState === "complete") playCompletionVoice();
else window.addEventListener("load", playCompletionVoice, { once: true });

// Botão para tocar novamente
if (playVoiceButton) {

    playVoiceButton.addEventListener("click", async () => {

        try {

            completeVoice.pause();
            completeVoice.currentTime = 0;

            await completeVoice.play();

            if (!autoPlayed) {

                autoPlayed = true;

                playVoiceButton.textContent = "▶ もう一度再生";

            }

        } catch (error) {

            console.log("Complete voice error:", error);

        }

    });

}

