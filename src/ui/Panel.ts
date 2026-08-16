import { Mesh, MeshBuilder, Vector3, type Camera, type Scene } from "@babylonjs/core";
import { AdvancedDynamicTexture, Control, Rectangle, StackPanel, TextBlock } from "@babylonjs/gui";
import { sizes, uiPalette, uiText } from "../core/theme";
import { store } from "../core/store";
import { snapPoints } from "../environments/room";
import type { Choice, SceneRecord } from "../content/schema";
import { resolveTokens } from "../content/tokens";
import { buildChoices } from "./ChoiceList";
import { buildScale, type ScaleAnswer } from "./ScaleWidget";
import { buildSummary } from "./SummaryBoard";

/**
 * ONE panel, reused for every scene.
 *
 * Placement rules (fixed earlier): anchored panels offset from the anchor
 * towards wherever you actually are, and nothing is ever closer than
 * MIN_VIEW_DISTANCE_M.
 *
 * NEW IN PART 2: a scene marked `showSummary` draws the customer's personal
 * summary instead of narration paragraphs.
 */

const MIN_VIEW_DISTANCE_M = 2.2;
const ANCHOR_OFFSET_M = 1.4;

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

    store.subscribeKeys(["largeText", "highContrast"], () => this.redraw());
  }

  setHandlers(
    onPick: (choice: Choice) => void,
    onScale: (answer: ScaleAnswer) => void,
  ): void {
    this.onPick = onPick;
    this.onScale = onScale;
  }

  place(record: SceneRecord, camera: Camera): void {
    this.mesh.billboardMode = Mesh.BILLBOARDMODE_Y;

    const anchor = record.anchor
      ? snapPoints.find((candidate) => candidate.id === record.anchor)
      : undefined;

    if (anchor) {
      const anchorPoint = new Vector3(
        anchor.position.x,
        sizes.panelCentreHeightM,
        anchor.position.z,
      );

      const towardsViewer = camera.position.subtract(anchorPoint);
      towardsViewer.y = 0;

      if (towardsViewer.length() < 0.01) {
        const forward = camera.getDirection(Vector3.Forward());
        forward.y = 0;
        towardsViewer.copyFrom(forward.normalize());
      } else {
        towardsViewer.normalize();
      }

      this.mesh.position = anchorPoint.add(towardsViewer.scale(ANCHOR_OFFSET_M));
      this.mesh.position.y = sizes.panelCentreHeightM;
    } else {
      const forward = camera.getDirection(Vector3.Forward());
      forward.y = 0;
      forward.normalize();

      this.mesh.position = camera.position.add(forward.scale(sizes.panelDistanceM));
      this.mesh.position.y = sizes.panelCentreHeightM;
    }

    this.enforceMinimumDistance(camera);
  }

  private enforceMinimumDistance(camera: Camera): void {
    const flatCamera = new Vector3(camera.position.x, sizes.panelCentreHeightM, camera.position.z);
    const offset = this.mesh.position.subtract(flatCamera);
    const distance = offset.length();

    if (distance >= MIN_VIEW_DISTANCE_M) return;

    let direction: Vector3;
    if (distance < 0.01) {
      direction = camera.getDirection(Vector3.Forward());
      direction.y = 0;
      direction.normalize();
    } else {
      direction = offset.normalize();
    }

    this.mesh.position = flatCamera.add(direction.scale(MIN_VIEW_DISTANCE_M));
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

  private allScalesAnswered(): boolean {
    const scales = this.record?.scales ?? [];
    return scales.every((scale) => this.answers.has(scale.id));
  }

  private redraw(): void {
    const record = this.record;
    if (!record) return;

    const ui = uiPalette();
    const text = uiText();

    this.root.background = ui.panel;
    this.root.color = ui.panelEdge;
    this.stack.clearControls();

    const title = new TextBlock("panelTitle", resolveTokens(record.title));
    title.color = ui.textLight;
    title.fontSize = text.title;
    title.height = `${text.title + 26}px`;
    title.textWrapping = true;
    title.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.stack.addControl(title);

    if (record.showSummary) {
      // The summary is the content — narration plays in subtitles only.
      this.stack.addControl(buildSummary());
    } else {
      const concern = store.get().selectedConcern;
      const personalLine = concern && record.responses ? record.responses[concern] : undefined;
      const allLines = personalLine ? [personalLine, ...record.narration] : record.narration;

      const isBusy = Boolean(record.scales) || (record.choices?.length ?? 0) > 5;
      const linesToShow = isBusy ? allLines.slice(0, 1) : allLines;

      linesToShow.forEach((line, index) => {
        const resolved = resolveTokens(line);
        const body = new TextBlock(`panelBody_${index}`, resolved);
        body.color = ui.textLight;
        body.fontSize = text.body;
        body.height = `${estimateHeight(resolved, text.body)}px`;
        body.textWrapping = true;
        body.paddingBottom = "10px";
        body.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        body.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.stack.addControl(body);
      });
    }

    record.scales?.forEach((question) => {
      this.stack.addControl(
        buildScale(question, this.answers.get(question.id) ?? null, (answer) => {
          this.answers.set(answer.questionId, answer.value);
          this.onScale(answer);
          this.redraw();
        }),
      );
    });

    if (record.choices?.length) {
      this.stack.addControl(
        buildChoices(
          record.choices,
          (choice) => this.onPick(choice),
          (choice) => {
            if (choice.toggles) return Boolean(store.get()[choice.toggles]);
            if (choice.setsVoice) return store.get().selectedVoice === choice.setsVoice;
            return false;
          },
          (choice) => Boolean(choice.requireAnswer) && !this.allScalesAnswered(),
        ),
      );
    }
  }
}

function estimateHeight(line: string, fontSize: number): number {
  const charsPerLine = Math.floor((sizes.panelTextureW - 88) / (fontSize * 0.52));
  const lineCount = Math.max(1, Math.ceil(line.length / charsPerLine));
  return lineCount * (fontSize + 14) + 12;
}
