/**
 * The app's memory.
 *
 * Anything that can change while someone is using the experience lives here:
 * which accessibility options they picked, what concern they chose, which scene
 * they're on.
 *
 * The important word is "subscribe". Other files can ask to be told when
 * something changes. That's how ticking "Larger text" makes the panel you're
 * looking at redraw itself immediately, without any file having to remember to
 * go and update it.
 */

export type ConcernType =
  | "travel"
  | "cash"
  | "digital"
  | "human"
  | "accessibility"
  | "privacy"
  | "unsure"
  | null;

export type ExperienceState = {
  // Accessibility choices (Scenario 1, Scene 2 of the script)
  largeText: boolean;
  highContrast: boolean;
  subtitlesEnabled: boolean;
  voiceEnabled: boolean;
  lowMotion: boolean;
  seatedMode: boolean;
  extraReadingTime: boolean;
  colleagueAssisted: boolean;

  // Journey
  currentSceneId: string;
  selectedConcern: ConcernType;

  // Runtime
  inVr: boolean;
};

/**
 * Defaults lean towards the supportive end on purpose. The people this is built
 * for are more likely to need subtitles and low motion than not, and switching
 * something off is easier than discovering an option you needed.
 */
export const initialState: ExperienceState = {
  largeText: false,
  highContrast: false,
  subtitlesEnabled: true,
  voiceEnabled: true,
  lowMotion: true,
  seatedMode: false,
  extraReadingTime: false,
  colleagueAssisted: false,

  currentSceneId: "welcome.calm",
  selectedConcern: null,

  inVr: false,
};

/** The settings a button in scenes.json is allowed to switch on and off. */
export const TOGGLEABLE_KEYS = [
  "largeText",
  "highContrast",
  "subtitlesEnabled",
  "voiceEnabled",
  "lowMotion",
  "seatedMode",
  "extraReadingTime",
  "colleagueAssisted",
] as const;

export type ToggleableKey = (typeof TOGGLEABLE_KEYS)[number];

type Listener = (state: ExperienceState, changed: Set<keyof ExperienceState>) => void;

class Store {
  private state: ExperienceState = { ...initialState };
  private listeners = new Set<Listener>();

  /** Read everything. */
  get(): Readonly<ExperienceState> {
    return this.state;
  }

  /** Change one or more values, e.g. store.set({ largeText: true }) */
  set(patch: Partial<ExperienceState>): void {
    const changed = new Set<keyof ExperienceState>();

    (Object.keys(patch) as (keyof ExperienceState)[]).forEach((key) => {
      if (this.state[key] !== patch[key]) {
        (this.state as Record<string, unknown>)[key as string] = patch[key];
        changed.add(key);
      }
    });

    // Nothing actually changed, so don't bother waking anyone up.
    if (changed.size === 0) return;

    this.listeners.forEach((listener) => listener(this.state, changed));
  }

  /** Flip a true/false setting. */
  toggle(key: ToggleableKey): void {
    this.set({ [key]: !this.state[key] } as Partial<ExperienceState>);
  }

  /** Be told about every change. Returns a function that stops the subscription. */
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Be told only when one of these particular things changes. */
  subscribeKeys(keys: (keyof ExperienceState)[], listener: Listener): () => void {
    return this.subscribe((state, changed) => {
      if (keys.some((key) => changed.has(key))) listener(state, changed);
    });
  }

  /** Back to the start, for the next customer. */
  reset(): void {
    this.state = { ...initialState };
    const all = new Set(Object.keys(this.state) as (keyof ExperienceState)[]);
    this.listeners.forEach((listener) => listener(this.state, all));
  }
}

export const store = new Store();
