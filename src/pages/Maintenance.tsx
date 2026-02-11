import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthContext } from '@/contexts/AuthContext';
import { fr } from '@/lib/i18n';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { UserCheck, Shield, Trash2, Sparkles, Search, Filter } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { fr as frLocale } from 'date-fns/locale';


interface PendingUser {
  user_id: string;
  full_name: string;
  created_at: string;
}

interface UserRole {
  user_id: string;
  role: string;
  profile: { full_name: string } | null;
}

type RoleFilter = 'all' | 'admin' | 'user';

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

export default function Maintenance() {
  const { isAdmin, user } = useAuthContext();

  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([]);
  const [userRoles, setUserRoles] = useState<UserRole[]>([]);
  const [loading, setLoading] = useState(true);

  // Purge / seed
  const [purgeDays, setPurgeDays] = useState(90);
  const [seedYear, setSeedYear] = useState(new Date().getFullYear());

  // Roles UX
  const [rolesLoading, setRolesLoading] = useState(false);
  const [roleSearch, setRoleSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');

  useEffect(() => {
    if (isAdmin) fetchData();
    else setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  const fetchData = async () => {
  try {
    setLoading(true);

    const [pending, rolesRes, profilesRes] = await Promise.all([
      supabase
        .from('profiles')
        .select('user_id, full_name, created_at')
        .eq('approved', false)
        .order('created_at', { ascending: true }),

      supabase
        .from('user_roles')
        .select('user_id, role')
        .order('role', { ascending: true }),

      supabase
        .from('profiles')
        .select('user_id, full_name')
        .eq('disabled', false)
    ]);

    if (pending.error) throw pending.error;
    if (rolesRes.error) throw rolesRes.error;
    if (profilesRes.error) throw profilesRes.error;

    setPendingUsers(pending.data || []);

    const nameByUserId = new Map<string, string>();
    (profilesRes.data || []).forEach((p: any) => {
      if (p.user_id) nameByUserId.set(p.user_id, p.full_name || 'Utilisateur');
    });

    const mergedRoles = (rolesRes.data || [])
  .filter((r: any) => nameByUserId.has(r.user_id))
  .map((r: any) => ({
    user_id: r.user_id,
    role: r.role,
    profile: { full_name: nameByUserId.get(r.user_id)! },
  }));



    setUserRoles(mergedRoles as any);
  } catch (e: any) {
    console.error(e);
    toast.error(e?.message || 'Erreur lors du chargement');
  } finally {
    setLoading(false);
  }
};


  const approveUser = async (userId: string) => {
    try {
      const { error } = await supabase.rpc('admin_approve_user', { target_user_id: userId });
      if (error) throw error;
      toast.success('Utilisateur approuvé');
      fetchData();
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Impossible d'approuver l'utilisateur");
    }
  };

  const setRole = async (userId: string, role: 'admin' | 'user') => {
    // Safety: don't let admin remove their own admin role (common lock-out)
    if (userId === user?.id && role !== 'admin') {
      toast.error("Action refusée : vous ne pouvez pas vous retirer le rôle admin.");
      return;
    }

    const confirmMsg =
      role === 'admin'
        ? "Confirmer : passer cet utilisateur en ADMIN ?"
        : "Confirmer : repasser cet utilisateur en USER ?";

    if (!window.confirm(confirmMsg)) return;

    try {
      setRolesLoading(true);
      const { error } = await supabase.rpc('admin_set_role', {
        target_user_id: userId,
        new_role: role,
      });
      if (error) throw error;

      toast.success(`Rôle modifié → ${role.toUpperCase()}`);

      // Update local state instantly (no full refetch required)
      setUserRoles((prev) =>
        prev.map((r) => (r.user_id === userId ? { ...r, role } : r))
      );
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Impossible de modifier le rôle (vérifie que tu es admin)');
    } finally {
      setRolesLoading(false);
    }
  };
  const deleteUser = async (userId: string) => {
  if (userId === user?.id) {
    toast.error("Tu ne peux pas supprimer ton propre compte.");
    return;
  }

  if (!window.confirm("Confirmer la désactivation de cet utilisateur ?")) return;

  try {
    setRolesLoading(true);

    const { error } = await supabase
      .from('profiles')
      .update({ disabled: true })
      .eq('user_id', userId);

    if (error) throw error;

    toast.success("Utilisateur désactivé.");

    fetchData();

  } catch (e: any) {
    console.error(e);
    toast.error("Erreur lors de la désactivation.");
  } finally {
    setRolesLoading(false);
  }
};



  const purgeAudit = async () => {
    // safety guard
    if (purgeDays < 7) {
      toast.error('Minimum 7 jours pour éviter une purge accidentelle.');
      return;
    }

    if (!window.confirm(`Confirmer la purge (garder ${purgeDays} jours) ?`)) return;

    try {
      const { data, error } = await supabase.rpc('purge_audit_log', { keep_days: purgeDays });
      if (error) throw error;
      toast.success(`${data} entrées supprimées`);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Erreur pendant la purge');
    }
  };

  const seedHolidays = async () => {
    if (seedYear < 2000 || seedYear > 2100) {
      toast.error('Année invalide (2000–2100).');
      return;
    }

    if (!window.confirm(`Charger les jours fériés marocains pour ${seedYear} ?`)) return;

    try {
      const { data, error } = await supabase.rpc('seed_morocco_holidays', { year: seedYear });
      if (error) throw error;
      toast.success(`${data} jours fériés ajoutés pour ${seedYear}`);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Erreur lors du chargement des jours fériés');
    }
  };

  const pendingCount = pendingUsers.length;
  const adminsCount = useMemo(() => userRoles.filter((r) => r.role === 'admin').length, [userRoles]);

  const filteredRoles = useMemo(() => {
    const s = roleSearch.trim().toLowerCase();
    return userRoles
      .filter((r) => {
        if (roleFilter === 'all') return true;
        return r.role === roleFilter;
      })
      .filter((r) => {
        if (!s) return true;
        const name = (r.profile?.full_name || 'Utilisateur').toLowerCase();
        return name.includes(s) || r.user_id.toLowerCase().includes(s);
      })
      .sort((a, b) => {
        // admins first then alphabetical
        if (a.role !== b.role) return a.role === 'admin' ? -1 : 1;
        const an = (a.profile?.full_name || '').toLowerCase();
        const bn = (b.profile?.full_name || '').toLowerCase();
        return an.localeCompare(bn);
      });
  }, [userRoles, roleFilter, roleSearch]);

  if (loading) return <Skeleton className="h-96 w-full" />;

  if (!isAdmin) {
    return (
      <div className="max-w-3xl mx-auto mt-10">
        <Card>
          <CardHeader>
            <CardTitle>Accès refusé</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">Cette page est réservée aux administrateurs.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-2xl font-bold">Maintenance</div>
          <div className="text-sm text-muted-foreground">
            Approbations, rôles, nettoyage et outils admin.
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">En attente: {pendingCount}</Badge>
          <Badge variant="secondary">Admins: {adminsCount}</Badge>
          <Badge variant="outline">Vous: ADMIN</Badge>
        </div>
      </div>

      {/* Pending approvals */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserCheck className="h-5 w-5" />
            {fr.maintenance.pendingApprovals}
          </CardTitle>
        </CardHeader>

        <CardContent>
          {pendingUsers.length === 0 ? (
            <p className="text-muted-foreground">{fr.maintenance.noUsers}</p>
          ) : (
            <div className="space-y-2">
              {pendingUsers.map((u) => (
                <div
                  key={u.user_id}
                  className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 p-3 bg-muted rounded-lg"
                >
                  <div className="min-w-0">
                    <div className="font-medium truncate">{u.full_name}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      Inscrit le {format(new Date(u.created_at), 'dd MMM yyyy', { locale: frLocale })}
                    </div>
                  </div>

                  <Button size="sm" onClick={() => approveUser(u.user_id)}>
                    {fr.maintenance.approve}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Roles management */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Gestion des rôles (USER / ADMIN)
          </CardTitle>
        </CardHeader>

        <CardContent>
          {/* Controls */}
          <div className="flex flex-col md:flex-row md:items-center gap-3 mb-4">
            <div className="relative w-full md:w-96">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={roleSearch}
                onChange={(e) => setRoleSearch(e.target.value)}
                placeholder="Rechercher un utilisateur (nom ou id)..."
                className="pl-9"
              />
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Button
                type="button"
                variant={roleFilter === 'all' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setRoleFilter('all')}
              >
                Tous
              </Button>
              <Button
                type="button"
                variant={roleFilter === 'admin' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setRoleFilter('admin')}
              >
                Admin
              </Button>
              <Button
                type="button"
                variant={roleFilter === 'user' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setRoleFilter('user')}
              >
                User
              </Button>
            </div>

            <div className="md:ml-auto flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={fetchData} disabled={rolesLoading}>
                Actualiser
              </Button>
              {rolesLoading && (
                <span className="text-xs text-muted-foreground">Mise à jour...</span>
              )}
            </div>
          </div>

          {/* List */}
          {filteredRoles.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun résultat.</p>
          ) : (
            <div className="space-y-2">
              {filteredRoles.map((r) => {
                const name = r.profile?.full_name || 'Utilisateur';
                const isSelf = r.user_id === user?.id;

                return (
                  <div
                    key={r.user_id}
                    className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 p-3 rounded-lg border"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="font-medium truncate">{name}</div>
                        <Badge variant={r.role === 'admin' ? 'default' : 'secondary'}>
                          {r.role.toUpperCase()}
                        </Badge>
                        {isSelf && (
                          <Badge variant="outline">Vous</Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        ID: {r.user_id}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      {r.role === 'admin' ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={rolesLoading || isSelf}
                          onClick={() => setRole(r.user_id, 'user')}
                          title={isSelf ? "Tu ne peux pas retirer ton propre rôle admin." : ''}
                        >
                          Passer USER
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          disabled={rolesLoading}
                          onClick={() => setRole(r.user_id, 'admin')}
                        >
                          Passer ADMIN
                        </Button>
                      )}
                      <Button
  size="sm"
  variant="destructive"
  disabled={rolesLoading || isSelf}
  onClick={() => deleteUser(r.user_id)}
>
  Supprimer
</Button>

                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="text-xs text-muted-foreground mt-3">
            Astuce : utilise la recherche + filtre pour trouver un utilisateur rapidement.
          </div>
        </CardContent>
      </Card>

      {/* Cleanup */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trash2 className="h-5 w-5" />
            {fr.maintenance.cleanup}
          </CardTitle>
        </CardHeader>

        <CardContent className="flex flex-col md:flex-row md:items-center gap-3">
          <div className="flex items-center gap-3">
            <Input
              type="number"
              value={purgeDays}
              onChange={(e) => setPurgeDays(parseInt(e.target.value) || 90)}
              className="w-28"
            />
            <span className="text-sm text-muted-foreground">{fr.maintenance.daysToKeep}</span>
          </div>

          <div className="md:ml-auto flex items-center gap-2">
            <Badge variant="outline">Min: 7 jours</Badge>
            <Button variant="destructive" onClick={purgeAudit}>
              {fr.maintenance.purge}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Seed holidays */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            {fr.maintenance.seedHolidays}
          </CardTitle>
        </CardHeader>

        <CardContent className="flex flex-col md:flex-row md:items-center gap-3">
          <div className="flex items-center gap-3">
            <Input
              type="number"
              value={seedYear}
              onChange={(e) => setSeedYear(parseInt(e.target.value) || new Date().getFullYear())}
              className="w-28"
            />
            <span className="text-sm text-muted-foreground">Année (2000–2100)</span>
          </div>

          <div className="md:ml-auto">
            <Button onClick={seedHolidays}>{fr.holidays.seedMorocco}</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
