import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { fr } from '@/lib/i18n';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  month_duties?: number;
  year_duties?: number;
  last_duty?: string | null;
}

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

  useEffect(() => {
    fetchMembers();
  }, []);

  const fetchMembers = async () => {
    try {
      const { data: membersData, error: membersError } = await supabase
        .from('team_members')
        .select('*')
        .order('full_name');

      if (membersError) throw membersError;

      // Fetch duty stats for each member
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const yearStart = new Date(now.getFullYear(), 0, 1);

      const membersWithStats = await Promise.all(
        (membersData || []).map(async (member) => {
          // Month duties count
          const { count: monthDuties } = await supabase
            .from('duty_entries')
            .select('*', { count: 'exact', head: true })
            .eq('team_member_id', member.id)
            .gte('duty_date', format(monthStart, 'yyyy-MM-dd'));

          // Year duties count
          const { count: yearDuties } = await supabase
            .from('duty_entries')
            .select('*', { count: 'exact', head: true })
            .eq('team_member_id', member.id)
            .gte('duty_date', format(yearStart, 'yyyy-MM-dd'));

          // Last duty
          const { data: lastDutyData } = await supabase
            .from('duty_entries')
            .select('duty_date')
            .eq('team_member_id', member.id)
            .order('duty_date', { ascending: false })
            .limit(1)
            .maybeSingle();

          return {
            ...member,
            month_duties: monthDuties || 0,
            year_duties: yearDuties || 0,
            last_duty: lastDutyData?.duty_date || null,
          };
        })
      );

      setMembers(membersWithStats);
    } catch (error) {
      console.error('Error fetching team members:', error);
      toast.error('Erreur lors du chargement de l\'équipe');
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
    setDialogOpen(true);
  };

  const openEditDialog = (member: TeamMember) => {
    setEditingMember(member);
    setFormName(member.full_name);
    setFormEmail(member.email || '');
    setFormTitle(member.title || '');
    setFormActive(member.active);
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!formName.trim()) {
      toast.error('Le nom est obligatoire');
      return;
    }

    try {
      if (editingMember) {
        const { error } = await supabase
          .from('team_members')
          .update({
            full_name: formName.trim(),
            email: formEmail.trim() || null,
            title: formTitle.trim() || null,
            active: formActive,
          })
          .eq('id', editingMember.id);

        if (error) throw error;
        toast.success('Membre modifié');
      } else {
        const { error } = await supabase
          .from('team_members')
          .insert({
            full_name: formName.trim(),
            email: formEmail.trim() || null,
            title: formTitle.trim() || null,
            active: formActive,
          });

        if (error) throw error;
        toast.success('Membre ajouté');
      }

      setDialogOpen(false);
      fetchMembers();
    } catch (error) {
      console.error('Error saving member:', error);
      toast.error('Erreur lors de l\'enregistrement');
    }
  };

  const handleDelete = async (memberId: string) => {
    try {
      const { error } = await supabase
        .from('team_members')
        .delete()
        .eq('id', memberId);

      if (error) throw error;
      toast.success('Membre supprimé');
      fetchMembers();
    } catch (error) {
      console.error('Error deleting member:', error);
      toast.error('Erreur lors de la suppression');
    }
  };

  const filteredMembers = members.filter((m) =>
    m.full_name.toLowerCase().includes(search.toLowerCase()) ||
    m.email?.toLowerCase().includes(search.toLowerCase()) ||
    m.title?.toLowerCase().includes(search.toLowerCase())
  );

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
              <DialogTitle>
                {editingMember ? fr.team.editMember : fr.team.addMember}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>{fr.team.fullName} *</Label>
                <Input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Jean Dupont"
                />
              </div>
              <div className="space-y-2">
                <Label>{fr.team.email}</Label>
                <Input
                  type="email"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  placeholder="jean.dupont@exemple.com"
                />
              </div>
              <div className="space-y-2">
                <Label>{fr.team.grade}</Label>
                <Input
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="Médecin, Interne, etc."
                />
              </div>
              <div className="flex items-center gap-3">
                <Switch
                  id="active"
                  checked={formActive}
                  onCheckedChange={setFormActive}
                />
                <Label htmlFor="active">
                  {formActive ? fr.team.active : fr.team.inactive}
                </Label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                {fr.common.cancel}
              </Button>
              <Button onClick={handleSubmit}>
                {fr.common.save}
              </Button>
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
                <TableHead className="text-center">{fr.team.monthDuties}</TableHead>
                <TableHead className="text-center hidden sm:table-cell">{fr.team.yearDuties}</TableHead>
                <TableHead className="hidden lg:table-cell">{fr.team.lastDuty}</TableHead>
                <TableHead className="text-center">Statut</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredMembers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    <Users className="mx-auto h-12 w-12 mb-4 opacity-50" />
                    <p>{fr.team.noMembers}</p>
                  </TableCell>
                </TableRow>
              ) : (
                filteredMembers.map((member) => (
                  <TableRow key={member.id} className="data-table-row">
                    <TableCell>
                      <div>
                        <span className="font-medium">{member.full_name}</span>
                        {member.email && (
                          <span className="text-muted-foreground text-sm block">
                            {member.email}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {member.title || '—'}
                    </TableCell>
                    <TableCell className="text-center font-medium">
                      {member.month_duties}
                    </TableCell>
                    <TableCell className="text-center hidden sm:table-cell">
                      {member.year_duties}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {member.last_duty
                        ? format(new Date(member.last_duty), 'd MMM yyyy', { locale: frLocale })
                        : '—'}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant={member.active ? 'default' : 'secondary'}>
                        {member.active ? fr.team.active : fr.team.inactive}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditDialog(member)}
                        >
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
                                <AlertDialogDescription>
                                  {fr.common.deleteWarning}
                                </AlertDialogDescription>
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
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
