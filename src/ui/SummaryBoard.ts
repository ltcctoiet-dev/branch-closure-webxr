import { Control, Grid, Rectangle, StackPanel, TextBlock } from "@babylonjs/gui";
import { sizes, uiPalette, uiText } from "../core/theme";
import { store } from "../core/store";
import { customerProfile } from "../content/tokens";
import { summaryLabels } from "../content/labels";
import { getAnswer, hasVisited } from "../session/record";

/**
 * The customer's personal summary.
 *
 * This is the thing they walk away with. Everything on it comes from what they
 * actually did — the concern they picked, the places they looked at, how their
 * confidence moved — rather than a generic leaflet.
 *
 * Deliberately compact: label on the left, value on the right, one line each.
 * Nine rows at caption size fits the panel with room for the buttons. If you
 * add rows, check the console line at the bottom for the height.
 */

const ROW_GAP_PX = 6;
const SIDE_PADDING_PX = 44;
const SAFETY_MARGIN_PX = 40;

type Row = { label: string; value: string };

export function buildSummary(): Control {
  const ui = uiPalette();
  const text = uiText();
  const labels = summaryLabels();
  const profile = customerProfile();

  const usableWidth = sizes.panelTextureW - SIDE_PADDING_PX * 2 - SAFETY_MARGIN_PX;
  const rowHeight = text.caption + 16;

  const container = new StackPanel("summaryBoard");
  container.isVertical = true;
  container.width = `${usableWidth}px`;

  if (!labels || !profile) {
    const problem = new TextBlock("summaryMissing", "Summary is not available.");
    problem.color = ui.textMuted;
    problem.fontSize = text.body;
    problem.height = `${text.body + 20}px`;
    container.addControl(problem);
    return container;
  }

  const state = store.get();

  // --- Which places did they actually look at? ---
  const places: string[] = [];
  if (hasVisited("hub.")) places.push(labels.places.hub);
  if (hasVisited("post.")) places.push(labels.places.postOffice);
  if (hasVisited("mobile.")) places.push(labels.places.mobile);
  if (hasVisited("support.")) places.push(labels.places.support);

  // --- Did confidence move? ---
  const confidence = describeChange(
    getAnswer("wayfindingConfidenceBefore"),
    getAnswer("wayfindingConfidenceAfter"),
    labels.confidence,
  );

  const rows: Row[] = [
    { label: labels.rows.customer, value: profile.customerName },
    { label: labels.rows.branch, value: profile.branchName },
    {
      label: labels.rows.concern,
      value: state.selectedConcern
        ? labels.concerns[state.selectedConcern] ?? labels.concerns.none
        : labels.concerns.none,
    },
    {
      label: labels.rows.visited,
      value: places.length > 0 ? places.join(", ") : labels.places.none,
    },
    {
      label: labels.rows.hub,
      value: `${profile.hubName}, ${profile.hubDistance} — ${profile.hubOpeningTimes}`,
    },
    { label: labels.rows.communityBanker, value: profile.communityBankerDays },
    { label: labels.rows.confidence, value: confidence },
    { label: labels.rows.bring, value: labels.bring },
    { label: labels.rows.ask, value: labels.ask },
  ];

  rows.forEach((row, index) => {
    // Long values get two lines; the rest get one.
    const lines = estimateLines(row.value, text.caption, usableWidth * 0.66);
    const height = Math.max(rowHeight, lines * (text.caption + 8) + 10);

    const band = new Rectangle(`summaryRow_${index}`);
    band.width = `${usableWidth}px`;
    band.height = `${height}px`;
    band.thickness = 0;
    band.background = index % 2 === 0 ? "#00000022" : "#00000000";
    band.paddingBottom = `${ROW_GAP_PX}px`;

    const grid = new Grid(`summaryGrid_${index}`);
    grid.addColumnDefinition(0.32);
    grid.addColumnDefinition(0.68);

    const label = new TextBlock(`summaryLabel_${index}`, row.label);
    label.color = ui.textMuted;
    label.fontSize = text.caption;
    label.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    label.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    label.paddingLeft = "12px";
    label.paddingTop = "6px";
    grid.addControl(label, 0, 0);

    const value = new TextBlock(`summaryValue_${index}`, row.value);
    value.color = ui.textLight;
    value.fontSize = text.caption;
    value.textWrapping = true;
    value.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    value.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    value.paddingRight = "12px";
    value.paddingTop = "6px";
    grid.addControl(value, 0, 1);

    band.addControl(grid);
    container.addControl(band);
  });

  const totalHeight = rows.reduce((sum, row) => {
    const lines = estimateLines(row.value, text.caption, usableWidth * 0.66);
    return sum + Math.max(rowHeight, lines * (text.caption + 8) + 10);
  }, 0);

  container.height = `${totalHeight}px`;

  console.log(
    `[summary] ${rows.length} rows, ${totalHeight}px (panel texture is ${sizes.panelTextureH} tall)`,
  );

  return container;
}

function describeChange(
  before: number | null,
  after: number | null,
  words: Record<string, string>,
): string {
  if (before === null) return words.notAnswered;
  if (after === null) return `${before} out of 10 ${words.before}`;

  const direction =
    after > before ? words.improved : after === before ? words.unchanged : words.lower;

  return `${before} ${words.before}, ${after} ${words.after} — ${direction}`;
}

function estimateLines(text: string, fontSize: number, widthPx: number): number {
  const charsPerLine = Math.max(10, Math.floor(widthPx / (fontSize * 0.52)));
  return Math.max(1, Math.ceil(text.length / charsPerLine));
}
