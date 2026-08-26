/**
 * Banking Hub — 360 node walkthrough
 *
 * Each node is a complete panorama sphere. Jumping between them swaps the
 * texture behind a short fade; nothing is stitched together.
 *
 * Desktop: drag to look around, click a marker to jump.
 *          [ ]  rotate the world
 *          - =  zoom out / in
 *          , .  shrink / grow the dome (perceived room scale)
 *          p    print the yaw you are facing
 *
 * Opens on a flat street-view panel. Point at it and trigger (or click) to
 * step inside to the first node.
 *
 * Quest:   trigger        jump to the marker you are pointing at
 *          B / Y          go back to the previous node
 *          thumbstick L/R rotate the world in 15 degree steps
 *          A / X          recentre: make your current facing the front
 */

import {
  Color3,
  Color4,
  DynamicTexture,
  Engine,
  FreeCamera,
  HemisphericLight,
  Mesh,
  MeshBuilder,
  PhotoDome,
  PointerEventTypes,
  Ray,
  Scene,
  SceneLoader,
  StandardMaterial,
  Texture,
  TransformNode,
  Vector3,
  VideoTexture,
  WebXRDefaultExperience,
} from "@babylonjs/core";
import "@babylonjs/loaders/glTF";
import { ConvaiClient } from "@convai/web-sdk";
import * as ConvaiSDK from "@convai/web-sdk";
import {
  handleSurveyPick,
  initSurvey,
  isSurveyActive,
  startSurvey,
} from "./survey";


// ---------------------------------------------------------------------------
// NODES — the only part you edit as you add panoramas.
//
//   rotation : degrees. Which way the panorama is turned.
//   yaw      : degrees. Which direction a marker sits in, measured from the
//              node's front. 0 ahead, 90 right, 180 behind, 270 left.
//   pitch    : degrees. Negative points downward.
// ---------------------------------------------------------------------------

type Hotspot = {
  target: string;
  yaw: number;
  pitch: number;
  label: string;
};

type NodeConfig = {
  id: string;
  image: string;
  rotation: number;
  hotspots: Hotspot[];
};

const NODES: NodeConfig[] = [
  {
    id: "entry",
    image: "/panoramas/node1.jpg",
    rotation: 0,
    hotspots: [
      { target: "meeting", yaw: 51, pitch: -5, label: "Private room" },
      { target: "intro", yaw: 210, pitch: -5, label: "Back to the street" },
      { target: "branch", yaw: 13, pitch: -18, label: "The counter" },
    ],
  },
  {
    id: "meeting",
    image: "/panoramas/meeting.jpg",
    rotation: 0,
    hotspots: [
      { target: "entry", yaw: 41, pitch: -12, label: "Back to entrance" },
    ],
  },
];

const START_NODE = "entry";

// Flat photo screens. A hotspot whose `target` matches a panel id shows that
// panel instead of a panorama; selecting the panel then moves to its `target`
// node. Panel ids and node ids share one namespace, so keep them distinct.
type PanelConfig = {
  id: string;
  image: string;
  label: string;
  target: string;   // node entered when the panel is selected
  width: number;    // panel width in metres
  distance: number; // how far in front of you it sits
  yaw: number;      // where it first appears; later it follows your gaze
};

const PANELS: PanelConfig[] = [
  {
    id: "intro",
    image: "/images/entrance.jpg",
    label: "Enter the Banking Hub",
    target: "entry",
    width: 6,
    distance: 7,
    yaw: 0,
  },
  {
    id: "branch",
    image: "/images/branch.jpg",
    label: "Back to the hub",
    target: "entry",
    width: 6,
    distance: 7,
    yaw: 0,
  },
];

// Panel shown on load. Set to null to boot straight into the panorama.
const START_PANEL: string | null = "intro";

const findPanel = (id: string | undefined | null) =>
  PANELS.find((panel) => panel.id === id) ?? null;

// Diameter of the sphere in metres. Controls how large the room FEELS in
// stereo. Keep this identical across nodes or the hub appears to resize.
const DOME_SIZE = 20;

// Desktop field of view in degrees. The headset sets its own.
const FIELD_OF_VIEW_DEGREES = 75;

// How far out the markers sit. Must stay well inside the dome radius.
const HOTSPOT_RADIUS = 6;

// Marker ball size. Bigger is easier to hit with a controller ray.
const MARKER_RADIUS = 0.3;

const FADE_MS = 350;

// When true, entering VR makes whichever way you are physically facing the
// front of the scene. Keep it false while you are positioning markers.
const RECENTRE_ON_ENTER = false;

// How far the dome slides past you during a jump, in metres. Turns a cut into
// a step. Not real parallax — the whole sphere moves as one. 0 disables it.
const DOLLY_METRES = 2.2;
const AVATAR = {
  enabled: true,
  node: "entry",
  folder: "/avatars/",
  file: "actor.glb",
  yaw: 35,
  distance: 1.5,
  eyeHeight: 2.0,
  scale: 1,
  faceOffset: 180,
};

// ---------------------------------------------------------------------------

const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;

if (!canvas) {
  throw new Error(
    'No canvas found. index.html needs <canvas id="renderCanvas"></canvas>.'
  );
}

const engine = new Engine(canvas, true, {
  preserveDrawingBuffer: true,
  stencil: true,
  xrCompatible: true,
});

const scene = new Scene(engine);
scene.clearColor = new Color4(0, 0, 0, 1);

const camera = new FreeCamera("camera", Vector3.Zero(), scene);
camera.attachControl(canvas, true);
camera.minZ = 0.1;
camera.inputs.removeByType("FreeCameraKeyboardMoveInput");

let fovDegrees = FIELD_OF_VIEW_DEGREES;
camera.fov = (fovDegrees * Math.PI) / 180;

// Rotates the whole world — dome and markers together — so they never drift
// apart. In VR this absorbs whichever way you happened to be facing.
let worldYaw = 0;

// rig follows the head. world carries the recentre rotation. Everything you
// can see hangs off world, so the panorama and the markers rotate as one.
const rig = new TransformNode("rig", scene);
const world = new TransformNode("world", scene);

// The survey panels hang off the head rig and use the same voice as the avatar.
initSurvey({ scene, world, speak });
world.parent = rig;

// useDirectMapping keeps the equirectangular image on the sphere as-is.
// Routing it through a cube conversion instead leaves a visible vertical seam.
const dome = new PhotoDome(
  "dome",
  NODES[0].image,
  { resolution: 64, size: DOME_SIZE, useDirectMapping: true },
  scene
);
dome.mesh.parent = world;
dome.mesh.renderingGroupId = 0;
dome.mesh.isPickable = false;

let domeSize = DOME_SIZE;

// Wrap horizontally, clamp vertically. The last argument is invertY: direct
// mapping needs it OFF, otherwise the panorama arrives vertically flipped.
function makePanoramaTexture(url: string): Texture {
  const texture = new Texture(url, scene, false, false);
  texture.wrapU = Texture.WRAP_ADDRESSMODE;
  texture.wrapV = Texture.CLAMP_ADDRESSMODE;
  return texture;
}

// The constructor builds its own texture with default settings; replace it so
// the opening node uses the same orientation and wrapping as every swap.
dome.photoTexture = makePanoramaTexture(NODES[0].image);

const fadeSphere = MeshBuilder.CreateSphere(
  "fade",
  { diameter: 3, sideOrientation: Mesh.BACKSIDE },
  scene
);
const fadeMaterial = new StandardMaterial("fadeMat", scene);
fadeMaterial.diffuseColor = Color3.Black();
fadeMaterial.emissiveColor = Color3.Black();
fadeMaterial.disableLighting = true;
fadeMaterial.alpha = 0;
fadeSphere.material = fadeMaterial;
fadeSphere.parent = rig;
fadeSphere.renderingGroupId = 2;
fadeSphere.isPickable = false;

// --- Markers ---------------------------------------------------------------

type Marker = {
  ball: Mesh;
  labelPlane: Mesh;
  material: StandardMaterial;
  yaw: number;
  pitch: number;
  target: string;
};

let markers: Marker[] = [];

const IDLE_COLOR = new Color3(0.13, 0.7, 0.66);
const HOVER_COLOR = new Color3(0.4, 1.0, 0.94);

// Label canvas is 1024x256 (4:1), which every label plane matches. The font
// shrinks until the text fits, so long labels are never clipped.
const LABEL_TEXTURE_WIDTH = 1024;
const LABEL_TEXTURE_HEIGHT = 256;

function makeLabelTexture(text: string): DynamicTexture {
  const texture = new DynamicTexture(
    `label-${text}`,
    { width: LABEL_TEXTURE_WIDTH, height: LABEL_TEXTURE_HEIGHT },
    scene,
    true
  );
  texture.hasAlpha = true;

  const context = texture.getContext() as CanvasRenderingContext2D;

  // Drawn straight onto the canvas rather than via drawText: a "middle"
  // baseline centres the glyphs regardless of ascender or descender height.
  const maxWidth = LABEL_TEXTURE_WIDTH * 0.88;
  const maxHeight = LABEL_TEXTURE_HEIGHT * 0.62;

  let fontSize = Math.floor(maxHeight);
  const font = () => `bold ${fontSize}px system-ui, sans-serif`;

  context.font = font();
  while (context.measureText(text).width > maxWidth && fontSize > 14) {
    fontSize -= 2;
    context.font = font();
  }

  context.clearRect(0, 0, LABEL_TEXTURE_WIDTH, LABEL_TEXTURE_HEIGHT);
  context.font = font();
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = "#ffffff";
  context.fillText(text, LABEL_TEXTURE_WIDTH / 2, LABEL_TEXTURE_HEIGHT / 2);

  texture.update();

  return texture;
}

function clearMarkers() {
  // Detach from the live list first, then dispose on the next frame. Disposing
  // a mesh the XR pointer is currently resolving can leave the pointer holding
  // a dead reference and stop it reporting anything further.
  const doomed = markers;
  markers = [];

  scene.onAfterRenderObservable.addOnce(() => {
    doomed.forEach((m) => {
      m.ball.dispose(false, true);
      m.labelPlane.dispose(false, true);
    });
  });
}

function buildMarkers(node: NodeConfig) {
  clearMarkers();

  for (const spot of node.hotspots) {
    const ball = MeshBuilder.CreateSphere(
      "marker",
      { diameter: MARKER_RADIUS * 2, segments: 16 },
      scene
    );
    ball.renderingGroupId = 1;
    ball.isPickable = true;
    ball.parent = world;

    const material = new StandardMaterial("markerMat", scene);
    material.emissiveColor = IDLE_COLOR;
    material.disableLighting = true;
    material.alpha = 0.9;
    ball.material = material;

    const labelPlane = MeshBuilder.CreatePlane(
      "labelPlane",
      { width: 2.2, height: 0.55, sideOrientation: Mesh.DOUBLESIDE },
      scene
    );
    labelPlane.renderingGroupId = 1;
    labelPlane.isPickable = false;
    labelPlane.parent = world;
    labelPlane.billboardMode = Mesh.BILLBOARDMODE_ALL;
    labelPlane.preserveParentRotationForBillboard = true;

    const labelTexture = makeLabelTexture(spot.label);
    const labelMaterial = new StandardMaterial("labelMat", scene);
    labelMaterial.diffuseTexture = labelTexture;
    labelMaterial.emissiveTexture = labelTexture;
    labelMaterial.opacityTexture = labelTexture;
    labelMaterial.disableLighting = true;
    labelMaterial.backFaceCulling = false;
    labelPlane.material = labelMaterial;

    markers.push({
      ball,
      labelPlane,
      material,
      yaw: spot.yaw,
      pitch: spot.pitch,
      target: spot.target,
    });
  }

  positionMarkers();
  updateAvatar(node);
}

// Local to `world`, so the recentre rotation carries them along with the
// panorama automatically.
function positionMarkers() {
  markers.forEach((m) => {
    const yaw = (m.yaw * Math.PI) / 180;
    const pitch = (m.pitch * Math.PI) / 180;
    const horizontal = HOTSPOT_RADIUS * Math.cos(pitch);

    const x = horizontal * Math.sin(yaw);
    const y = HOTSPOT_RADIUS * Math.sin(pitch);
    const z = horizontal * Math.cos(yaw);

    m.ball.position.set(x, y, z);
    m.labelPlane.position.set(x, y + 0.9, z);
  });
}

function applyWorldYaw() {
  // Node rotation lives on the dome; the recentre lives on `world`, which
  // carries the markers and the panel with it.
  dome.mesh.rotation.y = (currentNode.rotation * Math.PI) / 180;
  world.rotation.y = (worldYaw * Math.PI) / 180;
  positionMarkers();
  positionIntro();
  drawOverlay("Loaded");
}

scene.onBeforeRenderObservable.add(() => {
  const active = scene.activeCamera;
  if (active) rig.position.copyFrom(active.globalPosition);
});

// --- Opening panel ---------------------------------------------------------

// Which panel is on screen, and where it sits. The yaw starts at the panel's
// own value, then follows whichever way you are looking when you return to it.
let currentPanel: PanelConfig | null = null;
let introYaw = 0;

// Which way the viewer is facing, in the local space the panel lives in.
function facingYawDegrees(): number {
  const active = scene.activeCamera as any;
  if (!active) return introYaw;

  const radians = active.rotationQuaternion
    ? active.rotationQuaternion.toEulerAngles().y
    : active.rotation.y;

  const degrees = (radians * 180) / Math.PI - worldYaw;
  return ((degrees % 360) + 360) % 360;
}

let introPlane: Mesh | null = null;
let introPick: Mesh | null = null;
let introBall: Mesh | null = null;
let introLabel: Mesh | null = null;
let inIntro = false;

function buildIntro() {
  const INTRO = currentPanel;
  if (!INTRO) return;

  const texture = new Texture(INTRO.image, scene);

  introPlane = MeshBuilder.CreatePlane(
    "introPlane",
    {
      width: INTRO.width,
      height: INTRO.width * 0.5625,
      sideOrientation: Mesh.DOUBLESIDE,
    },
    scene
  );
  introPlane.renderingGroupId = 1;
  introPlane.parent = world;
  // A flat plane is unreliable as a ray target. An invisible solid box sitting
  // on the same spot does the picking instead.
  introPlane.isPickable = false;

  const material = new StandardMaterial("introMat", scene);
  material.diffuseTexture = texture;
  material.emissiveTexture = texture;
  material.disableLighting = true;
  material.backFaceCulling = false;
  introPlane.material = material;

  // Match the panel to the photo's real shape once it has loaded.
  texture.onLoadObservable.addOnce(() => {
    const size = texture.getSize();
    if (size.width && size.height && introPlane) {
      introPlane.scaling.y = size.height / size.width / 0.5625;
    }
  });

  introPick = MeshBuilder.CreateBox(
    "introPick",
    { width: INTRO.width, height: INTRO.width * 0.5625, depth: 0.3 },
    scene
  );
  introPick.isVisible = false;
  introPick.isPickable = true;
  introPick.parent = world;

  introBall = MeshBuilder.CreateSphere(
    "introBall",
    { diameter: MARKER_RADIUS * 2, segments: 16 },
    scene
  );
  introBall.renderingGroupId = 1;
  introBall.isPickable = true;
  introBall.parent = world;

  const ballMaterial = new StandardMaterial("introBallMat", scene);
  ballMaterial.emissiveColor = IDLE_COLOR;
  ballMaterial.disableLighting = true;
  ballMaterial.alpha = 0.9;
  introBall.material = ballMaterial;

  introLabel = MeshBuilder.CreatePlane(
    "introLabel",
    { width: 4.8, height: 1.2, sideOrientation: Mesh.DOUBLESIDE },
    scene
  );
  introLabel.renderingGroupId = 1;
  introLabel.isPickable = false;
  introLabel.parent = world;
  introLabel.billboardMode = Mesh.BILLBOARDMODE_ALL;
  introLabel.preserveParentRotationForBillboard = true;

  const labelTexture = makeLabelTexture(INTRO.label);
  const labelMaterial = new StandardMaterial("introLabelMat", scene);
  labelMaterial.diffuseTexture = labelTexture;
  labelMaterial.emissiveTexture = labelTexture;
  labelMaterial.opacityTexture = labelTexture;
  labelMaterial.disableLighting = true;
  labelMaterial.backFaceCulling = false;
  introLabel.material = labelMaterial;

  inIntro = true;
  dome.mesh.setEnabled(false);
  // Panels are flat screens — she does not belong in front of them.
  avatarRoot?.setEnabled(false);
  positionIntro();
}

function positionIntro() {
  const INTRO = currentPanel;
  if (!INTRO || !introPlane || !introLabel || !introPick || !introBall) return;

  const yaw = (introYaw * Math.PI) / 180;
  const x = INTRO.distance * Math.sin(yaw);
  const z = INTRO.distance * Math.cos(yaw);

  introPlane.position.set(x, 0, z);
  introPlane.rotation.y = yaw;

  introPick.position.set(x, 0, z);
  introPick.rotation.y = yaw;
  introPick.scaling.y = introPlane.scaling.y;

  const drop = (introPlane.scaling.y * INTRO.width * 0.5625) / 2 + 0.7;
    const pull = 0.35;
  introLabel.position.set(
    x * (1 - pull / INTRO.distance),
    -drop,
    z * (1 - pull / INTRO.distance)
  );
  introBall.position.set(x, -drop - 0.95, z);
}

async function enterFromIntro() {
  if (busy || !inIntro || !currentPanel) return;

  const destination = NODES.find((n) => n.id === currentPanel!.target);
  if (!destination) {
    console.error(`Panel "${currentPanel.id}" targets unknown node.`);
    return;
  }

  busy = true;

  try {
    // No dolly here: the dome is hidden behind the panel, so there is nothing
    // to slide. The street panel simply fades out.
    startConversation();
    await fade(0, 1);
    resetDolly();

    introPlane?.dispose(false, true);
    introPick?.dispose(false, true);
    introBall?.dispose(false, true);
    introLabel?.dispose(false, true);
    introPlane = null;
    introPick = null;
    introBall = null;
    introLabel = null;
    inIntro = false;
    currentPanel = null;

    currentNode = destination;
    dome.mesh.setEnabled(true);
    avatarRoot?.setEnabled(true);
    dome.photoTexture = makePanoramaTexture(currentNode.image);
    applyWorldYaw();

    await fade(1, 0);
    buildMarkers(currentNode);
  } catch (err) {
    console.error("Could not enter:", err);
  } finally {
    busy = false;
  }
}

async function showPanel(id: string, approachYaw?: number) {
  const panel = findPanel(id);
  if (busy || inIntro || !panel) return;

  busy = true;

  try {
    clearMarkers();

    await Promise.all([
      fade(0, 1),
      approachYaw === undefined
        ? Promise.resolve()
        : dollyForward(approachYaw, FADE_MS),
    ]);

    resetDolly();

    // Put the panel where the viewer is looking, not where it first appeared.
    introYaw = facingYawDegrees();
    currentPanel = panel;

    buildIntro();
    drawOverlay(panel.id);

    await fade(1, 0);
  } catch (err) {
    console.error("Could not show panel:", err);
  } finally {
    busy = false;
  }
}

// --- Lighting --------------------------------------------------------------
// The panorama and markers are all unlit, so the scene had no lights at all.
// PBR materials need one, or they render black.

const avatarLight = new HemisphericLight(
  "avatarLight",
  new Vector3(0.3, 1, 0.2),
  scene
);
avatarLight.intensity = 1.1;
avatarLight.groundColor = new Color3(0.35, 0.33, 0.3);

// PBR also needs something to reflect. Environment texture only — no skybox,
// no ground, so the panorama is untouched.
scene.createDefaultEnvironment({ createSkybox: false, createGround: false });

// --- Speech ----------------------------------------------------------------
// Browser speech synthesis: no keys, no cost, no network. Robotic compared to
// ElevenLabs, but it proves the flow before we add a paid voice.

const GREETING =
  "Hello, and welcome to the Banking Hub. Take your time having a look " +
  "around. When you're ready, I can show you the counter or the private room.";

let speaking = false;

function speak(text: string) {
  if (!("speechSynthesis" in window)) {
    console.warn("This browser has no speech synthesis.");
    return;
  }

  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.92;   // slightly slow — the audience is older
  utterance.pitch = 1.0;
  utterance.volume = 1.0;

  // Prefer a British English voice if one is installed.
  const voices = window.speechSynthesis.getVoices();
  const preferred =
    voices.find((v) => v.lang === "en-GB" && /female|woman|Sonia|Libby/i.test(v.name)) ??
    voices.find((v) => v.lang === "en-GB") ??
    voices.find((v) => v.lang.startsWith("en"));

  if (preferred) utterance.voice = preferred;

  utterance.onstart = () => (speaking = true);
  utterance.onend = () => (speaking = false);

  window.speechSynthesis.speak(utterance);
}
// --- Avatar ----------------------------------------------------------------

let avatarRoot: Mesh | null = null;
let hasGreeted = false;
let talkClip: any = null;
let idleClip: any = null;
// --- Blendshapes -----------------------------------------------------------
// ActorCore ships the ARKit 52 as A01_Brow_Inner_Up … A51_Mouth_Stretch_Right,
// alongside its own Reallusion set. Stripping the index prefix, dropping the
// underscores and lowercasing turns "A25_Jaw_Open" into "jawopen", which is
// exactly what Convai's arkit name "jawOpen" normalises to.

type BlendshapeTarget = { manager: any; index: number };

const blendshapes = new Map<string, BlendshapeTarget[]>();

const normalise = (name: string) =>
  name.replace(/^[AT]\d+_/, "").replace(/_/g, "").toLowerCase();

function buildBlendshapeMap(meshes: any[]) {
  blendshapes.clear();

  for (const mesh of meshes) {
    const manager = mesh.morphTargetManager;
    if (!manager) continue;

    for (let i = 0; i < manager.numTargets; i++) {
      const key = normalise(manager.getTarget(i).name);
      const list = blendshapes.get(key) ?? [];
      list.push({ manager, index: i });
      blendshapes.set(key, list);
    }
  }

  console.log(`Blendshape map built: ${blendshapes.size} names`);
}

// Convai sends { jawOpen: 0.4, mouthSmileLeft: 0.1, ... } — pass it straight in.
function applyBlendshapes(values: Record<string, number>) {
  for (const [name, value] of Object.entries(values)) {
    const targets = blendshapes.get(normalise(name));
    if (!targets) continue;

    for (const { manager, index } of targets) {
      manager.getTarget(index).influence = Math.max(0, Math.min(1, value));
    }
  }
}

async function updateAvatar(node: NodeConfig) {
  const wanted = AVATAR.enabled && node.id === AVATAR.node;

  // Load once, then just show and hide. Disposing meant re-downloading the
  // whole GLB on every jump, which showed as a visible pop.
  if (avatarRoot) {
    avatarRoot.setEnabled(wanted);
    return;
  }

  if (!wanted) return;

  try {
    const result = await SceneLoader.ImportMeshAsync(
      "",
      AVATAR.folder,
      AVATAR.file,
      scene
    );

    const root = result.meshes[0] as Mesh | undefined;
    if (!root) return;

    root.setParent(null);
    root.parent = world;

    result.meshes.forEach((mesh) => {
      mesh.isPickable = false;
      mesh.alwaysSelectAsActiveMesh = true;
    });
        result.meshes.forEach((mesh: any) => {
      const mat = mesh.material as any;
      if (!mat) return;

      // The FBX conversion leaves everything transparent and mirror-shiny.
      mat.transparencyMode = 0;        // opaque
      mat.alpha = 1;
      mat.backFaceCulling = true;

      if ("metallic" in mat) {
        mat.metallic = 0;
        mat.roughness = 0.85;
      }
    });

    const yaw = (AVATAR.yaw * Math.PI) / 180;
    root.position.set(
      AVATAR.distance * Math.sin(yaw),
      -AVATAR.eyeHeight,
      AVATAR.distance * Math.cos(yaw)
    );

    root.rotationQuaternion = null;
    root.rotation.y = yaw + (AVATAR.faceOffset * Math.PI) / 180;
    root.scaling.setAll(AVATAR.scale);

      // Two clips arrive: the real motion and an empty "Default" placeholder.
    // Pick the longest one — the placeholder has zero duration.
      const clips = [...result.animationGroups]
      .filter((g) => g.to - g.from > 0.1)
      .sort((a, b) => (b.to - b.from) - (a.to - a.from));

    talkClip = clips[0] ?? null;
    idleClip = clips[1] ?? null;

    result.animationGroups.forEach((g) => g.stop());
    idleClip?.start(true);

    console.log(
      "talk:", talkClip?.name ?? "none",
      "idle:", idleClip?.name ?? "none"
    );

    avatarRoot = root;
    buildBlendshapeMap(result.meshes);

    avatarRoot = root;
    buildBlendshapeMap(result.meshes);
    if (!hasGreeted) {
      hasGreeted = true;
      // setTimeout(() => speak(GREETING), 800);
    }
  } catch (err) {
    console.error("Avatar failed to load:", err);
  }
}
// --- Picking ---------------------------------------------------------------

const findMarker = (mesh: any) => markers.find((m) => m.ball === mesh);

const isIntroTarget = (mesh: any) =>
  !!mesh && (mesh === introPick || mesh === introBall || mesh === introPlane);

const isInteractive = (mesh: any) =>
  !!mesh &&
  (isIntroTarget(mesh) ||
    !!findMarker(mesh) ||
    String(mesh.name).startsWith("surveyOption:"));

// The baseline is taken outside, before she has had a chance to reassure them.
let preSurveyDone = false;

function activate(mesh: any) {
  if (handleSurveyPick(mesh)) return;

  // Ignore everything else while questions are on screen.
  if (isSurveyActive()) return;

  if (isIntroTarget(mesh)) {
    if (currentPanel?.id === "intro" && !preSurveyDone) {
      preSurveyDone = true;
      startSurvey("pre", () => enterFromIntro());
      return;
    }

    enterFromIntro();
    return;
  }

  const marker = findMarker(mesh);
  if (marker) goToNode(marker.target, true, marker.yaw);
}

scene.onPointerObservable.add((info) => {
  if (info.type === PointerEventTypes.POINTERMOVE) {
    const picked = info.pickInfo?.hit ? info.pickInfo.pickedMesh : null;
    markers.forEach((m) => {
      m.material.emissiveColor = m.ball === picked ? HOVER_COLOR : IDLE_COLOR;
    });
    return;
  }

  if (info.type !== PointerEventTypes.POINTERDOWN) return;

  activate(info.pickInfo?.pickedMesh);
});

// --- Navigation ------------------------------------------------------------

let currentNode: NodeConfig = NODES[0];
let busy = false;
const history: string[] = [];

function fade(from: number, to: number): Promise<void> {
  return new Promise((resolve) => {
    let elapsed = 0;
    const observer = scene.onBeforeRenderObservable.add(() => {
      elapsed += engine.getDeltaTime();
      const t = Math.min(1, elapsed / FADE_MS);
      fadeMaterial.alpha = from + (to - from) * t;
      if (t >= 1) {
        scene.onBeforeRenderObservable.remove(observer);
        resolve();
      }
    });
  });
}

// Slides the dome backwards along `yawDegrees`, which reads as walking
// forwards. Runs alongside the fade, so the distortion is never seen.
function dollyForward(yawDegrees: number, ms: number): Promise<void> {
  if (!DOLLY_METRES) return Promise.resolve();

  const yaw = (yawDegrees * Math.PI) / 180;
  const direction = new Vector3(Math.sin(yaw), 0, Math.cos(yaw));

  return new Promise((resolve) => {
    let elapsed = 0;
    const observer = scene.onBeforeRenderObservable.add(() => {
      elapsed += engine.getDeltaTime();
      const t = Math.min(1, elapsed / ms);
      const eased = t * t * (3 - 2 * t); // ease in and out

      dome.mesh.position
        .copyFrom(direction)
        .scaleInPlace(-DOLLY_METRES * eased);

      if (t >= 1) {
        scene.onBeforeRenderObservable.remove(observer);
        resolve();
      }
    });
  });
}

function resetDolly() {
  dome.mesh.position.setAll(0);
}

async function goToNode(
  id: string,
  recordHistory = true,
  approachYaw?: number
) {
  if (findPanel(id)) {
    showPanel(id, approachYaw);
    return;
  }

  const node = NODES.find((n) => n.id === id);
  if (!node || busy || node.id === currentNode.id) return;

  busy = true;

  try {
    if (recordHistory) history.push(currentNode.id);

    clearMarkers();

    await Promise.all([
      fade(0, 1),
      approachYaw === undefined
        ? Promise.resolve()
        : dollyForward(approachYaw, FADE_MS),
    ]);

    resetDolly();
    dome.photoTexture = makePanoramaTexture(node.image);
    currentNode = node;
    applyWorldYaw();

    await fade(1, 0);
    buildMarkers(node);
  } catch (err) {
    console.error("Jump failed:", err);
  } finally {
    // Always release, or one bad transition locks navigation for good.
    busy = false;
  }
}

function goBack() {
  const previous = history.pop();
  if (previous) goToNode(previous, false);
}

// --- Dev overlay (desktop only) --------------------------------------------

const overlay = document.createElement("div");
overlay.style.cssText = [
  "position:fixed",
  "left:12px",
  "bottom:12px",
  "z-index:10",
  "padding:10px 14px",
  "border-radius:6px",
  "background:rgba(0,0,0,0.72)",
  "color:#fff",
  "font:13px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace",
  "pointer-events:none",
].join(";");
document.body.appendChild(overlay);

function drawOverlay(status: string) {
  const effective = Math.round(
    (((currentNode.rotation + worldYaw) % 360) + 360) % 360
  );
  overlay.textContent =
    `${status}  ${currentNode.id}  rotation ${effective}°  ` +
    `fov ${fovDegrees}°  dome ${domeSize}m   [ ] rot   - = zoom   , . scale   p yaw`;
}

drawOverlay("Loading…");

window.addEventListener("keydown", (e) => {
  if (e.key === "[" || e.key === "]") {
    worldYaw = (worldYaw + (e.key === "]" ? 5 : -5) + 360) % 360;
    applyWorldYaw();
    console.log(
      `rotation for "${currentNode.id}": ` +
        `${Math.round((((currentNode.rotation + worldYaw) % 360) + 360) % 360)}`
    );
    return;
  }

  if (e.key === "-" || e.key === "=") {
    fovDegrees = Math.min(110, Math.max(30, fovDegrees + (e.key === "=" ? -5 : 5)));
    camera.fov = (fovDegrees * Math.PI) / 180;
  } else if (e.key === "," || e.key === ".") {
    domeSize = Math.min(2000, Math.max(4, domeSize + (e.key === "." ? 2 : -2)));
    dome.mesh.scaling.setAll(domeSize / DOME_SIZE);
  } else if (e.key === "Backspace") {
    goBack();
  } else if (e.key === "p") {
    const yaw = Math.round((camera.rotation.y * 180) / Math.PI);
    console.log(`facing yaw: ${((yaw % 360) + 360) % 360}`);
  } else {
    return;
  }

  drawOverlay("Loaded");
});

// --- WebXR -----------------------------------------------------------------

(async () => {
  try {
    const xr = await WebXRDefaultExperience.CreateAsync(scene, {
      disableTeleportation: true,
      disableDefaultUI: false,
      floorMeshes: [],
    });

    // Only markers and the panel should absorb the controller ray.
    if (xr.pointerSelection) {
      xr.pointerSelection.raySelectionPredicate = (mesh) => isInteractive(mesh);
    }

    // Make whichever way you are facing become the node's front.
    const recentre = () => {
      const xrCamera = xr.baseExperience.camera;
      const headingDegrees =
        (xrCamera.rotationQuaternion
          ? xrCamera.rotationQuaternion.toEulerAngles().y
          : xrCamera.rotation.y) *
        (180 / Math.PI);

      worldYaw = ((Math.round(headingDegrees) % 360) + 360) % 360;
      applyWorldYaw();
      logRotation();
    };

    const logRotation = () =>
      console.log(
        `rotation for "${currentNode.id}": ` +
          `${Math.round((((currentNode.rotation + worldYaw) % 360) + 360) % 360)}`
      );

    if (RECENTRE_ON_ENTER) {
      xr.baseExperience.sessionManager.onXRSessionInit.add(() => {
        // Let the headset report a stable pose before reading it.
        setTimeout(recentre, 400);
      });
    }

    xr.input.onControllerAddedObservable.add((controller) => {
      controller.onMotionControllerInitObservable.add((motionController) => {
        // Trigger — cast the controller's own ray rather than asking the
        // pointer helper, which can go stale after a tracked mesh is disposed.
        const pickRay = new Ray(Vector3.Zero(), Vector3.Zero());
        const trigger = motionController.getComponent("xr-standard-trigger");
        trigger?.onButtonStateChangedObservable.add((component) => {
          if (!component.changes.pressed?.current) return;

          controller.getWorldPointerRayToRef(pickRay, true);
          const pick = scene.pickWithRay(pickRay, (mesh) => isInteractive(mesh));

          console.log("trigger — hit:", pick?.pickedMesh?.name ?? "nothing");

          activate(pick?.pickedMesh);
        });

        // B / Y — step back to the previous node.
        const back =
          motionController.getComponent("b-button") ??
          motionController.getComponent("y-button");
        back?.onButtonStateChangedObservable.add((component) => {
          if (component.changes.pressed?.current) goBack();
        });

        // A / X — recentre on demand.
        const face =
          motionController.getComponent("a-button") ??
          motionController.getComponent("x-button");
        face?.onButtonStateChangedObservable.add((component) => {
          if (component.changes.pressed?.current) recentre();
        });

        // Thumbstick left/right — nudge the world in 15 degree steps.
        const stick = motionController.getComponent("xr-standard-thumbstick");
        let armed = true;
        stick?.onAxisValueChangedObservable.add((axes) => {
          if (Math.abs(axes.x) < 0.3) armed = true;
          if (!armed || Math.abs(axes.x) < 0.7) return;

          armed = false;
          worldYaw = (worldYaw + (axes.x > 0 ? 15 : -15) + 360) % 360;
          applyWorldYaw();
          logRotation();
        });
      });
    });
  } catch (err) {
    console.warn("WebXR unavailable — desktop preview only.", err);
  }
})();

// --- Start -----------------------------------------------------------------

currentNode = NODES.find((n) => n.id === START_NODE) ?? NODES[0];

const openingPanel = START_PANEL ? findPanel(START_PANEL) : null;

if (openingPanel) {
  currentPanel = openingPanel;
  introYaw = openingPanel.yaw;
  currentNode = NODES.find((n) => n.id === openingPanel.target) ?? currentNode;
  buildIntro();
  drawOverlay(openingPanel.id);
} else {
  if (currentNode.id !== NODES[0].id) {
    dome.photoTexture = makePanoramaTexture(currentNode.image);
  }
  applyWorldYaw();
  buildMarkers(currentNode);
}

engine.runRenderLoop(() => scene.render());
window.addEventListener("resize", () => engine.resize());
// Rough mouth movement while the browser speech is playing. Not real lipsync —
// a stand-in to confirm the blendshape plumbing works end to end.
// Rough mouth movement while the browser speech is playing. Not real lipsync —
// jawOpen alone only drops the chin, so the lips need driving separately.
// --- Placeholder mouth animation -------------------------------------------
// Reallusion ships a viseme set (the V_ targets) designed for speech, which
// looks better than combining ARKit targets by hand. Cycled at roughly natural
// speech rate. This whole block gets deleted once Convai drives the face.

const VISEMES = ["V_Open", "V_Wide", "V_Tight-O", "V_Lip_Open", "V_Explosive"];

const VISEME_MS = 110;

let visemeIndex = 0;
let visemeTimer = 0;

function clearVisemes() {
  const zeroed: Record<string, number> = { jawOpen: 0 };
  for (const name of VISEMES) zeroed[name] = 0;
  applyBlendshapes(zeroed);
}

scene.onBeforeRenderObservable.add(() => {
  if (true) return;    // disabled: Convai drives the face now
  if (!blendshapes.size) return;

  if (!speaking) {
    clearVisemes();
    return;
  }

  visemeTimer += engine.getDeltaTime();

  if (visemeTimer > VISEME_MS) {
    visemeTimer = 0;
    clearVisemes();
    visemeIndex = (visemeIndex + 1) % VISEMES.length;
  }

  applyBlendshapes({
    [VISEMES[visemeIndex]]: 0.85,
    jawOpen: 0.25,
  });
});
// Swap between idle and talking as the speech starts and stops.
let wasSpeaking = false;

scene.onBeforeRenderObservable.add(() => {
  if (speaking === wasSpeaking) return;
  wasSpeaking = speaking;

  if (speaking) {
    idleClip?.stop();
    talkClip?.start(true);
  } else {
    talkClip?.stop();
    idleClip?.start(true);
  }
});


// --- Convai ----------------------------------------------------------------

let convai: any = null;
let convaiSpeaking = false;

async function startConversation() {
  if (convai) return;

  try {
    // Must be on a user gesture and before entering VR — you cannot raise a
    // permission prompt inside an immersive session.
    await navigator.mediaDevices.getUserMedia({ audio: true });

    const client = new ConvaiClient();
    convai = client;
    (window as any).convai = client;
    await client.connect({
      apiKey: import.meta.env.VITE_CONVAI_API_KEY,
      characterId: import.meta.env.VITE_CONVAI_CHARACTER_ID,
      startWithAudioOn: true,
      ttsEnabled: true,
      enableLipsync: true,
      blendshapeConfig: { format: "arkit" },
    });

     client.blendshapeQueue.setMapper((ConvaiSDK as any).identityMapper);

    // The SDK's AudioRenderer is a React component, so the LiveKit track is
    // attached by hand.
    const attach = (track: any) => {
      const element = track.attach();
      element.autoplay = true;
      element.style.display = "none";
      document.body.appendChild(element);
      element.play().catch(() => {});
    };

    client.room?.remoteParticipants?.forEach((p: any) =>
      p.trackPublications?.forEach((pub: any) => pub.track && attach(pub.track))
    );
    client.room?.on?.("trackSubscribed", (track: any) => attach(track));

    await client.audioControls?.enableAudio?.();
    await client.audioControls?.unmuteAudio?.();
  

    console.log("Convai connected.");
  setTimeout(() => {
      (client as any).sendUserTextMessage?.("Hello, I've just arrived.");
    }, 1500);
    setInterval(() => {
      const q = client.blendshapeQueue;
      console.log(
        "speaking:", q.isBotSpeaking?.(),
        "hasFrames:", q.hasFrames?.(),
        "length:", q.length,
        "state:", client.state.isSpeaking
      );
    }, 1500);
  } catch (err) {
    console.error("Convai failed:", err);
  }
}

let loggedFrame = false;

scene.onBeforeRenderObservable.add(() => {
  if (!convai || !blendshapes.size) return;

  const queue = convai.blendshapeQueue;
  const speakingNow = queue.isBotSpeaking?.() ?? false;

  if (speakingNow !== convaiSpeaking) {
    convaiSpeaking = speakingNow;
    if (speakingNow) {
      idleClip?.stop();
      talkClip?.start(true);
    } else {
      talkClip?.stop();
      idleClip?.start(true);
      applyBlendshapes({ jawOpen: 0 });
    }
  }

  // getFrame() and consumeFrames() both return undefined here; getFrames()
  // hands back the whole buffer as Float32Array(61) entries, so take the
  // oldest and drop it. Frames arrive at 60fps, matching the render loop.
  const frames = queue.getFrames?.();
  if (!frames || !frames.length) return;

  const frame = frames.shift();
  if (!frame) return;
  if (!(window as any).loggedOnce) {
    (window as any).loggedOnce = true;
    const named = (ConvaiSDK as any).mapOrder61ToNames?.(frame);
    console.log("Named frame:", named);
    console.log("First 5 keys:", named ? Object.keys(named).slice(0, 5) : "none");
    console.log("Character keys sample:", [...blendshapes.keys()].slice(0, 8));
    console.log("Does jawopen exist?", blendshapes.has("jawopen"));
  }

 if (!loggedFrame) {
    loggedFrame = true;
    console.log("Frame shape:", frame);
    console.log("Is array:", Array.isArray(frame), "length:", frame?.length);
    const test = (ConvaiSDK as any).mapOrder61ToNames?.(frame);
    console.log("Mapped to:", test);
    console.log("Blendshape keys sample:", [...blendshapes.keys()].slice(0, 10));
  }

     if (frame instanceof Float32Array || Array.isArray(frame)) {
    // Order61 array → { jawOpen: 0.4, ... }
    const named = (ConvaiSDK as any).mapOrder61ToNames?.(frame);
    if (named) applyBlendshapes(named);
  } else {
    applyBlendshapes(frame);
  }
});
// --- Video panel -----------------------------------------------------------
// A phone-shaped screen she can show you. Plays an MP4 on a plane — this works
// in an immersive session, unlike an iframe or a YouTube embed.

const VIDEO_PANEL = {
  file: "/video/cheque-deposit.mp4",
  yaw: 25,          // direction it appears in, same convention as markers
  pitch: -3,        // slightly below eye level
  distance: 2.2,
  height: 1.4,      // metres tall
  portrait: true,   // true for a phone screen, false for landscape
};

let videoPlane: Mesh | null = null;
let videoTexture: any = null;

function showVideo() {
  if (videoPlane) return;

  const aspect = VIDEO_PANEL.portrait ? 9 / 16 : 16 / 9;

  videoPlane = MeshBuilder.CreatePlane(
    "videoPanel",
    {
      width: VIDEO_PANEL.height * aspect,
      height: VIDEO_PANEL.height,
      sideOrientation: Mesh.DOUBLESIDE,
    },
    scene
  );
  videoPlane.parent = world;
  videoPlane.renderingGroupId = 1;
  videoPlane.isPickable = false;

  const yaw = (VIDEO_PANEL.yaw * Math.PI) / 180;
  const pitch = (VIDEO_PANEL.pitch * Math.PI) / 180;
  const horizontal = VIDEO_PANEL.distance * Math.cos(pitch);

  videoPlane.position.set(
    horizontal * Math.sin(yaw),
    VIDEO_PANEL.distance * Math.sin(pitch),
    horizontal * Math.cos(yaw)
  );
  videoPlane.rotation.y = yaw;

  videoTexture = new VideoTexture(
    "chequeVideo",
    VIDEO_PANEL.file,
    scene,
    true,     // generate mipmaps
    false,    // invertY
    VideoTexture.TRILINEAR_SAMPLINGMODE,
    { autoPlay: true, loop: false, muted: false }
  );

  const material = new StandardMaterial("videoMat", scene);
  material.diffuseTexture = videoTexture;
  material.emissiveTexture = videoTexture;
  material.disableLighting = true;
  material.backFaceCulling = false;
  videoPlane.material = material;

  // Clear itself away when it finishes.
  videoTexture.video?.addEventListener("ended", () => hideVideo());

  console.log("Video panel shown");
}

function hideVideo() {
  videoTexture?.video?.pause();
  videoTexture?.dispose();
  videoPlane?.dispose(false, true);
  videoTexture = null;
  videoPlane = null;
  console.log("Video panel hidden");
}
window.addEventListener("keydown", (e) => {
  if (e.key !== "v") return;
  videoPlane ? hideVideo() : showVideo();
});

// Testing shortcuts: 1 runs the baseline survey, 2 runs the closing one.
// Keep these for demos — being able to force the survey is a useful safety net.
window.addEventListener("keydown", (e) => {
  if (e.key === "1") startSurvey("pre");
  if (e.key === "2") startSurvey("post");
});
