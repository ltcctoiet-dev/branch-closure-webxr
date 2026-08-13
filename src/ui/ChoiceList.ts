import { Button, Control, Grid } from "@babylonjs/gui";
import { sizes, uiPalette, uiText } from "../core/theme";
import type { Choice } from "../content/schema";

/**
 * The row of buttons at the bottom of a panel.
 *
 * Above five options it switches to two columns, because the accessibility
 * screen has ten and the concern screen has eight. In one column, at a font
 * size someone can actually read, they'd run off the bottom of the panel.
 */

export function buildChoices(
  choices: Choice[],
  onPick: (choice: Choice) => void,
  isSelected?: (choice: Choice) => boolean,
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

    const button = Button.CreateSimpleButton(`choice_${choice.id}`, choice.label);
    button.color = ui.textLight;
    button.background = selected ? ui.selected : ui.action;
    button.thickness = selected ? 5 : 2;
    button.cornerRadius = 14;
    button.fontSize = text.button;
    button.width = "96%";
    button.height = "88%";

    if (button.textBlock) {
      button.textBlock.textWrapping = true;
      button.textBlock.paddingLeft = "14px";
      button.textBlock.paddingRight = "14px";
    }

    button.onPointerEnterObservable.add(() => {
      if (!isSelected?.(choice)) button.background = ui.actionHover;
    });
    button.onPointerOutObservable.add(() => {
      button.background = isSelected?.(choice) ? ui.selected : ui.action;
    });
    button.onPointerUpObservable.add(() => onPick(choice));

    grid.addControl(button, row, column);
  });

  return grid;
}
