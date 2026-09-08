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
  TransformNode,
} from "@babylonjs/core";

const PHONE = {
  folder: "/images/cheque/",
  extension: ".png",
  yaw: 0,
  pitch: -2,
  distance: 2.0,
  width: 0.7,      // screen width in metres — large, but VR text needs it
  // Starting aspect only. Once a screenshot loads, the plane is reshaped to
  // that image's own proportions so nothing is cropped or stretched.
  aspect: 2.05,       // height as a multiple of width
  cornerRadius: 0.2,  // as a fraction of the screen width
  maxTexture: 2048,   // cap on the canvas long edge, for headset memory
};

const CAPTION = {
  width: 2.4,
  height: 0.5,
  gap: 0.18,       // distance below the phone
  charsPerSecond: 34,
};

/**
 * Who narrates the steps.
 *
 *   "convai"  — she reads each step. Costs one interaction per step (fifteen
 *               per run) and adds a couple of seconds of latency on every tap.
 *   "browser" — the built-in voice. Free and instant, but a different voice
 *               from hers, which is noticeable.
 *   "none"    — captions only. She introduces the walkthrough and comments at
 *               the end; the typing carries the steps.
 */
const NARRATION: "convai" | "browser" | "none" = "convai";

/** One entry per image, in order. */
const STEPS: string[] = [
  "Open the everyday space, then the three-dot menu beside the current account you want to pay into.",
  "Choose Deposit cheque.",
  "You can enter the amount and other fields. Now tap the camera icon marked Front of cheque.",
  "Allow the app to use your camera if it asks.",
  "Lay the cheque on a flat, dark surface. When the green border appears, hold still and tap the capture button",
  "Press Use to continue, or Retake if it came out blurry.",
  "Now choose Back of cheque.",
  "Do the same again, even if that side is blank.",
  "Press Use to continue, or Retake if it came out blurry.",
  "Select Review deposit.", 
  "Check the details, then select Confirm.",
  "That's it. The money usually reaches your account within three working days. Keep the cheque until it does.Now click back to your accounts.",
  "To check on a deposit later, open the three-dot menu again.",
  "Choose Deposit cheque.",
  "In the Deposit history section you can see how the deposit is progressing.",
];

type ChequeDeps = {
  scene: Scene;
  world: TransformNode;
  speak: (text: string) => void;
  /** Sends a line to Convai. Only used when NARRATION is "convai". */
  tellConvai?: (text: string) => void;
};

let deps: ChequeDeps | null = null;

export function initCheque(dependencies: ChequeDeps) {
  deps = dependencies;

  // Drives the typewriter from here rather than depending on main.ts to call
  // updateCheque every frame — one less thing to lose when main.ts is
  // replaced.
  dependencies.scene.onBeforeRenderObservable.add(() => {
    updateCheque(dependencies.scene.getEngine().getDeltaTime());
  });
}

/**
 * Sends a line for the avatar to say. Falls back to the client on window if
 * main.ts did not pass a tellConvai hook, so narration keeps working either
 * way.
 */
function narrate(text: string) {
  if (NARRATION === "none") return;

  if (NARRATION === "browser") {
    deps?.speak(text);
    return;
  }

  const send =
    deps?.tellConvai ??
    ((line: string) =>
      (window as any)?.convai?.sendUserTextMessage?.(
        `Say this to the customer: ${line}`
      ));

  const client = (window as any)?.convai;
  if (!deps?.tellConvai && !client) {
    console.warn("Cheque narration: no Convai client available.");
    return;
  }

  send(text);
}

let meshes: Mesh[] = [];
let index = -1;

// Typewriter state.
let captionTexture: DynamicTexture | null = null;
let captionFull = "";
let captionShown = 0;
let captionTimer = 0;

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

/**
 * Draws the caption with no background. White text over a panorama needs an
 * outline or it disappears against anything pale.
 */
function drawCaption(texture: DynamicTexture, text: string) {
  const ctx = texture.getContext() as CanvasRenderingContext2D;
  const w = texture.getSize().width;
  const h = texture.getSize().height;

  ctx.clearRect(0, 0, w, h);

  let fontSize = Math.floor(h * 0.2);
  const font = () => `600 ${fontSize}px system-ui, sans-serif`;
  ctx.font = font();

  const wrap = (source: string) => {
    const words = source.split(" ");
    const lines: string[] = [];
    let line = "";

    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > w * 0.94 && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }

    lines.push(line);
    return lines;
  };

  // Size against the full caption so the text does not jump as it types.
  let lines = wrap(captionFull);
  while (lines.length * fontSize * 1.28 > h * 0.9 && fontSize > 12) {
    fontSize -= 2;
    ctx.font = font();
    lines = wrap(captionFull);
  }

  const visible = wrap(text);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(4, fontSize * 0.18);
  ctx.strokeStyle = "rgba(0,0,0,0.85)";
  ctx.fillStyle = "#ffffff";

  const lineHeight = fontSize * 1.28;
  const top = h / 2 - ((lines.length - 1) * lineHeight) / 2;

  visible.forEach((l, i) => {
    const y = top + i * lineHeight;
    ctx.strokeText(l, w / 2, y);
    ctx.fillText(l, w / 2, y);
  });

  texture.update();
}

function clearMeshes() {
  meshes.forEach((m) => m.dispose(false, true));
  meshes = [];
  captionTexture = null;
  captionFull = "";
  captionShown = 0;
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

  // The phone screen. The whole thing is the button — a small Next target is
  // fiddly with a controller ray, and tapping the phone is what you would do
  // in real life anyway.
  const screen = MeshBuilder.CreatePlane(
    "chequeScreen",
    { width: PHONE.width, height, sideOrientation: Mesh.DOUBLESIDE },
    scene
  );
  screen.renderingGroupId = 2;
  screen.isPickable = true;
  screen.name = "chequeStep:next";

  const material = new StandardMaterial("chequeScreenMat", scene);
  material.disableLighting = true;
  material.backFaceCulling = false;
  // App screenshots are light; lift them so they read in a dim room.
  material.emissiveColor.set(1.15, 1.15, 1.15);
  screen.material = material;
  // Kept hidden until the screenshot is drawn onto it, so there is no blank
  // white card sitting there while the image loads.
  screen.isVisible = false;

  place(screen, 0, 0);

  // Caption below the phone, no panel behind it.
  const captionPlane = MeshBuilder.CreatePlane(
    "chequeCaption",
    {
      width: CAPTION.width,
      height: CAPTION.height,
      sideOrientation: Mesh.DOUBLESIDE,
    },
    scene
  );
  captionPlane.renderingGroupId = 2;
  captionPlane.isPickable = false;

  captionTexture = new DynamicTexture(
    "chequeCapTex",
    { width: 1400, height: Math.round((1400 * CAPTION.height) / CAPTION.width) },
    scene,
    true
  );
  captionTexture.hasAlpha = true;

  captionFull = caption;
  captionShown = 1;
  captionTimer = 0;
  drawCaption(captionTexture, caption.slice(0, 1));

  const capMat = new StandardMaterial("chequeCapMat", scene);
  capMat.diffuseTexture = captionTexture;
  capMat.emissiveTexture = captionTexture;
  capMat.opacityTexture = captionTexture;
  capMat.disableLighting = true;
  capMat.backFaceCulling = false;
  captionPlane.material = capMat;

  place(captionPlane, 0, -height / 2 - CAPTION.gap - CAPTION.height / 2);

  // The screenshot is drawn through a rounded clip rather than mapped straight
  // onto the plane, so the corners come out curved like a real handset. The
  // canvas is not created until the image has loaded, so it can be sized to
  // the screenshot's own dimensions — nothing is cropped or stretched, and the
  // plane is reshaped to match.
  const image = new Image();

  image.onerror = () =>
    console.warn(`Cheque screenshot missing: ${step + 1}${PHONE.extension}`);

  image.onload = () => {
    if (screen.isDisposed()) return;

    const longEdge = Math.max(image.width, image.height);
    const fit = Math.min(1, PHONE.maxTexture / longEdge);
    const texWidth = Math.round(image.width * fit);
    const texHeight = Math.round(image.height * fit);

    const texture = new DynamicTexture(
      "chequeScreenTex",
      { width: texWidth, height: texHeight },
      scene,
      true
    );
    texture.hasAlpha = true;

    const ctx = texture.getContext() as CanvasRenderingContext2D;
    ctx.clearRect(0, 0, texWidth, texHeight);
    ctx.save();

    const r = texWidth * PHONE.cornerRadius;
    ctx.beginPath();
    ctx.moveTo(r, 0);
    ctx.lineTo(texWidth - r, 0);
    ctx.quadraticCurveTo(texWidth, 0, texWidth, r);
    ctx.lineTo(texWidth, texHeight - r);
    ctx.quadraticCurveTo(texWidth, texHeight, texWidth - r, texHeight);
    ctx.lineTo(r, texHeight);
    ctx.quadraticCurveTo(0, texHeight, 0, texHeight - r);
    ctx.lineTo(0, r);
    ctx.quadraticCurveTo(0, 0, r, 0);
    ctx.closePath();
    ctx.clip();

    // One to one, because the canvas is the image's own size.
    ctx.drawImage(image, 0, 0, texWidth, texHeight);

    ctx.restore();
    texture.update();

    material.diffuseTexture = texture;
    material.emissiveTexture = texture;
    material.opacityTexture = texture;
    screen.isVisible = true;

    // Reshape the plane to the screenshot's proportions, then drop the caption
    // back under whatever height that turned out to be.
    const trueAspect = image.height / image.width;
    screen.scaling.y = trueAspect / PHONE.aspect;

    const trueHeight = PHONE.width * trueAspect;
    place(
      captionPlane,
      0,
      -trueHeight / 2 - CAPTION.gap - CAPTION.height / 2
    );
  };

  image.src = `${PHONE.folder}${step + 1}${PHONE.extension}`;

  console.log(`Cheque step ${step + 1}/${STEPS.length} — narration: ${NARRATION}`);
  narrate(caption);
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
  const finished = index >= STEPS.length - 1;

  clearMeshes();
  index = -1;

  // She has no way of knowing the walkthrough ended — she cannot see it — so
  // she has to be told, or she just goes quiet.
  if (!finished) return;

  setTimeout(() => {
    if (NARRATION === "convai") {
      narrate(
        "The walkthrough has finished. Ask how it felt and whether they " +
          "would like to go over any part of it again."
      );
    } else {
      deps?.speak(
        "That's the whole thing. How did that feel? I'm happy to go through " +
          "any part of it again."
      );
    }
  }, 800);
}

export function stepChequeBack() {
  if (index <= 0) return;
  index -= 1;
  showStep(index);
}

/** Returns true when the mesh belonged to this walkthrough. */
export function handleChequePick(mesh: any): boolean {
  const name = String(mesh?.name ?? "");
  if (!name.startsWith("chequeStep:")) return false;
  if (index < 0) return true;

  const action = name.split(":")[1];

  if (action === "back") {
    stepChequeBack();
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

/** Drives the typewriter. Called once per frame from main. */
export function updateCheque(deltaMs: number) {
  if (!captionTexture || captionShown >= captionFull.length) return;

  captionTimer += deltaMs;
  const due = Math.floor((captionTimer / 1000) * CAPTION.charsPerSecond);
  if (due <= captionShown) return;

  captionShown = Math.min(captionFull.length, due);
  drawCaption(captionTexture, captionFull.slice(0, captionShown));
}
