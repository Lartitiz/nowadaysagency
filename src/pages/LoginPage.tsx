import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

export default function LoginPage() {
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex gap-1">
          <div className="h-3 w-3 rounded-full bg-primary animate-bounce-dot" />
          <div className="h-3 w-3 rounded-full bg-primary animate-bounce-dot" style={{ animationDelay: "0.16s" }} />
          <div className="h-3 w-3 rounded-full bg-primary animate-bounce-dot" style={{ animationDelay: "0.32s" }} />
        </div>
      </div>
    );
  }

  // Don't hard-redirect to /dashboard — let AuthContext handle onboarding check
  if (user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex gap-1">
          <div className="h-3 w-3 rounded-full bg-primary animate-bounce-dot" />
          <div className="h-3 w-3 rounded-full bg-primary animate-bounce-dot" style={{ animationDelay: "0.16s" }} />
          <div className="h-3 w-3 rounded-full bg-primary animate-bounce-dot" style={{ animationDelay: "0.32s" }} />
        </div>
      </div>
    );
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    } catch (error: any) {
      const msg = error.message;
      toast({
        title: "Oups !",
        description:
          msg === "Invalid login credentials"
            ? "Email ou mot de passe incorrect."
            : msg === "Email not confirmed"
            ? "Confirme ton email d'abord !"
            : msg,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      toast({ title: "Oups !", description: "Entre ton email.", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setForgotSent(true);
      toast({ title: "C'est envoyé !", description: "Vérifie ta boîte mail pour réinitialiser ton mot de passe." });
    } catch (error: any) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md animate-fade-in">
        <div className="mb-8 text-center">
          <Link to="/" className="inline-block">
            <h1 className="font-display text-4xl font-bold text-bordeaux">L'Assistant Com'</h1>
          </Link>
          <p className="mt-1 font-body text-sm text-muted-foreground">par Nowadays Agency</p>
          <span className="mt-2 inline-block rounded-pill bg-secondary px-3 py-1 text-xs font-medium text-primary">
            beta
          </span>
        </div>

        <div className="rounded-2xl bg-card p-8 shadow-sm border border-border">
          {forgotMode ? (
            <>
              <h2 className="font-display text-2xl font-semibold text-center mb-2">
                Mot de passe oublié
              </h2>
              <p className="text-center text-muted-foreground text-sm mb-6">
                Entre ton email, on t'envoie un lien de réinitialisation.
              </p>
              {forgotSent ? (
                <div className="text-center space-y-3">
                  <p className="text-sm text-foreground">Un email t'a été envoyé. Vérifie ta boîte mail.</p>
                  <button onClick={() => { setForgotMode(false); setForgotSent(false); }} className="text-primary font-medium hover:underline text-sm">
                    Retour à la connexion
                  </button>
                </div>
              ) : (
                <form onSubmit={handleForgotPassword} className="space-y-4">
                  <Input
                    type="email"
                    placeholder="ton@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="rounded-[10px] border-border bg-background h-12"
                  />
                  <Button
                    type="submit"
                    disabled={loading}
                    className="w-full h-12 rounded-pill bg-primary text-primary-foreground hover:bg-bordeaux transition-colors text-base font-medium"
                  >
                    {loading ? "Un instant..." : "Envoyer le lien"}
                  </Button>
                  <p className="text-center">
                    <button onClick={() => setForgotMode(false)} className="text-primary font-medium hover:underline text-sm">
                      Retour à la connexion
                    </button>
                  </p>
                </form>
              )}
            </>
          ) : (
            <>
              <h2 className="font-display text-2xl font-semibold text-center mb-2">Bon retour !</h2>
              <p className="text-center text-muted-foreground text-sm mb-6">Ton atelier t'attend</p>

              <button
                onClick={async () => {
                  const { error } = await lovable.auth.signInWithOAuth("google", {
                    redirect_uri: window.location.origin,
                  });
                  if (error) {
                    toast({ title: "Erreur", description: "Impossible de se connecter avec Google.", variant: "destructive" });
                  }
                }}
                className="w-full h-12 flex items-center justify-center gap-3 rounded-[10px] border border-border bg-card hover:bg-muted transition-colors text-sm font-medium text-foreground mb-4"
              >
                <svg width="20" height="20" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59a14.5 14.5 0 0 1 0-9.18l-7.98-6.19a24.01 24.01 0 0 0 0 21.56l7.98-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
                Continuer avec Google
              </button>

              <div className="flex items-center gap-3 mb-4">
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs text-muted-foreground">ou</span>
                <div className="flex-1 h-px bg-border" />
              </div>

              <form onSubmit={handleLogin} className="space-y-4">
                <Input
                  type="email"
                  placeholder="ton@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="rounded-[10px] border-border bg-background h-12"
                />
                <Input
                  type="password"
                  placeholder="Mot de passe"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="rounded-[10px] border-border bg-background h-12"
                />
                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full h-12 rounded-pill bg-primary text-primary-foreground hover:bg-bordeaux transition-colors text-base font-medium"
                >
                  {loading ? "Un instant..." : "Se connecter"}
                </Button>
              </form>

              <div className="mt-4 text-center">
                <button
                  onClick={() => setForgotMode(true)}
                  className="text-muted-foreground hover:text-primary text-sm hover:underline"
                >
                  Mot de passe oublié ?
                </button>
              </div>

              <p className="mt-6 text-center text-sm text-muted-foreground">
                Pas encore de compte ?{" "}
                <Link to="/" className="text-primary font-medium hover:underline">
                  Inscris-toi gratuitement
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
