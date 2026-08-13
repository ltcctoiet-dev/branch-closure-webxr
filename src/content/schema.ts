import { TOGGLEABLE_KEYS, type ConcernType, type ToggleableKey } from "../core/store";

/**
 * The shape of a scene.
 *
 * THE RULE FOR THE REST OF THE PROJECT: no sentence a customer will read is
 * ever typed into a .ts file. It all lives in public/data/scenes.json.
 *
 * Why it matters here specifically: the script is an approved document. When
 * someone changes a line, that's an edit to a JSON file, not a code change and
 * a rebuild. And when you add the other 38 scenes, you won't write any code —
 * you'll write records like the seven already in there.
 */

export type ScaleQuestion = {
  /** Where the answer is stored, e.g. "concernBefore". */
  id: string;
  prompt: string;
  minLabel: string;
  maxLabel: string;
};

export type Choice = {
  id: string;
  label: string;
  /** Which scene to go to. */
  goto?: string;
  /** Remember which concern the customer picked. */
  setsConcern?: ConcernType;
  /** Switch an accessibility setting on or off. */
  toggles?: ToggleableKey;
  /** Go back to whatever we were doing before the pause. */
  resume?: boolean;
  /** End the session. */
  exits?: boolean;
};

export type SceneRecord = {
  id: string;
  /** Which of the 13 scripted scenarios this came from. Useful for review. */
  scenario: number;
  title: string;
  /** One entry per spoken line. Also what the subtitles show. */
  narration: string[];
  /** For the voice recordings later. Not used yet. */
  audioKey?: string;

  /** A snap point id — the panel sits there instead of following the customer. */
  anchor?: string;

  scales?: ScaleQuestion[];
  choices?: Choice[];
  /** Buttons stay pressable and the scene doesn't move on. */
  multiSelect?: boolean;
  /** An extra opening line depending on which concern was chosen. */
  responses?: Partial<Record<NonNullable<ConcernType>, string>>;
  /** Can be layered on top of any scene (the pause screen). */
  interrupt?: boolean;
};

export class SceneValidationError extends Error {}

/**
 * Checks the JSON before the app starts.
 *
 * This is deliberately strict. A typo in scenes.json should stop everything
 * with a message naming the problem, rather than producing a blank panel
 * halfway through a demo.
 */
export function validateScenes(raw: unknown): Map<string, SceneRecord> {
  if (!Array.isArray(raw)) {
    throw new SceneValidationError("scenes.json must be a list of scenes, wrapped in [ ].");
  }

  const scenes = new Map<string, SceneRecord>();

  raw.forEach((entry, index) => {
    const rec = entry as Partial<SceneRecord>;
    const where = `scene number ${index + 1}`;

    if (typeof rec.id !== "string" || rec.id.length === 0) {
      throw new SceneValidationError(`${where}: has no "id".`);
    }
    if (scenes.has(rec.id)) {
      throw new SceneValidationError(`${where}: "${rec.id}" is used twice.`);
    }
    if (typeof rec.scenario !== "number") {
      throw new SceneValidationError(`${rec.id}: "scenario" must be a number from 1 to 13.`);
    }
    if (typeof rec.title !== "string") {
      throw new SceneValidationError(`${rec.id}: has no "title".`);
    }
    if (!Array.isArray(rec.narration) || rec.narration.some((n) => typeof n !== "string")) {
      throw new SceneValidationError(`${rec.id}: "narration" must be a list of sentences.`);
    }

    rec.choices?.forEach((choice, ci) => {
      if (typeof choice.id !== "string" || typeof choice.label !== "string") {
        throw new SceneValidationError(`${rec.id}: button ${ci + 1} needs an "id" and a "label".`);
      }
      if (choice.toggles && !TOGGLEABLE_KEYS.includes(choice.toggles)) {
        throw new SceneValidationError(
          `${rec.id}: button "${choice.id}" tries to switch "${choice.toggles}", which isn't a setting. ` +
            `Allowed: ${TOGGLEABLE_KEYS.join(", ")}.`,
        );
      }
      if (!choice.goto && !choice.toggles && !choice.resume && !choice.exits) {
        throw new SceneValidationError(
          `${rec.id}: button "${choice.id}" does nothing — it needs goto, toggles, resume or exits.`,
        );
      }
    });

    rec.scales?.forEach((scale, si) => {
      if (!scale.id || !scale.prompt) {
        throw new SceneValidationError(`${rec.id}: scale ${si + 1} needs an "id" and a "prompt".`);
      }
    });

    scenes.set(rec.id, rec as SceneRecord);
  });

  // Second pass: check every "goto" points at a scene that actually exists.
  // This is the check that catches typos before the headset does.
  scenes.forEach((scene) => {
    scene.choices?.forEach((choice) => {
      if (choice.goto && !scenes.has(choice.goto)) {
        throw new SceneValidationError(
          `${scene.id}: button "${choice.id}" points at "${choice.goto}", which doesn't exist.`,
        );
      }
    });
  });

  return scenes;
}

export async function loadScenes(url = "/data/scenes.json"): Promise<Map<string, SceneRecord>> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new SceneValidationError(`Could not open ${url} (error ${response.status}).`);
  }
  return validateScenes(await response.json());
}
