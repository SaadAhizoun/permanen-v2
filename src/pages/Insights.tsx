import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

import { AnimatePresence, useReducedMotion } from "motion/react";
import * as m from "motion/react-m";
import { premiumEase } from "@/lib/motion";
import {
  getChartCategoryColors,
  rankAccent,
  chartMuted,
  chartGlobal,
  chartNormal,
  chartHoliday,
  type ChartCategory,
} from "@/lib/chartColors";
import {
  calculateAdjustedTotals,
  compareAdjustedPriority,
  safeNumber,
  type AdjustedTotals,
} from "@/lib/adjustedTotals";
import {
  StaggerContainer,
  StaggerItem,
  AnimatedSection,
  AnimatedNumber,
  AnimatedList,
  AnimatedPresencePanel,
} from "@/components/motion";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadingState, StatusBadge } from "@/components/shared";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { Download, FileSpreadsheet, FileText, Sparkles } from "lucide-react";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  LabelList,
  Cell,
  CartesianGrid,
} from "recharts";

import {
  differenceInCalendarDays,
  endOfMonth,
  format,
  startOfMonth,
  startOfYear,
  subMonths,
} from "date-fns";
import { fr as frLocale } from "date-fns/locale";

// -------------------- Types --------------------
type Member = {
  id: string;
  full_name: string;
  initial_credit_normal?: number | null;
  initial_credit_holiday?: number | null;
};

type Duty = {
  duty_date: string; // YYYY-MM-DD
  duty_type?: string | null;
  team_member_id: string | null;
  team_member?: { id: string; full_name: string } | null;
};

type AnalysisMode = "period" | "global";
type DecisionView = "global" | "normal" | "holiday";
type DecisionChartDisplay = "top10" | "all";

type RecencyValues = {
  total: number | null;
  normal: number | null;
  holiday: number | null;
};

// -------------------- Constants --------------------
const weekdayLabels = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"] as const;

const LABELS = {
  solde: "Crédits initiaux",
  period: "Permanences sur la période",
  total: "Total corrigé global (Cumul + crédits)",
  normal: "Jours normaux",
  holiday: "Jours fériés",
} as const;

// -------------------- Utils --------------------
function useIsMobile(breakpointPx = 768) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpointPx - 1}px)`);
    const onChange = () => setIsMobile(mq.matches);
    onChange();
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, [breakpointPx]);

  return isMobile;
}

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function shortName(full: string) {
  const parts = full.trim().split(/\s+/);
  return parts[0] || full;
}

/**
 * DB stores date-only: "YYYY-MM-DD"
 * We must NEVER do new Date("YYYY-MM-DD") because it can shift day by timezone.
 */
function parseDateOnlyUTC(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
}

function isWeekendByDayIndex(utcDayIndex: number) {
  return utcDayIndex === 0 || utcDayIndex === 6;
}

function clampDateStr(d: string) {
  return (d || "").trim().slice(0, 10);
}

function formatDateForDisplay(dateStr: string) {
  const [year, month, day] = clampDateStr(dateStr).split("-");
  return year && month && day ? `${day}/${month}/${year}` : "…";
}

function toDateInputValue(date: Date) {
  return format(date, "yyyy-MM-dd");
}

function compareNames(nameA: string, nameB: string) {
  return nameA.localeCompare(nameB, "fr", { sensitivity: "base" });
}

function comparePlanningPriority(
  countA: number,
  countB: number,
  daysA: number | null,
  daysB: number | null,
  nameA: string,
  nameB: string
) {
  return compareAdjustedPriority(
    { adjustedWorkload: countA, daysSinceLast: daysA, name: nameA },
    { adjustedWorkload: countB, daysSinceLast: daysB, name: nameB }
  );
}

function getDecisionViewLabel(view: DecisionView) {
  if (view === "normal") return "Normale";
  if (view === "holiday") return "Fériée / week-end";
  return "Globale";
}

function getDefaultTableSort(view: DecisionView) {
  if (view === "normal") return "totalNormal" as const;
  if (view === "holiday") return "totalHoliday" as const;
  return "total" as const;
}

function formatRelevantDutyDate(days: number | null, referenceDate: string) {
  if (days === null) return "Jamais";
  const date = parseDateOnlyUTC(referenceDate);
  date.setUTCDate(date.getUTCDate() - days);
  return `${String(date.getUTCDate()).padStart(2, "0")}/${String(
    date.getUTCMonth() + 1
  ).padStart(2, "0")}/${date.getUTCFullYear()}`;
}

function compareRecencyPriority(
  daysA: number | null,
  daysB: number | null,
  nameA: string,
  nameB: string
) {
  if (daysA === null && daysB !== null) return -1;
  if (daysA !== null && daysB === null) return 1;
  if (daysA !== null && daysB !== null && daysA !== daysB) return daysB - daysA;
  return compareNames(nameA, nameB);
}

function addRecencyDisplayValues<
  T extends { days: number | null; fullName: string }
>(items: T[]) {
  const maximumRealDays = Math.max(0, ...items.flatMap((item) => item.days ?? []));
  const displayPadding = Math.max(7, Math.ceil(maximumRealDays * 0.1));

  return [...items]
    .sort((a, b) => compareRecencyPriority(a.days, b.days, a.fullName, b.fullName))
    .map((item, index) => ({
      ...item,
      rank: index + 1,
      displayDays: item.days ?? maximumRealDays + displayPadding,
      displayLabel: item.days === null ? "Jamais" : String(item.days),
    }));
}

function headerCell(title: string, subtitle?: string) {
  return (
    <div className="flex flex-col items-end">
      <div className="font-medium leading-4">{title}</div>
      {subtitle ? (
        <div className="text-[10px] text-muted-foreground leading-4">
          {subtitle}
        </div>
      ) : null}
    </div>
  );
}

// ---------- Responsive helpers ----------
const CHART_MOBILE_LIMIT = 10;

function limitForMobile<T>(
  arr: T[],
  isMobile: boolean,
  showAll: boolean,
  limit = CHART_MOBILE_LIMIT
) {
  if (!isMobile) return arr;
  return showAll ? arr : arr.slice(0, limit);
}

function getChartXAxisProps(isMobile: boolean) {
  return {
    interval: isMobile ? 1 : 0,
    angle: isMobile ? -35 : -30,
    textAnchor: "end" as const,
    height: isMobile ? 78 : 92,
    fontSize: isMobile ? 10 : 11,
    tickMargin: 8,
  };
}

function getChartMinWidth(itemCount: number, isMobile: boolean) {
  return Math.max(isMobile ? 620 : 900, itemCount * (isMobile ? 58 : 42));
}

/**
 * Presentation-only helper: derives a stable identity string from a chart's
 * already-computed dataset (member id + displayed value), used purely as a
 * React `key` to fade-remount a chart when its data actually changes —
 * never influences sorting/filtering/aggregation.
 */
function chartDatasetKey<T extends { memberId: string }>(
  items: T[],
  pick: (item: T) => number | string
) {
  return items.map((item) => `${item.memberId}:${pick(item)}`).join("|");
}

// -------------------- Small Components --------------------
function KpiCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="py-4 md:py-5">
        <div className="text-sm text-muted-foreground">{label}</div>
        <div className="text-2xl md:text-3xl font-bold mt-1 tabular-nums">
          {value}
        </div>
        {hint ? <div className="text-xs text-muted-foreground mt-1">{hint}</div> : null}
      </CardContent>
    </Card>
  );
}

function TotalsMobileCards({
  rows,
}: {
  rows: Array<{
    memberId: string;
    name: string;
    periodNormal: number;
    periodHoliday: number;
    initialNormalCredit: number;
    initialHolidayCredit: number;
    initialCredit: number;
    relevantScore: number;
    relevantLabel: string;
    totalNormal: number;
    totalHoliday: number;
    total: number;
    rank: number;
  }>;
}) {
  return (
    <div className="space-y-3">
      <AnimatedList
        as="div"
        items={rows}
        getKey={(r) => r.memberId}
        layout
        renderItem={(r) => (
          <Card>
            <CardContent className="py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  {r.rank <= 3 ? (
                    <span
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                      style={{ backgroundColor: rankAccent[r.rank as 1 | 2 | 3].fill }}
                    >
                      {r.rank}
                    </span>
                  ) : (
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                      {r.rank}
                    </span>
                  )}
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{r.name}</div>
                    <div className="text-xs text-muted-foreground">
                      Score prioritaire • {r.relevantLabel}
                    </div>
                  </div>
                </div>
                <div className="text-2xl font-bold tabular-nums text-priority">
                  <AnimatedNumber value={r.relevantScore} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 mt-3 text-sm">
                <div className="rounded-md border p-2">
                  <div className="text-xs text-muted-foreground">Période normale</div>
                  <div className="font-semibold tabular-nums">{r.periodNormal}</div>
                </div>
                <div className="rounded-md border p-2">
                  <div className="text-xs text-muted-foreground">Crédit initial normal</div>
                  <div className="font-semibold tabular-nums">{r.initialNormalCredit}</div>
                </div>
                <div className="rounded-md border p-2">
                  <div className="text-xs text-muted-foreground">Période fériée</div>
                  <div className="font-semibold tabular-nums">{r.periodHoliday}</div>
                </div>
                <div className="rounded-md border p-2">
                  <div className="text-xs text-muted-foreground">Crédit initial férié</div>
                  <div className="font-semibold tabular-nums">{r.initialHolidayCredit}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      />
    </div>
  );
}

function MatrixMobileCards({
  rows,
}: {
  rows: Array<{
    memberId: string;
    name: string;
    baseNormal: number;
    baseHoliday: number;
    baseTotal: number;
    weekdayCountsPeriod: number[];
    periodTotal: number;
    periodAdjustedTotal: number;
    totalGlobal: number;
  }>;
}) {
  return (
    <div className="space-y-3">
      <AnimatedList
        as="div"
        items={rows}
        getKey={(row) => row.memberId}
        layout
        renderItem={(row) => (
          <Card>
            <CardContent className="py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold truncate">{row.name}</div>
                  <div className="text-xs text-muted-foreground">
                    Crédit: {row.baseTotal} • Période brute: {row.periodTotal}
                  </div>
                </div>
                <div className="text-xl font-bold tabular-nums">
                  <AnimatedNumber value={row.totalGlobal} />
                </div>
              </div>

              <div className="grid grid-cols-7 gap-1 mt-3 text-center text-[11px]">
                {row.weekdayCountsPeriod.map((v, i) => (
                  <div key={i} className="rounded-md border py-1">
                    <div className="text-[10px] text-muted-foreground">{weekdayLabels[i]}</div>
                    <div className="font-semibold tabular-nums">{v === 0 ? "—" : v}</div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-3 gap-2 mt-3 text-sm">
                <div className="rounded-md border p-2">
                  <div className="text-xs text-muted-foreground">Solde normal</div>
                  <div className="font-semibold tabular-nums">{row.baseNormal}</div>
                </div>
                <div className="rounded-md border p-2">
                  <div className="text-xs text-muted-foreground">Solde férié</div>
                  <div className="font-semibold tabular-nums">{row.baseHoliday}</div>
                </div>
                <div className="rounded-md border p-2">
                  <div className="text-xs text-muted-foreground">Total corrigé période</div>
                  <div className="font-semibold tabular-nums">{row.periodAdjustedTotal}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      />
    </div>
  );
}

// ------------------ Sticky table helpers ------------------
const NAME_COL_W = "w-[160px] min-w-[160px]";
const TH_TOP_LEFT = "sticky top-0 left-0 z-50 bg-background " + NAME_COL_W;
const TH_TOP = "sticky top-0 z-40 bg-background";
const TD_LEFT =
  "sticky left-0 z-30 bg-background " +
  NAME_COL_W +
  " shadow-[6px_0_10px_-8px_rgba(0,0,0,0.25)]";

// ==========================================================
// ======================= PAGE =============================
// ==========================================================
async function fetchAllDutiesPaged() {
  const pageSize = 1000;
  let from = 0;
  const all: Duty[] = [];

  while (true) {
    const { data, error } = await supabase
      .from("duty_entries")
      .select("duty_date, duty_type, team_member_id, team_member:team_members(id, full_name)")
      .order("duty_date", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) throw error;

    const batch = (data ?? []) as Duty[];
    all.push(...batch);

    if (batch.length < pageSize) break;
    from += pageSize;
  }

  return all;
}

export default function Insights() {
  const [loading, setLoading] = useState(true);
  const isMobile = useIsMobile();
  const shouldReduceMotion = useReducedMotion();
  const chartFadeTransition = shouldReduceMotion
    ? { duration: 0.01 }
    : { duration: 0.24, ease: premiumEase };
  const [showAllChartsMobile, setShowAllChartsMobile] = useState(false);

  const chartXAxisProps = getChartXAxisProps(isMobile);

  const [members, setMembers] = useState<Member[]>([]);
  const [duties, setDuties] = useState<Duty[]>([]);
  const [holidayDatesSet, setHolidayDatesSet] = useState<Set<string>>(new Set());

  // Filters
  const [filterOpen, setFilterOpen] = useState(false);
  const [memberSearch, setMemberSearch] = useState("");
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [tableSearch, setTableSearch] = useState("");
  const [matrixSearch, setMatrixSearch] = useState("");
  const [matrixOnlyActive, setMatrixOnlyActive] = useState(false);
  const [analysisMode, setAnalysisMode] = useState<AnalysisMode>("period");
  const [decisionView, setDecisionView] = useState<DecisionView>("global");
  const [decisionChartDisplay, setDecisionChartDisplay] =
    useState<DecisionChartDisplay>("top10");
  const [fullRankingOpen, setFullRankingOpen] = useState(false);

  const [tableSortBy, setTableSortBy] = useState<
    "name" | "totalNormal" | "totalHoliday" | "total"
  >("total");

  const [tableSortOrder, setTableSortOrder] = useState<"asc" | "desc">("asc");

  const [filterTotalNormalMin, setFilterTotalNormalMin] = useState("");
  const [filterTotalNormalMax, setFilterTotalNormalMax] = useState("");

  const [filterTotalHolidayMin, setFilterTotalHolidayMin] = useState("");
  const [filterTotalHolidayMax, setFilterTotalHolidayMax] = useState("");

  const [filterTotalGlobalMin, setFilterTotalGlobalMin] = useState("");
  const [filterTotalGlobalMax, setFilterTotalGlobalMax] = useState("");

  // Export dialog
  const [exportOpen, setExportOpen] = useState(false);
  const [exportFrom, setExportFrom] = useState<string>("");
  const [exportTo, setExportTo] = useState<string>("");
  const [exportIncludeRaw, setExportIncludeRaw] = useState(true);
  const [exportIncludeMatrix, setExportIncludeMatrix] = useState(true);
  const [exportIncludeCharts, setExportIncludeCharts] = useState(true);

  // Refs for chart capture (PDF)
  const refChartTotal = useRef<HTMLDivElement | null>(null);
  const refChartNormal = useRef<HTMLDivElement | null>(null);
  const refChartHoliday = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setTableSortBy(getDefaultTableSort(decisionView));
    setTableSortOrder("asc");
  }, [decisionView]);

  useEffect(() => {
    void fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);

      const { data: membersData, error: membersErr } = await supabase
        .from("team_members")
        .select("id, full_name, initial_credit_normal, initial_credit_holiday")
        .eq("active", true)
        .order("full_name", { ascending: true });

      if (membersErr) throw membersErr;

      const dutiesData = await fetchAllDutiesPaged();

      const { data: holidaysData, error: holidaysErr } = await supabase
        .from("holidays")
        .select("date");

      if (holidaysErr) throw holidaysErr;

      const holidaySet = new Set<string>(
        (holidaysData || [])
          .map((h: any) => clampDateStr(h?.date))
          .filter(Boolean)
      );

      const m = (membersData as Member[]) || [];
      const d = (dutiesData as Duty[]) || [];

      setMembers(m);
      setDuties(d);
      console.log("INSIGHTS DUTIES FETCHED:", d.length);
      setHolidayDatesSet(holidaySet);

      setSelectedMemberIds(m.map((x) => x.id));

      const allDutyDates = d.map((x) => clampDateStr(x.duty_date)).filter(Boolean);
      const todayStr = format(new Date(), "yyyy-MM-dd");
      const minD = allDutyDates.length
        ? allDutyDates.reduce((a, b) => (a < b ? a : b))
        : todayStr;

      setExportFrom(minD);
      setExportTo(todayStr);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const toggleMember = (memberId: string) => {
    setSelectedMemberIds((prev) => {
      const set = new Set(prev);
      if (set.has(memberId)) set.delete(memberId);
      else set.add(memberId);
      return Array.from(set);
    });
  };

  const selectAll = () => setSelectedMemberIds(members.map((m) => m.id));
  const clearAll = () => setSelectedMemberIds([]);

  const selectedCountLabel =
    selectedMemberIds.length === 0 ? members.length : selectedMemberIds.length;

  const oldestAvailableDutyDate = useMemo(() => {
    const dates = duties.map((d) => clampDateStr(d.duty_date)).filter(Boolean);
    return dates.length
      ? dates.reduce((oldest, date) => (date < oldest ? date : oldest))
      : toDateInputValue(new Date());
  }, [duties]);

  const normalizedExportFrom = clampDateStr(exportFrom);
  const normalizedExportTo = clampDateStr(exportTo);
  const isDateRangeValid =
    Boolean(exportFrom && exportTo) && exportFrom <= exportTo;
  const dateRangeError =
    !exportFrom || !exportTo
      ? "Veuillez renseigner une date de début et une date de fin."
      : exportFrom > exportTo
        ? "La date de début ne peut pas être postérieure à la date de fin."
        : null;

  const setPeriod = (from: Date | string, to: Date | string) => {
    setExportFrom(typeof from === "string" ? from : toDateInputValue(from));
    setExportTo(typeof to === "string" ? to : toDateInputValue(to));
  };

  const applyCurrentMonth = () => {
    const today = new Date();
    setPeriod(startOfMonth(today), today);
  };

  const applyPreviousMonth = () => {
    const previousMonth = subMonths(new Date(), 1);
    setPeriod(startOfMonth(previousMonth), endOfMonth(previousMonth));
  };

  const applyCurrentYear = () => {
    const today = new Date();
    setPeriod(startOfYear(today), today);
  };

  const applyAllData = () => setPeriod(oldestAvailableDutyDate, new Date());

  const filteredDuties = useMemo(() => {
    const allowAll = selectedMemberIds.length === 0;
    const set = new Set(selectedMemberIds);

    return duties.filter((d) => {
      if (!d.team_member_id) return false;
      if (allowAll) return true;
      return set.has(d.team_member_id);
    });
  }, [duties, selectedMemberIds]);

  const exportDuties = useMemo(() => {
    if (!isDateRangeValid) return [];

    return filteredDuties.filter((d) => {
      const ds = clampDateStr(d.duty_date);
      return ds >= normalizedExportFrom && ds <= normalizedExportTo;
    });
  }, [filteredDuties, isDateRangeValid, normalizedExportFrom, normalizedExportTo]);

  const COUNT_WEEKEND_AS_HOLIDAY = true;

  const perMemberStats = useMemo(() => {
    const allowAll = selectedMemberIds.length === 0;
    const selectedSet = new Set(selectedMemberIds);

    const stats: Record<
      string,
      {
        memberId: string;
        name: string;
        baseNormal: number;
        baseHoliday: number;
        baseTotal: number;
        periodNormal: number;
        periodHoliday: number;
        periodTotal: number;
        cumulativeNormal: number;
        cumulativeHoliday: number;
        cumulativeTotal: number;
        periodAdjusted: AdjustedTotals;
        globalAdjusted: AdjustedTotals;
        normal: number;
        holiday: number;
        total: number;
        weekendPeriod: number;
        weekdayPeriod: number;
      }
    > = {};

    for (const m of members) {
      if (!allowAll && !selectedSet.has(m.id)) continue;

      const baseNormal = safeNumber(m.initial_credit_normal);
      const baseHoliday = safeNumber(m.initial_credit_holiday);
      const baseTotal = baseNormal + baseHoliday;

      stats[m.id] = {
        memberId: m.id,
        name: m.full_name,
        baseNormal,
        baseHoliday,
        baseTotal,
        periodNormal: 0,
        periodHoliday: 0,
        periodTotal: 0,
        cumulativeNormal: 0,
        cumulativeHoliday: 0,
        cumulativeTotal: 0,
        periodAdjusted: calculateAdjustedTotals({
          credit: { kind: "split", initialNormalCredit: baseNormal, initialHolidayCredit: baseHoliday },
        }),
        globalAdjusted: calculateAdjustedTotals({
          credit: { kind: "split", initialNormalCredit: baseNormal, initialHolidayCredit: baseHoliday },
        }),
        normal: 0,
        holiday: 0,
        total: 0,
        weekendPeriod: 0,
        weekdayPeriod: 0,
      };
    }

    for (const d of exportDuties) {
      const mid = d.team_member_id;
      if (!mid || !stats[mid]) continue;

      const dayKey = clampDateStr(d.duty_date);
      if (!dayKey) continue;

      const dt = parseDateOnlyUTC(dayKey);
      const wd = dt.getUTCDay();

      const isWeekend = isWeekendByDayIndex(wd);
      const isOfficialHoliday = holidayDatesSet.has(dayKey);
      const isHoliday = COUNT_WEEKEND_AS_HOLIDAY
        ? isOfficialHoliday || isWeekend
        : isOfficialHoliday;

      if (isHoliday) {
        stats[mid].periodHoliday += 1;
      } else {
        stats[mid].periodNormal += 1;
      }

      stats[mid].periodTotal += 1;

      if (isWeekend) stats[mid].weekendPeriod += 1;
      else stats[mid].weekdayPeriod += 1;
    }

    if (isDateRangeValid) {
      for (const d of filteredDuties) {
        const mid = d.team_member_id;
        if (!mid || !stats[mid]) continue;

        const dayKey = clampDateStr(d.duty_date);
        if (!dayKey || dayKey > normalizedExportTo) continue;

        const weekday = parseDateOnlyUTC(dayKey).getUTCDay();
        const isHoliday = holidayDatesSet.has(dayKey) ||
          (COUNT_WEEKEND_AS_HOLIDAY && isWeekendByDayIndex(weekday));

        if (isHoliday) stats[mid].cumulativeHoliday += 1;
        else stats[mid].cumulativeNormal += 1;
        stats[mid].cumulativeTotal += 1;
      }
    }

    return Object.values(stats).map((member) => {
      const credit = {
        kind: "split" as const,
        initialNormalCredit: member.baseNormal,
        initialHolidayCredit: member.baseHoliday,
      };
      const periodAdjusted = calculateAdjustedTotals({
        periodNormal: member.periodNormal,
        periodHoliday: member.periodHoliday,
        credit,
      });
      const globalAdjusted = calculateAdjustedTotals({
        periodNormal: member.cumulativeNormal,
        periodHoliday: member.cumulativeHoliday,
        credit,
      });

      return {
        ...member,
        periodAdjusted,
        globalAdjusted,
        normal: globalAdjusted.adjustedNormal,
        holiday: globalAdjusted.adjustedHoliday,
        total: globalAdjusted.adjustedGlobal,
      };
    });
  }, [
    exportDuties,
    filteredDuties,
    holidayDatesSet,
    isDateRangeValid,
    members,
    normalizedExportTo,
    selectedMemberIds,
  ]);

  const kpis = useMemo(() => {
    const total = perMemberStats.reduce((s, m) => s + m.total, 0);
    const holiday = perMemberStats.reduce((s, m) => s + m.holiday, 0);
    const normal = perMemberStats.reduce((s, m) => s + m.normal, 0);
    const weekendPeriod = perMemberStats.reduce((s, m) => s + m.weekendPeriod, 0);
    const avg = perMemberStats.length ? total / perMemberStats.length : 0;

    const baseTotal = perMemberStats.reduce((s, m) => s + m.baseTotal, 0);
    const periodTotal = perMemberStats.reduce((s, m) => s + m.periodTotal, 0);
    const adjustedPeriodTotal = perMemberStats.reduce(
      (sum, member) => sum + member.periodAdjusted.adjustedGlobal,
      0
    );

    return {
      total,
      normal,
      holiday,
      weekendPeriod,
      avg: Math.round(avg * 10) / 10,
      baseTotal,
      periodTotal,
      adjustedPeriodTotal,
    };
  }, [perMemberStats]);

  const analysisModeLabel =
    analysisMode === "period" ? "Période sélectionnée" : "Cumul global";

  const recencyByMember = useMemo(() => {
    const referenceDate = isDateRangeValid
      ? parseDateOnlyUTC(normalizedExportTo)
      : parseDateOnlyUTC(toDateInputValue(new Date()));
    const lastDates = new Map<
      string,
      { total: Date | null; normal: Date | null; holiday: Date | null }
    >();

    for (const member of members) {
      lastDates.set(member.id, { total: null, normal: null, holiday: null });
    }

    for (const duty of filteredDuties) {
      const memberId = duty.team_member_id;
      const dayKey = clampDateStr(duty.duty_date);
      if (!memberId || !dayKey || dayKey > normalizedExportTo) continue;

      const current = lastDates.get(memberId);
      if (!current) continue;

      const dutyDate = parseDateOnlyUTC(dayKey);
      const isWeekend = isWeekendByDayIndex(dutyDate.getUTCDay());
      const isHoliday = holidayDatesSet.has(dayKey) || isWeekend;

      if (!current.total || dutyDate > current.total) current.total = dutyDate;
      if (isHoliday) {
        if (!current.holiday || dutyDate > current.holiday) current.holiday = dutyDate;
      } else if (!current.normal || dutyDate > current.normal) {
        current.normal = dutyDate;
      }
    }

    return new Map<string, RecencyValues>(
      Array.from(lastDates, ([memberId, dates]) => [
        memberId,
        {
          total: dates.total
            ? Math.max(0, differenceInCalendarDays(referenceDate, dates.total))
            : null,
          normal: dates.normal
            ? Math.max(0, differenceInCalendarDays(referenceDate, dates.normal))
            : null,
          holiday: dates.holiday
            ? Math.max(0, differenceInCalendarDays(referenceDate, dates.holiday))
            : null,
        },
      ])
    );
  }, [filteredDuties, holidayDatesSet, isDateRangeValid, members, normalizedExportTo]);

  const distributionData = useMemo(() => {
    return perMemberStats
      .map((member) => ({
        memberId: member.memberId,
        name: shortName(member.name),
        fullName: member.name,
        metric:
          analysisMode === "period"
            ? member.periodAdjusted.adjustedGlobal
            : member.globalAdjusted.adjustedGlobal,
        baseTotal: member.baseTotal,
        baseNormal: member.baseNormal,
        baseHoliday: member.baseHoliday,
        periodTotal: member.periodTotal,
        periodNormal: member.periodNormal,
        periodHoliday: member.periodHoliday,
        cumulativeTotal: member.cumulativeTotal,
        total: member.total,
        daysSinceLast: recencyByMember.get(member.memberId)?.total ?? null,
      }))
      .sort((a, b) =>
        comparePlanningPriority(
          a.metric,
          b.metric,
          a.daysSinceLast,
          b.daysSinceLast,
          a.fullName,
          b.fullName
        )
      )
      .map((item, index) => ({ ...item, rank: index + 1 }));
  }, [analysisMode, perMemberStats, recencyByMember]);

  const normalChartData = useMemo(() => {
    return perMemberStats
      .map((member) => ({
        memberId: member.memberId,
        name: shortName(member.name),
        fullName: member.name,
        count:
          analysisMode === "period"
            ? member.periodAdjusted.adjustedNormal
            : member.globalAdjusted.adjustedNormal,
        base: member.baseNormal,
        period: member.periodNormal,
        global: member.normal,
        daysSinceLast: recencyByMember.get(member.memberId)?.normal ?? null,
      }))
      .sort((a, b) =>
        comparePlanningPriority(
          a.count,
          b.count,
          a.daysSinceLast,
          b.daysSinceLast,
          a.fullName,
          b.fullName
        )
      )
      .map((item, index) => ({ ...item, rank: index + 1 }));
  }, [analysisMode, perMemberStats, recencyByMember]);

  const holidayChartData = useMemo(() => {
    return perMemberStats
      .map((member) => ({
        memberId: member.memberId,
        name: shortName(member.name),
        fullName: member.name,
        count:
          analysisMode === "period"
            ? member.periodAdjusted.adjustedHoliday
            : member.globalAdjusted.adjustedHoliday,
        base: member.baseHoliday,
        period: member.periodHoliday,
        global: member.holiday,
        daysSinceLast: recencyByMember.get(member.memberId)?.holiday ?? null,
      }))
      .sort((a, b) =>
        comparePlanningPriority(
          a.count,
          b.count,
          a.daysSinceLast,
          b.daysSinceLast,
          a.fullName,
          b.fullName
        )
      )
      .map((item, index) => ({ ...item, rank: index + 1 }));
  }, [analysisMode, perMemberStats, recencyByMember]);

  const decisionRankedBase = useMemo(() => {
    if (decisionView === "normal") {
      return normalChartData.map((item) => ({
        memberId: item.memberId,
        name: item.name,
        fullName: item.fullName,
        score: item.count,
        daysSinceLast: item.daysSinceLast,
        rank: item.rank,
      }));
    }
    if (decisionView === "holiday") {
      return holidayChartData.map((item) => ({
        memberId: item.memberId,
        name: item.name,
        fullName: item.fullName,
        score: item.count,
        daysSinceLast: item.daysSinceLast,
        rank: item.rank,
      }));
    }
    return distributionData.map((item) => ({
      memberId: item.memberId,
      name: item.name,
      fullName: item.fullName,
      score: item.metric,
      daysSinceLast: item.daysSinceLast,
      rank: item.rank,
    }));
  }, [decisionView, distributionData, holidayChartData, normalChartData]);

  const decisionAverage = decisionRankedBase.length
    ? decisionRankedBase.reduce((sum, item) => sum + item.score, 0) /
      decisionRankedBase.length
    : 0;
  const decisionCategoryLabel = getDecisionViewLabel(decisionView);
  const decisionCategoryColors = getChartCategoryColors(decisionView as ChartCategory);
  const decisionData = useMemo(
    () =>
      decisionRankedBase.map((item) => ({
        ...item,
        axisLabel: `${item.rank}. ${item.fullName}`,
        deviationFromAverage: item.score - decisionAverage,
        lastRelevantDuty: formatRelevantDutyDate(item.daysSinceLast, normalizedExportTo),
      })),
    [decisionAverage, decisionRankedBase, normalizedExportTo]
  );
  const firstDecisionPriority = decisionData[0] ?? null;
  const firstDecisionExplanation = useMemo(() => {
    if (!firstDecisionPriority) return "Aucun membre dans l’analyse.";
    const second = decisionData[1];
    if (!second || firstDecisionPriority.score < second.score) {
      return "Charge corrigée la plus faible.";
    }
    if (firstDecisionPriority.daysSinceLast === null && second.daysSinceLast !== null) {
      return "Charge égale, membre jamais affecté dans cette catégorie.";
    }
    if (firstDecisionPriority.daysSinceLast !== second.daysSinceLast) {
      return "Charge égale, puis attente pertinente la plus longue.";
    }
    return "Charge et attente égales, puis ordre alphabétique français.";
  }, [decisionData, firstDecisionPriority]);
  const decisionMost = useMemo(
    () =>
      [...decisionData]
        .sort(
          (a, b) =>
            b.score - a.score ||
            comparePlanningPriority(
              a.score,
              b.score,
              a.daysSinceLast,
              b.daysSinceLast,
              a.fullName,
              b.fullName
            )
        )
        .slice(0, 3),
    [decisionData]
  );

  const avgNormalGlobal = useMemo(() => {
    if (!normalChartData.length) return 0;
    return normalChartData.reduce((sum, item) => sum + item.count, 0) / normalChartData.length;
  }, [normalChartData]);

  const avgHolidayGlobal = useMemo(() => {
    if (!holidayChartData.length) return 0;
    return holidayChartData.reduce((sum, item) => sum + item.count, 0) / holidayChartData.length;
  }, [holidayChartData]);

  const top3Most = useMemo(
    () =>
      [...distributionData]
        .sort(
          (a, b) =>
            b.metric - a.metric ||
            comparePlanningPriority(
              a.metric,
              b.metric,
              a.daysSinceLast,
              b.daysSinceLast,
              a.fullName,
              b.fullName
            )
        )
        .slice(0, 3),
    [distributionData]
  );

  const top3Least = useMemo(() => distributionData.slice(0, 3), [distributionData]);

  const fairness = useMemo(() => {
    const counts = decisionData.map((item) => item.score);
    if (counts.length === 0) return { max: 0, min: 0, avg: 0 };
    const max = Math.max(...counts);
    const min = Math.min(...counts);
    const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
    return { max, min, avg: Math.round(avg * 10) / 10 };
  }, [decisionData]);

  const fairnessGap = fairness.max - fairness.min;
  const activeMetricTotal = decisionData.reduce((sum, item) => sum + item.score, 0);
  const averageTotal = decisionAverage;
  const formattedAverageTotal = averageTotal.toLocaleString("fr-FR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  const averageTotalUnit = averageTotal === 1 ? "jour" : "jours";
  const overviewAverage = distributionData.length
    ? distributionData.reduce((sum, item) => sum + item.metric, 0) / distributionData.length
    : 0;
  const formattedOverviewAverage = overviewAverage.toLocaleString("fr-FR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });

  const fairnessVerdict = useMemo(() => {
    if (fairnessGap <= 2) return { label: "Équitable", cls: "bg-success text-success-foreground" };
    if (fairnessGap <= 5) return { label: "Moyen", cls: "bg-warning text-warning-foreground" };
    return { label: "Déséquilibré", cls: "bg-destructive text-destructive-foreground" };
  }, [fairnessGap]);

  /** ✅ Matrix for PERIOD by weekday + adds Solde columns + Total global */
  const weekdayMatrix = useMemo(() => {
    const allowAll = selectedMemberIds.length === 0;
    const selectedSet = new Set(selectedMemberIds);

    const baseById = new Map(
      perMemberStats.map((s) => [
        s.memberId,
        {
          baseNormal: s.baseNormal,
          baseHoliday: s.baseHoliday,
          baseTotal: s.baseTotal,
          periodAdjustedTotal: s.periodAdjusted.adjustedGlobal,
          totalGlobal: s.total,
        },
      ])
    );

    const matrix: Array<{
      memberId: string;
      name: string;
      baseNormal: number;
      baseHoliday: number;
      baseTotal: number;
      weekdayCountsPeriod: number[];
      periodTotal: number;
      periodAdjustedTotal: number;
      totalGlobal: number;
    }> = [];

    for (const m of members) {
      if (!allowAll && !selectedSet.has(m.id)) continue;

      const base = baseById.get(m.id) || {
        baseNormal: 0,
        baseHoliday: 0,
        baseTotal: 0,
        periodAdjustedTotal: 0,
        totalGlobal: 0,
      };

      matrix.push({
        memberId: m.id,
        name: m.full_name,
        baseNormal: base.baseNormal,
        baseHoliday: base.baseHoliday,
        baseTotal: base.baseTotal,
        weekdayCountsPeriod: Array(7).fill(0),
        periodTotal: 0,
        periodAdjustedTotal: base.periodAdjustedTotal,
        totalGlobal: base.totalGlobal,
      });
    }

    const idxById = new Map(matrix.map((row, idx) => [row.memberId, idx]));

    for (const d of exportDuties) {
      const mid = d.team_member_id;
      if (!mid) continue;

      const idx = idxById.get(mid);
      if (idx === undefined) continue;

      const dayKey = clampDateStr(d.duty_date);
      if (!dayKey) continue;

      const dt = parseDateOnlyUTC(dayKey);
      matrix[idx].weekdayCountsPeriod[dt.getUTCDay()] += 1;
    }

    for (const row of matrix) {
      row.periodTotal = row.weekdayCountsPeriod.reduce((s, x) => s + x, 0);
    }

    matrix.sort((a, b) =>
      comparePlanningPriority(
        analysisMode === "period" ? a.periodAdjustedTotal : a.totalGlobal,
        analysisMode === "period" ? b.periodAdjustedTotal : b.totalGlobal,
        recencyByMember.get(a.memberId)?.total ?? null,
        recencyByMember.get(b.memberId)?.total ?? null,
        a.name,
        b.name
      )
    );
    return matrix.map((row, index) => ({ ...row, rank: index + 1 }));
  }, [analysisMode, exportDuties, members, selectedMemberIds, perMemberStats, recencyByMember]);

  // ---------- Days since last (3 graphs) ----------
  const daysSinceLastDutyData = useMemo(() => {
    const allowAll = selectedMemberIds.length === 0;
    const selectedSet = new Set(selectedMemberIds);

    return addRecencyDisplayValues(
      members
        .filter((member) => allowAll || selectedSet.has(member.id))
        .map((member) => {
          const days = recencyByMember.get(member.id)?.total ?? null;
          return {
            memberId: member.id,
            name: shortName(member.full_name),
            fullName: member.full_name,
            days,
            hasValue: days !== null,
          };
        })
    );
  }, [members, recencyByMember, selectedMemberIds]);

  const daysSinceLastNormalDutyData = useMemo(() => {
    return addRecencyDisplayValues(
      members
        .filter(
          (member) => selectedMemberIds.length === 0 || selectedMemberIds.includes(member.id)
        )
        .map((member) => {
          const days = recencyByMember.get(member.id)?.normal ?? null;
          return {
            memberId: member.id,
            name: shortName(member.full_name),
            fullName: member.full_name,
            days,
            hasValue: days !== null,
          };
        })
    );
  }, [members, recencyByMember, selectedMemberIds]);

  const daysSinceLastHolidayDutyData = useMemo(() => {
    return addRecencyDisplayValues(
      members
        .filter(
          (member) => selectedMemberIds.length === 0 || selectedMemberIds.includes(member.id)
        )
        .map((member) => {
          const days = recencyByMember.get(member.id)?.holiday ?? null;
          return {
            memberId: member.id,
            name: shortName(member.full_name),
            fullName: member.full_name,
            days,
            hasValue: days !== null,
          };
        })
    );
  }, [members, recencyByMember, selectedMemberIds]);

  const totalsTableRows = useMemo(() => {
    const search = tableSearch.trim().toLowerCase();
    const priorityByMember = new Map(
      decisionData.map((member) => [member.memberId, member.rank])
    );

    const totalNormalMin =
      filterTotalNormalMin === "" ? null : Number(filterTotalNormalMin);
    const totalNormalMax =
      filterTotalNormalMax === "" ? null : Number(filterTotalNormalMax);

    const totalHolidayMin =
      filterTotalHolidayMin === "" ? null : Number(filterTotalHolidayMin);
    const totalHolidayMax =
      filterTotalHolidayMax === "" ? null : Number(filterTotalHolidayMax);

    const totalGlobalMin =
      filterTotalGlobalMin === "" ? null : Number(filterTotalGlobalMin);
    const totalGlobalMax =
      filterTotalGlobalMax === "" ? null : Number(filterTotalGlobalMax);

    const rows = [...perMemberStats]
      .map((r) => ({
        memberId: r.memberId,
        name: r.name,
        periodNormal: r.periodNormal,
        periodHoliday: r.periodHoliday,
        initialNormalCredit: r.baseNormal,
        initialHolidayCredit: r.baseHoliday,
        initialCredit: r.baseTotal,
        totalNormal:
          analysisMode === "period"
            ? r.periodAdjusted.adjustedNormal
            : r.globalAdjusted.adjustedNormal,
        totalHoliday:
          analysisMode === "period"
            ? r.periodAdjusted.adjustedHoliday
            : r.globalAdjusted.adjustedHoliday,
        total:
          analysisMode === "period"
            ? r.periodAdjusted.adjustedGlobal
            : r.globalAdjusted.adjustedGlobal,
        relevantScore:
          decisionView === "normal"
            ? analysisMode === "period"
              ? r.periodAdjusted.adjustedNormal
              : r.globalAdjusted.adjustedNormal
            : decisionView === "holiday"
              ? analysisMode === "period"
                ? r.periodAdjusted.adjustedHoliday
                : r.globalAdjusted.adjustedHoliday
              : analysisMode === "period"
                ? r.periodAdjusted.adjustedGlobal
                : r.globalAdjusted.adjustedGlobal,
        relevantLabel: getDecisionViewLabel(decisionView),
      }))
      .filter((r) => r.name.toLowerCase().includes(search))
      .filter((r) => (totalNormalMin === null ? true : r.totalNormal >= totalNormalMin))
      .filter((r) => (totalNormalMax === null ? true : r.totalNormal <= totalNormalMax))
      .filter((r) => (totalHolidayMin === null ? true : r.totalHoliday >= totalHolidayMin))
      .filter((r) => (totalHolidayMax === null ? true : r.totalHoliday <= totalHolidayMax))
      .filter((r) => (totalGlobalMin === null ? true : r.total >= totalGlobalMin))
      .filter((r) => (totalGlobalMax === null ? true : r.total <= totalGlobalMax));

    rows.sort((a, b) => {
      const direction = tableSortOrder === "asc" ? 1 : -1;

      if (tableSortBy === "name") {
        return compareNames(a.name, b.name) * direction;
      }

      const av = Number(a[tableSortBy]) || 0;
      const bv = Number(b[tableSortBy]) || 0;

      const primarySort = (av - bv) * direction;
      if (primarySort !== 0) return primarySort;

      const recencyKey =
        tableSortBy === "totalNormal"
          ? "normal"
          : tableSortBy === "totalHoliday"
            ? "holiday"
            : "total";
      const aDays = recencyByMember.get(a.memberId)?.[recencyKey] ?? null;
      const bDays = recencyByMember.get(b.memberId)?.[recencyKey] ?? null;

      return comparePlanningPriority(av, bv, aDays, bDays, a.name, b.name);
    });

    return rows.map((row) => ({ ...row, rank: priorityByMember.get(row.memberId) ?? 0 }));
  }, [
    analysisMode,
    decisionView,
    decisionData,
    perMemberStats,
    tableSearch,
    tableSortBy,
    tableSortOrder,
    filterTotalNormalMin,
    filterTotalNormalMax,
    filterTotalHolidayMin,
    filterTotalHolidayMax,
    filterTotalGlobalMin,
    filterTotalGlobalMax,
    recencyByMember,
  ]);

  const resetTotalsFilters = () => {
    setTableSearch("");
    setTableSortBy(getDefaultTableSort(decisionView));
    setTableSortOrder("asc");
    setFilterTotalNormalMin("");
    setFilterTotalNormalMax("");
    setFilterTotalHolidayMin("");
    setFilterTotalHolidayMax("");
    setFilterTotalGlobalMin("");
    setFilterTotalGlobalMax("");
  };

  const recommendations = useMemo(() => {
    if (decisionData.length === 0) return [];

    const avg = fairness.avg || 0;
    const least = decisionData.slice(0, 3);
    const most = decisionMost;

    const recs: string[] = [];

    if (fairnessGap >= 6)
      recs.push(
        `Déséquilibre important : écart de ${fairnessGap}. Priorise les membres les moins chargés.`
      );
    else
      recs.push(
        `Équilibre correct : écart de ${fairnessGap}. Continue sur la même logique.`
      );

    recs.push(
      `Rotation suggérée (moins chargés) : ${least
        .map((m) => m.name)
        .join(", ")}.`
    );

    if (most[0]?.score >= avg + 3)
      recs.push(
        `Réduire la charge de : ${most
          .map((m) => m.name)
          .join(", ")} (au-dessus de la moyenne).`
      );

    recs.push(`Vue décisionnelle : ${decisionCategoryLabel} • ${analysisModeLabel}.`);
    recs.push(
      `Totaux: crédits initiaux = ${kpis.baseTotal} • période brute = ${kpis.periodTotal} • total corrigé global = ${kpis.total}.`
    );

    return recs;
  }, [
    analysisModeLabel,
    decisionCategoryLabel,
    decisionData,
    decisionMost,
    fairness.avg,
    fairnessGap,
    kpis.baseTotal,
    kpis.periodTotal,
    kpis.total,
  ]);

  const rankedMemberStats = useMemo(() => {
    const statsByMember = new Map(perMemberStats.map((member) => [member.memberId, member]));
    return decisionData.flatMap((ranked) => {
      const stats = statsByMember.get(ranked.memberId);
      if (!stats) return [];
      const selectedAdjusted =
        analysisMode === "period" ? stats.periodAdjusted : stats.globalAdjusted;
      return [
        {
          ...stats,
          rank: ranked.rank,
          selectedAdjusted,
          selectedScore: ranked.score,
          deviationFromAverage: ranked.deviationFromAverage,
        },
      ];
    });
  }, [analysisMode, decisionData, perMemberStats]);

  // -----------------------
  // EXPORTS
  // -----------------------
  const reportTitle = `Rapport Permanences — ${clampDateStr(exportFrom) || "…"} → ${
    clampDateStr(exportTo) || "…"
  }`;

  const exportExcel = async () => {
    if (!isDateRangeValid) return;

    const XLSX = await import("xlsx");

    const wb = XLSX.utils.book_new();
    const generatedAt = format(new Date(), "dd/MM/yyyy HH:mm", { locale: frLocale });

    const summaryRows: any[][] = [
      ["RAPPORT PERMANENCES"],
      ["Période", `${clampDateStr(exportFrom) || "…"} → ${clampDateStr(exportTo) || "…"}`],
      ["Mode d’analyse", analysisModeLabel],
      ["Vue décisionnelle", decisionCategoryLabel],
      ["Généré le", generatedAt],
      ["Membres inclus", selectedCountLabel],
      [],
      ["INDICATEURS"],
      [`Total — ${decisionCategoryLabel} • ${analysisModeLabel}`, activeMetricTotal],
      [
        "Moyenne totale par membre",
        decisionData.length ? `${formattedAverageTotal} ${averageTotalUnit}` : "—",
      ],
      [LABELS.total, kpis.total],
      [`${LABELS.solde} (Total)`, kpis.baseTotal],
      [`${LABELS.period} (Total)`, kpis.periodTotal],
      ["Total corrigé — Période sélectionnée", kpis.adjustedPeriodTotal],
      ["Week-end (période)", kpis.weekendPeriod],
      ["Moyenne / membre (global)", kpis.avg],
      [],
      ["RECOMMANDATIONS"],
      ...recommendations.map((r) => [r]),
    ];

    const ws1 = XLSX.utils.aoa_to_sheet(summaryRows);
    ws1["!cols"] = [{ wch: 30 }, { wch: 90 }];
    ws1["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }];
    XLSX.utils.book_append_sheet(wb, ws1, "Résumé");

    const totalsHeader = [
      [
        "Priorité",
        "Membre",
        "Vue décisionnelle",
        "Score corrigé pertinent",
        "Moyenne pertinente",
        "Écart à la moyenne",
        "Période — Normal",
        "Crédit initial — Normal",
        "Total corrigé — Normal",
        "Période — Férié",
        "Crédit initial — Férié",
        "Total corrigé — Férié",
        "Crédits initiaux — Total",
        "Période — Total",
        `Total corrigé — ${analysisModeLabel}`,
        "Week-end (période)",
        "Semaine (période)",
      ],
    ];

    const totalsRows = rankedMemberStats.map((m) => [
      m.rank,
      m.name,
      decisionCategoryLabel,
      m.selectedScore,
      decisionAverage,
      m.deviationFromAverage,
      m.periodNormal,
      m.baseNormal,
      m.selectedAdjusted.adjustedNormal,
      m.periodHoliday,
      m.baseHoliday,
      m.selectedAdjusted.adjustedHoliday,
      m.baseTotal,
      m.periodTotal,
      m.selectedAdjusted.adjustedGlobal,
      m.weekendPeriod,
      m.weekdayPeriod,
    ]);

    const ws2 = XLSX.utils.aoa_to_sheet([...totalsHeader, ...totalsRows]);
    ws2["!cols"] = [
      { wch: 10 },
      { wch: 28 },
      { wch: 22 },
      { wch: 20 },
      { wch: 18 },
      { wch: 18 },
      { wch: 18 },
      { wch: 18 },
      { wch: 18 },
      { wch: 14 },
      { wch: 14 },
      { wch: 14 },
      { wch: 14 },
      { wch: 14 },
      { wch: 18 },
      { wch: 16 },
      { wch: 16 },
    ];
    XLSX.utils.book_append_sheet(wb, ws2, "Totaux");

    if (exportIncludeMatrix) {
      const matrixHeader = [
        [
          "Priorité",
          "Membre",
          "Crédit initial — Normal",
          "Crédit initial — Férié",
          "Crédits initiaux — Total",
          ...weekdayLabels.map((d) => `${d} (période)`),
          "Total période",
          "Total corrigé période",
          "Total corrigé global",
        ],
      ];

      const matrixRows = weekdayMatrix.map((row) => [
        row.rank,
        row.name,
        row.baseNormal,
        row.baseHoliday,
        row.baseTotal,
        ...row.weekdayCountsPeriod,
        row.periodTotal,
        row.periodAdjustedTotal,
        row.totalGlobal,
      ]);

      const ws3 = XLSX.utils.aoa_to_sheet([...matrixHeader, ...matrixRows]);
      ws3["!cols"] = [
        { wch: 10 },
        { wch: 28 },
        { wch: 18 },
        { wch: 18 },
        { wch: 18 },
        ...Array(7).fill({ wch: 12 }),
        { wch: 14 },
        { wch: 14 },
      ];
      XLSX.utils.book_append_sheet(wb, ws3, "Matrice");
    }

    if (exportIncludeRaw) {
      const rawHeader = [["Date", "Jour", "Membre", "Type", "Férié?", "Week-end?"]];

      const rawRows = exportDuties
        .map((d) => {
          const dayKey = clampDateStr(d.duty_date);
          const dt = parseDateOnlyUTC(dayKey);
          const wd = dt.getUTCDay();

          const weekend = isWeekendByDayIndex(wd);
          const officialHoliday = holidayDatesSet.has(dayKey);
          const holiday = COUNT_WEEKEND_AS_HOLIDAY
            ? officialHoliday || weekend
            : officialHoliday;

          const name = d.team_member?.full_name || d.team_member_id || "—";

          return [
            dayKey,
            weekdayLabels[wd],
            name,
            d.duty_type ?? "—",
            holiday ? "Oui" : "Non",
            weekend ? "Oui" : "Non",
          ];
        })
        .sort((a, b) => String(a[0]).localeCompare(String(b[0])));

      const ws4 = XLSX.utils.aoa_to_sheet([...rawHeader, ...rawRows]);
      ws4["!cols"] = [
        { wch: 12 },
        { wch: 10 },
        { wch: 32 },
        { wch: 14 },
        { wch: 10 },
        { wch: 12 },
      ];
      XLSX.utils.book_append_sheet(wb, ws4, "Données");
    }

    XLSX.writeFile(wb, `${reportTitle}.xlsx`);
  };

  async function captureNode(node: HTMLElement | null) {
    if (!node) return null;
    const { default: html2canvas } = await import("html2canvas");
    const canvas = await html2canvas(node, { scale: 2, backgroundColor: "#ffffff" });
    return canvas.toDataURL("image/png");
  }

  const exportPDF = async () => {
    if (!isDateRangeValid) return;

    const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
      import("jspdf"),
      import("jspdf-autotable"),
    ]);

    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    const W = doc.internal.pageSize.getWidth();
    const margin = 44;

    const sectionTitle = (txt: string, y: number) => {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text(txt, margin, y);
      doc.setDrawColor(220);
      doc.line(margin, y + 6, W - margin, y + 6);
    };

    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("Rapport Permanences", margin, 56);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.text(
      `${clampDateStr(exportFrom) || "…"} → ${clampDateStr(exportTo) || "…"} • ${decisionCategoryLabel} • ${analysisModeLabel} • Généré le ${format(
        new Date(),
        "dd/MM/yyyy HH:mm",
        { locale: frLocale }
      )}`,
      margin,
      76
    );

    const kpiY = 100;
    const boxW = (W - margin * 2 - 18 * 3) / 4;
    const boxH = 66;

    const kpiBoxes = [
      {
        label: `Total — ${decisionCategoryLabel} • ${analysisModeLabel}`,
        value: String(activeMetricTotal),
      },
      {
        label: "Moyenne totale par membre",
        value: decisionData.length ? `${formattedAverageTotal} ${averageTotalUnit}` : "—",
      },
      { label: "Total corrigé — Période", value: String(kpis.adjustedPeriodTotal) },
      { label: LABELS.total, value: String(kpis.total) },
    ];

    kpiBoxes.forEach((b, i) => {
      const x = margin + i * (boxW + 18);
      doc.setDrawColor(220);
      doc.roundedRect(x, kpiY, boxW, boxH, 10, 10);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text(b.label, x + 14, kpiY + 22);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(22);
      doc.text(b.value, x + 14, kpiY + 52);
    });

    let cursorY = kpiY + boxH + 18;

    sectionTitle("Recommandations", cursorY + 10);
    cursorY += 28;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);

    let yRec = cursorY;
    (recommendations.length ? recommendations : ["—"]).slice(0, 8).forEach((r) => {
      doc.text(`• ${r}`, margin, yRec);
      yRec += 14;
    });

    cursorY = yRec + 8;

    if (exportIncludeCharts) {
      const imgTotal = await captureNode(refChartTotal.current);
      const imgNormal = await captureNode(refChartNormal.current);
      const imgHoliday = await captureNode(refChartHoliday.current);

      const imgH = 190;
      const imgW = (W - margin * 2 - 18 * 2) / 3;
      const imgs = [imgTotal, imgNormal, imgHoliday].filter(Boolean) as string[];

      if (imgs.length) {
        imgs.slice(0, 3).forEach((img, i) => {
          const x = margin + i * (imgW + 18);
          doc.setDrawColor(220);
          doc.roundedRect(x, cursorY, imgW, imgH, 10, 10);
          doc.addImage(img, "PNG", x + 8, cursorY + 8, imgW - 16, imgH - 16);
        });
        cursorY += imgH + 18;
      }
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text(`Classement — ${decisionCategoryLabel} • ${analysisModeLabel}`, margin, cursorY + 14);
    cursorY += 24;

    autoTable(doc, {
      startY: cursorY,
      head: [
        [
          "Priorité",
          "Membre",
          "Vue",
          "Score pertinent",
          "Moyenne",
          "Écart",
          "Période — Normal",
          "Crédit initial — Normal",
          "Total corrigé — Normal",
          "Période — Férié",
          "Crédit initial — Férié",
          "Total corrigé — Férié",
          "Crédits initiaux — Total",
          "Période — Total",
          `Total corrigé — ${analysisModeLabel}`,
        ],
      ],
      body: rankedMemberStats.map((m) => [
        m.rank,
        m.name,
        decisionCategoryLabel,
        m.selectedScore,
        decisionAverage.toFixed(1),
        m.deviationFromAverage.toFixed(1),
        m.periodNormal,
        m.baseNormal,
        m.selectedAdjusted.adjustedNormal,
        m.periodHoliday,
        m.baseHoliday,
        m.selectedAdjusted.adjustedHoliday,
        m.baseTotal,
        m.periodTotal,
        m.selectedAdjusted.adjustedGlobal,
      ]),
      styles: { font: "helvetica", fontSize: 7.5, cellPadding: 4, lineWidth: 0.5, lineColor: 220 },
      headStyles: { fillColor: [30, 30, 30], textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [248, 248, 248] },
      margin: { left: margin, right: margin },
    });

    if (exportIncludeMatrix) {
      doc.addPage();
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.text(
        "Matrice — Membre × Jour de semaine (période) + Solde initial",
        margin,
        56
      );

      autoTable(doc, {
        startY: 76,
        head: [
          [
            "Priorité",
            "Membre",
            "Crédit initial — Normal",
            "Crédit initial — Férié",
            "Crédits initiaux — Total",
            ...weekdayLabels.map((d) => `${d} (période)`),
            "Total période",
            "Total corrigé période",
            "Total corrigé global",
          ],
        ],
        body: weekdayMatrix.map((row) => [
          row.rank,
          row.name,
          row.baseNormal,
          row.baseHoliday,
          row.baseTotal,
          ...row.weekdayCountsPeriod,
          row.periodTotal,
          row.periodAdjustedTotal,
          row.totalGlobal,
        ]),
        styles: { font: "helvetica", fontSize: 9, cellPadding: 6, lineWidth: 0.5, lineColor: 220 },
        headStyles: { fillColor: [30, 30, 30], textColor: 255, fontStyle: "bold" },
        alternateRowStyles: { fillColor: [248, 248, 248] },
        margin: { left: margin, right: margin },
      });
    }

    if (exportIncludeRaw) {
      doc.addPage();
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.text("Données — Permanences", margin, 56);

      const rawRows = exportDuties
        .map((d) => {
          const dayKey = clampDateStr(d.duty_date);
          const dt = parseDateOnlyUTC(dayKey);
          const wd = dt.getUTCDay();

          const isWeekend = isWeekendByDayIndex(wd);
          const isOfficialHoliday = holidayDatesSet.has(dayKey);
          const isHoliday = COUNT_WEEKEND_AS_HOLIDAY
            ? isOfficialHoliday || isWeekend
            : isOfficialHoliday;

          const name = d.team_member?.full_name || d.team_member_id || "—";

          return [
            dayKey,
            weekdayLabels[wd],
            name,
            d.duty_type ?? "—",
            isHoliday ? "Oui" : "Non",
            isWeekend ? "Oui" : "Non",
          ];
        })
        .sort((a, b) => String(a[0]).localeCompare(String(b[0])));

      autoTable(doc, {
        startY: 76,
        head: [["Date", "Jour", "Membre", "Type", "Férié?", "Week-end?"]],
        body: rawRows,
        styles: { font: "helvetica", fontSize: 9, cellPadding: 6, lineWidth: 0.5, lineColor: 220 },
        headStyles: { fillColor: [30, 30, 30], textColor: 255, fontStyle: "bold" },
        alternateRowStyles: { fillColor: [248, 248, 248] },
        margin: { left: margin, right: margin },
      });
    }

    doc.save(`${reportTitle}.pdf`);
  };

  // ---------- chart data with mobile limit ----------
  const distributionDataForChart = useMemo(
    () => limitForMobile(distributionData, isMobile, showAllChartsMobile),
    [distributionData, isMobile, showAllChartsMobile]
  );

  const normalChartDataForChart = useMemo(
    () => limitForMobile(normalChartData, isMobile, showAllChartsMobile),
    [normalChartData, isMobile, showAllChartsMobile]
  );

  const holidayChartDataForChart = useMemo(
    () => limitForMobile(holidayChartData, isMobile, showAllChartsMobile),
    [holidayChartData, isMobile, showAllChartsMobile]
  );

  const decisionDataForChart = useMemo(
    () =>
      decisionChartDisplay === "top10"
        ? decisionData.slice(0, CHART_MOBILE_LIMIT)
        : decisionData,
    [decisionChartDisplay, decisionData]
  );
  const decisionDeviationDomain = Math.max(
    1,
    Math.ceil(
      Math.max(0, ...decisionData.map((item) => Math.abs(item.deviationFromAverage)))
    )
  );
  const decisionChartContentHeight =
    decisionChartDisplay === "all"
      ? Math.max(500, decisionDataForChart.length * 34 + 64)
      : "100%";

  const daysSinceLastDutyDataForChart = useMemo(
    () => limitForMobile(daysSinceLastDutyData, isMobile, showAllChartsMobile),
    [daysSinceLastDutyData, isMobile, showAllChartsMobile]
  );

  const daysSinceLastNormalDutyDataForChart = useMemo(
    () => limitForMobile(daysSinceLastNormalDutyData, isMobile, showAllChartsMobile),
    [daysSinceLastNormalDutyData, isMobile, showAllChartsMobile]
  );

  const daysSinceLastHolidayDutyDataForChart = useMemo(
    () => limitForMobile(daysSinceLastHolidayDutyData, isMobile, showAllChartsMobile),
    [daysSinceLastHolidayDutyData, isMobile, showAllChartsMobile]
  );

  if (loading) {
    return (
      <div className="space-y-6">
        <LoadingState variant="cards" rows={4} />
        <LoadingState variant="table" rows={6} />
      </div>
    );
  }

  const matrixRowsFiltered = weekdayMatrix
    .filter((row) => row.name.toLowerCase().includes(matrixSearch.toLowerCase()))
    .filter((row) => !matrixOnlyActive || row.periodTotal > 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <AnimatedSection
        delay={0}
        className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between"
      >
        <div className="space-y-1">
          <div className="text-xl md:text-2xl font-semibold tracking-tight">Aide à la décision</div>
          <div className="text-sm text-muted-foreground max-w-2xl">
            Lecture rapide + filtres + indicateurs (Total global = Solde initial + Période).
          </div>

          <div className="flex flex-wrap gap-2 pt-2 md:hidden">
            <StatusBadge tone="accent">
              Période : {formatDateForDisplay(exportFrom)} → {formatDateForDisplay(exportTo)}
            </StatusBadge>
            <StatusBadge tone="neutral">Membres: {selectedCountLabel}</StatusBadge>
            <StatusBadge tone="success">
              Total: <AnimatedNumber value={isDateRangeValid ? kpis.total : null} />
            </StatusBadge>
          </div>
        </div>

        <div className="flex flex-col md:flex-row md:items-center gap-2 md:justify-end">
          <div className="hidden md:flex flex-wrap gap-2 items-center">
            <StatusBadge tone="accent">
              Période : {formatDateForDisplay(exportFrom)} → {formatDateForDisplay(exportTo)}
            </StatusBadge>
            <StatusBadge tone="neutral">Membres: {selectedCountLabel}</StatusBadge>
            <StatusBadge tone="success">
              Total global: <AnimatedNumber value={isDateRangeValid ? kpis.total : null} />
            </StatusBadge>
          </div>

          <Dialog open={exportOpen} onOpenChange={setExportOpen}>
            <DialogTrigger asChild>
              <Button variant="default" className="w-full md:w-auto">
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
            </DialogTrigger>

            <DialogContent className="sm:max-w-xl">
              <DialogHeader>
                <DialogTitle>Exporter un rapport</DialogTitle>
              </DialogHeader>

              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <div className="text-sm font-medium">Du</div>
                    <Input
                      type="date"
                      value={exportFrom}
                      onChange={(e) => setExportFrom(e.target.value)}
                      aria-invalid={!isDateRangeValid}
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="text-sm font-medium">Au</div>
                    <Input
                      type="date"
                      value={exportTo}
                      onChange={(e) => setExportTo(e.target.value)}
                      aria-invalid={!isDateRangeValid}
                    />
                  </div>
                </div>

                {dateRangeError && (
                  <p className="text-sm font-medium text-destructive" role="alert">
                    {dateRangeError}
                  </p>
                )}

                <div className="rounded-lg border p-3 space-y-2">
                  <div className="text-sm font-medium">Inclure</div>

                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={exportIncludeCharts}
                      onChange={(e) => setExportIncludeCharts(e.target.checked)}
                    />
                    Graphiques (PDF)
                  </label>

                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={exportIncludeMatrix}
                      onChange={(e) => setExportIncludeMatrix(e.target.checked)}
                    />
                    Matrice (Excel + PDF)
                  </label>

                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={exportIncludeRaw}
                      onChange={(e) => setExportIncludeRaw(e.target.checked)}
                    />
                    Données brutes (Excel + PDF)
                  </label>

                  <div className="text-xs text-muted-foreground">
                    Le rapport exporte exactement ce que tu vois (membres filtrés + période).
                  </div>
                </div>
              </div>

              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setExportOpen(false)}>
                  Fermer
                </Button>

                <Button variant="secondary" onClick={exportExcel} disabled={!isDateRangeValid}>
                  <FileSpreadsheet className="h-4 w-4 mr-2" />
                  Excel
                </Button>

                <Button onClick={exportPDF} disabled={!isDateRangeValid}>
                  <FileText className="h-4 w-4 mr-2" />
                  PDF
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </AnimatedSection>

      {/* Sticky filters */}
      <Card className="md:sticky md:top-2 z-10">
        <CardContent className="py-4">
          <section aria-labelledby="analysis-period-title" className="border-b pb-3">
            <h3 id="analysis-period-title" className="mb-2 text-sm font-semibold">
              Période d’analyse
            </h3>

            <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
              <AnimatedSection
                delay={0.06}
                className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:w-[390px]"
              >
                <div className="space-y-1">
                  <label htmlFor="insights-date-from" className="text-xs font-medium text-muted-foreground">
                    Du
                  </label>
                  <Input
                    id="insights-date-from"
                    type="date"
                    value={exportFrom}
                    onChange={(event) => setExportFrom(event.target.value)}
                    aria-invalid={!isDateRangeValid}
                    className="h-9"
                  />
                </div>

                <div className="space-y-1">
                  <label htmlFor="insights-date-to" className="text-xs font-medium text-muted-foreground">
                    Au
                  </label>
                  <Input
                    id="insights-date-to"
                    type="date"
                    value={exportTo}
                    onChange={(event) => setExportTo(event.target.value)}
                    aria-invalid={!isDateRangeValid}
                    className="h-9"
                  />
                </div>
              </AnimatedSection>

              <AnimatedSection delay={0.12} className="space-y-1 lg:w-[210px]">
                <label className="text-xs font-medium text-muted-foreground">
                  Mode d’analyse
                </label>
                <Select
                  value={analysisMode}
                  onValueChange={(value) => setAnalysisMode(value as AnalysisMode)}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="period">Période sélectionnée</SelectItem>
                    <SelectItem value="global">Cumul global</SelectItem>
                  </SelectContent>
                </Select>
              </AnimatedSection>

              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={applyCurrentMonth}>
                  Ce mois
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={applyPreviousMonth}>
                  Mois précédent
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={applyCurrentYear}>
                  Cette année
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={applyAllData}>
                  Toutes les données
                </Button>
              </div>
            </div>

            {dateRangeError && (
              <p className="mt-2 text-sm font-medium text-destructive" role="alert">
                {dateRangeError}
              </p>
            )}
          </section>

          <AnimatedSection delay={0.18} className="mt-3 flex flex-wrap items-center gap-3">
            <button type="button" className="text-sm underline" onClick={selectAll}>
              Tout sélectionner
            </button>

            <button type="button" className="text-sm underline" onClick={clearAll}>
              Tout désélectionner
            </button>

            <button
              type="button"
              className="text-sm border rounded-md px-3 py-1 hover:bg-muted"
              onClick={() => setFilterOpen((v) => !v)}
            >
              {filterOpen ? "Fermer" : "Choisir des membres"}
            </button>

            <div className="ml-auto flex flex-wrap gap-2 justify-start md:justify-end">
              <StatusBadge tone="neutral">
                Solde: <AnimatedNumber value={isDateRangeValid ? kpis.baseTotal : null} />
              </StatusBadge>
              <StatusBadge tone="accent">
                Période: <AnimatedNumber value={isDateRangeValid ? kpis.periodTotal : null} />
              </StatusBadge>
              <StatusBadge tone="success">
                Total global: <AnimatedNumber value={isDateRangeValid ? kpis.total : null} />
              </StatusBadge>
            </div>
          </AnimatedSection>

          <AnimatedPresencePanel show={filterOpen} className="mt-4">
            <div className="border rounded-lg p-3">
              <input
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                placeholder="Rechercher un membre..."
                className="w-full border rounded-md px-3 py-2 text-sm"
              />

              <div className="mt-3 max-h-60 overflow-auto grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                {members
                  .filter((m) =>
                    m.full_name.toLowerCase().includes(memberSearch.toLowerCase())
                  )
                  .map((m) => {
                    const checked = selectedMemberIds.includes(m.id);
                    return (
                      <label
                        key={m.id}
                        className="flex items-center gap-2 text-sm border rounded-md px-2 py-2 cursor-pointer hover:bg-muted"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleMember(m.id)}
                        />
                        <span className="truncate">{m.full_name}</span>
                      </label>
                    );
                  })}
              </div>

              <div className="text-xs text-muted-foreground mt-2">
                Tape pour chercher, puis coche/décoche.
              </div>
            </div>
          </AnimatedPresencePanel>
        </CardContent>
      </Card>

      <AnimatePresence mode="wait" initial={false}>
      {isDateRangeValid ? (
        <m.div
          key="insights-content"
          initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={shouldReduceMotion ? { opacity: 1 } : { opacity: 0 }}
          transition={chartFadeTransition}
          className="space-y-6"
        >
      {/* KPI Cards */}
      <StaggerContainer className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <StaggerItem>
          <KpiCard
            label={`Total — ${decisionCategoryLabel} • ${analysisModeLabel}`}
            value={<AnimatedNumber value={activeMetricTotal} />}
          />
        </StaggerItem>
        <StaggerItem>
          <KpiCard
            label={`Moyenne — ${decisionCategoryLabel} • ${analysisModeLabel}`}
            value={
              decisionData.length ? (
                <AnimatedNumber
                  value={averageTotal}
                  format={(v) =>
                    v.toLocaleString("fr-FR", {
                      minimumFractionDigits: 1,
                      maximumFractionDigits: 1,
                    })
                  }
                />
              ) : (
                "—"
              )
            }
            hint={decisionData.length ? averageTotalUnit : undefined}
          />
        </StaggerItem>
        <StaggerItem>
          <KpiCard label="Total corrigé — Période sélectionnée" value={<AnimatedNumber value={kpis.adjustedPeriodTotal} />} />
        </StaggerItem>
        <StaggerItem>
          <KpiCard label="Total — Cumul global" value={<AnimatedNumber value={kpis.total} />} />
        </StaggerItem>
      </StaggerContainer>

      {/* Primary decision view */}
      <Card>
        <CardHeader className="space-y-4">
          <div className="space-y-1">
            <CardTitle>
              {decisionChartDisplay === "top10"
                ? "Top 10 des membres prioritaires — Écart à la moyenne"
                : "Tous les membres — Écart à la moyenne"}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Les membres sont classés par score corrigé croissant. Un écart négatif indique une
              charge sous la moyenne et donc davantage de priorité.
            </p>
          </div>

          <Tabs
            value={decisionView}
            onValueChange={(value) => setDecisionView(value as DecisionView)}
            className="w-full"
          >
            <TabsList className="grid h-auto w-full grid-cols-1 gap-1 sm:grid-cols-3">
              <TabsTrigger className="min-h-11" value="global">Vue globale</TabsTrigger>
              <TabsTrigger className="min-h-11" value="normal">Priorité normale</TabsTrigger>
              <TabsTrigger className="min-h-11" value="holiday">
                Priorité fériée / week-end
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>

        <CardContent className="space-y-5 overflow-hidden">
          {firstDecisionPriority ? (
            <m.div
              key={`priority-card:${decisionView}:${firstDecisionPriority.memberId}`}
              initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.28, ease: premiumEase }}
              className="relative overflow-hidden rounded-2xl border border-priority/25 bg-gradient-to-br from-priority/[0.09] via-priority/[0.04] to-transparent p-4 shadow-glow-priority md:p-5"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-priority/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-priority">
                  <Sparkles className="h-3 w-3" aria-hidden="true" />
                  Priorité actuelle
                </span>
                <span
                  className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
                  style={{
                    backgroundColor: `color-mix(in srgb, ${decisionCategoryColors.primary} 15%, transparent)`,
                    color: decisionCategoryColors.primary,
                  }}
                >
                  {decisionCategoryLabel}
                </span>
              </div>

              <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-lg font-bold text-priority-foreground shadow-glow-priority"
                    style={{ background: "var(--gradient-priority)" }}
                  >
                    {firstDecisionPriority.rank}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-xl font-bold md:text-2xl">
                      {firstDecisionPriority.fullName}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {firstDecisionExplanation}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-x-5 gap-y-2 text-sm sm:grid-cols-4">
                  <div>
                    <div className="text-xs text-muted-foreground">Score corrigé</div>
                    <div className="font-semibold tabular-nums">
                      <AnimatedNumber value={firstDecisionPriority.score} />
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Moyenne équipe</div>
                    <div className="font-semibold tabular-nums">{formattedAverageTotal}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Écart</div>
                    <div className="font-semibold tabular-nums">
                      {firstDecisionPriority.deviationFromAverage > 0 ? "+" : ""}
                      <AnimatedNumber
                        value={firstDecisionPriority.deviationFromAverage}
                        format={(v) =>
                          v.toLocaleString("fr-FR", {
                            minimumFractionDigits: 1,
                            maximumFractionDigits: 1,
                          })
                        }
                      />
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Dernière garde</div>
                    <div className="font-semibold tabular-nums">
                      {firstDecisionPriority.lastRelevantDuty}
                    </div>
                  </div>
                </div>
              </div>
            </m.div>
          ) : null}

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 rounded-sm"
                style={{ backgroundColor: decisionCategoryColors.primary }}
              />
              Sous la moyenne • plus prioritaire
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: chartMuted }} />
              Au-dessus de la moyenne • moins prioritaire
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: rankAccent[1].ring }} />
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: rankAccent[2].ring }} />
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: rankAccent[3].ring }} />
              Top 3 mis en avant
            </span>
            <span>La ligne centrale représente la moyenne de l’équipe.</span>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Select
              value={decisionChartDisplay}
              onValueChange={(value) => setDecisionChartDisplay(value as DecisionChartDisplay)}
            >
              <SelectTrigger className="h-11 w-full sm:w-[190px]" aria-label="Membres affichés">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="top10">Top 10</SelectItem>
                <SelectItem value="all">Tous les membres</SelectItem>
              </SelectContent>
            </Select>

            <Dialog open={fullRankingOpen} onOpenChange={setFullRankingOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="h-11 w-full sm:w-auto">
                  Voir le classement complet
                </Button>
              </DialogTrigger>
              <DialogContent className="flex max-h-[90vh] flex-col overflow-hidden sm:max-w-5xl">
                <DialogHeader>
                  <DialogTitle>Classement complet — {decisionCategoryLabel}</DialogTitle>
                  <p className="text-sm text-muted-foreground">
                    {decisionData.length} membres classés selon la priorité métier déjà calculée.
                  </p>
                </DialogHeader>

                <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                  <div className="sticky top-0 z-10 hidden grid-cols-[56px_minmax(150px,1.5fr)_repeat(5,minmax(110px,1fr))] gap-3 border-b bg-background px-3 py-2 text-xs font-semibold text-muted-foreground md:grid">
                    <div>Rang</div>
                    <div>Membre</div>
                    <div>Score corrigé</div>
                    <div>Moyenne</div>
                    <div>Écart</div>
                    <div>Dernière garde</div>
                    <div>Catégorie</div>
                  </div>
                  {decisionData.map((item) => (
                    <div
                      key={item.memberId}
                      className="rounded-lg border p-3 text-sm md:grid md:grid-cols-[56px_minmax(150px,1.5fr)_repeat(5,minmax(110px,1fr))] md:items-center md:gap-3"
                    >
                      <div>
                        {item.rank <= 3 ? (
                          <span
                            className="inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-white"
                            style={{ backgroundColor: rankAccent[item.rank as 1 | 2 | 3].fill }}
                          >
                            {item.rank}
                          </span>
                        ) : (
                          <span className="font-bold text-priority">N°{item.rank}</span>
                        )}
                      </div>
                      <div className="mt-1 min-w-0 font-semibold md:mt-0 md:truncate">
                        {item.fullName}
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-3 md:contents">
                        <div>
                          <div className="text-xs text-muted-foreground md:hidden">Score</div>
                          <div className="tabular-nums">{item.score}</div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground md:hidden">Moyenne</div>
                          <div className="tabular-nums">{formattedAverageTotal}</div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground md:hidden">Écart</div>
                          <div className="tabular-nums">
                            {item.deviationFromAverage > 0 ? "+" : ""}
                            {item.deviationFromAverage.toLocaleString("fr-FR", {
                              minimumFractionDigits: 1,
                              maximumFractionDigits: 1,
                            })}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground md:hidden">Dernière garde</div>
                          <div className="tabular-nums">{item.lastRelevantDuty}</div>
                        </div>
                        <div className="col-span-2 md:col-span-1">
                          <div className="text-xs text-muted-foreground md:hidden">Catégorie</div>
                          <div>{decisionCategoryLabel}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <div className="h-[400px] overflow-y-auto overflow-x-hidden rounded-lg border bg-background/40 md:h-[420px] lg:h-[500px]">
            <m.div
              key={`${decisionView}:${analysisMode}:${decisionChartDisplay}:${chartDatasetKey(
                decisionDataForChart,
                (item) => item.deviationFromAverage.toFixed(3)
              )}`}
              initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={chartFadeTransition}
              className="w-full"
              style={{ height: decisionChartContentHeight }}
              role="img"
              aria-label={`Classement ${decisionCategoryLabel.toLowerCase()} par écart à la moyenne. ${
                firstDecisionPriority
                  ? `${firstDecisionPriority.fullName} est priorité numéro un.`
                  : "Aucune donnée."
              }`}
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={decisionDataForChart}
                  layout="vertical"
                  barCategoryGap={6}
                  margin={{ top: 8, right: isMobile ? 12 : 36, bottom: 28, left: 0 }}
                >
                  <CartesianGrid horizontal={false} stroke="hsl(var(--border))" strokeDasharray="3 3" />
                  <XAxis
                    type="number"
                    domain={[-decisionDeviationDomain, decisionDeviationDomain]}
                    tickFormatter={(value) => `${value > 0 ? "+" : ""}${value}`}
                    fontSize={11}
                    tickMargin={8}
                    label={{
                      value: "Écart au score corrigé moyen",
                      position: "insideBottom",
                      offset: -18,
                      fontSize: 11,
                      fill: "hsl(var(--muted-foreground))",
                    }}
                  />
                  <YAxis
                    type="category"
                    dataKey="axisLabel"
                    width={isMobile ? 116 : 190}
                    interval={0}
                    fontSize={isMobile ? 10 : 11}
                    tickMargin={8}
                  />
                  <Tooltip
                    cursor={{ fill: "hsl(var(--muted) / 0.45)" }}
                    content={({ active, payload }) => {
                      const item = payload?.[0]?.payload as
                        | (typeof decisionData)[number]
                        | undefined;
                      if (!active || !item) return null;
                      return (
                        <div className="max-w-[280px] rounded-md border bg-background p-3 text-xs shadow-md">
                          <div className="font-semibold">Priorité n°{item.rank}</div>
                          <div className="mt-1">Membre : {item.fullName}</div>
                          <div>Score corrigé : {item.score}</div>
                          <div>Moyenne équipe : {formattedAverageTotal}</div>
                          <div>
                            Écart : {item.deviationFromAverage > 0 ? "+" : ""}
                            {item.deviationFromAverage.toLocaleString("fr-FR", {
                              minimumFractionDigits: 1,
                              maximumFractionDigits: 1,
                            })}
                          </div>
                          <div>Dernière garde pertinente : {item.lastRelevantDuty}</div>
                          <div>Catégorie : {decisionCategoryLabel}</div>
                        </div>
                      );
                    }}
                  />
                  <ReferenceLine x={0} stroke="hsl(var(--foreground))" strokeWidth={2} />
                  <Bar
                    dataKey="deviationFromAverage"
                    barSize={12}
                    radius={4}
                    isAnimationActive={!shouldReduceMotion}
                    animationDuration={shouldReduceMotion ? 0 : 450}
                    animationEasing="ease-out"
                  >
                    {decisionDataForChart.map((item) => {
                      const topRank = item.rank <= 3 ? (item.rank as 1 | 2 | 3) : null;
                      return (
                        <Cell
                          key={item.memberId}
                          fill={
                            item.deviationFromAverage <= 0
                              ? decisionCategoryColors.primary
                              : chartMuted
                          }
                          fillOpacity={topRank ? 1 : 0.72}
                          stroke={topRank ? rankAccent[topRank].ring : "transparent"}
                          strokeWidth={topRank ? 2 : 0}
                        />
                      );
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </m.div>
          </div>

          <p className="text-xs text-muted-foreground">
            {decisionChartDisplay === "top10"
              ? `Top 10 affiché après classement des ${decisionData.length} membres analysés.`
              : `Les ${decisionData.length} membres sont affichés dans une zone à défilement interne.`}
          </p>
        </CardContent>
      </Card>

      {/* Distribution + fairness */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
            <CardTitle>Charge corrigée par membre — Vue absolue — {analysisModeLabel}</CardTitle>
            <Badge variant="secondary" className="font-medium tabular-nums">
              Moyenne :{" "}
              {distributionData.length ? (
                <AnimatedNumber
                  value={overviewAverage}
                  format={(v) =>
                    v.toLocaleString("fr-FR", {
                      minimumFractionDigits: 1,
                      maximumFractionDigits: 1,
                    })
                  }
                />
              ) : (
                "—"
              )}{" "}
              {distributionData.length ? "jours" : null}
            </Badge>
          </CardHeader>

          <CardContent className="overflow-hidden">
            <div ref={refChartTotal} className="w-full">
              <div className="overflow-x-auto">
                <div style={{ minWidth: getChartMinWidth(distributionDataForChart.length, isMobile) }}>
                  <m.div
                    key={chartDatasetKey(distributionDataForChart, (d) => d.metric)}
                    initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={chartFadeTransition}
                    className="h-[260px] md:h-[320px]"
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={distributionDataForChart}>
                        <XAxis
                          dataKey="name"
                          interval={chartXAxisProps.interval}
                          angle={chartXAxisProps.angle}
                          textAnchor={chartXAxisProps.textAnchor}
                          height={chartXAxisProps.height}
                          fontSize={chartXAxisProps.fontSize}
                          tickMargin={chartXAxisProps.tickMargin}
                        />
                        <YAxis width={isMobile ? 28 : 40} fontSize={12} />
                        <Tooltip
                          content={({ active, payload }) => {
                            const item = payload?.[0]?.payload as
                              | (typeof distributionData)[number]
                              | undefined;
                            if (!active || !item) return null;

                            const difference = item.metric - overviewAverage;
                            const formattedDifference = Math.abs(difference).toLocaleString("fr-FR", {
                              minimumFractionDigits: 1,
                              maximumFractionDigits: 1,
                            });
                            const differenceSign = difference > 0 ? "+" : difference < 0 ? "−" : "";
                            const totalUnit = item.metric === 1 ? "jour" : "jours";
                            const differenceUnit = Math.abs(difference) === 1 ? "jour" : "jours";

                            return (
                              <div className="rounded-md border bg-background p-3 text-xs shadow-md">
                                <div className="font-semibold">{item.fullName}</div>
                                <div className="mt-1 font-medium">Priorité n°{item.rank}</div>
                                <div>Total corrigé : {item.metric} {totalUnit}</div>
                                <div>
                                  Permanences {analysisMode === "period" ? "de la période" : "cumulées"} :{" "}
                                  {analysisMode === "period" ? item.periodTotal : item.cumulativeTotal}
                                </div>
                                <div>
                                  Crédits initiaux : {item.baseNormal} normal + {item.baseHoliday} férié
                                </div>
                                <div>Moyenne globale : {formattedOverviewAverage} jours</div>
                                <div>Écart : {differenceSign}{formattedDifference} {differenceUnit}</div>
                              </div>
                            );
                          }}
                        />
                        <Bar
                          dataKey="metric"
                          fill={chartGlobal.primary}
                          radius={[6, 6, 0, 0]}
                          isAnimationActive={!shouldReduceMotion}
                          animationDuration={shouldReduceMotion ? 0 : 600}
                          animationEasing="ease-out"
                        />
                        {distributionData.length > 0 && (
                          <ReferenceLine
                            y={overviewAverage}
                            stroke="hsl(var(--muted-foreground))"
                            strokeDasharray="5 5"
                            isAnimationActive={!shouldReduceMotion}
                            animationDuration={shouldReduceMotion ? 0 : 600}
                            animationEasing="ease-out"
                            label={{
                              value: `Moyenne : ${formattedOverviewAverage} j`,
                              position: "insideTopRight",
                              fill: "hsl(var(--muted-foreground))",
                              fontSize: 11,
                            }}
                          />
                        )}
                      </BarChart>
                    </ResponsiveContainer>
                  </m.div>
                </div>
              </div>
            </div>

            {isMobile && distributionData.length > CHART_MOBILE_LIMIT && (
              <div className="mt-2 flex items-center justify-between gap-2">
                <div className="text-xs text-muted-foreground">
                  {showAllChartsMobile
                    ? `Affichage complet (${distributionData.length}).`
                    : `${CHART_MOBILE_LIMIT} membres les moins chargés / les plus prioritaires.`}
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAllChartsMobile((v) => !v)}
                >
                  {showAllChartsMobile ? "Top 10" : `Tout (${distributionData.length})`}
                </Button>
              </div>
            )}

            <div className="mt-4 grid gap-4 grid-cols-1 lg:grid-cols-2">
              <div className="rounded-xl border bg-muted/20 p-4">
                <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Top 3 — Le plus chargé
                </div>

                <div className="space-y-2">
                  <AnimatedList
                    as="div"
                    items={top3Most}
                    getKey={(member) => member.memberId}
                    layout
                    renderItem={(member, idx) => {
                      const medal = idx === 0 ? "🥇" : idx === 1 ? "🥈" : "🥉";
                      const first = member.name.split(" ")[0];

                      return (
                        <div className="flex items-center justify-between rounded-lg px-2 py-2 hover:bg-muted/40">
                          <div className="min-w-0 flex items-center gap-3">
                            <div className="shrink-0 text-lg">{medal}</div>
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold">{first}</div>
                              <div className="truncate text-[11px] text-muted-foreground">
                                {analysisModeLabel}
                              </div>
                            </div>
                          </div>
                          <div className="shrink-0 text-lg font-bold tabular-nums">
                            <AnimatedNumber value={member.metric} />
                          </div>
                        </div>
                      );
                    }}
                  />
                </div>
              </div>

              <div className="rounded-xl border bg-muted/20 p-4">
                <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Top 3 — Le moins chargé
                </div>

                <div className="space-y-2">
                  <AnimatedList
                    as="div"
                    items={top3Least}
                    getKey={(member) => member.memberId}
                    layout
                    renderItem={(member) => {
                      const first = member.name.split(" ")[0];

                      return (
                        <div className="flex items-center justify-between rounded-lg px-2 py-2 hover:bg-muted/40">
                          <div className="min-w-0 flex items-center gap-3">
                            <div className="shrink-0 text-lg opacity-70">🧊</div>
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold">{first}</div>
                              <div className="truncate text-[11px] text-muted-foreground">
                                Priorité n°{member.rank} • {analysisModeLabel}
                              </div>
                            </div>
                          </div>
                          <div className="shrink-0 text-lg font-bold tabular-nums">
                            <AnimatedNumber value={member.metric} />
                          </div>
                        </div>
                      );
                    }}
                  />
                </div>
              </div>
            </div>

            <p className="mt-3 text-xs text-muted-foreground">
              Le classement privilégie d’abord les membres les moins chargés, puis ceux qui
              n’ont pas été planifiés depuis le plus longtemps.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              La ligne pointillée représente la moyenne des permanences de l’ensemble des membres
              inclus dans l’analyse.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Équité — {decisionCategoryLabel}</CardTitle>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold">
                  <AnimatedNumber value={fairness.max} />
                </div>
                <div className="text-sm text-muted-foreground">Plus chargé</div>
              </div>
              <div>
                <div className="text-2xl font-bold">
                  <AnimatedNumber value={fairness.min} />
                </div>
                <div className="text-sm text-muted-foreground">Moins chargé</div>
              </div>
              <div>
                <div className="text-2xl font-bold">
                  <AnimatedNumber value={fairness.avg} format={(v) => v.toFixed(1)} />
                </div>
                <div className="text-sm text-muted-foreground">Moyenne</div>
              </div>
              <div>
                <div className="text-2xl font-bold">
                  <AnimatedNumber value={fairnessGap} />
                </div>
                <div className="text-sm text-muted-foreground">Écart (max-min)</div>
              </div>
            </div>

            <div className="pt-4 border-t space-y-3">
              <div className="flex items-center justify-between">
                <div className="font-semibold">Verdict</div>
                <Badge className={fairnessVerdict.cls}>{fairnessVerdict.label}</Badge>
              </div>

              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className={cn(
                    "h-2",
                    fairnessGap <= 2 && "bg-success",
                    fairnessGap > 2 && fairnessGap <= 5 && "bg-warning",
                    fairnessGap > 5 && "bg-destructive"
                  )}
                  style={{
                    width: `${Math.min(100, Math.max(10, (fairnessGap / 10) * 100))}%`,
                  }}
                />
              </div>

              <div className="text-sm text-muted-foreground">
                Si l’écart est petit, c’est équilibré. Si l’écart grandit, certains membres prennent
                trop de charge.
              </div>
            </div>

            <div className="pt-4 border-t">
              <div className="font-semibold mb-2">Recommandations</div>
              <ul className="list-disc ml-5 text-sm space-y-1">
                {recommendations.map((r, i) => (
                  <li key={i} className="text-muted-foreground">
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Comparatives */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Permanences normales — {analysisModeLabel}</CardTitle>
          </CardHeader>

          <CardContent className="overflow-hidden">
            <div ref={refChartNormal} className="w-full">
              <div className="overflow-x-auto">
                <div style={{ minWidth: getChartMinWidth(normalChartDataForChart.length, isMobile) }}>
                  <m.div
                    key={chartDatasetKey(normalChartDataForChart, (d) => d.count)}
                    initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={chartFadeTransition}
                    className="h-[260px] md:h-[320px]"
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={normalChartDataForChart}>
                        <XAxis
                          dataKey="name"
                          interval={chartXAxisProps.interval}
                          angle={chartXAxisProps.angle}
                          textAnchor={chartXAxisProps.textAnchor}
                          height={chartXAxisProps.height}
                          fontSize={chartXAxisProps.fontSize}
                          tickMargin={chartXAxisProps.tickMargin}
                        />
                        <YAxis width={isMobile ? 28 : 40} fontSize={12} />
                        <Tooltip
                          formatter={(value: any, _name: any, props: any) => {
                            const p = props?.payload;
                            if (!p) return [value, "Total corrigé"];
                            const raw = analysisMode === "period" ? p.period : p.global - p.base;
                            return [
                              `${value} (${raw} réalisé + ${p.base} crédit initial)`,
                              "Total corrigé normal",
                            ];
                          }}
                          labelFormatter={(_label: any, payload: any) =>
                            payload?.[0]?.payload
                              ? `Priorité n°${payload[0].payload.rank} — ${payload[0].payload.fullName}`
                              : _label
                          }
                        />
                        <Bar
                          dataKey="count"
                          fill={chartNormal.primary}
                          radius={[6, 6, 0, 0]}
                          isAnimationActive={!shouldReduceMotion}
                          animationDuration={shouldReduceMotion ? 0 : 600}
                          animationEasing="ease-out"
                        />
                        <ReferenceLine
                          y={avgNormalGlobal}
                          stroke="#111827"
                          strokeWidth={3}
                          isAnimationActive={!shouldReduceMotion}
                          animationDuration={shouldReduceMotion ? 0 : 600}
                          animationEasing="ease-out"
                          label={{
                            value: `Moyenne: ${avgNormalGlobal.toFixed(1)}`,
                            position: "top",
                            fill: "#111827",
                            fontSize: 14,
                            fontWeight: 700,
                          }}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </m.div>
                </div>
              </div>
            </div>

            {isMobile && normalChartData.length > CHART_MOBILE_LIMIT && (
              <div className="mt-2 flex items-center justify-between gap-2">
                <div className="text-xs text-muted-foreground">
                  {showAllChartsMobile
                    ? `Affichage complet (${normalChartData.length}).`
                    : `${CHART_MOBILE_LIMIT} membres les moins chargés / les plus prioritaires.`}
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAllChartsMobile((v) => !v)}
                >
                  {showAllChartsMobile ? "Top 10" : `Tout (${normalChartData.length})`}
                </Button>
              </div>
            )}
            <p className="mt-3 text-xs text-muted-foreground">
              Le classement privilégie d’abord les membres les moins chargés, puis ceux qui
              n’ont pas été planifiés depuis le plus longtemps.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Permanences fériées / week-ends — {analysisModeLabel}</CardTitle>
          </CardHeader>

          <CardContent className="overflow-hidden">
            <div ref={refChartHoliday} className="w-full">
              <div className="overflow-x-auto">
                <div style={{ minWidth: getChartMinWidth(holidayChartDataForChart.length, isMobile) }}>
                  <m.div
                    key={chartDatasetKey(holidayChartDataForChart, (d) => d.count)}
                    initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={chartFadeTransition}
                    className="h-[260px] md:h-[320px]"
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={holidayChartDataForChart}>
                        <XAxis
                          dataKey="name"
                          interval={chartXAxisProps.interval}
                          angle={chartXAxisProps.angle}
                          textAnchor={chartXAxisProps.textAnchor}
                          height={chartXAxisProps.height}
                          fontSize={chartXAxisProps.fontSize}
                          tickMargin={chartXAxisProps.tickMargin}
                        />
                        <YAxis width={isMobile ? 28 : 40} fontSize={12} />
                        <Tooltip
                          formatter={(value: any, _name: any, props: any) => {
                            const p = props?.payload;
                            if (!p) return [value, "Total corrigé"];
                            const raw = analysisMode === "period" ? p.period : p.global - p.base;
                            return [
                              `${value} (${raw} réalisé + ${p.base} crédit initial)`,
                              "Total corrigé férié",
                            ];
                          }}
                          labelFormatter={(_label: any, payload: any) =>
                            payload?.[0]?.payload
                              ? `Priorité n°${payload[0].payload.rank} — ${payload[0].payload.fullName}`
                              : _label
                          }
                        />
                        <Bar
                          dataKey="count"
                          fill={chartHoliday.primary}
                          radius={[6, 6, 0, 0]}
                          isAnimationActive={!shouldReduceMotion}
                          animationDuration={shouldReduceMotion ? 0 : 600}
                          animationEasing="ease-out"
                        />
                        <ReferenceLine
                          y={avgHolidayGlobal}
                          stroke="#111827"
                          strokeWidth={3}
                          isAnimationActive={!shouldReduceMotion}
                          animationDuration={shouldReduceMotion ? 0 : 600}
                          animationEasing="ease-out"
                          label={{
                            value: `Moyenne: ${avgHolidayGlobal.toFixed(1)}`,
                            position: "top",
                            fill: "#111827",
                            fontSize: 14,
                            fontWeight: 700,
                          }}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </m.div>
                </div>
              </div>
            </div>

            {isMobile && holidayChartData.length > CHART_MOBILE_LIMIT && (
              <div className="mt-2 flex items-center justify-between gap-2">
                <div className="text-xs text-muted-foreground">
                  {showAllChartsMobile
                    ? `Affichage complet (${holidayChartData.length}).`
                    : `${CHART_MOBILE_LIMIT} membres les moins chargés / les plus prioritaires.`}
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAllChartsMobile((v) => !v)}
                >
                  {showAllChartsMobile ? "Top 10" : `Tout (${holidayChartData.length})`}
                </Button>
              </div>
            )}
            <p className="mt-3 text-xs text-muted-foreground">
              Le classement privilégie d’abord les membres les moins chargés, puis ceux qui
              n’ont pas été planifiés depuis le plus longtemps.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Matrix */}
      <Card>
        <CardHeader>
          <CardTitle>Matrice — Semaine</CardTitle>
        </CardHeader>

        <CardContent className="overflow-hidden">
          <div className="flex flex-col md:flex-row md:items-center gap-3 mb-3">
            <input
              value={matrixSearch}
              onChange={(e) => setMatrixSearch(e.target.value)}
              placeholder="Rechercher un membre..."
              className="w-full md:w-96 border rounded-md px-3 py-2 text-sm"
            />

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={matrixOnlyActive}
                onChange={(e) => setMatrixOnlyActive(e.target.checked)}
              />
              Afficher seulement ceux qui ont &gt; 0 sur la période
            </label>
          </div>

          {isMobile ? (
            <MatrixMobileCards rows={matrixRowsFiltered} />
          ) : (
            <div className="w-full rounded-xl border bg-background overflow-auto max-h-[70vh]">
              <Table className="min-w-[1380px]">
                <TableHeader className="bg-background">
                  <TableRow>
                    <TableHead className={TH_TOP_LEFT}>Membre</TableHead>

                    <TableHead className={cn(TH_TOP, "text-right")}>
                      {headerCell("Crédit initial", "normal")}
                    </TableHead>

                    <TableHead className={cn(TH_TOP, "text-right")}>
                      {headerCell("Crédit initial", "férié")}
                    </TableHead>

                    <TableHead className={cn(TH_TOP, "text-right")}>
                      {headerCell("Crédits initiaux", "total")}
                    </TableHead>

                    {weekdayLabels.map((d) => (
                      <TableHead key={d} className={cn(TH_TOP, "text-right")}>
                        {headerCell(d, "période")}
                      </TableHead>
                    ))}

                    <TableHead className={cn(TH_TOP, "text-right")}>
                      {headerCell("Total période", "Dim..Sam")}
                    </TableHead>

                    <TableHead className={cn(TH_TOP, "text-right")}>
                      {headerCell("Corrigé période", "période + crédits")}
                    </TableHead>

                    <TableHead className={cn(TH_TOP, "text-right")}>
                      {headerCell("Corrigé global", "cumul + crédits")}
                    </TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  <AnimatedList
                    as="tr"
                    items={matrixRowsFiltered}
                    getKey={(row) => row.memberId}
                    layout
                    itemClassName="hover:bg-muted/50"
                    renderItem={(row) => (
                      <>
                        <TableCell className={TD_LEFT}>
                          <div className="truncate font-medium">{row.name}</div>
                        </TableCell>

                        <TableCell className="text-right">{row.baseNormal}</TableCell>
                        <TableCell className="text-right">{row.baseHoliday}</TableCell>
                        <TableCell className="text-right font-semibold">{row.baseTotal}</TableCell>

                        {row.weekdayCountsPeriod.map((v, idx) => (
                          <TableCell key={idx} className="text-right">
                            {v === 0 ? (
                              <span className="text-muted-foreground">—</span>
                            ) : (
                              <span className="font-semibold">{v}</span>
                            )}
                          </TableCell>
                        ))}

                        <TableCell className="text-right font-semibold">{row.periodTotal}</TableCell>
                        <TableCell className="text-right font-bold">{row.periodAdjustedTotal}</TableCell>
                        <TableCell className="text-right font-bold">{row.totalGlobal}</TableCell>
                      </>
                    )}
                  />
                </TableBody>
              </Table>
            </div>
          )}

          <div className="text-xs text-muted-foreground mt-2">
            Les colonnes Dim..Sam représentent uniquement la <b>période filtrée</b>. Les crédits
            initiaux sont affichés séparément et inclus dans les totaux corrigés.
          </div>
        </CardContent>
      </Card>

      {/* Totals table */}
      <Card>
        <CardHeader>
          <CardTitle>Classement détaillé — {decisionCategoryLabel} • {analysisModeLabel}</CardTitle>
        </CardHeader>

        <CardContent className="overflow-hidden">
          <div className="mb-4 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
              <Input
                value={tableSearch}
                onChange={(e) => setTableSearch(e.target.value)}
                placeholder="Rechercher un membre..."
                className="w-full"
              />

              <Select
                value={tableSortBy}
                onValueChange={(value) =>
                  setTableSortBy(
                    value as "name" | "totalNormal" | "totalHoliday" | "total"
                  )
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Trier par" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name">Membre</SelectItem>
                  <SelectItem value="totalNormal">Total jours normaux</SelectItem>
                  <SelectItem value="totalHoliday">Total jours fériés</SelectItem>
                  <SelectItem value="total">Total — {analysisModeLabel}</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={tableSortOrder}
                onValueChange={(value) => setTableSortOrder(value as "asc" | "desc")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Ordre" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="asc">Croissant</SelectItem>
                  <SelectItem value="desc">Décroissant</SelectItem>
                </SelectContent>
              </Select>

              <Button variant="outline" onClick={resetTotalsFilters}>
                Reset filtres
              </Button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              <div className="rounded-lg border p-3 space-y-2">
                <div className="text-sm font-medium">Total jours normaux</div>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    type="number"
                    inputMode="numeric"
                    value={filterTotalNormalMin}
                    onChange={(e) => setFilterTotalNormalMin(e.target.value)}
                    placeholder="Min"
                  />
                  <Input
                    type="number"
                    inputMode="numeric"
                    value={filterTotalNormalMax}
                    onChange={(e) => setFilterTotalNormalMax(e.target.value)}
                    placeholder="Max"
                  />
                </div>
              </div>

              <div className="rounded-lg border p-3 space-y-2">
                <div className="text-sm font-medium">Total jours fériés</div>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    type="number"
                    inputMode="numeric"
                    value={filterTotalHolidayMin}
                    onChange={(e) => setFilterTotalHolidayMin(e.target.value)}
                    placeholder="Min"
                  />
                  <Input
                    type="number"
                    inputMode="numeric"
                    value={filterTotalHolidayMax}
                    onChange={(e) => setFilterTotalHolidayMax(e.target.value)}
                    placeholder="Max"
                  />
                </div>
              </div>

              <div className="rounded-lg border p-3 space-y-2">
                <div className="text-sm font-medium">Total — {analysisModeLabel}</div>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    type="number"
                    inputMode="numeric"
                    value={filterTotalGlobalMin}
                    onChange={(e) => setFilterTotalGlobalMin(e.target.value)}
                    placeholder="Min"
                  />
                  <Input
                    type="number"
                    inputMode="numeric"
                    value={filterTotalGlobalMax}
                    onChange={(e) => setFilterTotalGlobalMax(e.target.value)}
                    placeholder="Max"
                  />
                </div>
              </div>
            </div>

            <div className="text-sm text-muted-foreground">
              Le tableau utilise la vue « {decisionCategoryLabel} » en mode « {analysisModeLabel} ».
              Par défaut, la priorité va au score pertinent le plus faible, puis aux attentes
              pertinentes les plus longues.
            </div>
          </div>

          {isMobile ? (
            <TotalsMobileCards rows={totalsTableRows} />
          ) : (
            <div className="w-full rounded-xl border bg-background overflow-auto max-h-[70vh]">
              <Table className="min-w-[1180px]">
                <TableHeader className="bg-background">
                  <TableRow>
                    <TableHead className={TH_TOP_LEFT}>Membre</TableHead>
                    <TableHead className={cn(TH_TOP, "w-20 text-center py-1 px-2 text-xs")}>Priorité</TableHead>

                    <TableHead className={cn(TH_TOP, "text-right py-1 px-2 text-xs")}>
                      Score prioritaire
                    </TableHead>

                    <TableHead className={cn(TH_TOP, "text-right py-1 px-2 text-xs")}>
                      Période normale
                    </TableHead>

                    <TableHead className={cn(TH_TOP, "text-right py-1 px-2 text-xs")}>
                      Crédit initial normal
                    </TableHead>

                    <TableHead className={cn(TH_TOP, "text-right py-1 px-2 text-xs")}>
                      Corrigé normal
                    </TableHead>

                    <TableHead className={cn(TH_TOP, "text-right py-1 px-2 text-xs")}>
                      Période fériée
                    </TableHead>

                    <TableHead className={cn(TH_TOP, "text-right py-1 px-2 text-xs")}>
                      Crédit initial férié
                    </TableHead>

                    <TableHead className={cn(TH_TOP, "text-right py-1 px-2 text-xs")}>
                      Corrigé férié
                    </TableHead>

                    <TableHead className={cn(TH_TOP, "text-right py-1 px-2 text-xs")}>
                      Crédits initiaux
                    </TableHead>

                    <TableHead className={cn(TH_TOP, "text-right py-1 px-2 text-xs")}>
                      Total corrigé
                    </TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  <AnimatedList
                    as="tr"
                    items={totalsTableRows}
                    getKey={(r) => r.memberId}
                    layout
                    itemClassName="hover:bg-muted/50"
                    renderItem={(r) => (
                      <>
                        <TableCell className={`${TD_LEFT} py-1 px-2`}>
                          <div className="truncate font-medium">{r.name}</div>
                        </TableCell>
                        <TableCell className="text-center py-1 px-2">
                          {r.rank <= 3 ? (
                            <span
                              className="inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-white"
                              style={{ backgroundColor: rankAccent[r.rank as 1 | 2 | 3].fill }}
                            >
                              {r.rank}
                            </span>
                          ) : (
                            <span className="font-semibold text-muted-foreground">n°{r.rank}</span>
                          )}
                        </TableCell>

                        <TableCell className="text-right font-bold text-priority py-1 px-2">
                          {r.relevantScore}
                        </TableCell>

                        <TableCell className="text-right font-semibold py-1 px-2">
                          {r.periodNormal}
                        </TableCell>
                        <TableCell className="text-right font-semibold py-1 px-2">
                          {r.initialNormalCredit}
                        </TableCell>
                        <TableCell className="text-right font-semibold py-1 px-2">
                          {r.totalNormal}
                        </TableCell>
                        <TableCell className="text-right font-semibold py-1 px-2">
                          {r.periodHoliday}
                        </TableCell>
                        <TableCell className="text-right font-semibold py-1 px-2">
                          {r.initialHolidayCredit}
                        </TableCell>
                        <TableCell className="text-right font-semibold py-1 px-2">
                          {r.totalHoliday}
                        </TableCell>
                        <TableCell className="text-right font-semibold py-1 px-2">
                          {r.initialCredit}
                        </TableCell>
                        <TableCell className="text-right font-bold py-1 px-2">
                          <AnimatedNumber value={r.total} />
                        </TableCell>
                      </>
                    )}
                  />
                </TableBody>
              </Table>
            </div>
          )}
          <div className="mt-3 text-xs text-muted-foreground">
            Le total corrigé tient compte des permanences réalisées, du crédit initial normal et
            du crédit initial férié. Ces deux crédits correspondent aux champs réellement présents
            dans la base.
          </div>
        </CardContent>
      </Card>

      {/* Days since last duty */}
      <Card>
        <CardHeader>
          <CardTitle>Ancienneté — dernière permanence</CardTitle>
        </CardHeader>

        <CardContent className="overflow-hidden">
          <div className="w-full">
            <div className="overflow-x-auto">
              <div style={{ minWidth: getChartMinWidth(daysSinceLastDutyDataForChart.length, isMobile) }}>
                <m.div
                  key={chartDatasetKey(daysSinceLastDutyDataForChart, (d) => d.displayDays)}
                  initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={chartFadeTransition}
                  className="h-[260px] md:h-[320px]"
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={daysSinceLastDutyDataForChart}>
                      <XAxis
                        dataKey="name"
                        interval={chartXAxisProps.interval}
                        angle={chartXAxisProps.angle}
                        textAnchor={chartXAxisProps.textAnchor}
                        height={chartXAxisProps.height}
                        fontSize={chartXAxisProps.fontSize}
                        tickMargin={chartXAxisProps.tickMargin}
                      />
                      <YAxis width={isMobile ? 28 : 40} fontSize={12} />
                      <Tooltip
                        formatter={(_value: any, _name: any, props: any) => {
                          const days = props?.payload?.days;
                          return [days === null ? "Jamais" : days, "Jours"];
                        }}
                        labelFormatter={(_label: any, payload: any) =>
                          payload?.[0]?.payload?.fullName ?? _label
                        }
                      />
                      <Bar
                        dataKey="displayDays"
                        fill="hsl(160, 60%, 45%)"
                        radius={[6, 6, 0, 0]}
                        isAnimationActive={!shouldReduceMotion}
                        animationDuration={shouldReduceMotion ? 0 : 600}
                        animationEasing="ease-out"
                      >
                        <LabelList dataKey="displayLabel" position="top" fontSize={10} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </m.div>
              </div>
            </div>
          </div>

          {isMobile && daysSinceLastDutyData.length > CHART_MOBILE_LIMIT && (
            <div className="mt-2 flex items-center justify-between gap-2">
              <div className="text-xs text-muted-foreground">
                {showAllChartsMobile
                  ? `Affichage complet (${daysSinceLastDutyData.length}).`
                  : `${CHART_MOBILE_LIMIT} membres en attente depuis le plus longtemps.`}
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAllChartsMobile((v) => !v)}
              >
                {showAllChartsMobile ? "Top 10" : `Tout (${daysSinceLastDutyData.length})`}
              </Button>
            </div>
          )}

          <div className="text-xs text-muted-foreground mt-2">
            Les membres jamais planifiés apparaissent d’abord. Leur hauteur est uniquement
            visuelle et le tooltip affiche toujours « Jamais ».
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ancienneté — dernière permanence normale</CardTitle>
        </CardHeader>

        <CardContent className="overflow-hidden">
          <div className="w-full">
            <div className="overflow-x-auto">
              <div style={{ minWidth: getChartMinWidth(daysSinceLastNormalDutyDataForChart.length, isMobile) }}>
                <m.div
                  key={chartDatasetKey(daysSinceLastNormalDutyDataForChart, (d) => d.displayDays)}
                  initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={chartFadeTransition}
                  className="h-[260px] md:h-[320px]"
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={daysSinceLastNormalDutyDataForChart}>
                      <XAxis
                        dataKey="name"
                        interval={chartXAxisProps.interval}
                        angle={chartXAxisProps.angle}
                        textAnchor={chartXAxisProps.textAnchor}
                        height={chartXAxisProps.height}
                        fontSize={chartXAxisProps.fontSize}
                        tickMargin={chartXAxisProps.tickMargin}
                      />
                      <YAxis width={isMobile ? 28 : 40} fontSize={12} />
                      <Tooltip
                        formatter={(_value: any, _name: any, props: any) => {
                          const days = props?.payload?.days;
                          return [days === null ? "Jamais" : days, "Jours"];
                        }}
                        labelFormatter={(_label: any, payload: any) =>
                          payload?.[0]?.payload?.fullName ?? _label
                        }
                      />
                      <Bar
                        dataKey="displayDays"
                        fill="#2563EB"
                        radius={[6, 6, 0, 0]}
                        isAnimationActive={!shouldReduceMotion}
                        animationDuration={shouldReduceMotion ? 0 : 600}
                        animationEasing="ease-out"
                      >
                        <LabelList dataKey="displayLabel" position="top" fontSize={10} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </m.div>
              </div>
            </div>
          </div>

          {isMobile && daysSinceLastNormalDutyData.length > CHART_MOBILE_LIMIT && (
            <div className="mt-2 flex items-center justify-between gap-2">
              <div className="text-xs text-muted-foreground">
                {showAllChartsMobile
                  ? `Affichage complet (${daysSinceLastNormalDutyData.length}).`
                  : `${CHART_MOBILE_LIMIT} membres en attente depuis le plus longtemps.`}
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAllChartsMobile((v) => !v)}
              >
                {showAllChartsMobile ? "Top 10" : `Tout (${daysSinceLastNormalDutyData.length})`}
              </Button>
            </div>
          )}

          <div className="text-xs text-muted-foreground mt-2">
            Grande barre = membre sans jour normal depuis longtemps.
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ancienneté — dernière permanence fériée / week-end</CardTitle>
        </CardHeader>

        <CardContent className="overflow-hidden">
          <div className="w-full">
            <div className="overflow-x-auto">
              <div style={{ minWidth: getChartMinWidth(daysSinceLastHolidayDutyDataForChart.length, isMobile) }}>
                <m.div
                  key={chartDatasetKey(daysSinceLastHolidayDutyDataForChart, (d) => d.displayDays)}
                  initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={chartFadeTransition}
                  className="h-[260px] md:h-[320px]"
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={daysSinceLastHolidayDutyDataForChart}>
                      <XAxis
                        dataKey="name"
                        interval={chartXAxisProps.interval}
                        angle={chartXAxisProps.angle}
                        textAnchor={chartXAxisProps.textAnchor}
                        height={chartXAxisProps.height}
                        fontSize={chartXAxisProps.fontSize}
                        tickMargin={chartXAxisProps.tickMargin}
                      />
                      <YAxis width={isMobile ? 28 : 40} fontSize={12} />
                      <Tooltip
                        formatter={(_value: any, _name: any, props: any) => {
                          const days = props?.payload?.days;
                          return [days === null ? "Jamais" : days, "Jours"];
                        }}
                        labelFormatter={(_label: any, payload: any) =>
                          payload?.[0]?.payload?.fullName ?? _label
                        }
                      />
                      <Bar
                        dataKey="displayDays"
                        fill="#F97316"
                        radius={[6, 6, 0, 0]}
                        isAnimationActive={!shouldReduceMotion}
                        animationDuration={shouldReduceMotion ? 0 : 600}
                        animationEasing="ease-out"
                      >
                        <LabelList dataKey="displayLabel" position="top" fontSize={10} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </m.div>
              </div>
            </div>
          </div>

          {isMobile && daysSinceLastHolidayDutyData.length > CHART_MOBILE_LIMIT && (
            <div className="mt-2 flex items-center justify-between gap-2">
              <div className="text-xs text-muted-foreground">
                {showAllChartsMobile
                  ? `Affichage complet (${daysSinceLastHolidayDutyData.length}).`
                  : `${CHART_MOBILE_LIMIT} membres en attente depuis le plus longtemps.`}
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAllChartsMobile((v) => !v)}
              >
                {showAllChartsMobile ? "Top 10" : `Tout (${daysSinceLastHolidayDutyData.length})`}
              </Button>
            </div>
          )}

          <div className="text-xs text-muted-foreground mt-2">
            Grande barre = membre sans jour férié depuis longtemps.
          </div>
        </CardContent>
      </Card>
        </m.div>
      ) : (
        <m.div
          key="insights-empty"
          initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={shouldReduceMotion ? { opacity: 1 } : { opacity: 0 }}
          transition={chartFadeTransition}
        >
          <Card className="border-destructive/40">
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              Corrigez la période pour afficher les indicateurs et les analyses.
            </CardContent>
          </Card>
        </m.div>
      )}
      </AnimatePresence>
    </div>
  );
}
