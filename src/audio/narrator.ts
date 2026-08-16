import { store } from "../core/store";
import { readingTimeMs } from "../core/theme";

/**
 * The voice.
 *
 * Three levels, tried in order:
 *
 *   1. A recorded file at /assets/audio/{voice}/{audioKey}_{line}.mp3
 *      This is what ships. Real recordings, one set per accent.
 *
 *   2. The browser's own text-to-speech, if no file exists.
 *      A placeholder so you can hear the pacing today without waiting for a
 *      recording studio. It will sound robotic. That is fine for development
 *      and NOT fine for a customer demo.
 *
 *   3. Silence, timed to reading speed.
 *      What happens when voice guidance is switched off, or when neither of
 *      the above is available.
 *
 * IMPORTANT — Quest Browser and text-to-speech:
 * Level 2 depends on the headset having speech voices installed, and it may
 * simply not work there. If it doesn't, you'll fall through to level 3 and see
 * subtitles with no sound. That's expected. Don't spend time fighting it —
 * recorded files are the real answer.
 */

const AUDIO_BASE = "/assets/audio";

let currentAudio: HTMLAudioElement | null = null;
let currentUtterance: SpeechSynthesisUtterance | null = null;
let skipResolve: (() => void) | null = null;

/** Maps the customer's accent choice to a folder name and a speech language. */
const voiceMap: Record<string, { folder: string; lang: string }> = {
  english: { folder: "english", lang: "en-GB" },
  scottish: { folder: "scottish", lang: "en-GB" },
  welsh: { folder: "welsh", lang: "en-GB" },
  irish: { folder: "irish", lang: "en-IE" },
  neutral: { folder: "neutral", lang: "en-GB" },
};

function currentVoice() {
  return voiceMap[store.get().selectedVoice ?? "english"] ?? voiceMap.english;
}

/**
 * Speak one line. Resolves when it has finished, been skipped, or timed out.
 */
export async function speakLine(
  text: string,
  audioKey: string | undefined,
  lineIndex: number,
): Promise<void> {
  stop();

  // Voice guidance off — just hold the line on screen long enough to read.
  if (!store.get().voiceEnabled) {
    return waitOrSkip(readingTimeMs(text));
  }

  if (audioKey) {
    const played = await tryAudioFile(audioKey, lineIndex);
    if (played) return;
  }

  const spoken = await trySpeechSynthesis(text);
  if (spoken) return;

  return waitOrSkip(readingTimeMs(text));
}

/** Cut the current line short — used by the skip control and on leaving a scene. */
export function stop(): void {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.src = "";
    currentAudio = null;
  }
  if (currentUtterance && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
    currentUtterance = null;
  }
}

/** Skip to the end of the line that's playing right now. */
export function skipCurrentLine(): void {
  stop();
  if (skipResolve) {
    const resolve = skipResolve;
    skipResolve = null;
    resolve();
  }
}

// ---------------------------------------------------------------------------

function tryAudioFile(audioKey: string, lineIndex: number): Promise<boolean> {
  const { folder } = currentVoice();
  const url = `${AUDIO_BASE}/${folder}/${audioKey}_${lineIndex}.mp3`;

  return new Promise((resolve) => {
    const audio = new Audio(url);
    currentAudio = audio;

    let settled = false;
    const finish = (played: boolean) => {
      if (settled) return;
      settled = true;
      skipResolve = null;
      resolve(played);
    };

    // No file there — fall through to the next level quietly.
    audio.onerror = () => finish(false);
    audio.onended = () => finish(true);

    skipResolve = () => finish(true);

    audio.play().catch(() => {
      // Browsers block audio until the user has interacted with the page.
      // The first click on "Continue" unblocks it for the rest of the session.
      finish(false);
    });
  });
}

function trySpeechSynthesis(text: string): Promise<boolean> {
  if (!("speechSynthesis" in window)) return Promise.resolve(false);

  const synth = window.speechSynthesis;
  const voices = synth.getVoices();
  if (voices.length === 0) return Promise.resolve(false); // none installed

  return new Promise((resolve) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = currentVoice().lang;
    utterance.rate = 0.92; // a shade slower than default; this audience benefits
    currentUtterance = utterance;

    let settled = false;
    const finish = (spoke: boolean) => {
      if (settled) return;
      settled = true;
      skipResolve = null;
      resolve(spoke);
    };

    utterance.onend = () => finish(true);
    utterance.onerror = () => finish(false);
    skipResolve = () => finish(true);

    synth.speak(utterance);
  });
}

function waitOrSkip(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      skipResolve = null;
      resolve();
    }, ms);

    skipResolve = () => {
      window.clearTimeout(timer);
      resolve();
    };
  });
}
