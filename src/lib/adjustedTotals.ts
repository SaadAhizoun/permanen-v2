export type CreditInput =
  | {
      kind: "global";
      initialCredit?: unknown;
    }
  | {
      kind: "split";
      initialNormalCredit?: unknown;
      initialHolidayCredit?: unknown;
    };

export type AdjustedTotalsInput = {
  periodNormal?: unknown;
  periodHoliday?: unknown;
  openingNormalBalance?: unknown;
  openingHolidayBalance?: unknown;
  credit: CreditInput;
};

export type AdjustedTotals = {
  periodNormal: number;
  periodHoliday: number;
  openingNormalBalance: number;
  openingHolidayBalance: number;
  initialCredit: number;
  initialNormalCredit: number;
  initialHolidayCredit: number;
  adjustedNormal: number;
  adjustedHoliday: number;
  adjustedGlobal: number;
};

export function safeNumber(value: unknown): number {
  if (value === null || value === undefined || value === "") return 0;
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

export function calculateAdjustedTotals(input: AdjustedTotalsInput): AdjustedTotals {
  const periodNormal = safeNumber(input.periodNormal);
  const periodHoliday = safeNumber(input.periodHoliday);
  const openingNormalBalance = safeNumber(input.openingNormalBalance);
  const openingHolidayBalance = safeNumber(input.openingHolidayBalance);

  if (input.credit.kind === "global") {
    const initialCredit = safeNumber(input.credit.initialCredit);
    const adjustedNormal = periodNormal + openingNormalBalance;
    const adjustedHoliday = periodHoliday + openingHolidayBalance;

    return {
      periodNormal,
      periodHoliday,
      openingNormalBalance,
      openingHolidayBalance,
      initialCredit,
      initialNormalCredit: 0,
      initialHolidayCredit: 0,
      adjustedNormal,
      adjustedHoliday,
      adjustedGlobal: adjustedNormal + adjustedHoliday + initialCredit,
    };
  }

  const initialNormalCredit = safeNumber(input.credit.initialNormalCredit);
  const initialHolidayCredit = safeNumber(input.credit.initialHolidayCredit);
  const adjustedNormal = periodNormal + openingNormalBalance + initialNormalCredit;
  const adjustedHoliday = periodHoliday + openingHolidayBalance + initialHolidayCredit;

  return {
    periodNormal,
    periodHoliday,
    openingNormalBalance,
    openingHolidayBalance,
    initialCredit: initialNormalCredit + initialHolidayCredit,
    initialNormalCredit,
    initialHolidayCredit,
    adjustedNormal,
    adjustedHoliday,
    adjustedGlobal: adjustedNormal + adjustedHoliday,
  };
}

export type PriorityCandidate = {
  adjustedWorkload: number;
  daysSinceLast: number | null;
  name: string;
};

export function compareAdjustedPriority(
  memberA: PriorityCandidate,
  memberB: PriorityCandidate
): number {
  if (memberA.adjustedWorkload !== memberB.adjustedWorkload) {
    return memberA.adjustedWorkload - memberB.adjustedWorkload;
  }
  if (memberA.daysSinceLast === null && memberB.daysSinceLast !== null) return -1;
  if (memberA.daysSinceLast !== null && memberB.daysSinceLast === null) return 1;
  if (
    memberA.daysSinceLast !== null &&
    memberB.daysSinceLast !== null &&
    memberA.daysSinceLast !== memberB.daysSinceLast
  ) {
    return memberB.daysSinceLast - memberA.daysSinceLast;
  }
  return memberA.name.localeCompare(memberB.name, "fr", { sensitivity: "base" });
}
