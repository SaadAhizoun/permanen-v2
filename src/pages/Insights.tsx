import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { fr } from '@/lib/i18n';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { format, subMonths, differenceInCalendarDays } from 'date-fns';
import { fr as frLocale } from 'date-fns/locale';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Download, FileSpreadsheet, FileText } from 'lucide-react';

import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import html2canvas from 'html2canvas';

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

const weekdayLabels = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'] as const;

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

function shortName(full: string) {
  const parts = full.trim().split(/\s+/);
  return parts[0] || full;
}

/**
 * ✅ DB stores date-only: "YYYY-MM-DD"
 * We must NEVER do new Date("YYYY-MM-DD") because it can shift day by timezone.
 */
function parseDateOnlyUTC(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
}

function isWeekendByDayIndex(utcDayIndex: number) {
  return utcDayIndex === 0 || utcDayIndex === 6;
}

function clampDateStr(d: string) {
  return (d || '').trim().slice(0, 10);
}

export default function Insights() {
  const [loading, setLoading] = useState(true);

  const [members, setMembers] = useState<Member[]>([]);
  const [duties, setDuties] = useState<Duty[]>([]);
  const [holidayDatesSet, setHolidayDatesSet] = useState<Set<string>>(new Set());

  // Filters (UI)
  const [filterOpen, setFilterOpen] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [tableSearch, setTableSearch] = useState('');
  const [matrixSearch, setMatrixSearch] = useState('');
  const [matrixOnlyActive, setMatrixOnlyActive] = useState(false);
  const [tableAsc, setTableAsc] = useState(true);

  // Export dialog filters
  const [exportOpen, setExportOpen] = useState(false);
  const [exportFrom, setExportFrom] = useState<string>(''); // YYYY-MM-DD
  const [exportTo, setExportTo] = useState<string>('');     // YYYY-MM-DD
  const [exportIncludeRaw, setExportIncludeRaw] = useState(true);
  const [exportIncludeMatrix, setExportIncludeMatrix] = useState(true);
  const [exportIncludeCharts, setExportIncludeCharts] = useState(true);

  // Refs for chart capture (PDF)
  const refChartTotal = useRef<HTMLDivElement | null>(null);
  const refChartNormal = useRef<HTMLDivElement | null>(null);
  const refChartHoliday = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);

      const now = new Date();
      const sixMonthsAgo = subMonths(now, 6);
      // const sixMonthsStr = format(sixMonthsAgo, 'yyyy-MM-dd'); // (optionnel)

      const { data: membersData, error: membersErr } = await supabase
        .from('team_members')
        .select('id, full_name, initial_credit_normal, initial_credit_holiday')
        .eq('active', true)
        .order('full_name', { ascending: true });

      if (membersErr) throw membersErr;

      const { data: dutiesData, error: dutiesErr } = await supabase
        .from('duty_entries')
        .select('duty_date, duty_type, team_member_id, team_member:team_members(id, full_name)');

      if (dutiesErr) throw dutiesErr;

      const { data: holidaysData, error: holidaysErr } = await supabase
        .from('holidays')
        .select('date');

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
      const allIds = m.map((x) => x.id);
      setSelectedMemberIds(allIds);

      // default export range = min/max duty_date we have
      const allDutyDates = d.map((x) => clampDateStr(x.duty_date)).filter(Boolean);
      const minD = allDutyDates.length
        ? allDutyDates.reduce((a, b) => (a < b ? a : b))
        : format(new Date(), 'yyyy-MM-dd');

      const maxD = allDutyDates.length
        ? allDutyDates.reduce((a, b) => (a > b ? a : b))
        : format(now, 'yyyy-MM-dd');

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
   * ✅ IMPORTANT:
   * If you want WEEKEND to be counted as "Férié" too:
   * keep this = true
   */
  const COUNT_WEEKEND_AS_HOLIDAY = true;

  /**
   * ✅ NEW: stats richer
   * - base* = solde initial
   * - period* = permanences sur la période
   * - normal/holiday/total = base + period (donc "totalité")
   */
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

        normal: number;  // base + period
        holiday: number; // base + period
        total: number;   // base + period

        weekend: number;
        weekday: number;
      }
    > = {};

    // init with base credits (solde)
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

        weekend: 0,
        weekday: 0,
      };
    }

    // add duties from export period
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
        ? (isOfficialHoliday || isWeekend)
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

      if (isWeekend) stats[mid].weekend += 1;
      else stats[mid].weekday += 1;
    }

    return Object.values(stats);
  }, [exportDuties, members, selectedMemberIds, holidayDatesSet]);

  // ✅ KPIs reflect "totalité" (solde + période)
  const kpis = useMemo(() => {
    const total = perMemberStats.reduce((s, m) => s + m.total, 0);
    const holiday = perMemberStats.reduce((s, m) => s + m.holiday, 0);
    const normal = perMemberStats.reduce((s, m) => s + m.normal, 0);
    const weekend = perMemberStats.reduce((s, m) => s + m.weekend, 0);
    const avg = perMemberStats.length ? total / perMemberStats.length : 0;

    // bonus: visibles dans UI si tu veux
    const baseTotal = perMemberStats.reduce((s, m) => s + m.baseTotal, 0);
    const periodTotal = perMemberStats.reduce((s, m) => s + m.periodTotal, 0);

    return {
      total,
      normal,
      holiday,
      weekend,
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
        total: m.total, // ✅ total global (solde + période)
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
        count: m.normal, // ✅ normal global
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
        count: m.holiday, // ✅ férié global
        base: m.baseHoliday,
        period: m.periodHoliday,
      }))
      .sort((a, b) => b.count - a.count);
  }, [perMemberStats]);

  const top3Most = useMemo(() => {
    return [...perMemberStats].sort((a, b) => b.total - a.total).slice(0, 3);
  }, [perMemberStats]);

  const top3Least = useMemo(() => {
    return [...perMemberStats].sort((a, b) => a.total - b.total).slice(0, 3);
  }, [perMemberStats]);

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
    if (fairnessGap <= 2) return { label: 'Équitable', cls: 'bg-green-600 text-white' };
    if (fairnessGap <= 5) return { label: 'Moyen', cls: 'bg-yellow-500 text-white' };
    return { label: 'Déséquilibré', cls: 'bg-red-600 text-white' };
  }, [fairnessGap]);

  const totalsTableRows = useMemo(() => {
    const rows = [...perMemberStats].filter((r) =>
      r.name.toLowerCase().includes(tableSearch.toLowerCase())
    );
    rows.sort((a, b) => (tableAsc ? a.total - b.total : b.total - a.total));
    return rows;
  }, [perMemberStats, tableSearch, tableAsc]);

  /**
   * ✅ NEW: weekday matrix includes solde columns
   * we show:
   * - Solde N/F/T
   * - counts per weekday (period only)
   * - Total période
   * - Total global (solde + période)
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
      soldeNormal: number;
      soldeHoliday: number;
      soldeTotal: number;
      counts: number[];     // period counts per weekday
      periodTotal: number;  // sum(counts)
      totalGlobal: number;  // solde + period
    }> = [];

    for (const m of members) {
      if (!allowAll && !selectedSet.has(m.id)) continue;
      const base = baseById.get(m.id) || { baseNormal: 0, baseHoliday: 0, baseTotal: 0, totalGlobal: 0 };
      matrix.push({
        memberId: m.id,
        name: m.full_name,
        soldeNormal: base.baseNormal,
        soldeHoliday: base.baseHoliday,
        soldeTotal: base.baseTotal,
        counts: Array(7).fill(0),
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
      matrix[idx].counts[dt.getUTCDay()] += 1;
    }

    for (const row of matrix) {
      row.periodTotal = row.counts.reduce((s, x) => s + x, 0);
    }

    // sort by totalGlobal desc (nice)
    matrix.sort((a, b) => b.totalGlobal - a.totalGlobal);

    return matrix;
  }, [exportDuties, members, selectedMemberIds, perMemberStats]);

  // ---- Days since last duty (3 graphs) ----
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
      const isHoliday = COUNT_WEEKEND_AS_HOLIDAY ? (isOfficialHoliday || isWeekend) : isOfficialHoliday;

      if (isHoliday) return; // only normal

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
      const isHoliday = COUNT_WEEKEND_AS_HOLIDAY ? (isOfficialHoliday || isWeekend) : isOfficialHoliday;

      if (!isHoliday) return; // only holiday

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

  const recommendations = useMemo(() => {
    if (perMemberStats.length === 0) return [];
    const avg = fairness.avg || 0;
    const sorted = [...perMemberStats].sort((a, b) => a.total - b.total);

    const least = sorted.slice(0, 3);
    const most = [...sorted].reverse().slice(0, 3);

    const recs: string[] = [];

    if (fairnessGap >= 6)
      recs.push(`Déséquilibre important : écart de ${fairnessGap}. Priorise les membres les moins chargés.`);
    else
      recs.push(`Équilibre correct : écart de ${fairnessGap}. Continue sur la même logique.`);

    recs.push(`Prochaine rotation suggérée (moins chargés) : ${least.map((m) => shortName(m.name)).join(', ')}.`);
    if (most[0]?.total >= avg + 3)
      recs.push(`Réduire la charge de : ${most.map((m) => shortName(m.name)).join(', ')} (au-dessus de la moyenne).`);

    // ✅ bonus: transparence solde vs période
    recs.push(`Total global = Solde initial + Permanences sur période.`);
    recs.push(`Solde total (tous membres): ${kpis.baseTotal} • Période: ${kpis.periodTotal}.`);

    return recs;
  }, [perMemberStats, fairness.avg, fairnessGap, kpis.baseTotal, kpis.periodTotal]);

  // -----------------------
  // EXPORTS
  // -----------------------
  const reportTitle = `Rapport Permanences — ${clampDateStr(exportFrom) || '…'} → ${clampDateStr(exportTo) || '…'}`;

  const exportExcel = () => {
    const wb = XLSX.utils.book_new();
    const generatedAt = format(new Date(), 'dd/MM/yyyy HH:mm', { locale: frLocale });

    // SHEET 1: Résumé
    const summaryRows = [
      ['RAPPORT PERMANENCES'],
      ['Période', `${clampDateStr(exportFrom) || '…'} → ${clampDateStr(exportTo) || '…'}`],
      ['Généré le', generatedAt],
      ['Membres inclus', selectedCountLabel],
      [],
      ['INDICATEURS (Totalité = Solde + Période)'],
      ['Total global', kpis.total],
      ['Normal global', kpis.normal],
      ['Férié global', kpis.holiday],
      ['Week-end (période)', kpis.weekend],
      ['Moyenne / membre', kpis.avg],
      [],
      ['DÉCOMPOSITION'],
      ['Solde total', kpis.baseTotal],
      ['Permanences période', kpis.periodTotal],
      [],
      ['RECOMMANDATIONS'],
      ...recommendations.map((r) => [r]),
    ];

    const ws1 = XLSX.utils.aoa_to_sheet(summaryRows);
    ws1['!cols'] = [{ wch: 28 }, { wch: 80 }];
    ws1['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }];
    XLSX.utils.book_append_sheet(wb, ws1, 'Résumé');

    // SHEET 2: Totaux (avec solde + période)
    const totalsHeader = [[
      'Membre',
      'Solde Normal',
      'Solde Férié',
      'Solde Total',
      'Période Normal',
      'Période Férié',
      'Période Total',
      'Total Global',
      'Week-end (période)',
      'Semaine (période)',
    ]];

    const totalsRows = perMemberStats.map((m) => [
      m.name,
      m.baseNormal,
      m.baseHoliday,
      m.baseTotal,
      m.periodNormal,
      m.periodHoliday,
      m.periodTotal,
      m.total,
      m.weekend,
      m.weekday,
    ]);

    const ws2 = XLSX.utils.aoa_to_sheet([...totalsHeader, ...totalsRows]);
    ws2['!cols'] = [
      { wch: 28 },
      { wch: 12 },
      { wch: 12 },
      { wch: 12 },
      { wch: 14 },
      { wch: 14 },
      { wch: 12 },
      { wch: 12 },
      { wch: 16 },
      { wch: 16 },
    ];
    XLSX.utils.book_append_sheet(wb, ws2, 'Totaux');

    // SHEET 3: Matrice (avec solde)
    if (exportIncludeMatrix) {
      const matrixHeader = [[
        'Membre',
        'Solde N',
        'Solde F',
        'Solde T',
        ...weekdayLabels,
        'Total période',
        'Total global',
      ]];

      const matrixRows = weekdayMatrix.map((row) => ([
        row.name,
        row.soldeNormal,
        row.soldeHoliday,
        row.soldeTotal,
        ...row.counts,
        row.periodTotal,
        row.totalGlobal,
      ]));

      const ws3 = XLSX.utils.aoa_to_sheet([...matrixHeader, ...matrixRows]);
      ws3['!cols'] = [{ wch: 28 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, ...Array(7).fill({ wch: 8 }), { wch: 12 }, { wch: 12 }];
      XLSX.utils.book_append_sheet(wb, ws3, 'Matrice');
    }

    // SHEET 4: Données brutes
    if (exportIncludeRaw) {
      const rawHeader = [['Date', 'Jour', 'Membre', 'Type', 'Férié?', 'Week-end?']];

      const rawRows = exportDuties
        .map((d) => {
          const dayKey = clampDateStr(d.duty_date);
          const dt = parseDateOnlyUTC(dayKey);
          const wd = dt.getUTCDay();
          const weekend = isWeekendByDayIndex(wd);

          const officialHoliday = holidayDatesSet.has(dayKey);
          const holiday = COUNT_WEEKEND_AS_HOLIDAY ? (officialHoliday || weekend) : officialHoliday;

          const name = d.team_member?.full_name || d.team_member_id || '—';
          return [
            dayKey,
            weekdayLabels[wd],
            name,
            d.duty_type ?? '—',
            holiday ? 'Oui' : 'Non',
            weekend ? 'Oui' : 'Non',
          ];
        })
        .sort((a, b) => String(a[0]).localeCompare(String(b[0])));

      const ws4 = XLSX.utils.aoa_to_sheet([...rawHeader, ...rawRows]);
      ws4['!cols'] = [
        { wch: 12 },
        { wch: 8 },
        { wch: 32 },
        { wch: 14 },
        { wch: 10 },
        { wch: 12 },
      ];
      XLSX.utils.book_append_sheet(wb, ws4, 'Données');
    }

    XLSX.writeFile(wb, `${reportTitle}.xlsx`);
  };

  async function captureNode(node: HTMLElement | null) {
    if (!node) return null;
    const canvas = await html2canvas(node, { scale: 2, backgroundColor: '#ffffff' });
    return canvas.toDataURL('image/png');
  }

  const exportPDF = async () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    const W = doc.internal.pageSize.getWidth();
    const margin = 44;

    const sectionTitle = (txt: string, y: number) => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.text(txt, margin, y);
      doc.setDrawColor(220);
      doc.line(margin, y + 6, W - margin, y + 6);
    };

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text('Rapport Permanences', margin, 56);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.text(
      `${clampDateStr(exportFrom) || '…'} → ${clampDateStr(exportTo) || '…'}   •   Généré le ${format(new Date(), 'dd/MM/yyyy HH:mm', { locale: frLocale })}`,
      margin,
      76
    );

    const kpiY = 100;
    const boxW = (W - margin * 2 - 18 * 3) / 4;
    const boxH = 66;

    const kpiBoxes = [
      { label: 'Total global', value: String(kpis.total) },
      { label: 'Solde total', value: String(kpis.baseTotal) },
      { label: 'Période', value: String(kpis.periodTotal) },
      { label: 'Week-end (période)', value: String(kpis.weekend) },
    ];

    kpiBoxes.forEach((b, i) => {
      const x = margin + i * (boxW + 18);
      doc.setDrawColor(220);
      doc.roundedRect(x, kpiY, boxW, boxH, 10, 10);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text(b.label, x + 14, kpiY + 22);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(22);
      doc.texttxt(doc, b.value, x + 14, kpiY + 52);
    });

    // helper to avoid ts issues in some setups
    function docTxt(d: jsPDF, text: string, x: number, y: number) {
      d.text(text, x, y);
    }
    // fix: replace doc.text call above
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const docT = docTxt;

    // quick patch: re-render KPI values safely
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    kpiBoxes.forEach((b, i) => {
      const x = margin + i * (boxW + 18);
      doc.text(String(b.value), x + 14, kpiY + 52);
    });

    let cursorY = kpiY + boxH + 18;

    sectionTitle('Recommandations', cursorY + 10);
    cursorY += 28;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    const recText = recommendations.length ? recommendations : ['—'];
    let yRec = cursorY;

    recText.slice(0, 8).forEach((r) => {
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
          doc.addImage(img, 'PNG', x + 8, cursorY + 8, imgW - 16, imgH - 16);
        });
        cursorY += imgH + 18;
      }
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('Totaux (Solde + Période)', margin, cursorY + 14);
    cursorY += 24;

    autoTable(doc, {
      startY: cursorY,
      head: [[
        'Membre',
        'Solde N',
        'Solde F',
        'Solde T',
        'Période N',
        'Période F',
        'Période T',
        'Total global',
      ]],
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
      styles: { font: 'helvetica', fontSize: 9, cellPadding: 6, lineWidth: 0.5, lineColor: 220 },
      headStyles: { fillColor: [30, 30, 30], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 248, 248] },
      margin: { left: margin, right: margin },
    });

    if (exportIncludeMatrix) {
      doc.addPage();
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.text('Matrice — Membre × Jour de semaine (avec solde)', margin, 56);

      autoTable(doc, {
        startY: 76,
        head: [[
          'Membre',
          'Solde N',
          'Solde F',
          'Solde T',
          ...weekdayLabels,
          'Total période',
          'Total global',
        ]],
        body: weekdayMatrix.map((row) => ([
          row.name,
          row.soldeNormal,
          row.soldeHoliday,
          row.soldeTotal,
          ...row.counts,
          row.periodTotal,
          row.totalGlobal,
        ])),
        styles: { font: 'helvetica', fontSize: 9, cellPadding: 6, lineWidth: 0.5, lineColor: 220 },
        headStyles: { fillColor: [30, 30, 30], textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [248, 248, 248] },
        margin: { left: margin, right: margin },
      });
    }

    if (exportIncludeRaw) {
      doc.addPage();
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.text('Données — Permanences', margin, 56);

      const rawRows = exportDuties
        .map((d) => {
          const dayKey = clampDateStr(d.duty_date);
          const dt = parseDateOnlyUTC(dayKey);
          const wd = dt.getUTCDay();
          const isWeekend = isWeekendByDayIndex(wd);

          const isOfficialHoliday = holidayDatesSet.has(dayKey);
          const isHoliday = COUNT_WEEKEND_AS_HOLIDAY ? (isOfficialHoliday || isWeekend) : isOfficialHoliday;

          const name = d.team_member?.full_name || d.team_member_id || '—';
          return [
            dayKey,
            weekdayLabels[wd],
            name,
            d.duty_type ?? '—',
            isHoliday ? 'Oui' : 'Non',
            isWeekend ? 'Oui' : 'Non',
          ];
        })
        .sort((a, b) => String(a[0]).localeCompare(String(b[0])));

      autoTable(doc, {
        startY: 76,
        head: [['Date', 'Jour', 'Membre', 'Type', 'Férié?', 'Week-end?']],
        body: rawRows,
        styles: { font: 'helvetica', fontSize: 9, cellPadding: 6, lineWidth: 0.5, lineColor: 220 },
        headStyles: { fillColor: [30, 30, 30], textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [248, 248, 248] },
        margin: { left: margin, right: margin },
      });
    }

    doc.save(`${reportTitle}.pdf`);
  };

  if (loading) return <Skeleton className="h-96 w-full" />;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-2xl font-bold">Aide à la décision</div>
          <div className="text-sm text-muted-foreground">
            Lecture rapide + filtres + indicateurs (Totalité = Solde + Période).
          </div>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <Badge variant="secondary">Période: {clampDateStr(exportFrom)} → {clampDateStr(exportTo)}</Badge>
          <Badge variant="outline">Membres: {selectedCountLabel}</Badge>
          <Badge variant="outline">Total global: {kpis.total}</Badge>
          <Badge variant="outline">Solde: {kpis.baseTotal}</Badge>
          <Badge variant="outline">Période: {kpis.periodTotal}</Badge>

          <Dialog open={exportOpen} onOpenChange={setExportOpen}>
            <DialogTrigger asChild>
              <Button variant="default" className="ml-2">
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-xl">
              <DialogHeader>
                <DialogTitle>Exporter un rapport</DialogTitle>
              </DialogHeader>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <div className="text-sm font-medium">Du</div>
                    <Input value={exportFrom} onChange={(e) => setExportFrom(e.target.value)} placeholder="YYYY-MM-DD" />
                  </div>
                  <div className="space-y-1">
                    <div className="text-sm font-medium">Au</div>
                    <Input value={exportTo} onChange={(e) => setExportTo(e.target.value)} placeholder="YYYY-MM-DD" />
                  </div>
                </div>

                <div className="rounded-lg border p-3 space-y-2">
                  <div className="text-sm font-medium">Inclure</div>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={exportIncludeCharts} onChange={(e) => setExportIncludeCharts(e.target.checked)} />
                    Graphiques (PDF)
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={exportIncludeMatrix} onChange={(e) => setExportIncludeMatrix(e.target.checked)} />
                    Matrice (Excel + PDF)
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={exportIncludeRaw} onChange={(e) => setExportIncludeRaw(e.target.checked)} />
                    Données brutes (Excel + PDF)
                  </label>
                  <div className="text-xs text-muted-foreground">
                    Le rapport exporte exactement ce que tu vois (membres filtrés + période).
                  </div>
                </div>
              </div>

              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setExportOpen(false)}>Fermer</Button>
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

      {/* Sticky filters */}
      <Card className="sticky top-2 z-10">
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
              {filterOpen ? 'Fermer' : 'Choisir des membres'}
            </button>

            <div className="ml-auto flex gap-2">
              <Badge variant="secondary">Normal global: {kpis.normal}</Badge>
              <Badge variant="secondary">Férié global: {kpis.holiday}</Badge>
              <Badge variant="secondary">Week-end (période): {kpis.weekend}</Badge>
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
                  .filter((m) => m.full_name.toLowerCase().includes(memberSearch.toLowerCase()))
                  .map((m) => {
                    const checked = selectedMemberIds.includes(m.id);
                    return (
                      <label
                        key={m.id}
                        className="flex items-center gap-2 text-sm border rounded-md px-2 py-2 cursor-pointer hover:bg-muted"
                      >
                        <input type="checkbox" checked={checked} onChange={() => toggleMember(m.id)} />
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
      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardContent className="py-5"><div className="text-sm text-muted-foreground">Total global</div><div className="text-3xl font-bold mt-1">{kpis.total}</div><div className="text-xs text-muted-foreground mt-1">Solde + Période</div></CardContent></Card>
        <Card><CardContent className="py-5"><div className="text-sm text-muted-foreground">Solde total</div><div className="text-3xl font-bold mt-1">{kpis.baseTotal}</div><div className="text-xs text-muted-foreground mt-1">Crédits initiaux</div></CardContent></Card>
        <Card><CardContent className="py-5"><div className="text-sm text-muted-foreground">Période</div><div className="text-3xl font-bold mt-1">{kpis.periodTotal}</div><div className="text-xs text-muted-foreground mt-1">Permanences période</div></CardContent></Card>
        <Card><CardContent className="py-5"><div className="text-sm text-muted-foreground">Moyenne / membre</div><div className="text-3xl font-bold mt-1">{kpis.avg}</div><div className="text-xs text-muted-foreground mt-1">Total global</div></CardContent></Card>
      </div>

      {/* Distribution + fairness */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Répartition par membre (Total global)</CardTitle>
          </CardHeader>

          <CardContent>
            <div className="w-full overflow-x-auto" ref={refChartTotal}>
              <div className="min-w-[1400px] h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={distributionData}>
                    <XAxis dataKey="name" interval={0} angle={-35} textAnchor="end" height={80} fontSize={12} />
                    <YAxis fontSize={12} />
                    <Tooltip
                      formatter={(value: any, _n: any, props: any) => {
                        const p = props?.payload;
                        if (!p) return [value, 'Total global'];
                        return [`${value} (Solde ${p.baseTotal} + Période ${p.periodTotal})`, 'Total global'];
                      }}
                      labelFormatter={(_label: any, payload: any) => payload?.[0]?.payload?.fullName ?? _label}
                    />
                    <Bar dataKey="total" fill="hsl(173, 58%, 39%)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <div className="rounded-lg border p-3">
                <div className="font-semibold mb-2">Top 3 (le plus)</div>
                <div className="space-y-2">
                  {top3Most.map((m, idx) => (
                    <div key={m.memberId} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="text-lg">{idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉'}</div>
                        <div className="font-medium">{m.name}</div>
                      </div>
                      <Badge variant="secondary">{m.total} (S{m.baseTotal}+P{m.periodTotal})</Badge>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border p-3">
                <div className="font-semibold mb-2">Top 3 (le moins)</div>
                <div className="space-y-2">
                  {top3Least.map((m) => (
                    <div key={m.memberId} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="text-lg">🧊</div>
                        <div className="font-medium">{m.name}</div>
                      </div>
                      <Badge variant="outline">{m.total} (S{m.baseTotal}+P{m.periodTotal})</Badge>
                    </div>
                  ))}
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
                <div className="text-sm text-muted-foreground">Moyenne / membre</div>
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
                    'h-2',
                    fairnessGap <= 2 && 'bg-green-600',
                    fairnessGap > 2 && fairnessGap <= 5 && 'bg-yellow-500',
                    fairnessGap > 5 && 'bg-red-600'
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
                  <li key={i} className="text-muted-foreground">{r}</li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Comparatives */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Comparatif — Normal (global)</CardTitle></CardHeader>
          <CardContent>
            <div className="w-full overflow-x-auto" ref={refChartNormal}>
              <div className="min-w-[1400px] h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={normalChartData}>
                    <XAxis dataKey="name" interval={0} angle={-35} textAnchor="end" height={80} fontSize={12} />
                    <YAxis fontSize={12} />
                    <Tooltip
                      formatter={(value: any, _name: any, props: any) => {
                        const p = props?.payload;
                        if (!p) return [value, 'Normal global'];
                        return [`${value} (Solde ${p.base} + Période ${p.period})`, 'Normal global'];
                      }}
                      labelFormatter={(_label: any, payload: any) => payload?.[0]?.payload?.fullName ?? _label}
                    />
                    <Bar dataKey="count" fill="#2563EB" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Comparatif — Férié (global)</CardTitle></CardHeader>
          <CardContent>
            <div className="w-full overflow-x-auto" ref={refChartHoliday}>
              <div className="min-w-[1400px] h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={holidayChartData}>
                    <XAxis dataKey="name" interval={0} angle={-35} textAnchor="end" height={80} fontSize={12} />
                    <YAxis fontSize={12} />
                    <Tooltip
                      formatter={(value: any, _name: any, props: any) => {
                        const p = props?.payload;
                        if (!p) return [value, 'Férié global'];
                        return [`${value} (Solde ${p.base} + Période ${p.period})`, 'Férié global'];
                      }}
                      labelFormatter={(_label: any, payload: any) => payload?.[0]?.payload?.fullName ?? _label}
                    />
                    <Bar dataKey="count" fill="#F97316" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Matrix */}
      <Card>
        <CardHeader>
          <CardTitle>Matrice — Membre × Jour de semaine (avec solde)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3 items-center mb-3">
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
              Afficher seulement ceux qui ont &gt; 0 (période)
            </label>
          </div>

          <div className="w-full overflow-x-auto">
            <div className="min-w-[1250px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Membre</TableHead>
                    <TableHead className="text-right">Solde N</TableHead>
                    <TableHead className="text-right">Solde F</TableHead>
                    <TableHead className="text-right">Solde T</TableHead>
                    {weekdayLabels.map((d) => (
                      <TableHead key={d} className="text-right">{d}</TableHead>
                    ))}
                    <TableHead className="text-right">Total période</TableHead>
                    <TableHead className="text-right">Total global</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {weekdayMatrix
                    .filter((row) => row.name.toLowerCase().includes(matrixSearch.toLowerCase()))
                    .filter((row) => !matrixOnlyActive || row.periodTotal > 0)
                    .map((row) => (
                      <TableRow key={row.memberId}>
                        <TableCell className="font-medium">{row.name}</TableCell>

                        <TableCell className="text-right font-medium">{row.soldeNormal}</TableCell>
                        <TableCell className="text-right font-medium">{row.soldeHoliday}</TableCell>
                        <TableCell className="text-right font-semibold">{row.soldeTotal}</TableCell>

                        {row.counts.map((v, idx) => (
                          <TableCell key={idx} className="text-right">
                            {v === 0 ? <span className="text-muted-foreground">—</span> : <span className="font-semibold">{v}</span>}
                          </TableCell>
                        ))}

                        <TableCell className="text-right font-semibold">{row.periodTotal}</TableCell>
                        <TableCell className="text-right font-bold">{row.totalGlobal}</TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </div>
          </div>

          <div className="text-xs text-muted-foreground mt-2">
            Les jours affichés (Dim..Sam) représentent la <b>période</b>. Le solde est affiché séparément.
          </div>
        </CardContent>
      </Card>

      {/* Totals table */}
      <Card>
        <CardHeader>
          <CardTitle>Totaux (Solde + Période)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3 items-center mb-3">
            <input
              value={tableSearch}
              onChange={(e) => setTableSearch(e.target.value)}
              placeholder="Rechercher dans le tableau..."
              className="w-full md:w-80 border rounded-md px-3 py-2 text-sm"
            />
            <button
              type="button"
              className="text-sm border rounded-md px-3 py-2 hover:bg-muted"
              onClick={() => setTableAsc((v) => !v)}
            >
              Tri: {tableAsc ? 'Croissant' : 'Décroissant'}
            </button>
            <div className="text-sm text-muted-foreground">
              (Tri sur Total global)
            </div>
          </div>

          <div className="w-full overflow-x-auto">
            <div className="min-w-[1100px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Membre</TableHead>
                    <TableHead className="text-right">Solde N</TableHead>
                    <TableHead className="text-right">Solde F</TableHead>
                    <TableHead className="text-right">Solde T</TableHead>
                    <TableHead className="text-right">Période N</TableHead>
                    <TableHead className="text-right">Période F</TableHead>
                    <TableHead className="text-right">Période T</TableHead>
                    <TableHead className="text-right">Total global</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {totalsTableRows.map((r) => (
                    <TableRow key={r.memberId}>
                      <TableCell className="font-medium">{r.name}</TableCell>

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
          </div>
        </CardContent>
      </Card>

      {/* Days since last duty */}
      <Card>
        <CardHeader>
          <CardTitle>Days since last duty</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="w-full overflow-x-auto">
            <div className="min-w-[1400px] h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={daysSinceLastDutyData}>
                  <XAxis dataKey="name" interval={0} angle={-35} textAnchor="end" height={80} fontSize={12} />
                  <YAxis fontSize={12} />
                  <Tooltip
                    formatter={(value: any, _name: any, props: any) => {
                      const hasValue = props?.payload?.hasValue;
                      if (!hasValue) return ['Jamais', 'Jours'];
                      return [value, 'Jours'];
                    }}
                    labelFormatter={(_label: any, payload: any) => payload?.[0]?.payload?.fullName ?? _label}
                  />
                  <Bar dataKey="days" fill="hsl(160, 60%, 45%)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="text-xs text-muted-foreground mt-2">
            Grande barre = personne non planifiée depuis longtemps. “Jamais” est volontairement mis très haut.
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Days since last NORMAL duty</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="w-full overflow-x-auto">
            <div className="min-w-[1400px] h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={daysSinceLastNormalDutyData}>
                  <XAxis dataKey="name" interval={0} angle={-35} textAnchor="end" height={80} fontSize={12} />
                  <YAxis fontSize={12} />
                  <Tooltip
                    formatter={(value: any, _name: any, props: any) => {
                      const hasValue = props?.payload?.hasValue;
                      if (!hasValue) return ['Jamais', 'Jours'];
                      return [value, 'Jours'];
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

          <div className="text-xs text-muted-foreground mt-2">
            Grande barre = membre sans jour normal depuis longtemps.
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Days since last HOLIDAY duty</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="w-full overflow-x-auto">
            <div className="min-w-[1400px] h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={daysSinceLastHolidayDutyData}>
                  <XAxis dataKey="name" interval={0} angle={-35} textAnchor="end" height={80} fontSize={12} />
                  <YAxis fontSize={12} />
                  <Tooltip
                    formatter={(value: any, _name: any, props: any) => {
                      const hasValue = props?.payload?.hasValue;
                      if (!hasValue) return ['Jamais', 'Jours'];
                      return [value, 'Jours'];
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

          <div className="text-xs text-muted-foreground mt-2">
            Grande barre = membre sans jour férié depuis longtemps.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
