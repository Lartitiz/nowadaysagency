import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { versTarifs } from "@/lib/retour-apres-detour";
import { trackUpgrade } from "@/lib/upgrade-events";

type Quota = { allowed: boolean; plan: string; reason?: string; category?: string; message?: string; renews_at?: string };
export function AccessNotice({ quota, premiumBlocked, insufficient, onRetry }: {
  quota?: Quota; premiumBlocked?: boolean; insufficient?: boolean; onRetry: () => void;
}) {
  const navigate = useNavigate();
  const unknown = !quota || quota.reason === "error" || quota.plan === "unknown";
  const visible = unknown || premiumBlocked || !quota?.allowed || insufficient;
  const reason = unknown ? "error" : premiumBlocked ? "not_available" : insufficient ? "insufficient" : quota?.reason;
  useEffect(() => {
    if (visible && !unknown) {
      trackUpgrade("limit_encountered", { surface: "studio", reason, plan: quota?.plan });
      if (quota?.plan === "free") trackUpgrade("invitation_shown", { surface: "studio", reason, plan: quota?.plan });
    }
  }, [visible, unknown, reason, quota?.plan]);
  if (!visible) return null;
  const hardCap = insufficient || (quota?.reason === "category" && ["carousel", "photo_retouch", "video"].includes(quota.category || ""));
  const premium = !unknown && quota?.plan === "free";
  const packs = !unknown && !premiumBlocked && !hardCap && quota?.reason === "total";
  return <div role="status" className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-3 text-sm">
    <p>{unknown ? "Impossible de vérifier ton accès pour le moment. Aucun achat n’est nécessaire pour réessayer." :
      premiumBlocked ? "La création de scènes et l’intégration de références sont incluses dans Premium. Tu peux continuer à préparer ton idée gratuitement." :
      insufficient ? "Il ne reste pas assez d’images pour toute cette série. Réduis le nombre d’images ou attends le renouvellement mensuel." : quota?.message}</p>
    {hardCap && <p>Les packs de crédits n’augmentent pas les plafonds d’images, de carrousels ou de vidéos.</p>}
    <div className="flex flex-wrap gap-2">
      {unknown ? <Button variant="outline" onClick={onRetry}>Réessayer la vérification</Button> : <>
        {premium && <Button onClick={() => { trackUpgrade("invitation_clicked", { surface: "studio", reason, plan: quota?.plan }); versTarifs(navigate); }}>Découvrir Premium</Button>}
        {packs && <Button variant="outline" onClick={() => versTarifs(navigate, { destination: "/abonnement#packs" })}>Ajouter des crédits</Button>}
        <Button variant="ghost" onClick={onRetry}>Actualiser mon accès</Button>
      </>}
    </div>
    <p className="text-xs text-muted-foreground">Ta préparation reste dans cette discussion. Rien n’est généré automatiquement après un achat.</p>
  </div>;
}
