/**
 * Service board — what the Banking Hub offers, on a pane of frosted glass.
 *
 * One plane, drawn entirely on canvas. The panel is genuinely translucent, so
 * the hub shows through behind it rather than sitting on a picture of one.
 * Items fade up one at a time while the avatar talks, so the customer reads
 * along instead of being handed the whole grid at once.
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
  title: "OUR BANKING SERVICES",
  subtitle: "Everything you can do here.",
  footer: "We're here to help. Just ask, and I'll take you to the right place.",

  yaw: -10,          // straight ahead
  pitch: 2,        // slightly above eye level, like a real board
  distance: 3.0,
  width: 3.2,      // metres
  aspect: 0.68,    // height as a fraction of width

  columns: 3,
  revealMs: 900,   // gap between items appearing
  holdMs: 10000,   // how long it stays once the last item lands
};

// Frosted glass: a warm off-white at low opacity, so what is behind reads
// through it. Navy type, because pale text on pale glass disappears.
const GLASS_TOP = "rgba(250,248,243,0.62)";
const GLASS_BOTTOM = "rgba(238,240,245,0.52)";
const EDGE = "rgba(255,255,255,0.9)";
const NAVY = "#123a6d";
const NAVY_SOFT = "#3f5f8c";
const RULE = "rgba(18,58,109,0.18)";

const SERVICES: { heading: string; detail: string }[] = [
  { heading: "CASH & CHEQUES", detail: "Withdrawals, deposits and balances." },
  { heading: "PAYMENTS & ACCOUNTS", detail: "Payments, transfers and bills." },
  { heading: "DIGITAL BANKING", detail: "Mobile and online banking support." },
  { heading: "FINANCIAL ADVICE", detail: "Savings, ISAs, loans and mortgages." },
  { heading: "SPECIALIST SUPPORT", detail: "Bereavement and Power of Attorney." },
  { heading: "BUSINESS BANKING", detail: "Cash, cheques and till change." },
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

let panel: Mesh | null = null;
let texture: DynamicTexture | null = null;
let timers: number[] = [];

export const isBoardVisible = () => panel !== null;

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/** The pane itself: frosted fill, a soft diagonal sheen, and a bright edge. */
function drawGlass(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const inset = 14;
  const radius = 28;

  ctx.save();
  roundedRect(ctx, inset, inset, w - inset * 2, h - inset * 2, radius);
  ctx.clip();

  const fill = ctx.createLinearGradient(0, 0, 0, h);
  fill.addColorStop(0, GLASS_TOP);
  fill.addColorStop(1, GLASS_BOTTOM);
  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, w, h);

  // A light streak across the upper left, as though a window were reflecting
  // off it. Keeps the pane from looking like flat paper.
  const sheen = ctx.createLinearGradient(0, 0, w * 0.75, h);
  sheen.addColorStop(0, "rgba(255,255,255,0.34)");
  sheen.addColorStop(0.32, "rgba(255,255,255,0.06)");
  sheen.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, w, h);

  ctx.restore();

  // Bright outer edge, then a finer inner line for thickness.
  ctx.save();
  ctx.strokeStyle = EDGE;
  ctx.lineWidth = 5;
  roundedRect(ctx, inset, inset, w - inset * 2, h - inset * 2, radius);
  ctx.stroke();

  ctx.strokeStyle = "rgba(255,255,255,0.45)";
  ctx.lineWidth = 2;
  roundedRect(ctx, inset + 10, inset + 10, w - inset * 2 - 20, h - inset * 2 - 20, radius - 8);
  ctx.stroke();
  ctx.restore();
}

/** A thin ring, standing in for the circled icons on a printed board. */
function drawRing(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  alpha: number
) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = NAVY;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();

  // A small mark inside, so the ring is not simply empty.
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.34, cy + r * 0.2);
  ctx.lineTo(cx - r * 0.1, cy - r * 0.16);
  ctx.lineTo(cx + r * 0.12, cy + r * 0.1);
  ctx.lineTo(cx + r * 0.36, cy - r * 0.28);
  ctx.stroke();
  ctx.restore();
}

function wrap(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }

  lines.push(line);
  return lines;
}

function drawBoard(count: number) {
  if (!texture) return;

  const ctx = texture.getContext() as CanvasRenderingContext2D;
  const w = texture.getSize().width;
  const h = texture.getSize().height;

  ctx.clearRect(0, 0, w, h);
  drawGlass(ctx, w, h);

  const padding = w * 0.075;
  const headerHeight = h * 0.24;
  const footerHeight = h * 0.11;

  // --- Header --------------------------------------------------------------

  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  ctx.fillStyle = NAVY;
  ctx.font = `700 ${Math.floor(h * 0.072)}px Georgia, "Times New Roman", serif`;
  ctx.fillText(BOARD.title, w / 2, headerHeight * 0.5);

  // Rule with a small diamond at its centre.
  const ruleY = headerHeight * 0.71;
  const ruleHalf = w * 0.26;
  ctx.strokeStyle = RULE;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(w / 2 - ruleHalf, ruleY);
  ctx.lineTo(w / 2 - 16, ruleY);
  ctx.moveTo(w / 2 + 16, ruleY);
  ctx.lineTo(w / 2 + ruleHalf, ruleY);
  ctx.stroke();

  ctx.fillStyle = RULE;
  ctx.beginPath();
  ctx.arc(w / 2, ruleY, 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = NAVY_SOFT;
  ctx.font = `400 ${Math.floor(h * 0.032)}px system-ui, sans-serif`;
  ctx.fillText(BOARD.subtitle, w / 2, headerHeight * 0.9);
  ctx.restore();

  // --- Items ---------------------------------------------------------------

  const cols = BOARD.columns;
  const rows = Math.ceil(SERVICES.length / cols);
  const gridTop = headerHeight + h * 0.02;
  const gridHeight = h - gridTop - footerHeight - h * 0.03;
  const cellW = (w - padding * 2) / cols;
  const cellH = gridHeight / rows;

  // Dividing lines rather than boxes — closer to a printed board, and it lets
  // the glass read as one continuous pane.
  ctx.save();
  ctx.strokeStyle = RULE;
  ctx.lineWidth = 1.5;
  for (let c = 1; c < cols; c++) {
    const x = padding + c * cellW;
    ctx.beginPath();
    ctx.moveTo(x, gridTop + cellH * 0.12);
    ctx.lineTo(x, gridTop + gridHeight - cellH * 0.12);
    ctx.stroke();
  }
  for (let r = 1; r < rows; r++) {
    const y = gridTop + r * cellH;
    ctx.beginPath();
    ctx.moveTo(padding + cellW * 0.08, y);
    ctx.lineTo(w - padding - cellW * 0.08, y);
    ctx.stroke();
  }
  ctx.restore();

  SERVICES.forEach((service, i) => {
    const lit = i < count;
    if (!lit) return;

    const col = i % cols;
    const row = Math.floor(i / cols);
    const cx = padding + col * cellW + cellW / 2;
    const cy = gridTop + row * cellH;

    const ringR = cellH * 0.15;
    drawRing(ctx, cx, cy + cellH * 0.26, ringR, 0.85);

    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const headingSize = Math.floor(cellH * 0.115);
    const detailSize = Math.floor(cellH * 0.092);
    const textWidth = cellW * 0.82;

    ctx.fillStyle = NAVY;
    ctx.font = `700 ${headingSize}px system-ui, sans-serif`;
    ctx.fillText(service.heading, cx, cy + cellH * 0.52);

    ctx.fillStyle = NAVY_SOFT;
    ctx.font = `400 ${detailSize}px system-ui, sans-serif`;
    const detailLines = wrap(ctx, service.detail, textWidth);
    let dy = cy + cellH * 0.68;
    for (const line of detailLines) {
      ctx.fillText(line, cx, dy);
      dy += detailSize * 1.32;
    }

    ctx.restore();
  });

  // --- Footer --------------------------------------------------------------

  const footTop = h - footerHeight - 14;

  ctx.save();
  roundedRect(ctx, 14, footTop, w - 28, footerHeight, 20);
  ctx.clip();
  ctx.fillStyle = "rgba(196,212,232,0.55)";
  ctx.fillRect(0, footTop, w, footerHeight + 20);
  ctx.restore();

  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = NAVY;
  ctx.font = `500 ${Math.floor(h * 0.03)}px system-ui, sans-serif`;
  ctx.fillText(BOARD.footer, w / 2, footTop + footerHeight / 2);
  ctx.restore();

  texture.update();
}

// ---------------------------------------------------------------------------
// Show and hide
// ---------------------------------------------------------------------------

export function hideServiceBoard() {
  timers.forEach((t) => clearTimeout(t));
  timers = [];
  texture?.dispose();
  texture = null;
  panel?.dispose(false, true);
  panel = null;
}

export function showServiceBoard() {
  if (!deps) {
    console.error("Service board used before initBoard().");
    return;
  }

  hideServiceBoard();

  const { scene, world } = deps;
  const height = BOARD.width * BOARD.aspect;

  panel = MeshBuilder.CreatePlane(
    "serviceBoard",
    { width: BOARD.width, height, sideOrientation: Mesh.DOUBLESIDE },
    scene
  );
  panel.renderingGroupId = 2;
  panel.isPickable = false;

  const yaw = (BOARD.yaw * Math.PI) / 180;
  const pitch = (BOARD.pitch * Math.PI) / 180;
  const horizontal = BOARD.distance * Math.cos(pitch);

  panel.position.set(
    horizontal * Math.sin(yaw),
    BOARD.distance * Math.sin(pitch),
    horizontal * Math.cos(yaw)
  );
  panel.rotation.y = yaw;
  panel.parent = world;

  texture = new DynamicTexture(
    "boardTex",
    { width: 1600, height: Math.round(1600 * BOARD.aspect) },
    scene,
    true
  );
  texture.hasAlpha = true;

  const material = new StandardMaterial("boardMat", scene);
  material.diffuseTexture = texture;
  material.emissiveTexture = texture;
  material.opacityTexture = texture;
  material.disableLighting = true;
  material.backFaceCulling = false;
  // The translucency lives in the canvas, not here — otherwise the navy type
  // fades out along with the glass.
  material.alpha = 1;
  panel.material = material;

  // Glass and header first, then each item fades up in turn.
  drawBoard(0);

  SERVICES.forEach((_, i) => {
    timers.push(
      window.setTimeout(() => drawBoard(i + 1), (i + 1) * BOARD.revealMs)
    );
  });

  const totalReveal = (SERVICES.length + 1) * BOARD.revealMs;
  timers.push(
    window.setTimeout(() => hideServiceBoard(), totalReveal + BOARD.holdMs)
  );

  console.log("Service board shown");
}
