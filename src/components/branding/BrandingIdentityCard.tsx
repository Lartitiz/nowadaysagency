import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Pencil, Sparkles, ArrowRight, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { BrandingCompletion } from "@/lib/branding-completion";

export interface SectionSummary {
  storytelling?: { firstLine: string };
  persona?: { prenom: string; age: string; job: string };
  proposition?: { phrase: string };
  tone?: { keywords: string[] };
  strategy?: { pillars: string[] };
  offers?: { count: number; mainName: string };
  charter?: { summary: string };
}

interface SectionConfig {
  key: keyof Omit<BrandingCompletion, "total">;
  icon: string;
  title: string;
  why?: string;
  editRoute: string;
  coachingRoute?: string;
}

const SECTIONS: SectionConfig[] = [
  { key: "storytelling", icon: "📖", title: "Mon histoire", why: "C'est ce qui te rend unique. Les gens achètent une personne avant un produit.", editRoute: "/branding/section?section=story", coachingRoute: "/branding/coaching?section=storytelling" },
  { key: "persona", icon: "👩‍💻", title: "Mon·a client·e idéal·e", why: "Plus tu connais ta cible, plus tes contenus la touchent. C'est la base de tout.", editRoute: "/branding/section?section=persona", coachingRoute: "/branding/coaching?section=persona" },
  { key: "proposition", icon: "❤️", title: "Ma proposition de valeur", why: "La phrase qu'on retient de toi. Celle qui fait cliquer.", editRoute: "/branding/proposition/recap", coachingRoute: "/branding/coaching?section=proposition" },
  { key: "tone", icon: "🎨", title: "Ma voix & mes combats", why: "Ta façon de parler, c'est ta signature. Ce qui fait qu'on te reconnaît dans un feed.", editRoute: "/branding/section?section=tone_style", coachingRoute: "/branding/coaching?section=tone" },
  { key: "strategy", icon: "🍒", title: "Ma ligne éditoriale", why: "Tes sujets de contenu. Pour ne plus jamais te demander « je poste quoi ? »", editRoute: "/branding/section?section=content_strategy", coachingRoute: "/branding/coaching?section=strategy" },
  { key: "offers", icon: "🎁", title: "Mes offres", why: "Si c'est pas clair pour toi, c'est pas clair pour ta cible.", editRoute: "/branding/offres", coachingRoute: "/branding/coaching?section=offers" },
  { key: "charter", icon: "🎨", title: "Ma charte graphique", why: "Tes visuels sont ta première impression. Ils doivent parler avant toi.", editRoute: "/branding/charter" },
];

interface Props {
  completion: BrandingCompletion;
  summaries: SectionSummary;
  onReanalyze?: () => void;
  profileName?: string;
  profileActivity?: string;
  onImport?: () => void;
  onShowSynthesis?: () => void;
  onRunMirror?: () => void;
  lastAuditScore?: number;
  canShowMirror?: boolean;
}

/* ─── Shared sub-components ─── */

function TagChip({ label }: { label: string }) {
  return (
    <span className="inline-block rounded-full px-2.5 py-0.5 text-[12px] font-medium bg-[hsl(338_96%_61%/0.12)] text-[hsl(330_100%_28%)]">
      {label}
    </span>
  );
}

function StatusDot({ score }: { score: number }) {
  const color =
    score === 100
      ? "bg-[hsl(var(--success))]"
      : score > 0
        ? "bg-[hsl(var(--warning))]"
        : "bg-muted-foreground/30";
  return <span className={`inline-block h-2 w-2 rounded-full shrink-0 ${color}`} />;
}

function getSummaryLine(key: string, summaries: SectionSummary): string {
  switch (key) {
    case "storytelling":
      return summaries.storytelling?.firstLine || "En cours de rédaction…";
    case "persona": {
      const p = summaries.persona;
      if (!p?.prenom) return "Pas encore défini·e";
      return [p.prenom, p.age, p.job].filter(Boolean).join(", ");
    }
    case "proposition":
      return summaries.proposition?.phrase || "Pas encore formulée";
    case "tone": {
      const kw = summaries.tone?.keywords;
      return kw && kw.length > 0 ? kw.join(" · ") : "Pas encore défini";
    }
    case "strategy": {
      const pil = summaries.strategy?.pillars;
      return pil && pil.length > 0 ? pil.join(" · ") : "Pas encore définie";
    }
    case "offers": {
      const o = summaries.offers;
      if (!o || o.count === 0) return "Pas encore d'offre";
      return o.count === 1 ? o.mainName : `${o.count} offres · ${o.mainName}`;
    }
    case "charter":
      return summaries.charter?.summary || "Pas encore créée";
    default:
      return "";
  }
}

/* ═══════════════════════════════════════════
   MODE SYNTHÈSE (completion.total >= 50)
   ═══════════════════════════════════════════ */

const GRID_SECTIONS = SECTIONS.filter(s => s.key !== "proposition");

function QuickActions({ onImport, onShowSynthesis, onRunMirror, lastAuditScore, canShowMirror, completion }: Pick<Props, "onImport" | "onShowSynthesis" | "onRunMirror" | "lastAuditScore" | "canShowMirror" | "completion">) {
  const navigate = useNavigate();
  const actions = [
    onImport && { emoji: "📄", label: "Importer un document", desc: "Mets à jour ton branding avec tes notes, un brief, un texte…", onClick: onImport },
    { emoji: "🔍", label: "Auditer mon branding", desc: "L'IA analyse ta cohérence et te donne un score.", onClick: () => navigate("/branding/audit"), badge: lastAuditScore !== undefined ? `Dernier : ${lastAuditScore}/100` : undefined },
    completion.total >= 10 && onShowSynthesis && { emoji: "📋", label: "Ma fiche de synthèse", desc: "Tout ton branding résumé sur une page.", onClick: onShowSynthesis },
    canShowMirror && onRunMirror && { emoji: "🪞", label: "Mon Branding Mirror", desc: "Regarde ta cohérence entre ce que tu dis et ce que tu fais.", onClick: onRunMirror },
  ].filter(Boolean) as { emoji: string; label: string; desc: string; onClick: () => void; badge?: string }[];

  if (actions.length === 0) return null;

  return (
    <div className={`grid grid-cols-1 ${actions.length >= 4 ? "sm:grid-cols-2" : actions.length === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2"} gap-3`}>
      {actions.map((a, index) => (
        <button
          key={a.label}
          onClick={a.onClick}
          className={`group relative rounded-2xl p-6 text-left transition-all hover:shadow-md ${
            index === 0
              ? "border-2 border-dashed border-primary/30 bg-primary/5 hover:border-primary/50 hover:bg-primary/10"
              : "border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10 hover:border-primary/40"
          }`}
        >
          <div className="flex items-start gap-4">
            <span className="text-3xl">{a.emoji}</span>
            <div>
              <p className="text-base font-semibold text-foreground group-hover:text-primary transition-colors">{a.label}</p>
              <p className="text-sm text-muted-foreground mt-1">{a.desc}</p>
            </div>
          </div>
          {a.badge && (
            <span className="absolute top-4 right-4 text-sm font-bold text-primary bg-primary/10 px-2.5 py-1 rounded-full">{a.badge}</span>
          )}
        </button>
      ))}
    </div>
  );
}

function SynthesisView({ completion, summaries, onReanalyze, profileName, profileActivity, onImport, onShowSynthesis, onRunMirror, lastAuditScore, canShowMirror }: Props) {
  const navigate = useNavigate();
  const proposition = summaries.proposition?.phrase;
  const hasProposition = !!proposition && completion.proposition > 0;

  const incompleteSections = SECTIONS.filter(s => completion[s.key] < 50);
  const firstIncomplete = incompleteSections[0];

  return (
    <div className="space-y-5">
      {/* Hero */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-[26px] text-foreground">
            {profileName || "Ta fiche d'identité com'"}
          </h1>
          {profileActivity && (
            <p className="font-mono-ui text-[13px] text-muted-foreground mt-0.5">{profileActivity}</p>
          )}
        </div>
        {onReanalyze && (
          <button
            onClick={onReanalyze}
            className="font-mono-ui text-[12px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5 shrink-0 mt-1"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Réanalyser
          </button>
        )}
      </div>

      <QuickActions onImport={onImport} onShowSynthesis={onShowSynthesis} onRunMirror={onRunMirror} lastAuditScore={lastAuditScore} canShowMirror={canShowMirror} completion={completion} />

      {/* Proposition de valeur — vedette */}
      {hasProposition ? (
        <div className="rounded-2xl border border-primary/10 bg-[hsl(var(--rose-pale))] p-5 sm:p-6">
          <p className="font-mono-ui text-[11px] uppercase tracking-wider text-muted-foreground mb-2">Ma proposition de valeur</p>
          <p className="font-display text-[16px] sm:text-[18px] text-foreground leading-relaxed">
            {proposition}
          </p>
          <button
            onClick={() => navigate("/branding/proposition/recap")}
            className="font-mono-ui text-[12px] text-primary hover:underline mt-3 inline-flex items-center gap-1"
          >
            Modifier <ArrowRight className="h-3 w-3" />
          </button>
        </div>
      ) : (
        <div className="rounded-2xl border-2 border-dashed border-primary/20 p-5 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-foreground">❤️ Pas encore de proposition de valeur</p>
            <p className="text-[13px] text-muted-foreground mt-0.5">Dis ce que tu fais, pour qui, et pourquoi.</p>
          </div>
          <Button size="sm" className="text-xs gap-1.5 shrink-0" onClick={() => navigate("/branding/proposition/recap")}>
            Définir ma proposition <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {/* Séparateur */}
      <div className="flex items-center gap-3 mt-8 mb-4">
        <div className="h-px flex-1 bg-border/50" />
        <p className="text-xs font-mono-ui text-muted-foreground uppercase tracking-wider shrink-0">
          Tes sections
        </p>
        <div className="h-px flex-1 bg-border/50" />
      </div>

      {/* Grille sections */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {GRID_SECTIONS.map(section => {
          const score = completion[section.key];
          const hasTags = section.key === "tone" || section.key === "strategy";
          const tags = section.key === "tone" ? summaries.tone?.keywords : section.key === "strategy" ? summaries.strategy?.pillars : [];

          return (
            <button
              key={section.key}
              onClick={() => navigate(section.editRoute)}
              className={`group rounded-2xl p-4 text-left transition-all ${
                score === 100
                  ? "border border-border/50 bg-muted/30 opacity-80 hover:opacity-100 hover:bg-muted/50"
                  : "border border-border bg-card hover:border-primary/20 hover:shadow-sm"
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">{section.icon}</span>
                <p className="font-display text-[14px] text-foreground flex-1">{section.title}</p>
                <StatusDot score={score} />
                <Pencil className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              {hasTags && tags && tags.length > 0 && score > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {tags.slice(0, 4).map((t, i) => <TagChip key={i} label={t} />)}
                </div>
              ) : (
                <p className="font-mono-ui text-[12px] text-muted-foreground line-clamp-2">
                  {getSummaryLine(section.key, summaries)}
                </p>
              )}
            </button>
          );
        })}
      </div>

      {/* Bandeau sections incomplètes */}
      {incompleteSections.length > 0 && (
        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="text-sm font-medium text-foreground">
              Il te reste {incompleteSections.length} section{incompleteSections.length > 1 ? "s" : ""} à compléter.
            </p>
            <p className="text-[13px] text-muted-foreground mt-0.5">On continue ?</p>
          </div>
          {firstIncomplete && (
            <Button size="sm" className="gap-1.5 text-xs" onClick={() => navigate(firstIncomplete.editRoute)}>
              Continuer <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════
   MODE CONSTRUCTION (completion.total < 50)
   ═══════════════════════════════════════════ */

function CompletionBadge({ score }: { score: number }) {
  if (score === 100) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[hsl(var(--success-bg))] px-2 py-0.5 text-[11px] font-medium text-[hsl(var(--success))]">
        Complet
      </span>
    );
  }
  if (score > 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[hsl(var(--warning-bg))] px-2 py-0.5 text-[11px] font-medium text-[hsl(var(--warning))]">
        En cours
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
      À faire
    </span>
  );
}

function SectionDetail({ section, summaries, score }: { section: SectionConfig; summaries: SectionSummary; score: number }) {
  if (score === 0) {
    return <p className="text-sm text-muted-foreground italic">Cette section n'a pas encore été remplie.</p>;
  }
  switch (section.key) {
    case "storytelling":
      return <p className="text-sm text-foreground leading-relaxed line-clamp-4">{summaries.storytelling?.firstLine || ""}</p>;
    case "persona": {
      const p = summaries.persona;
      return (
        <div className="space-y-1">
          {p?.prenom && <p className="text-sm text-foreground"><span className="font-medium">Prénom :</span> {p.prenom}</p>}
          {p?.job && <p className="text-sm text-foreground"><span className="font-medium">Activité :</span> {p.job}</p>}
        </div>
      );
    }
    case "proposition":
      return <p className="text-sm text-foreground leading-relaxed italic">"{summaries.proposition?.phrase}"</p>;
    case "tone":
      return <div className="flex flex-wrap gap-1.5">{(summaries.tone?.keywords || []).map((k, i) => <TagChip key={i} label={k} />)}</div>;
    case "strategy":
      return <div className="flex flex-wrap gap-1.5">{(summaries.strategy?.pillars || []).map((p, i) => <TagChip key={i} label={p} />)}</div>;
    case "offers": {
      const o = summaries.offers;
      if (!o || o.count === 0) return <p className="text-sm text-muted-foreground italic">Aucune offre ajoutée.</p>;
      return (
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">
            {o.count} offre{o.count > 1 ? "s" : ""}
          </p>
          {o.mainName && <p className="text-xs text-muted-foreground">{o.mainName}</p>}
        </div>
      );
    }
    case "charter":
      return <p className="text-sm text-foreground">{summaries.charter?.summary || ""}</p>;
    default:
      return null;
  }
}

function ConstructionView({ completion, summaries, onReanalyze, onImport, onShowSynthesis, onRunMirror, lastAuditScore, canShowMirror }: Props) {
  const navigate = useNavigate();
  const [openSection, setOpenSection] = useState<string | null>(null);

  const filledCount = SECTIONS.filter(s => completion[s.key] >= 50).length;
  const firstIncomplete = SECTIONS.find(s => completion[s.key] < 50);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-[26px] text-foreground">Construis ton identité</h1>
          <p className="font-mono-ui text-[13px] text-muted-foreground mt-1">
            Remplis chaque section pour que l'IA te connaisse vraiment.
          </p>
        </div>
        {onReanalyze && (
          <button
            onClick={onReanalyze}
            className="font-mono-ui text-[12px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5 shrink-0 mt-1"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Réanalyser
          </button>
        )}
      </div>

      <QuickActions onImport={onImport} onShowSynthesis={onShowSynthesis} onRunMirror={onRunMirror} lastAuditScore={lastAuditScore} canShowMirror={canShowMirror} completion={completion} />

      {/* Progress banner */}
      <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm font-medium text-foreground">{filledCount}/7 sections complétées</p>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            {filledCount === 7 ? "🎉 Ton branding est prêt !" : "On continue ?"}
          </p>
        </div>
        {firstIncomplete && (
          <Button size="sm" className="gap-1.5 text-xs" onClick={() => navigate(firstIncomplete.editRoute)}>
            {filledCount === 0 ? "Commencer" : "Continuer"} <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {/* Accordion sections */}
      <div className="space-y-3">
        {SECTIONS.map(section => {
          const score = completion[section.key];
          const isOpen = openSection === section.key;
          const hasTags = section.key === "tone" || section.key === "strategy";
          const tags = section.key === "tone" ? summaries.tone?.keywords : section.key === "strategy" ? summaries.strategy?.pillars : [];

          return (
            <div key={section.key} className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
              <button
                onClick={() => setOpenSection(prev => prev === section.key ? null : section.key)}
                className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-muted/30 transition-colors"
              >
                <span className="text-xl shrink-0">{section.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-display text-[15px] text-foreground">{section.title}</p>
                  {score === 0 && section.why ? (
                    <p className="text-[12px] text-muted-foreground italic mt-1">{section.why}</p>
                  ) : hasTags && tags && tags.length > 0 && score > 0 ? (
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {tags.slice(0, 4).map((t, i) => <TagChip key={i} label={t} />)}
                    </div>
                  ) : (
                    <p className="font-mono-ui text-[12px] text-muted-foreground truncate mt-0.5">
                      {getSummaryLine(section.key, summaries)}
                    </p>
                  )}
                </div>
                <CompletionBadge score={score} />
                <motion.div animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.25 }}>
                  <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                </motion.div>
              </button>

              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3, ease: "easeInOut" }}
                    className="overflow-hidden"
                  >
                    <div className="px-5 pb-5 pt-1 border-t border-border/50">
                      <SectionDetail section={section} summaries={summaries} score={score} />
                      <div className="flex items-center gap-2 mt-4">
                        <Button size="sm" variant="outline" className="text-xs gap-1.5" onClick={() => navigate(section.editRoute)}>
                          <Pencil className="h-3.5 w-3.5" /> Modifier
                        </Button>
                        {section.coachingRoute && (
                          <Button size="sm" variant="ghost" className="text-xs gap-1.5 text-primary hover:text-primary" onClick={() => navigate(section.coachingRoute!)}>
                            <Sparkles className="h-3.5 w-3.5" /> Affiner avec l'IA
                          </Button>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   EXPORT — Switch entre les 2 modes
   ═══════════════════════════════════════════ */

export default function BrandingIdentityCard(props: Props) {
  if (props.completion.total >= 50) {
    return <SynthesisView {...props} />;
  }
  return <ConstructionView {...props} />;
}
