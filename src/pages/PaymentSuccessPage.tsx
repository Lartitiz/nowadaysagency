import { useWorkspace } from "@/contexts/WorkspaceContext";
import { trackUpgrade } from "@/lib/upgrade-events";
import { useEffect, useState } from "react";
import { useSearchParams, Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { invokeWithTimeout } from "@/lib/invoke-with-timeout";
import { invalidateUserPlanCache } from "@/hooks/use-user-plan";
import { lireRetour, oublieRetour } from "@/lib/retour-apres-detour";
import AppHeader from "@/components/AppHeader";
import Confetti from "@/components/Confetti";
import { Button } from "@/components/ui/button";
import { CheckCircle, Sparkles, ArrowRight, Loader2 } from "lucide-react";

type PaymentState = "checking" | "confirmed" | "pending" | "incomplete" | "payment_pending" | "error";

export default function PaymentSuccessPage() {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const { user, loading: authLoading } = useAuth();
  const [state, setState] = useState<PaymentState>("checking");
  const [attempt, setAttempt] = useState(0);
  const navigate = useNavigate();
  const retour = user ? lireRetour() : null;
  const { switchWorkspace } = useWorkspace();
  const [kind, setKind] = useState<string>();
  const [credits, setCredits] = useState<number>();

  useEffect(() => {
    if (authLoading) return;
    if (!sessionId || !user) { setState("incomplete"); return; }
    let cancelled = false;
    const verify = async () => {
      setState("checking");
      for (let count = 0; count < 4; count++) {
        const { data, error } = await invokeWithTimeout("verify-checkout", { body: { session_id: sessionId } }, 15000);
        if (cancelled) return;
        if (error || !data?.state) { setState("error"); return; }
        if (data.state === "confirmed") {
          invalidateUserPlanCache(true);
          setKind(data.kind);
          setCredits(data.credits);
          trackUpgrade("purchase_confirmed", { surface: "payment", kind: data.kind });
          setState("confirmed");
          return;
        }
        if (data.state === "payment_pending") { setState("payment_pending"); return; }
        if (data.state === "incomplete") { setState("incomplete"); return; }
        if (count < 3) await new Promise(resolve => setTimeout(resolve, 2500));
        if (cancelled) return;
      }
      setState("pending");
    };
    void verify();
    return () => { cancelled = true; };
  }, [sessionId, user?.id, authLoading, attempt]);

  const confirmed = state === "confirmed";

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      {confirmed && <Confetti />}
      <main className="mx-auto max-w-lg px-4 py-16 text-center animate-fade-in" aria-live="polite">
        <div className="mx-auto mb-6 h-16 w-16 rounded-full bg-accent flex items-center justify-center">
          {confirmed ? <CheckCircle className="h-8 w-8 text-primary" /> : <Loader2 className="h-8 w-8 text-primary" />}
        </div>

        <h1 className="font-display text-3xl font-bold text-foreground mb-3">
          {confirmed ? "🎉 Paiement confirmé !" : state === "checking" ? "Vérification du paiement…" :
            state === "payment_pending" ? "Paiement en attente" : state === "pending" ? "Activation en cours" : state === "error" ? "Vérification indisponible" : "Paiement non confirmé"}
        </h1>

        <p className="text-muted-foreground mb-8 leading-relaxed">
          {confirmed ? kind === "credits" ? `Tes ${credits || "nouveaux"} crédits ont été ajoutés. Ils n’augmentent pas les plafonds mensuels ni les fonctions de ton offre.` : kind === "purchase" ? "Ton achat est enregistré et disponible dans ton compte." : "Merci pour ta confiance. Ton accès est activé." : state === "pending" ?
            "Stripe a enregistré ton paiement. Nous attendons encore l’activation de ton accès. Réessaie dans quelques instants." :
            state === "payment_pending" ? "Le paiement n’est pas encore confirmé par Stripe. Tu peux revenir plus tard ou réessayer la vérification, sans repayer." :
            state === "checking" ? "Nous vérifions le paiement et ton accès avant de confirmer." :
            state === "error" ? "Nous ne pouvons pas confirmer ton paiement pour le moment. Consulte ton abonnement ou réessaie." :
            !sessionId ? "Ce lien ne contient aucune session de paiement. Aucun paiement ne peut être confirmé ici." :
            !user ? "Connecte-toi au compte utilisé pour le paiement afin de vérifier son résultat." :
            "Cette session ne confirme pas de paiement terminé."}
        </p>

        {(state === "pending" || state === "payment_pending" || state === "error") && (
          <Button variant="outline" className="rounded-full mb-4" onClick={() => setAttempt(value => value + 1)}>Réessayer la vérification</Button>
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          {/* Elle a payé DEPUIS un travail en cours (crédits épuisés) : on la
              ramène là où elle en était plutôt que sur le tableau de bord. Un
              bouton et pas une redirection : la confirmation doit rester
              lisible. */}
          {retour ? (
            <Button
              className="rounded-full gap-2"
              onClick={async () => {
                if (retour.workspaceId && !await switchWorkspace(retour.workspaceId)) return;
                trackUpgrade("creation_resumed", { surface: "payment", kind });
                oublieRetour();
                navigate(retour.chemin);
              }}
            >
              <Sparkles className="h-4 w-4" />
              Reprendre {retour.quoi}
            </Button>
          ) : confirmed ? (
            <Button asChild className="rounded-full gap-2">
              <Link to="/dashboard">
                <Sparkles className="h-4 w-4" />
                Commencer
              </Link>
            </Button>
          ) : !user && sessionId ? (
            <Button asChild className="rounded-full"><Link to={`/login?redirect=${encodeURIComponent(`/payment/success?session_id=${sessionId}`)}`}>Se connecter</Link></Button>
          ) : null}
          <Button asChild variant="outline" className="rounded-full gap-2">
            <Link to={user ? "/abonnement" : "/pricing"}>
              {user ? "Voir mon abonnement" : "Voir les offres"}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </main>
    </div>
  );
}
