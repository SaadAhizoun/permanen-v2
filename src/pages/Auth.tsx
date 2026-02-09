import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthContext } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { fr } from '@/lib/i18n';
import { Calendar, Users, Shield } from 'lucide-react';

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
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-primary/5 via-background to-accent/5 p-4">
      <div className="w-full max-w-md space-y-8">
        {/* Logo and Title */}
        <div className="text-center space-y-4">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary text-primary-foreground shadow-lg">
            <Calendar className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Gestion de Permanences</h1>
            <p className="text-muted-foreground mt-2">
              Suivi et affectation des permanences avec aide à la décision
            </p>
          </div>
        </div>

        {/* Features */}
        <div className="flex justify-center gap-6 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-accent" />
            <span>Équipe</span>
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-accent" />
            <span>Planning</span>
          </div>
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-accent" />
            <span>Sécurisé</span>
          </div>
        </div>

        {/* Auth Card */}
        <Card className="shadow-xl border-0 bg-card/80 backdrop-blur-sm">
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
                <form onSubmit={handleSignIn} className="space-y-4">
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
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? fr.auth.signingIn : fr.auth.signIn}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="signup">
                <form onSubmit={handleSignUp} className="space-y-4">
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
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? fr.auth.signingUp : fr.auth.createAccount}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <p className="text-center text-sm text-muted-foreground">
          V2+ — Gestion intelligente des permanences
        </p>
      </div>
    </div>
  );
}
