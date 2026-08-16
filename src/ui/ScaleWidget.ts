import { Button, Control, Grid, StackPanel, TextBlock } from "@babylonjs/gui";
import { sizes, uiPalette, uiText } from "../core/theme";
import type { ScaleQuestion } from "../content/schema";

/**
 * The 0 to 10 confidence scale. Two rows of six.
 *
 * ============================================================
 * FIXED — long questions were being cut off at the top.
 * ============================================================
 *
 * The question text had a fixed height of one line. Babylon centres text
 * vertically in whatever box it's given, so a two-line question overflowed
 * top and bottom, and the top half disappeared.
 *
 * It now measures how many lines the text will wrap to and sizes the box to
 * match. `estimateLines` below is the same approach Panel.ts uses.
 *
 * ONE SCALE PER SCREEN. Three of these on one panel needs about 1,180 pixels
 * and the panel is 960 tall — the third question and the Continue button were
 * being pushed off the bottom. scenes.json now splits the survey into three
 * separate screens, which is better for the customer anyway: one question at a
 * time reads as a conversation, three at once reads as a form.
 */

const ASSUMED_SIDE_PADDING_PX = 44;
const SAFETY_MARGIN_PX = 80;
const COLUMNS = 6;
const ROW_GAP_PX = 10;

export type ScaleAnswer = { questionId: string; value: number };

/** Roughly how many lines this text will wrap to at this size and width. */
function estimateLines(text: string, fontSize: number, widthPx: number): number {
  const charsPerLine = Math.max(10, Math.floor(widthPx / (fontSize * 0.52)));
  return Math.max(1, Math.ceil(text.length / charsPerLine));
}

export function buildScale(
  question: ScaleQuestion,
  currentValue: number | null,
  onAnswer: (answer: ScaleAnswer) => void,
): Control {
  const ui = uiPalette();
  const text = uiText();

  const usableWidth =
    sizes.panelTextureW - ASSUMED_SIDE_PADDING_PX * 2 - SAFETY_MARGIN_PX;
  const columnWidth = Math.floor(usableWidth / COLUMNS);
  const buttonHeight = sizes.minTargetPx;

  // Height comes from the text, not from a guess.
  const promptLines = estimateLines(question.prompt, text.body, usableWidth);
  const promptHeight = promptLines * (text.body + 12) + 18;

  const labelsHeight = text.caption + 14;
  const totalHeight =
    promptHeight + buttonHeight * 2 + ROW_GAP_PX + labelsHeight + 28;

  const container = new StackPanel(`scale_${question.id}`);
  container.isVertical = true;
  container.width = `${usableWidth}px`;
  container.height = `${totalHeight}px`;
  container.paddingBottom = "18px";

  // --- The question ---
  const prompt = new TextBlock(`prompt_${question.id}`, question.prompt);
  prompt.color = ui.textLight;
  prompt.fontSize = text.body;
  prompt.width = `${usableWidth}px`;
  prompt.height = `${promptHeight}px`;
  prompt.textWrapping = true;
  prompt.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
  // Grow downwards if the estimate is short, rather than cutting off the top.
  prompt.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
  prompt.resizeToFit = false;
  container.addControl(prompt);

  // --- The buttons: 0-5 on top, 6-10 below ---
  const makeRow = (rowIndex: number, values: number[]): Grid => {
    const grid = new Grid(`row${rowIndex}_${question.id}`);
    grid.width = `${usableWidth}px`;
    grid.height = `${buttonHeight}px`;
    grid.paddingBottom = rowIndex === 0 ? `${ROW_GAP_PX}px` : "0px";

    for (let column = 0; column < COLUMNS; column += 1) {
      grid.addColumnDefinition(columnWidth, true); // true = pixels
    }

    values.forEach((value, column) => {
      const chosen = value === currentValue;

      const button = Button.CreateSimpleButton(`${question.id}_${value}`, String(value));
      button.color = ui.textLight;
      button.background = chosen ? ui.selected : ui.action;
      button.thickness = chosen ? 5 : 2;
      button.cornerRadius = 14;
      button.fontSize = text.button;
      button.width = `${columnWidth - 12}px`;
      button.height = `${buttonHeight - 8}px`;

      button.onPointerEnterObservable.add(() => {
        if (!chosen) button.background = ui.actionHover;
      });
      button.onPointerOutObservable.add(() => {
        if (!chosen) button.background = ui.action;
      });
      button.onPointerUpObservable.add(() => onAnswer({ questionId: question.id, value }));

      grid.addControl(button, 0, column);
    });

    return grid;
  };

  container.addControl(makeRow(0, [0, 1, 2, 3, 4, 5]));
  container.addControl(makeRow(1, [6, 7, 8, 9, 10]));

  // --- What the ends mean ---
  const labels = new Grid(`labels_${question.id}`);
  labels.width = `${usableWidth}px`;
  labels.height = `${labelsHeight}px`;
  labels.addColumnDefinition(0.5);
  labels.addColumnDefinition(0.5);

  const min = new TextBlock(`min_${question.id}`, `0 = ${question.minLabel}`);
  min.color = ui.textMuted;
  min.fontSize = text.caption;
  min.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
  labels.addControl(min, 0, 0);

  const max = new TextBlock(`max_${question.id}`, `10 = ${question.maxLabel}`);
  max.color = ui.textMuted;
  max.fontSize = text.caption;
  max.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
  labels.addControl(max, 0, 1);

  container.addControl(labels);

  console.log(
    `[scale] "${question.id}" promptLines=${promptLines} promptHeight=${promptHeight} ` +
      `totalHeight=${totalHeight} (panel texture is ${sizes.panelTextureH} tall)`,
  );

  return container;
}
