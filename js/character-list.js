import { prepareCharacterMedia } from "./protected-media.js";
import { characters } from "./data/characters.js?v=20261029_order";

const characterGrid = document.getElementById("characterGrid");

let USER_ID = null;
let collectedCharacterIds = new Set();

async function initCharacterList() {
    await loginUser();
    await loadCollectedCharacters();

    renderCharacterGrid();
}

async function loginUser() {
    const user = await initAnonymousUser();
    USER_ID = user.id;
}

async function loadCollectedCharacters() {
    if (!USER_ID) return;

    const { data, error } =
        await supabaseClient
            .from("user_stamps")
            .select("character_id")
            .eq("user_id", USER_ID);

    if (error) throw error;

    collectedCharacterIds = new Set(
        data.map(item => Number(item.character_id))
    );
}

function renderCharacterGrid() {
    if (!characterGrid) return;

    characterGrid.innerHTML = "";

    characters.forEach(character => {
        const isFree = character.free === true && !character.requiresScan;
        const isCollected =
            isFree ||
            collectedCharacterIds.has(character.id);

        const card = document.createElement("article");

        card.className = isCollected
            ? "character-card collected"
            : "character-card";

        card.dataset.characterId = character.id;

        card.innerHTML = `
            <div class="character-image-wrap">
                <img src="${character.arOnly ? `assets/previews/silhouette${String(character.id - 3).padStart(2, "0")}.webp` : character.portrait}" alt="${character.name}">
                ${isCollected ? "" : `
                        <div class="locked-badge" aria-label="未獲得">
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                                <rect x="5" y="10" width="14" height="11" rx="3"></rect>
                                <path d="M8 10V7a4 4 0 0 1 8 0v3"></path>
                                <circle cx="12" cy="15.5" r="1.2"></circle>
                            </svg>
                        </div>
                `}
            </div>

            <div class="character-name">
                ${character.name}
            </div>

            ${isCollected ? `
                <div class="character-actions">
                    <button
                        class="character-action-button ar-button"
                        type="button">
                        ARで見る
                    </button>

                    <button
                        class="character-action-button voice-button"
                        type="button">
                        カードを開く
                    </button>
                </div>
            ` : `
                <div class="character-actions character-actions-placeholder" aria-hidden="true">
                    <span class="character-action-button ar-button">ARで見る</span>
                    <span class="character-action-button voice-button">カードを開く</span>
                </div>
            `}
        `;

        if (isCollected) {
            const arButton =
                card.querySelector(".ar-button");

            arButton.addEventListener("click", () => {
                location.href =
                    `character-ar.html?id=${character.id}`;
            });

            const voiceButton =
                card.querySelector(".voice-button");

            voiceButton.setAttribute("aria-label", `${character.name}のカードを開く`);
            voiceButton.addEventListener("click", () => {
                location.href =
                    `character-card.html?id=${character.id}&from=character-list`;
            });
        }

        characterGrid.appendChild(card);
        if (isCollected && character.arOnly) {
            prepareCharacterMedia(character, ["portrait"]).then(() => {
                card.querySelector(".character-image-wrap img").src = character.portrait;
            }).catch(error => console.error("Portrait unavailable:", error));
        }
    });
}

initCharacterList().catch(error => {
    console.error(error);
    alert("通信エラー。再読み込みしてください。");
    collectedCharacterIds = new Set();
    renderCharacterGrid();
});
