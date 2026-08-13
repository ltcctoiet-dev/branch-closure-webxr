import "./style.css";
import { Color4, Scene, type Camera, type WebXRDefaultExperience } from "@babylonjs/core";
import { createEngine } from "./core/engine";
import { colours } from "./core/theme";
import { store } from "./core/store";
import { router } from "./core/router";
import { createSceneStep } from "./core/sceneStep";
import { loadScenes } from "./content/schema";
import { createRoom } from "./environments/room";
import { attachClickToMove, setClickToMoveEnabled } from "./navigation/clickToMove";
import { initialiseWebXR } from "./xr/session";
import { Panel } from "./ui/Panel";
import { SubtitleBar } from "./ui/SubtitleBar";
import { HelpButton } from "./ui/HelpButton";

/**
 * The starting point. Read top to bottom and you know what the app does.
 */

async function start(): Promise<void> {
  const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement | null;
  if (!canvas) {
    throw new Error(
      "Could not find the canvas. Check that index.html contains an element with id=\"renderCanvas\".",
    );
  }

  // 1. Renderer and empty scene.
  const engine = createEngine(canvas);
  const scene = new Scene(engine);
  scene.clearColor = Color4.FromHexString(`${colours.background}FF`);

  // 2. The room, the camera, the floor discs.
  const { camera: desktopCamera, floor, markers } = createRoom(scene);
  attachClickToMove(scene, desktopCamera, markers);

  // 3. The things the customer reads.
  const panel = new Panel(scene);
  const subtitles = new SubtitleBar(scene);
  const help = new HelpButton(scene);

  // Subtitles and the help button ride along with whichever camera is in use.
  const followCamera = (which: Camera) => {
    subtitles.attachTo(which);
    help.attachTo(which);
  };
  followCamera(desktopCamera);

  // 4. Load the script. If anything in scenes.json is wrong, this throws and
  //    the message appears on screen — better than a blank panel mid-demo.
  const scenes = await loadScenes();
  console.log(`Loaded ${scenes.size} scenes.`);

  router.registerAll(
    [...scenes.values()].map((record) => createSceneStep(record, { panel, subtitles, scene })),
  );

  // 5. VR. Same as Session 2, plus swapping which camera the subtitles follow.
  let xr: WebXRDefaultExperience | null = null;
  const setup = await initialiseWebXR(scene, [floor], (inVr) => {
    setClickToMoveEnabled(!inVr);
    store.set({ inVr });
    followCamera(inVr && xr ? xr.baseExperience.camera : desktopCamera);
  });
  xr = setup.xr;

  // 6. Draw, forever.
  engine.runRenderLoop(() => scene.render());

  // 7. Begin the journey.
  await router.goto("welcome.calm");
  console.log("Session 3 ready.");
}

start().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(error);
  const fallback = document.getElementById("fallbackMessage");
  if (fallback) {
    fallback.textContent = `Could not start: ${message}`;
    fallback.hidden = false;
  }
});
