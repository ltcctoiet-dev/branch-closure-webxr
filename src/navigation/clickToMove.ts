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
 * Desktop movement: click a floor disc to travel, scroll to step back.
 *
 * NEW: the mouse wheel.
 *
 * A UniversalCamera has no zoom — it's a real viewpoint in a room, not a
 * picture you can pinch. So when a panel sat too close there was no way to back
 * away, because clicking discs only ever put you in the same six places.
 *
 * The wheel now steps you forward and back along your line of sight. It's for
 * you while building, and it's a sensible comfort control for anyone on a
 * laptop — but it stays OFF in VR, where moving someone without their say-so is
 * how you make them queasy.
 */

const MOVE_DURATION_MS = 420;
const WHEEL_STEP_M = 0.35;
const ROOM_LIMIT = 5.4; // stay inside the walls

let enabled = true;

export function setClickToMoveEnabled(value: boolean): void {
  enabled = value;
}

export function attachClickToMove(
  scene: Scene,
  camera: UniversalCamera,
  markers: Mesh[],
): void {
  const markerIds = new Set(markers.map((marker) => marker.name));
  let hovered: AbstractMesh | null = null;

  scene.onPointerObservable.add((info) => {
    if (!enabled) return;

    // --- Wheel: step forward or back ---
    if (info.type === PointerEventTypes.POINTERWHEEL) {
      const event = info.event as WheelEvent;
      const direction = camera.getDirection(Vector3.Forward());
      direction.y = 0;
      direction.normalize();

      // Wheel down (positive deltaY) steps back, which matches how people
      // expect "zoom out" to feel.
      const step = event.deltaY > 0 ? -WHEEL_STEP_M : WHEEL_STEP_M;
      const next = camera.position.add(direction.scale(step));

      camera.position.x = clamp(next.x, -ROOM_LIMIT, ROOM_LIMIT);
      camera.position.z = clamp(next.z, -ROOM_LIMIT, ROOM_LIMIT);
      return;
    }

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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function setGlow(mesh: AbstractMesh, on: boolean): void {
  const material = mesh.material as StandardMaterial | null;
  if (!material) return;
  material.emissiveColor = Color3.FromHexString(
    on ? colours.markerHover : colours.marker,
  ).scale(on ? 0.7 : 0.35);
}

function moveCameraTo(camera: UniversalCamera, target: Vector3): void {
  const destination = new Vector3(target.x, sizes.eyeHeight, target.z);

  Animation.CreateAndStartAnimation(
    "cameraMove",
    camera,
    "position",
    60,
    Math.round((MOVE_DURATION_MS / 1000) * 60),
    camera.position.clone(),
    destination,
    Animation.ANIMATIONLOOPMODE_CONSTANT,
  );
}
