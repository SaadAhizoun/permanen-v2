import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { fr } from '@/lib/i18n';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { fr as frLocale } from 'date-fns/locale';

export default function Insights() {
  const [loading, setLoading] = useState(true);
  const [memberData, setMemberData] = useState<any[]>([]);
  const [monthlyData, setMonthlyData] = useState<any[]>([]);
  const [typeData, setTypeData] = useState<any[]>([]);
  const [fairness, setFairness] = useState({ max: 0, min: 0, avg: 0, stdDev: 0, score: 100 });

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      const now = new Date();
      const sixMonthsAgo = subMonths(now, 6);

      const { data: duties } = await supabase.from('duty_entries').select('duty_date, duty_type, team_member:team_members(full_name)').gte('duty_date', format(sixMonthsAgo, 'yyyy-MM-dd'));
      const { data: members } = await supabase.from('team_members').select('id, full_name').eq('active', true);

      // Member distribution
      const memberCounts: Record<string, number> = {};
      (members || []).forEach(m => memberCounts[m.full_name] = 0);
      (duties || []).forEach(d => { if (d.team_member?.full_name) memberCounts[d.team_member.full_name]++; });
      setMemberData(Object.entries(memberCounts).map(([name, count]) => ({ name: name.split(' ')[0], count })).sort((a, b) => b.count - a.count));

      // Monthly trend
      const monthCounts: Record<string, number> = {};
      (duties || []).forEach(d => { const m = format(new Date(d.duty_date), 'MMM yy', { locale: frLocale }); monthCounts[m] = (monthCounts[m] || 0) + 1; });
      setMonthlyData(Object.entries(monthCounts).map(([month, count]) => ({ month, count })));

      // Type distribution
      const typeCounts: Record<string, number> = {};
      (duties || []).forEach(d => { typeCounts[d.duty_type] = (typeCounts[d.duty_type] || 0) + 1; });
      setTypeData(Object.entries(typeCounts).map(([type, count]) => ({ type: fr.duty.types[type as keyof typeof fr.duty.types] || type, count })));

      // Fairness calculation
      const counts = Object.values(memberCounts);
      if (counts.length > 0) {
        const max = Math.max(...counts);
        const min = Math.min(...counts);
        const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
        const variance = counts.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / counts.length;
        const stdDev = Math.sqrt(variance);
        const score = Math.max(0, Math.round(100 - stdDev * 15));
        setFairness({ max, min, avg: Math.round(avg * 10) / 10, stdDev: Math.round(stdDev * 10) / 10, score });
      }
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  const COLORS = ['hsl(173, 58%, 39%)', 'hsl(222, 47%, 35%)', 'hsl(160, 60%, 45%)', 'hsl(38, 92%, 50%)'];

  if (loading) return <Skeleton className="h-96 w-full" />;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>{fr.insights.dutyDistribution}</CardTitle></CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={memberData}><XAxis dataKey="name" fontSize={12} /><YAxis fontSize={12} /><Tooltip /><Bar dataKey="count" fill="hsl(173, 58%, 39%)" radius={[4, 4, 0, 0]} /></BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>{fr.insights.fairnessPanel}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-center">
              <div><div className="text-2xl font-bold">{fairness.max}</div><div className="text-sm text-muted-foreground">{fr.insights.max}</div></div>
              <div><div className="text-2xl font-bold">{fairness.min}</div><div className="text-sm text-muted-foreground">{fr.insights.min}</div></div>
              <div><div className="text-2xl font-bold">{fairness.avg}</div><div className="text-sm text-muted-foreground">{fr.insights.avg}</div></div>
              <div><div className="text-2xl font-bold">{fairness.stdDev}</div><div className="text-sm text-muted-foreground">{fr.insights.stdDev}</div></div>
            </div>
            <div className="pt-4 border-t text-center">
              <div className="text-3xl font-bold" style={{ color: fairness.score >= 80 ? 'hsl(160, 60%, 45%)' : fairness.score >= 60 ? 'hsl(173, 58%, 39%)' : 'hsl(38, 92%, 50%)' }}>{fairness.score}%</div>
              <div className="text-sm text-muted-foreground">{fr.insights.fairnessScore}</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>{fr.insights.monthlyTrend}</CardTitle></CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthlyData}><XAxis dataKey="month" fontSize={12} /><YAxis fontSize={12} /><Tooltip /><Line type="monotone" dataKey="count" stroke="hsl(173, 58%, 39%)" strokeWidth={2} /></LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>{fr.insights.typeDistribution}</CardTitle></CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart><Pie data={typeData} dataKey="count" nameKey="type" cx="50%" cy="50%" outerRadius={80} label>{typeData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip /></PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
