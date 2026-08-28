/**
 * Location map — shown when the avatar tells the customer where the Banking
 * Hub is. A single image on a panel, with a caption beneath it.
 */

import {
  DynamicTexture,
  Mesh,
  MeshBuilder,
  Scene,
  StandardMaterial,
  Texture,
  TransformNode,
} from "@babylonjs/core";

const MAP = {
  image: "/images/hub-map.png",
  caption: "Banking Hub · SS4 1AJ · 1.4 miles · bus route 7",
  yaw: 0,        // straight ahead
  pitch: 0,
  distance: 2.8,
  width: 2.2,
  aspect: 3 / 4, // height as a fraction of width; 3/4 suits a landscape map
  holdMs: 10000,
};

type MapDeps = {
  scene: Scene;
  world: TransformNode;
};

let deps: MapDeps | null = null;

export function initMap(dependencies: MapDeps) {
  deps = dependencies;
}

let meshes: Mesh[] = [];
let hideTimer = 0;

export const isMapVisible = () => meshes.length > 0;

function basis() {
  const yaw = (MAP.yaw * Math.PI) / 180;
  const pitch = (MAP.pitch * Math.PI) / 180;
  const horizontal = MAP.distance * Math.cos(pitch);

  return {
    yaw,
    x: horizontal * Math.sin(yaw),
    y: MAP.distance * Math.sin(pitch),
    z: horizontal * Math.cos(yaw),
  };
}

function place(mesh: Mesh, offsetY: number) {
  const { yaw, x, y, z } = basis();
  mesh.position.set(x, y + offsetY, z);
  mesh.rotation.y = yaw;
  mesh.parent = deps!.world;
  meshes.push(mesh);
}

export function hideMap() {
  clearTimeout(hideTimer);
  meshes.forEach((m) => m.dispose(false, true));
  meshes = [];
}

export function showMap() {
  if (!deps) {
    console.error("Map used before initMap().");
    return;
  }

  hideMap();

  const { scene } = deps;
  const height = MAP.width * MAP.aspect;

  const panel = MeshBuilder.CreatePlane(
    "mapPanel",
    { width: MAP.width, height, sideOrientation: Mesh.DOUBLESIDE },
    scene
  );
  panel.renderingGroupId = 2;
  panel.isPickable = false;

  const texture = new Texture(MAP.image, scene);

  const material = new StandardMaterial("mapMat", scene);
  material.diffuseTexture = texture;
  material.emissiveTexture = texture;
  material.disableLighting = true;
  material.backFaceCulling = false;
  // Maps are usually printed light; lift it so it reads in a dim room.
  material.emissiveColor.set(1.25, 1.25, 1.25);
  panel.material = material;

  place(panel, 0);

  // Caption strip beneath.
  const caption = MeshBuilder.CreatePlane(
    "mapCaption",
    { width: MAP.width, height: 0.3, sideOrientation: Mesh.DOUBLESIDE },
    scene
  );
  caption.renderingGroupId = 2;
  caption.isPickable = false;

  const capTex = new DynamicTexture(
    "mapCapTex",
    { width: 1024, height: 102 },
    scene,
    true
  );
  const ctx = capTex.getContext() as CanvasRenderingContext2D;
  ctx.clearRect(0, 0, 1024, 102);
  ctx.fillStyle = "rgba(8,58,54,0.95)";
  ctx.fillRect(0, 0, 1024, 102);
  ctx.font = "bold 44px system-ui, sans-serif";
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(MAP.caption, 512, 51);
  capTex.update();

  const capMat = new StandardMaterial("mapCapMat", scene);
  capMat.diffuseTexture = capTex;
  capMat.emissiveTexture = capTex;
  capMat.opacityTexture = capTex;
  capMat.disableLighting = true;
  capMat.backFaceCulling = false;
  caption.material = capMat;

  place(caption, -height / 2 - 0.22);

  hideTimer = window.setTimeout(() => hideMap(), MAP.holdMs);

  console.log("Map shown");
}