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
  Mesh,
  MeshBuilder,
  PhotoDome,
  PointerEventTypes,
  Ray,
  Scene,
  StandardMaterial,
  Texture,
  TransformNode,
  Vector3,
  WebXRDefaultExperience,
} from "@babylonjs/core";

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
      { target: "intro", yaw: 200, pitch: -5, label: "Back to the street" },
      { target: "branch", yaw: 2, pitch: -18, label: "The counter" },
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
  introLabel.position.set(x, -drop, z);

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

// --- Picking ---------------------------------------------------------------

const findMarker = (mesh: any) => markers.find((m) => m.ball === mesh);

const isIntroTarget = (mesh: any) =>
  !!mesh && (mesh === introPick || mesh === introBall || mesh === introPlane);

const isInteractive = (mesh: any) =>
  !!mesh && (isIntroTarget(mesh) || !!findMarker(mesh));

function activate(mesh: any) {
  if (isIntroTarget(mesh)) {
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