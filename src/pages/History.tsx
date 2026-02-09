import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { fr } from '@/lib/i18n';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { History as HistoryIcon } from 'lucide-react';
import { format } from 'date-fns';
import { fr as frLocale } from 'date-fns/locale';

interface AuditEntry { id: string; action: string; table_name: string; record_id: string | null; actor_user_id: string | null; created_at: string; }

export default function History() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from('audit_log_entries').select('*').order('created_at', { ascending: false }).limit(100)
      .then(({ data }) => { setEntries(data || []); setLoading(false); });
  }, []);

  if (loading) return <Skeleton className="h-96 w-full" />;

  return (
    <div className="animate-fade-in">
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><HistoryIcon className="h-5 w-5" />{fr.history.title}</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{fr.history.date}</TableHead>
                <TableHead>{fr.history.action}</TableHead>
                <TableHead>{fr.history.table}</TableHead>
                <TableHead className="hidden md:table-cell">{fr.history.recordId}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map(e => (
                <TableRow key={e.id}>
                  <TableCell>{format(new Date(e.created_at), 'dd/MM/yyyy HH:mm', { locale: frLocale })}</TableCell>
                  <TableCell><Badge variant="secondary">{fr.history.actions[e.action as keyof typeof fr.history.actions] || e.action}</Badge></TableCell>
                  <TableCell>{e.table_name}</TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground font-mono text-xs">{e.record_id?.slice(0, 8) || '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
