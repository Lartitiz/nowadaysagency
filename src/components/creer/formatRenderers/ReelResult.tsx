/**
 * ReelResult — le résultat d'un script de Reel, en PARCOURS de 4 étapes.
 *
 * Avant, tout arrivait d'un bloc sur un seul écran : script, montage (au
 * milieu), plan de tournage, caption, publication. Deux problèmes : on ne
 * savait pas par où commencer, et l'ordre ne suivait pas la réalité — on ne
 * peut pas publier une vidéo qui n'est pas encore tournée ni montée.
 *
 * Les 4 étapes suivent le vrai geste : j'écris → je tourne → je monte → je
 * légende et je publie. L'étape « tournage » est sautée quand le script n'a
 * pas de plan de tournage (champ additif), l'étape « montage » quand il n'a
 * aucune section.
 *
 * La navigation est ENTIÈREMENT libre (pas seulement vers les étapes passées) :
 * beaucoup de créatrices ne montent jamais dans l'app — elles tournent au
 * téléphone et montent ailleurs — et pour elles la légende est le livrable
 * principal. Un parcours en aller simple la leur enterrerait derrière 3 clics.
 *
 * ⚠️ Pourquoi des ONGLETS NOMMÉS et pas un stepper à pastilles : la page
 * /creer affiche DÉJÀ son propre stepper « Étape 4 sur 4 — Ton contenu prêt »
 * juste au-dessus. Un second stepper au même dessin et au même « sur 4 » se
 * lisait comme une contradiction (constaté en live le 03/08/2026 : deux barres
 * empilées, deux significations). Des onglets portant leur nom sont
 * visiblement un SOUS-niveau, et rendent le saut direct vers « Légende »
 * évident au lieu de le cacher derrière une pastille « 4 ».
 */
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowRight, Copy, Loader2 } from "lucide-react";
import AiGeneratedMention from "@/components/AiGeneratedMention";
import RedFlagsChecker from "@/components/RedFlagsChecker";
import ReelMontage from "@/components/creer/ReelMontage";
import { cn } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

export type ReelStepKey = "script" | "tournage" | "montage" | "caption";
type StepKey = ReelStepKey;

interface StepDef {
  key: StepKey;
  label: string;
}

interface Props {
  result: any;
  /**
   * Remonte l'avancée du parcours au parent (CreerStepResult), qui s'en sert
   * pour n'afficher « Publier ou programmer » qu'à la dernière étape et pour
   * que « Autres actions → Copier » copie ce qui est À L'ÉCRAN.
   */
  onStepChange?: (s: { key: StepKey; step: number; isLast: boolean; montageDone: boolean }) => void;
}

export default function ReelResult({ result, onStepChange }: Props) {
  // `format_label` est le libellé LISIBLE produit par la génération (« Face cam
  // confession ») ; `format_type` est la clé technique (`face_cam_confession`).
  // On affichait la clé — même bug que #688 ailleurs dans l'app.
  const formatType = result?.format_label || result?.format_type || result?.format;
  const dureeCible = result?.duree_cible || result?.duration;
  const sections = result?.sections || (Array.isArray(result?.script) ? result.script : result?.script?.sections) || [];
  const personalTip = result?.personal_tip || result?.conseil_personnalise;
  const lectureTest = result?.lecture_test;
  // Shot list de tournage (chantier « scripts Reels ») — champ additif : les
  // contenus générés avant ce chantier ne l'ont pas, l'étape est sautée.
  const planTournage = Array.isArray(result?.plan_tournage) ? result.plan_tournage : [];
  // Caption + amplification (audit reels 12/07) : ces champs étaient générés et
  // sauvegardés au calendrier mais invisibles ici — le moment où elle juge son reel.
  const caption = result?.caption && typeof result.caption === "object" ? result.caption : null;
  const hashtags: string[] = Array.isArray(result?.hashtags)
    ? result.hashtags.filter((h: unknown) => typeof h === "string")
    : [];
  const coverText = typeof result?.cover_text === "string" && result.cover_text.trim() ? result.cover_text : null;
  const amplificationStories = Array.isArray(result?.amplification_stories)
    ? result.amplification_stories.filter((a: any) => a && typeof a.text === "string")
    : [];

  const handleCopyCaption = () => {
    const parts = [caption?.text, caption?.cta, hashtags.length ? hashtags.join(" ") : null].filter(Boolean);
    navigator.clipboard.writeText(parts.join("\n\n"));
    toast.success("Caption copiée !");
  };

  const fullText = sections
    .map((s: any) => [s.texte_parle, s.texte_overlay].filter(Boolean).join("\n"))
    .filter(Boolean)
    .join("\n\n");

  // Vit ICI, pas dans ScriptStep : l'étape est démontée quand on la quitte,
  // les corrections anti red-flags doivent lui survivre.
  const [checkedText, setCheckedText] = useState(fullText);

  // Le montage ne sait travailler que sur les sections qui ont un texte parlé
  // (`spoken` dans ReelMontage). Un script sans aucun texte parlé ouvrirait une
  // étape vide où « Assembler » est impossible : autant ne pas la proposer.
  const hasSpoken = sections.some((s: any) => typeof s?.texte_parle === "string" && s.texte_parle.trim());

  // Étapes réellement disponibles pour CE script.
  const steps: StepDef[] = [
    { key: "script", label: "Script" },
    ...(planTournage.length > 0 ? [{ key: "tournage" as const, label: "Tournage" }] : []),
    ...(hasSpoken ? [{ key: "montage" as const, label: "Montage" }] : []),
    { key: "caption", label: "Légende" },
  ];

  const [stepKey, setStepKey] = useState<StepKey>("script");
  const currentIndex = Math.max(0, steps.findIndex((s) => s.key === stepKey));
  const isLast = currentIndex === steps.length - 1;

  // Le montage est MONTÉ à la première visite et gardé en vie ensuite (masqué
  // en CSS) : il lance un appel IA + une recherche Pexels par section, et
  // surtout les clips choisis et les prises de voix ne doivent pas disparaître
  // parce qu'on est allé lire sa légende.
  const [montageVisited, setMontageVisited] = useState(false);
  const [montagePhase, setMontagePhase] = useState<"idle" | "rendering" | "done" | "error">("idle");
  const montageDone = montagePhase === "done";
  useEffect(() => {
    if (stepKey === "montage") setMontageVisited(true);
  }, [stepKey]);

  // Régénération : le parcours et la vérif anti red-flags doivent repartir du
  // NOUVEAU script. Sans ça, régénérer depuis l'étape « Légende » laissait la
  // cliente sur la légende du nouveau contenu sans jamais voir son script, et
  // RedFlagsChecker continuait d'analyser l'ANCIEN texte.
  // On se cale sur le texte du script (et pas sur l'objet `result`, dont
  // l'identité peut changer à chaque rendu du parent, ce qui bloquerait tout
  // le monde à l'étape 1).
  const prevScript = useRef(fullText);
  useEffect(() => {
    if (prevScript.current === fullText) return;
    prevScript.current = fullText;
    setStepKey("script");
    setCheckedText(fullText);
    setMontageVisited(false);
    setMontagePhase("idle");
  }, [fullText]);

  useEffect(() => {
    onStepChange?.({ key: stepKey, step: currentIndex + 1, isLast, montageDone });
  }, [onStepChange, stepKey, currentIndex, isLast, montageDone]);

  const goNext = () => {
    const next = steps[currentIndex + 1];
    if (next) setStepKey(next.key);
  };

  const nextLabel =
    steps[currentIndex + 1]?.key === "tournage"
      ? "Passer au tournage"
      : steps[currentIndex + 1]?.key === "montage"
        ? "Monter ma vidéo"
        : "Écrire ma légende";

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center gap-2 flex-wrap">
        {formatType && (
          <Badge className="bg-primary/10 text-primary border-primary/20">{formatType}</Badge>
        )}
        {dureeCible && (
          <Badge variant="secondary" className="font-mono">{dureeCible}</Badge>
        )}
      </div>

      {/* Onglets nommés — surtout PAS un second stepper à pastilles
          numérotées : voir l'en-tête du fichier. */}
      <div className="space-y-1.5">
        <p className="text-2xs text-muted-foreground">Ton reel, dans l'ordre</p>
        <div role="tablist" aria-label="Étapes de ton reel" className="flex flex-wrap gap-1.5">
          {steps.map((s, i) => (
            <button
              key={s.key}
              type="button"
              role="tab"
              id={`reel-tab-${s.key}`}
              aria-selected={i === currentIndex}
              aria-controls="reel-step-panel"
              tabIndex={i === currentIndex ? 0 : -1}
              onClick={() => setStepKey(s.key)}
              onKeyDown={(e) => {
                if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
                e.preventDefault();
                const delta = e.key === "ArrowRight" ? 1 : -1;
                const next = steps[(currentIndex + delta + steps.length) % steps.length];
                setStepKey(next.key);
                document.getElementById(`reel-tab-${next.key}`)?.focus();
              }}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-sm transition-colors",
                i === currentIndex
                  ? "bg-primary text-primary-foreground font-medium"
                  : "border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted/50",
              )}
            >
              {s.label}
              {/* Le rendu MP4 continue quand on quitte l'étape : sans ce
                  signal, elle croit avoir tout perdu en allant lire sa légende. */}
              {s.key === "montage" && montagePhase === "rendering" && (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-label="montage en cours" />
              )}
            </button>
          ))}
        </div>
      </div>

      <div id="reel-step-panel" role="tabpanel" aria-labelledby={`reel-tab-${stepKey}`} className="space-y-4">
      {stepKey === "script" && (
        <ScriptStep
          lectureTest={lectureTest}
          sections={sections}
          checkedText={checkedText}
          onCheckedTextChange={setCheckedText}
        />
      )}

      {stepKey === "tournage" && (
        <TournageStep planTournage={planTournage} personalTip={personalTip} />
      )}

      {/* Monté à la première visite, jamais démonté ensuite. */}
      {montageVisited && (
        <div className={cn(stepKey !== "montage" && "hidden")}>
          <ReelMontage
            sections={sections}
            subject={result?.subject || result?.pillar}
            onPhaseChange={setMontagePhase}
          />
        </div>
      )}

      {stepKey === "caption" && (
        <CaptionStep
          caption={caption}
          hashtags={hashtags}
          coverText={coverText}
          amplificationStories={amplificationStories}
          personalTip={planTournage.length > 0 ? null : personalTip}
          montageDone={montageDone}
          onCopyCaption={handleCopyCaption}
        />
      )}
      </div>

      {!isLast && (
        <div className="space-y-2">
          <Button onClick={goNext} className="w-full gap-2 h-11 text-sm font-semibold">
            {nextLabel} <ArrowRight className="h-4 w-4" />
          </Button>
          {/* Sortie de secours pour celles qui ne montent pas dans l'app :
              leur livrable, c'est la légende, pas le MP4. */}
          {stepKey !== "montage" && steps[currentIndex + 1]?.key !== "caption" && (
            <button
              type="button"
              onClick={() => setStepKey("caption")}
              className="w-full text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors"
            >
              Je monte ailleurs — aller directement à la légende
            </button>
          )}
        </div>
      )}

      <AiGeneratedMention />
    </div>
  );
}

/* ── Étape 1 — Mon script ─────────────────────────────────────────────── */

function ScriptStep({
  lectureTest,
  sections,
  checkedText,
  onCheckedTextChange,
}: {
  lectureTest?: string;
  sections: any[];
  checkedText: string;
  onCheckedTextChange: (t: string) => void;
}) {
  return (
    <div className="space-y-4">
      {lectureTest && (
        <div className="rounded-lg bg-accent/30 border border-accent p-4 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-foreground uppercase tracking-wide">📖 Lecture face cam</span>
            <Badge variant="secondary" className="text-2xs">monologue continu</Badge>
          </div>
          <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{lectureTest}</p>
          <p className="text-2xs text-muted-foreground italic">Lis ce texte d'une traite à voix haute. S'il sonne fluide → tu peux tourner. S'il sonne robotique → relance la génération.</p>
        </div>
      )}

      <div className="space-y-2">
        {sections.map((section: any, i: number) => (
          <Card key={i} className="border-border">
            <CardContent className="p-3 space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                {section.timing && (
                  <Badge variant="secondary" className="font-mono text-2xs">
                    {section.timing}
                  </Badge>
                )}
                {section.label && (
                  <span className="text-xs font-semibold text-foreground">{section.label}</span>
                )}
              </div>
              {section.format_visuel && (
                <p className="text-xs italic text-muted-foreground">📹 {section.format_visuel}</p>
              )}
              {section.texte_parle && (
                <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{section.texte_parle}</p>
              )}
              {section.texte_overlay && (
                <Badge className="bg-primary/10 text-primary border-primary/20 text-2xs font-normal">
                  📝 {section.texte_overlay}
                </Badge>
              )}
              {section.cut && (
                <p className="text-2xs text-muted-foreground font-mono">Cut : {section.cut}</p>
              )}
              {section.tip && (
                <p className="text-xs text-muted-foreground">💡 {section.tip}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <RedFlagsChecker content={checkedText} onFix={onCheckedTextChange} />
    </div>
  );
}

/* ── Étape 2 — Mon tournage ───────────────────────────────────────────── */

function TournageStep({ planTournage, personalTip }: { planTournage: any[]; personalTip?: string }) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-foreground uppercase tracking-wide">🎥 Ton plan de tournage</span>
          <Badge variant="secondary" className="text-2xs">{planTournage.length} plans</Badge>
        </div>
        <p className="text-2xs text-muted-foreground">
          Tout se tourne au téléphone, dans cet ordre — les prises face cam d'abord, les plans de coupe ensuite.
        </p>
        <div className="space-y-2">
          {planTournage.map((shot: any, i: number) => (
            <div key={i} className="flex gap-2.5 items-start rounded-lg bg-muted/30 p-2.5">
              <span className="font-mono text-2xs text-muted-foreground pt-0.5 shrink-0">{i + 1}.</span>
              <div className="min-w-0 space-y-0.5">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Badge variant="secondary" className="text-2xs">
                    {shot.type === "face_cam" ? "🎤 Face cam" : shot.type === "insert" ? "🔍 Insert" : "🎬 B-roll"}
                  </Badge>
                  {shot.duree && <span className="font-mono text-2xs text-muted-foreground">{shot.duree}</span>}
                </div>
                {shot.plan && <p className="text-sm text-foreground leading-snug">{shot.plan}</p>}
                {shot.sert_pour && (
                  <p className="text-2xs text-muted-foreground">Sert pour : {shot.sert_pour}</p>
                )}
                {shot.conseil && <p className="text-xs text-muted-foreground">💡 {shot.conseil}</p>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {personalTip && (
        <div className="rounded-lg bg-primary/5 border border-primary/20 p-3">
          <p className="text-xs font-semibold text-primary mb-1">🎯 Conseil personnalisé</p>
          <p className="text-sm text-foreground">{personalTip}</p>
        </div>
      )}
    </div>
  );
}

/* ── Étape 4 — Légende et publication ─────────────────────────────────── */

function CaptionStep({
  caption,
  hashtags,
  coverText,
  amplificationStories,
  personalTip,
  montageDone,
  onCopyCaption,
}: {
  caption: any;
  hashtags: string[];
  coverText: string | null;
  amplificationStories: any[];
  personalTip?: string | null;
  montageDone: boolean;
  onCopyCaption: () => void;
}) {
  return (
    <div className="space-y-4">
      {/* Honnêteté sur le MP4 : le fichier monté à l'étape 3 n'est PAS rattaché
          au contenu — « Publier ou programmer » ne le connaît pas. Tant que ce
          chaînage n'existe pas, on le dit au lieu de le laisser croire. */}
      {montageDone && (
        <div className="rounded-lg border border-warning/30 bg-warning-bg p-3">
          <p className="text-xs font-semibold text-warning mb-1">📼 Ta vidéo montée n'est pas jointe ici</p>
          <p className="text-xs text-foreground">
            Reviens à l'étape « Montage » pour télécharger ton MP4, puis choisis-le toi-même au moment de publier.
          </p>
        </div>
      )}

      {caption?.text && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-foreground uppercase tracking-wide">📝 Caption</span>
            <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" onClick={onCopyCaption}>
              <Copy className="h-3 w-3" />
              Copier
            </Button>
          </div>
          <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{caption.text}</p>
          {caption.cta && <p className="text-sm font-medium text-foreground">{caption.cta}</p>}
          {hashtags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {hashtags.map((h, i) => (
                <Badge key={i} variant="secondary" className="text-2xs font-normal">{h}</Badge>
              ))}
            </div>
          )}
        </div>
      )}

      {coverText && (
        <div className="rounded-lg border border-border bg-card p-3">
          <p className="text-xs font-semibold text-muted-foreground mb-1">🖼️ Texte de la cover</p>
          <p className="text-sm text-foreground">{coverText}</p>
        </div>
      )}

      {amplificationStories.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-2">
          <span className="text-xs font-bold text-foreground uppercase tracking-wide">📣 À poster en story dans l'heure</span>
          <p className="text-2xs text-muted-foreground">
            Repartage ton reel en story avec ces accroches : c'est ce qui lance ses premières vues.
          </p>
          <div className="space-y-2">
            {amplificationStories.map((story: any, i: number) => (
              <div key={i} className="rounded-lg bg-muted/30 p-2.5 space-y-1">
                <p className="text-sm text-foreground">{story.text}</p>
                {story.sticker_type && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Badge variant="secondary" className="text-2xs">
                      {story.sticker_type === "sondage" ? "📊 Sondage" : story.sticker_type === "question_ouverte" ? "💬 Question ouverte" : story.sticker_type}
                    </Badge>
                    {Array.isArray(story.sticker_options) && story.sticker_options.length > 0 && (
                      <span className="text-2xs text-muted-foreground">{story.sticker_options.join(" · ")}</span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Le conseil personnalisé vit à l'étape « tournage ». Sans plan de
          tournage cette étape n'existe pas : on le remonte ici. */}
      {personalTip && (
        <div className="rounded-lg bg-primary/5 border border-primary/20 p-3">
          <p className="text-xs font-semibold text-primary mb-1">🎯 Conseil personnalisé</p>
          <p className="text-sm text-foreground">{personalTip}</p>
        </div>
      )}
    </div>
  );
}
