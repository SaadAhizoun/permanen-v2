import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

import { Download, FileSpreadsheet, FileText } from "lucide-react";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

import { format, differenceInCalendarDays } from "date-fns";
import { fr as frLocale } from "date-fns/locale";

import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import html2canvas from "html2canvas";

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

const weekdayLabels = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"] as const;

const LABELS = {
  solde: "Solde initial",
  period: "Permanences sur la période",
  total: "Total global (Solde + Période)",
  normal: "Jours normaux",
  holiday: "Jours fériés",
};

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
function tickEvery(dataLength: number, maxLabels: number) {
  if (dataLength <= maxLabels) return 1;
  return Math.ceil(dataLength / maxLabels);
}

/**
 * ✅ DB stores date-only: "YYYY-MM-DD"
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

function limitForMobile<T>(arr: T[], isMobile: boolean, limit = CHART_MOBILE_LIMIT) {
  return isMobile ? arr.slice(0, limit) : arr;
}

function KpiCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
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
    baseNormal: number;
    baseHoliday: number;
    baseTotal: number;
    periodNormal: number;
    periodHoliday: number;
    periodTotal: number;
    total: number;
  }>;
}) {
  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <Card key={r.memberId}>
          <CardContent className="py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-semibold truncate">{r.name}</div>
                <div className="text-xs text-muted-foreground">
                  Solde: {r.baseTotal} • Période: {r.periodTotal}
                </div>
              </div>
              <div className="text-2xl font-bold tabular-nums">{r.total}</div>
            </div>

            <div className="grid grid-cols-2 gap-2 mt-3 text-sm">
              <div className="rounded-md border p-2">
                <div className="text-xs text-muted-foreground">Solde normal</div>
                <div className="font-semibold tabular-nums">{r.baseNormal}</div>
              </div>
              <div className="rounded-md border p-2">
                <div className="text-xs text-muted-foreground">Solde férié</div>
                <div className="font-semibold tabular-nums">{r.baseHoliday}</div>
              </div>
              <div className="rounded-md border p-2">
                <div className="text-xs text-muted-foreground">Période normal</div>
                <div className="font-semibold tabular-nums">{r.periodNormal}</div>
              </div>
              <div className="rounded-md border p-2">
                <div className="text-xs text-muted-foreground">Période férié</div>
                <div className="font-semibold tabular-nums">{r.periodHoliday}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
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
    totalGlobal: number;
  }>;
}) {
  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <Card key={row.memberId}>
          <CardContent className="py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-semibold truncate">{row.name}</div>
                <div className="text-xs text-muted-foreground">
                  Solde: {row.baseTotal} • Période: {row.periodTotal}
                </div>
              </div>
              <div className="text-xl font-bold tabular-nums">{row.totalGlobal}</div>
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
                <div className="text-xs text-muted-foreground">Total période</div>
                <div className="font-semibold tabular-nums">{row.periodTotal}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ------------------ Sticky table helpers ------------------
const NAME_COL_W = "w-[240px] min-w-[240px]";

// Top-left header cell: sticky top + sticky left
const TH_TOP_LEFT =
  "sticky top-0 left-0 z-50 bg-background " + NAME_COL_W;

// Other header cells: sticky top
const TH_TOP =
  "sticky top-0 z-40 bg-background";

// Name column cells: sticky left
const TD_LEFT =
  "sticky left-0 z-30 bg-background " +
  NAME_COL_W +
  " shadow-[6px_0_10px_-8px_rgba(0,0,0,0.25)]";

export default function Insights() {
  const [loading, setLoading] = useState(true);
  const isMobile = useIsMobile();

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
  const [tableAsc, setTableAsc] = useState(true);

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

      const { data: dutiesData, error: dutiesErr } = await supabase
        .from("duty_entries")
        .select("duty_date, duty_type, team_member_id, team_member:team_members(id, full_name)");

      if (dutiesErr) throw dutiesErr;

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
      setHolidayDatesSet(holidaySet);

      // default selection: all members
      setSelectedMemberIds(m.map((x) => x.id));

      // default export range = min/max duty_date
      const allDutyDates = d.map((x) => clampDateStr(x.duty_date)).filter(Boolean);
      const minD = allDutyDates.length
        ? allDutyDates.reduce((a, b) => (a < b ? a : b))
        : format(new Date(), "yyyy-MM-dd");
      const maxD = allDutyDates.length
        ? allDutyDates.reduce((a, b) => (a > b ? a : b))
        : format(new Date(), "yyyy-MM-dd");

      setExportFrom(minD);
      setExportTo(maxD);
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

  const filteredDuties = useMemo(() => {
    const allowAll = selectedMemberIds.length === 0;
    const set = new Set(selectedMemberIds);

    return duties.filter((d) => {
      if (!d.team_member_id) return false;
      if (allowAll) return true;
      return set.has(d.team_member_id);
    });
  }, [duties, selectedMemberIds]);

  // apply export range on top of filtered duties
  const exportDuties = useMemo(() => {
    const from = clampDateStr(exportFrom);
    const to = clampDateStr(exportTo);
    if (!from || !to) return filteredDuties;

    return filteredDuties.filter((d) => {
      const ds = clampDateStr(d.duty_date);
      return ds >= from && ds <= to;
    });
  }, [filteredDuties, exportFrom, exportTo]);

  /**
   * ✅ If you want WEEKEND to be counted as "Férié" too: keep true
   */
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

        normal: number;
        holiday: number;
        total: number;

        weekendPeriod: number;
        weekdayPeriod: number;
      }
    > = {};

    for (const m of members) {
      if (!allowAll && !selectedSet.has(m.id)) continue;

      const baseNormal = Number(m.initial_credit_normal ?? 0);
      const baseHoliday = Number(m.initial_credit_holiday ?? 0);
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

        normal: baseNormal,
        holiday: baseHoliday,
        total: baseTotal,

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
        stats[mid].holiday += 1;
      } else {
        stats[mid].periodNormal += 1;
        stats[mid].normal += 1;
      }

      stats[mid].periodTotal += 1;
      stats[mid].total += 1;

      if (isWeekend) stats[mid].weekendPeriod += 1;
      else stats[mid].weekdayPeriod += 1;
    }

    return Object.values(stats);
  }, [exportDuties, members, selectedMemberIds, holidayDatesSet]);

  const kpis = useMemo(() => {
    const total = perMemberStats.reduce((s, m) => s + m.total, 0);
    const holiday = perMemberStats.reduce((s, m) => s + m.holiday, 0);
    const normal = perMemberStats.reduce((s, m) => s + m.normal, 0);
    const weekendPeriod = perMemberStats.reduce((s, m) => s + m.weekendPeriod, 0);

    const avg = perMemberStats.length ? total / perMemberStats.length : 0;

    const baseTotal = perMemberStats.reduce((s, m) => s + m.baseTotal, 0);
    const periodTotal = perMemberStats.reduce((s, m) => s + m.periodTotal, 0);

    return {
      total,
      normal,
      holiday,
      weekendPeriod,
      avg: Math.round(avg * 10) / 10,
      baseTotal,
      periodTotal,
    };
  }, [perMemberStats]);

  const distributionData = useMemo(() => {
    return [...perMemberStats]
      .map((m) => ({
        memberId: m.memberId,
        name: shortName(m.name),
        fullName: m.name,
        total: m.total,
        baseTotal: m.baseTotal,
        periodTotal: m.periodTotal,
      }))
      .sort((a, b) => b.total - a.total);
  }, [perMemberStats]);

  const normalChartData = useMemo(() => {
    return [...perMemberStats]
      .map((m) => ({
        memberId: m.memberId,
        name: shortName(m.name),
        fullName: m.name,
        count: m.normal,
        base: m.baseNormal,
        period: m.periodNormal,
      }))
      .sort((a, b) => b.count - a.count);
  }, [perMemberStats]);

  const holidayChartData = useMemo(() => {
    return [...perMemberStats]
      .map((m) => ({
        memberId: m.memberId,
        name: shortName(m.name),
        fullName: m.name,
        count: m.holiday,
        base: m.baseHoliday,
        period: m.periodHoliday,
      }))
      .sort((a, b) => b.count - a.count);
  }, [perMemberStats]);

  const top3Most = useMemo(
    () => [...perMemberStats].sort((a, b) => b.total - a.total).slice(0, 3),
    [perMemberStats]
  );
  const top3Least = useMemo(
    () => [...perMemberStats].sort((a, b) => a.total - b.total).slice(0, 3),
    [perMemberStats]
  );

  const fairness = useMemo(() => {
    const counts = perMemberStats.map((m) => m.total);
    if (counts.length === 0) return { max: 0, min: 0, avg: 0 };
    const max = Math.max(...counts);
    const min = Math.min(...counts);
    const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
    return { max, min, avg: Math.round(avg * 10) / 10 };
  }, [perMemberStats]);

  const fairnessGap = fairness.max - fairness.min;

  const fairnessVerdict = useMemo(() => {
    if (fairnessGap <= 2) return { label: "Équitable", cls: "bg-green-600 text-white" };
    if (fairnessGap <= 5) return { label: "Moyen", cls: "bg-yellow-500 text-white" };
    return { label: "Déséquilibré", cls: "bg-red-600 text-white" };
  }, [fairnessGap]);

  const totalsTableRows = useMemo(() => {
    const rows = [...perMemberStats].filter((r) =>
      r.name.toLowerCase().includes(tableSearch.toLowerCase())
    );
    rows.sort((a, b) => (tableAsc ? a.total - b.total : b.total - a.total));
    return rows;
  }, [perMemberStats, tableSearch, tableAsc]);

  /**
   * ✅ Matrix for PERIOD by weekday + adds Solde columns + Total global
   */
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
      totalGlobal: number;
    }> = [];

    for (const m of members) {
      if (!allowAll && !selectedSet.has(m.id)) continue;

      const base =
        baseById.get(m.id) || { baseNormal: 0, baseHoliday: 0, baseTotal: 0, totalGlobal: 0 };

      matrix.push({
        memberId: m.id,
        name: m.full_name,

        baseNormal: base.baseNormal,
        baseHoliday: base.baseHoliday,
        baseTotal: base.baseTotal,

        weekdayCountsPeriod: Array(7).fill(0),
        periodTotal: 0,
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

    matrix.sort((a, b) => b.totalGlobal - a.totalGlobal);
    return matrix;
  }, [exportDuties, members, selectedMemberIds, perMemberStats]);

  // ---------- Days since last (3 graphs) ----------
  const daysSinceLastDutyData = useMemo(() => {
    const now = new Date();
    const lastDateByMember = new Map<string, Date>();

    for (const d of exportDuties) {
      const mid = d.team_member_id;
      if (!mid) continue;

      const dayKey = clampDateStr(d.duty_date);
      if (!dayKey) continue;

      const dt = parseDateOnlyUTC(dayKey);
      const prev = lastDateByMember.get(mid);
      if (!prev || dt > prev) lastDateByMember.set(mid, dt);
    }

    const allowAll = selectedMemberIds.length === 0;
    const selectedSet = new Set(selectedMemberIds);

    return members
      .filter((m) => allowAll || selectedSet.has(m.id))
      .map((m) => {
        const last = lastDateByMember.get(m.id) || null;
        const days = last ? Math.max(0, differenceInCalendarDays(now, last)) : null;
        return {
          memberId: m.id,
          name: shortName(m.full_name),
          fullName: m.full_name,
          days: days ?? 9999,
          hasValue: days !== null,
        };
      })
      .sort((a, b) => b.days - a.days);
  }, [exportDuties, members, selectedMemberIds]);

  const daysSinceLastNormalDutyData = useMemo(() => {
    const now = new Date();
    const lastDateByMember = new Map<string, Date>();

    exportDuties.forEach((d) => {
      const mid = d.team_member_id;
      if (!mid) return;

      const dayKey = clampDateStr(d.duty_date);
      const dt = parseDateOnlyUTC(dayKey);

      const isWeekend = isWeekendByDayIndex(dt.getUTCDay());
      const isOfficialHoliday = holidayDatesSet.has(dayKey);
      const isHoliday = COUNT_WEEKEND_AS_HOLIDAY
        ? isOfficialHoliday || isWeekend
        : isOfficialHoliday;

      if (isHoliday) return;

      const prev = lastDateByMember.get(mid);
      if (!prev || dt > prev) lastDateByMember.set(mid, dt);
    });

    return members
      .filter((m) => selectedMemberIds.length === 0 || selectedMemberIds.includes(m.id))
      .map((m) => {
        const last = lastDateByMember.get(m.id) || null;
        const days = last ? Math.max(0, differenceInCalendarDays(now, last)) : null;
        return {
          memberId: m.id,
          name: shortName(m.full_name),
          fullName: m.full_name,
          days: days ?? 9999,
          hasValue: days !== null,
        };
      })
      .sort((a, b) => b.days - a.days);
  }, [exportDuties, members, holidayDatesSet, selectedMemberIds]);

  const daysSinceLastHolidayDutyData = useMemo(() => {
    const now = new Date();
    const lastDateByMember = new Map<string, Date>();

    exportDuties.forEach((d) => {
      const mid = d.team_member_id;
      if (!mid) return;

      const dayKey = clampDateStr(d.duty_date);
      const dt = parseDateOnlyUTC(dayKey);

      const isWeekend = isWeekendByDayIndex(dt.getUTCDay());
      const isOfficialHoliday = holidayDatesSet.has(dayKey);
      const isHoliday = COUNT_WEEKEND_AS_HOLIDAY
        ? isOfficialHoliday || isWeekend
        : isOfficialHoliday;

      if (!isHoliday) return;

      const prev = lastDateByMember.get(mid);
      if (!prev || dt > prev) lastDateByMember.set(mid, dt);
    });

    return members
      .filter((m) => selectedMemberIds.length === 0 || selectedMemberIds.includes(m.id))
      .map((m) => {
        const last = lastDateByMember.get(m.id) || null;
        const days = last ? Math.max(0, differenceInCalendarDays(now, last)) : null;
        return {
          memberId: m.id,
          name: shortName(m.full_name),
          fullName: m.full_name,
          days: days ?? 200,
          hasValue: days !== null,
        };
      })
      .sort((a, b) => b.days - a.days);
  }, [exportDuties, members, holidayDatesSet, selectedMemberIds]);

  const recommendations = useMemo(() => {
    if (perMemberStats.length === 0) return [];
    const avg = fairness.avg || 0;
    const sorted = [...perMemberStats].sort((a, b) => a.total - b.total);

    const least = sorted.slice(0, 3);
    const most = [...sorted].reverse().slice(0, 3);

    const recs: string[] = [];

    if (fairnessGap >= 6)
      recs.push(`Déséquilibre important : écart de ${fairnessGap}. Priorise les membres les moins chargés.`);
    else recs.push(`Équilibre correct : écart de ${fairnessGap}. Continue sur la même logique.`);

    recs.push(`Rotation suggérée (moins chargés) : ${least.map((m) => shortName(m.name)).join(", ")}.`);
    if (most[0]?.total >= avg + 3)
      recs.push(`Réduire la charge de : ${most.map((m) => shortName(m.name)).join(", ")} (au-dessus de la moyenne).`);

    recs.push(`${LABELS.total} = ${LABELS.solde} + ${LABELS.period}.`);
    recs.push(`Totaux: Solde = ${kpis.baseTotal} • Période = ${kpis.periodTotal} • Global = ${kpis.total}.`);

    return recs;
  }, [perMemberStats, fairness.avg, fairnessGap, kpis.baseTotal, kpis.periodTotal, kpis.total]);

  // -----------------------
  // EXPORTS
  // -----------------------
  const reportTitle = `Rapport Permanences — ${clampDateStr(exportFrom) || "…"} → ${clampDateStr(exportTo) || "…"}`;

  const exportExcel = () => {
    const wb = XLSX.utils.book_new();
    const generatedAt = format(new Date(), "dd/MM/yyyy HH:mm", { locale: frLocale });

    // Sheet 1: Summary
    const summaryRows = [
      ["RAPPORT PERMANENCES"],
      ["Période", `${clampDateStr(exportFrom) || "…"} → ${clampDateStr(exportTo) || "…"}`],
      ["Généré le", generatedAt],
      ["Membres inclus", selectedCountLabel],
      [],
      ["INDICATEURS"],
      [LABELS.total, kpis.total],
      [`${LABELS.solde} (Total)`, kpis.baseTotal],
      [`${LABELS.period} (Total)`, kpis.periodTotal],
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

    // Sheet 2: Totals
    const totalsHeader = [
      [
        "Membre",
        "Solde initial — Normal",
        "Solde initial — Férié",
        "Solde initial — Total",
        "Période — Normal",
        "Période — Férié",
        "Période — Total",
        "Total global",
        "Week-end (période)",
        "Semaine (période)",
      ],
    ];

    const totalsRows = perMemberStats.map((m) => [
      m.name,
      m.baseNormal,
      m.baseHoliday,
      m.baseTotal,
      m.periodNormal,
      m.periodHoliday,
      m.periodTotal,
      m.total,
      m.weekendPeriod,
      m.weekdayPeriod,
    ]);

    const ws2 = XLSX.utils.aoa_to_sheet([...totalsHeader, ...totalsRows]);
    ws2["!cols"] = [
      { wch: 28 },
      { wch: 18 },
      { wch: 18 },
      { wch: 18 },
      { wch: 14 },
      { wch: 14 },
      { wch: 14 },
      { wch: 14 },
      { wch: 16 },
      { wch: 16 },
    ];
    XLSX.utils.book_append_sheet(wb, ws2, "Totaux");

    // Sheet 3: Matrix
    if (exportIncludeMatrix) {
      const matrixHeader = [
        [
          "Membre",
          "Solde initial — Normal",
          "Solde initial — Férié",
          "Solde initial — Total",
          ...weekdayLabels.map((d) => `${d} (période)`),
          "Total période",
          "Total global",
        ],
      ];

      const matrixRows = weekdayMatrix.map((row) => [
        row.name,
        row.baseNormal,
        row.baseHoliday,
        row.baseTotal,
        ...row.weekdayCountsPeriod,
        row.periodTotal,
        row.totalGlobal,
      ]);

      const ws3 = XLSX.utils.aoa_to_sheet([...matrixHeader, ...matrixRows]);
      ws3["!cols"] = [
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

    // Sheet 4: Raw
    if (exportIncludeRaw) {
      const rawHeader = [["Date", "Jour", "Membre", "Type", "Férié?", "Week-end?"]];
      const rawRows = exportDuties
        .map((d) => {
          const dayKey = clampDateStr(d.duty_date);
          const dt = parseDateOnlyUTC(dayKey);
          const wd = dt.getUTCDay();
          const weekend = isWeekendByDayIndex(wd);

          const officialHoliday = holidayDatesSet.has(dayKey);
          const holiday = COUNT_WEEKEND_AS_HOLIDAY ? officialHoliday || weekend : officialHoliday;

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
    const canvas = await html2canvas(node, { scale: 2, backgroundColor: "#ffffff" });
    return canvas.toDataURL("image/png");
  }

  const exportPDF = async () => {
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
      `${clampDateStr(exportFrom) || "…"} → ${clampDateStr(exportTo) || "…"}   •   Généré le ${format(
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
      { label: LABELS.total, value: String(kpis.total) },
      { label: `${LABELS.solde} (Total)`, value: String(kpis.baseTotal) },
      { label: `${LABELS.period} (Total)`, value: String(kpis.periodTotal) },
      { label: "Week-end (période)", value: String(kpis.weekendPeriod) },
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
    doc.text("Totaux (Solde + Période)", margin, cursorY + 14);
    cursorY += 24;

    autoTable(doc, {
      startY: cursorY,
      head: [
        [
          "Membre",
          "Solde initial — Normal",
          "Solde initial — Férié",
          "Solde initial — Total",
          "Période — Normal",
          "Période — Férié",
          "Période — Total",
          "Total global",
        ],
      ],
      body: perMemberStats.map((m) => [
        m.name,
        m.baseNormal,
        m.baseHoliday,
        m.baseTotal,
        m.periodNormal,
        m.periodHoliday,
        m.periodTotal,
        m.total,
      ]),
      styles: { font: "helvetica", fontSize: 9, cellPadding: 6, lineWidth: 0.5, lineColor: 220 },
      headStyles: { fillColor: [30, 30, 30], textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [248, 248, 248] },
      margin: { left: margin, right: margin },
    });

    if (exportIncludeMatrix) {
      doc.addPage();
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.text("Matrice — Membre × Jour de semaine (période) + Solde initial", margin, 56);

      autoTable(doc, {
        startY: 76,
        head: [
          [
            "Membre",
            "Solde initial — Normal",
            "Solde initial — Férié",
            "Solde initial — Total",
            ...weekdayLabels.map((d) => `${d} (période)`),
            "Total période",
            "Total global",
          ],
        ],
        body: weekdayMatrix.map((row) => [
          row.name,
          row.baseNormal,
          row.baseHoliday,
          row.baseTotal,
          ...row.weekdayCountsPeriod,
          row.periodTotal,
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
          const isHoliday = COUNT_WEEKEND_AS_HOLIDAY ? isOfficialHoliday || isWeekend : isOfficialHoliday;

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
    () => limitForMobile(distributionData, isMobile),
    [distributionData, isMobile]
  );
  const normalChartDataForChart = useMemo(
    () => limitForMobile(normalChartData, isMobile),
    [normalChartData, isMobile]
  );
  const holidayChartDataForChart = useMemo(
    () => limitForMobile(holidayChartData, isMobile),
    [holidayChartData, isMobile]
  );
  const daysSinceLastDutyDataForChart = useMemo(
    () => limitForMobile(daysSinceLastDutyData, isMobile),
    [daysSinceLastDutyData, isMobile]
  );
  const daysSinceLastNormalDutyDataForChart = useMemo(
    () => limitForMobile(daysSinceLastNormalDutyData, isMobile),
    [daysSinceLastNormalDutyData, isMobile]
  );
  const daysSinceLastHolidayDutyDataForChart = useMemo(
    () => limitForMobile(daysSinceLastHolidayDutyData, isMobile),
    [daysSinceLastHolidayDutyData, isMobile]
  );

  if (loading) return <Skeleton className="h-96 w-full" />;

  // Matrix rows filtered once
  const matrixRowsFiltered = weekdayMatrix
    .filter((row) => row.name.toLowerCase().includes(matrixSearch.toLowerCase()))
    .filter((row) => !matrixOnlyActive || row.periodTotal > 0);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="space-y-1">
          <div className="text-xl md:text-2xl font-bold">Aide à la décision</div>
          <div className="text-sm text-muted-foreground">
            Lecture rapide + filtres + indicateurs (Total global = Solde initial + Période).
          </div>

          {/* Mobile badges */}
          <div className="flex flex-wrap gap-2 pt-2 md:hidden">
            <Badge variant="secondary">
              Période: {clampDateStr(exportFrom)} → {clampDateStr(exportTo)}
            </Badge>
            <Badge variant="outline">Membres: {selectedCountLabel}</Badge>
            <Badge variant="outline">Total: {kpis.total}</Badge>
          </div>
        </div>

        <div className="flex flex-col md:flex-row md:items-center gap-2 md:justify-end">
          {/* Desktop badges */}
          <div className="hidden md:flex flex-wrap gap-2 items-center">
            <Badge variant="secondary">
              Période: {clampDateStr(exportFrom)} → {clampDateStr(exportTo)}
            </Badge>
            <Badge variant="outline">Membres: {selectedCountLabel}</Badge>
            <Badge variant="outline">Total global: {kpis.total}</Badge>
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
                      value={exportFrom}
                      onChange={(e) => setExportFrom(e.target.value)}
                      placeholder="YYYY-MM-DD"
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="text-sm font-medium">Au</div>
                    <Input
                      value={exportTo}
                      onChange={(e) => setExportTo(e.target.value)}
                      placeholder="YYYY-MM-DD"
                    />
                  </div>
                </div>

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
                <Button variant="secondary" onClick={exportExcel}>
                  <FileSpreadsheet className="h-4 w-4 mr-2" />
                  Excel
                </Button>
                <Button onClick={exportPDF}>
                  <FileText className="h-4 w-4 mr-2" />
                  PDF
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Sticky filters (sticky only on md+) */}
      <Card className="md:sticky md:top-2 z-10">
        <CardContent className="py-4">
          <div className="flex flex-wrap items-center gap-3">
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
              <Badge variant="secondary">Solde: {kpis.baseTotal}</Badge>
              <Badge variant="secondary">Période: {kpis.periodTotal}</Badge>
              <Badge variant="secondary">Total global: {kpis.total}</Badge>
            </div>
          </div>

          {filterOpen && (
            <div className="mt-4 border rounded-lg p-3">
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
          )}
        </CardContent>
      </Card>

      {/* KPI Cards */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <KpiCard
          label={LABELS.total}
          value={kpis.total}
          hint={`${LABELS.solde} + ${LABELS.period}`}
        />
        <KpiCard label={`${LABELS.solde} (Total)`} value={kpis.baseTotal} hint="Crédits initiaux" />
        <KpiCard label={`${LABELS.period} (Total)`} value={kpis.periodTotal} hint="Sur la période filtrée" />
        <KpiCard label="Moyenne / membre (global)" value={kpis.avg} hint="Basée sur Total global" />
      </div>

      {/* Distribution + fairness */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Répartition par membre — Total global</CardTitle>
          </CardHeader>

          <CardContent className="overflow-hidden">
            <div ref={refChartTotal} className="w-full">
              <div className="h-[260px] md:h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={distributionDataForChart}>
                    <XAxis
                      dataKey="name"
                      interval={0}
                      angle={isMobile ? -25 : -35}
                      textAnchor="end"
                      height={isMobile ? 60 : 80}
                      fontSize={isMobile ? 10 : 12}
                    />
                    <YAxis width={isMobile ? 28 : 40} fontSize={12} />
                    <Tooltip
                      formatter={(value: any, _n: any, props: any) => {
                        const p = props?.payload;
                        if (!p) return [value, "Total"];
                        return [`${value}`, `Total • S:${p.baseTotal} • P:${p.periodTotal}`];
                      }}
                      labelFormatter={(_label: any, payload: any) =>
                        payload?.[0]?.payload?.fullName ?? _label
                      }
                    />
                    <Bar dataKey="total" fill="hsl(173, 58%, 39%)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {isMobile && distributionData.length > CHART_MOBILE_LIMIT && (
              <div className="mt-2 text-xs text-muted-foreground">
                Affichage limité aux {CHART_MOBILE_LIMIT} premiers sur mobile.
              </div>
            )}

            <div className="mt-4 grid gap-4 grid-cols-1 lg:grid-cols-2">
              {/* Top Most */}
              <div className="rounded-xl border bg-muted/20 p-4">
                <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Top 3 — Le plus chargé
                </div>

                <div className="space-y-2">
                  {top3Most.map((m, idx) => {
                    const medal = idx === 0 ? "🥇" : idx === 1 ? "🥈" : "🥉";
                    const first = m.name.split(" ")[0];

                    return (
                      <div
                        key={m.memberId}
                        className="flex items-center justify-between rounded-lg px-2 py-2 hover:bg-muted/40"
                      >
                        <div className="min-w-0 flex items-center gap-3">
                          <div className="shrink-0 text-lg">{medal}</div>
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold">{first}</div>
                            <div className="truncate text-[11px] text-muted-foreground">
                              S:{m.baseTotal} • P:{m.periodTotal}
                            </div>
                          </div>
                        </div>
                        <div className="shrink-0 text-lg font-bold tabular-nums">{m.total}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Top Least */}
              <div className="rounded-xl border bg-muted/20 p-4">
                <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Top 3 — Le moins chargé
                </div>

                <div className="space-y-2">
                  {top3Least.map((m) => {
                    const first = m.name.split(" ")[0];

                    return (
                      <div
                        key={m.memberId}
                        className="flex items-center justify-between rounded-lg px-2 py-2 hover:bg-muted/40"
                      >
                        <div className="min-w-0 flex items-center gap-3">
                          <div className="shrink-0 text-lg opacity-70">🧊</div>
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold">{first}</div>
                            <div className="truncate text-[11px] text-muted-foreground">
                              S:{m.baseTotal} • P:{m.periodTotal}
                            </div>
                          </div>
                        </div>
                        <div className="shrink-0 text-lg font-bold tabular-nums">{m.total}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Équité (simple)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold">{fairness.max}</div>
                <div className="text-sm text-muted-foreground">Plus chargé</div>
              </div>
              <div>
                <div className="text-2xl font-bold">{fairness.min}</div>
                <div className="text-sm text-muted-foreground">Moins chargé</div>
              </div>
              <div>
                <div className="text-2xl font-bold">{fairness.avg}</div>
                <div className="text-sm text-muted-foreground">Moyenne</div>
              </div>
              <div>
                <div className="text-2xl font-bold">{fairnessGap}</div>
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
                    fairnessGap <= 2 && "bg-green-600",
                    fairnessGap > 2 && fairnessGap <= 5 && "bg-yellow-500",
                    fairnessGap > 5 && "bg-red-600"
                  )}
                  style={{ width: `${Math.min(100, Math.max(10, (fairnessGap / 10) * 100))}%` }}
                />
              </div>

              <div className="text-sm text-muted-foreground">
                Si l’écart est petit, c’est équilibré. Si l’écart grandit, certains membres prennent trop de charge.
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
            <CardTitle>Comparatif — {LABELS.normal} (global)</CardTitle>
          </CardHeader>
          <CardContent className="overflow-hidden">
            <div ref={refChartNormal} className="w-full">
              <div className="h-[260px] md:h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={normalChartDataForChart}>
                    <XAxis
                      dataKey="name"
                      interval={0}
                      angle={isMobile ? -25 : -35}
                      textAnchor="end"
                      height={isMobile ? 60 : 80}
                      fontSize={isMobile ? 10 : 12}
                    />
                    <YAxis width={isMobile ? 28 : 40} fontSize={12} />
                    <Tooltip
                      formatter={(value: any, _name: any, props: any) => {
                        const p = props?.payload;
                        if (!p) return [value, LABELS.normal];
                        return [`${value} (Solde ${p.base} + Période ${p.period})`, LABELS.normal];
                      }}
                      labelFormatter={(_label: any, payload: any) => payload?.[0]?.payload?.fullName ?? _label}
                    />
                    <Bar dataKey="count" fill="#2563EB" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {isMobile && normalChartData.length > CHART_MOBILE_LIMIT && (
              <div className="mt-2 text-xs text-muted-foreground">
                Affichage limité aux {CHART_MOBILE_LIMIT} premiers sur mobile.
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Comparatif — {LABELS.holiday} (global)</CardTitle>
          </CardHeader>
          <CardContent className="overflow-hidden">
            <div ref={refChartHoliday} className="w-full">
              <div className="h-[260px] md:h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={holidayChartDataForChart}>
                    <XAxis
                      dataKey="name"
                      interval={0}
                      angle={isMobile ? -25 : -35}
                      textAnchor="end"
                      height={isMobile ? 60 : 80}
                      fontSize={isMobile ? 10 : 12}
                    />
                    <YAxis width={isMobile ? 28 : 40} fontSize={12} />
                    <Tooltip
                      formatter={(value: any, _name: any, props: any) => {
                        const p = props?.payload;
                        if (!p) return [value, LABELS.holiday];
                        return [`${value} (Solde ${p.base} + Période ${p.period})`, LABELS.holiday];
                      }}
                      labelFormatter={(_label: any, payload: any) => payload?.[0]?.payload?.fullName ?? _label}
                    />
                    <Bar dataKey="count" fill="#F97316" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {isMobile && holidayChartData.length > CHART_MOBILE_LIMIT && (
              <div className="mt-2 text-xs text-muted-foreground">
                Affichage limité aux {CHART_MOBILE_LIMIT} premiers sur mobile.
              </div>
            )}
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

          {/* Mobile: cards. Desktop: table with sticky header + sticky name column */}
          {isMobile ? (
            <MatrixMobileCards rows={matrixRowsFiltered} />
          ) : (
            <div className="w-full rounded-xl border bg-background overflow-auto max-h-[70vh]">
              <Table className="min-w-[1280px]">
                <TableHeader className="bg-background">
                  <TableRow>
                    <TableHead className={TH_TOP_LEFT}>Membre</TableHead>

                    <TableHead className={cn(TH_TOP, "text-right")}>
                      {headerCell("Solde (Normal)", "crédit initial")}
                    </TableHead>
                    <TableHead className={cn(TH_TOP, "text-right")}>
                      {headerCell("Solde (Férié)", "crédit initial")}
                    </TableHead>
                    <TableHead className={cn(TH_TOP, "text-right")}>
                      {headerCell("Solde (Total)", "crédit initial")}
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
                      {headerCell("Total global", "Solde + période")}
                    </TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {matrixRowsFiltered.map((row) => (
                    <TableRow key={row.memberId} className="hover:bg-muted/50">
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
                      <TableCell className="text-right font-bold">{row.totalGlobal}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <div className="text-xs text-muted-foreground mt-2">
            Les colonnes Dim..Sam représentent uniquement la <b>période filtrée</b>. Le solde initial est affiché séparément.
          </div>
        </CardContent>
      </Card>

      {/* Totals table */}
      <Card>
        <CardHeader>
          <CardTitle>Totaux</CardTitle>
        </CardHeader>
        <CardContent className="overflow-hidden">
          <div className="flex flex-col md:flex-row md:items-center gap-3 mb-3">
            <input
              value={tableSearch}
              onChange={(e) => setTableSearch(e.target.value)}
              placeholder="Rechercher dans le tableau..."
              className="w-full md:w-80 border rounded-md px-3 py-2 text-sm"
            />
            <button
              type="button"
              className="text-sm border rounded-md px-3 py-2 hover:bg-muted w-full md:w-auto"
              onClick={() => setTableAsc((v) => !v)}
            >
              Tri: {tableAsc ? "Croissant" : "Décroissant"}
            </button>
            <div className="text-sm text-muted-foreground md:ml-2">
              (Tri basé sur Total global)
            </div>
          </div>

          {/* Mobile: cards. Desktop: table with sticky header + sticky name column */}
          {isMobile ? (
            <TotalsMobileCards rows={totalsTableRows} />
          ) : (
            <div className="w-full rounded-xl border bg-background overflow-auto max-h-[70vh]">
              <Table className="min-w-[1280px]">
                <TableHeader className="bg-background">
                  <TableRow>
                    <TableHead className={TH_TOP_LEFT}>Membre</TableHead>

                    <TableHead className={cn(TH_TOP, "text-right")}>
                      {headerCell("Solde (Normal)", "crédit initial")}
                    </TableHead>
                    <TableHead className={cn(TH_TOP, "text-right")}>
                      {headerCell("Solde (Férié)", "crédit initial")}
                    </TableHead>
                    <TableHead className={cn(TH_TOP, "text-right")}>
                      {headerCell("Solde (Total)", "crédit initial")}
                    </TableHead>

                    <TableHead className={cn(TH_TOP, "text-right")}>
                      {headerCell("Période (Normal)", "sur période")}
                    </TableHead>
                    <TableHead className={cn(TH_TOP, "text-right")}>
                      {headerCell("Période (Férié)", "sur période")}
                    </TableHead>
                    <TableHead className={cn(TH_TOP, "text-right")}>
                      {headerCell("Période (Total)", "sur période")}
                    </TableHead>

                    <TableHead className={cn(TH_TOP, "text-right")}>
                      {headerCell("Total global", "Solde + période")}
                    </TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {totalsTableRows.map((r) => (
                    <TableRow key={r.memberId} className="hover:bg-muted/50">
                      <TableCell className={TD_LEFT}>
                        <div className="truncate font-medium">{r.name}</div>
                      </TableCell>

                      <TableCell className="text-right">{r.baseNormal}</TableCell>
                      <TableCell className="text-right">{r.baseHoliday}</TableCell>
                      <TableCell className="text-right font-semibold">{r.baseTotal}</TableCell>

                      <TableCell className="text-right">{r.periodNormal}</TableCell>
                      <TableCell className="text-right">{r.periodHoliday}</TableCell>
                      <TableCell className="text-right font-semibold">{r.periodTotal}</TableCell>

                      <TableCell className="text-right font-bold">{r.total}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Days since last duty */}
      <Card>
        <CardHeader>
          <CardTitle>Days since last duty</CardTitle>
        </CardHeader>
        <CardContent className="overflow-hidden">
          <div className="w-full">
            <div className="h-[260px] md:h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={daysSinceLastDutyDataForChart}>
                  <XAxis
                    dataKey="name"
                    interval={0}
                    angle={isMobile ? -25 : -35}
                    textAnchor="end"
                    height={isMobile ? 60 : 80}
                    fontSize={isMobile ? 10 : 12}
                  />
                  <YAxis width={isMobile ? 28 : 40} fontSize={12} />
                  <Tooltip
                    formatter={(value: any, _name: any, props: any) => {
                      const hasValue = props?.payload?.hasValue;
                      if (!hasValue) return ["Jamais", "Jours"];
                      return [value, "Jours"];
                    }}
                    labelFormatter={(_label: any, payload: any) =>
                      payload?.[0]?.payload?.fullName ?? _label
                    }
                  />
                  <Bar dataKey="days" fill="hsl(160, 60%, 45%)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {isMobile && daysSinceLastDutyData.length > CHART_MOBILE_LIMIT && (
            <div className="mt-2 text-xs text-muted-foreground">
              Affichage limité aux {CHART_MOBILE_LIMIT} premiers sur mobile.
            </div>
          )}

          <div className="text-xs text-muted-foreground mt-2">
            Grande barre = personne non planifiée depuis longtemps. “Jamais” est volontairement mis très haut.
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Days since last NORMAL duty</CardTitle>
        </CardHeader>
        <CardContent className="overflow-hidden">
          <div className="w-full">
            <div className="h-[260px] md:h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={daysSinceLastNormalDutyDataForChart}>
                  <XAxis
                    dataKey="name"
                    interval={0}
                    angle={isMobile ? -25 : -35}
                    textAnchor="end"
                    height={isMobile ? 60 : 80}
                    fontSize={isMobile ? 10 : 12}
                  />
                  <YAxis width={isMobile ? 28 : 40} fontSize={12} />
                  <Tooltip
                    formatter={(value: any, _name: any, props: any) => {
                      const hasValue = props?.payload?.hasValue;
                      if (!hasValue) return ["Jamais", "Jours"];
                      return [value, "Jours"];
                    }}
                    labelFormatter={(_label: any, payload: any) =>
                      payload?.[0]?.payload?.fullName ?? _label
                    }
                  />
                  <Bar dataKey="days" fill="#2563EB" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {isMobile && daysSinceLastNormalDutyData.length > CHART_MOBILE_LIMIT && (
            <div className="mt-2 text-xs text-muted-foreground">
              Affichage limité aux {CHART_MOBILE_LIMIT} premiers sur mobile.
            </div>
          )}

          <div className="text-xs text-muted-foreground mt-2">
            Grande barre = membre sans jour normal depuis longtemps.
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Days since last HOLIDAY duty</CardTitle>
        </CardHeader>
        <CardContent className="overflow-hidden">
          <div className="w-full">
            <div className="h-[260px] md:h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={daysSinceLastHolidayDutyDataForChart}>
                  <XAxis
                    dataKey="name"
                    interval={0}
                    angle={isMobile ? -25 : -35}
                    textAnchor="end"
                    height={isMobile ? 60 : 80}
                    fontSize={isMobile ? 10 : 12}
                  />
                  <YAxis width={isMobile ? 28 : 40} fontSize={12} />
                  <Tooltip
                    formatter={(value: any, _name: any, props: any) => {
                      const hasValue = props?.payload?.hasValue;
                      if (!hasValue) return ["Jamais", "Jours"];
                      return [value, "Jours"];
                    }}
                    labelFormatter={(_label: any, payload: any) =>
                      payload?.[0]?.payload?.fullName ?? _label
                    }
                  />
                  <Bar dataKey="days" fill="#F97316" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {isMobile && daysSinceLastHolidayDutyData.length > CHART_MOBILE_LIMIT && (
            <div className="mt-2 text-xs text-muted-foreground">
              Affichage limité aux {CHART_MOBILE_LIMIT} premiers sur mobile.
            </div>
          )}

          <div className="text-xs text-muted-foreground mt-2">
            Grande barre = membre sans jour férié depuis longtemps.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
