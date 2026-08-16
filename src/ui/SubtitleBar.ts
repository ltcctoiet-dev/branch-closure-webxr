import { MeshBuilder, Vector3, type Camera, type Mesh, type Scene } from "@babylonjs/core";
import { AdvancedDynamicTexture, Control, Rectangle, TextBlock } from "@babylonjs/gui";
import { uiPalette, uiText } from "../core/theme";
import { store } from "../core/store";
import { skipCurrentLine, speakLine, stop as stopNarration } from "../audio/narrator";

/**
 * Subtitles, and the voice that goes with them.
 *
 * CHANGED: each line is now spoken as well as shown, and the two are kept in
 * step — the line stays on screen for exactly as long as the audio lasts,
 * rather than a guessed reading time. If there's no audio, it falls back to
 * reading speed as before.
 *
 * ALSO NEW: tap the subtitle bar to skip to the next line. Useful when you're
 * testing the same screen for the fortieth time, and useful for a customer who
 * reads faster than the narration.
 */

export class SubtitleBar {
  readonly mesh: Mesh;
  private background: Rectangle;
  private label: TextBlock;
  private cancelled = false;

  constructor(scene: Scene) {
    this.mesh = MeshBuilder.CreatePlane("subtitleBar", { width: 1.5, height: 0.34 }, scene);
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

    // Tap the bar to move on to the next line.
    this.background.isPointerBlocker = true;
    this.background.onPointerUpObservable.add(() => skipCurrentLine());

    this.applyStyle();
    store.subscribeKeys(["largeText", "highContrast"], () => this.applyStyle());
    store.subscribeKeys(["subtitlesEnabled"], (state) => {
      if (!state.subtitlesEnabled) this.mesh.setEnabled(false);
    });
  }

  attachTo(camera: Camera): void {
    this.mesh.parent = camera;
  }

  private applyStyle(): void {
    this.label.color = uiPalette().textLight;
    this.label.fontSize = uiText().subtitle;
  }

  /**
   * Show and speak these lines, one after another.
   *
   * Nothing waits on this. The buttons on the panel are live from the moment
   * the scene appears — see sceneStep.ts.
   */
  async play(lines: string[], audioKey?: string): Promise<void> {
    this.stop();
    this.cancelled = false;

    for (let index = 0; index < lines.length; index += 1) {
      if (this.cancelled) return;

      const line = lines[index];
      this.label.text = line;
      this.mesh.setEnabled(store.get().subtitlesEnabled);

      await speakLine(line, audioKey, index);
    }
  }

  stop(): void {
    this.cancelled = true;
    stopNarration();
  }

  clear(): void {
    this.stop();
    this.label.text = "";
    this.mesh.setEnabled(false);
  }
}
