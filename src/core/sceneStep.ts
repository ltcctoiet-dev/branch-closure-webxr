import type { Scene } from "@babylonjs/core";
import { router, type Step } from "./router";
import { store } from "./store";
import type { Choice, SceneRecord } from "../content/schema";
import { resolveTokens } from "../content/tokens";
import type { Panel } from "../ui/Panel";
import type { SubtitleBar } from "../ui/SubtitleBar";
import { exportSession, recordAnswer, recordSceneVisit } from "../session/record";

/**
 * Turns a scene from scenes.json into something the router can run.
 *
 * Keep the `void` on the subtitles line — that's what keeps buttons live while
 * narration is still playing. Don't turn it back into `await`.
 */

export type StepTools = {
  panel: Panel;
  subtitles: SubtitleBar;
  scene: Scene;
};

export function createSceneStep(record: SceneRecord, tools: StepTools): Step {
  return {
    id: record.id,

    enter() {
      recordSceneVisit(record.id);

      tools.panel.setHandlers(
        (choice) => void handleChoice(choice, record),
        (answer) => recordAnswer(answer.questionId, answer.value),
      );

      const camera = tools.scene.activeCamera;
      if (camera) tools.panel.place(record, camera);
      tools.panel.show(record);

      const concern = store.get().selectedConcern;
      const personalLine = concern && record.responses ? record.responses[concern] : undefined;
      const lines = (personalLine ? [personalLine, ...record.narration] : record.narration).map(
        resolveTokens,
      );

      void tools.subtitles.play(lines, record.audioKey);
    },

    exit() {
      tools.subtitles.stop();
    },
  };
}

async function handleChoice(choice: Choice, record: SceneRecord): Promise<void> {
  console.log(`Chose "${choice.id}" on scene "${record.id}"`);

  if (choice.toggles) {
    store.toggle(choice.toggles);
    if (record.multiSelect) return;
  }

  if (choice.setsVoice) {
    store.set({
      selectedVoice: choice.setsVoice,
      voiceEnabled: choice.setsVoice !== "subtitlesOnly",
    });
    if (record.multiSelect) return;
  }

  if (choice.setsConcern !== undefined) {
    store.set({ selectedConcern: choice.setsConcern });
  }

  // Save the summary. Deliberately does NOT move on or reset — the customer
  // may want to save it and then keep reading.
  if (choice.exportsSummary) {
    exportSession();
    if (!choice.goto) return;
  }

  if (choice.exits) {
    exportSession();
    store.reset();
    await router.goto("welcome.calm");
    return;
  }

  if (choice.resume) {
    await router.pop();
    return;
  }

  if (choice.goto) {
    await router.goto(choice.goto);
  }
}
