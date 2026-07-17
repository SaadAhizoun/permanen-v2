import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Lock } from 'lucide-react';
import { PageTransition, StaggerContainer, StaggerItem } from '@/components/motion';

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
    <PageTransition className="max-w-xl mx-auto mt-10">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5" />
            Changer le mot de passe
          </CardTitle>
        </CardHeader>

        <StaggerContainer as="div">
          <CardContent className="space-y-4">
            <StaggerItem>
              <Input
                type="password"
                placeholder="Nouveau mot de passe"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </StaggerItem>

            <StaggerItem>
              <Input
                type="password"
                placeholder="Confirmer le mot de passe"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
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
  );
}
