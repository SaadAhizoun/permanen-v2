import { describe, expect, it } from "vitest";
import { calculateAdjustedTotals, compareAdjustedPriority, safeNumber } from "./adjustedTotals";

describe("calculateAdjustedTotals", () => {
  it("adds period, opening balances, and one global credit", () => {
    const totals = calculateAdjustedTotals({
      periodNormal: 2,
      periodHoliday: 0,
      openingNormalBalance: 4,
      openingHolidayBalance: 2,
      credit: { kind: "global", initialCredit: 1 },
    });

    expect(totals.adjustedGlobal).toBe(9);
  });

  it("preserves negative opening balances when ranking adjusted totals", () => {
    const memberA = calculateAdjustedTotals({
      periodNormal: 2,
      openingNormalBalance: 4,
      openingHolidayBalance: 2,
      credit: { kind: "global", initialCredit: 1 },
    });
    const memberB = calculateAdjustedTotals({
      periodNormal: 4,
      openingNormalBalance: -2,
      openingHolidayBalance: 1,
      credit: { kind: "global", initialCredit: 0 },
    });

    expect(memberB.adjustedGlobal).toBe(3);
    expect(memberB.adjustedGlobal).toBeLessThan(memberA.adjustedGlobal);
  });

  it("adds a global credit exactly once", () => {
    const totals = calculateAdjustedTotals({
      periodNormal: 2,
      periodHoliday: 3,
      credit: { kind: "global", initialCredit: 4 },
    });

    expect(totals.adjustedNormal).toBe(2);
    expect(totals.adjustedHoliday).toBe(3);
    expect(totals.adjustedGlobal).toBe(9);
  });

  it("treats null, undefined, empty strings, and non-numbers as zero", () => {
    expect([null, undefined, "", "not-a-number"].map(safeNumber)).toEqual([0, 0, 0, 0]);

    const totals = calculateAdjustedTotals({
      periodNormal: null,
      periodHoliday: undefined,
      openingNormalBalance: "",
      openingHolidayBalance: "not-a-number",
      credit: { kind: "split", initialNormalCredit: null, initialHolidayCredit: "" },
    });

    expect(totals.adjustedGlobal).toBe(0);
  });

  it("keeps split credits in their category without double counting", () => {
    const totals = calculateAdjustedTotals({
      periodNormal: 3,
      periodHoliday: 2,
      credit: { kind: "split", initialNormalCredit: 4, initialHolidayCredit: 1 },
    });

    expect(totals.adjustedNormal).toBe(7);
    expect(totals.adjustedHoliday).toBe(3);
    expect(totals.adjustedGlobal).toBe(10);
    expect(totals.adjustedGlobal).toBe(totals.adjustedNormal + totals.adjustedHoliday);
  });

  it("provides one shared adjusted value for screen, PDF, and Excel projections", () => {
    const totals = calculateAdjustedTotals({
      periodNormal: 4,
      periodHoliday: 1,
      credit: { kind: "split", initialNormalCredit: -2, initialHolidayCredit: 3 },
    });

    const screenValue = totals.adjustedGlobal;
    const pdfValue = totals.adjustedGlobal;
    const excelValue = totals.adjustedGlobal;

    expect([screenValue, pdfValue, excelValue]).toEqual([6, 6, 6]);
  });

  it("prioritizes adjusted workload, then never assigned, recency, and French name", () => {
    const members = [
      { adjustedWorkload: 9, daysSinceLast: 100, name: "Membre A" },
      { adjustedWorkload: 3, daysSinceLast: 2, name: "Membre B" },
      { adjustedWorkload: 3, daysSinceLast: 20, name: "Élodie" },
      { adjustedWorkload: 3, daysSinceLast: null, name: "Zoé" },
      { adjustedWorkload: 3, daysSinceLast: 20, name: "Alain" },
    ];

    expect([...members].sort(compareAdjustedPriority).map((member) => member.name)).toEqual([
      "Zoé",
      "Alain",
      "Élodie",
      "Membre B",
      "Membre A",
    ]);
  });
});
