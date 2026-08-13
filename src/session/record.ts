import { store } from "../core/store";

/**
 * Keeping the survey answers.
 *
 * The whole case for this project rests on one comparison: how confident
 * someone felt before, against how they felt after. That means the answers have
 * to go somewhere.
 *
 * There's no server in this project — it's a static website — so answers live
 * in memory for the session and can be downloaded as a file at the end. That's
 * enough to prove the concept.
 *
 * If a proper backend is approved later, this file is the one place you'd
 * change to send them somewhere instead.
 */

type SessionData = {
  startedAt: string;
  answers: Record<string, number>;
  concern: string | null;
  accessibility: Record<string, boolean>;
  scenesVisited: string[];
  finishedAt?: string;
};

const data: SessionData = {
  startedAt: new Date().toISOString(),
  answers: {},
  concern: null,
  accessibility: {},
  scenesVisited: [],
};

export function recordAnswer(questionId: string, value: number): void {
  data.answers[questionId] = value;
  console.log(`Answer recorded — ${questionId}: ${value}`);
}

export function recordSceneVisit(sceneId: string): void {
  if (data.scenesVisited[data.scenesVisited.length - 1] !== sceneId) {
    data.scenesVisited.push(sceneId);
  }
}

function snapshot(): SessionData {
  const state = store.get();
  return {
    ...data,
    concern: state.selectedConcern,
    accessibility: {
      largeText: state.largeText,
      highContrast: state.highContrast,
      subtitlesEnabled: state.subtitlesEnabled,
      voiceEnabled: state.voiceEnabled,
      lowMotion: state.lowMotion,
      seatedMode: state.seatedMode,
      extraReadingTime: state.extraReadingTime,
      colleagueAssisted: state.colleagueAssisted,
    },
  };
}

/** Download the session as a file. Works from a plain static website. */
export function exportSession(): void {
  const payload = { ...snapshot(), finishedAt: new Date().toISOString() };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = `session-${Date.now()}.json`;
  link.click();

  URL.revokeObjectURL(url);
  console.log("Session exported.", payload);
}
