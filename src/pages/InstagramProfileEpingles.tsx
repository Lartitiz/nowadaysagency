import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useWorkspaceFilter, useWorkspaceId } from "@/hooks/use-workspace-query";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import { Button } from "@/components/ui/button";
import { InputWithVoice as Input } from "@/components/ui/input-with-voice";
import { useToast } from "@/hooks/use-toast";
import { friendlyError } from "@/lib/error-messages";
import { Sparkles, Check, Save } from "lucide-react";
import AuditInsight from "@/components/AuditInsight";

interface PinnedSlot {
  type: "histoire" | "offre" | "preuve";
  status: "done" | "todo";
  description: string;
}

const SLOTS = [
  {
    type: "histoire" as const,
    emoji: "📖",
    label: "Qui tu es",
    explanation:
      "Un post qui te présente. Storytelling personnel, parcours, valeurs. La personne qui découvre ton profil doit se dire « ah, c'est une vraie personne, j'ai envie de la suivre ».",
    formats: "📑 Carrousel storytelling · 🎬 Reel face cam",
    atelierPreset: {
      objectif: "confiance",
      angle: "storytelling",
      format: "post_carrousel",
      notes:
        "Post destiné à être épinglé en position 1 : présentation personnelle, parcours, valeurs.",
    },
  },
  {
    type: "offre" as const,
    emoji: "🎁",
    label: "Ce que tu fais (ton expertise)",
    explanation:
      "Un post qui montre ta compétence. Contenu éducatif, décryptage, conseil actionnable. La personne doit se dire « elle sait de quoi elle parle ».",
    formats: "📑 Carrousel éducatif · 📑 Carrousel enquête",
    atelierPreset: {
      objectif: "credibilite",
      angle: "enquete_decryptage",
      format: "post_carrousel",
      notes:
        "Post destiné à être épinglé en position 2 : montrer mon expertise et ma compétence.",
    },
  },
  {
    type: "preuve" as const,
    emoji: "⭐",
    label: "Tes résultats (preuve sociale)",
    explanation:
      "Un post qui montre que ça marche. Témoignage, before/after, étude de cas, résultat chiffré. La personne doit se dire « ça marche pour de vrai ».",
    formats: "📑 Carrousel before/after · 📑 Carrousel témoignage",
    atelierPreset: {
      objectif: "vente",
      angle: "before_after",
      format: "post_carrousel",
      notes:
        "Post destiné à être épinglé en position 3 : preuve sociale, témoignage, résultats concrets.",
    },
  },
];

export default function InstagramProfileEpingles() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { column, value } = useWorkspaceFilter();
  const workspaceId = useWorkspaceId();
  const navigate = useNavigate();
  const [slots, setSlots] = useState<PinnedSlot[]>(
    SLOTS.map((s) => ({ type: s.type, status: "todo", description: "" }))
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data } = await (supabase
        .from("instagram_pinned_posts") as any)
        .select("*")
        .eq(column, value);
      if (data && data.length > 0) {
        setSlots(
          SLOTS.map((s) => {
            const existing = data.find((p: any) => p.post_type === s.type);
            if (existing) {
              return {
                type: s.type,
                status: existing.has_existing ? "done" : "todo",
                description: existing.existing_description || "",
              };
            }
            return { type: s.type, status: "todo" as const, description: "" };
          })
        );
      }
      setLoading(false);
    };
    load();
  }, [user?.id]);

  const updateSlot = (idx: number, updates: Partial<PinnedSlot>) => {
    setSlots((prev) => prev.map((s, i) => (i === idx ? { ...s, ...updates } : s)));
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      for (const slot of slots) {
        const row = {
          user_id: user.id,
          workspace_id: workspaceId !== user.id ? workspaceId : undefined,
          post_type: slot.type,
          has_existing: slot.status === "done",
          existing_description: slot.description,
          is_pinned: slot.status === "done",
        };
        const { data: existing } = await (supabase
          .from("instagram_pinned_posts") as any)
          .select("id")
          .eq(column, value)
          .eq("post_type", slot.type)
          .maybeSingle();
        if (existing) {
          await supabase
            .from("instagram_pinned_posts")
            .update(row)
            .eq("id", existing.id);
        } else {
          await supabase.from("instagram_pinned_posts").insert(row);
        }
      }
      toast({ title: "Sauvegardé !" });
    } catch (e: any) {
      console.error("Erreur technique:", e);
      toast({ title: "Erreur", description: friendlyError(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleCreateAtAtelier = (slotType: string) => {
    const slot = SLOTS.find((s) => s.type === slotType);
    if (!slot) return;
    navigate("/atelier?canal=instagram", {
      state: {
        fromPinnedPosts: true,
        pinType: slotType,
        ...slot.atelierPreset,
      },
    });
  };

  const doneCount = slots.filter((s) => s.status === "done").length;

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-background"><div className="flex gap-1"><div className="h-3 w-3 rounded-full bg-primary animate-bounce-dot" /><div className="h-3 w-3 rounded-full bg-primary animate-bounce-dot" style={{ animationDelay: "0.16s" }} /><div className="h-3 w-3 rounded-full bg-primary animate-bounce-dot" style={{ animationDelay: "0.32s" }} /></div></div>;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-6 py-8 max-md:px-4">
        <SubPageHeader
          parentLabel="Mon profil"
          parentTo="/instagram/profil"
          currentLabel="Posts épinglés"
        />

        <h1 className="font-display text-[26px] font-bold text-foreground">
          📌 Tes 3 posts épinglés
        </h1>
        <p className="mt-2 text-sm text-muted-foreground mb-6">
          Les 3 premiers posts de ton feed sont les plus vus après ta bio. C'est
          ta vitrine : en 3 posts, un·e visiteur·se doit comprendre qui tu es, ce
          que tu fais, et pourquoi te suivre.
        </p>

        <AuditInsight section="epingles" />

        {/* Règle des 3 */}
        <div className="rounded-2xl border-l-[3px] border-primary bg-rose-pale p-5 mb-8">
          <p className="text-sm font-semibold text-foreground mb-1">
            💡 La règle des 3 :
          </p>
          <p className="text-sm text-muted-foreground">
            Un post qui montre <strong>TOI</strong>, un post qui montre{" "}
            <strong>TON EXPERTISE</strong>, un post qui montre{" "}
            <strong>TES RÉSULTATS</strong>.
          </p>
        </div>

        {/* 3 emplacements */}
        <div className="space-y-4 mb-8">
          {SLOTS.map((slot, idx) => {
            const current = slots[idx];
            const isDone = current.status === "done";

            return (
              <div
                key={slot.type}
                className="rounded-2xl border border-border bg-card p-5 space-y-4"
              >
                <div className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground text-sm font-bold flex items-center justify-center">
                    {idx + 1}
                  </span>
                  <div>
                    <h3 className="font-display text-base font-bold text-foreground">
                      {slot.emoji} {slot.label}
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                      {slot.explanation}
                    </p>
                    <p className="text-xs text-muted-foreground mt-2">
                      Formats recommandés : {slot.formats}
                    </p>
                  </div>
                </div>

                {/* Choice: already have it or need to create */}
                <div className="ml-11 space-y-3">
                  {/* Option 1: Already have */}
                  <label className="flex items-start gap-2 cursor-pointer group">
                    <input
                      type="radio"
                      name={`pin-${slot.type}`}
                      checked={isDone}
                      onChange={() => updateSlot(idx, { status: "done" })}
                      className="mt-1 accent-[hsl(var(--primary))]"
                    />
                    <span className="text-sm text-foreground">
                      J'ai déjà ce post →{" "}
                      <span className="text-muted-foreground">je note lequel :</span>
                    </span>
                  </label>
                  {isDone && (
                    <Input
                      placeholder={'Ex : Mon post "Ce jour-là, j\'ai tout lâché..."'}
                      value={current.description}
                      onChange={(e) =>
                        updateSlot(idx, { description: e.target.value })
                      }
                      className="ml-6 text-sm"
                    />
                  )}

                  {/* Option 2: Need to create */}
                  <label className="flex items-start gap-2 cursor-pointer group">
                    <input
                      type="radio"
                      name={`pin-${slot.type}`}
                      checked={!isDone}
                      onChange={() =>
                        updateSlot(idx, { status: "todo", description: "" })
                      }
                      className="mt-1 accent-[hsl(var(--primary))]"
                    />
                    <span className="text-sm text-foreground">Il me manque</span>
                  </label>
                  {!isDone && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="ml-6 rounded-pill gap-1.5"
                      onClick={() => handleCreateAtAtelier(slot.type)}
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      Créer ce post à l'atelier
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Récap */}
        <div className="rounded-2xl border border-border bg-card p-5 space-y-3 mb-6">
          <h3 className="font-display text-base font-bold text-foreground">
            ✅ Récap de tes épingles
          </h3>
          <div className="space-y-2">
            {SLOTS.map((slot, idx) => {
              const current = slots[idx];
              return (
                <div key={slot.type} className="flex items-center gap-2 text-sm">
                  <span>📌 {idx + 1}. {slot.label} :</span>
                  {current.status === "done" ? (
                    <span className="text-primary flex items-center gap-1">
                      <Check className="h-3.5 w-3.5" />
                      {current.description
                        ? `"${current.description}"`
                        : "Fait"}
                    </span>
                  ) : (
                    <span className="text-destructive">⚠️ À créer</span>
                  )}
                </div>
              );
            })}
          </div>

          <p className="text-xs text-muted-foreground italic mt-2">
            💡 Une fois que tu as tes 3 posts, va dans ton feed Instagram et
            épingle-les (appui long → « Épingler »). L'ordre compte : le premier
            est le plus vu.
          </p>

          <div className="flex items-center justify-between pt-2">
            <span className="text-xs text-muted-foreground">
              {doneCount}/3 épingles prêtes
            </span>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="rounded-pill gap-1.5"
            >
              <Save className="h-4 w-4" />
              {saving ? "Sauvegarde..." : "Sauvegarder"}
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
