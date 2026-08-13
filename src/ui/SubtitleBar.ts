import { MeshBuilder, Vector3, type Camera, type Mesh, type Scene } from "@babylonjs/core";
import { AdvancedDynamicTexture, Control, Rectangle, TextBlock } from "@babylonjs/gui";
import { readingTimeMs, uiPalette, uiText } from "../core/theme";
import { store } from "../core/store";

/**
 * Subtitles.
 *
 * Attached to the camera, so they stay in view wherever the customer turns.
 * The script treats subtitles as always available, not something that belongs
 * to one particular screen — someone relying on them needs them everywhere.
 *
 * They sit low so they don't cover the panel.
 *
 * How long each line stays up is worked out from how many words it has, and
 * stretches by 60% if the customer chose "More time to read".
 */

export class SubtitleBar {
  readonly mesh: Mesh;
  private background: Rectangle;
  private label: TextBlock;
  private timer: number | null = null;

  constructor(scene: Scene) {
    this.mesh = MeshBuilder.CreatePlane("subtitleBar", { width: 1.5, height: 0.34 }, scene);
    this.mesh.isPickable = false; // never gets in the way of clicking
    this.mesh.position = new Vector3(0, -0.42, 1.3);
    this.mesh.setEnabled(false);

    const texture = AdvancedDynamicTexture.CreateForMesh(this.mesh, 1024, 232);

    this.background = new Rectangle("subtitleBackground");
    this.background.background = "#000000";
    this.background.alpha = 0.72;
    this.background.thickness = 0;
    this.background.cornerRadius = 16;
    texture.addControl(this.background);

    this.label = new TextBlock("subtitleText", "");
    this.label.textWrapping = true;
    this.label.paddingLeft = "26px";
    this.label.paddingRight = "26px";
    this.label.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    this.background.addControl(this.label);

    this.applyStyle();
    store.subscribeKeys(["largeText", "highContrast"], () => this.applyStyle());
    store.subscribeKeys(["subtitlesEnabled"], (state) => {
      if (!state.subtitlesEnabled) this.mesh.setEnabled(false);
    });
  }

  /** Follow whichever camera is active — desktop, or the headset. */
  attachTo(camera: Camera): void {
    this.mesh.parent = camera;
  }

  private applyStyle(): void {
    const text = uiText();
    this.label.color = uiPalette().textLight;
    this.label.fontSize = text.subtitle;
  }

  /**
   * Show these lines one after another.
   * Resolves once the last one has had its time on screen.
   */
  play(lines: string[]): Promise<void> {
    this.stop();
    const queue = [...lines];

    return new Promise((resolve) => {
      const next = () => {
        const line = queue.shift();
        if (line === undefined) {
          resolve();
          return;
        }
        this.label.text = line;
        this.mesh.setEnabled(store.get().subtitlesEnabled);
        this.timer = window.setTimeout(next, readingTimeMs(line));
      };
      next();
    });
  }

  stop(): void {
    if (this.timer !== null) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }
  }

  clear(): void {
    this.stop();
    this.label.text = "";
    this.mesh.setEnabled(false);
  }
}
