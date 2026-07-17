import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as m from 'motion/react-m';
import { useAuthContext } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { fr } from '@/lib/i18n';
import { Calendar, Users, ShieldCheck } from 'lucide-react';
import { StaggerContainer, StaggerItem } from '@/components/motion';
import { AppBackground } from '@/components/shared';
import { premiumEase } from '@/lib/motion';

export default function Auth() {
  const navigate = useNavigate();
  const { signIn, signUp, user, isAdmin, isApproved } = useAuthContext();
  const [loading, setLoading] = useState(false);

  // Redirect if already logged in
  if (user) {
    if (!isApproved && !isAdmin) {
      navigate('/awaiting-approval', { replace: true });
    } else {
      navigate('/', { replace: true });
    }
  }

  const handleSignIn = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;

    try {
      await signIn(email, password);
      toast.success('Connexion réussie');
    } catch (error: any) {
      toast.error(error.message || 'Erreur de connexion');
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;
    const fullName = formData.get('fullName') as string;

    try {
      await signUp(email, password, fullName);
      toast.success('Compte créé ! Vérifiez votre email pour confirmer votre compte.');
    } catch (error: any) {
      toast.error(error.message || 'Erreur lors de la création du compte');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden p-4">
      <AppBackground variant="auth" />

      <StaggerContainer className="relative w-full max-w-md space-y-8">
        {/* Logo and Title */}
        <div className="text-center space-y-4">
          <StaggerItem>
            <m.div
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.32, ease: premiumEase }}
              className="relative inline-flex items-center justify-center w-16 h-16 rounded-2xl text-primary-foreground shadow-lg shadow-primary/25"
              style={{ background: 'var(--gradient-primary)' }}
            >
              <Calendar className="w-8 h-8" />
            </m.div>
          </StaggerItem>
          <StaggerItem>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Gestion de Permanences</h1>
              <p className="text-muted-foreground mt-2">
                Suivi et affectation des permanences avec aide à la décision
              </p>
            </div>
          </StaggerItem>
        </div>

        {/* Features */}
        <StaggerItem>
          <div className="flex justify-center gap-6 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-info/10 text-info">
                <Users className="w-3.5 h-3.5" />
              </span>
              <span>Équipe</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-accent/10 text-accent">
                <Calendar className="w-3.5 h-3.5" />
              </span>
              <span>Planning</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-success/10 text-success">
                <ShieldCheck className="w-3.5 h-3.5" />
              </span>
              <span>Sécurisé</span>
            </div>
          </div>
        </StaggerItem>

        {/* Auth Card */}
        <StaggerItem>
          <Card className="shadow-xl shadow-primary/5 border-border/60 bg-card/85 backdrop-blur-sm">
            <CardHeader className="text-center pb-4">
              <CardTitle>Bienvenue</CardTitle>
              <CardDescription>Connectez-vous ou créez un compte</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="signin" className="w-full">
                <TabsList className="grid w-full grid-cols-2 mb-6">
                  <TabsTrigger value="signin">{fr.auth.signIn}</TabsTrigger>
                  <TabsTrigger value="signup">{fr.auth.signUp}</TabsTrigger>
                </TabsList>

                <TabsContent value="signin">
                  <StaggerContainer as="div" className="space-y-4">
                    <form onSubmit={handleSignIn} className="space-y-4">
                      <StaggerItem>
                        <div className="space-y-2">
                          <Label htmlFor="signin-email">{fr.auth.email}</Label>
                          <Input
                            id="signin-email"
                            name="email"
                            type="email"
                            placeholder="vous@exemple.com"
                            required
                            autoComplete="email"
                          />
                        </div>
                      </StaggerItem>
                      <StaggerItem>
                        <div className="space-y-2">
                          <Label htmlFor="signin-password">{fr.auth.password}</Label>
                          <Input
                            id="signin-password"
                            name="password"
                            type="password"
                            placeholder="••••••••"
                            required
                            autoComplete="current-password"
                          />
                        </div>
                      </StaggerItem>
                      <StaggerItem>
                        <Button type="submit" className="w-full" disabled={loading}>
                          {loading ? fr.auth.signingIn : fr.auth.signIn}
                        </Button>
                      </StaggerItem>
                    </form>
                  </StaggerContainer>
                </TabsContent>

                <TabsContent value="signup">
                  <StaggerContainer as="div" className="space-y-4">
                    <form onSubmit={handleSignUp} className="space-y-4">
                      <StaggerItem>
                        <div className="space-y-2">
                          <Label htmlFor="signup-fullname">{fr.auth.fullName}</Label>
                          <Input
                            id="signup-fullname"
                            name="fullName"
                            type="text"
                            placeholder="Jean Dupont"
                            required
                          />
                        </div>
                      </StaggerItem>
                      <StaggerItem>
                        <div className="space-y-2">
                          <Label htmlFor="signup-email">{fr.auth.email}</Label>
                          <Input
                            id="signup-email"
                            name="email"
                            type="email"
                            placeholder="vous@exemple.com"
                            required
                            autoComplete="email"
                          />
                        </div>
                      </StaggerItem>
                      <StaggerItem>
                        <div className="space-y-2">
                          <Label htmlFor="signup-password">{fr.auth.password}</Label>
                          <Input
                            id="signup-password"
                            name="password"
                            type="password"
                            placeholder="••••••••"
                            required
                            autoComplete="new-password"
                            minLength={6}
                          />
                        </div>
                      </StaggerItem>
                      <StaggerItem>
                        <Button type="submit" className="w-full" disabled={loading}>
                          {loading ? fr.auth.signingUp : fr.auth.createAccount}
                        </Button>
                      </StaggerItem>
                    </form>
                  </StaggerContainer>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </StaggerItem>

        <StaggerItem>
          <p className="text-center text-sm text-muted-foreground">
            V2+ — Gestion intelligente des permanences
          </p>
        </StaggerItem>
      </StaggerContainer>
    </div>
  );
}
