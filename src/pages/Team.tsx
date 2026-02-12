import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { fr } from '@/lib/i18n';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Users, Plus, Pencil, Trash2, Search } from 'lucide-react';
import { format } from 'date-fns';
import { fr as frLocale } from 'date-fns/locale';
import { toast } from 'sonner';
import { useAuthContext } from '@/contexts/AuthContext';

interface TeamMember {
  id: string;
  full_name: string;
  email: string | null;
  title: string | null;
  active: boolean;
  created_at: string;

  initial_credit_normal?: number | null;
  initial_credit_holiday?: number | null;

  month_duties?: number;
  year_duties?: number;

  last_duty_normal?: string | null;
  last_duty_holiday?: string | null;
}

type DutyRow = {
  team_member_id: string | null;
  duty_date: string; // YYYY-MM-DD
};

export default function Team() {
  const { isAdmin } = useAuthContext();

  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formTitle, setFormTitle] = useState('');
  const [formActive, setFormActive] = useState(true);

  // Credits
  const [formCreditNormal, setFormCreditNormal] = useState<number>(0);
  const [formCreditHoliday, setFormCreditHoliday] = useState<number>(0);

  useEffect(() => {
    fetchMembers();
  }, []);

  const fetchMembers = async () => {
    try {
      setLoading(true);

      // 1) Members
      const { data: membersData, error: membersError } = await supabase
        .from('team_members')
        .select('*')
        .order('full_name');

      if (membersError) throw membersError;

      const baseMembers = (membersData || []) as TeamMember[];
      const ids = baseMembers.map((m) => m.id);

      // 2) Holidays (for classification)
      const { data: holidaysData, error: holidaysError } = await supabase
        .from('holidays')
        .select('date');

      if (holidaysError) throw holidaysError;

      const holidaySet = new Set<string>(
        (holidaysData || [])
          .map((h: any) => h?.date)
          .filter(Boolean)
      );

      // 3) Duties for all members (single query)
      //    NOTE: increase limit if you have a LOT of duties
      const { data: dutiesData, error: dutiesError } = await supabase
        .from('duty_entries')
        .select('team_member_id, duty_date')
        .in('team_member_id', ids)
        .order('duty_date', { ascending: false })
        .limit(5000);

      if (dutiesError) throw dutiesError;

      const duties = (dutiesData || []) as DutyRow[];

      // Compute “ce mois-ci” + “cette année”
      const now = new Date();
      const monthStartStr = format(new Date(now.getFullYear(), now.getMonth(), 1), 'yyyy-MM-dd');
      const yearStartStr = format(new Date(now.getFullYear(), 0, 1), 'yyyy-MM-dd');

      // Aggregation maps
      const monthCount = new Map<string, number>();
      const yearCount = new Map<string, number>();
      const lastNormal = new Map<string, string>();
      const lastHoliday = new Map<string, string>();

      for (const d of duties) {
        const mid = d.team_member_id;
        if (!mid) continue;

        const dateStr = d.duty_date; // YYYY-MM-DD
        const isHoliday = holidaySet.has(dateStr);

        // counts
        if (dateStr >= monthStartStr) {
          monthCount.set(mid, (monthCount.get(mid) || 0) + 1);
        }
        if (dateStr >= yearStartStr) {
          yearCount.set(mid, (yearCount.get(mid) || 0) + 1);
        }

        // last normal / holiday
        if (isHoliday) {
          if (!lastHoliday.get(mid) || dateStr > (lastHoliday.get(mid) as string)) {
            lastHoliday.set(mid, dateStr);
          }
        } else {
          if (!lastNormal.get(mid) || dateStr > (lastNormal.get(mid) as string)) {
            lastNormal.set(mid, dateStr);
          }
        }
      }

      const membersWithStats = baseMembers.map((m) => ({
        ...m,
        month_duties: monthCount.get(m.id) || 0,
        year_duties: yearCount.get(m.id) || 0,
        last_duty_normal: lastNormal.get(m.id) || null,
        last_duty_holiday: lastHoliday.get(m.id) || null,
      }));

      setMembers(membersWithStats);
    } catch (error) {
      console.error('Error fetching team members:', error);
      toast.error("Erreur lors du chargement de l'équipe");
    } finally {
      setLoading(false);
    }
  };

  const openAddDialog = () => {
    setEditingMember(null);
    setFormName('');
    setFormEmail('');
    setFormTitle('');
    setFormActive(true);
    setFormCreditNormal(0);
    setFormCreditHoliday(0);
    setDialogOpen(true);
  };

  const openEditDialog = (member: TeamMember) => {
    setEditingMember(member);
    setFormName(member.full_name);
    setFormEmail(member.email || '');
    setFormTitle(member.title || '');
    setFormActive(member.active);
    setFormCreditNormal(Number(member.initial_credit_normal ?? 0));
    setFormCreditHoliday(Number(member.initial_credit_holiday ?? 0));
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!formName.trim()) {
      toast.error('Le nom est obligatoire');
      return;
    }

    const payload = {
      full_name: formName.trim(),
      email: formEmail.trim() || null,
      title: formTitle.trim() || null,
      active: formActive,
      initial_credit_normal: Math.max(0, Number.isFinite(formCreditNormal) ? formCreditNormal : 0),
      initial_credit_holiday: Math.max(0, Number.isFinite(formCreditHoliday) ? formCreditHoliday : 0),
    };

    try {
      if (editingMember) {
        const { error } = await supabase
          .from('team_members')
          .update(payload)
          .eq('id', editingMember.id);

        if (error) throw error;
        toast.success('Membre modifié');
      } else {
        const { error } = await supabase.from('team_members').insert(payload);
        if (error) throw error;
        toast.success('Membre ajouté');
      }

      setDialogOpen(false);
      fetchMembers();
    } catch (error) {
      console.error('Error saving member:', error);
      toast.error("Erreur lors de l'enregistrement");
    }
  };

  const handleDelete = async (memberId: string) => {
    try {
      const { error } = await supabase.from('team_members').delete().eq('id', memberId);
      if (error) throw error;

      toast.success('Membre supprimé');
      fetchMembers();
    } catch (error) {
      console.error('Error deleting member:', error);
      toast.error('Erreur lors de la suppression');
    }
  };

  const filteredMembers = useMemo(() => {
    const q = search.toLowerCase();
    return members.filter(
      (m) =>
        m.full_name.toLowerCase().includes(q) ||
        m.email?.toLowerCase().includes(q) ||
        m.title?.toLowerCase().includes(q)
    );
  }, [members, search]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher un membre..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openAddDialog}>
              <Plus className="mr-2 h-4 w-4" />
              {fr.team.addMember}
            </Button>
          </DialogTrigger>

          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingMember ? fr.team.editMember : fr.team.addMember}</DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>{fr.team.fullName} *</Label>
                <Input value={formName} onChange={(e) => setFormName(e.target.value)} />
              </div>

              <div className="space-y-2">
                <Label>{fr.team.email}</Label>
                <Input type="email" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} />
              </div>

              <div className="space-y-2">
                <Label>{fr.team.grade}</Label>
                <Input value={formTitle} onChange={(e) => setFormTitle(e.target.value)} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Crédit initial (Normal)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={formCreditNormal}
                    onChange={(e) => setFormCreditNormal(Math.max(0, parseInt(e.target.value || '0', 10)))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Crédit initial (Férié)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={formCreditHoliday}
                    onChange={(e) => setFormCreditHoliday(Math.max(0, parseInt(e.target.value || '0', 10)))}
                  />
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Switch id="active" checked={formActive} onCheckedChange={setFormActive} />
                <Label htmlFor="active">{formActive ? fr.team.active : fr.team.inactive}</Label>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                {fr.common.cancel}
              </Button>
              <Button onClick={handleSubmit}>{fr.common.save}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{fr.team.fullName}</TableHead>
                <TableHead className="hidden md:table-cell">{fr.team.grade}</TableHead>

                {/* ✅ Renamed columns */}
                <TableHead className="text-center">Ce mois-ci</TableHead>
                <TableHead className="text-center hidden sm:table-cell">Cette année</TableHead>

                {/* ✅ Split last duty */}
                <TableHead className="hidden lg:table-cell">Dernière (Normal)</TableHead>
                <TableHead className="hidden lg:table-cell">Dernière (Férié)</TableHead>

                <TableHead className="text-center">Statut</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {filteredMembers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                    <Users className="mx-auto h-12 w-12 mb-4 opacity-50" />
                    <p>{fr.team.noMembers}</p>
                  </TableCell>
                </TableRow>
              ) : (
                filteredMembers.map((member) => {

                  return (
                    <TableRow key={member.id} className="data-table-row">
                      <TableCell>
                        <div>
                          <span className="font-medium">{member.full_name}</span>
                          {member.email && (
                            <span className="text-muted-foreground text-sm block">{member.email}</span>
                          )}
                        </div>
                      </TableCell>

                      <TableCell className="hidden md:table-cell">{member.title || '—'}</TableCell>

                      <TableCell className="text-center font-medium">{member.month_duties || 0}</TableCell>
                      <TableCell className="text-center hidden sm:table-cell">{member.year_duties || 0}</TableCell>

                      <TableCell className="hidden lg:table-cell">
                        {member.last_duty_normal
                          ? format(new Date(member.last_duty_normal), 'd MMM yyyy', { locale: frLocale })
                          : '—'}
                      </TableCell>

                      <TableCell className="hidden lg:table-cell">
                        {member.last_duty_holiday
                          ? format(new Date(member.last_duty_holiday), 'd MMM yyyy', { locale: frLocale })
                          : '—'}
                      </TableCell>

                      <TableCell className="text-center">
                        <Badge variant={member.active ? 'default' : 'secondary'}>
                          {member.active ? fr.team.active : fr.team.inactive}
                        </Badge>
                      </TableCell>

                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="ghost" size="icon" onClick={() => openEditDialog(member)}>
                            <Pencil className="h-4 w-4" />
                          </Button>

                          {isAdmin && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="text-destructive hover:text-destructive"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>

                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>{fr.common.confirmDelete}</AlertDialogTitle>
                                  <AlertDialogDescription>{fr.common.deleteWarning}</AlertDialogDescription>
                                </AlertDialogHeader>

                                <AlertDialogFooter>
                                  <AlertDialogCancel>{fr.common.cancel}</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => handleDelete(member.id)}
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  >
                                    {fr.common.delete}
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
