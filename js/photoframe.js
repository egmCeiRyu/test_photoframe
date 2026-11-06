const cameraVideo = document.getElementById("cameraVideo");
const selectedPhotoFrame = document.getElementById("selectedPhotoFrame");
const captureCanvas = document.getElementById("captureCanvas");

const livePreviewCanvas =
    document.getElementById("livePreviewCanvas");

const livePreviewContext =
    livePreviewCanvas
        ? livePreviewCanvas.getContext("2d", {
            alpha: true
        })
        : null;

let livePreviewRunning = false;
let livePreviewProcessing = false;
let livePreviewTimer = null;
let livePreviewFramePromise = Promise.resolve();
let latestPreviewReady = false;
let livePreviewGeneration = 0;

const homeButton = document.getElementById("homeButton");
const captureBtn = document.getElementById("captureBtn");
const openFramePanelBtn = document.getElementById("openFramePanelBtn");
const switchCameraBtn = document.getElementById("switchCameraBtn");
const layerToggleBtn = document.getElementById("layerToggleBtn");
const layerToggleLabel = document.getElementById("layerToggleLabel");

const framePanel = document.getElementById("framePanel");
const closeFramePanelBtn = document.getElementById("closeFramePanelBtn");
const frameCarousel = document.getElementById("frameCarousel");

const previewArea = document.getElementById("previewArea");
const previewImage = document.getElementById("previewImage");
const retakeBtn = document.getElementById("retakeBtn");
const saveBtn = document.getElementById("saveBtn");

let previewObjectUrl = null;
let capturedPhotoBlob = null;

let selfieSegmentation = null;
let segmentationReady = false;

let segmentationResolve = null;
let segmentationReject = null;
let segmentationTimeout = null;

let selectedBackgroundImage = null;

const personCanvas = document.createElement("canvas");

const personContext = personCanvas.getContext(
    "2d",
    {
        alpha: true
    }
);

const personMaskCanvas = document.createElement("canvas");
const personMaskContext = personMaskCanvas.getContext(
    "2d",
    {
        alpha: true
    }
);

let currentStream = null;
let cameraStarting = false;
let cameraSwitching = false;
let captureInProgress = false;

let facingMode = "environment";

let selectedFrame = null;
let selectedFrameReady = false;
let frameLayerMode = "behind";

let orientationTimer = null;

const FRAME_WIDTH = 1920;
const FRAME_HEIGHT = 1080;
const MIN_FRAME_SCALE = 0.5;
const MAX_FRAME_SCALE = 4;
const LIVE_PREVIEW_FPS = 12;
const LIVE_PREVIEW_INTERVAL = 1000 / LIVE_PREVIEW_FPS;
const PERSON_MASK_EXPANSION = 5;
const PERSON_MASK_FEATHER = 2;

const TOTAL_FRAMES = 91;
const ASSET_VERSION = "20261028_91";

const frames = Array.from(
    { length: TOTAL_FRAMES },
    (_, index) => {
        const num = String(index + 1).padStart(2, "0");

        return {
            id: index + 1,
            full: `assets/photoframe/frame${num}.webp?v=${ASSET_VERSION}`,
            thumb: `assets/photoframe/thumbs/frame${num}.webp?v=${ASSET_VERSION}`
        };
    }
);

// Frame-only transform in 1920x1080 composition coordinates.
var frameTransform = { x: 0, y: 0, scale: 1 };
var framePointers = new Map();
var frameGesture = null;

function resetFrameTransform() {
    frameTransform = { x: 0, y: 0, scale: 1 };
    if (framePointers) framePointers.clear();
    frameGesture = null;
    requestLivePreviewRefresh();
}


function constrainFrameTransform() {
    const { scale } = frameTransform;
    // Keep a smaller frame inside the camera rectangle, or a larger frame covering it.
    const maxX = FRAME_WIDTH * Math.abs(scale - 1) / 2;
    const maxY = FRAME_HEIGHT * Math.abs(scale - 1) / 2;
    frameTransform = {
        scale,
        x: Math.max(-maxX, Math.min(maxX, frameTransform.x)),
        y: Math.max(-maxY, Math.min(maxY, frameTransform.y))
    };
}

function drawTransformedFrame(ctx) {
    ctx.save();
    ctx.translate(FRAME_WIDTH / 2 + frameTransform.x,
        FRAME_HEIGHT / 2 + frameTransform.y);
    ctx.scale(frameTransform.scale, frameTransform.scale);
    ctx.translate(-FRAME_WIDTH / 2, -FRAME_HEIGHT / 2);
    ctx.beginPath();
    ctx.rect(0, 0, FRAME_WIDTH, FRAME_HEIGHT);
    ctx.clip();
    drawCover(ctx, selectedBackgroundImage, FRAME_WIDTH, FRAME_HEIGHT);
    ctx.restore();
}

function frameGestureSnapshot() {
    const points = Array.from(framePointers.values()).slice(0, 2);
    if (!points.length) { frameGesture = null; return; }
    const center = points.length === 1 ? points[0] : {
        x: (points[0].x + points[1].x) / 2,
        y: (points[0].y + points[1].y) / 2
    };
    frameGesture = {
        center,
        distance: points.length === 2
            ? Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y)
            : 0,
        transform: { ...frameTransform }
    };
}

function bindFrameGestures() {
    if (!livePreviewCanvas) return;
    const position = event => {
        const rect = livePreviewCanvas.getBoundingClientRect();
        return {
            x: (event.clientX - rect.left) * FRAME_WIDTH / rect.width,
            y: (event.clientY - rect.top) * FRAME_HEIGHT / rect.height
        };
    };
    livePreviewCanvas.addEventListener("pointerdown", event => {
        if (!selectedFrameReady || captureInProgress ||
            !previewArea.classList.contains("hidden") ||
            (event.pointerType === "mouse" && event.button !== 0)) return;
        event.preventDefault();
        livePreviewCanvas.setPointerCapture(event.pointerId);
        framePointers.set(event.pointerId, position(event));
        frameGestureSnapshot();
    });
    livePreviewCanvas.addEventListener("pointermove", event => {
        if (!framePointers.has(event.pointerId) || !frameGesture || captureInProgress) return;
        event.preventDefault();
        framePointers.set(event.pointerId, position(event));
        const points = Array.from(framePointers.values()).slice(0, 2);
        const center = points.length === 1 ? points[0] : {
            x: (points[0].x + points[1].x) / 2,
            y: (points[0].y + points[1].y) / 2
        };
        const start = frameGesture;
        const distance = points.length === 2
            ? Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y) : 0;
        const scale = start.distance > 0
            ? Math.max(MIN_FRAME_SCALE, Math.min(MAX_FRAME_SCALE, start.transform.scale * distance / start.distance))
            : start.transform.scale;
        const ratio = scale / start.transform.scale;
        // Keep the point beneath the pinch midpoint anchored while resizing.
        frameTransform = {
            scale,
            x: center.x - FRAME_WIDTH / 2 -
                (start.center.x - FRAME_WIDTH / 2 - start.transform.x) * ratio,
            y: center.y - FRAME_HEIGHT / 2 -
                (start.center.y - FRAME_HEIGHT / 2 - start.transform.y) * ratio
        };
        constrainFrameTransform();

        requestLivePreviewRefresh();
    });
    const end = event => {
        if (framePointers.delete(event.pointerId)) frameGestureSnapshot();
    };
    livePreviewCanvas.addEventListener("pointerup", end);
    livePreviewCanvas.addEventListener("pointercancel", end);
    livePreviewCanvas.addEventListener("lostpointercapture", end);
    window.addEventListener("resize", () => {
        framePointers.clear();
        frameGesture = null;
    });
    document.getElementById("resetFrameBtn").addEventListener("click", resetFrameTransform);
}

initialize();

/* =========================
   Initialize
========================= */

async function initialize() {
    createFrameCarousel();
    bindEvents();
    bindFrameGestures();
    updateFrameLayerToggle();

    const instructionsDialog = document.getElementById("instructionsDialog");
    const openInstructionsBtn = document.getElementById("openInstructionsBtn");

    if (instructionsDialog && openInstructionsBtn) {
        openInstructionsBtn.addEventListener("click", () => {
            instructionsDialog.showModal();
        });
        instructionsDialog.addEventListener("close", () => {
            openInstructionsBtn.focus();
        });
        instructionsDialog.showModal();
    }

    initializeSelfieSegmentation();

    await startCamera();
}

/* =========================
   Frame Carousel
========================= */

function createFrameCarousel() {
    if (!frameCarousel) {
        return;
    }

    frameCarousel.innerHTML = "";

    const pageSize = 6;
    let page;
    frames.forEach((frame, index) => {
        if (index % pageSize === 0) {
            page = document.createElement("div");
            page.className = "frame-page";
            page.setAttribute("role", "group");
            page.setAttribute("aria-label", `ページ${Math.floor(index / pageSize) + 1}`);
            frameCarousel.appendChild(page);
        }
        const button = document.createElement("button");

        button.className = "frame-btn";
        button.type = "button";
        button.dataset.frame = String(frame.id);

        const img = document.createElement("img");

        img.src = frame.thumb;
        img.alt = `フレーム${frame.id}`;
        img.loading = "lazy";
        img.decoding = "async";

        img.onerror = () => {
            button.remove();
        };

        button.appendChild(img);

        button.addEventListener("click", () => {
            selectFrame(frame, button);
        });

        page.appendChild(button);
    });
    const count = Math.ceil(frames.length / pageSize);
    const previous = document.getElementById("previousFramePage");
    const next = document.getElementById("nextFramePage");
    const label = document.getElementById("framePageNumber");
    const current = () => Math.round(frameCarousel.scrollLeft / frameCarousel.clientWidth);
    function updateNavigation() {
        const index = current();
        label.textContent = `${index + 1} / ${count}`;
        previous.disabled = index === 0;
        next.disabled = index === count - 1;
    }
    function move(delta) {
        frameCarousel.scrollTo({left: Math.max(0, Math.min(count - 1, current() + delta)) * frameCarousel.clientWidth, behavior: "smooth"});
    }
    previous.addEventListener("click", () => move(-1));
    next.addEventListener("click", () => move(1));
    frameCarousel.addEventListener("scroll", updateNavigation);
    frameCarousel.addEventListener("keydown", event => {
        if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
            event.preventDefault();
            move(event.key === "ArrowRight" ? 1 : -1);
        }
    });
    new ResizeObserver(updateNavigation).observe(frameCarousel);
    updateNavigation();
}

/* =========================
   Events
========================= */

function bindEvents() {
    if (homeButton) {
        homeButton.addEventListener("click", () => {
            stopCamera();
        });
    }

    if (switchCameraBtn) {
        switchCameraBtn.addEventListener(
            "click",
            switchCamera
        );
    }

    if (openFramePanelBtn) {
        openFramePanelBtn.addEventListener(
            "click",
            openFramePanel
        );
    }

    if (layerToggleBtn) {
        layerToggleBtn.addEventListener(
            "click",
            toggleFrameLayer
        );
    }

    if (closeFramePanelBtn) {
        closeFramePanelBtn.addEventListener(
            "click",
            closeFramePanel
        );
    }

    if (captureBtn) {
        captureBtn.addEventListener(
            "click",
            capturePhoto
        );
    }

    if (retakeBtn) {
        retakeBtn.addEventListener(
            "click",
            retakePhoto
        );
    }

    if (saveBtn) {
        saveBtn.addEventListener(
            "click",
            savePhoto
        );
    }


    document.addEventListener(
        "visibilitychange",
        handleVisibilityChange
    );

    window.addEventListener(
        "pageshow",
        handlePageShow
    );

    window.addEventListener(
        "beforeunload",
        cleanup
    );

    window.addEventListener(
        "pagehide",
        cleanup
    );
}

function toggleFrameLayer(event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }

    frameLayerMode =
        frameLayerMode === "front"
            ? "behind"
            : "front";

    updateFrameLayerToggle();
    requestLivePreviewRefresh();
}

function requestLivePreviewRefresh() {
    latestPreviewReady = false;
    livePreviewGeneration += 1;

    if (livePreviewTimer !== null) {
        window.clearTimeout(livePreviewTimer);
        livePreviewTimer = null;
    }

    if (!livePreviewRunning) {
        return;
    }

    const scheduleRefresh = () => {
        if (livePreviewRunning) {
            scheduleLivePreview(0);
        }
    };

    if (livePreviewProcessing) {
        livePreviewFramePromise.then(
            scheduleRefresh,
            scheduleRefresh
        );
    } else {
        scheduleRefresh();
    }
}

function updateFrameLayerToggle() {
    if (!layerToggleBtn || !layerToggleLabel) {
        return;
    }

    const isBehind = frameLayerMode === "behind";

    layerToggleBtn.classList.toggle(
        "is-behind",
        isBehind
    );

    layerToggleBtn.setAttribute(
        "aria-pressed",
        String(isBehind)
    );

    layerToggleBtn.setAttribute(
        "aria-label",
        isBehind
            ? "人物より後ろに表示"
            : "人物より前に表示"
    );

    layerToggleLabel.textContent =
        isBehind ? "後ろ" : "前";
}

async function handleVisibilityChange() {
    if (document.visibilityState !== "visible") {
        return;
    }

    if (!currentStream && !cameraStarting) {
        await startCamera();
    }
}

async function handlePageShow() {
    if (!currentStream && !cameraStarting) {
        await startCamera();
    }
}

/* =========================
   Camera
========================= */

function updateCameraMirror() {
    if (!cameraVideo) {
        return;
    }

    if (facingMode === "user") {
        cameraVideo.style.transform =
            "translate(-50%, -50%) scaleX(-1)";
    } else {
        cameraVideo.style.transform =
            "translate(-50%, -50%) scaleX(1)";
    }
}

async function startCamera() {
    if (!cameraVideo) {
        return;
    }

    if (cameraStarting) {
        return;
    }

    cameraStarting = true;

    stopCamera();

    try {
        if (
            !navigator.mediaDevices ||
            !navigator.mediaDevices.getUserMedia
        ) {
            throw new Error(
                "getUserMedia is not supported"
            );
        }

        const constraints = {
            video: {
                facingMode: {
                    ideal: facingMode
                },

                width: {
                    ideal: FRAME_WIDTH
                },

                height: {
                    ideal: FRAME_HEIGHT
                },

                aspectRatio: {
                    ideal: 16 / 9
                },

                frameRate: {
                    ideal: 30,
                    max: 30
                }
            },

            audio: false
        };

        const stream =
            await navigator.mediaDevices.getUserMedia(
                constraints
            );

        currentStream = stream;

        cameraVideo.srcObject = currentStream;
        cameraVideo.muted = true;
        cameraVideo.autoplay = true;

        cameraVideo.setAttribute(
            "playsinline",
            ""
        );

        cameraVideo.setAttribute(
            "webkit-playsinline",
            ""
        );

        await cameraVideo.play();

        await waitForVideoReady(cameraVideo);

        updateCameraMirror();

        startLivePreview();

        const track =
            currentStream.getVideoTracks()[0];

        if (track) {
            console.log(
                "Camera settings:",
                track.getSettings()
            );

            track.addEventListener("ended", () => {
                currentStream = null;

                if (
                    document.visibilityState === "visible" &&
                    !cameraStarting &&
                    !cameraSwitching
                ) {
                    startCamera();
                }
            });
        }
    } catch (error) {
        console.error(
            "Camera error:",
            error
        );

        currentStream = null;

        let message =
            "カメラを起動できませんでした";

        if (error.name === "NotAllowedError") {
            message =
                "カメラの使用を許可してください";
        } else if (error.name === "NotFoundError") {
            message =
                "カメラが見つかりませんでした";
        } else if (error.name === "NotReadableError") {
            message =
                "カメラを使用できませんでした";
        }

        alert(message);
    } finally {
        cameraStarting = false;
    }
}

function stopCamera() {
    stopLivePreview();

    if (cameraVideo) {
        cameraVideo.pause();
        cameraVideo.srcObject = null;
    }

    if (currentStream) {
        currentStream
            .getTracks()
            .forEach((track) => {
                track.stop();
            });
    }

    currentStream = null;
}

async function switchCamera() {
    if (
        cameraStarting ||
        cameraSwitching ||
        captureInProgress
    ) {
        return;
    }

    cameraSwitching = true;

    facingMode =
        facingMode === "user"
            ? "environment"
            : "user";

    try {
        stopCamera();

        await wait(200);

        await startCamera();
    } finally {
        cameraSwitching = false;
    }
}

function waitForVideoReady(video) {
    return new Promise((resolve, reject) => {
        if (
            video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
            video.videoWidth > 0 &&
            video.videoHeight > 0
        ) {
            resolve();
            return;
        }

        const timeout = window.setTimeout(() => {
            cleanupListeners();

            reject(
                new Error("Camera video did not become ready")
            );
        }, 5000);

        function handleReady() {
            if (
                video.videoWidth > 0 &&
                video.videoHeight > 0
            ) {
                cleanupListeners();
                resolve();
            }
        }

        function handleError() {
            cleanupListeners();

            reject(
                new Error("Camera video failed")
            );
        }

        function cleanupListeners() {
            window.clearTimeout(timeout);

            video.removeEventListener(
                "loadedmetadata",
                handleReady
            );

            video.removeEventListener(
                "canplay",
                handleReady
            );

            video.removeEventListener(
                "error",
                handleError
            );
        }

        video.addEventListener(
            "loadedmetadata",
            handleReady
        );

        video.addEventListener(
            "canplay",
            handleReady
        );

        video.addEventListener(
            "error",
            handleError
        );
    });
}

/* =========================
   Frame Panel
========================= */

function openFramePanel() {
    if (!framePanel) {
        return;
    }

    framePanel.classList.remove("hidden");
}

function closeFramePanel() {
    if (!framePanel) {
        return;
    }

    framePanel.classList.add("hidden");
}

async function selectFrame(frame, button) {
    resetFrameTransform();
    selectedFrame = frame.full;
    selectedFrameReady = false;
    selectedBackgroundImage = null;
    latestPreviewReady = false;

    document
        .querySelectorAll(".frame-btn")
        .forEach((btn) => {
            btn.classList.remove("selected");
        });

    button.classList.add("selected");
    button.disabled = true;

    try {
        selectedBackgroundImage =
            await loadImage(frame.full);

        selectedFrameReady = true;

        /*
         * Não existe foreground.
         * Por isso, escondemos a imagem sobre a câmera.
         */
        if (selectedPhotoFrame) {
            selectedPhotoFrame.src = frame.full;
            selectedPhotoFrame.style.display = "none";
        }

        closeFramePanel();
        requestLivePreviewRefresh();
    } catch (error) {
        console.error(
            "Background load error:",
            error
        );

        selectedFrame = null;
        selectedFrameReady = false;
        selectedBackgroundImage = null;

        button.classList.remove("selected");

        alert("フレームを読み込めませんでした");
    } finally {
        button.disabled = false;
    }
}

/* =========================
   MediaPipe
========================= */

function initializeSelfieSegmentation() {
    if (typeof SelfieSegmentation === "undefined") {
        console.error(
            "MediaPipe SelfieSegmentation not loaded"
        );

        return;
    }

    selfieSegmentation =
        new SelfieSegmentation({
            locateFile: (file) => {
                return (
                    "https://cdn.jsdelivr.net/npm/" +
                    "@mediapipe/selfie_segmentation/" +
                    file
                );
            }
        });

    selfieSegmentation.setOptions({
        // The general model has a denser square input and preserves
        // face/hair edges better than the landscape model, especially
        // against bright or low-contrast backgrounds.
        modelSelection: 0,
        selfieMode: false
    });

    selfieSegmentation.onResults(
        handleSegmentationResults
    );

    segmentationReady = true;
}

function handleSegmentationResults(results) {
    if (segmentationTimeout) {
        window.clearTimeout(
            segmentationTimeout
        );

        segmentationTimeout = null;
    }

    if (!segmentationResolve) {
        return;
    }

    const resolve =
        segmentationResolve;

    segmentationResolve = null;
    segmentationReject = null;

    resolve(results);
}

function segmentCurrentCameraFrame() {
    return new Promise((resolve, reject) => {
        if (
            !selfieSegmentation ||
            !segmentationReady
        ) {
            reject(
                new Error(
                    "Segmentation unavailable"
                )
            );

            return;
        }

        segmentationResolve = resolve;
        segmentationReject = reject;

        segmentationTimeout =
            window.setTimeout(() => {
                segmentationResolve = null;
                segmentationReject = null;
                segmentationTimeout = null;

                reject(
                    new Error(
                        "Segmentation timeout"
                    )
                );
            }, 12000);

        selfieSegmentation
            .send({
                image: cameraVideo
            })
            .catch((error) => {
                if (segmentationTimeout) {
                    window.clearTimeout(
                        segmentationTimeout
                    );

                    segmentationTimeout = null;
                }

                segmentationResolve = null;
                segmentationReject = null;

                reject(error);
            });
    });
}

function createPersonCutout(results) {
    if (
        !personContext ||
        !personMaskContext ||
        !results ||
        !results.segmentationMask
    ) {
        throw new Error(
            "Invalid segmentation result"
        );
    }

    personCanvas.width =
        FRAME_WIDTH;

    personCanvas.height =
        FRAME_HEIGHT;

    personMaskCanvas.width =
        FRAME_WIDTH;

    personMaskCanvas.height =
        FRAME_HEIGHT;

    personMaskContext.clearRect(
        0,
        0,
        FRAME_WIDTH,
        FRAME_HEIGHT
    );

    personMaskContext.save();
    personMaskContext.filter =
        `blur(${PERSON_MASK_FEATHER}px)`;

    const maskOffsets = [
        [0, 0],
        [-PERSON_MASK_EXPANSION, 0],
        [PERSON_MASK_EXPANSION, 0],
        [0, -PERSON_MASK_EXPANSION],
        [0, PERSON_MASK_EXPANSION]
    ];

    maskOffsets.forEach(([offsetX, offsetY]) => {
        personMaskContext.save();
        personMaskContext.translate(offsetX, offsetY);

        drawCover(
            personMaskContext,
            results.segmentationMask,
            FRAME_WIDTH,
            FRAME_HEIGHT,
            facingMode === "user"
        );

        personMaskContext.restore();
    });

    personMaskContext.restore();

    personContext.clearRect(
        0,
        0,
        FRAME_WIDTH,
        FRAME_HEIGHT
    );

    personContext.save();

    /*
     * Desenha a máscara da pessoa.
     */
    personContext.drawImage(
        personMaskCanvas,
        0,
        0,
        FRAME_WIDTH,
        FRAME_HEIGHT
    );

    /*
     * Mantém a câmera somente dentro da máscara.
     */
    personContext.globalCompositeOperation =
        "source-in";

    drawCover(
        personContext,
        results.image || cameraVideo,
        FRAME_WIDTH,
        FRAME_HEIGHT,
        facingMode === "user"
    );

    /*
     * Volta ao modo normal.
     */
    personContext.globalCompositeOperation =
        "source-over";

    personContext.restore();
}


function loadImage(source) {
    return new Promise((resolve, reject) => {
        const image = new Image();

        image.onload = () => {
            resolve(image);
        };

        image.onerror = () => {
            reject(
                new Error(
                    `Could not load: ${source}`
                )
            );
        };

        image.src = source;
    });
}

/* =========================
   Canvas Drawing
========================= */

function drawCover(
    ctx,
    image,
    canvasWidth,
    canvasHeight,
    mirror = false
) {
    const imageWidth =
        image.videoWidth ||
        image.naturalWidth ||
        image.width;

    const imageHeight =
        image.videoHeight ||
        image.naturalHeight ||
        image.height;

    if (!imageWidth || !imageHeight) {
        throw new Error(
            "Invalid image dimensions"
        );
    }

    const scale = Math.max(
        canvasWidth / imageWidth,
        canvasHeight / imageHeight
    );

    const drawWidth =
        imageWidth * scale;

    const drawHeight =
        imageHeight * scale;

    const offsetX =
        (canvasWidth - drawWidth) / 2;

    const offsetY =
        (canvasHeight - drawHeight) / 2;

    ctx.save();

    if (mirror) {
        ctx.translate(canvasWidth, 0);
        ctx.scale(-1, 1);

        ctx.drawImage(
            image,
            offsetX,
            offsetY,
            drawWidth,
            drawHeight
        );
    } else {
        ctx.drawImage(
            image,
            offsetX,
            offsetY,
            drawWidth,
            drawHeight
        );
    }

    ctx.restore();
}

/* =========================
   Capture
========================= */

async function capturePhoto() {
    if (captureInProgress) {
        return;
    }

    if (!currentStream) {
        await startCamera();
        return;
    }

    if (
        !cameraVideo ||
        cameraVideo.readyState <
            HTMLMediaElement.HAVE_CURRENT_DATA ||
        !cameraVideo.videoWidth ||
        !cameraVideo.videoHeight
    ) {
        alert("カメラの準備ができていません");
        return;
    }

    if (!selectedFrame) {
        openFramePanel();
        return;
    }

    if (
    !selectedFrameReady ||
    !selectedBackgroundImage
    ) {
        openFramePanel();
        return;
    }

    if (
        !captureCanvas ||
        !previewImage ||
        !previewArea
    ) {
        return;
    }

    captureInProgress = true;

    if (captureBtn) {
        captureBtn.disabled = true;
    }

    try {
        await waitForAnimationFrame();
        await waitForAnimationFrame();

        captureCanvas.width =
            FRAME_WIDTH;

        captureCanvas.height =
            FRAME_HEIGHT;

        const ctx =
            captureCanvas.getContext(
                "2d",
                {
                    alpha: false
                }
            );

        if (!ctx) {
            throw new Error(
                "Canvas context unavailable"
            );
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";

        ctx.clearRect(
            0,
            0,
            FRAME_WIDTH,
            FRAME_HEIGHT
        );

        await waitForLivePreviewFrame();

        if (!latestPreviewReady) {
            throw new Error("Live preview is not ready");
        }

        // Freeze the exact composited frame currently shown to the user.
        ctx.drawImage(
            livePreviewCanvas,
            0,
            0,
            FRAME_WIDTH,
            FRAME_HEIGHT
        );

        const blob = await canvasToBlob(
            captureCanvas,
            "image/png"
        );

        if (!blob) {
            throw new Error(
                "Could not create preview image"
            );
        }

        capturedPhotoBlob = blob;

        revokePreviewObjectUrl();

        previewObjectUrl =
            URL.createObjectURL(blob);

        await loadPreviewImage(
            previewImage,
            previewObjectUrl
        );

        previewArea.classList.remove(
            "hidden"
        );
    } catch (error) {
        console.error(
            "Capture error:",
            error
        );

        alert("画像を作成できませんでした");
    } finally {
        captureInProgress = false;

        if (captureBtn) {
            captureBtn.disabled = false;
        }
    }
}

function retakePhoto() {
    if (!previewArea) {
        return;
    }

    previewArea.classList.add("hidden");

    if (previewImage) {
        if (
            previewImage.src &&
            previewImage.src.startsWith("blob:")
        ) {
            URL.revokeObjectURL(
                previewImage.src
            );
        }

        previewImage.removeAttribute("src");
    }

    capturedPhotoBlob = null;
}
/* =========================
   Save
========================= */

async function savePhoto() {
    if (!capturedPhotoBlob) {
        alert("保存する画像がありません");
        return;
    }

    if (saveBtn) {
        saveBtn.disabled = true;
    }

    const file = new File(
        [capturedPhotoBlob],
        "photo-frame.png",
        {
            type: "image/png",
            lastModified: Date.now()
        }
    );

    let saveCompleted = false;

    try {
        if (
            navigator.share &&
            navigator.canShare &&
            navigator.canShare({
                files: [file]
            })
        ) {
            await navigator.share({
                files: [file],
                title: "フォトフレーム"
            });

            saveCompleted = true;
            return;
        }

        downloadImage(capturedPhotoBlob);
        saveCompleted = true;
    } catch (error) {
        if (error.name === "AbortError") {
            return;
        }

        console.error(
            "Save/share error:",
            error
        );

        downloadImage(capturedPhotoBlob);
        saveCompleted = true;
    } finally {
        if (saveCompleted) {
            retakePhoto();
            revokePreviewObjectUrl();
            closeFramePanel();
        }
        if (saveBtn) {
            saveBtn.disabled = false;
        }
    }
}


function downloadImage(blob) {
    const url =
        URL.createObjectURL(blob);

    const link =
        document.createElement("a");

    link.href = url;
    link.download =
        "photo-frame.png";

    document.body.appendChild(link);

    link.click();
    link.remove();

    window.setTimeout(() => {
        URL.revokeObjectURL(url);
    }, 1000);
}

/* =========================
   Utilities
========================= */

function wait(milliseconds) {
    return new Promise((resolve) => {
        window.setTimeout(
            resolve,
            milliseconds
        );
    });
}

function waitForAnimationFrame() {
    return new Promise((resolve) => {
        window.requestAnimationFrame(() => {
            resolve();
        });
    });
}

function canvasToBlob(
    canvas,
    type = "image/png",
    quality
) {
    return new Promise((resolve) => {
        canvas.toBlob(
            (blob) => {
                resolve(blob);
            },
            type,
            quality
        );
    });
}

function loadPreviewImage(
    imageElement,
    source
) {
    return new Promise((resolve, reject) => {
        imageElement.onload = () => {
            imageElement.onload = null;
            imageElement.onerror = null;

            resolve();
        };

        imageElement.onerror = () => {
            imageElement.onload = null;
            imageElement.onerror = null;

            reject(
                new Error(
                    "Preview image failed to load"
                )
            );
        };

        imageElement.src = source;
    });
}

function revokePreviewObjectUrl() {
    if (!previewObjectUrl) {
        return;
    }

    URL.revokeObjectURL(
        previewObjectUrl
    );

    previewObjectUrl = null;
}

function cleanup() {
    stopCamera();

    revokePreviewObjectUrl();

    if (segmentationTimeout) {
        clearTimeout(segmentationTimeout);
        segmentationTimeout = null;
    }

    segmentationResolve = null;
    segmentationReject = null;

    if (
        selfieSegmentation &&
        typeof selfieSegmentation.close === "function"
    ) {
        selfieSegmentation.close();
    }

    selfieSegmentation = null;
    segmentationReady = false;

    capturedPhotoBlob = null;
}

async function waitForLivePreviewFrame() {
    const deadline = performance.now() + 3000;

    while (!latestPreviewReady) {
        try {
            await livePreviewFramePromise;
        } catch (error) {
            // The render loop will retry transient segmentation failures.
        }

        if (latestPreviewReady) {
            return;
        }

        if (performance.now() >= deadline) {
            throw new Error("Live preview frame timeout");
        }

        await wait(16);
    }
}

/* =========================
   Synchronized Live Preview
========================= */

function startLivePreview() {
    if (
        livePreviewRunning ||
        !livePreviewCanvas ||
        !livePreviewContext
    ) {
        return;
    }

    livePreviewCanvas.width = FRAME_WIDTH;
    livePreviewCanvas.height = FRAME_HEIGHT;
    livePreviewRunning = true;
    latestPreviewReady = false;

    scheduleLivePreview(0);
}

function stopLivePreview() {
    livePreviewRunning = false;
    latestPreviewReady = false;
    livePreviewGeneration += 1;

    if (livePreviewTimer !== null) {
        window.clearTimeout(livePreviewTimer);
        livePreviewTimer = null;
    }
}

function scheduleLivePreview(delay) {
    if (!livePreviewRunning) {
        return;
    }

    livePreviewTimer = window.setTimeout(
        renderLivePreview,
        delay
    );
}

async function renderLivePreview() {
    if (!livePreviewRunning) {
        return;
    }

    if (livePreviewProcessing) {
        scheduleLivePreview(LIVE_PREVIEW_INTERVAL);
        return;
    }

    const startedAt = performance.now();
    const generation = livePreviewGeneration;

    if (
        cameraVideo.readyState <
            HTMLMediaElement.HAVE_CURRENT_DATA ||
        !cameraVideo.videoWidth ||
        !cameraVideo.videoHeight
    ) {
        scheduleLivePreview(LIVE_PREVIEW_INTERVAL);
        return;
    }

    livePreviewProcessing = true;
    livePreviewFramePromise =
        composeLivePreviewFrame(generation);

    try {
        await livePreviewFramePromise;
        latestPreviewReady = true;
    } catch (error) {
        console.warn("Live preview error:", error);
    } finally {
        livePreviewProcessing = false;

        const elapsed = performance.now() - startedAt;
        const delay = Math.max(
            0,
            LIVE_PREVIEW_INTERVAL - elapsed
        );

        if (generation === livePreviewGeneration) {
            scheduleLivePreview(delay);
        }
    }
}

async function composeLivePreviewFrame(generation) {
    let cameraSource = cameraVideo;
    let segmentationResults = null;

    if (
        selectedFrameReady &&
        selectedBackgroundImage
    ) {
        segmentationResults =
            await segmentCurrentCameraFrame();

        if (generation !== livePreviewGeneration) {
            throw new Error("Stale live preview frame");
        }

        cameraSource =
            segmentationResults.image || cameraVideo;
    }

    livePreviewContext.clearRect(
        0,
        0,
        FRAME_WIDTH,
        FRAME_HEIGHT
    );

    // 1. Real camera background.
    drawCover(
        livePreviewContext,
        cameraSource,
        FRAME_WIDTH,
        FRAME_HEIGHT,
        facingMode === "user"
    );

    if (!segmentationResults) {
        return;
    }

    if (frameLayerMode === "behind") {
        // Character behind the person.
        drawTransformedFrame(livePreviewContext);

        createPersonCutout(segmentationResults);

        livePreviewContext.drawImage(
            personCanvas,
            0,
            0,
            FRAME_WIDTH,
            FRAME_HEIGHT
        );
    } else {
        // Character in front of the person.
        createPersonCutout(segmentationResults);

        livePreviewContext.drawImage(
            personCanvas,
            0,
            0,
            FRAME_WIDTH,
            FRAME_HEIGHT
        );

        drawTransformedFrame(livePreviewContext);
    }
}

