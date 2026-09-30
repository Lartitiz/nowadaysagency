import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useUserPlan } from "@/hooks/use-user-plan";
import { versTarifs } from "@/lib/retour-apres-detour";
import { trackUpgrade } from "@/lib/upgrade-events";
import { Button } from "@/components/ui/button";

/** One quiet invitation after a usable result; dismissal persists for this account. */
export function CreationUpgradeInvite() {
 const { user, isAdmin } = useAuth();
 const { verified, plan } = useUserPlan();
 const navigate = useNavigate();
 const key = `upgrade_result_dismissed:${user?.id}`;
 const [dismissed, setDismissed] = useState(() => { try { return localStorage.getItem(key) === "1"; } catch { return false; } });
 const show = !!user && !isAdmin && verified && plan === "free" && !dismissed;
 useEffect(() => { if (show) trackUpgrade("invitation_shown", { surface: "creation_result", plan }); }, [show, plan]);
 if (!show) return null;
 return <aside className="my-4 rounded-xl border p-4 text-sm space-y-2">
  <p>Envie de créer régulièrement ? Premium comprend tes textes sans compter, 20 carrousels, 30 images et 3 vidéos par mois.</p>
  <div className="flex flex-wrap gap-2">
   <Button variant="outline" onClick={() => { trackUpgrade("invitation_clicked", { surface: "creation_result", plan }); versTarifs(navigate); }}>Découvrir Premium</Button>
   <Button variant="ghost" onClick={() => { setDismissed(true); try { localStorage.setItem(key,"1"); } catch { /* Optional preference. */ } }}>Continuer avec le gratuit</Button>
  </div>
 </aside>;
}
