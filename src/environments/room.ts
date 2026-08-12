import {
  Color3,
  HemisphericLight,
  Mesh,
  MeshBuilder,
  StandardMaterial,
  UniversalCamera,
  Vector3,
  type Scene,
} from "@babylonjs/core";
import { colours, sizes } from "../core/theme";

/**
 * ============================================================
 * ROOM CONVENTION — read this before you model anything
 * ============================================================
 *
 * Directions are fixed for the whole project. Write them in your README too.
 *
 *   (0, 0, 0)   floor, where the customer arrives
 *   -Z          the street entrance, where they come in from
 *   +Z          the back of the room
 *   -X          the counter runs along this side
 *   +X          the private room and Community Banker board
 *   +Y          up
 *
 *   1 unit = 1 metre. Always.
 *
 * When you export from Blender in Week 3: -Z forward, +Y up, apply all
 * transforms, scale 1.0. Almost every "why is my model facing the wrong way"
 * problem comes from nobody writing this down.
 */

/** A place the customer can stand. Used by clicking now, and by the Quest controllers in Session 2. */
export type SnapPoint = {
  id: string;
  label: string;
  position: Vector3;
};

export const snapPoints: SnapPoint[] = [
  { id: "arrival", label: "Entrance", position: new Vector3(0, 0, -2.2) },
  { id: "waiting", label: "Seating area", position: new Vector3(3.4, 0, -1.4) },
  { id: "counter", label: "Counter", position: new Vector3(-3.0, 0, 1.5) },
  { id: "privateRoom", label: "Private room", position: new Vector3(3.6, 0, 2.6) },
  { id: "communityBanker", label: "Community Banker", position: new Vector3(4.4, 0, 4.2) },
  { id: "centre", label: "Centre of the room", position: new Vector3(0, 0, 0) },
];

export type Room = {
  camera: UniversalCamera;
  floor: Mesh;
  markers: Mesh[];
};

export function createRoom(scene: Scene): Room {
  // --- The customer's viewpoint ---------------------------------------
  //
  // UniversalCamera, not ArcRotateCamera. ArcRotate orbits around a point,
  // which feels like inspecting a model of a room. This one puts you inside it.
  const camera = new UniversalCamera(
    "customerCamera",
    new Vector3(0, sizes.eyeHeight, -2.2),
    scene,
  );
  camera.setTarget(new Vector3(0, 1.5, 0));
  camera.minZ = 0.1;
  camera.attachControl(scene.getEngine().getRenderingCanvas(), true);

  // Arrow keys and WASD are switched off on purpose. Movement is clicking a
  // floor disc — no keyboard needed, which matters for the customers this is for.
  camera.keysUp = [];
  camera.keysDown = [];
  camera.keysLeft = [];
  camera.keysRight = [];

  // --- Light ----------------------------------------------------------
  const light = new HemisphericLight("ambientLight", new Vector3(0, 1, 0), scene);
  light.intensity = 0.95;

  // --- Materials ------------------------------------------------------
  const floorMaterial = new StandardMaterial("floorMaterial", scene);
  floorMaterial.diffuseColor = Color3.FromHexString(colours.floor);
  floorMaterial.specularColor = Color3.Black(); // no plastic-looking shine

  const wallMaterial = new StandardMaterial("wallMaterial", scene);
  wallMaterial.diffuseColor = Color3.FromHexString(colours.wall);
  wallMaterial.specularColor = Color3.Black();

  // --- Floor ----------------------------------------------------------
  const floor = MeshBuilder.CreateGround(
    "floor",
    { width: sizes.roomWidth, height: sizes.roomDepth },
    scene,
  );
  floor.material = floorMaterial;

  // --- Walls and ceiling ----------------------------------------------
  const halfW = sizes.roomWidth / 2;
  const halfD = sizes.roomDepth / 2;
  const midHeight = sizes.wallHeight / 2;

  const buildWall = (name: string, w: number, d: number, at: Vector3) => {
    const wall = MeshBuilder.CreateBox(
      name,
      { width: w, height: sizes.wallHeight, depth: d },
      scene,
    );
    wall.position = at;
    wall.material = wallMaterial;
    wall.isPickable = false; // you can't click a wall to move into it
  };

  buildWall("wallBack", sizes.roomWidth, 0.12, new Vector3(0, midHeight, halfD));
  buildWall("wallFront", sizes.roomWidth, 0.12, new Vector3(0, midHeight, -halfD));
  buildWall("wallLeft", 0.12, sizes.roomDepth, new Vector3(-halfW, midHeight, 0));
  buildWall("wallRight", 0.12, sizes.roomDepth, new Vector3(halfW, midHeight, 0));

  const ceiling = MeshBuilder.CreateGround(
    "ceiling",
    { width: sizes.roomWidth, height: sizes.roomDepth },
    scene,
  );
  ceiling.position.y = sizes.wallHeight;
  ceiling.rotation.x = Math.PI; // flip it so it faces down into the room
  ceiling.material = wallMaterial;
  ceiling.isPickable = false;

  // --- Placeholder counter --------------------------------------------
  // A brown block for now. Week 3 replaces it with a real model, in this exact
  // position, so everything you build against it keeps working.
  const counterMaterial = new StandardMaterial("counterMaterial", scene);
  counterMaterial.diffuseColor = Color3.FromHexString(colours.counter);
  counterMaterial.specularColor = Color3.Black();

  const counter = MeshBuilder.CreateBox(
    "counter",
    { width: 0.8, height: 1.1, depth: 5 },
    scene,
  );
  counter.position = new Vector3(-4.2, 0.55, 1.5);
  counter.material = counterMaterial;
  counter.isPickable = false;

  // --- The floor discs -------------------------------------------------
  const markerMaterial = new StandardMaterial("markerMaterial", scene);
  markerMaterial.diffuseColor = Color3.FromHexString(colours.marker);
  markerMaterial.emissiveColor = Color3.FromHexString(colours.marker).scale(0.35);
  markerMaterial.alpha = 0.6;

  const markers = snapPoints.map((point) => {
    const disc = MeshBuilder.CreateDisc(
      `marker_${point.id}`,
      { radius: sizes.markerRadius, tessellation: 32 },
      scene,
    );
    disc.rotation.x = Math.PI / 2; // lie it flat on the floor
    disc.position = point.position.clone();
    disc.position.y = 0.02; // a whisker above the floor, or it flickers
    disc.material = markerMaterial;
    // The id is stored on the mesh so clickToMove knows which point it is.
    disc.metadata = { snapPointId: point.id };
    return disc;
  });

  return { camera, floor, markers };
}
