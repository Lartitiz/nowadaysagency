import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarPlus, Sparkles, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspaceId } from "@/hooks/use-workspace-query";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { dropAlreadyPlanned } from "@/lib/calendar-duplicates";
import {
  ChatPlanItem,
  PLAN_FORMAT_EMOJI,
  PLAN_FORMAT_LABEL,
  nextDateForDay,
  planItemRoute,
} from "@/lib/chat-plan";

/**
 * Les contenus proposés par l'assistant, avec un VRAI bouton d'ajout au
 * calendrier par contenu.
 *
 * Deux principes :
 * - ajouter n'emmène nulle part : on reste dans le chat, la carte passe à
 *   "✅ Ajouté", et les autres contenus proposés restent ajoutables ;
 * - le calendrier ne s'ouvre que si l'utilisatrice le demande (lien discret
 *   qui apparaît après le premier ajout).
 */
export default function ChatPlanCards({ items }: { items: ChatPlanItem[] }) {
  const { user } = useAuth();
  const workspaceId = useWorkspaceId();
  const navigate = useNavigate();
  const [added, setAdded] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<number | "all" | null>(null);

  const scope = user && workspaceId !== user.id ? workspaceId : null;

  // Déjà au calendrier ? (retour sur la conversation, ou ajout fait ailleurs)
  useEffect(() => {
    if (!user || items.length === 0) return;
    let cancelled = false;
    (async () => {
      const dates = Array.from(new Set(items.map((i) => nextDateForDay(i.day))));
      const q = supabase.from("calendar_posts").select("date, theme").in("date", dates);
      const { data } = scope ? await q.eq("workspace_id", scope) : await q.eq("user_id", user.id);
      if (cancelled || !data) return;
      const existing = new Set(data.map((r: any) => `${r.date}|${String(r.theme || "").trim().toLowerCase()}`));
      const seeded: Record<number, string> = {};
      items.forEach((item, i) => {
        const date = nextDateForDay(item.day);
        if (existing.has(`${date}|${item.subject.trim().toLowerCase()}`)) seeded[i] = date;
      });
      if (Object.keys(seeded).length > 0) setAdded((prev) => ({ ...seeded, ...prev }));
    })();
    return () => { cancelled = true; };
  }, [user, scope, items]);

  const addOne = useCallback(
    async (item: ChatPlanItem, index: number): Promise<boolean> => {
      if (!user) return false;
      const date = nextDateForDay(item.day);
      const row: Record<string, unknown> = {
        user_id: user.id,
        date,
        theme: item.subject,
        format: item.format,
        canal: "instagram",
        status: "a_rediger",
        objectif: item.objective,
        notes: "Proposé par l'Assistant Com'",
      };
      if (scope) row.workspace_id = scope;

      // Le pré-cochage au rendu ne suffit pas : entre l'affichage et le clic, le
      // contenu a pu être posé ailleurs (autre onglet, « Planifier ma semaine »).
      const { duplicates } = await dropAlreadyPlanned(
        [{ date, theme: item.subject, canal: "instagram" }],
        { userId: user.id, workspaceId: scope },
      );
      if (duplicates.length > 0) {
        setAdded((prev) => ({ ...prev, [index]: date }));
        return true;
      }

      const { error } = await supabase.from("calendar_posts").insert(row as any);
      if (error) return false;
      setAdded((prev) => ({ ...prev, [index]: date }));
      return true;
    },
    [user, scope],
  );

  const handleAddOne = async (item: ChatPlanItem, index: number) => {
    setBusy(index);
    const ok = await addOne(item, index);
    setBusy(null);
    if (ok) toast.success(`📅 Ajouté au ${item.day.toLowerCase()}`);
    else toast.error("L'ajout au calendrier n'a pas marché. Réessaie.");
  };

  const pending = items.map((item, i) => ({ item, i })).filter(({ i }) => !added[i]);

  const handleAddAll = async () => {
    setBusy("all");
    let ok = 0;
    for (const { item, i } of pending) {
      if (await addOne(item, i)) ok++;
    }
    setBusy(null);
    if (ok === pending.length) toast.success(`📅 ${ok} contenu${ok > 1 ? "s" : ""} ajouté${ok > 1 ? "s" : ""} au calendrier`);
    else if (ok > 0) toast.warning(`${ok} sur ${pending.length} ajoutés. Réessaie pour le reste.`);
    else toast.error("L'ajout au calendrier n'a pas marché. Réessaie.");
  };

  if (items.length === 0) return null;
  const addedCount = Object.keys(added).length;

  return (
    <div className="mt-3 space-y-2" aria-label="Contenus proposés pour ton calendrier">
      {items.map((item, i) => {
        const isAdded = Boolean(added[i]);
        return (
          <div
            key={`${item.day}-${item.subject}-${i}`}
            className={`rounded-xl border p-3 space-y-2 transition-colors ${
              isAdded ? "border-success/40 bg-success-bg/40" : "border-border bg-card"
            }`}
          >
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-pill">{item.day}</span>
              <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-pill">
                {PLAN_FORMAT_EMOJI[item.format] || "📝"} {PLAN_FORMAT_LABEL[item.format] || item.format}
              </span>
            </div>
            <p className="text-sm font-medium text-foreground">{item.subject}</p>
            <div className="flex gap-2 flex-wrap">
              <Button
                size="sm"
                variant="outline"
                className="text-xs gap-1"
                disabled={isAdded || busy !== null}
                onClick={() => handleAddOne(item, i)}
              >
                {busy === i ? (
                  <><Spinner className="h-3 w-3" /> Ajout…</>
                ) : isAdded ? (
                  "✅ Ajouté"
                ) : (
                  <><CalendarPlus className="h-3 w-3" /> Ajouter au calendrier</>
                )}
              </Button>
              <Button size="sm" className="text-xs gap-1" onClick={() => navigate(planItemRoute(item))}>
                <Sparkles className="h-3 w-3" /> Créer ce contenu
              </Button>
            </div>
          </div>
        );
      })}

      <div className="flex items-center gap-3 flex-wrap pt-0.5">
        {pending.length > 1 && (
          <Button size="sm" variant="secondary" className="text-xs gap-1" disabled={busy !== null} onClick={handleAddAll}>
            {busy === "all" ? (
              <><Spinner className="h-3 w-3" /> Ajout…</>
            ) : (
              <><CalendarPlus className="h-3 w-3" /> Tout ajouter ({pending.length})</>
            )}
          </Button>
        )}
        {addedCount > 0 && (
          <button
            type="button"
            onClick={() => navigate("/calendrier")}
            className="text-xs text-primary-text underline underline-offset-2 inline-flex items-center gap-1"
          >
            Voir mon calendrier <ArrowRight className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}
