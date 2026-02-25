import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { useWorkspaceFilter, useWorkspaceId } from "@/hooks/use-workspace-query";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { Save, Loader2, BookOpen, Sparkles, Check, X, Lightbulb } from "lucide-react";
import { SaveToIdeasDialog } from "@/components/SaveToIdeasDialog";
import AuditInsight from "@/components/AuditInsight";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/* ── Recommended highlights data ── */

interface RecommendedHighlight {
  type: string;
  emoji: string;
  label: string;
  description: string;
  storiesCount: string;
  updateFreq: string;
  optional?: boolean;
  canGenerate?: boolean;
  missingLabel?: string;
  structure: { step: number; text: string }[];
  tip: string;
}

const RECOMMENDED_HIGHLIGHTS: RecommendedHighlight[] = [
  {
    type: "qui_suis_je",
    emoji: "👋",
    label: "Qui suis-je",
    description: "Ta présentation, tes valeurs, ton parcours.",
    storiesCount: "5-8 stories",
    updateFreq: "À mettre à jour tous les 3-6 mois",
    canGenerate: true,
    missingLabel: "Il me manque",
    structure: [
      { step: 1, text: '"Salut, moi c\'est [prénom] 👋" (face cam ou photo + texte)' },
      { step: 2, text: "Ce que tu fais en 1 phrase" },
      { step: 3, text: "Pourquoi tu fais ça (ta mission, tes valeurs)" },
      { step: 4, text: "Ton parcours condensé (avant → déclic → après)" },
      { step: 5, text: "Pour qui tu travailles (portrait de ta cliente idéale)" },
      { step: 6, text: "Ce que tu crois profondément (ta philosophie)" },
      { step: 7, text: "Comment travailler avec toi (CTA : lien ou DM)" },
    ],
    tip: 'Utilise ton storytelling du branding. C\'est exactement le même arc narratif "Avant → Déclic → Après".',
  },
  {
    type: "offre",
    emoji: "💼",
    label: "Ton offre principale",
    description: "Présentation de ton offre phare.",
    storiesCount: "6-10 stories",
    updateFreq: "À mettre à jour à chaque lancement",
    canGenerate: true,
    missingLabel: "Il me manque",
    structure: [
      { step: 1, text: "Le problème que l'offre résout" },
      { step: 2, text: "Ta solution (nom + tagline)" },
      { step: 3, text: "Ce que contient l'offre (1/2)" },
      { step: 4, text: "Ce que contient l'offre (2/2)" },
      { step: 5, text: "Pour qui c'est fait" },
      { step: 6, text: "Témoignage(s)" },
      { step: 7, text: "Pratique (prix, durée, dates)" },
      { step: 8, text: 'CTA (lien ou "écris-moi")' },
    ],
    tip: "Si tu as déjà fait un lancement, récupère les meilleures stories de vente.",
  },
  {
    type: "retours",
    emoji: "💬",
    label: "Retours / Témoignages",
    description: "Screenshots de messages, verbatims clients.",
    storiesCount: "5-10 stories",
    updateFreq: "Ajouter régulièrement",
    missingLabel: "Il me manque",
    structure: [
      { step: 1, text: '"Ce que mes client·es en disent 💬"' },
      { step: 2, text: "Screenshot message + 1 phrase de contexte" },
      { step: 3, text: "Screenshot message + résultat obtenu" },
      { step: 4, text: "Screenshot message + avant/après" },
      { step: 5, text: "Screenshot message + ce qui a changé" },
    ],
    tip: "Pas besoin de tout générer : ajoute tes vrais screenshots de messages au fur et à mesure.",
  },
  {
    type: "faq",
    emoji: "❓",
    label: "FAQ",
    description: "Questions fréquentes + réponses.",
    storiesCount: "5-8 stories",
    updateFreq: "Quand de nouvelles questions reviennent",
    canGenerate: true,
    missingLabel: "Il me manque",
    structure: [
      { step: 1, text: '"Les questions qu\'on me pose le plus 👇"' },
      { step: 2, text: "Question 1 → Réponse (face cam ou texte)" },
      { step: 3, text: "Question 2 → Réponse" },
      { step: 4, text: "Question 3 → Réponse" },
      { step: 5, text: "Question 4 → Réponse" },
      { step: 6, text: '"T\'as d\'autres questions ? Écris-moi 💬"' },
    ],
    tip: "Utilise les objections de ton persona pour identifier les questions les plus pertinentes.",
  },
  {
    type: "ressources",
    emoji: "🎁",
    label: "Ressources / Freebies",
    description: "Liens vers contenus gratuits.",
    storiesCount: "3-5 stories",
    updateFreq: "Quand tu crées un nouveau freebie",
    missingLabel: "Il me manque",
    structure: [
      { step: 1, text: '"Mes ressources gratuites 🎁"' },
      { step: 2, text: "Freebie 1 (visuel + description + CTA)" },
      { step: 3, text: "Freebie 2" },
      { step: 4, text: '"Écris [MOT] en DM pour recevoir [freebie]"' },
    ],
    tip: 'Utilise un mot-clé DM (type ManyChat) pour automatiser l\'envoi.',
  },
  {
    type: "coulisses",
    emoji: "🎬",
    label: "Coulisses",
    description: "Best of de tes coulisses.",
    storiesCount: "5-8 stories",
    updateFreq: "Tous les 1-2 mois",
    optional: true,
    missingLabel: "Pas pour l'instant",
    structure: [
      { step: 1, text: "Ton espace de travail" },
      { step: 2, text: "Ton process créatif" },
      { step: 3, text: "Un moment de ta journée type" },
      { step: 4, text: "Les outils que tu utilises" },
      { step: 5, text: "Un fail ou un apprentissage" },
    ],
    tip: "Renouvelle ce highlight tous les 1-2 mois avec tes meilleures stories coulisses récentes.",
  },
];

/* ── Types ── */

interface HighlightStatus {
  type: string;
  status: "done" | "todo" | "skip";
}

export default function InstagramHighlights() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { column, value } = useWorkspaceFilter();
  const workspaceId = useWorkspaceId();
  const navigate = useNavigate();
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statuses, setStatuses] = useState<Record<string, "done" | "todo" | "skip">>({});
  const [structureModal, setStructureModal] = useState<RecommendedHighlight | null>(null);
  const [showIdeasDialog, setShowIdeasDialog] = useState(false);

  // Load existing highlight statuses
  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data } = await (supabase
        .from("instagram_highlights") as any)
        .select("title, is_selected")
        .eq(column, value);
      if (data && data.length > 0) {
        const map: Record<string, "done" | "todo" | "skip"> = {};
        // Map saved highlights to our recommended types
        const typeMap: Record<string, string> = {
          "qui suis-je": "qui_suis_je",
          "mon offre": "offre",
          "offre": "offre",
          "retours": "retours",
          "témoignages": "retours",
          "faq": "faq",
          "ressources": "ressources",
          "freebies": "ressources",
          "coulisses": "coulisses",
        };
        data.forEach((row) => {
          const lower = (row.title || "").toLowerCase();
          for (const [key, type] of Object.entries(typeMap)) {
            if (lower.includes(key)) {
              map[type] = row.is_selected ? "done" : "skip";
            }
          }
        });
        setStatuses(map);
      }
      setLoaded(true);
    };
    load();
  }, [user?.id]);

  const setHighlightStatus = (type: string, status: "done" | "todo" | "skip") => {
    setStatuses((prev) => ({ ...prev, [type]: status }));
  };

  const doneCount = Object.values(statuses).filter((s) => s === "done").length;

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      // Delete existing
      await (supabase.from("instagram_highlights") as any).delete().eq(column, value);
      // Insert statuses as highlights
      const toInsert = RECOMMENDED_HIGHLIGHTS.map((h, i) => ({
        user_id: user.id,
        workspace_id: workspaceId !== user.id ? workspaceId : undefined,
        title: h.label,
        emoji: h.emoji,
        role: h.description,
        stories: h.structure.map((s) => ({ content: s.text, format: "", tip: "" })) as unknown as Json,
        sort_order: i,
        is_selected: statuses[h.type] === "done",
      }));
      await supabase.from("instagram_highlights").insert(toInsert);
      toast({ title: "Sauvegardé !", description: "Ta progression highlights est enregistrée." });
    } catch {
      toast({ title: "Erreur", description: "Impossible de sauvegarder.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleCreateSequence = (h: RecommendedHighlight) => {
    const presets: Record<string, any> = {
      qui_suis_je: {
        objective: "connexion",
        subject: 'Présentation personnelle pour highlight "Qui suis-je" : parcours, valeurs, mission, comment travailler avec moi.',
        time_available: "30min",
        face_cam: "mixte",
      },
      offre: {
        objective: "vente",
        price_range: "moyen",
        subject: "Présentation de mon offre principale pour highlight permanent.",
        time_available: "30min",
        face_cam: "mixte",
      },
      faq: {
        objective: "education",
        subject: "FAQ : répondre aux questions les plus fréquentes de ma cible.",
        time_available: "30min",
        face_cam: "oui",
      },
    };

    navigate("/instagram/stories", {
      state: {
        fromHighlights: true,
        highlightType: h.type,
        ...(presets[h.type] || { objective: "connexion", time_available: "15min", face_cam: "mixte", subject: `Créer le highlight "${h.label}"` }),
      },
    });
  };

  if (!loaded) {
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

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-4xl px-6 py-8 max-md:px-4">
        <SubPageHeader parentLabel="Mon profil" parentTo="/instagram/profil" currentLabel="Stories à la une" />

        <h1 className="font-display text-[26px] font-bold text-foreground">⭐ Tes stories à la une</h1>
        <p className="mt-2 text-[15px] text-muted-foreground italic mb-6">
          Les highlights sont ta vitrine permanente. C'est la 2ème chose qu'un·e visiteur·se regarde après ta bio. L'ordre compte.
        </p>

        <AuditInsight section="stories" />

        {/* ── Highlight checklist cards ── */}
        <div className="space-y-4 mb-8">
          {RECOMMENDED_HIGHLIGHTS.map((h, index) => {
            const status = statuses[h.type] || "todo";
            return (
              <div
                key={h.type}
                className="rounded-2xl border border-border bg-card p-5 transition-all"
              >
                {/* Header */}
                <div className="flex items-start gap-3 mb-2">
                  <span className="flex-shrink-0 w-7 h-7 rounded-full bg-primary text-primary-foreground text-sm font-bold flex items-center justify-center">
                    {index + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-display text-base font-bold text-foreground">
                      {h.emoji} {h.label}
                      {h.optional && <span className="text-xs font-normal text-muted-foreground ml-2">(optionnel)</span>}
                    </h3>
                    <p className="text-sm text-muted-foreground mt-0.5">{h.description}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {h.storiesCount} · {h.updateFreq}
                    </p>
                  </div>
                </div>

                {/* Status buttons */}
                <div className="flex items-center gap-3 mt-3 mb-3">
                  <button
                    onClick={() => setHighlightStatus(h.type, "done")}
                    className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border transition-all ${
                      status === "done"
                        ? "border-green-500 bg-green-50 text-green-700"
                        : "border-border text-muted-foreground hover:border-green-300"
                    }`}
                  >
                    {status === "done" && <Check className="h-3 w-3" />}
                    Je l'ai déjà
                  </button>
                  <button
                    onClick={() => setHighlightStatus(h.type, "todo")}
                    className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border transition-all ${
                      status === "todo"
                        ? "border-primary bg-rose-pale text-primary"
                        : "border-border text-muted-foreground hover:border-primary/40"
                    }`}
                  >
                    {h.missingLabel || "Il me manque"}
                  </button>
                </div>

                {/* Action buttons */}
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-full gap-1.5 text-xs"
                    onClick={() => setStructureModal(h)}
                  >
                    <BookOpen className="h-3.5 w-3.5" />
                    Voir la structure
                  </Button>
                  {h.canGenerate && (
                    <Button
                      size="sm"
                      className="rounded-full gap-1.5 text-xs"
                      onClick={() => handleCreateSequence(h)}
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      Créer cette séquence
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Recap bar ── */}
        <div className="rounded-2xl border border-border bg-card p-5 mb-8">
          <p className="text-sm font-bold text-foreground mb-2">
            📊 Récap : {doneCount}/6 highlights créés
          </p>
          {doneCount < 2 && (
            <p className="text-sm text-muted-foreground">
              Priorité : crée d'abord <strong>"Qui suis-je"</strong> et <strong>"Ton offre"</strong>.
            </p>
          )}
          {/* Progress bar */}
          <div className="h-2 w-full rounded-full bg-muted mt-3 overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${(doneCount / 6) * 100}%` }}
            />
          </div>
        </div>

        {/* ── Covers audit section ── */}
        <div className="rounded-2xl border border-border bg-card p-5 mb-8">
          <h2 className="font-display text-base font-bold text-foreground mb-3">
            🎨 Tes covers de highlights
          </h2>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>✅ <strong>Cohérentes entre elles ?</strong> Même style, mêmes couleurs.</li>
            <li>✅ <strong>Simples ?</strong> 1 icône ou 1 mot sur fond coloré.</li>
            <li>✅ <strong>Lisibles en petit ?</strong> Pas de texte trop fin.</li>
            <li>✅ <strong>Alignées avec ta charte graphique ?</strong></li>
          </ul>
          <div className="mt-3 rounded-xl bg-rose-pale p-3">
            <p className="text-xs text-foreground">
              💡 Utilise les couleurs de ta charte graphique pour tes covers avec des icônes blanches. Cohérence entre toutes les covers.
            </p>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            ❌ Erreur courante : covers trop chargées ou trop différentes les unes des autres.
          </p>
        </div>

        {/* ── Save button ── */}
        <div className="flex flex-wrap gap-3">
          <Button onClick={handleSave} disabled={saving} className="rounded-full gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? "Enregistrement..." : "💾 Sauvegarder"}
          </Button>
          <Button variant="outline" onClick={() => setShowIdeasDialog(true)} className="rounded-full gap-2">
            <Lightbulb className="h-4 w-4" /> Sauvegarder en idée
          </Button>
        </div>
        <SaveToIdeasDialog
          open={showIdeasDialog}
          onOpenChange={setShowIdeasDialog}
          contentType="post_instagram"
          subject="Highlights Instagram"
          contentData={{ type: "generated", text: Object.entries(statuses).filter(([,s]) => s === "done").map(([k]) => k).join(", ") }}
          sourceModule="instagram-highlights"
          format="post"
        />
      </main>

      {/* ── Structure Modal ── */}
      <Dialog open={!!structureModal} onOpenChange={(open) => !open && setStructureModal(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          {structureModal && (
            <>
              <DialogHeader>
                <DialogTitle className="font-display text-lg">
                  📖 Structure : {structureModal.emoji} {structureModal.label}
                </DialogTitle>
                <DialogDescription className="sr-only">Structure détaillée de la story à la une</DialogDescription>
              </DialogHeader>
              <div className="space-y-3 mt-4">
                {structureModal.structure.map((s) => (
                  <div key={s.step} className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-muted text-muted-foreground text-xs font-bold flex items-center justify-center">
                      {s.step}
                    </span>
                    <p className="text-sm text-foreground leading-relaxed">{s.text}</p>
                  </div>
                ))}
              </div>
              <div className="mt-4 rounded-xl bg-rose-pale border-l-[3px] border-l-primary px-4 py-3">
                <p className="text-sm text-foreground/80 italic">💡 {structureModal.tip}</p>
              </div>
              {structureModal.canGenerate && (
                <Button
                  className="mt-4 w-full rounded-full gap-2"
                  onClick={() => {
                    setStructureModal(null);
                    handleCreateSequence(structureModal);
                  }}
                >
                  <Sparkles className="h-4 w-4" />
                  Créer cette séquence avec l'IA
                </Button>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
