import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthContext } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { fr } from '@/lib/i18n';
import { Clock, RefreshCw, LogOut, Calendar } from 'lucide-react';
import { toast } from 'sonner';

export default function AwaitingApproval() {
  const navigate = useNavigate();
  const { signOut, refresh, user, isApproved, isAdmin } = useAuthContext();
  const [checking, setChecking] = useState(false);

  // Redirect if approved or admin
  if (isApproved || isAdmin) {
    navigate('/', { replace: true });
  }

  const handleCheckAccess = async () => {
    setChecking(true);
    try {
      const roles = await refresh();
      if (roles.isApproved || roles.isAdmin) {
        toast.success('Accès accordé !');
        navigate('/', { replace: true });
      } else {
        toast.info('Votre compte est toujours en attente de validation.');
      }
    } catch (error) {
      toast.error('Erreur lors de la vérification');
    } finally {
      setChecking(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth', { replace: true });
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-primary/5 via-background to-accent/5 p-4">
      <div className="w-full max-w-md space-y-8">
        {/* Logo */}
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary text-primary-foreground shadow-lg">
            <Calendar className="w-8 h-8" />
          </div>
        </div>

        {/* Waiting Card */}
        <Card className="shadow-xl border-0 bg-card/80 backdrop-blur-sm">
          <CardHeader className="text-center pb-4">
            <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-warning/10 flex items-center justify-center">
              <Clock className="w-8 h-8 text-warning animate-pulse-soft" />
            </div>
            <CardTitle className="text-xl">{fr.approval.title}</CardTitle>
            <CardDescription className="text-base mt-2">
              {fr.approval.description}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {user && (
              <div className="text-center p-4 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground">Connecté en tant que</p>
                <p className="font-medium">{user.email}</p>
              </div>
            )}

            <div className="flex flex-col gap-3">
              <Button
                onClick={handleCheckAccess}
                disabled={checking}
                className="w-full"
              >
                {checking ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    {fr.approval.checking}
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    {fr.approval.checkAccess}
                  </>
                )}
              </Button>

              <Button
                variant="outline"
                onClick={handleSignOut}
                className="w-full"
              >
                <LogOut className="w-4 h-4 mr-2" />
                {fr.auth.signOut}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
