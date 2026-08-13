import { Button, Control, Grid, StackPanel, TextBlock } from "@babylonjs/gui";
import { sizes, uiPalette, uiText } from "../core/theme";
import type { ScaleQuestion } from "../content/schema";

/**
 * The 0 to 10 confidence scale.
 *
 * It appears eight times across the full script — three times before the
 * journey and five after — so it's a component rather than something laid out
 * per scene.
 *
 * Eleven buttons across 1536 pixels is about 128 pixels each, which works out
 * at roughly 25cm wide in the room. That's comfortably big enough to hit with a
 * Quest controller pointing from 2.4 metres away.
 */

export type ScaleAnswer = { questionId: string; value: number };

export function buildScale(
  question: ScaleQuestion,
  currentValue: number | null,
  onAnswer: (answer: ScaleAnswer) => void,
): Control {
  const ui = uiPalette();
  const text = uiText();

  const container = new StackPanel(`scale_${question.id}`);
  container.isVertical = true;
  container.height = `${text.body + sizes.minTargetPx + text.caption + 44}px`;
  container.paddingBottom = "16px";

  const prompt = new TextBlock(`prompt_${question.id}`, question.prompt);
  prompt.color = ui.textLight;
  prompt.fontSize = text.body;
  prompt.height = `${text.body + 20}px`;
  prompt.textWrapping = true;
  prompt.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
  container.addControl(prompt);

  const row = new Grid(`row_${question.id}`);
  row.height = `${sizes.minTargetPx}px`;
  for (let i = 0; i <= 10; i += 1) row.addColumnDefinition(1 / 11);

  for (let value = 0; value <= 10; value += 1) {
    const chosen = value === currentValue;

    const button = Button.CreateSimpleButton(`${question.id}_${value}`, String(value));
    button.color = ui.textLight;
    button.background = chosen ? ui.selected : ui.action;
    button.thickness = chosen ? 5 : 2;
    button.cornerRadius = 12;
    button.fontSize = text.button;
    button.width = "94%";
    button.height = "94%";

    button.onPointerEnterObservable.add(() => {
      if (!chosen) button.background = ui.actionHover;
    });
    button.onPointerOutObservable.add(() => {
      if (!chosen) button.background = ui.action;
    });
    button.onPointerUpObservable.add(() => onAnswer({ questionId: question.id, value }));

    row.addControl(button, 0, value);
  }
  container.addControl(row);

  // The words at each end. Without these a 0 to 10 scale is ambiguous —
  // is 10 very worried, or very confident?
  const labels = new Grid(`labels_${question.id}`);
  labels.height = `${text.caption + 14}px`;
  labels.addColumnDefinition(0.5);
  labels.addColumnDefinition(0.5);

  const min = new TextBlock(`min_${question.id}`, `0  ${question.minLabel}`);
  min.color = ui.textMuted;
  min.fontSize = text.caption;
  min.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
  labels.addControl(min, 0, 0);

  const max = new TextBlock(`max_${question.id}`, `${question.maxLabel}  10`);
  max.color = ui.textMuted;
  max.fontSize = text.caption;
  max.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
  labels.addControl(max, 0, 1);

  container.addControl(labels);
  return container;
}
