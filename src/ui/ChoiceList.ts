import { Button, Control, Grid } from "@babylonjs/gui";
import { sizes, uiPalette, uiText } from "../core/theme";
import type { Choice } from "../content/schema";
import { resolveTokens } from "../content/tokens";

/**
 * The row of buttons at the bottom of a panel.
 *
 * NEW: buttons can be disabled. A Continue marked `requireAnswer` stays greyed
 * out until the question above it has been answered — so nobody accidentally
 * skips a survey question, and the survey data stays complete. It's also a
 * clearer prompt than a nag message would be.
 */

export function buildChoices(
  choices: Choice[],
  onPick: (choice: Choice) => void,
  isSelected?: (choice: Choice) => boolean,
  isDisabled?: (choice: Choice) => boolean,
): Control {
  const ui = uiPalette();
  const text = uiText();

  const twoColumns = choices.length > 5;
  const columnCount = twoColumns ? 2 : 1;
  const rowCount = Math.ceil(choices.length / columnCount);

  const grid = new Grid("choiceGrid");
  for (let c = 0; c < columnCount; c += 1) grid.addColumnDefinition(1 / columnCount);
  for (let r = 0; r < rowCount; r += 1) grid.addRowDefinition(1 / rowCount);

  const rowHeight = Math.max(sizes.minTargetPx, text.button + 34);
  grid.height = `${rowCount * rowHeight}px`;

  choices.forEach((choice, index) => {
    const column = twoColumns ? index % 2 : 0;
    const row = twoColumns ? Math.floor(index / 2) : index;

    const selected = isSelected?.(choice) ?? false;
    const disabled = isDisabled?.(choice) ?? false;

    const button = Button.CreateSimpleButton(
      `choice_${choice.id}`,
      resolveTokens(choice.label),
    );
    button.cornerRadius = 14;
    button.fontSize = text.button;
    button.width = "96%";
    button.height = "88%";

    if (disabled) {
      button.color = ui.textMuted;
      button.background = ui.panel;
      button.thickness = 2;
      button.alpha = 0.45;
      button.isEnabled = false;
    } else {
      button.color = ui.textLight;
      button.background = selected ? ui.selected : ui.action;
      button.thickness = selected ? 5 : 2;

      button.onPointerEnterObservable.add(() => {
        if (!isSelected?.(choice)) button.background = ui.actionHover;
      });
      button.onPointerOutObservable.add(() => {
        button.background = isSelected?.(choice) ? ui.selected : ui.action;
      });
      button.onPointerUpObservable.add(() => onPick(choice));
    }

    if (button.textBlock) {
      button.textBlock.textWrapping = true;
      button.textBlock.paddingLeft = "14px";
      button.textBlock.paddingRight = "14px";
    }

    grid.addControl(button, row, column);
  });

  return grid;
}
