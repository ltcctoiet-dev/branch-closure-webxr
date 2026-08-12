import "./style.css";
import { Color4, Scene } from "@babylonjs/core";
import { createEngine } from "./core/engine";
import { colours } from "./core/theme";
import { createRoom } from "./environments/room";
import { attachClickToMove } from "./navigation/clickToMove";

/**
 * The starting point. Everything happens in the order written below.
 *
 * Read this file top to bottom and you know what the app does. As the project
 * grows, keep it that way — put the *doing* in other files and leave this one
 * as the list of steps.
 */

function start(): void {
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
  const { camera, markers } = createRoom(scene);

  // 4. Make the discs clickable.
  attachClickToMove(scene, camera, markers);

  // 5. Draw, forever.
  engine.runRenderLoop(() => scene.render());

  console.log("Session 1 ready. Click a floor disc to move.");
}

// If anything above fails, say so on screen rather than showing a black page.
try {
  start();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(error);
  const fallback = document.getElementById("fallbackMessage");
  if (fallback) {
    fallback.textContent = `The scene could not start: ${message}`;
    fallback.hidden = false;
  }
}
