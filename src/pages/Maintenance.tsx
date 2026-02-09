import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthContext } from '@/contexts/AuthContext';
import { fr } from '@/lib/i18n';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { UserCheck, Shield, Trash2, Users, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

interface PendingUser { user_id: string; full_name: string; created_at: string; }
interface UserRole { user_id: string; role: string; profile: { full_name: string } | null; }

export default function Maintenance() {
  const { isAdmin, user } = useAuthContext();
  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([]);
  const [userRoles, setUserRoles] = useState<UserRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [purgeDays, setPurgeDays] = useState(90);
  const [seedYear, setSeedYear] = useState(new Date().getFullYear());

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      const [pending, roles] = await Promise.all([
        supabase.from('profiles').select('user_id, full_name, created_at').eq('approved', false),
        supabase.from('user_roles').select('user_id, role, profile:profiles(full_name)'),
      ]);
      setPendingUsers(pending.data || []);
      setUserRoles(roles.data as any || []);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  const approveUser = async (userId: string) => {
    const { error } = await supabase.rpc('admin_approve_user', { target_user_id: userId });
    if (error) { toast.error(error.message); return; }
    toast.success('Utilisateur approuvé');
    fetchData();
  };

  const setRole = async (userId: string, role: string) => {
    const { error } = await supabase.rpc('admin_set_role', { target_user_id: userId, new_role: role });
    if (error) { toast.error(error.message); return; }
    toast.success('Rôle modifié');
    fetchData();
  };

  const purgeAudit = async () => {
    const { data, error } = await supabase.rpc('purge_audit_log', { keep_days: purgeDays });
    if (error) { toast.error(error.message); return; }
    toast.success(`${data} entrées supprimées`);
  };

  const seedHolidays = async () => {
    const { data, error } = await supabase.rpc('seed_morocco_holidays', { year: seedYear });
    if (error) { toast.error(error.message); return; }
    toast.success(`${data} jours fériés ajoutés pour ${seedYear}`);
  };

  if (loading) return <Skeleton className="h-96 w-full" />;

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl mx-auto">
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><UserCheck className="h-5 w-5" />{fr.maintenance.pendingApprovals}</CardTitle></CardHeader>
        <CardContent>
          {pendingUsers.length === 0 ? <p className="text-muted-foreground">{fr.maintenance.noUsers}</p> : (
            <div className="space-y-2">
              {pendingUsers.map(u => (
                <div key={u.user_id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <span>{u.full_name}</span>
                  <Button size="sm" onClick={() => approveUser(u.user_id)}>{fr.maintenance.approve}</Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Shield className="h-5 w-5" />{fr.maintenance.userRoles}</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2">
            {userRoles.map(r => (
              <div key={r.user_id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                <div className="flex items-center gap-2">
                  <span>{r.profile?.full_name || 'Utilisateur'}</span>
                  <Badge variant={r.role === 'admin' ? 'default' : 'secondary'}>{r.role}</Badge>
                </div>
                {r.user_id !== user?.id && (
                  <Button size="sm" variant="outline" onClick={() => setRole(r.user_id, r.role === 'admin' ? 'user' : 'admin')}>
                    {r.role === 'admin' ? fr.maintenance.removeAdmin : fr.maintenance.makeAdmin}
                  </Button>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Trash2 className="h-5 w-5" />{fr.maintenance.cleanup}</CardTitle></CardHeader>
        <CardContent className="flex items-center gap-4">
          <Input type="number" value={purgeDays} onChange={e => setPurgeDays(parseInt(e.target.value) || 90)} className="w-24" />
          <span className="text-sm text-muted-foreground">{fr.maintenance.daysToKeep}</span>
          <Button variant="destructive" onClick={purgeAudit}>{fr.maintenance.purge}</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5" />{fr.maintenance.seedHolidays}</CardTitle></CardHeader>
        <CardContent className="flex items-center gap-4">
          <Input type="number" value={seedYear} onChange={e => setSeedYear(parseInt(e.target.value))} className="w-24" />
          <Button onClick={seedHolidays}>{fr.holidays.seedMorocco}</Button>
        </CardContent>
      </Card>
    </div>
  );
}
