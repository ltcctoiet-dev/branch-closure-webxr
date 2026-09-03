/**
 * Service board — what the Banking Hub offers, as a single lit panel.
 *
 * One plane, drawn entirely on canvas: header, a grid of tiles, footer. Tiles
 * light up one at a time while the avatar talks, so the customer reads along
 * rather than being handed the whole grid at once.
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
  title: "BANKING SERVICES",
  subtitle: "EVERYTHING YOU CAN DO HERE",
  footer: "SECURE  ·  RELIABLE  ·  YOU FIRST",

  yaw: 0,          // straight ahead
  pitch: 2,        // slightly above eye level, like a real board
  distance: 3.0,
  width: 3.4,      // metres
  aspect: 0.62,    // height as a fraction of width

  columns: 3,
  revealMs: 900,   // gap between tiles lighting up
  holdMs: 10000,   // how long it stays once the last tile lands
};

// Background image behind the panel. Set to null for the plain dark fill.
const BACKGROUND = "/images/panel-bg.jpg";

// Overall panel opacity. 0.6 lets the hub show through behind it.
const PANEL_ALPHA = 0.6;

const ACCENT = "#5fd9ec";
const ACCENT_DIM = "rgba(95,217,236,0.30)";

const SERVICES: { heading: string; detail: string }[] = [
  { heading: "CASH & CHEQUES", detail: "Withdrawals · Deposits · Balances" },
  { heading: "PAYMENTS & ACCOUNTS", detail: "Payments · Transfers · Bills" },
  { heading: "DIGITAL BANKING", detail: "Mobile & online · App support" },
  { heading: "FINANCIAL ADVICE", detail: "Savings & ISAs · Loans · Mortgages" },
  { heading: "SPECIALIST SUPPORT", detail: "Bereavement · Power of Attorney" },
  { heading: "BUSINESS BANKING", detail: "Cash & cheques · Till change" },
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
let lastCount = 0;

// Loaded once and reused. Canvas drawing is synchronous, so the panel is drawn
// without it the first time and redrawn when it arrives.
let backgroundImage: HTMLImageElement | null = null;
let backgroundReady = false;

if (BACKGROUND) {
  const img = new Image();
  img.onload = () => {
    backgroundImage = img;
    backgroundReady = true;
    if (texture) drawBoard(lastCount);
  };
  img.onerror = () => console.warn("Panel background failed to load:", BACKGROUND);
  img.src = BACKGROUND;
}

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

/** Corner brackets, a thin edge, and a faint grid across the whole panel. */
function drawChrome(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const inset = 22;
  const bracket = 90;

  ctx.save();
  ctx.strokeStyle = ACCENT;
  ctx.globalAlpha = 0.06;
  ctx.lineWidth = 2;
  const step = 64;
  for (let x = inset; x < w - inset; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, inset);
    ctx.lineTo(x, h - inset);
    ctx.stroke();
  }
  for (let y = inset; y < h - inset; y += step) {
    ctx.beginPath();
    ctx.moveTo(inset, y);
    ctx.lineTo(w - inset, y);
    ctx.stroke();
  }
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = ACCENT;
  ctx.globalAlpha = 0.4;
  ctx.lineWidth = 3;
  roundedRect(ctx, inset, inset, w - inset * 2, h - inset * 2, 26);
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = ACCENT;
  ctx.lineWidth = 7;
  ctx.lineCap = "square";
  ctx.shadowColor = ACCENT;
  ctx.shadowBlur = 22;

  const corners: [number, number, number, number][] = [
    [inset, inset, 1, 1],
    [w - inset, inset, -1, 1],
    [inset, h - inset, 1, -1],
    [w - inset, h - inset, -1, -1],
  ];

  for (const [x, y, dx, dy] of corners) {
    ctx.beginPath();
    ctx.moveTo(x + dx * bracket, y);
    ctx.lineTo(x, y);
    ctx.lineTo(x, y + dy * bracket);
    ctx.stroke();
  }
  ctx.restore();
}

/** Wraps text to a width and returns the lines. */
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

  lastCount = count;

  // Panel body. The background picture is clipped to the rounded panel, then
  // darkened so the white text still reads against whatever is in the image.
  ctx.save();
  roundedRect(ctx, 8, 8, w - 16, h - 16, 30);
  ctx.clip();

  if (backgroundReady && backgroundImage) {
    // Cover: fill the panel without distorting the picture.
    const scale = Math.max(w / backgroundImage.width, h / backgroundImage.height);
    const dw = backgroundImage.width * scale;
    const dh = backgroundImage.height * scale;
    ctx.drawImage(backgroundImage, (w - dw) / 2, (h - dh) / 2, dw, dh);

    ctx.fillStyle = "rgba(2,12,22,0.2)";
    ctx.fillRect(0, 0, w, h);
  } else {
    const backdrop = ctx.createLinearGradient(0, 0, 0, h);
    backdrop.addColorStop(0, "rgba(4,18,30,0.94)");
    backdrop.addColorStop(1, "rgba(2,10,18,0.94)");
    ctx.fillStyle = backdrop;
    ctx.fillRect(0, 0, w, h);
  }

  ctx.restore();

  drawChrome(ctx, w, h);

  const padding = 74;
  const headerHeight = h * 0.22;
  const footerHeight = h * 0.08;

  // --- Header --------------------------------------------------------------

  ctx.save();
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";

  ctx.shadowColor = ACCENT;
  ctx.shadowBlur = 18;
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.font = `600 ${Math.floor(h * 0.085)}px system-ui, sans-serif`;
  ctx.fillText(BOARD.title, padding, headerHeight * 0.46);

  ctx.shadowBlur = 8;
  ctx.fillStyle = "rgba(150,225,240,0.78)";
  ctx.font = `500 ${Math.floor(h * 0.032)}px system-ui, sans-serif`;
  ctx.fillText(BOARD.subtitle, padding + 4, headerHeight * 0.76);
  ctx.restore();

  // Rule under the header.
  ctx.save();
  ctx.strokeStyle = ACCENT;
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(padding, headerHeight);
  ctx.lineTo(w - padding, headerHeight);
  ctx.stroke();
  ctx.restore();

  // --- Tiles ---------------------------------------------------------------

  const cols = BOARD.columns;
  const rows = Math.ceil(SERVICES.length / cols);
  const gap = 26;

  const gridTop = headerHeight + 34;
  const gridHeight = h - gridTop - footerHeight - padding * 0.5;
  const tileW = (w - padding * 2 - gap * (cols - 1)) / cols;
  const tileH = (gridHeight - gap * (rows - 1)) / rows;

  SERVICES.forEach((service, i) => {
    const lit = i < count;
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = padding + col * (tileW + gap);
    const y = gridTop + row * (tileH + gap);

    ctx.save();

    const fill = ctx.createLinearGradient(x, y, x, y + tileH);
    if (lit) {
      fill.addColorStop(0, "rgba(20,72,102,0.3)");
      fill.addColorStop(1, "rgba(8,34,54,0.3)");
    } else {
      fill.addColorStop(0, "rgba(10,26,38,0.12)");
      fill.addColorStop(1, "rgba(6,16,26,0.12)");
    }
    ctx.fillStyle = fill;
    roundedRect(ctx, x, y, tileW, tileH, 16);
    ctx.fill();

    ctx.strokeStyle = lit ? ACCENT : ACCENT_DIM;
    ctx.lineWidth = lit ? 3 : 2;
    if (lit) {
      ctx.shadowColor = ACCENT;
      ctx.shadowBlur = 20;
    }
    roundedRect(ctx, x, y, tileW, tileH, 16);
    ctx.stroke();
    ctx.restore();

    if (!lit) return;

    ctx.save();
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";

    const headingSize = Math.floor(tileH * 0.16);
    const detailSize = Math.floor(tileH * 0.115);
    const textLeft = x + tileW * 0.09;
    const textWidth = tileW * 0.82;

    ctx.font = `700 ${headingSize}px system-ui, sans-serif`;
    const headingLines = wrap(ctx, service.heading, textWidth);

    ctx.font = `400 ${detailSize}px system-ui, sans-serif`;
    const detailLines = wrap(ctx, service.detail, textWidth);

    const headingLead = headingSize * 1.22;
    const detailLead = detailSize * 1.3;
    const block =
      headingLines.length * headingLead + 14 + detailLines.length * detailLead;

    let cursor = y + tileH / 2 - block / 2 + headingLead / 2;

    ctx.shadowColor = ACCENT;
    ctx.shadowBlur = 12;
    ctx.fillStyle = "rgba(255,255,255,0.94)";
    ctx.font = `700 ${headingSize}px system-ui, sans-serif`;
    for (const line of headingLines) {
      ctx.fillText(line, textLeft, cursor);
      cursor += headingLead;
    }

    cursor += 14;

    ctx.shadowBlur = 6;
    ctx.fillStyle = "rgba(190,235,246,0.80)";
    ctx.font = `400 ${detailSize}px system-ui, sans-serif`;
    for (const line of detailLines) {
      ctx.fillText(line, textLeft, cursor);
      cursor += detailLead;
    }

    ctx.restore();
  });

  // --- Footer --------------------------------------------------------------

  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = ACCENT;
  ctx.shadowBlur = 10;
  ctx.fillStyle = "rgba(160,225,240,0.72)";
  ctx.font = `500 ${Math.floor(h * 0.028)}px system-ui, sans-serif`;
  ctx.fillText(BOARD.footer, w / 2, h - footerHeight * 0.7);
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
  material.alpha = PANEL_ALPHA;
  panel.material = material;

  // Frame and header first, tiles dark, then each lights up in turn.
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
