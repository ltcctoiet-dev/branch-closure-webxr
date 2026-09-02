/**
 * Service board — the list of what the Banking Hub offers.
 *
 * Rows appear one at a time while the avatar talks, so the customer reads
 * along rather than being handed a wall of text.
 */

import {
  DynamicTexture,
  Mesh,
  MeshBuilder,
  Scene,
  StandardMaterial,
  TransformNode,
} from "@babylonjs/core";

const BOARD = {
  title: "Services available",
  yaw: 0,          // straight ahead
  pitch: 2,        // slightly above eye level, like a real board
  distance: 3.0,
  width: 3.0,
  rowHeight: 0.34,
  revealMs: 900,   // gap between rows appearing
  holdMs: 30000,   // how long it stays up once the last row lands
};

const SERVICES: { heading: string; detail: string }[] = [
  { heading: "💷  Cash & Cheques", detail: "Withdrawals · Deposits · Balances" },
  { heading: "💳  Payments & Accounts", detail: "Payments · Transfers · Bills · Account support" },
  { heading: "📱  Digital Banking", detail: "Mobile & online banking · App support" },
  { heading: "🏦  Financial Advice", detail: "Savings & ISAs · Loans · Mortgages" },
  { heading: "🤝  Specialist Support", detail: "Bereavement · Power of Attorney · Account changes" },
  { heading: "💼  Business Banking", detail: "Cash & cheques · Till change · Business support" },
];

type BoardDeps = {
  scene: Scene;
  /** Everything hangs off here so it follows the head rig. */
  world: TransformNode;
};

let deps: BoardDeps | null = null;

export function initBoard(dependencies: BoardDeps) {
  deps = dependencies;
}

let meshes: Mesh[] = [];
let timers: number[] = [];

export const isBoardVisible = () => meshes.length > 0;

function makePlane(
  lines: { text: string; size: number; colour: string }[],
  width: number,
  height: number,
  background: string
): Mesh {
  const { scene } = deps!;

  const plane = MeshBuilder.CreatePlane(
    "boardRow",
    { width, height, sideOrientation: Mesh.DOUBLESIDE },
    scene
  );
  plane.renderingGroupId = 2;
  plane.isPickable = false;

  const texture = new DynamicTexture(
    "boardTex",
    { width: 1024, height: Math.max(64, Math.round((1024 * height) / width)) },
    scene,
    true
  );

  const ctx = texture.getContext() as CanvasRenderingContext2D;
  const w = texture.getSize().width;
  const h = texture.getSize().height;

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, w, h);

  ctx.textAlign = "left";
  ctx.textBaseline = "middle";

  const totalWeight = lines.reduce((sum, l) => sum + l.size, 0);
  let y = h / 2 - (totalWeight * h) / 2;

  for (const line of lines) {
    const fontSize = Math.floor(h * line.size * 0.78);
    ctx.font = `${line.size > 0.45 ? "bold " : ""}${fontSize}px system-ui, sans-serif`;
    ctx.fillStyle = line.colour;
    y += (line.size * h) / 2;
    ctx.fillText(line.text, w * 0.05, y);
    y += (line.size * h) / 2;
  }

  texture.update();

  const material = new StandardMaterial("boardMat", scene);
  material.diffuseTexture = texture;
  material.emissiveTexture = texture;
  material.opacityTexture = texture;
  material.disableLighting = true;
  material.backFaceCulling = false;
  plane.material = material;

  return plane;
}

function place(mesh: Mesh, offsetY: number) {
  const yaw = (BOARD.yaw * Math.PI) / 180;
  const pitch = (BOARD.pitch * Math.PI) / 180;
  const horizontal = BOARD.distance * Math.cos(pitch);

  mesh.position.set(
    horizontal * Math.sin(yaw),
    BOARD.distance * Math.sin(pitch) + offsetY,
    horizontal * Math.cos(yaw)
  );
  mesh.rotation.y = yaw;
  mesh.parent = deps!.world;
  meshes.push(mesh);
}

export function hideServiceBoard() {
  timers.forEach((t) => clearTimeout(t));
  timers = [];
  meshes.forEach((m) => m.dispose(false, true));
  meshes = [];
}

export function showServiceBoard() {
  if (!deps) {
    console.error("Service board used before initBoard().");
    return;
  }

  hideServiceBoard();

  const { rowHeight, width, revealMs } = BOARD;
  const top = (SERVICES.length * rowHeight) / 2;

  const title = makePlane(
    [{ text: BOARD.title, size: 1, colour: "#ffffff" }],
    width,
    0.42,
    "rgba(8,58,54,0.95)"
  );
  place(title, top + 0.34);

  SERVICES.forEach((service, i) => {
    const timer = window.setTimeout(() => {
      const row = makePlane(
        [
          { text: service.heading, size: 0.52, colour: "#ffffff" },
          { text: service.detail, size: 0.42, colour: "#bfe8e3" },
        ],
        width,
        rowHeight,
        i % 2 === 0 ? "rgba(12,32,48,0.92)" : "rgba(16,40,58,0.92)"
      );
      place(row, top - rowHeight / 2 - i * rowHeight);
    }, i * revealMs);

    timers.push(timer);
  });

  // Clears itself once the customer has had time to read it. Counted from
  // the last row appearing, not from the start.
  const totalReveal = SERVICES.length * revealMs;
  timers.push(
    window.setTimeout(() => hideServiceBoard(), totalReveal + BOARD.holdMs)
  );

  console.log("Service board shown");
}