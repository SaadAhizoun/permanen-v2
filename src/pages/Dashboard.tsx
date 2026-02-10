import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthContext } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { fr } from '@/lib/i18n';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Calendar,
  Users,
  BarChart3,
  AlertTriangle,
  UserCheck,
  Plus,
  Upload,
  ArrowRight,
  TrendingUp,
} from 'lucide-react';
import { format, addDays, startOfMonth, endOfMonth } from 'date-fns';
import { fr as frLocale } from 'date-fns/locale';

interface DutyEntry {
  id: string;
  duty_date: string;
  duty_type: string;
  notes: string | null;
  team_member: {
    id: string;
    full_name: string;
    title: string | null;
  } | null;
}

interface KPIData {
  nextDuty: DutyEntry | null;
  monthTotal: number;
  fairnessScore: number;
  conflicts: number;
  pendingApprovals: number;
}

export default function Dashboard() {
  const { isAdmin, user } = useAuthContext();
  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState<KPIData>({
    nextDuty: null,
    monthTotal: 0,
    fairnessScore: 100,
    conflicts: 0,
    pendingApprovals: 0,
  });
  const [upcomingDuties, setUpcomingDuties] = useState<DutyEntry[]>([]);
    // Welcome name (from profiles)
  const [myName, setMyName] = useState<string>('');

  useEffect(() => {
    const run = async () => {
      if (!user?.id) return;

      const { data, error } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!error && data?.full_name) setMyName(data.full_name);
    };

    run();
  }, [user?.id]);


  useEffect(() => {
    fetchDashboardData();
  }, [isAdmin]);

  const fetchDashboardData = async () => {
    try {
      const today = new Date();
      const monthStart = startOfMonth(today);
      const monthEnd = endOfMonth(today);
      const next30Days = addDays(today, 30);

      // Fetch upcoming duties
      const { data: duties, error: dutiesError } = await supabase
        .from('duty_entries')
        .select(`
          id,
          duty_date,
          duty_type,
          notes,
          team_member:team_members(id, full_name, title)
        `)
        .gte('duty_date', format(today, 'yyyy-MM-dd'))
        .lte('duty_date', format(next30Days, 'yyyy-MM-dd'))
        .order('duty_date', { ascending: true });

      if (dutiesError) throw dutiesError;



      // Fetch month total
      const { count: monthTotal } = await supabase
        .from('duty_entries')
        .select('*', { count: 'exact', head: true })
        .gte('duty_date', format(monthStart, 'yyyy-MM-dd'))
        .lte('duty_date', format(monthEnd, 'yyyy-MM-dd'));

      // Fetch team members for fairness calculation
      const { data: teamMembers } = await supabase
        .from('team_members')
        .select('id')
        .eq('active', true);

      // Calculate fairness score based on distribution
      let fairnessScore = 100;
      if (teamMembers && teamMembers.length > 0) {
        const { data: memberDuties } = await supabase
          .from('duty_entries')
          .select('team_member_id')
          .gte('duty_date', format(monthStart, 'yyyy-MM-dd'))
          .lte('duty_date', format(monthEnd, 'yyyy-MM-dd'));

        if (memberDuties && memberDuties.length > 0) {
          const dutyCounts: Record<string, number> = {};
          memberDuties.forEach((d) => {
            if (d.team_member_id) {
              dutyCounts[d.team_member_id] = (dutyCounts[d.team_member_id] || 0) + 1;
            }
          });
          const counts = Object.values(dutyCounts);
          if (counts.length > 0) {
            const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
            const variance = counts.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / counts.length;
            const stdDev = Math.sqrt(variance);
            fairnessScore = Math.max(0, Math.round(100 - stdDev * 20));
          }
        }
      }

      // Fetch pending approvals if admin
      let pendingApprovals = 0;
      if (isAdmin) {
        const { count } = await supabase
          .from('profiles')
          .select('*', { count: 'exact', head: true })
          .eq('approved', false);
        pendingApprovals = count || 0;
      }

      setUpcomingDuties(duties as DutyEntry[] || []);
      setKpis({
        nextDuty: duties && duties.length > 0 ? duties[0] as DutyEntry : null,
        monthTotal: monthTotal || 0,
        fairnessScore,
        conflicts: 0, // Would need more complex logic
        pendingApprovals,
      });
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getFairnessColor = (score: number) => {
    if (score >= 80) return 'text-success';
    if (score >= 60) return 'text-accent';
    if (score >= 40) return 'text-warning';
    return 'text-destructive';
  };

  const getFairnessLabel = (score: number) => {
    if (score >= 80) return fr.insights.fairnessExcellent;
    if (score >= 60) return fr.insights.fairnessGood;
    if (score >= 40) return fr.insights.fairnessModerate;
    return fr.insights.fairnessPoor;
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16" />
                <Skeleton className="h-4 w-32 mt-2" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
            {/* Welcome */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">
            Bienvenue{myName ? `, ${myName}` : ''}
          </h2>
          <p className="text-sm text-muted-foreground">
            {isAdmin ? 'Accès administrateur' : 'Accès utilisateur'}
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Next Duty */}
        <Card className="kpi-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {fr.dashboard.nextDuty}
            </CardTitle>
            <Calendar className="h-4 w-4 text-accent" />
          </CardHeader>
          <CardContent>
            {kpis.nextDuty ? (
              <>
                <div className="text-2xl font-bold">
                  {format(new Date(kpis.nextDuty.duty_date), 'd MMM', { locale: frLocale })}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {kpis.nextDuty.team_member?.full_name || 'Non assigné'}
                </p>
              </>
            ) : (
              <div className="text-2xl font-bold text-muted-foreground">—</div>
            )}
          </CardContent>
        </Card>

        {/* Month Total */}
        <Card className="kpi-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {fr.dashboard.totalDuties}
            </CardTitle>
            <Users className="h-4 w-4 text-accent" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.monthTotal}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {format(new Date(), 'MMMM yyyy', { locale: frLocale })}
            </p>
          </CardContent>
        </Card>

        {/* Fairness Score */}
        <Card className="kpi-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {fr.dashboard.fairness}
            </CardTitle>
            <BarChart3 className="h-4 w-4 text-accent" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${getFairnessColor(kpis.fairnessScore)}`}>
              {kpis.fairnessScore}%
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {getFairnessLabel(kpis.fairnessScore)}
            </p>
          </CardContent>
        </Card>

        {/* Conflicts / Pending Approvals */}
        {isAdmin ? (
          <Card className="kpi-card">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {fr.dashboard.pendingApprovals}
              </CardTitle>
              <UserCheck className="h-4 w-4 text-accent" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {kpis.pendingApprovals}
              </div>
              {kpis.pendingApprovals > 0 && (
                <Link to="/maintenance">
                  <Button variant="link" className="p-0 h-auto text-xs text-accent mt-1">
                    Voir les demandes <ArrowRight className="ml-1 h-3 w-3" />
                  </Button>
                </Link>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card className="kpi-card">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {fr.dashboard.conflicts}
              </CardTitle>
              <AlertTriangle className="h-4 w-4 text-accent" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-success">
                {kpis.conflicts === 0 ? '0' : kpis.conflicts}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {kpis.conflicts === 0 ? fr.dashboard.noConflicts : 'À résoudre'}
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{fr.dashboard.quickActions}</CardTitle>
        </CardHeader>
       <CardContent className="flex flex-wrap gap-3">
  {/* Ajouter permanence */}
  {isAdmin ? (
    <Link to="/add-duty">
      <Button>
        <Plus className="mr-2 h-4 w-4" />
        {fr.nav.addDuty}
      </Button>
    </Link>
  ) : (
    <Button
      onClick={() => toast.error("Action réservée aux administrateurs")}
      className="opacity-60 cursor-not-allowed"
      title="Réservé aux administrateurs"
    >
      <Plus className="mr-2 h-4 w-4" />
      {fr.nav.addDuty}
    </Button>
  )}

  {/* Planning (toujours autorisé) */}
  <Link to="/planning">
    <Button variant="outline">
      <Calendar className="mr-2 h-4 w-4" />
      {fr.nav.planning}
    </Button>
  </Link>

  {/* Import */}
  {isAdmin ? (
    <Link to="/import">
      <Button variant="outline">
        <Upload className="mr-2 h-4 w-4" />
        {fr.nav.import}
      </Button>
    </Link>
  ) : (
    <Button
      variant="outline"
      onClick={() => toast.error("Action réservée aux administrateurs")}
      className="opacity-60 cursor-not-allowed"
      title="Réservé aux administrateurs"
    >
      <Upload className="mr-2 h-4 w-4" />
      {fr.nav.import}
    </Button>
  )}

  {/* Aide à la décision */}
  <Link to="/insights">
    <Button variant="outline">
      <TrendingUp className="mr-2 h-4 w-4" />
      {fr.nav.insights}
    </Button>
  </Link>
</CardContent>

      </Card>

      {/* Upcoming Duties Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{fr.dashboard.upcomingDuties}</CardTitle>
          <CardDescription>
            Les prochaines permanences planifiées
          </CardDescription>
        </CardHeader>
        <CardContent>
          {upcomingDuties.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Calendar className="mx-auto h-12 w-12 mb-4 opacity-50" />
              <p>{fr.dashboard.noDuties}</p>
              {isAdmin ? (
  <Link to="/add-duty">
    <Button variant="link" className="mt-2">
      Ajouter une permanence
    </Button>
  </Link>
) : (
  <Button
    variant="link"
    className="mt-2 opacity-60 cursor-not-allowed"
    onClick={() => toast.error('Action réservée aux administrateurs')}
    title="Réservé aux administrateurs"
  >
    Ajouter une permanence
  </Button>
)}

            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Membre</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="hidden md:table-cell">Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {upcomingDuties.slice(0, 10).map((duty) => (
                  <TableRow key={duty.id} className="data-table-row">
                    <TableCell className="font-medium">
                      {format(new Date(duty.duty_date), 'EEE d MMM', { locale: frLocale })}
                    </TableCell>
                    <TableCell>
                      {duty.team_member ? (
                        <div>
                          <span>{duty.team_member.full_name}</span>
                          {duty.team_member.title && (
                            <span className="text-muted-foreground text-xs ml-2">
                              ({duty.team_member.title})
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">Non assigné</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {fr.duty.types[duty.duty_type as keyof typeof fr.duty.types] || duty.duty_type}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground">
                      {duty.notes || '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
