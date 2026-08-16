/**
 * Wording for the summary screen.
 *
 * Same rule as scenes.json: this is customer-facing copy, so it lives in a data
 * file rather than in TypeScript. Loaded once at start-up.
 */

export type SummaryLabels = {
  rows: Record<string, string>;
  concerns: Record<string, string>;
  places: Record<string, string>;
  confidence: Record<string, string>;
  bring: string;
  ask: string;
};

let labels: SummaryLabels | null = null;

export async function loadSummaryLabels(url = "/data/summary.json"): Promise<SummaryLabels> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Could not open ${url} (error ${response.status}).`);
  }
  labels = (await response.json()) as SummaryLabels;
  return labels;
}

export function summaryLabels(): SummaryLabels | null {
  return labels;
}
