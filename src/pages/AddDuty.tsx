import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import * as m from 'motion/react-m';
import { supabase } from '@/integrations/supabase/client';
import { useAuthContext } from '@/contexts/AuthContext';
import { fr } from '@/lib/i18n';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Calendar as CalendarIcon, AlertTriangle, Save } from 'lucide-react';
import { format } from 'date-fns';
import { fr as frLocale } from 'date-fns/locale';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { StaggerContainer, StaggerItem, AnimatedPresencePanel } from '@/components/motion';
import { shakeAnimation } from '@/lib/motion';

interface TeamMember {
  id: string;
  full_name: string;
  title: string | null;
  active: boolean;
}

interface Holiday {
  id: string;
  date: string;
  label: string;
}

export default function AddDuty() {
  const navigate = useNavigate();
  const { isAdmin, user } = useAuthContext();
  const [loading, setLoading] = useState(false);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  
  const [dutyDate, setDutyDate] = useState<Date | undefined>();
  const [dutyType, setDutyType] = useState('Day');
  const [selectedMember, setSelectedMember] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [holidayOverride, setHolidayOverride] = useState(false);

  const [holidayWarning, setHolidayWarning] = useState<Holiday | null>(null);
  const [duplicateError, setDuplicateError] = useState(false);
  const [shakeTrigger, setShakeTrigger] = useState(false);

  // NEW: mode Jour/Semaine/Mois
type AddMode = 'day' | 'week' | 'month';
const [mode, setMode] = useState<AddMode>('day');

// NEW: week/month options
const [peoplePerDay, setPeoplePerDay] = useState<number>(1);
const [includeWeekends, setIncludeWeekends] = useState<boolean>(true);
const [excludeHolidays, setExcludeHolidays] = useState<boolean>(true);

// NEW: selections for week/month
const [selectedWeekdays, setSelectedWeekdays] = useState<number[]>([1,2,3,4,5]); // Mon..Fri default

// NEW: recommendations
const [recommendedMemberIds, setRecommendedMemberIds] = useState<string[]>([]);
const [loadingRecs, setLoadingRecs] = useState(false);


  useEffect(() => {
    if (!isAdmin) return;
    fetchTeamMembers();
    fetchHolidays();
  }, [isAdmin]);

  useEffect(() => {
  if (!isAdmin) return;
  if (dutyDate) {
    checkHoliday(dutyDate);

    // only check duplicate for day mode (single member)
    if (mode === 'day' && selectedMember) {
      checkDuplicate(dutyDate, selectedMember);
    } else {
      setDuplicateError(false);
    }

    refreshRecommendations();
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [isAdmin, dutyDate, selectedMember, mode, peoplePerDay, includeWeekends, excludeHolidays, selectedWeekdays, teamMembers.length, holidays.length]);

  if (!isAdmin) {
    return (
      <div className="max-w-3xl mx-auto">
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Accès refusé</AlertTitle>
          <AlertDescription>
            Cette action est réservée aux administrateurs.
          </AlertDescription>
        </Alert>
      </div>
    );
  }


  const fetchTeamMembers = async () => {
    const { data, error } = await supabase
      .from('team_members')
      .select('id, full_name, title, active')
      .eq('active', true)
      .order('full_name');

    if (!error && data) {
      setTeamMembers(data);
    }
  };

  const fetchHolidays = async () => {
    const { data, error } = await supabase
      .from('holidays')
      .select('id, date, label');

    if (!error && data) {
      setHolidays(data);
    }
  };

  const checkHoliday = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    const holiday = holidays.find((h) => h.date === dateStr);
    setHolidayWarning(holiday || null);
  };

  const checkDuplicate = async (date: Date, memberId: string) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    const { data } = await supabase
      .from('duty_entries')
      .select('id')
      .eq('duty_date', dateStr)
      .eq('team_member_id', memberId)
      .maybeSingle();

    setDuplicateError(!!data);
  };

  const toDateStr = (d: Date) => format(d, 'yyyy-MM-dd');

const isWeekend = (d: Date) => {
  const day = d.getDay();
  return day === 0 || day === 6;
};

const isHolidayDate = (d: Date) => {
  const ds = toDateStr(d);
  return holidays.some(h => h.date === ds);
};

const generateDates = (baseDate: Date): Date[] => {
  // mode day
  if (mode === 'day') return [baseDate];

  // mode week: generate 7 days around baseDate week (Mon..Sun)
  if (mode === 'week') {
    const result: Date[] = [];
    const d = new Date(baseDate);
    const day = d.getDay(); // 0 Sun..6 Sat
    const diffToMonday = (day + 6) % 7; // converts so Monday is start
    const monday = new Date(d);
    monday.setDate(d.getDate() - diffToMonday);

    for (let i = 0; i < 7; i++) {
      const curr = new Date(monday);
      curr.setDate(monday.getDate() + i);
      if (!includeWeekends && isWeekend(curr)) continue;
      if (!selectedWeekdays.includes(curr.getDay())) continue;
      if (excludeHolidays && isHolidayDate(curr) && !isAdmin) continue;
      result.push(curr);
    }
    return result;
  }

  // mode month: all days in month matching selectedWeekdays
  const result: Date[] = [];
  const start = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1);
  const end = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 0); // last day

  for (let day = 1; day <= end.getDate(); day++) {
    const curr = new Date(baseDate.getFullYear(), baseDate.getMonth(), day);
    if (!includeWeekends && isWeekend(curr)) continue;
    if (!selectedWeekdays.includes(curr.getDay())) continue;
    if (excludeHolidays && isHolidayDate(curr) && !isAdmin) continue;
    result.push(curr);
  }
  return result;
};

const toggleWeekday = (wd: number) => {
  setSelectedWeekdays(prev =>
    prev.includes(wd) ? prev.filter(x => x !== wd) : [...prev, wd].sort((a,b) => a-b)
  );
};

// “IA” simple: recommend least-assigned members in selected range
const refreshRecommendations = async () => {
  if (!dutyDate) return;
  setLoadingRecs(true);

  try {
    const dates = generateDates(dutyDate);
    if (dates.length === 0) {
      setRecommendedMemberIds([]);
      return;
    }

    const start = toDateStr(new Date(Math.min(...dates.map(d => d.getTime()))));
    const end = toDateStr(new Date(Math.max(...dates.map(d => d.getTime()))));

    const { data: duties, error } = await supabase
      .from('duty_entries')
      .select('team_member_id')
      .gte('duty_date', start)
      .lte('duty_date', end);

    if (error) throw error;

    const counts = new Map<string, number>();
    for (const m of teamMembers) counts.set(m.id, 0);

    for (const row of duties ?? []) {
      if (row.team_member_id) {
        counts.set(
          row.team_member_id,
          (counts.get(row.team_member_id) ?? 0) + 1
        );
      }
    }

    const activeIds = teamMembers.map(m => m.id);

    // We don't limit to 5 anymore
    const sorted = activeIds.sort(
      (a, b) =>
        (counts.get(a)! - counts.get(b)!) ||
        a.localeCompare(b)
    );

    const generatedDates  = generateDates(dutyDate);
const needed = generatedDates.length * peoplePerDay;

setRecommendedMemberIds(sorted.slice(0, needed));

  } catch (e) {
    console.error(e);
  } finally {
    setLoadingRecs(false);
  }
};



  const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();

  if (!dutyDate) {
    toast.error('Veuillez sélectionner une date');
    setShakeTrigger(true);
    return;
  }

  if (mode === 'day' && !selectedMember) {
    toast.error('Veuillez sélectionner un membre');
    setShakeTrigger(true);
    return;
  }

  if (mode === 'day') {
    // existing single insert logic
    if (duplicateError) {
      toast.error(fr.duty.duplicateError);
      setShakeTrigger(true);
      return;
    }
    if (holidayWarning && !isAdmin && !holidayOverride) {
      toast.error("Impossible d'assigner une permanence sur un jour férié");
      setShakeTrigger(true);
      return;
    }
  }

  setLoading(true);

  try {
    const dates = generateDates(dutyDate);
    if (dates.length === 0) {
      toast.error("Aucune date générée (filtres/feriés/weekend).");
      return;
    }

    // DAY mode: insert one
    if (mode === 'day') {
  const dateObj = new Date(dutyDate);
  const day = dateObj.getDay();

  const autoType = (day === 0 || day === 6)
    ? 'holiday'
    : dutyType;

  const { error } = await supabase.from('duty_entries').insert({
    duty_date: toDateStr(dutyDate),
    duty_type: autoType,
    team_member_id: selectedMember,
    notes: notes || null,
    created_by: user?.id,
  });

  if (error) throw error;

      toast.success('Permanence ajoutée avec succès');
      navigate('/planning');
      return;
    }

    // WEEK/MONTH mode: true smart rotation

const activeMemberIds = teamMembers.map(m => m.id);

if (activeMemberIds.length === 0) {
  toast.error("Aucun membre actif dans l'équipe.");
  return;
}

// build initial load counts
const start = toDateStr(new Date(Math.min(...dates.map(d => d.getTime()))));
const end = toDateStr(new Date(Math.max(...dates.map(d => d.getTime()))));

const { data: existing, error: loadErr } = await supabase
  .from('duty_entries')
  .select('team_member_id')
  .gte('duty_date', start)
  .lte('duty_date', end);

if (loadErr) throw loadErr;

const loadCounts = new Map<string, number>();
for (const id of activeMemberIds) loadCounts.set(id, 0);

for (const row of existing ?? []) {
  if (row.team_member_id) {
    loadCounts.set(
      row.team_member_id,
      (loadCounts.get(row.team_member_id) ?? 0) + 1
    );
  }
}

const inserts: any[] = [];

for (const d of dates) {
  const dayStr = toDateStr(d);
  const weekday = d.getDay();

  const computedType =
    (weekday === 0 || weekday === 6)
      ? 'holiday'
      : 'normal';

  // sort dynamically per day
  const sorted = [...activeMemberIds].sort(
    (a, b) =>
      (loadCounts.get(a)! - loadCounts.get(b)!) ||
      a.localeCompare(b)
  );

  const chosen: string[] = [];

  for (const id of sorted) {
    if (chosen.length >= peoplePerDay) break;
    chosen.push(id);
    loadCounts.set(id, loadCounts.get(id)! + 1);
  }

  for (const memberId of chosen) {
    inserts.push({
      duty_date: dayStr,
      duty_type: computedType,
      team_member_id: memberId,
      notes: notes || null,
      created_by: user?.id,
    });
  }
}




    if (inserts.length === 0) {
      toast.error("Rien à insérer (filtres trop stricts).");
      return;
    }

    const { error } = await supabase.from('duty_entries').insert(inserts);
    if (error) throw error;

    toast.success(`Permanences ajoutées: ${inserts.length}`);
    navigate('/planning');
  } catch (error: any) {
    console.error('Error adding duty:', error);
    if (error.code === '23505') {
      toast.error(fr.duty.duplicateError);
    } else {
      toast.error("Erreur lors de l'ajout des permanences");
    }
  } finally {
    setLoading(false);
  }
};


  const dutyTypes = ['Day', 'Night', 'Weekend', 'Other'];

  return (
    <div className="max-w-2xl mx-auto">
      <m.div
        animate={shakeTrigger ? shakeAnimation : undefined}
        onAnimationComplete={() => setShakeTrigger(false)}
      >
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarIcon className="h-5 w-5" />
            {fr.duty.add}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <StaggerContainer className="space-y-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Mode */}
<StaggerItem>
<div className="space-y-2">
  <Label>Mode d’ajout *</Label>
  <Select value={mode} onValueChange={(v) => setMode(v as any)}>
    <SelectTrigger>
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="day">Jour</SelectItem>
      <SelectItem value="week">Semaine</SelectItem>
      <SelectItem value="month">Mois</SelectItem>
    </SelectContent>
  </Select>
</div>
</StaggerItem>

{/* Week/Month options */}
{mode !== 'day' && (
  <StaggerItem>
  <div className="space-y-4 rounded-lg border p-4">
    <div className="grid grid-cols-2 gap-4">
      <div className="space-y-2">
        <Label>Personnes / jour</Label>
        <Input
          type="number"
          min={1}
          max={10}
          value={peoplePerDay}
          onChange={(e) => setPeoplePerDay(Math.max(1, Number(e.target.value || 1)))}
        />
      </div>

      <div className="space-y-2">
        <Label>Exclure jours fériés</Label>
        <div className="flex items-center gap-2">
          <Checkbox
            checked={excludeHolidays}
            onCheckedChange={(c) => setExcludeHolidays(!!c)}
          />
          <span className="text-sm">Oui</span>
        </div>
      </div>
    </div>

    <div className="flex items-center gap-2">
      <Checkbox
        checked={includeWeekends}
        onCheckedChange={(c) => setIncludeWeekends(!!c)}
      />
      <span className="text-sm">Inclure week-ends</span>
    </div>

    <div className="space-y-2">
      <Label>Jours concernés</Label>
      <div className="flex flex-wrap gap-2">
        {[
          { wd: 1, label: 'Lun' },
          { wd: 2, label: 'Mar' },
          { wd: 3, label: 'Mer' },
          { wd: 4, label: 'Jeu' },
          { wd: 5, label: 'Ven' },
          { wd: 6, label: 'Sam' },
          { wd: 0, label: 'Dim' },
        ].map(x => (
          <Button
            key={x.wd}
            type="button"
            variant={selectedWeekdays.includes(x.wd) ? 'default' : 'outline'}
            size="sm"
            onClick={() => toggleWeekday(x.wd)}
          >
            {x.label}
          </Button>
        ))}
      </div>
    </div>

    <div className="flex justify-between items-center">
      <Button type="button" variant="outline" onClick={refreshRecommendations} disabled={loadingRecs}>
        {loadingRecs ? 'Analyse...' : '🤖 Suggérer (IA)'}
      </Button>

      <div className="text-xs text-muted-foreground">
        Suggestion = membres les moins affectés sur la période.
      </div>
    </div>

    {recommendedMemberIds.length > 0 && (
      <div className="space-y-2">
        <Label>Recommandations</Label>
        <div className="flex flex-wrap gap-2">
          {recommendedMemberIds.map(id => {
            const m = teamMembers.find(t => t.id === id);
            if (!m) return null;
            return (
              <Button
                key={id}
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setSelectedMember(id)}
              >
                {m.full_name}
              </Button>
            );
          })}
        </div>
      </div>
    )}
  </div>
  </StaggerItem>
)}

            {/* Date Picker */}
            <StaggerItem>
            <div className="space-y-2">
              <Label>{fr.duty.date} *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'w-full justify-start text-left font-normal',
                      !dutyDate && 'text-muted-foreground'
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dutyDate ? format(dutyDate, 'PPP', { locale: frLocale }) : 'Sélectionner une date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dutyDate}
                    onSelect={setDutyDate}
                    initialFocus
                    className="p-3 pointer-events-auto"
                    locale={frLocale}
                  />
                </PopoverContent>
              </Popover>
            </div>
            </StaggerItem>

            {/* Holiday Warning */}
            <AnimatedPresencePanel show={!!holidayWarning}>
            {holidayWarning && (
              <Alert variant="destructive" className="bg-warning/10 border-warning text-warning-foreground">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>{fr.duty.holidayWarning}</AlertTitle>
                <AlertDescription className="mt-2">
                  <p>{holidayWarning.label}</p>
                  {isAdmin && (
                    <div className="flex items-center gap-2 mt-3">
                      <Checkbox
                        id="holiday-override"
                        checked={holidayOverride}
                        onCheckedChange={(checked) => setHolidayOverride(checked as boolean)}
                      />
                      <label htmlFor="holiday-override" className="text-sm cursor-pointer">
                        {fr.duty.holidayOverride}
                      </label>
                    </div>
                  )}
                </AlertDescription>
              </Alert>
            )}
            </AnimatedPresencePanel>

            {/* Duplicate Error */}
            <AnimatedPresencePanel show={duplicateError}>
            {duplicateError && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Conflit détecté</AlertTitle>
                <AlertDescription>{fr.duty.duplicateError}</AlertDescription>
              </Alert>
            )}
            </AnimatedPresencePanel>

            {/* Duty Type */}
            <StaggerItem>
            <div className="space-y-2">
              <Label>{fr.duty.type}</Label>
              <Select value={dutyType} onValueChange={setDutyType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {dutyTypes.map((type) => (
                    <SelectItem key={type} value={type}>
                      {fr.duty.types[type as keyof typeof fr.duty.types]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            </StaggerItem>

            {/* Team Member */}
            <StaggerItem>
            <div className="space-y-2">
              <Label>{fr.duty.member} *</Label>
              <Select value={selectedMember} onValueChange={setSelectedMember}>
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner un membre" />
                </SelectTrigger>
                <SelectContent>
                  {teamMembers.map((member) => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.full_name}
                      {member.title && ` (${member.title})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            </StaggerItem>

            {/* Notes */}
            <StaggerItem>
            <div className="space-y-2">
              <Label>{fr.duty.notes}</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Notes optionnelles..."
                rows={3}
              />
            </div>
            </StaggerItem>

            {/* Submit */}
            <StaggerItem>
            <div className="flex gap-3 pt-4">
              <Button
                type="submit"
                disabled={loading || duplicateError || (holidayWarning && !isAdmin && !holidayOverride)}
                className="flex-1"
              >
                <Save className="mr-2 h-4 w-4" />
                {loading ? 'Enregistrement...' : fr.common.save}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate('/planning')}
              >
                {fr.common.cancel}
              </Button>
            </div>
            </StaggerItem>
          </form>
          </StaggerContainer>
        </CardContent>
      </Card>
      </m.div>
    </div>
  );
}
