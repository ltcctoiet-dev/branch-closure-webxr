/**
 * Panorama test scene — Branch Closure XR
 *
 * Loads a single 360 equirectangular image as a PhotoDome and enters WebXR.
 * Purpose: judge whether a Skybox panorama holds up in the Quest 3 before
 * generating the remaining nodes.
 *
 * Desktop: drag to look around.
 *          [ and ]  rotate the dome
 *          - and =  zoom out / in
 *          , and .  shrink / grow the dome (perceived room scale)
 *
 * Quest:   press "Enter VR".
 *          A or X button cycles through the dome size presets below.
 *          Field of view is set by the headset — the zoom keys don't apply.
 */

import {
  Engine,
  Scene,
  FreeCamera,
  Vector3,
  PhotoDome,
  WebXRDefaultExperience,
  Color4,
} from "@babylonjs/core";

// The panorama to test. Swap this path to try a different node.
const PANORAMA_PATH = "/panoramas/node1.jpg";

// Which way you face on arrival, in degrees. Tune with [ and ], then paste
// the value the overlay reports back into this constant.
const DOME_ROTATION_DEGREES = 0;

// Desktop field of view in degrees. 75 is a natural panorama-viewer feel.
// Babylon's default is about 45, which looks heavily zoomed in.
const FIELD_OF_VIEW_DEGREES = 75;

// Diameter of the sphere in metres. This is what controls how large the room
// FEELS in stereo. A huge dome reads as "very distant", and a distant room
// reads as an enormous room. Around 16-24 suits an 8m-wide interior.
const DOME_SIZE = 20;

// Cycled by the A / X button in VR, so you can judge scale without removing
// the headset. Last value is the old default, for comparison.
const DOME_SIZE_PRESETS = [10, 16, 20, 30, 1000];

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

let fovDegrees = FIELD_OF_VIEW_DEGREES;
camera.fov = (fovDegrees * Math.PI) / 180;

// Strip keyboard movement so you can't accidentally fly out through the sphere.
camera.inputs.removeByType("FreeCameraKeyboardMoveInput");

const dome = new PhotoDome(
  "node1",
  PANORAMA_PATH,
  {
    resolution: 64,
    size: DOME_SIZE,
    useDirectMapping: false,
  },
  scene
);

// Anything you add later (hotspots, signage planes) must sit INSIDE this
// radius, or it will be swallowed by the dome.
dome.mesh.renderingGroupId = 0;

let rotationDegrees = DOME_ROTATION_DEGREES;
dome.mesh.rotation.y = (rotationDegrees * Math.PI) / 180;

let domeSize = DOME_SIZE;
let presetIndex = 0;

function setDomeSize(next: number) {
  domeSize = Math.min(2000, Math.max(4, next));
  // scaling is cheaper and safer than rebuilding the dome mesh
  const factor = domeSize / DOME_SIZE;
  dome.mesh.scaling.setAll(factor);
  drawOverlay("Loaded");
}

// --- Keep the dome centred on the head ------------------------------------
//
// WebXR places the origin at floor level, so without this the viewer stands
// roughly 1.6m above the centre of the sphere and feels airborne. Recentring
// every frame also means physically walking never pushes you off-centre.

scene.onBeforeRenderObservable.add(() => {
  const active = scene.activeCamera;
  if (active) {
    dome.mesh.position.copyFrom(active.globalPosition);
  }
});

// --- Dev overlay (desktop only — not visible in immersive mode) ------------

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
  overlay.textContent =
    `${status}   rotation ${rotationDegrees}°   fov ${fovDegrees}°   ` +
    `dome ${domeSize}m   [ ] rotate   - = zoom   , . scale`;
}

drawOverlay("Loading…");

dome.texture.onLoadObservable.addOnce(() => drawOverlay("Loaded"));

window.addEventListener("keydown", (e) => {
  if (e.key === "[" || e.key === "]") {
    rotationDegrees = (rotationDegrees + (e.key === "]" ? 5 : -5) + 360) % 360;
    dome.mesh.rotation.y = (rotationDegrees * Math.PI) / 180;
    drawOverlay("Loaded");
  } else if (e.key === "-" || e.key === "=") {
    fovDegrees = Math.min(110, Math.max(30, fovDegrees + (e.key === "=" ? -5 : 5)));
    camera.fov = (fovDegrees * Math.PI) / 180;
    drawOverlay("Loaded");
  } else if (e.key === "," || e.key === ".") {
    setDomeSize(domeSize + (e.key === "." ? 2 : -2));
  }
});

// --- WebXR ----------------------------------------------------------------

(async () => {
  try {
    const xr = await WebXRDefaultExperience.CreateAsync(scene, {
      disableTeleportation: true,
      disableDefaultUI: false,
      floorMeshes: [],
    });

    // A / X cycles the size presets so you can judge scale in the headset.
    xr.input.onControllerAddedObservable.add((controller) => {
      controller.onMotionControllerInitObservable.add((motionController) => {
        const button =
          motionController.getComponent("a-button") ??
          motionController.getComponent("x-button");

        if (!button) return;

        button.onButtonStateChangedObservable.add((component) => {
          if (!component.pressed) return;
          presetIndex = (presetIndex + 1) % DOME_SIZE_PRESETS.length;
          setDomeSize(DOME_SIZE_PRESETS[presetIndex]);
        });
      });
    });
  } catch (err) {
    // No headset attached, or the page isn't on HTTPS. Desktop preview works.
    console.warn("WebXR unavailable — desktop preview only.", err);
  }
})();

// --- Render loop ----------------------------------------------------------

engine.runRenderLoop(() => scene.render());
window.addEventListener("resize", () => engine.resize());
