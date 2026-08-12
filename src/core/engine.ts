import { Engine } from "@babylonjs/core";

/**
 * Starts Babylon's renderer.
 *
 * You will rarely need to touch this file. The one setting worth knowing about:
 *
 *   preserveDrawingBuffer is false.
 *
 * When it's true, the browser has to keep a copy of every frame it draws. On a
 * phone-class chip like the Quest 3's, that costs real performance. It's only
 * needed if you want to save screenshots of the canvas — turn it on temporarily
 * if you ever do, then turn it back off.
 */
export function createEngine(canvas: HTMLCanvasElement): Engine {
  const engine = new Engine(canvas, true, {
    preserveDrawingBuffer: false,
    stencil: true,
    antialias: true,
    powerPreference: "high-performance",
  });

  // Keeps the picture the right shape when the window changes size.
  window.addEventListener("resize", () => engine.resize());

  return engine;
}
