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
 *
 * Aim the view in the headset with the thumbstick, take the headset off,
 * then read the printed rotation from the console (chrome://inspect) and
 * paste it into the node's `rotation` below.
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
//   rotation : degrees. Which way the panorama is turned. In VR this is
//              applied on top of wherever you are physically facing when
//              the session starts.
//   yaw      : degrees. Which direction a marker sits in, measured from the
//              node's front. 0 ahead, 90 right, 180 behind, 270 left.
//   pitch    : degrees. Negative points downward. -12 sits it near the floor.
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
    rotation: 180,
    hotspots: [
      { target: "meeting", yaw: 231, pitch: -5, label: "Private room" },
    ],
  },
  {
    id: "meeting",
    image: "/panoramas/meeting.jpg",
    rotation: 0,
    hotspots: [
      { target: "entry", yaw: 49, pitch: -14, label: "Back to entrance" },
    ],
  },
];

const START_NODE = "entry";

// Opening screen: an ordinary flat photo of the shopfront from the street,
// shown on a panel. Selecting it steps inside to START_NODE.
// Set INTRO to null to boot straight into the panorama instead.
const INTRO: {
  image: string;
  label: string;
  width: number;
  distance: number;
  yaw: number;
} | null = {
  image: "/images/entrance.jpg",
  label: "Enter the Banking Hub",
  width: 6,      // panel width in metres
  distance: 7,   // how far in front of you it sits
  yaw: 0,        // which direction it sits in, like a marker yaw
};

// Diameter of the sphere in metres. Controls how large the room FEELS in
// stereo. Keep this identical across nodes or the hub appears to resize.
const DOME_SIZE = 20;

// Desktop field of view in degrees. The headset sets its own.
const FIELD_OF_VIEW_DEGREES = 75;

// How far out the markers sit. Must stay well inside the dome radius.
const HOTSPOT_RADIUS = 6;

// Marker ball size. Bigger is easier to hit with a controller ray.
const MARKER_RADIUS = 0.45;

const FADE_MS = 350;

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

const rig = new TransformNode("rig", scene);

const dome = new PhotoDome(
  "dome",
  NODES[0].image,
  { resolution: 64, size: DOME_SIZE, useDirectMapping: false },
  scene
);
dome.mesh.parent = rig;
dome.mesh.renderingGroupId = 0;
dome.mesh.isPickable = false;

let domeSize = DOME_SIZE;

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
  const maxWidth = LABEL_TEXTURE_WIDTH * 0.9;

  let fontSize = Math.floor(LABEL_TEXTURE_HEIGHT * 0.52);
  const font = () => `bold ${fontSize}px system-ui, sans-serif`;

  context.font = font();
  while (context.measureText(text).width > maxWidth && fontSize > 14) {
    fontSize -= 2;
    context.font = font();
  }

  texture.drawText(
    text,
    null,
    Math.floor(LABEL_TEXTURE_HEIGHT * 0.66),
    font(),
    "#ffffff",
    "transparent",
    true
  );

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

    const material = new StandardMaterial("markerMat", scene);
    material.emissiveColor = IDLE_COLOR;
    material.disableLighting = true;
    material.alpha = 0.9;
    ball.material = material;

    const labelPlane = MeshBuilder.CreatePlane(
      "labelPlane",
      { width: 2.8, height: 0.7, sideOrientation: Mesh.DOUBLESIDE },
      scene
    );
    labelPlane.renderingGroupId = 1;
    labelPlane.isPickable = false;
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

function positionMarkers() {
  markers.forEach((m) => {
    const yaw = ((m.yaw + worldYaw) * Math.PI) / 180;
    const pitch = (m.pitch * Math.PI) / 180;
    const horizontal = HOTSPOT_RADIUS * Math.cos(pitch);

    const x = rig.position.x + horizontal * Math.sin(yaw);
    const y = rig.position.y + HOTSPOT_RADIUS * Math.sin(pitch);
    const z = rig.position.z + horizontal * Math.cos(yaw);

    m.ball.position.set(x, y, z);
    m.labelPlane.position.set(x, y + 0.9, z);
  });
}

function applyWorldYaw() {
  dome.mesh.rotation.y = ((currentNode.rotation + worldYaw) * Math.PI) / 180;
  positionMarkers();
  positionIntro();
  drawOverlay("Loaded");
}

scene.onBeforeRenderObservable.add(() => {
  const active = scene.activeCamera;
  if (active) rig.position.copyFrom(active.globalPosition);
  positionMarkers();
  positionIntro();
});

// --- Opening panel ---------------------------------------------------------

let introPlane: Mesh | null = null;
let introPick: Mesh | null = null;
let introBall: Mesh | null = null;
let introLabel: Mesh | null = null;
let inIntro = false;

function buildIntro() {
  if (!INTRO) return;

  const texture = new Texture(INTRO.image, scene);

  introPlane = MeshBuilder.CreatePlane(
    "introPlane",
    { width: INTRO.width, height: INTRO.width * 0.5625, sideOrientation: Mesh.DOUBLESIDE },
    scene
  );
  introPlane.renderingGroupId = 1;
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
      introPlane.scaling.y = (size.height / size.width) / 0.5625;
    }
  });

  introPick = MeshBuilder.CreateBox(
    "introPick",
    { width: INTRO.width, height: INTRO.width * 0.5625, depth: 0.3 },
    scene
  );
  introPick.isVisible = false;
  introPick.isPickable = true;

  introBall = MeshBuilder.CreateSphere(
    "introBall",
    { diameter: MARKER_RADIUS * 2, segments: 16 },
    scene
  );
  introBall.renderingGroupId = 1;
  introBall.isPickable = true;

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
  if (!INTRO || !introPlane || !introLabel || !introPick || !introBall) return;

  const yaw = ((INTRO.yaw + worldYaw) * Math.PI) / 180;
  const x = rig.position.x + INTRO.distance * Math.sin(yaw);
  const z = rig.position.z + INTRO.distance * Math.cos(yaw);

  introPlane.position.set(x, rig.position.y, z);
  introPlane.rotation.y = yaw;

  introPick.position.set(x, rig.position.y, z);
  introPick.rotation.y = yaw;
  introPick.scaling.y = introPlane.scaling.y;

  const drop = (introPlane.scaling.y * INTRO.width * 0.5625) / 2 + 0.7;
  introLabel.position.set(x, rig.position.y - drop, z);
  introLabel.rotation.y = yaw;

  introBall.position.set(x, rig.position.y - drop - 0.95, z);
}

async function enterFromIntro() {
  if (busy || !inIntro) return;

  busy = true;

  try {
    await fade(0, 1);

    introPlane?.dispose(false, true);
    introPick?.dispose(false, true);
    introBall?.dispose(false, true);
    introLabel?.dispose(false, true);
    introPlane = null;
    introPick = null;
    introBall = null;
    introLabel = null;
    inIntro = false;

    dome.mesh.setEnabled(true);
    dome.photoTexture = new Texture(currentNode.image, scene);
    applyWorldYaw();

    await fade(1, 0);
    buildMarkers(currentNode);
  } catch (err) {
    console.error("Could not enter:", err);
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
  if (marker) goToNode(marker.target);
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

async function goToNode(id: string, recordHistory = true) {
  const node = NODES.find((n) => n.id === id);
  if (!node || busy || node.id === currentNode.id) return;

  busy = true;

  try {
    if (recordHistory) history.push(currentNode.id);

    clearMarkers();
    await fade(0, 1);

    dome.photoTexture = new Texture(node.image, scene);
    currentNode = node;
    dome.mesh.rotation.y = ((currentNode.rotation + worldYaw) * Math.PI) / 180;
    drawOverlay("Loaded");

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
  const effective = Math.round(((currentNode.rotation + worldYaw) % 360 + 360) % 360);
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
        `${Math.round(((currentNode.rotation + worldYaw) % 360 + 360) % 360)}`
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

    // Only markers should absorb the controller ray.
    if (xr.pointerSelection) {
      xr.pointerSelection.raySelectionPredicate = (mesh) => isInteractive(mesh);
    }

    // Make whichever way you are facing become the node's front.
    const recentre = () => {
      const xrCamera = xr.baseExperience.camera;
      const headingDegrees = (xrCamera.rotationQuaternion
        ? xrCamera.rotationQuaternion.toEulerAngles().y
        : xrCamera.rotation.y) * (180 / Math.PI);

      worldYaw = ((Math.round(headingDegrees) % 360) + 360) % 360;
      applyWorldYaw();
      logRotation();
    };

    const logRotation = () =>
      console.log(
        `rotation for "${currentNode.id}": ` +
          `${Math.round(((currentNode.rotation + worldYaw) % 360 + 360) % 360)}`
      );

    xr.baseExperience.sessionManager.onXRSessionInit.add(() => {
      // Let the headset report a stable pose before reading it.
      setTimeout(recentre, 400);
    });

    xr.input.onControllerAddedObservable.add((controller) => {
      controller.onMotionControllerInitObservable.add((motionController) => {
        // Trigger — cast the controller's own ray rather than asking the
        // pointer helper, which can go stale after a mesh it was tracking is
        // disposed.
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

if (INTRO) {
  buildIntro();
  drawOverlay("Intro");
} else {
  if (currentNode.id !== NODES[0].id) {
    dome.photoTexture = new Texture(currentNode.image, scene);
  }
  applyWorldYaw();
  buildMarkers(currentNode);
}

engine.runRenderLoop(() => scene.render());
window.addEventListener("resize", () => engine.resize());
