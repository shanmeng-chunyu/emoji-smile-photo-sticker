const canvas = document.querySelector("#editorCanvas");
const ctx = canvas.getContext("2d");
const stage = document.querySelector("#canvasStage");
const imageInput = document.querySelector("#imageInput");
const exportButton = document.querySelector("#exportButton");
const clearButton = document.querySelector("#clearButton");
const zoomOutButton = document.querySelector("#zoomOutButton");
const resetViewButton = document.querySelector("#resetViewButton");
const zoomInButton = document.querySelector("#zoomInButton");
const emptyState = document.querySelector("#emptyState");
const statusText = document.querySelector("#statusText");

const SMILEYS = [
  "😀",
  "😃",
  "😄",
  "😁",
  "😆",
  "😅",
  "😂",
  "🤣",
  "😊",
  "😇",
  "🙂",
  "🙃",
  "😉",
  "😌",
  "😍",
  "🥰",
  "😘",
  "😗",
  "😙",
  "😚",
  "😋",
  "😛",
  "😝",
  "😜",
  "🤪",
  "🤨",
  "🧐",
  "🤓",
  "😎",
  "🥸",
  "🤩",
  "🥳",
  "😏",
  "😒",
  "😬",
  "😮",
  "😯",
  "😲",
  "🥹",
  "🤗",
  "🤭",
  "🫢",
  "🫣",
  "🤫",
  "🫡",
  "🤤",
];

const DEFAULT_EMOJI_DISPLAY_SIZE = 72;
const MIN_EMOJI_DISPLAY_SIZE = 24;
const BOUNDS_RATIO = 1.16;
const HANDLE_SIZE = 9;
const HANDLE_HIT_SIZE = 14;
const BORDER_HIT_SIZE = 10;
const STAGE_PADDING = 28;
const MIN_ZOOM_RATIO = 0.25;
const MAX_ZOOM_RATIO = 12;

const state = {
  image: null,
  imageName: "",
  imageWidth: 0,
  imageHeight: 0,
  displayWidth: 0,
  displayHeight: 0,
  scale: 1,
  fitScale: 1,
  panX: 0,
  panY: 0,
  viewReady: false,
  dpr: Math.max(1, window.devicePixelRatio || 1),
  annotations: [],
  selectedId: null,
  lastEmoji: null,
  lastEmojiSize: null,
  drag: null,
};

function setStatus(text) {
  statusText.textContent = text;
}

function updateControls() {
  const hasImage = Boolean(state.image);
  exportButton.disabled = !hasImage;
  clearButton.disabled = !hasImage || state.annotations.length === 0;
  zoomOutButton.disabled = !hasImage;
  resetViewButton.disabled = !hasImage;
  zoomInButton.disabled = !hasImage;
  emptyState.classList.toggle("hidden", hasImage);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function randomIndex(max) {
  if (window.crypto?.getRandomValues) {
    const array = new Uint32Array(1);
    window.crypto.getRandomValues(array);
    return array[0] % max;
  }

  return Math.floor(Math.random() * max);
}

function pickEmoji() {
  const used = new Set(state.annotations.map((annotation) => annotation.emoji));
  let candidates = SMILEYS.filter((emoji) => !used.has(emoji));

  if (candidates.length === 0) {
    candidates = SMILEYS.filter((emoji) => emoji !== state.lastEmoji);
  }

  if (candidates.length === 0) {
    candidates = [...SMILEYS];
  }

  return candidates[randomIndex(candidates.length)];
}

function makeId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getSelectedAnnotation() {
  return state.annotations.find((annotation) => annotation.id === state.selectedId) || null;
}

function imageToCanvas(point) {
  return {
    x: state.panX + point.x * state.scale,
    y: state.panY + point.y * state.scale,
  };
}

function canvasToImage(point) {
  return {
    x: (point.x - state.panX) / state.scale,
    y: (point.y - state.panY) / state.scale,
  };
}

function isInsideImage(imagePoint) {
  return (
    imagePoint.x >= 0 &&
    imagePoint.x <= state.imageWidth &&
    imagePoint.y >= 0 &&
    imagePoint.y <= state.imageHeight
  );
}

function clampViewScale(scale) {
  const minScale = Math.max(0.01, state.fitScale * MIN_ZOOM_RATIO);
  const maxScale = Math.max(1, state.fitScale * MAX_ZOOM_RATIO);

  return clamp(scale, minScale, maxScale);
}

function clampPan() {
  if (!state.image) {
    return;
  }

  const imageDisplayWidth = state.imageWidth * state.scale;
  const imageDisplayHeight = state.imageHeight * state.scale;

  if (imageDisplayWidth <= state.displayWidth) {
    state.panX = (state.displayWidth - imageDisplayWidth) / 2;
  } else {
    state.panX = clamp(state.panX, state.displayWidth - imageDisplayWidth, 0);
  }

  if (imageDisplayHeight <= state.displayHeight) {
    state.panY = (state.displayHeight - imageDisplayHeight) / 2;
  } else {
    state.panY = clamp(state.panY, state.displayHeight - imageDisplayHeight, 0);
  }
}

function resetView(redraw = true) {
  if (!state.image) {
    return;
  }

  state.scale = state.fitScale;
  state.panX = (state.displayWidth - state.imageWidth * state.scale) / 2;
  state.panY = (state.displayHeight - state.imageHeight * state.scale) / 2;
  state.viewReady = true;
  clampPan();

  if (redraw) {
    draw();
  }
}

function zoomAt(point, factor) {
  if (!state.image) {
    return;
  }

  const before = canvasToImage(point);
  const nextScale = clampViewScale(state.scale * factor);

  if (nextScale === state.scale) {
    return;
  }

  state.scale = nextScale;
  state.panX = point.x - before.x * state.scale;
  state.panY = point.y - before.y * state.scale;
  clampPan();
  draw();
}

function zoomFromCenter(factor) {
  zoomAt({ x: state.displayWidth / 2, y: state.displayHeight / 2 }, factor);
}

function imageStatusText() {
  if (!state.image) {
    return "未导入图片";
  }

  return `${state.imageName} · ${state.imageWidth} × ${state.imageHeight}px · ${state.annotations.length} 个 emoji · ${Math.round(state.scale * 100)}%`;
}

function fitCanvasToStage() {
  if (!state.image) {
    state.displayWidth = 1;
    state.displayHeight = 1;
    canvas.width = 1;
    canvas.height = 1;
    canvas.style.width = "0px";
    canvas.style.height = "0px";
    draw();
    return;
  }

  const previousCenter = state.viewReady
    ? canvasToImage({ x: state.displayWidth / 2, y: state.displayHeight / 2 })
    : null;

  state.displayWidth = Math.max(1, Math.round(stage.clientWidth));
  state.displayHeight = Math.max(1, Math.round(stage.clientHeight));
  state.dpr = Math.max(1, window.devicePixelRatio || 1);
  state.fitScale = clamp(
    Math.min(
      (state.displayWidth - STAGE_PADDING * 2) / state.imageWidth,
      (state.displayHeight - STAGE_PADDING * 2) / state.imageHeight,
    ),
    0.01,
    2.5,
  );

  canvas.width = Math.round(state.displayWidth * state.dpr);
  canvas.height = Math.round(state.displayHeight * state.dpr);
  canvas.style.width = `${state.displayWidth}px`;
  canvas.style.height = `${state.displayHeight}px`;

  if (!state.viewReady) {
    resetView(false);
  } else {
    state.scale = clampViewScale(state.scale);
    state.panX = state.displayWidth / 2 - previousCenter.x * state.scale;
    state.panY = state.displayHeight / 2 - previousCenter.y * state.scale;
    clampPan();
  }

  draw();
}

function drawAnnotation(targetCtx, annotation, scale, offsetX = 0, offsetY = 0) {
  const size = Math.max(1, annotation.size * scale);

  targetCtx.save();
  targetCtx.font = `normal ${size}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", "Twemoji Mozilla", sans-serif`;
  targetCtx.textAlign = "center";
  targetCtx.textBaseline = "middle";
  targetCtx.fillText(annotation.emoji, offsetX + annotation.x * scale, offsetY + annotation.y * scale);
  targetCtx.restore();
}

function getBounds(annotation, scale = state.scale) {
  const side = annotation.size * BOUNDS_RATIO * scale;
  const centerX = state.panX + annotation.x * scale;
  const centerY = state.panY + annotation.y * scale;

  return {
    left: centerX - side / 2,
    top: centerY - side / 2,
    right: centerX + side / 2,
    bottom: centerY + side / 2,
    width: side,
    height: side,
    centerX,
    centerY,
  };
}

function drawSelection(annotation) {
  const bounds = getBounds(annotation);
  const handles = getHandleCenters(bounds);

  ctx.save();
  ctx.strokeStyle = "#1d64d8";
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);
  ctx.strokeRect(bounds.left, bounds.top, bounds.width, bounds.height);
  ctx.setLineDash([]);

  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#1d64d8";
  ctx.lineWidth = 2;
  handles.forEach((handle) => {
    ctx.beginPath();
    ctx.rect(handle.x - HANDLE_SIZE / 2, handle.y - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE);
    ctx.fill();
    ctx.stroke();
  });
  ctx.restore();
}

function draw() {
  ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
  ctx.clearRect(0, 0, state.displayWidth, state.displayHeight);

  if (!state.image) {
    return;
  }

  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(
    state.image,
    state.panX,
    state.panY,
    state.imageWidth * state.scale,
    state.imageHeight * state.scale,
  );
  ctx.restore();

  state.annotations.forEach((annotation) => {
    drawAnnotation(ctx, annotation, state.scale, state.panX, state.panY);
  });

  const selected = getSelectedAnnotation();
  if (selected) {
    drawSelection(selected);
  }
}

function getCanvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * state.displayWidth;
  const y = ((event.clientY - rect.top) / rect.height) * state.displayHeight;

  return { x, y };
}

function isInsideCanvas(point) {
  return point.x >= 0 && point.x <= state.displayWidth && point.y >= 0 && point.y <= state.displayHeight;
}

function getHandleCenters(bounds) {
  return [
    { x: bounds.left, y: bounds.top },
    { x: bounds.right, y: bounds.top },
    { x: bounds.right, y: bounds.bottom },
    { x: bounds.left, y: bounds.bottom },
  ];
}

function hitHandle(bounds, point) {
  return getHandleCenters(bounds).some(
    (handle) =>
      Math.abs(point.x - handle.x) <= HANDLE_HIT_SIZE &&
      Math.abs(point.y - handle.y) <= HANDLE_HIT_SIZE,
  );
}

function hitBorder(bounds, point) {
  const inExpandedBox =
    point.x >= bounds.left - BORDER_HIT_SIZE &&
    point.x <= bounds.right + BORDER_HIT_SIZE &&
    point.y >= bounds.top - BORDER_HIT_SIZE &&
    point.y <= bounds.bottom + BORDER_HIT_SIZE;

  if (!inExpandedBox) {
    return false;
  }

  return (
    Math.abs(point.x - bounds.left) <= BORDER_HIT_SIZE ||
    Math.abs(point.x - bounds.right) <= BORDER_HIT_SIZE ||
    Math.abs(point.y - bounds.top) <= BORDER_HIT_SIZE ||
    Math.abs(point.y - bounds.bottom) <= BORDER_HIT_SIZE
  );
}

function hitInside(bounds, point) {
  return point.x >= bounds.left && point.x <= bounds.right && point.y >= bounds.top && point.y <= bounds.bottom;
}

function hitSelectedBorder(point) {
  const selected = getSelectedAnnotation();
  if (!selected) {
    return null;
  }

  const bounds = getBounds(selected);
  if (hitHandle(bounds, point) || hitBorder(bounds, point)) {
    return { annotation: selected, kind: "resize" };
  }

  return null;
}

function hitAnnotation(point) {
  for (let i = state.annotations.length - 1; i >= 0; i -= 1) {
    const annotation = state.annotations[i];
    const bounds = getBounds(annotation);

    if (hitInside(bounds, point)) {
      return { annotation, kind: "move" };
    }
  }

  return null;
}

function loadImageFile(file) {
  if (!file) {
    return;
  }

  const url = URL.createObjectURL(file);
  const image = new Image();

  image.onload = () => {
    URL.revokeObjectURL(url);
    state.image = image;
    state.imageName = file.name || "image";
    state.imageWidth = image.naturalWidth;
    state.imageHeight = image.naturalHeight;
    state.annotations = [];
    state.selectedId = null;
    state.lastEmoji = null;
    state.lastEmojiSize = null;
    state.panX = 0;
    state.panY = 0;
    state.viewReady = false;

    updateControls();
    fitCanvasToStage();
    setStatus(imageStatusText());
  };

  image.onerror = () => {
    URL.revokeObjectURL(url);
    setStatus("图片读取失败");
  };

  image.src = url;
}

function addEmojiAt(point) {
  const emoji = pickEmoji();
  const imagePoint = canvasToImage(point);

  if (!isInsideImage(imagePoint)) {
    setStatus("请在图片范围内右键添加 emoji");
    return;
  }

  const size = state.lastEmojiSize || DEFAULT_EMOJI_DISPLAY_SIZE / state.scale;
  const annotation = {
    id: makeId(),
    emoji,
    x: imagePoint.x,
    y: imagePoint.y,
    size,
  };

  state.annotations.push(annotation);
  state.selectedId = annotation.id;
  state.lastEmoji = emoji;
  updateControls();
  setStatus(imageStatusText());
  draw();
}

function startMove(annotation, point, pointerId) {
  state.drag = {
    kind: "move",
    id: annotation.id,
    pointerId,
    startPoint: point,
    startX: annotation.x,
    startY: annotation.y,
  };
}

function startResize(annotation, point, pointerId) {
  const bounds = getBounds(annotation);
  const distance = Math.max(
    Math.abs(point.x - bounds.centerX),
    Math.abs(point.y - bounds.centerY),
    (annotation.size * BOUNDS_RATIO * state.scale) / 2,
  );

  state.drag = {
    kind: "resize",
    id: annotation.id,
    pointerId,
    centerX: bounds.centerX,
    centerY: bounds.centerY,
    startDistance: distance,
  };
}

function startPan(point, pointerId) {
  state.drag = {
    kind: "pan",
    pointerId,
    startPoint: point,
    startPanX: state.panX,
    startPanY: state.panY,
  };
}

function updateDrag(point) {
  if (!state.drag) {
    return;
  }

  if (state.drag.kind === "pan") {
    state.panX = state.drag.startPanX + point.x - state.drag.startPoint.x;
    state.panY = state.drag.startPanY + point.y - state.drag.startPoint.y;
    clampPan();
    draw();
    return;
  }

  const annotation = state.annotations.find((item) => item.id === state.drag.id);
  if (!annotation) {
    state.drag = null;
    return;
  }

  if (state.drag.kind === "move") {
    const deltaX = (point.x - state.drag.startPoint.x) / state.scale;
    const deltaY = (point.y - state.drag.startPoint.y) / state.scale;
    annotation.x = clamp(state.drag.startX + deltaX, 0, state.imageWidth);
    annotation.y = clamp(state.drag.startY + deltaY, 0, state.imageHeight);
  }

  if (state.drag.kind === "resize") {
    const distance = Math.max(Math.abs(point.x - state.drag.centerX), Math.abs(point.y - state.drag.centerY));
    const maxDisplaySize = Math.max(state.displayWidth, state.displayHeight) * 2;
    const displaySize = clamp((distance * 2) / BOUNDS_RATIO, MIN_EMOJI_DISPLAY_SIZE, maxDisplaySize);
    annotation.size = displaySize / state.scale;
    state.lastEmojiSize = annotation.size;
  }

  draw();
}

function updateCursor(event) {
  if (state.drag) {
    if (state.drag.kind === "resize") {
      canvas.style.cursor = "nwse-resize";
    } else if (state.drag.kind === "pan") {
      canvas.style.cursor = "grabbing";
    } else {
      canvas.style.cursor = "move";
    }
    return;
  }

  if (!state.image) {
    canvas.style.cursor = "default";
    return;
  }

  const point = getCanvasPoint(event);
  const borderHit = hitSelectedBorder(point);
  if (borderHit) {
    canvas.style.cursor = "nwse-resize";
    return;
  }

  const annotationHit = hitAnnotation(point);
  canvas.style.cursor = annotationHit ? "move" : "grab";
}

function finishDrag() {
  if (!state.drag) {
    return;
  }

  const annotation = state.annotations.find((item) => item.id === state.drag.id);
  if (annotation && state.drag.kind === "resize") {
    state.lastEmojiSize = annotation.size;
  }

  state.drag = null;
  setStatus(imageStatusText());
  draw();
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportEditedImage() {
  if (!state.image) {
    return;
  }

  const output = document.createElement("canvas");
  output.width = state.imageWidth;
  output.height = state.imageHeight;

  const outputCtx = output.getContext("2d");
  outputCtx.imageSmoothingEnabled = true;
  outputCtx.imageSmoothingQuality = "high";
  outputCtx.drawImage(state.image, 0, 0, state.imageWidth, state.imageHeight);
  state.annotations.forEach((annotation) => {
    drawAnnotation(outputCtx, annotation, 1);
  });

  const baseName = state.imageName.replace(/\.[^.]+$/, "") || "image";
  output.toBlob((blob) => {
    if (blob) {
      downloadBlob(blob, `${baseName}-emoji.png`);
      setStatus(`已导出 ${state.imageWidth} × ${state.imageHeight}px`);
      return;
    }

    const link = document.createElement("a");
    link.href = output.toDataURL("image/png");
    link.download = `${baseName}-emoji.png`;
    document.body.append(link);
    link.click();
    link.remove();
    setStatus(`已导出 ${state.imageWidth} × ${state.imageHeight}px`);
  }, "image/png");
}

imageInput.addEventListener("change", (event) => {
  loadImageFile(event.target.files?.[0]);
  event.target.value = "";
});

exportButton.addEventListener("click", exportEditedImage);

clearButton.addEventListener("click", () => {
  state.annotations = [];
  state.selectedId = null;
  updateControls();
  setStatus(imageStatusText());
  draw();
});

zoomOutButton.addEventListener("click", () => {
  zoomFromCenter(0.82);
  setStatus(imageStatusText());
});

zoomInButton.addEventListener("click", () => {
  zoomFromCenter(1.22);
  setStatus(imageStatusText());
});

resetViewButton.addEventListener("click", () => {
  resetView();
  setStatus(imageStatusText());
});

canvas.addEventListener("contextmenu", (event) => {
  event.preventDefault();

  if (!state.image) {
    setStatus("请先导入图片");
    return;
  }

  const point = getCanvasPoint(event);
  if (!isInsideCanvas(point)) {
    return;
  }

  addEmojiAt(point);
});

canvas.addEventListener(
  "wheel",
  (event) => {
    if (!state.image) {
      return;
    }

    event.preventDefault();
    const point = getCanvasPoint(event);
    const factor = Math.exp(-event.deltaY * 0.0015);
    zoomAt(point, factor);
    setStatus(imageStatusText());
  },
  { passive: false },
);

canvas.addEventListener("pointerdown", (event) => {
  if (event.button !== 0 || !state.image) {
    return;
  }

  const point = getCanvasPoint(event);
  const resizeHit = hitSelectedBorder(point);
  const hit = resizeHit || hitAnnotation(point);

  if (!hit) {
    event.preventDefault();
    state.selectedId = null;
    startPan(point, event.pointerId);
    canvas.setPointerCapture(event.pointerId);
    draw();
    return;
  }

  event.preventDefault();
  state.selectedId = hit.annotation.id;

  if (hit.kind === "resize") {
    startResize(hit.annotation, point, event.pointerId);
  } else {
    startMove(hit.annotation, point, event.pointerId);
  }

  canvas.setPointerCapture(event.pointerId);
  draw();
});

canvas.addEventListener("pointermove", (event) => {
  const point = getCanvasPoint(event);

  if (state.drag) {
    event.preventDefault();
    updateDrag(point);
    return;
  }

  updateCursor(event);
});

canvas.addEventListener("pointerup", (event) => {
  if (state.drag?.pointerId === event.pointerId) {
    canvas.releasePointerCapture(event.pointerId);
    finishDrag();
  }
});

canvas.addEventListener("pointercancel", (event) => {
  if (state.drag?.pointerId === event.pointerId) {
    finishDrag();
  }
});

document.addEventListener("keydown", (event) => {
  if (!state.selectedId || (event.key !== "Delete" && event.key !== "Backspace")) {
    return;
  }

  const before = state.annotations.length;
  state.annotations = state.annotations.filter((annotation) => annotation.id !== state.selectedId);

  if (state.annotations.length !== before) {
    state.selectedId = null;
    updateControls();
    setStatus(imageStatusText());
    draw();
  }
});

if ("ResizeObserver" in window) {
  const resizeObserver = new ResizeObserver(fitCanvasToStage);
  resizeObserver.observe(stage);
} else {
  window.addEventListener("resize", fitCanvasToStage);
}

updateControls();
fitCanvasToStage();
