import { store } from "../core/store";

/**
 * Keeping the survey answers.
 *
 * The impact case rests on one comparison: confidence before against confidence
 * after. So the answers have to be kept, and the summary screen has to be able
 * to read them back.
 *
 * NEW IN PART 2: getAnswer and hasVisited, so the summary can show what the
 * customer actually did rather than a generic list.
 *
 * There's no server — this is a static site — so answers live in memory for the
 * session and download as a file at the end. If a backend is approved later,
 * exportSession is the single place to change.
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

/** A scale answer, or null if that question was never reached. */
export function getAnswer(questionId: string): number | null {
  return questionId in data.answers ? data.answers[questionId] : null;
}

/** Did the customer visit any scene whose id starts with this? e.g. "hub." */
export function hasVisited(prefix: string): boolean {
  return data.scenesVisited.some((id) => id.startsWith(prefix));
}

export function snapshot(): SessionData {
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
