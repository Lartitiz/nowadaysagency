import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { MailOff, MailCheck, Loader2 } from "lucide-react";

export default function UnsubscribePage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [isUnsubscribed, setIsUnsubscribed] = useState(false);
  const [acting, setActing] = useState(false);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    (async () => {
      const { data } = await (supabase.from("email_unsubscribes") as any)
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      setIsUnsubscribed(!!data);
      setLoading(false);
    })();
  }, [user]);

  const handleUnsubscribe = async () => {
    if (!user) return;
    setActing(true);
    await (supabase.from("email_unsubscribes") as any).insert({
      user_id: user.id,
      email: user.email?.toLowerCase(),
    });
    setIsUnsubscribed(true);
    setActing(false);
  };

  const handleResubscribe = async () => {
    if (!user) return;
    setActing(true);
    await (supabase.from("email_unsubscribes") as any)
      .delete()
      .eq("user_id", user.id);
    setIsUnsubscribed(false);
    setActing(false);
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-secondary flex items-center justify-center px-4">
        <div className="bg-card rounded-2xl border border-border p-8 max-w-md w-full text-center space-y-4">
          <MailOff className="h-12 w-12 text-muted-foreground mx-auto" />
          <h1 className="font-display text-xl font-bold text-foreground">Gestion des emails</h1>
          <p className="text-sm text-muted-foreground">
            Connecte-toi pour gérer tes préférences email.
          </p>
          <Button asChild className="rounded-full">
            <Link to="/login">Se connecter</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-secondary flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-secondary flex items-center justify-center px-4">
      <div className="bg-card rounded-2xl border border-border p-8 max-w-md w-full text-center space-y-5">
        {isUnsubscribed ? (
          <>
            <MailCheck className="h-12 w-12 text-primary mx-auto" />
            <h1 className="font-display text-xl font-bold text-foreground">Tu es désabonnée</h1>
            <p className="text-sm text-muted-foreground">
              Tu ne recevras plus d'emails de notre part. Tu peux te réinscrire à tout moment.
            </p>
            <Button
              onClick={handleResubscribe}
              disabled={acting}
              variant="outline"
              className="rounded-full gap-2"
            >
              {acting ? <Loader2 className="h-4 w-4 animate-spin" /> : <MailCheck className="h-4 w-4" />}
              Me réinscrire
            </Button>
          </>
        ) : (
          <>
            <MailOff className="h-12 w-12 text-muted-foreground mx-auto" />
            <h1 className="font-display text-xl font-bold text-foreground">Se désinscrire des emails</h1>
            <p className="text-sm text-muted-foreground">
              Tu ne recevras plus d'emails de L'Assistant Com'. Tu pourras te réinscrire à tout moment depuis cette page.
            </p>
            <p className="text-xs text-muted-foreground">
              Email : {user.email}
            </p>
            <Button
              onClick={handleUnsubscribe}
              disabled={acting}
              className="rounded-full gap-2"
            >
              {acting ? <Loader2 className="h-4 w-4 animate-spin" /> : <MailOff className="h-4 w-4" />}
              Me désinscrire des emails
            </Button>
          </>
        )}

        <div className="pt-2">
          <Link to="/dashboard" className="text-xs text-muted-foreground hover:text-primary transition-colors">
            ← Retour à l'accueil
          </Link>
        </div>
      </div>
    </div>
  );
}