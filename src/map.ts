/**
 * Location map — an animated route to the Banking Hub, shown when the avatar
 * tells the customer where it is.
 *
 * Plays a video rather than showing a still: a route drawing itself is easier
 * to follow than a printed map, particularly for someone who is anxious and
 * only sees it once.
 */

import {
  DynamicTexture,
  Mesh,
  MeshBuilder,
  Scene,
  StandardMaterial,
  TransformNode,
  VideoTexture,
} from "@babylonjs/core";

const MAP = {
  video: "/video/hub-map.mp4",
  caption: "Banking Hub · SS4 1AJ · 1.4 miles · bus route 7",
  yaw: -10,        // straight ahead
  pitch: 0,
  distance: 2.8,
  width: 2.8,
  aspect: 9 / 16, // height as a fraction of width; 9/16 suits landscape video
  loop: false,    // true if the animation should keep repeating
  holdMs: 25000, 
   alpha: 0.75,     // panel opacity — lower lets the hub show through // fallback if the video never reports that it ended
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
let videoTexture: VideoTexture | null = null;
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
  videoTexture?.video?.pause();
  videoTexture?.dispose();
  videoTexture = null;
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

  videoTexture = new VideoTexture(
    "mapVideo",
    MAP.video,
    scene,
    true,   // generate mipmaps
    false,  // invertY
    VideoTexture.TRILINEAR_SAMPLINGMODE,
    { autoPlay: true, loop: MAP.loop, muted: true }
  );

  const material = new StandardMaterial("mapMat", scene);
  material.diffuseTexture = videoTexture;
  material.emissiveTexture = videoTexture;
  material.disableLighting = true;
  material.backFaceCulling = false;
  // Maps are usually drawn light; lift it so it reads in a dim room.
  material.emissiveColor.set(1.2, 1.2, 1.2);
  material.alpha = MAP.alpha;
  panel.material = material;

  place(panel, 0);

  // Caption strip beneath, so the postcode stays readable after the animation
  // has finished drawing.
  const caption = MeshBuilder.CreatePlane(
    "mapCaption",
    { width: MAP.width, height: 0.26, sideOrientation: Mesh.DOUBLESIDE },
    scene
  );
  caption.renderingGroupId = 2;
  caption.isPickable = false;

  const capTex = new DynamicTexture(
    "mapCapTex",
    { width: 1024, height: 121 },
    scene,
    true
  );
  const ctx = capTex.getContext() as CanvasRenderingContext2D;
  ctx.clearRect(0, 0, 1024, 121);
  ctx.fillStyle = "rgba(8,58,54,0.95)";
  ctx.fillRect(0, 0, 1024, 121);
  ctx.font = "bold 44px system-ui, sans-serif";
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(MAP.caption, 512, 60);
  capTex.update();

  const capMat = new StandardMaterial("mapCapMat", scene);
  capMat.diffuseTexture = capTex;
  capMat.emissiveTexture = capTex;
  capMat.opacityTexture = capTex;
  capMat.disableLighting = true;
  capMat.backFaceCulling = false;
  caption.material = capMat;

  place(caption, -height / 2 - 0.2);

  // Clear itself when the animation finishes, or after the fallback if the
  // video never fires "ended" — a looping video never does.
  if (!MAP.loop) {
    videoTexture.video?.addEventListener("ended", () => hideMap());
  }
  hideTimer = window.setTimeout(() => hideMap(), MAP.holdMs);

  console.log("Map shown");
}
