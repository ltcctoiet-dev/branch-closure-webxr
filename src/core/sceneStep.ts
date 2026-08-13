import type { Scene } from "@babylonjs/core";
import { router, type Step } from "./router";
import { store } from "./store";
import type { Choice, SceneRecord } from "../content/schema";
import type { Panel } from "../ui/Panel";
import type { SubtitleBar } from "../ui/SubtitleBar";
import { exportSession, recordAnswer, recordSceneVisit } from "../session/record";

/**
 * Turns a scene from scenes.json into something the router can run.
 *
 * This is the file that makes the whole design pay off. Because every scene
 * goes through here, adding the remaining 38 scenes from the script means
 * writing JSON — no new code at all.
 */

export type StepTools = {
  panel: Panel;
  subtitles: SubtitleBar;
  scene: Scene;
};

export function createSceneStep(record: SceneRecord, tools: StepTools): Step {
  return {
    id: record.id,

    async enter() {
      recordSceneVisit(record.id);

      tools.panel.setHandlers(
        (choice) => void handleChoice(choice, record),
        (answer) => recordAnswer(answer.questionId, answer.value),
      );

      const camera = tools.scene.activeCamera;
      if (camera) tools.panel.place(record, camera);
      tools.panel.show(record);

      // If the customer picked a concern, that line is spoken first.
      const concern = store.get().selectedConcern;
      const personalLine = concern && record.responses ? record.responses[concern] : undefined;
      const lines = personalLine ? [personalLine, ...record.narration] : record.narration;

      await tools.subtitles.play(lines);
    },

    exit() {
      tools.subtitles.stop();
    },
  };
}

async function handleChoice(choice: Choice, record: SceneRecord): Promise<void> {
  console.log(`Chose "${choice.id}" on scene "${record.id}"`);

  // A setting was switched. On a multi-select screen we stay put — the panel
  // redraws itself because the store told it to.
  if (choice.toggles) {
    store.toggle(choice.toggles);
    if (record.multiSelect) return;
  }

  if (choice.setsConcern !== undefined) {
    store.set({ selectedConcern: choice.setsConcern });
  }

  if (choice.exits) {
    exportSession();
    store.reset();
    await router.goto("welcome.calm");
    return;
  }

  // "Continue experience" on the pause screen: go back to whatever was
  // underneath, wherever that was.
  if (choice.resume) {
    await router.pop();
    return;
  }

  if (choice.goto) {
    await router.goto(choice.goto);
  }
}
