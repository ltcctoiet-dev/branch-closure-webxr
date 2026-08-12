/**
 * Every colour and size in the experience lives here.
 *
 * Why one file: when someone says "the blue is too dark" or "the text is too
 * small in the headset", you change one number here rather than hunting through
 * a dozen files.
 *
 * In Session 3 this file grows a high-contrast version and a larger-text
 * option, because both are accessibility settings the script promises the
 * customer. The names below won't change, so nothing you build now will break.
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

  success: "#2E7D32",
  warning: "#C77700",
};

/**
 * Text sizes, in pixels on a panel texture.
 *
 * These matter more than they look. In Session 3 we put text on a panel in the
 * headset and check you can read it from 2.4 metres away. If you can't, this is
 * the object you edit.
 */
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

  /** How tall the customer's eyes are when standing. */
  eyeHeight: 1.6,

  /** Radius of the floor discs you click to move to. */
  markerRadius: 0.42,
};
