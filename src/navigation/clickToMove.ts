import {
  Animation,
  Color3,
  PointerEventTypes,
  StandardMaterial,
  Vector3,
  type AbstractMesh,
  type Mesh,
  type Scene,
  type UniversalCamera,
} from "@babylonjs/core";
import { colours, sizes } from "../core/theme";
import { snapPoints } from "../environments/room";

/**
 * Click a floor disc, move there.
 *
 * Why clicking rather than WASD: in the headset the customer moves by pointing
 * a controller at a spot and pressing a button. Clicking with a mouse is the
 * same idea with a different device, so there's one way to move in the product
 * rather than two. It also needs no keyboard, which matters when the person
 * using this may not be confident with computers.
 *
 * Session 2 hands these same six positions to the Quest controllers.
 */

const MOVE_DURATION_MS = 420;

export function attachClickToMove(
  scene: Scene,
  camera: UniversalCamera,
  markers: Mesh[],
): void {
  const markerIds = new Set(markers.map((marker) => marker.name));
  let hovered: AbstractMesh | null = null;

  scene.onPointerObservable.add((info) => {
    const picked = info.pickInfo?.pickedMesh ?? null;
    const isMarker = picked !== null && markerIds.has(picked.name);

    // --- Hover: brighten the disc under the pointer ---
    if (info.type === PointerEventTypes.POINTERMOVE) {
      const target = isMarker ? picked : null;
      if (target === hovered) return;

      if (hovered) setGlow(hovered, false);
      hovered = target;
      if (hovered) setGlow(hovered, true);
      return;
    }

    // --- Click: move there ---
    if (info.type === PointerEventTypes.POINTERPICK && isMarker && picked) {
      const id = (picked.metadata as { snapPointId?: string } | null)?.snapPointId;
      const point = snapPoints.find((candidate) => candidate.id === id);
      if (!point) return;

      moveCameraTo(camera, point.position);
      console.log(`Moved to: ${point.label}`);
    }
  });
}

function setGlow(mesh: AbstractMesh, on: boolean): void {
  const material = mesh.material as StandardMaterial | null;
  if (!material) return;
  material.emissiveColor = Color3.FromHexString(
    on ? colours.markerHover : colours.marker,
  ).scale(on ? 0.7 : 0.35);
}

function moveCameraTo(camera: UniversalCamera, target: Vector3): void {
  // Keep the camera at eye height — the snap point is on the floor.
  const destination = new Vector3(target.x, sizes.eyeHeight, target.z);

  Animation.CreateAndStartAnimation(
    "cameraMove",
    camera,
    "position",
    60, // frames per second
    Math.round((MOVE_DURATION_MS / 1000) * 60),
    camera.position.clone(),
    destination,
    Animation.ANIMATIONLOOPMODE_CONSTANT,
  );
}
