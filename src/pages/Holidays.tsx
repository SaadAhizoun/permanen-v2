import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthContext } from '@/contexts/AuthContext';
import { fr } from '@/lib/i18n';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { LoadingState, EmptyState, PageHeader } from '@/components/shared';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Umbrella, Plus, Trash2, Calendar as CalendarIcon, Sparkles } from 'lucide-react';
import { format } from 'date-fns';
import { fr as frLocale } from 'date-fns/locale';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { AnimatedSection, StaggerContainer, StaggerItem, AnimatedList } from '@/components/motion';

interface Holiday {
  id: string;
  date: string;
  label: string;
  country: string;
}

export default function Holidays() {
  const { isAdmin } = useAuthContext();
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [seedYear, setSeedYear] = useState(new Date().getFullYear());
  const [seeding, setSeeding] = useState(false);

  // Form state
  const [formDate, setFormDate] = useState<Date | undefined>();
  const [formLabel, setFormLabel] = useState('');
  const [formCountry, setFormCountry] = useState('MA');

  useEffect(() => {
    fetchHolidays();
  }, []);

  const fetchHolidays = async () => {
    try {
      const { data, error } = await supabase
        .from('holidays')
        .select('*')
        .order('date', { ascending: true });

      if (error) throw error;
      setHolidays(data || []);
    } catch (error) {
      console.error('Error fetching holidays:', error);
      toast.error('Erreur lors du chargement des jours fériés');
    } finally {
      setLoading(false);
    }
  };

  const handleAddHoliday = async () => {
    if (!formDate || !formLabel.trim()) {
      toast.error('Veuillez remplir tous les champs');
      return;
    }

    try {
      const { error } = await supabase.from('holidays').insert({
        date: format(formDate, 'yyyy-MM-dd'),
        label: formLabel.trim(),
        country: formCountry,
      });

      if (error) {
        if (error.code === '23505') {
          toast.error('Un jour férié existe déjà à cette date');
        } else {
          throw error;
        }
        return;
      }

      toast.success('Jour férié ajouté');
      setDialogOpen(false);
      setFormDate(undefined);
      setFormLabel('');
      fetchHolidays();
    } catch (error) {
      console.error('Error adding holiday:', error);
      toast.error('Erreur lors de l\'ajout');
    }
  };

  const handleDeleteHoliday = async (id: string) => {
    try {
      const { error } = await supabase.from('holidays').delete().eq('id', id);
      if (error) throw error;
      toast.success('Jour férié supprimé');
      fetchHolidays();
    } catch (error) {
      console.error('Error deleting holiday:', error);
      toast.error('Erreur lors de la suppression');
    }
  };

  const handleSeedMoroccoHolidays = async () => {
    setSeeding(true);
    try {
      const { data, error } = await supabase.rpc('seed_morocco_holidays', { year: seedYear });
      if (error) throw error;
      toast.success(`${data} jours fériés marocains ajoutés pour ${seedYear}`);
      fetchHolidays();
    } catch (error: any) {
      console.error('Error seeding holidays:', error);
      toast.error(error.message || 'Erreur lors du chargement');
    } finally {
      setSeeding(false);
    }
  };

  // Group holidays by month
  const groupedHolidays = holidays.reduce((acc, holiday) => {
    const month = format(new Date(holiday.date), 'MMMM yyyy', { locale: frLocale });
    if (!acc[month]) acc[month] = [];
    acc[month].push(holiday);
    return acc;
  }, {} as Record<string, Holiday[]>);

  if (loading) {
    return (
      <div className="space-y-6">
        <LoadingState variant="table" rows={5} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Calendrier"
        title={fr.nav.holidays}
        description="Jours fériés pris en compte dans les calculs de permanence."
        icon={<Umbrella />}
        accent="warning"
      />

      <AnimatedSection className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        {isAdmin && (
          <div className="flex items-center gap-2">
            <Select value={String(seedYear)} onValueChange={(v) => setSeedYear(parseInt(v))}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[2024, 2025, 2026, 2027, 2028].map((year) => (
                  <SelectItem key={year} value={String(year)}>
                    {year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={handleSeedMoroccoHolidays} disabled={seeding}>
              <Sparkles className="mr-2 h-4 w-4" />
              {seeding ? 'Chargement...' : fr.holidays.seedMorocco}
            </Button>
          </div>
        )}

        {isAdmin && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                {fr.holidays.add}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{fr.holidays.add}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>{fr.holidays.date} *</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn('w-full justify-start', !formDate && 'text-muted-foreground')}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {formDate ? format(formDate, 'PPP', { locale: frLocale }) : 'Sélectionner une date'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={formDate}
                        onSelect={setFormDate}
                        locale={frLocale}
                        className="p-3 pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="space-y-2">
                  <Label>{fr.holidays.label} *</Label>
                  <Input
                    value={formLabel}
                    onChange={(e) => setFormLabel(e.target.value)}
                    placeholder="Fête du Trône"
                  />
                </div>
                <div className="space-y-2">
                  <Label>{fr.holidays.country}</Label>
                  <Input
                    value={formCountry}
                    onChange={(e) => setFormCountry(e.target.value)}
                    placeholder="MA"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  {fr.common.cancel}
                </Button>
                <Button onClick={handleAddHoliday}>
                  {fr.common.save}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </AnimatedSection>

      {holidays.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={<Umbrella />}
              title={fr.holidays.noHolidays}
              action={
                isAdmin ? (
                  <Button variant="outline" size="sm" onClick={() => setDialogOpen(true)}>
                    Ajouter un jour férié
                  </Button>
                ) : undefined
              }
            />
          </CardContent>
        </Card>
      ) : (
        <StaggerContainer className="space-y-6">
          {Object.entries(groupedHolidays).map(([month, monthHolidays]) => (
            <StaggerItem key={month}>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base capitalize">
                    <span className="flex h-7 w-7 items-center justify-center rounded-md bg-warning/10 text-warning">
                      <CalendarIcon className="h-3.5 w-3.5" />
                    </span>
                    {month}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{fr.holidays.date}</TableHead>
                        <TableHead>{fr.holidays.label}</TableHead>
                        <TableHead>{fr.holidays.country}</TableHead>
                        {isAdmin && <TableHead className="text-right">Actions</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <AnimatedList
                        items={monthHolidays}
                        getKey={(holiday) => holiday.id}
                        as="tr"
                        itemClassName="border-b transition-colors data-[state=selected]:bg-muted hover:bg-muted/50"
                        renderItem={(holiday) => (
                          <>
                            <TableCell>
                              {format(new Date(holiday.date), 'EEEE d', { locale: frLocale })}
                            </TableCell>
                            <TableCell>{holiday.label}</TableCell>
                            <TableCell>
                              <Badge variant="secondary" className="bg-info/10 text-info border-0">
                                {holiday.country}
                              </Badge>
                            </TableCell>
                            {isAdmin && (
                              <TableCell className="text-right">
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive">
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
                                        onClick={() => handleDeleteHoliday(holiday.id)}
                                        className="bg-gradient-danger text-destructive-foreground shadow-sm shadow-destructive/20 hover:brightness-110"
                                      >
                                        {fr.common.delete}
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </TableCell>
                            )}
                          </>
                        )}
                      />
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </StaggerItem>
          ))}
        </StaggerContainer>
      )}
    </div>
  );
}
