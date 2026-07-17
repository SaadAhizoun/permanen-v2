import { useState, useCallback } from 'react';
import * as m from 'motion/react-m';
import { AnimatePresence } from 'motion/react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthContext } from '@/contexts/AuthContext';
import { fr } from '@/lib/i18n';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Upload, FileSpreadsheet, Check, X, AlertTriangle, Download } from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import {
  StaggerContainer,
  StaggerItem,
  AnimatedSection,
  AnimatedList,
  AnimatedNumber,
} from '@/components/motion';
import { premiumEase } from '@/lib/motion';

interface ParsedRow {
  date: string;
  memberName: string;
  dutyType?: string;
  notes?: string;
  grade?: string;
  error?: string;
}

interface ImportResult {
  inserted: number;
  skipped: number;
  errors: ParsedRow[];
}

export default function Import() {
  const { user, isAdmin } = useAuthContext();
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  
  // Mapping state
  const [dateColumn, setDateColumn] = useState<string>('');
  const [memberColumn, setMemberColumn] = useState<string>('');
  const [typeColumn, setTypeColumn] = useState<string>('');
  const [notesColumn, setNotesColumn] = useState<string>('');
  const [gradeColumn, setGradeColumn] = useState<string>('');
  
  // Options
  const [createMembers, setCreateMembers] = useState(true);
  const [dryRun, setDryRun] = useState(false);
  
  // Results
  const [result, setResult] = useState<ImportResult | null>(null);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0];
    if (!uploadedFile) return;

    setLoading(true);
    setFile(uploadedFile);
    setResult(null);

    try {
      const data = await uploadedFile.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

      if (jsonData.length < 2) {
        toast.error('Le fichier doit contenir au moins une ligne de données');
        return;
      }

       // Find the first "real" header row (skip empty rows)
const firstHeaderRowIndex = jsonData.findIndex((r) =>
  r && r.some((c) => c != null && String(c).trim() !== '')
);

// Prefer the row that contains 'date' and 'prenom'/'nom' if present
const headerRowIndex = (() => {
  const idx = jsonData.findIndex((r) => {
    const txt = (r || []).map((c) => String(c || '').toLowerCase().trim());
    return txt.some((x) => x === 'date' || x.includes('date')) &&
           txt.some((x) => x.includes('prenom') || x.includes('nom'));
  });
  return idx >= 0 ? idx : firstHeaderRowIndex;
})();

if (headerRowIndex < 0 || jsonData.length <= headerRowIndex + 1) {
  toast.error("Impossible de détecter les en-têtes du fichier");
  return;
}

// Make headers safe strings (no null)
const headerRow = (jsonData[headerRowIndex] || []).map((h, i) => {
  const s = String(h ?? '').trim();
  return s.length ? s : `Colonne ${i + 1}`;
});
const dataRows = jsonData
  .slice(headerRowIndex + 1)
  .filter((row) => row && row.some((cell) => cell != null && String(cell).trim() !== ''));

setHeaders(headerRow);
setRows(dataRows);


      // Auto-detect columns (COORDINATION PLANNING preset)
      const lowerHeaders = headerRow.map(h => String(h).toLowerCase().trim());
      
      const dateIdx = lowerHeaders.findIndex(h => h.includes('date'));
      const nameIdx = lowerHeaders.findIndex(h => h.includes('prenom') || h.includes('nom') || h.includes('name'));
      const gradeIdx = lowerHeaders.findIndex(h => h.includes('grade') || h.includes('titre'));
      
      if (dateIdx >= 0) setDateColumn(headerRow[dateIdx]);
      if (nameIdx >= 0) setMemberColumn(headerRow[nameIdx]);
      if (gradeIdx >= 0) setGradeColumn(headerRow[gradeIdx]);

      toast.success(`${dataRows.length} lignes détectées`);
    } catch (error) {
      console.error('Error parsing file:', error);
      toast.error('Erreur lors de la lecture du fichier');
    } finally {
      setLoading(false);
    }
  }, []);

  if (!isAdmin) {
    return (
      <div className="max-w-3xl mx-auto">
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Accès refusé</AlertTitle>
          <AlertDescription>
            L’import est réservé aux administrateurs.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const applyPreset = (preset: 'coordination') => {
    if (preset === 'coordination') {
      // Find matching columns
      const lowerHeaders = headers.map(h => String(h).toLowerCase().trim());
      
      const dateIdx = lowerHeaders.findIndex(h => h.includes('date'));
      const nameIdx = lowerHeaders.findIndex(h => 
        h.includes('prenom') || h.includes('nom') || h === 'name' || h.includes('membre')
      );
      const gradeIdx = lowerHeaders.findIndex(h => h.includes('grade'));
      
      if (dateIdx >= 0) setDateColumn(headers[dateIdx]);
      if (nameIdx >= 0) setMemberColumn(headers[nameIdx]);
      if (gradeIdx >= 0) setGradeColumn(headers[gradeIdx]);
      setTypeColumn('__ignore__');
setNotesColumn('__ignore__');

      
      toast.success('Préréglage COORDINATION PLANNING appliqué');
    }
  };

  const parseExcelDate = (value: any): string | null => {
    if (!value) return null;
    // If it's already a Date object
if (value instanceof Date && !isNaN(value.getTime())) {
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, '0');
  const d = String(value.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

    
    // If it's already a string date
    if (typeof value === 'string') {
      // Try various formats
      const datePatterns = [
        /^(\d{4})-(\d{2})-(\d{2})$/, // yyyy-MM-dd
        /^(\d{2})\/(\d{2})\/(\d{4})$/, // dd/MM/yyyy
        /^(\d{2})-(\d{2})-(\d{4})$/, // dd-MM-yyyy
      ];
      
      for (const pattern of datePatterns) {
        const match = value.match(pattern);
        if (match) {
          if (pattern === datePatterns[0]) {
            return value;
          } else {
            // Assume dd/MM/yyyy or dd-MM-yyyy
            return `${match[3]}-${match[2]}-${match[1]}`;
          }
        }
      }
    }
    
    // If it's an Excel serial date
    if (typeof value === 'number') {
      const date = XLSX.SSF.parse_date_code(value);
      if (date) {
        return `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`;
      }
    }
    
    return null;
  };
  const formatCellForPreview = (value: any, columnName: string) => {
  if (columnName === dateColumn) {
    const parsed = parseExcelDate(value);
    return parsed ?? String(value ?? '');
  }
  return String(value ?? '');
};


  const handleImport = async () => {
    if (!dateColumn || !memberColumn) {
      toast.error('Veuillez mapper les colonnes obligatoires (date et membre)');
      return;
    }

    setImporting(true);
    setResult(null);

    try {
      // Get column indices
      const dateIdx = headers.indexOf(dateColumn);
      const memberIdx = headers.indexOf(memberColumn);
      const typeIdx = typeColumn && typeColumn !== '__ignore__' ? headers.indexOf(typeColumn) : -1;
const notesIdx = notesColumn && notesColumn !== '__ignore__' ? headers.indexOf(notesColumn) : -1;

      const gradeIdx = gradeColumn ? headers.indexOf(gradeColumn) : -1;

      // Fetch existing team members
      const { data: existingMembers } = await supabase
        .from('team_members')
        .select('id, full_name');

      const memberMap = new Map<string, string>();
      (existingMembers || []).forEach(m => {
        memberMap.set(m.full_name.toLowerCase().trim(), m.id);
      });

      // Fetch existing duties
      const { data: existingDuties } = await supabase
        .from('duty_entries')
        .select('duty_date, team_member_id');

      const dutySet = new Set<string>();
      (existingDuties || []).forEach(d => {
        if (d.team_member_id) {
          dutySet.add(`${d.duty_date}_${d.team_member_id}`);
        }
      });

      const parsedRows: ParsedRow[] = [];
      const toInsert: any[] = [];
      const newMembers: { name: string; grade?: string }[] = [];
      const errors: ParsedRow[] = [];

      // Parse rows
      for (const row of rows) {
        const dateValue = row[dateIdx];
        const memberName = String(row[memberIdx] || '').trim();
        const dutyType = typeIdx >= 0 ? String(row[typeIdx] || 'Day') : 'Day';
        const notes = notesIdx >= 0 ? String(row[notesIdx] || '') : '';
        const grade = gradeIdx >= 0 ? String(row[gradeIdx] || '') : '';

        const parsedDate = parseExcelDate(dateValue);
        
        if (!parsedDate) {
          errors.push({ date: String(dateValue), memberName, error: 'Date invalide' });
          continue;
        }

        if (!memberName) {
          errors.push({ date: parsedDate, memberName: '', error: 'Nom membre manquant' });
          continue;
        }

        let memberId = memberMap.get(memberName.toLowerCase());

        if (!memberId) {
          if (createMembers) {
            // Mark for creation
            if (!newMembers.find(m => m.name.toLowerCase() === memberName.toLowerCase())) {
              newMembers.push({ name: memberName, grade });
            }
          } else {
            errors.push({ date: parsedDate, memberName, error: 'Membre non trouvé' });
            continue;
          }
        }

        parsedRows.push({
          date: parsedDate,
          memberName,
          dutyType,
          notes,
          grade,
        });
      }

      // Create new members if needed
      if (!dryRun && newMembers.length > 0) {
        const { data: createdMembers, error: createError } = await supabase
          .from('team_members')
          .insert(newMembers.map(m => ({
            full_name: m.name,
            title: m.grade || null,
            active: true,
          })))
          .select('id, full_name');

        if (createError) {
          console.error('Error creating members:', createError);
          toast.error('Erreur lors de la création des membres');
        } else {
          (createdMembers || []).forEach(m => {
            memberMap.set(m.full_name.toLowerCase().trim(), m.id);
          });
        }
      }

      // Prepare inserts (excluding duplicates)
      let skipped = 0;
      for (const parsed of parsedRows) {
        const memberId = memberMap.get(parsed.memberName.toLowerCase());
        
        if (!memberId) {
          errors.push({ ...parsed, error: 'Membre non créé' });
          continue;
        }

        const key = `${parsed.date}_${memberId}`;
        if (dutySet.has(key)) {
          skipped++;
          continue;
        }

        toInsert.push({
          duty_date: parsed.date,
          team_member_id: memberId,
          duty_type: parsed.dutyType || 'Day',
          notes: parsed.notes || null,
          created_by: user?.id,
        });
        dutySet.add(key);
      }

      // Insert duties
      let inserted = 0;
      if (!dryRun && toInsert.length > 0) {
        const { error: insertError } = await supabase
          .from('duty_entries')
          .insert(toInsert);

        if (insertError) {
          console.error('Error inserting duties:', insertError);
          toast.error('Erreur lors de l\'import des permanences');
        } else {
          inserted = toInsert.length;

          // Log import batch
          await supabase.from('import_batches').insert({
            source_filename: file?.name,
            imported_by: user?.id,
            inserted_count: inserted,
            skipped_count: skipped,
            error_count: errors.length,
          });
        }
      } else if (dryRun) {
        inserted = toInsert.length;
      }

      setResult({
        inserted,
        skipped,
        errors,
      });

      if (dryRun) {
        toast.info(`Mode simulation: ${inserted} à insérer, ${skipped} doublons, ${errors.length} erreurs`);
      } else {
        toast.success(`Import terminé: ${inserted} insérées, ${skipped} doublons`);
      }
    } catch (error) {
      console.error('Import error:', error);
      toast.error('Erreur lors de l\'import');
    } finally {
      setImporting(false);
    }
  };

  const downloadErrors = () => {
    if (!result?.errors.length) return;

    const ws = XLSX.utils.json_to_sheet(result.errors);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Erreurs');
    XLSX.writeFile(wb, 'import_errors.xlsx');
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Upload Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            {fr.import.title}
          </CardTitle>
          <CardDescription>
            Importez vos permanences depuis un fichier Excel ou CSV
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileUpload}
              disabled={loading}
              className="max-w-md"
            />
            <AnimatePresence>
              {file && (
                <m.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.2, ease: premiumEase }}
                >
                  <Badge variant="secondary">
                    <FileSpreadsheet className="h-4 w-4 mr-1" />
                    {file.name}
                  </Badge>
                </m.div>
              )}
            </AnimatePresence>
          </div>
        </CardContent>
      </Card>

      {/* Mapping Section */}
      {headers.length > 0 && (
        <AnimatedSection>
        <Card>
          <CardHeader>
            <CardTitle>{fr.import.mapping}</CardTitle>
            <div className="flex gap-2 mt-2">
              <Button variant="outline" size="sm" onClick={() => applyPreset('coordination')}>
                {fr.import.coordinationPreset}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <StaggerContainer className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <StaggerItem>
              <div className="space-y-2">
                <Label>{fr.import.dateColumn} *</Label>
                <Select value={dateColumn} onValueChange={setDateColumn}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionner..." />
                  </SelectTrigger>
                  <SelectContent>
                    {headers.map((h, i) => (
                      <SelectItem key={i} value={h}>{h}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              </StaggerItem>

              <StaggerItem>
              <div className="space-y-2">
                <Label>{fr.import.memberColumn} *</Label>
                <Select value={memberColumn} onValueChange={setMemberColumn}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionner..." />
                  </SelectTrigger>
                  <SelectContent>
                    {headers.map((h, i) => (
                      <SelectItem key={i} value={h}>{h}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              </StaggerItem>

              <StaggerItem>
              <div className="space-y-2">
                <Label>{fr.import.typeColumn}</Label>
                <Select value={typeColumn} onValueChange={setTypeColumn}>
                  <SelectTrigger>
                    <SelectValue placeholder="— Non utilisé —" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__Non utilisé__">— Non utilisé —</SelectItem>

                    {headers.map((h, i) => (
                      <SelectItem key={i} value={h}>{h}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              </StaggerItem>

              <StaggerItem>
              <div className="space-y-2">
                <Label>{fr.import.gradeColumn}</Label>
                <Select value={gradeColumn} onValueChange={setGradeColumn}>
                  <SelectTrigger>
                    <SelectValue placeholder="— Non utilisé —" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__Non utilisé__">— Non utilisé —</SelectItem>
                    {headers.map((h, i) => (
                      <SelectItem key={i} value={h}>{h}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              </StaggerItem>
            </StaggerContainer>

            {/* Options */}
            <div className="border-t pt-4 space-y-3">
              <h4 className="font-medium">{fr.import.options}</h4>
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <Checkbox id="create-members" checked={createMembers} onCheckedChange={(c) => setCreateMembers(c as boolean)} />
                  <label htmlFor="create-members" className="cursor-pointer">{fr.import.createMembers}</label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox id="dry-run" checked={dryRun} onCheckedChange={(c) => setDryRun(c as boolean)} />
                  <label htmlFor="dry-run" className="cursor-pointer">{fr.import.dryRun}</label>
                </div>
              </div>
            </div>

            {/* Preview */}
            <div className="border-t pt-4">
              <h4 className="font-medium mb-2">{fr.import.preview} ({rows.length} lignes)</h4>
              <div className="max-h-40 overflow-auto border rounded">
                <table className="w-full text-sm">
                  <thead className="bg-muted sticky top-0">
                    <tr>
                      {headers.map((h, i) => (
                        <th key={i} className="text-left p-2 font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <AnimatedList
                      items={rows.slice(0, 5)}
                      getKey={(_row, i) => String(i)}
                      as="tr"
                      itemClassName="border-t"
                      renderItem={(row) => (
                        <>
                          {headers.map((_, j) => (
                            <td key={j} className="p-2">{formatCellForPreview(row[j], headers[j])}</td>
                          ))}
                        </>
                      )}
                    />
                  </tbody>
                </table>
              </div>
            </div>

            {/* Import Button */}
            <Button onClick={handleImport} disabled={importing || !dateColumn || !memberColumn} className="w-full">
              {importing ? 'Import en cours...' : fr.import.startImport}
            </Button>
          </CardContent>
        </Card>
        </AnimatedSection>
      )}

      {/* Results */}
      {result && (
        <AnimatedSection>
        <Card>
          <CardHeader>
            <CardTitle>{fr.import.results}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <StaggerContainer className="grid grid-cols-3 gap-3 sm:gap-4">
              <StaggerItem>
              <div className="text-center p-3 sm:p-4 bg-success/10 rounded-lg">
                <Check className="h-6 w-6 sm:h-8 sm:w-8 mx-auto text-success mb-2" />
                <div className="text-xl sm:text-2xl font-bold text-success">
                  <AnimatedNumber value={result.inserted} />
                </div>
                <div className="text-xs sm:text-sm text-muted-foreground">{fr.import.inserted}</div>
              </div>
              </StaggerItem>
              <StaggerItem>
              <div className="text-center p-3 sm:p-4 bg-muted rounded-lg">
                <X className="h-6 w-6 sm:h-8 sm:w-8 mx-auto text-muted-foreground mb-2" />
                <div className="text-xl sm:text-2xl font-bold">
                  <AnimatedNumber value={result.skipped} />
                </div>
                <div className="text-xs sm:text-sm text-muted-foreground">{fr.import.skipped}</div>
              </div>
              </StaggerItem>
              <StaggerItem>
              <div className="text-center p-3 sm:p-4 bg-destructive/10 rounded-lg">
                <AlertTriangle className="h-6 w-6 sm:h-8 sm:w-8 mx-auto text-destructive mb-2" />
                <div className="text-xl sm:text-2xl font-bold text-destructive">
                  <AnimatedNumber value={result.errors.length} />
                </div>
                <div className="text-xs sm:text-sm text-muted-foreground">{fr.import.errors}</div>
              </div>
              </StaggerItem>
            </StaggerContainer>

            {result.errors.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium">Détail des erreurs</h4>
                  <Button variant="outline" size="sm" onClick={downloadErrors}>
                    <Download className="h-4 w-4 mr-2" />
                    {fr.import.downloadErrors}
                  </Button>
                </div>
                <div className="max-h-40 overflow-auto border rounded">
                  <table className="w-full text-sm">
                    <thead className="bg-muted sticky top-0">
                      <tr>
                        <th className="text-left p-2">Date</th>
                        <th className="text-left p-2">Membre</th>
                        <th className="text-left p-2">Erreur</th>
                      </tr>
                    </thead>
                    <tbody>
                      <AnimatedList
                        items={result.errors}
                        getKey={(_err, i) => String(i)}
                        as="tr"
                        itemClassName="border-t"
                        renderItem={(err) => (
                          <>
                            <td className="p-2">{err.date}</td>
                            <td className="p-2">{err.memberName}</td>
                            <td className="p-2 text-destructive">{err.error}</td>
                          </>
                        )}
                      />
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
        </AnimatedSection>
      )}
    </div>
  );
}
