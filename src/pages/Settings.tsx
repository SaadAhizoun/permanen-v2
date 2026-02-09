import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Settings as SettingsIcon } from 'lucide-react';

export default function Settings() {
  return (
    <div className="max-w-2xl mx-auto animate-fade-in">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <SettingsIcon className="h-5 w-5" />
            Paramètres
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Les paramètres de l'application seront disponibles ici.</p>
        </CardContent>
      </Card>
    </div>
  );
}
