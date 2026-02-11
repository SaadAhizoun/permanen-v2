import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { fr } from '@/lib/i18n';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { History as HistoryIcon, Filter, Search, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import { fr as frLocale } from 'date-fns/locale';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

type AuditAction = 'INSERT' | 'UPDATE' | 'DELETE' | string;

interface AuditEntry {
  id: string;
  action: AuditAction;
  table_name: string;
  record_id: string | null;
  actor_user_id: string | null;
  created_at: string;
  // If your table has these columns, they will be used automatically:
  old_data?: any | null;
  new_data?: any | null;
}

type ProfileRow = { user_id: string; full_name: string | null };
type MemberRow = { id: string; full_name: string | null };

function badgeVariant(action: AuditAction) {
  if (action === 'INSERT') return 'default';
  if (action === 'DELETE') return 'destructive';
  return 'secondary';
}

function actionLabel(action: AuditAction) {
  return (fr.history.actions as any)?.[action] || action;
}

function safeShortId(id?: string | null) {
  return id ? id.slice(0, 8) : '—';
}

function getChangedKeys(oldData: any, newData: any) {
  if (!oldData || !newData) return [];
  const keys = new Set([...Object.keys(oldData), ...Object.keys(newData)]);
  const changed: string[] = [];
  keys.forEach((k) => {
    const a = oldData?.[k];
    const b = newData?.[k];
    // basic compare; good enough for this UI
    if (JSON.stringify(a) !== JSON.stringify(b)) changed.push(k);
  });
  return changed;
}

export default function History() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // Enrich
  const [nameByUserId, setNameByUserId] = useState<Map<string, string>>(new Map());
  const [nameByMemberId, setNameByMemberId] = useState<Map<string, string>>(new Map());

  // UX
  const [q, setQ] = useState('');
  const [tableFilter, setTableFilter] = useState<string>('all');
  const [actionFilter, setActionFilter] = useState<string>('all');

  const fetchAll = async () => {
    try {
      setLoading(true);

      const { data: auditData, error: auditErr } = (await supabase
        .from('audit_log_entries')
        // IMPORTANT: keep * to support old_data/new_data if they exist
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200)) as any;

      if (auditErr) throw auditErr;

      const rows: AuditEntry[] = (auditData || []) as any;
      setEntries(rows);

      // Collect actor ids
      const actorIds = Array.from(
        new Set(rows.map((r) => r.actor_user_id).filter(Boolean) as string[])
      );

      // Collect team_member ids from old/new data if available
      const memberIds = Array.from(
        new Set(
          rows
            .flatMap((r) => {
              const ids: Array<string | null | undefined> = [];
              ids.push(r?.new_data?.team_member_id);
              ids.push(r?.old_data?.team_member_id);
              return ids;
            })
            .filter(Boolean) as string[]
        )
      );

      // Fetch profiles names
      if (actorIds.length > 0) {
        const { data: profData, error: profErr } = (await supabase
          .from('profiles')
          .select('user_id, full_name')
          .in('user_id', actorIds)) as any;

        if (!profErr) {
          const map = new Map<string, string>();
          (profData as ProfileRow[] | null)?.forEach((p) => {
            if (p.user_id) map.set(p.user_id, p.full_name || 'Utilisateur');
          });
          setNameByUserId(map);
        }
      } else {
        setNameByUserId(new Map());
      }

      // Fetch team_members names (for duty_entries)
      if (memberIds.length > 0) {
        const { data: memData, error: memErr } = (await supabase
          .from('team_members')
          .select('id, full_name')
          .in('id', memberIds)) as any;

        if (!memErr) {
          const map = new Map<string, string>();
          (memData as MemberRow[] | null)?.forEach((m) => {
            if (m.id) map.set(m.id, m.full_name || 'Membre');
          });
          setNameByMemberId(map);
        }
      } else {
        setNameByMemberId(new Map());
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tables = useMemo(() => {
    const set = new Set(entries.map((e) => e.table_name).filter(Boolean));
    return ['all', ...Array.from(set).sort()];
  }, [entries]);

  const actions = useMemo(() => {
    const set = new Set(entries.map((e) => e.action).filter(Boolean));
    return ['all', ...Array.from(set).sort()];
  }, [entries]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return entries.filter((e) => {
      if (tableFilter !== 'all' && e.table_name !== tableFilter) return false;
      if (actionFilter !== 'all' && e.action !== actionFilter) return false;

      if (!s) return true;

      const actorName = e.actor_user_id ? nameByUserId.get(e.actor_user_id) || '' : '';
      const recId = e.record_id || '';
      const tname = e.table_name || '';
      const action = e.action || '';

      // also search inside duty_entries summary fields (if present)
      const dutyDate = e?.new_data?.duty_date || e?.old_data?.duty_date || '';
      const memberId = e?.new_data?.team_member_id || e?.old_data?.team_member_id || '';
      const memberName = memberId ? nameByMemberId.get(memberId) || '' : '';

      const hay = `${actorName} ${recId} ${tname} ${action} ${dutyDate} ${memberName}`.toLowerCase();
      return hay.includes(s);
    });
  }, [entries, q, tableFilter, actionFilter, nameByUserId, nameByMemberId]);

  const renderDetails = (e: AuditEntry) => {
    // If your audit table doesn't store old_data/new_data, we show a fallback.
    const hasAnyJson = !!(e.old_data || e.new_data);

    // Nice details specifically for duty_entries
    if (e.table_name === 'duty_entries' && hasAnyJson) {
      const dutyDate = e?.new_data?.duty_date || e?.old_data?.duty_date || null;
      const memberId = e?.new_data?.team_member_id || e?.old_data?.team_member_id || null;
      const memberName = memberId ? nameByMemberId.get(memberId) || safeShortId(memberId) : '—';

      if (e.action === 'INSERT') {
        return `Ajout: ${dutyDate || '—'} → ${memberName}`;
      }
      if (e.action === 'DELETE') {
        return `Suppression: ${dutyDate || '—'} → ${memberName}`;
      }

      // UPDATE
      const changed = getChangedKeys(e.old_data, e.new_data);
      const interesting = changed.filter((k) =>
        ['duty_date', 'team_member_id', 'duty_type', 'notes'].includes(k)
      );

      if (interesting.includes('team_member_id')) {
        const oldId = e?.old_data?.team_member_id;
        const newId = e?.new_data?.team_member_id;
        const oldName = oldId ? nameByMemberId.get(oldId) || safeShortId(oldId) : '—';
        const newName = newId ? nameByMemberId.get(newId) || safeShortId(newId) : '—';
        return `Changement membre: ${oldName} → ${newName}${dutyDate ? ` (date: ${dutyDate})` : ''}`;
      }

      if (interesting.length > 0) {
        return `Modification: ${interesting.join(', ')}${dutyDate ? ` (date: ${dutyDate})` : ''}`;
      }

      return `Modification (détails dispo)`;
    }

    // Generic fallback
    if (hasAnyJson && e.action === 'UPDATE') {
      const changed = getChangedKeys(e.old_data, e.new_data);
      if (changed.length > 0) return `Champs modifiés: ${changed.slice(0, 4).join(', ')}${changed.length > 4 ? '…' : ''}`;
      return 'Modification';
    }

    return '—';
  };

  if (loading) return <Skeleton className="h-96 w-full" />;

  return (
    <div className="animate-fade-in space-y-4">
      <Card>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <CardTitle className="flex items-center gap-2">
            <HistoryIcon className="h-5 w-5" />
            {fr.history.title}
          </CardTitle>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={fetchAll}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Actualiser
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          {/* Filters */}
          <div className="flex flex-col md:flex-row md:items-center gap-3">
            <div className="relative w-full md:w-96">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Rechercher (utilisateur, date, membre, table, id)..."
                className="pl-9"
              />
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Filter className="h-4 w-4 text-muted-foreground" />

              <select
                className="border rounded-md px-2 py-2 text-sm bg-background"
                value={tableFilter}
                onChange={(e) => setTableFilter(e.target.value)}
              >
                {tables.map((t) => (
                  <option key={t} value={t}>
                    {t === 'all' ? 'Toutes tables' : t}
                  </option>
                ))}
              </select>

              <select
                className="border rounded-md px-2 py-2 text-sm bg-background"
                value={actionFilter}
                onChange={(e) => setActionFilter(e.target.value)}
              >
                {actions.map((a) => (
                  <option key={a} value={a}>
                    {a === 'all' ? 'Toutes actions' : actionLabel(a)}
                  </option>
                ))}
              </select>

              <Badge variant="outline">{filtered.length} / {entries.length}</Badge>
            </div>
          </div>
        </CardContent>

        {/* Table */}
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{fr.history.date}</TableHead>
                <TableHead>{fr.history.action}</TableHead>
                <TableHead>Par</TableHead>
                <TableHead>{fr.history.table}</TableHead>
                <TableHead className="hidden lg:table-cell">Détails</TableHead>
                <TableHead className="hidden md:table-cell">{fr.history.recordId}</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {filtered.map((e) => {
                const actor =
                  e.actor_user_id ? nameByUserId.get(e.actor_user_id) || 'Utilisateur' : '—';

                return (
                  <TableRow key={e.id}>
                    <TableCell>
                      {format(new Date(e.created_at), 'dd/MM/yyyy HH:mm', { locale: frLocale })}
                    </TableCell>

                    <TableCell>
                      <Badge variant={badgeVariant(e.action)}>
                        {actionLabel(e.action)}
                      </Badge>
                    </TableCell>

                    <TableCell className="text-sm">
                      {actor}
                    </TableCell>

                    <TableCell>{e.table_name}</TableCell>

                    <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                      {renderDetails(e)}
                    </TableCell>

                    <TableCell className="hidden md:table-cell text-muted-foreground font-mono text-xs">
                      {safeShortId(e.record_id)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          {filtered.length === 0 && (
            <div className="p-6 text-sm text-muted-foreground">
              Aucun résultat.
            </div>
          )}
        </CardContent>
      </Card>

      <div className="text-xs text-muted-foreground">
        Note: si tu veux voir exactement “avant → après”, il faut que <code>audit_log_entries</code> contienne <code>old_data</code> et <code>new_data</code>.
        Sinon, la colonne “Détails” restera limitée.
      </div>
    </div>
  );
}
