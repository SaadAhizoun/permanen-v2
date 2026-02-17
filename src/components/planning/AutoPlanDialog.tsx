import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthContext } from '@/contexts/AuthContext';
import { fr } from '@/lib/i18n';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Calendar as CalendarIcon, Wand2, AlertTriangle, Check } from 'lucide-react';
import { format, eachDayOfInterval, isWeekend, addDays, getISOWeek, getYear } from 'date-fns';
import { fr as frLocale } from 'date-fns/locale';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';


interface TeamMember {
  id: string;
  full_name: string;
  title: string | null;
  active: boolean;
  initial_credit_normal: number | null;
initial_credit_holiday: number | null;

}


interface ProposedDuty {
  date: Date;
  memberId: string;
  memberName: string;
  conflict?: string;
}

interface AutoPlanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPlanApplied: () => void;
}

export default function AutoPlanDialog({ open, onOpenChange, onPlanApplied }: AutoPlanDialogProps) {
  const { user } = useAuthContext();
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  
  // Form state
  const [startDate, setStartDate] = useState<Date | undefined>(new Date());
  const [endDate, setEndDate] = useState<Date | undefined>(addDays(new Date(), 30));
  const [dutyType, setDutyType] = useState('Day');
  const [peoplePerDay, setPeoplePerDay] = useState(1);
  const [includeWeekends, setIncludeWeekends] = useState(false);
  const [excludeHolidays, setExcludeHolidays] = useState(true);
  const [strategy, setStrategy] = useState<'leastInRange' | 'leastThisMonth' | 'roundRobin'>('leastInRange');
  
  // Data
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [holidays, setHolidays] = useState<string[]>([]);
  const [existingDuties, setExistingDuties] = useState<Record<string, string[]>>({});
  
  // Results
  const [proposedPlan, setProposedPlan] = useState<ProposedDuty[]>([]);
  const [conflicts, setConflicts] = useState<number>(0);

  useEffect(() => {
    if (open) {
      fetchData();
    }
  }, [open]);

  const fetchData = async () => {
  try {
    const [membersRes, holidaysRes] = await Promise.all([
      supabase
        .from('team_members')
        .select('id, full_name, title, active, initial_credit_normal, initial_credit_holiday')
        .eq('active', true)
        .order('full_name'),
      supabase
        .from('holidays')
        .select('date'),
    ]);

    if (membersRes.error) {
      console.error('membersRes.error =', membersRes.error);
      toast.error(`Erreur team_members: ${membersRes.error.message}`);
      return;
    }

    if (holidaysRes.error) {
      console.error('holidaysRes.error =', holidaysRes.error);
      toast.error(`Erreur holidays: ${holidaysRes.error.message}`);
      return;
    }

    setTeamMembers((membersRes.data ?? []) as TeamMember[]);
    setHolidays((holidaysRes.data ?? []).map(h => h.date));
  } catch (error) {
    console.error('Error fetching data:', error);
    toast.error('Erreur lors du chargement');
  }
};



  const generatePlan = async () => {
    if (!startDate || !endDate || teamMembers.length === 0) {
      toast.error('Veuillez remplir tous les champs');
      return;
    }

    setGenerating(true);
    try {
      // Fetch existing duties in range
      const { data: dutiesData } = await supabase
        .from('duty_entries')
        .select('duty_date, team_member_id')
        .gte('duty_date', format(startDate, 'yyyy-MM-dd'))
        .lte('duty_date', format(endDate, 'yyyy-MM-dd'));

      // Build existing duties map: date -> [memberIds]
      const dutiesMap: Record<string, string[]> = {};
      (dutiesData || []).forEach((d) => {
        if (!dutiesMap[d.duty_date]) dutiesMap[d.duty_date] = [];
        if (d.team_member_id) dutiesMap[d.duty_date].push(d.team_member_id);
      });
      setExistingDuties(dutiesMap);

const { data: memberCounts } = await supabase
  .from('duty_entries')
  .select('team_member_id, duty_type');


      const loadMap: Record<string, number> = {};
teamMembers.forEach(m => {
  const base = (m.initial_credit_normal ?? 0) + (m.initial_credit_holiday ?? 0);


  loadMap[m.id] = base;
});



(memberCounts || []).forEach((d: any) => {
  if (!d.team_member_id) return;

  if (loadMap[d.team_member_id] !== undefined) {
    loadMap[d.team_member_id]++;
  }
});



      // Generate days in range
      const days = eachDayOfInterval({ start: startDate, end: endDate });
      const proposed: ProposedDuty[] = [];
      let conflictCount = 0;

      // Track assignments during generation
      const assignmentLoad = { ...loadMap };
      const assignedWeeksByMember: Record<string, Set<string>> = {};
teamMembers.forEach(m => {
  assignedWeeksByMember[m.id] = new Set();
});


      for (const day of days) {
        const dateStr = format(day, 'yyyy-MM-dd');
        const weekKey = `${getYear(day)}-W${getISOWeek(day)}`;

        // Skip weekends if not included
        if (!includeWeekends && isWeekend(day)) continue;
        
        // Check for holiday
        const isHoliday = holidays.includes(dateStr);
        
        // Get existing assignments for this day
        const existingForDay = dutiesMap[dateStr] || [];

        // Determine how many more to assign
        const neededCount = Math.max(0, peoplePerDay - existingForDay.length);

        if (neededCount === 0) continue;

        // Get candidates (active members not already assigned this day)
        let candidates = teamMembers.filter(m =>
  !existingForDay.includes(m.id) &&
  !assignedWeeksByMember[m.id].has(weekKey)
);


        if (candidates.length === 0) continue;

        // Sort by strategy
if (strategy === 'roundRobin') {
  candidates.sort((a, b) => {
    const diff = assignmentLoad[a.id] - assignmentLoad[b.id];
    if (diff !== 0) return diff;
    return a.full_name.localeCompare(b.full_name);
  });
} else {
  // Least assigned strategies: avoid alphabetical bias on ties
  candidates.sort((a, b) => {
    const diff = assignmentLoad[a.id] - assignmentLoad[b.id];
    if (diff !== 0) return diff;

    // tie-breaker: randomize to prevent always picking the first alphabetically (AHIZOUN)
    return Math.random() - 0.5;
  });
}


        // Pick top N
        const selected = candidates.slice(0, neededCount);

        for (const member of selected) {
          let conflict: string | undefined;
          
          if (isHoliday && excludeHolidays) {
            conflict = 'Jour férié';
            conflictCount++;
          }

          proposed.push({
            date: day,
            memberId: member.id,
            memberName: member.full_name,
            conflict,
          });

          assignmentLoad[member.id]++;
          assignedWeeksByMember[member.id].add(weekKey);

        }
      }

      setProposedPlan(proposed);
      setConflicts(conflictCount);
    } catch (error) {
      console.error('Error generating plan:', error);
      toast.error('Erreur lors de la génération');
    } finally {
      setGenerating(false);
    }
  };

  const applyPlan = async () => {
    const validDuties = proposedPlan.filter(p => !p.conflict);
    if (validDuties.length === 0) {
      toast.error('Aucune permanence valide à appliquer');
      return;
    }

    setLoading(true);
    try {
      const inserts = validDuties.map(p => ({
        duty_date: format(p.date, 'yyyy-MM-dd'),
        duty_type: dutyType,
        team_member_id: p.memberId,
        created_by: user?.id,
      }));

      const { error } = await supabase.from('duty_entries').insert(inserts);

      if (error) throw error;

      toast.success(`${validDuties.length} permanences créées`);
      onOpenChange(false);
      onPlanApplied();
      setProposedPlan([]);
    } catch (error: any) {
      console.error('Error applying plan:', error);
      if (error.code === '23505') {
        toast.error('Certaines permanences existent déjà');
      } else {
        toast.error('Erreur lors de l\'application');
      }
    } finally {
      setLoading(false);
    }
  };

  const dutyTypes = ['Day', 'Night', 'Weekend', 'Other'];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5" />
            {fr.autoPlan.title}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <p className="text-sm text-muted-foreground">
            {fr.autoPlan.description}
          </p>

          {/* Date Range */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{fr.autoPlan.startDate}</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn('w-full justify-start', !startDate && 'text-muted-foreground')}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {startDate ? format(startDate, 'PPP', { locale: frLocale }) : 'Sélectionner'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={startDate} onSelect={setStartDate} locale={frLocale} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label>{fr.autoPlan.endDate}</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn('w-full justify-start', !endDate && 'text-muted-foreground')}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {endDate ? format(endDate, 'PPP', { locale: frLocale }) : 'Sélectionner'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={endDate} onSelect={setEndDate} locale={frLocale} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Options */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{fr.autoPlan.dutyType}</Label>
              <Select value={dutyType} onValueChange={setDutyType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {dutyTypes.map(type => (
                    <SelectItem key={type} value={type}>
                      {fr.duty.types[type as keyof typeof fr.duty.types]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{fr.autoPlan.peoplePerDay}</Label>
              <Input
                type="number"
                min={1}
                max={10}
                value={peoplePerDay}
                onChange={(e) => setPeoplePerDay(parseInt(e.target.value) || 1)}
              />
            </div>
          </div>

          {/* Toggles */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>{fr.autoPlan.includeWeekends}</Label>
              <Switch checked={includeWeekends} onCheckedChange={setIncludeWeekends} />
            </div>
            <div className="flex items-center justify-between">
              <Label>{fr.autoPlan.excludeHolidays}</Label>
              <Switch checked={excludeHolidays} onCheckedChange={setExcludeHolidays} />
            </div>
          </div>

          {/* Strategy */}
          <div className="space-y-2">
            <Label>{fr.autoPlan.strategy}</Label>
            <Select value={strategy} onValueChange={(v) => setStrategy(v as any)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="leastInRange">{fr.autoPlan.strategies.leastInRange}</SelectItem>
                <SelectItem value="leastThisMonth">{fr.autoPlan.strategies.leastThisMonth}</SelectItem>
                <SelectItem value="roundRobin">{fr.autoPlan.strategies.roundRobin}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Generate Button */}
          <Button onClick={generatePlan} disabled={generating} className="w-full">
            {generating ? 'Génération en cours...' : fr.autoPlan.generate}
          </Button>

          {/* Results Preview */}
          {proposedPlan.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-medium">{fr.autoPlan.preview}</h4>
                <div className="flex gap-2">
                  {conflicts > 0 ? (
                    <Badge variant="destructive">
                      <AlertTriangle className="h-3 w-3 mr-1" />
                      {conflicts} conflits
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="bg-success text-success-foreground">
                      <Check className="h-3 w-3 mr-1" />
                      {fr.autoPlan.noConflicts}
                    </Badge>
                  )}
                  <Badge variant="secondary">
                    {proposedPlan.length} permanences
                  </Badge>
                </div>
              </div>

              <div className="max-h-60 overflow-y-auto border rounded-lg">
                <table className="w-full text-sm">
                  <thead className="bg-muted sticky top-0">
                    <tr>
                      <th className="text-left p-2">Date</th>
                      <th className="text-left p-2">Membre</th>
                      <th className="text-left p-2">Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {proposedPlan.map((p, i) => (
                      <tr key={i} className={cn('border-t', p.conflict && 'bg-destructive/5')}>
                        <td className="p-2">{format(p.date, 'EEE d MMM', { locale: frLocale })}</td>
                        <td className="p-2">{p.memberName}</td>
                        <td className="p-2">
                          {p.conflict ? (
                            <Badge variant="destructive" className="text-xs">{p.conflict}</Badge>
                          ) : (
                            <Badge variant="secondary" className="text-xs bg-success text-success-foreground">OK</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {conflicts > 0 && (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    Les permanences avec conflits seront ignorées lors de l'application.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {fr.common.cancel}
          </Button>
          {proposedPlan.length > 0 && (
            <Button onClick={applyPlan} disabled={loading}>
              {loading ? 'Application...' : fr.autoPlan.apply}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
