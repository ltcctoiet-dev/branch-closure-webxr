import { TOGGLEABLE_KEYS, VOICE_IDS, type ConcernType, type ToggleableKey, type VoiceId } from "../core/store";

/**
 * The shape of a scene.
 *
 * THE RULE: no sentence a customer will read is ever typed into a .ts file.
 *
 * NEW IN PART 2:
 *   showSummary     — draw the customer's personal summary on this screen
 *   exportsSummary  — a button that saves the summary as a file
 */

export type ScaleQuestion = {
  id: string;
  prompt: string;
  minLabel: string;
  maxLabel: string;
};

export type Choice = {
  id: string;
  label: string;
  goto?: string;
  setsConcern?: ConcernType;
  setsVoice?: VoiceId;
  toggles?: ToggleableKey;
  resume?: boolean;
  exits?: boolean;
  requireAnswer?: boolean;
  /** Downloads the session as a file. Used on the final summary. */
  exportsSummary?: boolean;
};

export type SceneRecord = {
  id: string;
  scenario: number;
  title: string;
  narration: string[];
  audioKey?: string;
  anchor?: string;
  scales?: ScaleQuestion[];
  choices?: Choice[];
  multiSelect?: boolean;
  responses?: Partial<Record<NonNullable<ConcernType>, string>>;
  interrupt?: boolean;
  /** Renders the personal summary block: name, branch, concern, confidence change. */
  showSummary?: boolean;
};

export class SceneValidationError extends Error {}

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
      if (choice.setsVoice && !VOICE_IDS.includes(choice.setsVoice)) {
        throw new SceneValidationError(
          `${rec.id}: button "${choice.id}" sets voice "${choice.setsVoice}", which isn't known.`,
        );
      }
      if (
        !choice.goto &&
        !choice.toggles &&
        !choice.setsVoice &&
        !choice.resume &&
        !choice.exits &&
        !choice.exportsSummary
      ) {
        throw new SceneValidationError(
          `${rec.id}: button "${choice.id}" does nothing.`,
        );
      }
      if (choice.requireAnswer && !rec.scales?.length) {
        throw new SceneValidationError(
          `${rec.id}: button "${choice.id}" waits for an answer, but this screen has no scales.`,
        );
      }
    });

    rec.scales?.forEach((scale, si) => {
      if (!scale.id || !scale.prompt) {
        throw new SceneValidationError(`${rec.id}: scale ${si + 1} needs an "id" and a "prompt".`);
      }
    });

    // A summary screen has no room for narration paragraphs as well as rows.
    if (rec.showSummary && (rec.scales?.length ?? 0) > 0) {
      throw new SceneValidationError(
        `${rec.id}: a summary screen can't also hold a scale — they won't both fit.`,
      );
    }

    scenes.set(rec.id, rec as SceneRecord);
  });

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
