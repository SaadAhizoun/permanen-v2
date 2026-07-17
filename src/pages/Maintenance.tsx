import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthContext } from '@/contexts/AuthContext';
import { fr } from '@/lib/i18n';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { PageHeader, LoadingState, EmptyState, StatusBadge } from '@/components/shared';
import { AnimatedSection, AnimatedList, AnimatedNumber } from '@/components/motion';
import { UserCheck, Shield, Trash2, Sparkles, Search, Filter, Users } from 'lucide-react';
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
  const [confirming, setConfirming] = useState(false);
  const [roleSearch, setRoleSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');

  // Destructive-action confirmation (replaces window.confirm with an on-brand dialog)
  const [confirmState, setConfirmState] = useState<null | {
    title: string;
    description: string;
    confirmLabel?: string;
    destructive?: boolean;
    onConfirm: () => void;
  }>(null);

  const askConfirm = (opts: {
    title: string;
    description: string;
    confirmLabel?: string;
    destructive?: boolean;
    onConfirm: () => void;
  }) => setConfirmState((current) => current ?? opts);

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

    const doSetRole = async () => {
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

    askConfirm({
      title: role === 'admin' ? 'Passer cet utilisateur en ADMIN ?' : 'Repasser cet utilisateur en USER ?',
      description:
        role === 'admin'
          ? "Cet utilisateur aura accès à toutes les actions d'administration."
          : "Cet utilisateur perdra l'accès aux actions d'administration.",
      confirmLabel: 'Confirmer',
      onConfirm: doSetRole,
    });
  };
  const deleteUser = async (userId: string) => {
  if (userId === user?.id) {
    toast.error("Tu ne peux pas supprimer ton propre compte.");
    return;
  }

  askConfirm({
    title: 'Désactiver cet utilisateur ?',
    description: "Il ne pourra plus se connecter à l'application. Cette action peut être annulée manuellement en base si besoin.",
    confirmLabel: 'Désactiver',
    destructive: true,
    onConfirm: async () => {
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
    },
  });
};



  const purgeAudit = async () => {
    // safety guard
    if (purgeDays < 7) {
      toast.error('Minimum 7 jours pour éviter une purge accidentelle.');
      return;
    }

    askConfirm({
      title: `Purger le journal d'audit ?`,
      description: `Toutes les entrées plus anciennes que ${purgeDays} jours seront définitivement supprimées.`,
      confirmLabel: 'Purger',
      destructive: true,
      onConfirm: async () => {
        try {
          const { data, error } = await supabase.rpc('purge_audit_log', { keep_days: purgeDays });
          if (error) throw error;
          toast.success(`${data} entrées supprimées`);
        } catch (e: any) {
          console.error(e);
          toast.error(e?.message || 'Erreur pendant la purge');
        }
      },
    });
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

  if (loading) return <LoadingState variant="list" rows={3} />;

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
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <PageHeader
        eyebrow="Administration"
        title="Maintenance"
        description="Approbations, rôles, nettoyage et outils admin."
        icon={<Shield />}
        accent="primary"
        actions={
          <>
            <StatusBadge tone={pendingCount > 0 ? 'warning' : 'neutral'}>
              En attente: <AnimatedNumber value={pendingCount} className="inline" />
            </StatusBadge>
            <StatusBadge tone="accent">
              Admins: <AnimatedNumber value={adminsCount} className="inline" />
            </StatusBadge>
            <StatusBadge tone="success">Vous: ADMIN</StatusBadge>
          </>
        }
      />

      {/* Pending approvals */}
      <AnimatedSection>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-warning/10 text-warning">
              <UserCheck className="h-4 w-4" />
            </span>
            {fr.maintenance.pendingApprovals}
          </CardTitle>
        </CardHeader>

        <CardContent>
          {pendingUsers.length === 0 ? (
            <EmptyState icon={<UserCheck />} title={fr.maintenance.noUsers} />
          ) : (
            <div className="space-y-2">
              <AnimatedList
                items={pendingUsers}
                getKey={(u) => u.user_id}
                itemClassName="flex flex-col md:flex-row md:items-center md:justify-between gap-2 p-3 bg-muted rounded-lg"
                renderItem={(u) => (
                  <>
                    <div className="min-w-0">
                      <div className="font-medium truncate">{u.full_name}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        Inscrit le {format(new Date(u.created_at), 'dd MMM yyyy', { locale: frLocale })}
                      </div>
                    </div>

                    <Button size="sm" onClick={() => approveUser(u.user_id)}>
                      {fr.maintenance.approve}
                    </Button>
                  </>
                )}
              />
            </div>
          )}
        </CardContent>
      </Card>
      </AnimatedSection>

      {/* Roles management */}
      <AnimatedSection delay={0.08}>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Shield className="h-4 w-4" />
            </span>
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
            <EmptyState icon={<Users />} title="Aucun résultat" description="Aucun utilisateur ne correspond à cette recherche." />
          ) : (
            <div className="space-y-2">
              <AnimatedList
                items={filteredRoles}
                getKey={(r) => r.user_id}
                itemClassName="flex flex-col md:flex-row md:items-center md:justify-between gap-2 p-3 rounded-lg border"
                layout
                renderItem={(r) => {
                  const name = r.profile?.full_name || 'Utilisateur';
                  const isSelf = r.user_id === user?.id;

                  return (
                    <>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className="font-medium truncate">{name}</div>
                          <StatusBadge tone={r.role === 'admin' ? 'accent' : 'neutral'}>
                            {r.role.toUpperCase()}
                          </StatusBadge>
                          {isSelf && (
                            <StatusBadge tone="info">Vous</StatusBadge>
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
                    </>
                  );
                }}
              />
            </div>
          )}

          <div className="text-xs text-muted-foreground mt-3">
            Astuce : utilise la recherche + filtre pour trouver un utilisateur rapidement.
          </div>
        </CardContent>
      </Card>
      </AnimatedSection>

      {/* Cleanup */}
      <AnimatedSection delay={0.16}>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
              <Trash2 className="h-4 w-4" />
            </span>
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
      </AnimatedSection>

      {/* Seed holidays */}
      <AnimatedSection delay={0.24}>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-info/10 text-info">
              <Sparkles className="h-4 w-4" />
            </span>
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
      </AnimatedSection>

      <AlertDialog
        open={!!confirmState}
        onOpenChange={(open) => {
          if (!open && !confirming) setConfirmState(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmState?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirmState?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={confirming}>{fr.common.cancel}</AlertDialogCancel>
            <AlertDialogAction
              className={confirmState?.destructive ? 'bg-gradient-danger text-destructive-foreground shadow-sm shadow-destructive/20 hover:brightness-110' : undefined}
              disabled={confirming}
              onClick={async (event) => {
                event.preventDefault();
                const action = confirmState?.onConfirm;
                if (!action || confirming) return;

                setConfirming(true);
                try {
                  await action();
                } finally {
                  setConfirming(false);
                  setConfirmState(null);
                }
              }}
            >
              {confirming ? 'Traitement…' : (confirmState?.confirmLabel || fr.common.confirm)}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
