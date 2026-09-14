import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { MailMinus, MailCheck, Loader2 } from "lucide-react";

export default function UnsubscribePage() {
  const {user} = useAuth();
  return <UnsubscribeContent key={`${user?.id || ""}:${user?.email || ""}`} />;
}
function UnsubscribeContent() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [isUnsubscribed, setIsUnsubscribed] = useState(false);
  const [acting, setActing] = useState(false);
  const [unsubscribeError, setUnsubscribeError] = useState(false);
  const [resubscribeError, setResubscribeError] = useState(false);

  const [loadError, setLoadError] = useState(false);
  const [revision, retry] = useState(0);
  const mounted = useRef(true);
  const busy = useRef(false);
  useEffect(() => {mounted.current = true; return () => {mounted.current = false;};}, []);
  const readStatus = async () => {
    const {data, error} = await supabase.from("email_unsubscribes").select("id").eq("user_id",user!.id);
    if (error) throw error;
    return (data || []).length > 0;
  };
  useEffect(() => {
    let alive = true;
    if (!user) {setLoading(false); return;}
    setLoading(true); setLoadError(false);
    void readStatus().then(value => {if (alive) setIsUnsubscribed(value);})
      .catch(() => {if (alive) setLoadError(true);})
      .finally(() => {if (alive) setLoading(false);});
    return () => {alive = false;};
  }, [user?.id, revision]);
  const changeStatus = async (unsubscribe: boolean) => {
    if (!user?.email || busy.current || loadError || loading) return;
    busy.current = true; setActing(true); setUnsubscribeError(false); setResubscribeError(false);
    try {
      const query = unsubscribe
        ? supabase.from("email_unsubscribes").insert({user_id:user.id,email:user.email.toLowerCase()})
        : supabase.from("email_unsubscribes").delete().eq("user_id",user.id);
      const {error} = await query;
      if (error && !(unsubscribe && error.code === "23505")) throw error;
      // Re-read after both writes, including duplicate and zero-row responses.
      const value = await readStatus();
      if (value !== unsubscribe) throw new Error("Preference not confirmed");
      if (mounted.current) setIsUnsubscribed(value);
    } catch {
      if (mounted.current) (unsubscribe ? setUnsubscribeError : setResubscribeError)(true);
    } finally {
      busy.current = false;
      if (mounted.current) setActing(false);
    }
  };
  const handleUnsubscribe = () => changeStatus(true);
  const handleResubscribe = () => changeStatus(false);
  if (loadError) return <div role="alert">Impossible de vérifier ta désinscription. <Button onClick={() => retry(n => n + 1)}>Réessayer</Button></div>;

  if (!user) {
    return (
      <div className="min-h-screen bg-secondary flex items-center justify-center px-4">
        <div className="bg-card rounded-2xl border border-border p-8 max-w-md w-full text-center space-y-4">
          <MailMinus className="h-12 w-12 text-muted-foreground mx-auto" />
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
            {resubscribeError && (
              <p className="text-sm text-destructive">
                La réinscription a échoué. Réessaie, ou contacte-nous si le problème persiste.
              </p>
            )}
          </>
        ) : (
          <>
            <MailMinus className="h-12 w-12 text-muted-foreground mx-auto" />
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
              {acting ? <Loader2 className="h-4 w-4 animate-spin" /> : <MailMinus className="h-4 w-4" />}
              Me désinscrire des emails
            </Button>
            {unsubscribeError && (
              <p className="text-sm text-destructive">
                La désinscription a échoué. Réessaie, ou contacte-nous si le problème persiste.
              </p>
            )}
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