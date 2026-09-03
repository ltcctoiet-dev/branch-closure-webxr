/**
 * Pre and post survey for the Banking Hub POV.
 *
 * The same questions are asked before entering and again at the end, so the
 * difference shows what the journey changed. The wording must stay identical
 * between the two — change a word and the comparison means nothing.
 *
 * Spoken by the avatar and shown on a panel at the same time. Answers are
 * tapped rather than spoken: quicker, and no risk of mis-hearing a number.
 */

import {
  DynamicTexture,
  Mesh,
  MeshBuilder,
  Scene,
  StandardMaterial,
  TransformNode,
} from "@babylonjs/core";

// ---------------------------------------------------------------------------
// Questions
// ---------------------------------------------------------------------------

type SurveyQuestion = {
  text: string;
  options: string[];
  /** Scale questions are the ones compared before and after. */
  scale?: "concern" | "confidence";
  /** Only meaningful once they have been through the experience. */
  postOnly?: boolean;
};

// Six points rather than eleven: twice the button size, easier to hit with a
// controller ray, and easier for an older customer to answer.
const SCALE = ["0", "2", "4", "6", "8", "10"];

const SURVEY: SurveyQuestion[] = [
  {
    text: "How concerned do you feel about your local branch closing?",
    options: SCALE,
    scale: "concern",
  },
  {
    text: "How confident are you that you know where to go after the branch closes?",
    options: SCALE,
    scale: "confidence",
  },
  {
    text: "How confident are you using mobile banking for simple tasks?",
    options: SCALE,
    scale: "confidence",
  },
  {
    text: "Do you understand which services are available at a Banking Hub, Post Office, or through mobile banking?",
    options: ["Yes", "Partly", "No", "I need more help"],
  },
  {
    text: "Would you still like help from a colleague?",
    options: ["Yes", "No", "Not sure"],
    postOnly: true,
  },
];

/** Short labels for the results panel, in the same order as the scale questions. */
const RESULT_LABELS = [
  "Concern about closure",
  "Knowing where to go",
  "Confidence with the app",
];

const PANEL = {
  yaw: 0, // straight ahead
  pitch: -8,
  distance: 2.6,
  width: 2.8,
};

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

type SurveyDeps = {
  scene: Scene;
  /** Everything is parented here so it follows the head rig. */
  world: TransformNode;
  speak: (text: string) => void;
};

let deps: SurveyDeps | null = null;

export function initSurvey(dependencies: SurveyDeps) {
  deps = dependencies;
}

export type SurveyPhase = "pre" | "post";

export const surveyResults: Record<SurveyPhase, string[]> = {
  pre: [],
  post: [],
};

let phase: SurveyPhase = "pre";
let questions: SurveyQuestion[] = [];
let index = -1;
let meshes: Mesh[] = [];
let optionButtons: { mesh: Mesh; option: string; width: number }[] = [];
let onComplete: (() => void) | null = null;

export const isSurveyActive = () => index >= 0;

/** Call from the pointer-move handler so buttons respond to the controller ray. */
export function highlightSurveyHover(mesh: any) {
  if (index < 0) return;

  optionButtons.forEach((entry) => {
    if (!entry.mesh.isPickable) return;
    const wanted = entry.mesh === mesh ? BUTTON_HOVER : BUTTON_IDLE;
    if ((entry.mesh as any)._paint === wanted) return;
    (entry.mesh as any)._paint = wanted;
    repaintButton(entry, wanted);
  });
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

// Background image behind the cards. Set to null for the plain dark fill.
const BACKGROUND = "/images/panel-bg.jpg";

// Overall card opacity. 0.6 lets the hub show through behind them.
const PANEL_ALPHA = 0.6;

let backgroundImage: HTMLImageElement | null = null;
let backgroundReady = false;

if (BACKGROUND) {
  const img = new Image();
  img.onload = () => {
    backgroundImage = img;
    backgroundReady = true;
  };
  img.onerror = () => console.warn("Panel background failed to load:", BACKGROUND);
  img.src = BACKGROUND;
}

const BUTTON_IDLE = "rgba(8,40,52,0.28)";
const BUTTON_HOVER = "rgba(22,86,104,0.45)";
const BUTTON_CHOSEN = "rgba(244,168,54,0.97)";

function clearMeshes() {
  meshes.forEach((m) => m.dispose(false, true));
  meshes = [];
  optionButtons = [];
}

/** Swaps a button's background without moving or re-parenting it. */
function repaintButton(entry: { mesh: Mesh; option: string; width: number }, background: string) {
  const material = entry.mesh.material as StandardMaterial | null;
  const old = material?.diffuseTexture;

  const texture = makeCardTexture(entry.option, entry.width, 0.34, 0.45, background);

  if (material) {
    material.diffuseTexture = texture;
    material.emissiveTexture = texture;
    material.opacityTexture = texture;
  }

  old?.dispose();
}

/** A card with wrapped, auto-sized white text on a dark background. */
function makeCardTexture(
  text: string,
  width: number,
  height: number,
  fontScale: number,
  background: string
): DynamicTexture {
  const { scene } = deps!;

  const texture = new DynamicTexture(
    "surveyTex",
    { width: 1024, height: Math.max(64, Math.round((1024 * height) / width)) },
    scene,
    true
  );

  const ctx = texture.getContext() as CanvasRenderingContext2D;
  const w = texture.getSize().width;
  const h = texture.getSize().height;

  ctx.clearRect(0, 0, w, h);
  // Background picture behind the card, darkened so the text still reads.
  if (backgroundReady && backgroundImage) {
    const scale = Math.max(w / backgroundImage.width, h / backgroundImage.height);
    const dw = backgroundImage.width * scale;
    const dh = backgroundImage.height * scale;
    ctx.drawImage(backgroundImage, (w - dw) / 2, (h - dh) / 2, dw, dh);
    ctx.fillStyle = "rgba(2,12,22,0.2)";
    ctx.fillRect(0, 0, w, h);
  }

  ctx.fillStyle = background;
  ctx.fillRect(0, 0, w, h);
  drawHudFrame(ctx, w, h);

  let fontSize = Math.floor(h * fontScale);
  const font = () => `bold ${fontSize}px system-ui, sans-serif`;
  ctx.font = font();

  const wrap = () => {
    const words = text.split(" ");
    const lines: string[] = [];
    let line = "";

    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > w * 0.9 && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }

    lines.push(line);
    return lines;
  };

  let lines = wrap();
  while (lines.length * fontSize * 1.3 > h * 0.9 && fontSize > 14) {
    fontSize -= 2;
    ctx.font = font();
    lines = wrap();
  }

  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(0,0,0,0.9)";
  ctx.shadowBlur = 14;

  const lineHeight = fontSize * 1.3;
  const top = h / 2 - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((l, i) => ctx.fillText(l, w / 2, top + i * lineHeight));
  ctx.shadowBlur = 0;

  texture.update();
  return texture;
}


/**
 * A HUD-style frame: corner brackets, a thin glowing edge, and a faint grid.
 * Drawn onto the card's canvas after the background fill.
 */
function drawHudFrame(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  accent = "#4fd8e8"
) {
  const inset = Math.max(4, h * 0.06);
  const bracket = Math.min(w, h) * 0.18;

  // Faint grid, so the panel reads as a display rather than a card.
  ctx.save();
  ctx.strokeStyle = accent;
  ctx.globalAlpha = 0.08;
  ctx.lineWidth = 1;
  const step = Math.max(24, h / 8);
  for (let x = inset; x < w - inset; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, inset);
    ctx.lineTo(x, h - inset);
    ctx.stroke();
  }
  for (let y = inset; y < h - inset; y += step) {
    ctx.beginPath();
    ctx.moveTo(inset, y);
    ctx.lineTo(w - inset, y);
    ctx.stroke();
  }
  ctx.restore();

  // Thin outer edge.
  ctx.save();
  ctx.strokeStyle = accent;
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = 2;
  ctx.strokeRect(inset, inset, w - inset * 2, h - inset * 2);
  ctx.restore();

  // Corner brackets, glowing.
  ctx.save();
  ctx.strokeStyle = accent;
  ctx.lineWidth = Math.max(3, h * 0.035);
  ctx.lineCap = "square";
  ctx.shadowColor = accent;
  ctx.shadowBlur = 18;

  const corners: [number, number, number, number][] = [
    [inset, inset, 1, 1],
    [w - inset, inset, -1, 1],
    [inset, h - inset, 1, -1],
    [w - inset, h - inset, -1, -1],
  ];

  for (const [x, y, dx, dy] of corners) {
    ctx.beginPath();
    ctx.moveTo(x + dx * bracket, y);
    ctx.lineTo(x, y);
    ctx.lineTo(x, y + dy * bracket);
    ctx.stroke();
  }
  ctx.restore();

  // A short accent notch on the left edge.
  ctx.save();
  ctx.fillStyle = accent;
  ctx.shadowColor = accent;
  ctx.shadowBlur = 12;
  ctx.fillRect(inset, h * 0.38, Math.max(3, h * 0.03), h * 0.24);
  ctx.restore();
}

function makeTextPlane(
  text: string,
  width: number,
  height: number,
  fontScale: number,
  background = "rgba(4,14,24,0.15)"
): Mesh {
  const { scene } = deps!;

  const plane = MeshBuilder.CreatePlane(
    "surveyCard",
    { width, height, sideOrientation: Mesh.DOUBLESIDE },
    scene
  );
  plane.renderingGroupId = 1;

  const texture = makeCardTexture(text, width, height, fontScale, background);

  const material = new StandardMaterial("surveyMat", scene);
  material.diffuseTexture = texture;
  material.emissiveTexture = texture;
  material.opacityTexture = texture;
  material.disableLighting = true;
  material.backFaceCulling = false;
  material.alpha = PANEL_ALPHA;
  plane.material = material;

  return plane;
}

/** Where the panel sits, in the local space of the head rig. */
function basis() {
  const yaw = (PANEL.yaw * Math.PI) / 180;
  const pitch = (PANEL.pitch * Math.PI) / 180;
  const horizontal = PANEL.distance * Math.cos(pitch);

  return {
    yaw,
    x: horizontal * Math.sin(yaw),
    y: PANEL.distance * Math.sin(pitch),
    z: horizontal * Math.cos(yaw),
  };
}

function place(mesh: Mesh, offsetX: number, offsetY: number) {
  const { yaw, x, y, z } = basis();
  mesh.position.set(
    x + offsetX * Math.cos(yaw),
    y + offsetY,
    z - offsetX * Math.sin(yaw)
  );
  mesh.rotation.y = yaw;
  mesh.parent = deps!.world;
  meshes.push(mesh);
}

function showQuestion(i: number) {
  clearMeshes();

  const question = questions[i];
  if (!question) {
    finish();
    return;
  }

  const card = makeTextPlane(question.text, PANEL.width, 0.8, 0.16);
  card.isPickable = false;
  place(card, 0, 0.6);

  const count = question.options.length;
  const gap = 0.05;
  const buttonWidth = (PANEL.width - gap * (count - 1)) / count;

  question.options.forEach((option, n) => {
    const button = makeTextPlane(option, buttonWidth, 0.34, 0.45, BUTTON_IDLE);
    button.isPickable = true;
    button.name = `surveyOption:${option}`;
    place(button, -PANEL.width / 2 + buttonWidth / 2 + n * (buttonWidth + gap), 0);
    optionButtons.push({ mesh: button, option, width: buttonWidth });
  });

  // A bare row of numbers means nothing without its ends explained.
  if (question.scale) {
    const hint =
      question.scale === "concern"
        ? "0 = not concerned          10 = very concerned"
        : "0 = not confident          10 = very confident";

    const legend = makeTextPlane(hint, PANEL.width, 0.2, 0.5, "rgba(0,0,0,0)");
    legend.isPickable = false;
    place(legend, 0, -0.3);
  }

  deps!.speak(question.text);
}

// ---------------------------------------------------------------------------
// Flow
// ---------------------------------------------------------------------------

export function startSurvey(nextPhase: SurveyPhase, done?: () => void) {
  if (!deps) {
    console.error("Survey used before initSurvey().");
    return;
  }

  phase = nextPhase;
  onComplete = done ?? null;

  // Post-only questions are excluded from the baseline.
  questions =
    nextPhase === "pre" ? SURVEY.filter((q) => !q.postOnly) : SURVEY.slice();

  surveyResults[nextPhase] = [];
  index = 0;
  showQuestion(0);
}

/**
 * Call from the pick handler. Returns true when the mesh belonged to the
 * survey, so the caller knows to stop processing it.
 */
export function handleSurveyPick(mesh: any): boolean {
  const name = String(mesh?.name ?? "");
  if (!name.startsWith("surveyOption:")) return false;

  const value = name.slice("surveyOption:".length);

  if (value === "__done") {
    clearMeshes();

    // Full restart. A reload is the only way to be certain nothing is left
    // half-running — the Convai session, a queued cue, a paused video — so the
    // next customer starts on a clean street panel.
    setTimeout(() => window.location.reload(), 300);
    return true;
  }

  surveyResults[phase].push(value);
  index += 1;

  // Light up the choice and freeze the panel, so the tap is visibly confirmed
  // before the question changes.
  const chosen = optionButtons.find((b) => b.option === value);
  if (chosen) repaintButton(chosen, BUTTON_CHOSEN);
  optionButtons.forEach((b) => (b.mesh.isPickable = false));

  if (index < questions.length) {
    setTimeout(() => showQuestion(index), 650);
  } else {
    setTimeout(() => finish(), 650);
  }

  return true;
}

function finish() {
  clearMeshes();
  index = -1;

  if (phase === "pre") {
    console.log("Pre-survey:", surveyResults.pre);
    deps!.speak("Thank you. Let's go inside.");
    const callback = onComplete;
    onComplete = null;
    // Let the line land before the scene changes.
    setTimeout(() => callback?.(), 1200);
    return;
  }

  console.log("Pre-survey:", surveyResults.pre);
  console.log("Post-survey:", surveyResults.post);

  const callback = onComplete;
  onComplete = null;
  callback?.();

  setTimeout(() => showResults(), 900);
}

/** The before-and-after, on a panel rather than buried in the console. */
export function showResults() {
  clearMeshes();

  const title = makeTextPlane(
    "How you felt, before and after",
    PANEL.width,
    0.4,
    0.4
  );
  title.isPickable = false;
  place(title, 0, 0.95);

  RESULT_LABELS.forEach((label, i) => {
    const before = surveyResults.pre[i];
    const after = surveyResults.post[i];
    if (before === undefined || after === undefined) return;

    const delta = Number(after) - Number(before);
    const change =
      delta === 0 ? "no change" : `${delta > 0 ? "+" : ""}${delta}`;

    const row = makeTextPlane(
      `${label}:   ${before}  \u2192  ${after}   (${change})`,
      PANEL.width,
      0.3,
      0.42
    );
    row.isPickable = false;
    place(row, 0, 0.45 - i * 0.36);
  });

  const done = makeTextPlane("Done", 0.7, 0.3, 0.45, "rgba(8,40,52,0.28)");
  done.isPickable = true;
  done.name = "surveyOption:__done";
  place(done, 0, -0.75);

  deps!.speak("Thank you. Here's how your answers changed.");
}
