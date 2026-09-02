/**
 * Cheque deposit walkthrough — the app screens, one at a time, advanced by the
 * customer rather than played at them. Tapping through it yourself is the
 * point: the aim is confidence, and confidence comes from doing.
 */

import {
  DynamicTexture,
  Mesh,
  MeshBuilder,
  Scene,
  StandardMaterial,
  Texture,
  TransformNode,
} from "@babylonjs/core";

const PHONE = {
  folder: "/images/cheque/",
  extension: ".png",
  yaw: 0,
  pitch: -2,
  distance: 2.0,
  width: 1.0,      // screen width in metres — large, but VR text needs it
  aspect: 2.05,    // height as a multiple of width
};

/** One entry per image, in order. */
const STEPS: string[] = [
  "Open the everyday space, then the three-dot menu beside the account you want to pay into.",
  "Choose Deposit cheque.",
  "Enter the amount. Up to £10,000 per cheque, £10,000 a day. You can add a reference if it helps you remember what it was for. Now Click on Front Camera",
  "Allow the app to use your camera if it asks.",
  "Lay the cheque on a flat, dark surface. Hold the phone level and directly above it. When the green border appears, hold still while it scans.",
  "Choose Back of cheque and do the same again, even if that side is blank.",
  "Select Review deposit.",
  "Check the details, then select Confirm.",
  "That's it. The money usually reaches your account within three working days. Keep the cheque until it does.",
  "To check on a deposit later, open the three-dot menu again from the everyday section and choose Deposit cheque.",
  "Then select Deposit history to see how it's progressing.",
];

type ChequeDeps = {
  scene: Scene;
  world: TransformNode;
  speak: (text: string) => void;
};

let deps: ChequeDeps | null = null;

export function initCheque(dependencies: ChequeDeps) {
  deps = dependencies;
}

let meshes: Mesh[] = [];
let index = -1;

export const isChequeVisible = () => index >= 0;

function basis() {
  const yaw = (PHONE.yaw * Math.PI) / 180;
  const pitch = (PHONE.pitch * Math.PI) / 180;
  const horizontal = PHONE.distance * Math.cos(pitch);

  return {
    yaw,
    x: horizontal * Math.sin(yaw),
    y: PHONE.distance * Math.sin(pitch),
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

/** A rounded card with wrapped white text on a dark background. */
function makeTextPlane(
  text: string,
  width: number,
  height: number,
  fontScale: number,
  background: string
): Mesh {
  const { scene } = deps!;

  const plane = MeshBuilder.CreatePlane(
    "chequeText",
    { width, height, sideOrientation: Mesh.DOUBLESIDE },
    scene
  );
  plane.renderingGroupId = 2;

  const texture = new DynamicTexture(
    "chequeTex",
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
  while (lines.length * fontSize * 1.3 > h * 0.88 && fontSize > 12) {
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

  const material = new StandardMaterial("chequeMat", scene);
  material.diffuseTexture = texture;
  material.emissiveTexture = texture;
  material.opacityTexture = texture;
  material.disableLighting = true;
  material.backFaceCulling = false;
  plane.material = material;

  return plane;
}

function clearMeshes() {
  meshes.forEach((m) => m.dispose(false, true));
  meshes = [];
}

function showStep(step: number) {
  clearMeshes();

  const caption = STEPS[step];
  if (!caption) {
    hideCheque();
    return;
  }

  const { scene } = deps!;
  const height = PHONE.width * PHONE.aspect;

  const screen = MeshBuilder.CreatePlane(
    "chequeScreen",
    { width: PHONE.width, height, sideOrientation: Mesh.DOUBLESIDE },
    scene
  );
  screen.renderingGroupId = 2;
  // The whole screen advances — a small Next button is fiddly with a
  // controller ray, and tapping the phone is what you'd do in real life.
  screen.isPickable = true;
  screen.name = "chequeStep:next";

  const texture = new Texture(
    `${PHONE.folder}${step + 1}${PHONE.extension}`,
    scene
  );

  const material = new StandardMaterial("chequeScreenMat", scene);
  material.diffuseTexture = texture;
  material.emissiveTexture = texture;
  material.disableLighting = true;
  material.backFaceCulling = false;
  // App screenshots are light; lift them so they read in a dim room.
  material.emissiveColor.set(1.15, 1.15, 1.15);
  screen.material = material;

  place(screen, 0, 0);

  // Caption to the right, so it does not cover the screen.
  const captionPlane = makeTextPlane(
    caption,
    1.5,
    0.9,
    0.1,
    "rgba(8,32,48,0.94)"
  );
  captionPlane.isPickable = false;
  place(captionPlane, PHONE.width / 2 + 0.85, 0.35);

  // Step counter.
  const counter = makeTextPlane(
    `Step ${step + 1} of ${STEPS.length}`,
    0.7,
    0.22,
    0.42,
    "rgba(0,0,0,0)"
  );
  counter.isPickable = false;
  place(counter, PHONE.width / 2 + 0.85, -0.3);

  // A quiet prompt rather than a button, since the screen itself is the target.
  const hint = makeTextPlane(
    step === STEPS.length - 1 ? "Tap the screen to finish" : "Tap the screen to continue",
    1.1,
    0.2,
    0.42,
    "rgba(0,0,0,0)"
  );
  hint.isPickable = false;
  place(hint, 0, -(PHONE.width * PHONE.aspect) / 2 - 0.18);

  deps!.speak(caption);
}

export function startCheque() {
  if (!deps) {
    console.error("Cheque walkthrough used before initCheque().");
    return;
  }

  index = 0;
  showStep(0);
}

export function hideCheque() {
  clearMeshes();
  index = -1;
  deps?.speak("That's the whole thing. Would you like to go through any of it again?");
}

/** Returns true when the mesh belonged to this walkthrough. */
export function handleChequePick(mesh: any): boolean {
  const name = String(mesh?.name ?? "");
  console.log("cheque pick:", name);
  if (!name.startsWith("chequeStep:")) return false;
  if (index < 0) return true;

  const action = name.split(":")[1];

  if (action === "back") {
    index = Math.max(0, index - 1);
    showStep(index);
    return true;
  }

  index += 1;
  if (index >= STEPS.length) {
    hideCheque();
  } else {
    showStep(index);
  }

  return true;
}

export function stepChequeBack() {
  if (index <= 0) return;
  index -= 1;
  showStep(index);
}