import { WebXRState, type AbstractMesh, type Scene, type WebXRDefaultExperience } from "@babylonjs/core";
import { snapPoints } from "../environments/room";
import { configureTeleportation } from "./teleport";

/**
 * Turns on WebXR.
 *
 * Babylon does most of this for us: `createDefaultXRExperienceAsync` adds the
 * "Enter VR" button, draws the controllers, and gives them a pointer ray. What
 * we add on top is the bit specific to this project — teleport restricted to
 * the six floor discs, and a clear message when VR isn't available.
 *
 * One thing worth understanding: `local-floor` means the headset uses the real
 * floor of your room as height zero. So a tall person and a short person see
 * the counter from their own real height, which is exactly what you want when
 * testing whether the scale is right.
 *
 * (Seated mode, for customers who can't stand, arrives in Session 3 — it needs
 * the accessibility settings screen to switch it on.)
 */

export type XrSetup = {
  xr: WebXRDefaultExperience | null;
  supported: boolean;
};

/**
 * Ask the browser whether it can do VR at all, before we try.
 * Chrome on the Chromebook will say no — that's expected and fine.
 */
export async function isImmersiveVrSupported(): Promise<boolean> {
  const xrSystem = (navigator as Navigator & { xr?: XRSystem }).xr;
  if (!xrSystem?.isSessionSupported) return false;
  try {
    return await xrSystem.isSessionSupported("immersive-vr");
  } catch {
    return false;
  }
}

export async function initialiseWebXR(
  scene: Scene,
  floorMeshes: AbstractMesh[],
  onEnterExit: (inVr: boolean) => void,
): Promise<XrSetup> {
  const supported = await isImmersiveVrSupported();

  if (!supported) {
    console.log("WebXR: no VR headset here. Desktop mode is running normally.");
    showMessage(
      "VR is not available in this browser. You can still explore in 3D — click a floor disc to move.",
    );
    return { xr: null, supported: false };
  }

  try {
    const xr = await scene.createDefaultXRExperienceAsync({
      floorMeshes,

      // We switch Babylon's built-in teleport off here and turn our own
      // version on in teleport.ts, so it can be limited to the six discs.
      disableTeleportation: true,

      uiOptions: {
        sessionMode: "immersive-vr",
        referenceSpaceType: "local-floor",
      },
    });

    configureTeleportation(xr, floorMeshes);

    // Start the customer at the entrance rather than wherever the desktop
    // camera happened to be. Only x and z — the headset decides eye height.
    const arrival = snapPoints.find((point) => point.id === "arrival");
    if (arrival) {
      xr.baseExperience.camera.position.x = arrival.position.x;
      xr.baseExperience.camera.position.z = arrival.position.z;
    }

    xr.baseExperience.onStateChangedObservable.add((state) => {
      const inVr = state === WebXRState.IN_XR;
      onEnterExit(inVr);
      console.log(inVr ? "Entered VR." : "Left VR.");
    });

    console.log("WebXR ready. Press the Enter VR button on the page.");
    return { xr, supported: true };
  } catch (error) {
    console.error("WebXR could not start.", error);
    showMessage(
      `VR could not start: ${error instanceof Error ? error.message : String(error)}`,
    );
    return { xr: null, supported: false };
  }
}

function showMessage(text: string): void {
  const element = document.getElementById("fallbackMessage");
  if (!element) return;
  element.textContent = text;
  element.hidden = false;
}
