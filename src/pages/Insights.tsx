import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { format, subMonths, differenceInCalendarDays, parseISO, startOfMonth } from 'date-fns';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

type Member = {
  id: string;
  full_name: string;
  initial_credit_normal?: number | null;
  initial_credit_holiday?: number | null;
};

type Duty = {
  duty_date: string;            // 'YYYY-MM-DD' (date-only)
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
 * IMPORTANT:
 * duty_date is a DATE (YYYY-MM-DD). We must not let local timezone shift the weekday.
 * We force UTC at midnight and use getUTCDay().
 */
function parseDateOnlyUTC(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
}

export default function Insights() {
  const [loading, setLoading] = useState(true);

  const [members, setMembers] = useState<Member[]>([]);
  const [duties, setDuties] = useState<Duty[]>([]);
  const [holidayDatesSet, setHolidayDatesSet] = useState<Set<string>>(new Set());

  // Filters
  const [filterOpen, setFilterOpen] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [tableSearch, setTableSearch] = useState('');
  const [matrixSearch, setMatrixSearch] = useState('');
  const [matrixOnlyActive, setMatrixOnlyActive] = useState(false);
  const [tableAsc, setTableAsc] = useState(true);

  // ✅ Period selector (fixes your “Aug 7 not counted” problem)
  const [period, setPeriod] = useState<'6m' | '12m' | 'all'>('6m');

  const periodStartDateStr = useMemo(() => {
    const now = new Date();

    if (period === 'all') return null;

    const months = period === '6m' ? 6 : 12;

    // ✅ FIX: include the whole month (Aug 1 -> includes Aug 7)
    const start = startOfMonth(subMonths(now, months));
    return format(start, 'yyyy-MM-dd');
  }, [period]);

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  const fetchData = async () => {
    try {
      setLoading(true);

      const { data: membersData, error: membersErr } = await supabase
        .from('team_members')
        .select('id, full_name, initial_credit_normal, initial_credit_holiday')
        .eq('active', true)
        .order('full_name', { ascending: true });

      if (membersErr) throw membersErr;

      let dutiesQuery = supabase
        .from('duty_entries')
        .select('duty_date, duty_type, team_member_id, team_member:team_members(id, full_name)');

      if (periodStartDateStr) {
        dutiesQuery = dutiesQuery.gte('duty_date', periodStartDateStr);
      }

      const { data: dutiesData, error: dutiesErr } = await dutiesQuery;
      if (dutiesErr) throw dutiesErr;

      const { data: holidaysData, error: holidaysErr } = await supabase
        .from('holidays')
        .select('date');

      if (holidaysErr) throw holidaysErr;

      // Holidays are already date strings "YYYY-MM-DD" in your DB
      const holidaySet = new Set<string>(
        (holidaysData || [])
          .map((h: any) => h?.date)
          .filter(Boolean)
      );

      setMembers((membersData as any) || []);
      setDuties((dutiesData as any) || []);
      setHolidayDatesSet(holidaySet);

      // default selection: all members
      setSelectedMemberIds(((membersData as any) || []).map((m: any) => m.id));
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

  // ✅ Per-member stats
  const perMemberStats = useMemo(() => {
    const allowAll = selectedMemberIds.length === 0;
    const selectedSet = new Set(selectedMemberIds);

    const stats: Record<
      string,
      {
        memberId: string;
        name: string;
        normal: number;
        holiday: number;
        total: number;
        weekend: number;
        weekday: number;
      }
    > = {};

    // init with base credits (solde)
    members.forEach((m) => {
      if (!allowAll && !selectedSet.has(m.id)) return;

      const baseNormal = Number(m.initial_credit_normal ?? 0);
      const baseHoliday = Number(m.initial_credit_holiday ?? 0);

      stats[m.id] = {
        memberId: m.id,
        name: m.full_name,
        normal: baseNormal,
        holiday: baseHoliday,
        total: baseNormal + baseHoliday,
        weekend: 0,
        weekday: 0,
      };
    });

    // add duties
    filteredDuties.forEach((d) => {
      const mid = d.team_member_id;
      if (!mid || !stats[mid]) return;

      const dayKey = d.duty_date; // "YYYY-MM-DD"
      const isHoliday = holidayDatesSet.has(dayKey);

      const dt = parseDateOnlyUTC(d.duty_date);
      const wd = dt.getUTCDay();
      const isWeekend = wd === 0 || wd === 6;

      // Holiday vs Normal
      if (isHoliday) stats[mid].holiday += 1;
      else stats[mid].normal += 1;

      // Weekend vs Weekday
      if (isWeekend) stats[mid].weekend += 1;
      else stats[mid].weekday += 1;

      stats[mid].total += 1;
    });

    return Object.values(stats);
  }, [filteredDuties, members, selectedMemberIds, holidayDatesSet]);

  // KPIs
  const kpis = useMemo(() => {
    const total = perMemberStats.reduce((s, m) => s + m.total, 0);
    const holiday = perMemberStats.reduce((s, m) => s + m.holiday, 0);
    const normal = perMemberStats.reduce((s, m) => s + m.normal, 0);
    const weekend = perMemberStats.reduce((s, m) => s + m.weekend, 0);

    const avg = perMemberStats.length ? total / perMemberStats.length : 0;

    return {
      total,
      normal,
      holiday,
      weekend,
      avg: Math.round(avg * 10) / 10,
    };
  }, [perMemberStats]);

  const distributionData = useMemo(() => {
    return [...perMemberStats]
      .map((m) => ({
        memberId: m.memberId,
        name: shortName(m.name),
        fullName: m.name,
        total: m.total,
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
      }))
      .sort((a, b) => b.count - a.count);
  }, [perMemberStats]);

  const top3Most = useMemo(() => {
    return [...perMemberStats].sort((a, b) => b.total - a.total).slice(0, 3);
  }, [perMemberStats]);

  const top3Least = useMemo(() => {
    return [...perMemberStats].sort((a, b) => a.total - b.total).slice(0, 3);
  }, [perMemberStats]);

  // Fairness simple (gap)
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

  // Table rows
  const totalsTableRows = useMemo(() => {
    const rows = [...perMemberStats].filter((r) =>
      r.name.toLowerCase().includes(tableSearch.toLowerCase())
    );

    rows.sort((a, b) => (tableAsc ? a.total - b.total : b.total - a.total));
    return rows;
  }, [perMemberStats, tableSearch, tableAsc]);

  // ✅ Weekday matrix (UTC-safe)
  const weekdayMatrix = useMemo(() => {
    const allowAll = selectedMemberIds.length === 0;
    const selectedSet = new Set(selectedMemberIds);

    const matrix: Array<{ memberId: string; name: string; counts: number[] }> = [];

    members.forEach((m) => {
      if (!allowAll && !selectedSet.has(m.id)) return;
      matrix.push({ memberId: m.id, name: m.full_name, counts: Array(7).fill(0) });
    });

    const idxById = new Map(matrix.map((row, idx) => [row.memberId, idx]));

    filteredDuties.forEach((d) => {
      const mid = d.team_member_id;
      if (!mid) return;

      const idx = idxById.get(mid);
      if (idx === undefined) return;

      const dt = parseDateOnlyUTC(d.duty_date);
      matrix[idx].counts[dt.getUTCDay()] += 1;
    });

    matrix.sort(
      (a, b) =>
        b.counts.reduce((s, x) => s + x, 0) - a.counts.reduce((s, x) => s + x, 0)
    );

    return matrix;
  }, [filteredDuties, members, selectedMemberIds]);

  // Days since last duty
  const daysSinceLastDutyData = useMemo(() => {
    const now = new Date();

    const lastDateByMember = new Map<string, Date>();
    filteredDuties.forEach((d) => {
      const mid = d.team_member_id;
      if (!mid) return;
      const dt = parseISO(d.duty_date); // ok for ordering
      const prev = lastDateByMember.get(mid);
      if (!prev || dt > prev) lastDateByMember.set(mid, dt);
    });

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
  }, [filteredDuties, members, selectedMemberIds]);

  // Smart recommendations
  const recommendations = useMemo(() => {
    if (perMemberStats.length === 0) return [];

    const avg = fairness.avg || 0;
    const sorted = [...perMemberStats].sort((a, b) => a.total - b.total);

    const least = sorted.slice(0, 3);
    const most = [...sorted].reverse().slice(0, 3);

    const recs: string[] = [];

    if (fairnessGap >= 6) {
      recs.push(`Déséquilibre important : écart de ${fairnessGap}. Priorise les membres les moins chargés.`);
    } else {
      recs.push(`Équilibre correct : écart de ${fairnessGap}. Continue sur la même logique.`);
    }

    recs.push(`Prochaine rotation suggérée (moins chargés) : ${least.map((m) => shortName(m.name)).join(', ')}.`);

    if (most[0]?.total >= avg + 3) {
      recs.push(`Réduire la charge de : ${most.map((m) => shortName(m.name)).join(', ')} (au-dessus de la moyenne).`);
    }

    return recs;
  }, [perMemberStats, fairness.avg, fairnessGap]);

  if (loading) return <Skeleton className="h-96 w-full" />;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-2xl font-bold">Aide à la décision</div>
          <div className="text-sm text-muted-foreground">
            Lecture rapide + filtres + indicateurs pour mieux équilibrer la permanence.
          </div>

          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              className={cn('text-sm border rounded-md px-3 py-1', period === '6m' && 'bg-muted')}
              onClick={() => setPeriod('6m')}
            >
              6 mois
            </button>
            <button
              type="button"
              className={cn('text-sm border rounded-md px-3 py-1', period === '12m' && 'bg-muted')}
              onClick={() => setPeriod('12m')}
            >
              12 mois
            </button>
            <button
              type="button"
              className={cn('text-sm border rounded-md px-3 py-1', period === 'all' && 'bg-muted')}
              onClick={() => setPeriod('all')}
            >
              Tout
            </button>

            {periodStartDateStr && (
              <Badge variant="secondary">Depuis: {periodStartDateStr}</Badge>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">Membres: {selectedCountLabel}</Badge>
          <Badge variant="outline">Total: {kpis.total}</Badge>
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
              <Badge variant="secondary">Normal: {kpis.normal}</Badge>
              <Badge variant="secondary">Férié: {kpis.holiday}</Badge>
              <Badge variant="secondary">Week-end: {kpis.weekend}</Badge>
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
        <Card><CardContent className="py-5"><div className="text-sm text-muted-foreground">Total permanences</div><div className="text-3xl font-bold mt-1">{kpis.total}</div></CardContent></Card>
        <Card><CardContent className="py-5"><div className="text-sm text-muted-foreground">Moyenne / membre</div><div className="text-3xl font-bold mt-1">{kpis.avg}</div></CardContent></Card>
        <Card><CardContent className="py-5"><div className="text-sm text-muted-foreground">Jours fériés</div><div className="text-3xl font-bold mt-1">{kpis.holiday}</div></CardContent></Card>
        <Card><CardContent className="py-5"><div className="text-sm text-muted-foreground">Week-end</div><div className="text-3xl font-bold mt-1">{kpis.weekend}</div></CardContent></Card>
      </div>

      {/* Charts */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Répartition par membre</CardTitle></CardHeader>
          <CardContent>
            <div className="w-full overflow-x-auto">
              <div className="min-w-[1400px] h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={distributionData}>
                    <XAxis dataKey="name" interval={0} angle={-35} textAnchor="end" height={80} fontSize={12} />
                    <YAxis fontSize={12} />
                    <Tooltip
                      formatter={(value: any) => [value, 'Total']}
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
                      <Badge variant="secondary">{m.total} jours</Badge>
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
                      <Badge variant="outline">{m.total} jours</Badge>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Équité (simple)</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-center">
              <div><div className="text-2xl font-bold">{fairness.max}</div><div className="text-sm text-muted-foreground">Plus chargé</div></div>
              <div><div className="text-2xl font-bold">{fairness.min}</div><div className="text-sm text-muted-foreground">Moins chargé</div></div>
              <div><div className="text-2xl font-bold">{fairness.avg}</div><div className="text-sm text-muted-foreground">Moyenne / membre</div></div>
              <div><div className="text-2xl font-bold">{fairnessGap}</div><div className="text-sm text-muted-foreground">Écart (max-min)</div></div>
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
          <CardHeader><CardTitle>Comparatif — Jours normaux</CardTitle></CardHeader>
          <CardContent>
            <div className="w-full overflow-x-auto">
              <div className="min-w-[1400px] h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={normalChartData}>
                    <XAxis dataKey="name" interval={0} angle={-35} textAnchor="end" height={80} fontSize={12} />
                    <YAxis fontSize={12} />
                    <Tooltip
                      formatter={(value: any) => [value, 'Normal']}
                      labelFormatter={(_label: any, payload: any) => payload?.[0]?.payload?.fullName ?? _label}
                    />
                    <Bar dataKey="count" fill="hsl(222, 47%, 35%)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Comparatif — Jours fériés</CardTitle></CardHeader>
          <CardContent>
            <div className="w-full overflow-x-auto">
              <div className="min-w-[1400px] h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={holidayChartData}>
                    <XAxis dataKey="name" interval={0} angle={-35} textAnchor="end" height={80} fontSize={12} />
                    <YAxis fontSize={12} />
                    <Tooltip
                      formatter={(value: any) => [value, 'Férié']}
                      labelFormatter={(_label: any, payload: any) => payload?.[0]?.payload?.fullName ?? _label}
                    />
                    <Bar dataKey="count" fill="hsl(38, 92%, 50%)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Matrix */}
      <Card>
        <CardHeader><CardTitle>Matrice — Membre × Jour de semaine</CardTitle></CardHeader>
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
              Afficher seulement ceux qui ont &gt; 0
            </label>
          </div>

          <div className="w-full overflow-x-auto">
            <div className="min-w-[900px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Membre</TableHead>
                    {weekdayLabels.map((d) => (
                      <TableHead key={d} className="text-right">{d}</TableHead>
                    ))}
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {weekdayMatrix
                    .filter((row) => row.name.toLowerCase().includes(matrixSearch.toLowerCase()))
                    .filter((row) => !matrixOnlyActive || row.counts.reduce((s, x) => s + x, 0) > 0)
                    .map((row) => {
                      const total = row.counts.reduce((s, x) => s + x, 0);
                      return (
                        <TableRow key={row.memberId}>
                          <TableCell className="font-medium">{row.name}</TableCell>
                          {row.counts.map((v, idx) => (
                            <TableCell key={idx} className="text-right">
                              {v === 0 ? (
                                <span className="text-muted-foreground">—</span>
                              ) : (
                                <span className="font-semibold">{v}</span>
                              )}
                            </TableCell>
                          ))}
                          <TableCell className="text-right font-semibold">{total}</TableCell>
                        </TableRow>
                      );
                    })}
                </TableBody>
              </Table>
            </div>
          </div>

          <div className="text-xs text-muted-foreground mt-2">
            Si un membre apparaît souvent le même jour, tu le verras immédiatement.
          </div>
        </CardContent>
      </Card>

      {/* Totals table */}
      <Card>
        <CardHeader><CardTitle>Totaux (Normal / Férié)</CardTitle></CardHeader>
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
            <div className="text-sm text-muted-foreground">(Croissant = les moins chargés en haut)</div>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Membre</TableHead>
                <TableHead className="text-right">Normal</TableHead>
                <TableHead className="text-right">Férié</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {totalsTableRows.map((r) => (
                <TableRow key={r.memberId}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="text-right">{r.normal}</TableCell>
                  <TableCell className="text-right">{r.holiday}</TableCell>
                  <TableCell className="text-right font-semibold">{r.total}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Days since last duty */}
      <Card>
        <CardHeader><CardTitle>Days since last duty</CardTitle></CardHeader>
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
    </div>
  );
}
