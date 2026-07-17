import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthContext } from '@/contexts/AuthContext';
import { fr } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Calendar, ChevronLeft, ChevronRight, Plus, Trash2, AlertTriangle, Wand2 } from 'lucide-react';
import { 
  format, 
  startOfMonth, 
  endOfMonth, 
  eachDayOfInterval, 
  isSameMonth, 
  isSameDay,
  addMonths,
  subMonths,
  getDay,
  isWeekend,
} from 'date-fns';
import { fr as frLocale } from 'date-fns/locale';
import { toast } from 'sonner';
import AutoPlanDialog from '@/components/planning/AutoPlanDialog';
import * as m from 'motion/react-m';
import { useReducedMotion } from 'motion/react';
import { AnimatedSection, AnimatedList } from '@/components/motion';
import { staggerItem } from '@/lib/motion';

interface DutyEntry {
  id: string;
  duty_date: string;
  duty_type: string;
  notes: string | null;
  team_member_id: string | null;
  team_member: {
    id: string;
    full_name: string;
    active: boolean;
  } | null;
}

interface Holiday {
  id: string;
  date: string;
  label: string;
}

export default function Planning() {
  const { isAdmin } = useAuthContext();
  const shouldReduceMotion = useReducedMotion();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [duties, setDuties] = useState<DutyEntry[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [autoPlanOpen, setAutoPlanOpen] = useState(false);

  useEffect(() => {
    fetchData();
  }, [currentMonth]);

  const fetchData = async () => {
    try {
      const monthStart = startOfMonth(currentMonth);
      const monthEnd = endOfMonth(currentMonth);

      const [dutiesRes, holidaysRes] = await Promise.all([
        supabase
          .from('duty_entries')
          .select(`
            id,
            duty_date,
            duty_type,
            notes,
            team_member_id,
            team_member:team_members(id, full_name, active)
          `)
          .gte('duty_date', format(monthStart, 'yyyy-MM-dd'))
          .lte('duty_date', format(monthEnd, 'yyyy-MM-dd'))
          .order('duty_date'),
        supabase
          .from('holidays')
          .select('id, date, label')
          .gte('date', format(monthStart, 'yyyy-MM-dd'))
          .lte('date', format(monthEnd, 'yyyy-MM-dd')),
      ]);

      if (dutiesRes.error) throw dutiesRes.error;
      if (holidaysRes.error) throw holidaysRes.error;

      setDuties(dutiesRes.data as DutyEntry[] || []);
      setHolidays(holidaysRes.data || []);
    } catch (error) {
      console.error('Error fetching planning data:', error);
      toast.error('Erreur lors du chargement des données');
    } finally {
      setLoading(false);
    }
  };

  const getDutiesForDate = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return duties.filter((d) => d.duty_date === dateStr);
  };

  const getHolidayForDate = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return holidays.find((h) => h.date === dateStr);
  };

  const handleDeleteDuty = async (dutyId: string) => {
    try {
      const { error } = await supabase
        .from('duty_entries')
        .delete()
        .eq('id', dutyId);

      if (error) throw error;
      
      toast.success('Permanence supprimée');
      fetchData();
    } catch (error) {
      console.error('Error deleting duty:', error);
      toast.error('Erreur lors de la suppression');
    }
  };

  const getDayIntensity = (count: number) => {
    if (count === 0) return '';
    if (count === 1) return 'bg-accent/10';
    if (count === 2) return 'bg-accent/20';
    if (count >= 3) return 'bg-accent/30';
    return '';
  };

  // Generate calendar days
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  
  // Get the day of week for the first day (0 = Sunday, 1 = Monday, etc.)
  const startDayOfWeek = getDay(monthStart);
  // Adjust for Monday start (0 = Monday in our grid)
  const paddingDays = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1;

  const weekDays = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <AnimatedSection className="surface-elevated flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 px-4 py-4 sm:px-5">
        <div className="flex w-full min-w-0 items-center justify-between gap-2 sm:w-auto sm:justify-start sm:gap-3">
          <span className="hidden sm:flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-info/10 text-info">
            <Calendar className="h-5 w-5" />
          </span>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2 className="min-w-0 flex-1 text-center text-lg font-semibold capitalize sm:min-w-[200px] sm:flex-none sm:text-xl">
            {format(currentMonth, 'MMMM yyyy', { locale: frLocale })}
          </h2>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex w-full gap-2 sm:w-auto">
          <Button
  variant="outline"
  className="w-full sm:w-auto"
  onClick={() => {
    if (!isAdmin) {
      toast.error('Action réservée aux administrateurs');
      return;
    }
    setAutoPlanOpen(true);
  }}
>

            <Wand2 className="h-4 w-4 mr-2" />
            {fr.autoPlan.title}
          </Button>
        </div>
      </AnimatedSection>

      {/* Calendar Grid */}
      <AnimatedSection delay={0.06}>
      <Card>
        <CardContent className="p-2 sm:p-4">
          {/* Weekday Headers */}
          <div className="grid grid-cols-7 gap-1 mb-2">
            {weekDays.map((day) => (
              <div
                key={day}
                className="text-center text-sm font-medium text-muted-foreground py-2"
              >
                {day}
              </div>
            ))}
          </div>

          {/* Calendar Days */}
          <m.div
            key={format(currentMonth, 'yyyy-MM')}
            className="grid grid-cols-7 gap-1"
            variants={shouldReduceMotion ? undefined : { animate: { transition: { staggerChildren: 0.012, delayChildren: 0.03 } } }}
            initial="initial"
            animate="animate"
          >
            {/* Padding for days before month start */}
            {[...Array(paddingDays)].map((_, i) => (
              <div key={`pad-${i}`} className="min-h-[64px] sm:min-h-[100px] bg-muted/30 rounded-lg" />
            ))}

            {/* Actual days */}
            {days.map((day) => {
              const dayDuties = getDutiesForDate(day);
              const holiday = getHolidayForDate(day);
              const isToday = isSameDay(day, new Date());
              const isWeekendDay = isWeekend(day);

              return (
                <Sheet key={day.toISOString()}>
                  <SheetTrigger asChild>
                    <m.button
                      variants={shouldReduceMotion ? undefined : staggerItem}
                      whileHover={shouldReduceMotion ? undefined : { scale: 1.02, transition: { duration: 0.15 } }}
                      whileTap={shouldReduceMotion ? undefined : { scale: 0.98 }}
                      onClick={() => setSelectedDate(day)}
                      className={cn(
                        'calendar-day text-left flex flex-col',
                        getDayIntensity(dayDuties.length),
                        holiday && 'is-holiday',
                        isToday && 'is-today',
                        isWeekendDay && 'bg-muted/50'
                      )}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className={cn(
                          'text-sm font-medium',
                          isToday && 'text-accent'
                        )}>
                          {format(day, 'd')}
                        </span>
                        {holiday && (
                          <AlertTriangle className="h-3 w-3 text-warning" />
                        )}
                      </div>

                      <div className="flex-1 space-y-1 overflow-hidden">
                        {dayDuties.slice(0, 3).map((duty) => (
                          <div
                            key={duty.id}
                            className={cn(
                              'text-xs px-1.5 py-0.5 rounded truncate',
                              duty.team_member?.active === false
                                ? 'bg-destructive/10 text-destructive'
                                : 'bg-accent/20 text-accent font-bold'
                            )}
                          >
                            {duty.team_member?.full_name || 'Non assigné'}
                          </div>
                        ))}
                        {dayDuties.length > 3 && (
                          <div className="text-xs text-muted-foreground">
                            +{dayDuties.length - 3} autres
                          </div>
                        )}
                      </div>
                    </m.button>
                  </SheetTrigger>

                  <SheetContent className="h-[100dvh] max-h-[100dvh] w-[87vw] max-w-[340px] overflow-y-auto pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))] sm:max-w-sm">
                    <SheetHeader>
                      <SheetTitle className="flex items-center gap-2.5">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-info/10 text-info">
                          <Calendar className="h-4 w-4" />
                        </span>
                        <span className="capitalize">
                          {format(day, 'EEEE d MMMM yyyy', { locale: frLocale })}
                        </span>
                      </SheetTitle>
                    </SheetHeader>

                    <div className="mt-6 space-y-4">
                      {holiday && (
                        <div className="p-3 bg-warning/10 rounded-lg border border-warning/30">
                          <div className="flex items-center gap-2 text-warning">
                            <AlertTriangle className="h-4 w-4" />
                            <span className="font-medium">{fr.duty.holidayWarning}</span>
                          </div>
                          <p className="text-sm mt-1">{holiday.label}</p>
                        </div>
                      )}

                      <div className="space-y-3">
                        <h4 className="font-medium">
                          Permanences ({dayDuties.length})
                        </h4>

                        {dayDuties.length === 0 ? (
                          <p className="text-muted-foreground text-sm">
                            {fr.planning.noDuties}
                          </p>
                        ) : (
                          <AnimatedList
                            items={dayDuties}
                            getKey={(duty) => duty.id}
                            renderItem={(duty) => (
                              <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium">
                                      {duty.team_member?.full_name || 'Non assigné'}
                                    </span>
                                    {duty.team_member?.active === false && (
                                      <Badge variant="destructive" className="text-xs">
                                        Inactif
                                      </Badge>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 mt-1">
                                    <Badge variant="secondary">
                                      {fr.duty.types[duty.duty_type as keyof typeof fr.duty.types] || duty.duty_type}
                                    </Badge>
                                  </div>
                                  {duty.notes && (
                                    <p className="text-sm text-muted-foreground mt-1">
                                      {duty.notes}
                                    </p>
                                  )}
                                </div>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="text-destructive hover:text-destructive"
                                  onClick={() => handleDeleteDuty(duty.id)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            )}
                            itemClassName="mb-3 last:mb-0"
                          />
                        )}
                      </div>
                    </div>
                  </SheetContent>
                </Sheet>
              );
            })}
          </m.div>
        </CardContent>
      </Card>
      </AnimatedSection>

      {/* Legend */}
      <AnimatedSection delay={0.12}>
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-4 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-accent/10 border" />
              <span>1 permanence</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-accent/20 border" />
              <span>2 permanences</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-accent/30 border" />
              <span>3+ permanences</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-warning/10 border border-warning/30" />
              <span>Jour férié</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded ring-2 ring-accent ring-offset-2" />
              <span>Aujourd'hui</span>
            </div>
          </div>
        </CardContent>
      </Card>
      </AnimatedSection>

      {/* Auto-Plan Dialog */}
      <AutoPlanDialog
        open={autoPlanOpen} 
        onOpenChange={setAutoPlanOpen}
        onPlanApplied={fetchData}
      />
    </div>
  );
}
