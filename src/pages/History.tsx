import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { Filter, RefreshCw, Search } from "lucide-react";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

import { differenceInCalendarDays, format } from "date-fns";

// ---------------- Types ----------------
type Member = {
  id: string;
  full_name: string;
};

type Duty = {
  duty_date: string; // YYYY-MM-DD
  duty_type?: string | null;
  team_member_id: string | null;
  team_member?: { id: string; full_name: string } | null;
};

const weekdayLabels = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"] as const;

// ---------------- Helpers ----------------
function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function shortName(full: string) {
  const parts = full.trim().split(/\s+/);
  return parts[0] || full;
}

function clampDateStr(d: string) {
  return (d || "").trim().slice(0, 10);
}

/**
 * DB stores date-only: "YYYY-MM-DD"
 * NEVER do new Date("YYYY-MM-DD") (timezone shift risk).
 */
function parseDateOnlyUTC(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
}

function isWeekendByDayIndex(utcDayIndex: number) {
  return utcDayIndex === 0 || utcDayIndex === 6;
}

function formatFrFromYYYYMMDD(dateStr: string) {
  const s = clampDateStr(dateStr);
  if (!s || s.length < 10) return "—";
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y}`;
}

const CHART_MOBILE_LIMIT = 10;
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

function limitForMobile<T>(
  arr: T[],
  isMobile: boolean,
  showAll: boolean,
  limit = CHART_MOBILE_LIMIT
) {
  if (!isMobile) return arr;
  return showAll ? arr : arr.slice(0, limit);
}
async function fetchAllDutiesPaged() {
  const pageSize = 1000;
  let from = 0;
  const all: any[] = [];

  while (true) {
    const { data, error } = await supabase
      .from("duty_entries")
      .select("duty_date, duty_type, team_member_id, team_member:team_members(id, full_name)")
      .order("duty_date", { ascending: true }) // important: stable paging
      .range(from, from + pageSize - 1);

    if (error) throw error;

    const batch = data ?? [];
    all.push(...batch);

    if (batch.length < pageSize) break; // last page
    from += pageSize;
  }

  return all as Duty[];
}
// ---------------- Component ----------------
export default function History() {
  const [loading, setLoading] = useState(true);
  const isMobile = useIsMobile();
  const [showAllChartsMobile, setShowAllChartsMobile] = useState(false);

  const [members, setMembers] = useState<Member[]>([]);
  const [duties, setDuties] = useState<Duty[]>([]);
  const [holidayDatesSet, setHolidayDatesSet] = useState<Set<string>>(new Set());

  // Filters
  const [filterOpen, setFilterOpen] = useState(false);
  const [memberSearch, setMemberSearch] = useState("");
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);

  const [periodFrom, setPeriodFrom] = useState<string>("");
  const [periodTo, setPeriodTo] = useState<string>("");

  // Search in tables
  const [q, setQ] = useState("");
  const [tableAsc, setTableAsc] = useState(false);

  /**
   * ✅ Weekend counted as holiday (same as Insights)
   * If you want weekend NOT holiday, set false.
   */
  const COUNT_WEEKEND_AS_HOLIDAY = true;

  const fetchAll = async () => {
    try {
      setLoading(true);

      // members
      const { data: membersData, error: membersErr } = await supabase
        .from("team_members")
        .select("id, full_name")
        .eq("active", true)
        .order("full_name", { ascending: true });

      if (membersErr) throw membersErr;

      // duties (PAGED)
const dutiesData = await fetchAllDutiesPaged();

      // holidays
      const { data: holidaysData, error: holidaysErr } = await supabase
        .from("holidays")
        .select("date");

      if (holidaysErr) throw holidaysErr;

      const m = (membersData as Member[]) || [];
      const d = (dutiesData as Duty[]) || [];

      setMembers(m);
      setDuties(d);
      console.log("DUTIES FETCHED:", d.length);

      // default selection: all members
      setSelectedMemberIds(m.map((x) => x.id));

      const holidaySet = new Set<string>(
        (holidaysData || [])
          .map((h: any) => clampDateStr(h?.date))
          .filter(Boolean)
      );
      setHolidayDatesSet(holidaySet);

      // default range = min/max duty_date
      const allDutyDates = d.map((x) => clampDateStr(x.duty_date)).filter(Boolean);
      const minD = allDutyDates.length
        ? allDutyDates.reduce((a, b) => (a < b ? a : b))
        : format(new Date(), "yyyy-MM-dd");
      const maxD = allDutyDates.length
        ? allDutyDates.reduce((a, b) => (a > b ? a : b))
        : format(new Date(), "yyyy-MM-dd");

      setPeriodFrom(minD);
      setPeriodTo(maxD);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // --- Filter duties by member selection
  const filteredByMembers = useMemo(() => {
    const allowAll = selectedMemberIds.length === 0;
    const set = new Set(selectedMemberIds);

    return duties.filter((d) => {
      if (!d.team_member_id) return false;
      if (allowAll) return true;
      return set.has(d.team_member_id);
    });
  }, [duties, selectedMemberIds]);

  // --- Filter duties by period (THIS is the main filter)
  const periodDuties = useMemo(() => {
    const from = clampDateStr(periodFrom);
    const to = clampDateStr(periodTo);
    if (!from || !to) return filteredByMembers;

    const a = from <= to ? from : to;
    const b = from <= to ? to : from;

    return filteredByMembers.filter((d) => {
      const ds = clampDateStr(d.duty_date);
      return ds >= a && ds <= b;
    });
  }, [filteredByMembers, periodFrom, periodTo]);

  // --- Build per-member worked-day lists + counts (NO solde here)
  const perMember = useMemo(() => {
    const allowAll = selectedMemberIds.length === 0;
    const selectedSet = new Set(selectedMemberIds);

    const map: Record<
      string,
      {
        memberId: string;
        name: string;
        // counts in period
        periodNormal: number;
        periodHoliday: number;
        periodTotal: number;
        // lists in period
        daysNormal: string[];
        daysHoliday: string[];
        daysAll: string[];
        // last in period
        lastDutyDateUTC: Date | null;
        lastNormalDutyDateUTC: Date | null;
      }
    > = {};

    for (const m of members) {
      if (!allowAll && !selectedSet.has(m.id)) continue;

      map[m.id] = {
        memberId: m.id,
        name: m.full_name,
        periodNormal: 0,
        periodHoliday: 0,
        periodTotal: 0,
        daysNormal: [],
        daysHoliday: [],
        daysAll: [],
        lastDutyDateUTC: null,
        lastNormalDutyDateUTC: null,
      };
    }

    for (const d of periodDuties) {
      const mid = d.team_member_id;
      if (!mid || !map[mid]) continue;

      const dayKey = clampDateStr(d.duty_date);
      if (!dayKey) continue;

      const dt = parseDateOnlyUTC(dayKey);
      const wd = dt.getUTCDay();
      const isWeekend = isWeekendByDayIndex(wd);

      const isOfficialHoliday = holidayDatesSet.has(dayKey);
      const isHoliday = COUNT_WEEKEND_AS_HOLIDAY
        ? isOfficialHoliday || isWeekend
        : isOfficialHoliday;

      map[mid].periodTotal += 1;
      map[mid].daysAll.push(dayKey);

      // last duty
      const prevLast = map[mid].lastDutyDateUTC;
      if (!prevLast || dt > prevLast) map[mid].lastDutyDateUTC = dt;

      if (isHoliday) {
        map[mid].periodHoliday += 1;
        map[mid].daysHoliday.push(dayKey);
      } else {
        map[mid].periodNormal += 1;
        map[mid].daysNormal.push(dayKey);

        // last normal duty
        const prevLastNormal = map[mid].lastNormalDutyDateUTC;
        if (!prevLastNormal || dt > prevLastNormal) map[mid].lastNormalDutyDateUTC = dt;
      }
    }

    // sort day lists ascending for display
    for (const k of Object.keys(map)) {
      map[k].daysAll.sort();
      map[k].daysNormal.sort();
      map[k].daysHoliday.sort();
    }

    return Object.values(map);
  }, [members, periodDuties, selectedMemberIds, holidayDatesSet]);

  // KPIs (period only)
  const kpis = useMemo(() => {
    const total = perMember.reduce((s, m) => s + m.periodTotal, 0);
    const normal = perMember.reduce((s, m) => s + m.periodNormal, 0);
    const holiday = perMember.reduce((s, m) => s + m.periodHoliday, 0);
    const avg = perMember.length ? total / perMember.length : 0;

    return {
      total,
      normal,
      holiday,
      avg: Math.round(avg * 10) / 10,
    };
  }, [perMember]);

  // Charts data
  const distributionData = useMemo(() => {
    return [...perMember]
      .map((m) => ({
        memberId: m.memberId,
        name: shortName(m.name),
        fullName: m.name,
        total: m.periodTotal,
      }))
      .sort((a, b) => b.total - a.total);
  }, [perMember]);

  const normalChartData = useMemo(() => {
    return [...perMember]
      .map((m) => ({
        memberId: m.memberId,
        name: shortName(m.name),
        fullName: m.name,
        count: m.periodNormal,
      }))
      .sort((a, b) => b.count - a.count);
  }, [perMember]);

  const holidayChartData = useMemo(() => {
    return [...perMember]
      .map((m) => ({
        memberId: m.memberId,
        name: shortName(m.name),
        fullName: m.name,
        count: m.periodHoliday,
      }))
      .sort((a, b) => b.count - a.count);
  }, [perMember]);

  // Days since (based on period last duty dates)
  const daysSinceLastDutyData = useMemo(() => {
    const now = new Date();
    return [...perMember]
      .map((m) => {
        const days =
          m.lastDutyDateUTC ? Math.max(0, differenceInCalendarDays(now, m.lastDutyDateUTC)) : null;
        return {
          memberId: m.memberId,
          name: shortName(m.name),
          fullName: m.name,
          days: days ?? 9999, // "Jamais" high bar
          hasValue: days !== null,
        };
      })
      .sort((a, b) => b.days - a.days);
  }, [perMember]);

  const daysSinceLastNormalDutyData = useMemo(() => {
    const now = new Date();
    return [...perMember]
      .map((m) => {
        const days =
          m.lastNormalDutyDateUTC
            ? Math.max(0, differenceInCalendarDays(now, m.lastNormalDutyDateUTC))
            : null;
        return {
          memberId: m.memberId,
          name: shortName(m.name),
          fullName: m.name,
          days: days ?? 9999,
          hasValue: days !== null,
        };
      })
      .sort((a, b) => b.days - a.days);
  }, [perMember]);

  // Mobile limited chart data
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
  const daysSinceLastDutyDataForChart = useMemo(
  () => limitForMobile(daysSinceLastDutyData, isMobile, showAllChartsMobile),
  [daysSinceLastDutyData, isMobile, showAllChartsMobile]
);
  const daysSinceLastNormalDutyDataForChart = useMemo(
  () => limitForMobile(daysSinceLastNormalDutyData, isMobile, showAllChartsMobile),
  [daysSinceLastNormalDutyData, isMobile, showAllChartsMobile]
);


  // Summary table rows (search + sort)
  const summaryRows = useMemo(() => {
    const s = q.trim().toLowerCase();
    const rows = perMember.filter((m) => m.name.toLowerCase().includes(s));
    rows.sort((a, b) =>
      tableAsc ? a.periodTotal - b.periodTotal : b.periodTotal - a.periodTotal
    );
    return rows;
  }, [perMember, q, tableAsc]);

  // For “list of days worked by person” – clean grouping
  const daysByMember = useMemo(() => {
    const map = new Map<string, { all: string[]; normal: Set<string>; holiday: Set<string> }>();
    perMember.forEach((m) => {
      map.set(m.memberId, {
        all: m.daysAll,
        normal: new Set(m.daysNormal),
        holiday: new Set(m.daysHoliday),
      });
    });
    return map;
  }, [perMember]);

  if (loading) return <Skeleton className="h-96 w-full" />;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div className="space-y-1">
          <div className="text-xl md:text-2xl font-bold">Historique — Permanences</div>
          <div className="text-sm text-muted-foreground">
            Vue “work-log” (période + membres) — <b>sans solde initial</b>.
          </div>

          <div className="flex flex-wrap gap-2 pt-2 md:hidden">
            <Badge variant="secondary">
              Période: {clampDateStr(periodFrom)} → {clampDateStr(periodTo)}
            </Badge>
            <Badge variant="outline">Membres: {selectedCountLabel}</Badge>
            <Badge variant="outline">Total: {kpis.total}</Badge>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={fetchAll}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Actualiser
          </Button>
        </div>
      </div>

      {/* Sticky filters */}
      <Card className="md:sticky md:top-2 z-10">
        <CardContent className="py-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={selectAll}
              className="underline underline-offset-4"
            >
              Tout sélectionner
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={clearAll}
              className="underline underline-offset-4"
            >
              Tout désélectionner
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setFilterOpen((v) => !v)}
            >
              <Filter className="h-4 w-4 mr-2" />
              {filterOpen ? "Fermer" : "Choisir des membres"}
            </Button>

            {/* Date range */}
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1">
                <div className="text-[11px] text-muted-foreground">Du</div>
                <Input
                  type="date"
                  value={periodFrom}
                  onChange={(e) => setPeriodFrom(e.target.value)}
                  className="w-[160px]"
                />
              </div>

              <div className="space-y-1">
                <div className="text-[11px] text-muted-foreground">Au</div>
                <Input
                  type="date"
                  value={periodTo}
                  onChange={(e) => setPeriodTo(e.target.value)}
                  className="w-[160px]"
                />
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const allDutyDates = duties
                    .map((x) => clampDateStr(x.duty_date))
                    .filter(Boolean);

                  const minD = allDutyDates.length
                    ? allDutyDates.reduce((a, b) => (a < b ? a : b))
                    : format(new Date(), "yyyy-MM-dd");

                  const maxD = allDutyDates.length
                    ? allDutyDates.reduce((a, b) => (a > b ? a : b))
                    : format(new Date(), "yyyy-MM-dd");

                  setPeriodFrom(minD);
                  setPeriodTo(maxD);
                }}
              >
                Reset
              </Button>
            </div>

            <div className="ml-auto flex flex-wrap gap-2">
              <Badge variant="secondary">Normal: {kpis.normal}</Badge>
              <Badge variant="secondary">Férié: {kpis.holiday}</Badge>
              <Badge variant="secondary">Total: {kpis.total}</Badge>
            </div>
          </div>

          {/* Members picker */}
          {filterOpen && (
            <div className="mt-4 border rounded-lg p-3">
              <div className="relative w-full">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  placeholder="Rechercher un membre..."
                  className="pl-9"
                />
              </div>

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
                Astuce: laisse vide (0 sélection) pour “tous les membres”.
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* KPI Cards */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <Card>
          <CardContent className="py-4 md:py-5">
            <div className="text-sm text-muted-foreground">Total (période)</div>
            <div className="text-2xl md:text-3xl font-bold mt-1 tabular-nums">{kpis.total}</div>
            <div className="text-xs text-muted-foreground mt-1">
              {clampDateStr(periodFrom)} → {clampDateStr(periodTo)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-4 md:py-5">
            <div className="text-sm text-muted-foreground">Jours normaux</div>
            <div className="text-2xl md:text-3xl font-bold mt-1 tabular-nums">{kpis.normal}</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-4 md:py-5">
            <div className="text-sm text-muted-foreground">Jours fériés</div>
            <div className="text-2xl md:text-3xl font-bold mt-1 tabular-nums">{kpis.holiday}</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-4 md:py-5">
            <div className="text-sm text-muted-foreground">Moyenne / membre</div>
            <div className="text-2xl md:text-3xl font-bold mt-1 tabular-nums">{kpis.avg}</div>
            <div className="text-xs text-muted-foreground mt-1">sur la période</div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Répartition par membre — Total (période)</CardTitle>
          </CardHeader>
          <CardContent className="overflow-hidden">
            <div className="overflow-x-auto">
  <div style={{ minWidth: isMobile && showAllChartsMobile ? distributionDataForChart.length * 60 : 0 }}>
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
                    formatter={(value: any) => [`${value}`, "Total (période)"]}
                    labelFormatter={(_label: any, payload: any) =>
                      payload?.[0]?.payload?.fullName ?? _label
                    }
                  />
                  <Bar dataKey="total" fill="hsl(173, 58%, 39%)" radius={[6, 6, 0, 0]} />
                </BarChart>
      </ResponsiveContainer>
    </div>
  </div>
</div>

            {isMobile && distributionData.length > CHART_MOBILE_LIMIT && (
  <div className="mt-2 flex items-center justify-between gap-2">
    <div className="text-xs text-muted-foreground">
      {showAllChartsMobile
        ? `Affichage complet (${distributionData.length}).`
        : `Affichage limité aux ${CHART_MOBILE_LIMIT} premiers.`}
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Comparatif — Jours normaux (période)</CardTitle>
          </CardHeader>
          <CardContent className="overflow-hidden">
            <div className="overflow-x-auto">
  <div style={{ minWidth: isMobile && showAllChartsMobile ? normalChartData.length * 60 : 0 }}>
    <div className="h-[260px] md:h-[320px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={normalChartData}>
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
                    formatter={(value: any) => [`${value}`, "Jours normaux"]}
                    labelFormatter={(_label: any, payload: any) =>
                      payload?.[0]?.payload?.fullName ?? _label
                    }
                  />
                  <Bar dataKey="count" fill="#2563EB" radius={[6, 6, 0, 0]} />
                </BarChart>
      </ResponsiveContainer>
    </div>
  </div>
</div>

            {isMobile && normalChartData.length > CHART_MOBILE_LIMIT && (
  <div className="mt-2 flex items-center justify-between gap-2">
    <div className="text-xs text-muted-foreground">
      {showAllChartsMobile
        ? `Affichage complet (${normalChartData.length}).`
        : `Affichage limité aux ${CHART_MOBILE_LIMIT} premiers.`}
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Comparatif — Jours fériés (période)</CardTitle>
          </CardHeader>
          <CardContent className="overflow-hidden">
            <div className="overflow-x-auto">
  <div style={{ minWidth: isMobile && showAllChartsMobile ? holidayChartData.length * 60 : 0 }}>
    <div className="h-[260px] md:h-[320px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={holidayChartData}>
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
                    formatter={(value: any) => [`${value}`, "Jours fériés"]}
                    labelFormatter={(_label: any, payload: any) =>
                      payload?.[0]?.payload?.fullName ?? _label
                    }
                  />
                  <Bar dataKey="count" fill="#F97316" radius={[6, 6, 0, 0]} />
                </BarChart>
      </ResponsiveContainer>
    </div>
  </div>
</div>

            {isMobile && holidayChartData.length > CHART_MOBILE_LIMIT && (
  <div className="mt-2 flex items-center justify-between gap-2">
    <div className="text-xs text-muted-foreground">
      {showAllChartsMobile
        ? `Affichage complet (${holidayChartData.length}).`
        : `Affichage limité aux ${CHART_MOBILE_LIMIT} premiers.`}
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Days since last duty</CardTitle>
          </CardHeader>
          <CardContent className="overflow-hidden">
            <div className="overflow-x-auto">
  <div style={{ minWidth: isMobile && showAllChartsMobile ? daysSinceLastDutyData.length * 60 : 0 }}>
    <div className="h-[260px] md:h-[320px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={daysSinceLastDutyData}>
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
</div>

            <div className="text-xs text-muted-foreground mt-2">
              “Jamais” = aucune permanence trouvée dans la période filtrée.
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Days since last NORMAL duty</CardTitle>
          </CardHeader>
          <CardContent className="overflow-hidden">
            <div className="overflow-x-auto">
  <div style={{ minWidth: isMobile && showAllChartsMobile ? daysSinceLastNormalDutyData.length * 60 : 0 }}>
    <div className="h-[260px] md:h-[320px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={daysSinceLastNormalDutyData}>
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
</div>
          </CardContent>
        </Card>
      </div>

      {/* Summary table */}
      <Card>
        <CardHeader>
          <CardTitle>Résumé — Par membre</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col md:flex-row md:items-center gap-3">
            <div className="relative w-full md:w-96">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Chercher un membre..."
                className="pl-9"
              />
            </div>

            <Button
              type="button"
              variant="outline"
              onClick={() => setTableAsc((v) => !v)}
            >
              Tri: {tableAsc ? "Croissant" : "Décroissant"}
            </Button>

            <div className="text-sm text-muted-foreground">
              (Tri basé sur Total période)
            </div>
          </div>

          <div className="w-full rounded-xl border bg-background overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Membre</TableHead>
                  <TableHead className="text-right">Normal</TableHead>
                  <TableHead className="text-right">Férié</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Dernière permanence</TableHead>
                  <TableHead className="text-right">Dernier normal</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {summaryRows.map((m) => {
                  const last = m.lastDutyDateUTC ? formatFrFromYYYYMMDD(format(m.lastDutyDateUTC, "yyyy-MM-dd")) : "—";
                  const lastN = m.lastNormalDutyDateUTC
                    ? formatFrFromYYYYMMDD(format(m.lastNormalDutyDateUTC, "yyyy-MM-dd"))
                    : "—";

                  return (
                    <TableRow key={m.memberId} className="hover:bg-muted/50">
                      <TableCell className="font-medium">{m.name}</TableCell>
                      <TableCell className="text-right">{m.periodNormal}</TableCell>
                      <TableCell className="text-right">{m.periodHoliday}</TableCell>
                      <TableCell className="text-right font-bold">{m.periodTotal}</TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">{last}</TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">{lastN}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            {summaryRows.length === 0 && (
              <div className="p-6 text-sm text-muted-foreground">Aucun résultat.</div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Worked days per member (the important “list of days”) */}
      <Card>
        <CardHeader>
          <CardTitle>Jours travaillés — Détails par membre</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-sm text-muted-foreground">
            Clique un membre pour voir la liste des jours (Normal/Férié) sur la période filtrée.
          </div>

          <div className="space-y-3">
            {summaryRows.map((m) => {
              const pack = daysByMember.get(m.memberId);
              const all = pack?.all || [];
              const normalSet = pack?.normal || new Set<string>();
              const holidaySet = pack?.holiday || new Set<string>();

              return (
                <details key={m.memberId} className="rounded-xl border bg-background p-3">
                  <summary className="cursor-pointer list-none">
                    <div className="flex flex-wrap items-center gap-2 justify-between">
                      <div className="min-w-0">
                        <div className="font-semibold truncate">{m.name}</div>
                        <div className="text-xs text-muted-foreground">
                          Normal: {m.periodNormal} • Férié: {m.periodHoliday} • Total: {m.periodTotal}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">{m.periodTotal}</Badge>
                        <span className="text-xs text-muted-foreground">ouvrir</span>
                      </div>
                    </div>
                  </summary>

                  <div className="mt-3 border-t pt-3">
                    {all.length === 0 ? (
                      <div className="text-sm text-muted-foreground">Aucun jour sur la période.</div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {all.map((day) => {
                          const isHoliday = holidaySet.has(day);
                          const isNormal = normalSet.has(day);

                          return (
                            <span
                              key={day}
                              className={cn(
                                "px-2 py-1 rounded-md border text-xs tabular-nums",
                                isHoliday && "bg-orange-50 border-orange-200",
                                isNormal && "bg-blue-50 border-blue-200"
                              )}
                              title={isHoliday ? "Férié" : "Normal"}
                            >
                              {formatFrFromYYYYMMDD(day)}{" "}
                              <span className="text-[10px] text-muted-foreground">
                                ({isHoliday ? "Férié" : "Normal"})
                              </span>
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </details>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
