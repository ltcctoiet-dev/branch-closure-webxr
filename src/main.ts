import "./style.css";
import { Color4, Scene } from "@babylonjs/core";
import { createEngine } from "./core/engine";
import { colours } from "./core/theme";
import { createRoom } from "./environments/room";
import { attachClickToMove, setClickToMoveEnabled } from "./navigation/clickToMove";
import { initialiseWebXR } from "./xr/session";

/**
 * The starting point. Everything happens in the order written below.
 *
 * CHANGED IN SESSION 2: this function is now `async`, and has an `await` in it.
 *
 * That's because asking the browser "can you do VR?" takes a moment, and the
 * answer arrives later. `await` means "wait here for the answer before carrying
 * on". Any function containing `await` has to be marked `async` — that's the
 * only reason the word appears.
 */

async function start(): Promise<void> {
  const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement | null;
  if (!canvas) {
    throw new Error(
      "Could not find the canvas. Check that index.html contains an element with id=\"renderCanvas\".",
    );
  }

  // 1. Start the renderer.
  const engine = createEngine(canvas);

  // 2. Make an empty scene and set the colour beyond the room.
  const scene = new Scene(engine);
  scene.clearColor = Color4.FromHexString(`${colours.background}FF`);

  // 3. Build the room. This also creates the camera and the floor discs.
  const { camera, floor, markers } = createRoom(scene);

  // 4. Make the discs clickable on desktop.
  attachClickToMove(scene, camera, markers);

  // 5. Turn on VR. The floor is passed in so the headset knows what counts as
  //    ground. The callback switches desktop clicking off while you're in VR,
  //    so the two ways of moving don't fight each other.
  await initialiseWebXR(scene, [floor], (inVr) => {
    setClickToMoveEnabled(!inVr);
  });

  // 6. Draw, forever.
  engine.runRenderLoop(() => scene.render());

  console.log("Session 2 ready. Click a disc to move, or press Enter VR.");
}

// If anything above fails, say so on screen rather than showing a black page.
//
// `.catch()` here does the same job the try/catch did in Session 1 — an async
// function reports its failures this way instead.
start().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(error);
  const fallback = document.getElementById("fallbackMessage");
  if (fallback) {
    fallback.textContent = `The scene could not start: ${message}`;
    fallback.hidden = false;
  }
});
