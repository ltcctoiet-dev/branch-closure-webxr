import {
  WebXRFeatureName,
  type AbstractMesh,
  type WebXRDefaultExperience,
  type WebXRMotionControllerTeleportation,
} from "@babylonjs/core";
import { colours } from "../core/theme";
import { snapPoints } from "../environments/room";

/**
 * Teleporting, restricted to the six discs.
 *
 * Why restricted: free movement lets someone teleport into the middle of the
 * counter, or into a wall, or three inches from a panel they can no longer
 * read. Six known positions means every view in the experience is a view you
 * have checked. It also means the desktop clicking and the VR teleporting go to
 * exactly the same places, so there's one journey, not two.
 *
 * If the ✔ line doesn't appear in the console, tell me — the option names have
 * moved between Babylon versions and I'll adjust them for the version you have.
 */
export function configureTeleportation(
  xr: WebXRDefaultExperience,
  floorMeshes: AbstractMesh[],
): void {
  try {
    const teleportation = xr.baseExperience.featuresManager.enableFeature(
      WebXRFeatureName.TELEPORTATION,
      "stable",
      {
        xrInput: xr.input,
        floorMeshes,
        snapPointsOnly: true,
        snapPositions: snapPoints.map((point) => point.position),
        defaultTargetMeshOptions: {
          teleportationFillColor: colours.marker,
          teleportationBorderColor: colours.textLight,
          // No spinning animation on the landing marker: it's one less moving
          // thing for someone who finds VR overwhelming.
          disableAnimation: true,
          disableLighting: true,
        },
      },
    ) as WebXRMotionControllerTeleportation;

    // Belt and braces. The option above sets this on most versions, but on some
    // it's only available as a property, so we set it directly too.
    teleportation.snapPointsOnly = true;

    console.log(`✔ Teleport ready: ${snapPoints.length} snap points, free movement off.`);
  } catch (error) {
    console.error(
      "Teleport setup failed. VR will still work but movement may be unrestricted.",
      error,
    );
  }
}
