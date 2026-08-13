import BrandLogo from "@/components/BrandLogo";
import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { friendlyError } from "@/lib/error-messages";
import PasswordStrengthIndicator from "@/components/ui/PasswordStrengthIndicator";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [expired, setExpired] = useState(false);
  const readyRef = useRef(false);

  useEffect(() => {
    // 1) Lien déjà consommé/expiré : Supabase redirige avec l'erreur DANS le
    //    fragment (#error=access_denied&error_code=otp_expired). Le dire tout
    //    de suite — avant, on laissait 15 s de « Chargement... » avant l'écran
    //    « Lien expiré ». Cas fréquent : token à usage unique grillé par un
    //    scanner d'e-mails (le lien passe par un wrapper de tracking, un
    //    simple GET suffit) avant le clic réel de l'utilisatrice.
    if (/error_code=otp_expired|error=access_denied/.test(window.location.hash)) {
      setExpired(true);
      return;
    }

    const markReady = () => {
      readyRef.current = true;
      setReady(true);
      setExpired(false);
    };

    // 2) Chemin nominal : supabase-js consomme le #access_token et émet
    //    PASSWORD_RECOVERY après le montage.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") markReady();
    });

    // 3) Filet : si l'échange du token s'est fait AVANT notre abonnement
    //    (client supabase initialisé au chargement du bundle), l'événement est
    //    raté mais la session existe → autoriser la saisie au lieu d'afficher
    //    « Lien expiré » à tort sur un lien valide.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) markReady();
    });

    // 4) Timeout de secours via ref — l'ancienne version capturait `ready`
    //    dans la closure (toujours false) : après 15 s, `expired` repassait à
    //    true même quand le formulaire était prêt.
    const timeout = setTimeout(() => {
      if (!readyRef.current) setExpired(true);
    }, 15000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("Mot de passe mis à jour !", { description: "Connecte-toi avec ton nouveau mot de passe." });
      navigate("/login");
    } catch (error: any) {
      console.error("Erreur technique:", error);
      toast.error("Erreur", { description: friendlyError(error) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md animate-fade-in">
        <div className="mb-8 text-center">
          <BrandLogo className="h-14 mx-auto" />
          <p className="mt-1 font-body text-sm text-muted-foreground">par Nowadays Agency</p>
        </div>
        <div className="rounded-2xl bg-card p-8 shadow-sm border border-border">
          <h2 className="font-display text-2xl font-semibold text-center mb-2">Nouveau mot de passe</h2>
          <p className="text-center text-muted-foreground text-sm mb-6">Choisis un nouveau mot de passe sécurisé.</p>

          {expired && !ready ? (
            <div className="text-center space-y-4">
              <h3 className="font-display text-lg font-semibold text-destructive">Lien expiré</h3>
              <p className="text-sm text-muted-foreground">
                Ce lien de réinitialisation n'est plus valide. Renvoie-toi un nouveau lien depuis la page de connexion.
              </p>
              <Link
                to="/login"
                className="inline-block w-full h-12 leading-[3rem] rounded-pill bg-primary text-primary-foreground hover:bg-bordeaux transition-colors text-base font-medium text-center"
              >
                Retour à la connexion
              </Link>
            </div>
          ) : !ready ? (
            <div className="text-center space-y-3">
              <p className="text-sm text-muted-foreground">Chargement...</p>
              <Link to="/login" className="text-xs text-muted-foreground underline hover:text-foreground transition-colors">
                Retour à la connexion
              </Link>
            </div>
          ) : (
            <form onSubmit={handleReset} className="space-y-4">
              <Input
                type="password"
                placeholder="Nouveau mot de passe (8 car. min.)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                className="rounded-[10px] border-border bg-background h-12"
              />
              <PasswordStrengthIndicator password={password} />
              <Button
                type="submit"
                disabled={loading}
                className="w-full h-12 rounded-pill bg-primary text-primary-foreground hover:bg-bordeaux transition-colors text-base font-medium"
              >
                {loading ? "Un instant..." : "Mettre à jour"}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
