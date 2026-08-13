import { Mesh, MeshBuilder, Vector3, type Camera, type Scene } from "@babylonjs/core";
import { AdvancedDynamicTexture, Control, Rectangle, StackPanel, TextBlock } from "@babylonjs/gui";
import { sizes, uiPalette, uiText } from "../core/theme";
import { store } from "../core/store";
import { snapPoints } from "../environments/room";
import type { Choice, SceneRecord } from "../content/schema";
import { buildChoices } from "./ChoiceList";
import { buildScale, type ScaleAnswer } from "./ScaleWidget";

/**
 * ONE panel, reused for every scene.
 *
 * The obvious way to build this would be a separate panel per screen. Don't:
 * each one needs its own 1536 x 960 picture in graphics memory, and 45 of those
 * on a headset — for screens that are never visible at the same time — is a lot
 * to carry for no benefit. This one redraws itself instead.
 *
 * Facing the customer: the panel uses billboarding, which means Babylon
 * automatically turns it to face whoever is looking. That removes an entire
 * category of bug — the "why is my text back to front" problem — which the
 * original build guide had a whole troubleshooting note about.
 */

export class Panel {
  readonly mesh: Mesh;
  private root: Rectangle;
  private stack: StackPanel;
  private record: SceneRecord | null = null;
  private answers = new Map<string, number>();

  private onPick: (choice: Choice) => void = () => {};
  private onScale: (answer: ScaleAnswer) => void = () => {};

  constructor(scene: Scene) {
    this.mesh = MeshBuilder.CreatePlane(
      "scenePanel",
      { width: sizes.panelWidthM, height: sizes.panelHeightM },
      scene,
    );
    this.mesh.position = new Vector3(0, sizes.panelCentreHeightM, sizes.panelDistanceM);

    const texture = AdvancedDynamicTexture.CreateForMesh(
      this.mesh,
      sizes.panelTextureW,
      sizes.panelTextureH,
    );

    this.root = new Rectangle("panelRoot");
    this.root.cornerRadius = 30;
    this.root.thickness = 5;
    texture.addControl(this.root);

    this.stack = new StackPanel("panelStack");
    this.stack.isVertical = true;
    this.stack.paddingTop = "34px";
    this.stack.paddingLeft = "44px";
    this.stack.paddingRight = "44px";
    this.stack.paddingBottom = "26px";
    this.root.addControl(this.stack);

    // THIS is why the store exists. When someone ticks "Larger text" or
    // "High contrast", the panel they're standing in front of redraws itself
    // straight away. No other file has to remember to tell it.
    store.subscribeKeys(["largeText", "highContrast"], () => this.redraw());
  }

  setHandlers(
    onPick: (choice: Choice) => void,
    onScale: (answer: ScaleAnswer) => void,
  ): void {
    this.onPick = onPick;
    this.onScale = onScale;
  }

  /** Put the panel somewhere sensible for this scene. */
  place(record: SceneRecord, camera: Camera): void {
    // Anchored scenes sit at a fixed spot in the room — the counter panel
    // belongs at the counter, not floating wherever the customer happens to be.
    if (record.anchor) {
      const point = snapPoints.find((candidate) => candidate.id === record.anchor);
      if (point) {
        this.mesh.billboardMode = Mesh.BILLBOARDMODE_Y;
        this.mesh.position = new Vector3(
          point.position.x,
          sizes.panelCentreHeightM,
          point.position.z + 1.2,
        );
        return;
      }
    }

    // Everything else floats in front of wherever the customer is looking.
    const forward = camera.getDirection(Vector3.Forward());
    forward.y = 0;
    forward.normalize();

    this.mesh.billboardMode = Mesh.BILLBOARDMODE_Y;
    this.mesh.position = camera.position.add(forward.scale(sizes.panelDistanceM));
    this.mesh.position.y = sizes.panelCentreHeightM;
  }

  show(record: SceneRecord): void {
    this.record = record;
    this.answers.clear();
    this.redraw();
    this.mesh.setEnabled(true);
  }

  hide(): void {
    this.mesh.setEnabled(false);
  }

  private redraw(): void {
    const record = this.record;
    if (!record) return;

    const ui = uiPalette();
    const text = uiText();

    this.root.background = ui.panel;
    this.root.color = ui.panelEdge;

    this.stack.clearControls();

    const title = new TextBlock("panelTitle", record.title);
    title.color = ui.textLight;
    title.fontSize = text.title;
    title.height = `${text.title + 26}px`;
    title.textWrapping = true;
    title.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.stack.addControl(title);

    // If the customer told us their concern, that line comes first.
    const concern = store.get().selectedConcern;
    const personalLine = concern && record.responses ? record.responses[concern] : undefined;
    const allLines = personalLine ? [personalLine, ...record.narration] : record.narration;

    // Busy scenes only show their opening line on the panel; the rest plays in
    // the subtitles, so nothing overflows off the bottom.
    const isBusy = Boolean(record.scales) || (record.choices?.length ?? 0) > 5;
    const linesToShow = isBusy ? allLines.slice(0, 1) : allLines;

    linesToShow.forEach((line, index) => {
      const body = new TextBlock(`panelBody_${index}`, line);
      body.color = ui.textLight;
      body.fontSize = text.body;
      body.height = `${estimateHeight(line, text.body)}px`;
      body.textWrapping = true;
      body.paddingBottom = "10px";
      body.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      this.stack.addControl(body);
    });

    record.scales?.forEach((question) => {
      this.stack.addControl(
        buildScale(question, this.answers.get(question.id) ?? null, (answer) => {
          this.answers.set(answer.questionId, answer.value);
          this.onScale(answer);
          this.redraw(); // so the chosen number shows as selected
        }),
      );
    });

    if (record.choices?.length) {
      this.stack.addControl(
        buildChoices(
          record.choices,
          (choice) => this.onPick(choice),
          (choice) => (choice.toggles ? Boolean(store.get()[choice.toggles]) : false),
        ),
      );
    }
  }
}

/** Roughly how tall a wrapped line of text will be. Good enough for layout. */
function estimateHeight(line: string, fontSize: number): number {
  const charsPerLine = Math.floor((sizes.panelTextureW - 88) / (fontSize * 0.52));
  const lineCount = Math.max(1, Math.ceil(line.length / charsPerLine));
  return lineCount * (fontSize + 14) + 12;
}
