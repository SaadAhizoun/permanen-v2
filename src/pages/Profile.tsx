import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Lock } from 'lucide-react';
import { PageTransition, StaggerContainer, StaggerItem } from '@/components/motion';
import { AppBackground } from '@/components/shared';

export default function Profile() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChangePassword = async () => {
    if (password.length < 8) {
      toast.error('Le mot de passe doit contenir au moins 8 caractères.');
      return;
    }

    if (password !== confirm) {
      toast.error('Les mots de passe ne correspondent pas.');
      return;
    }

    try {
      setLoading(true);

      const { error } = await supabase.auth.updateUser({
        password,
      });

      if (error) throw error;

      toast.success('Mot de passe mis à jour avec succès.');
      setPassword('');
      setConfirm('');
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Erreur lors du changement.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen">
      <AppBackground variant="shell" />
      <PageTransition className="relative max-w-xl mx-auto px-4 py-16">
        <Card className="shadow-lg shadow-primary/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Lock className="h-4.5 w-4.5" />
              </span>
              Changer le mot de passe
            </CardTitle>
            <CardDescription>
              Choisissez un mot de passe d&apos;au moins 8 caractères.
            </CardDescription>
          </CardHeader>

          <StaggerContainer as="div">
            <CardContent className="space-y-4">
              <StaggerItem>
                <div className="space-y-1.5">
                  <Label htmlFor="new-password">Nouveau mot de passe</Label>
                  <Input
                    id="new-password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
              </StaggerItem>

              <StaggerItem>
                <div className="space-y-1.5">
                  <Label htmlFor="confirm-password">Confirmer le mot de passe</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    placeholder="••••••••"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                  />
                </div>
              </StaggerItem>

              <StaggerItem>
                <Button
                  className="w-full"
                  onClick={handleChangePassword}
                  disabled={loading}
                >
                  {loading ? 'Mise à jour...' : 'Mettre à jour'}
                </Button>
              </StaggerItem>
            </CardContent>
          </StaggerContainer>
        </Card>
      </PageTransition>
    </div>
  );
}
