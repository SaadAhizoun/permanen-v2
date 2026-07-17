/**
 * Literal color constants for Recharts (SVG `fill`/`stroke` need actual
 * color strings, not CSS custom properties — html2canvas-based PDF export
 * also doesn't reliably resolve `var()` inside SVG attributes). Keep these
 * in sync with the `--chart-*` custom properties in src/index.css; they're
 * visual only and never feed into a calculation.
 */

/** Global (Solde + période) ranking — indigo → teal. */
export const chartGlobal = {
  primary: "hsl(243, 75%, 60%)",
  secondary: "hsl(173, 58%, 39%)",
};

/** Normal-duty ranking — blue → cyan. */
export const chartNormal = {
  primary: "hsl(217, 85%, 57%)",
  secondary: "hsl(189, 85%, 42%)",
};

/** Holiday/weekend-duty ranking — amber → violet. */
export const chartHoliday = {
  primary: "hsl(38, 92%, 50%)",
  secondary: "hsl(271, 65%, 58%)",
};

export const chartNeutral = "hsl(220, 9%, 46%)";
export const chartMuted = "hsl(220, 13%, 91%)";

/** Rank-highlight accents for the top three positions in a ranking. */
export const rankAccent = {
  1: { fill: "hsl(38, 92%, 50%)", ring: "hsl(38, 92%, 50%)" }, // gold/amber
  2: { fill: "hsl(220, 9%, 58%)", ring: "hsl(220, 9%, 58%)" }, // silver/slate
  3: { fill: "hsl(25, 65%, 48%)", ring: "hsl(25, 65%, 48%)" }, // bronze
} as const;

export type ChartCategory = "global" | "normal" | "holiday";

const categoryMap: Record<ChartCategory, { primary: string; secondary: string }> = {
  global: chartGlobal,
  normal: chartNormal,
  holiday: chartHoliday,
};

export function getChartCategoryColors(category: ChartCategory) {
  return categoryMap[category];
}
