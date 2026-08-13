import { store } from "./store";

/**
 * Every colour and size in the experience lives here.
 *
 * CHANGED IN SESSION 3: two new things at the bottom — a high-contrast palette
 * and a larger-text option, both of which the script promises the customer.
 *
 * `colours` and `sizes` are unchanged, so room.ts, clickToMove.ts and
 * teleport.ts keep working exactly as they did.
 */

export const colours = {
  background: "#EAF2F8", // sky / empty space beyond the room
  wall: "#D9EAF7",
  floor: "#D4D7DB",
  counter: "#8C6239", // placeholder wood, replaced by a real model in Week 3

  panel: "#1F4E79", // dark blue behind text
  panelEdge: "#5B8DB8",
  action: "#2F75B5", // buttons
  actionHover: "#3E8FD9",

  textLight: "#FFFFFF",
  textMuted: "#CFE0EE",
  textDark: "#17202A",

  marker: "#00A6A6", // the floor discs you click to move
  markerHover: "#4FE0E0",

  selected: "#00A6A6",
  success: "#2E7D32",
  warning: "#C77700",
};

export const textSizes = {
  title: 60,
  body: 40,
  button: 38,
  caption: 30,
  subtitle: 46,
};

/** Sizes in metres. 1 unit in the scene = 1 real metre. */
export const sizes = {
  roomWidth: 12,
  roomDepth: 12,
  wallHeight: 3.2,

  eyeHeight: 1.6,
  markerRadius: 0.42,

  // --- Panel, new in Session 3 ---
  //
  // The plane is 3.0m x 1.875m and the picture painted onto it is 1536 x 960
  // pixels. Those two ratios MUST match (both are 1.6) or all the text comes
  // out stretched.
  //
  // 1536 pixels across 3 metres = 512 pixels per metre. So the 40px body text
  // is about 7.8cm tall in the room. That is the number the headset check at
  // the end of this session is really testing.
  panelWidthM: 3.0,
  panelHeightM: 1.875,
  panelTextureW: 1536,
  panelTextureH: 960,

  /** How far in front of the customer the panel floats. */
  panelDistanceM: 2.4,
  /** How high off the floor its centre sits. */
  panelCentreHeightM: 1.45,

  /** Smallest comfortable button, in panel pixels. ~18cm in the room. */
  minTargetPx: 92,
};

// ---------------------------------------------------------------------------
// High contrast
// ---------------------------------------------------------------------------
//
// This is a complete swap, not a filter. Darkening the text alone would leave
// pale blue buttons behind, which is exactly what someone who needs high
// contrast can't read.
//
// Note the room itself doesn't change — walls and floor stay as they are. High
// contrast is about reading text, and repainting the whole room black is
// disorienting rather than helpful.

const contrastUi = {
  panel: "#000000",
  panelEdge: "#FFFFFF",
  action: "#000000",
  actionHover: "#333333",
  textLight: "#FFFF00", // yellow on black is the strongest common pairing
  textMuted: "#FFFFFF",
  selected: "#FFFF00",
  success: "#00FF66",
  warning: "#FFAA00",
};

/** Colours for panels and buttons. Switches when high contrast is on. */
export function uiPalette() {
  if (!store.get().highContrast) {
    return {
      panel: colours.panel,
      panelEdge: colours.panelEdge,
      action: colours.action,
      actionHover: colours.actionHover,
      textLight: colours.textLight,
      textMuted: colours.textMuted,
      selected: colours.selected,
      success: colours.success,
      warning: colours.warning,
    };
  }
  return contrastUi;
}

/** Text sizes, 25% larger when "Larger text" is on. */
export function uiText() {
  const scale = store.get().largeText ? 1.25 : 1;
  return {
    title: Math.round(textSizes.title * scale),
    body: Math.round(textSizes.body * scale),
    button: Math.round(textSizes.button * scale),
    caption: Math.round(textSizes.caption * scale),
    subtitle: Math.round(textSizes.subtitle * scale),
  };
}

/**
 * How long to leave a subtitle line on screen.
 * Roughly reading speed, stretched if the customer asked for more time.
 */
export function readingTimeMs(line: string): number {
  const words = line.trim().split(/\s+/).length;
  const base = 900 + words * 260;
  return store.get().extraReadingTime ? Math.round(base * 1.6) : base;
}
