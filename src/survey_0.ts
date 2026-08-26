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
let onComplete: (() => void) | null = null;

export const isSurveyActive = () => index >= 0;

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

function clearMeshes() {
  meshes.forEach((m) => m.dispose(false, true));
  meshes = [];
}

/** A card with wrapped, auto-sized white text on a dark background. */
function makeTextPlane(
  text: string,
  width: number,
  height: number,
  fontScale: number,
  background = "rgba(10,20,40,0.88)"
): Mesh {
  const { scene } = deps!;

  const plane = MeshBuilder.CreatePlane(
    "surveyCard",
    { width, height, sideOrientation: Mesh.DOUBLESIDE },
    scene
  );
  plane.renderingGroupId = 1;

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
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, w, h);

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

  const lineHeight = fontSize * 1.3;
  const top = h / 2 - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((l, i) => ctx.fillText(l, w / 2, top + i * lineHeight));

  texture.update();

  const material = new StandardMaterial("surveyMat", scene);
  material.diffuseTexture = texture;
  material.emissiveTexture = texture;
  material.opacityTexture = texture;
  material.disableLighting = true;
  material.backFaceCulling = false;
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
    const button = makeTextPlane(
      option,
      buttonWidth,
      0.34,
      0.45,
      "rgba(20,90,86,0.92)"
    );
    button.isPickable = true;
    button.name = `surveyOption:${option}`;
    place(button, -PANEL.width / 2 + buttonWidth / 2 + n * (buttonWidth + gap), 0);
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
    return true;
  }

  surveyResults[phase].push(value);
  index += 1;

  if (index < questions.length) {
    // Brief pause so the tap does not clip the previous line.
    setTimeout(() => showQuestion(index), 400);
  } else {
    finish();
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
    setTimeout(() => callback?.(), 600);
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

  const done = makeTextPlane("Done", 0.7, 0.3, 0.45, "rgba(20,90,86,0.92)");
  done.isPickable = true;
  done.name = "surveyOption:__done";
  place(done, 0, -0.75);

  deps!.speak("Thank you. Here's how your answers changed.");
}
