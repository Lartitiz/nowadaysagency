import { Link } from "react-router-dom";
import { ArrowUpRight, Check, ChevronDown, Copy, Download, Lightbulb, Loader2, MoreHorizontal, Palette, RefreshCw, RotateCcw, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { DownloadMenuItems } from "@/components/exports/DownloadMenuItems";
import type { StoryExportActions } from "@/components/creer/formatRenderers/StoryResult";
import { EDITORIAL_ANGLES, LINKEDIN_EDITORIAL_ANGLES, PINTEREST_EDITORIAL_ANGLES, type EditorialAngle } from "@/lib/content-structures";

/**
 * Actions de l'écran du résultat de /creer (chantier C, 15/10/2026, choix de Laetitia).
 *
 * Avant : 3 boutons, un menu « Autres actions » de 6 à 8 entrées et 2 boutons en
 * bas, dont deux qui faisaient la même chose (« Nouveau contenu » / « Créer un
 * nouveau contenu »), et un bouton principal caché sous 2,6 à 9 écrans de
 * défilement sur un carrousel ou des stories.
 *
 * Maintenant : une barre collée en bas de l'écran avec 3 actions au plus
 * (publier ou mettre au calendrier, récupérer le contenu, le garder dans mes
 * idées) + un menu court « Plus d'options » où le coût est écrit en clair.
 * Rien n'est supprimé : tout est rangé. « Créer un autre contenu » est un seul
 * lien, sous la barre.
 */

// Cibles possibles pour « Même idée, autre format » — format IDs internes (cf. CreerUnifie paramFormat).
const TRANSFORM_TARGETS: { id: string; emoji: string; label: string }[] = [
  { id: "carousel", emoji: "🎠", label: "Carrousel Instagram" },
  { id: "post", emoji: "📸", label: "Post Instagram" },
  { id: "reel", emoji: "🎬", label: "Reel" },
  { id: "story", emoji: "📱", label: "Stories" },
  { id: "linkedin", emoji: "💼", label: "Post LinkedIn" },
  { id: "newsletter", emoji: "📧", label: "Newsletter" },
  { id: "pinterest_visual", emoji: "📌", label: "Pinterest visuel" },
  { id: "pinterest_photo", emoji: "📌", label: "Pinterest photo" },
];

interface DownloadSpec {
  onPng?: () => void;
  onPdf?: () => void;
  onPptx?: () => void;
  count: number;
  downloadingPng?: boolean;
  downloadingPptx?: boolean;
  /** Propose la case « Ajouter mon logo ». */
  logo?: boolean;
  canva?: () => void;
  openingCanva?: boolean;
}

export interface ResultActionsProps {
  format: string;
  result: any;
  hasVisuals: boolean;
  visualCount: number;
  visualLoading?: boolean;
  /** Le bouton « Créer les visuels » est affiché au-dessus : il est l'action principale. */
  createVisualsPending: boolean;
  onGenerateVisuals?: () => void;
  /** null = ne pas proposer la publication (reel pas encore tourné). */
  onPublishOrSchedule?: () => void;
  publishOrScheduleLabel?: string;
  canAutoPublish?: boolean;
  onCopyText: () => void;
  storyActions: StoryExportActions | null;
  onExportVisualPng?: () => void;
  onExportVisualPdf?: () => void;
  onExportHybridPptx?: () => void;
  onExportPptx?: () => void;
  onExportPinterestPng?: () => void;
  onExportPinterestEditablePptx?: () => void;
  onOpenInCanva?: () => void;
  openingCanva?: boolean;
  logoAvailable?: boolean;
  includeLogo: boolean;
  onIncludeLogoChange: (value: boolean) => void;
  onSave?: () => void;
  savingContent?: boolean;
  saveNotice?: string;
  /** Carrousel enregistré tout seul dans Mes idées (sauvegarde continue). */
  autoSavedToIdeas?: boolean;
  onReset: () => void;
  onRegenerate: () => void;
  onChangeAngle?: (angleId: string | null) => void;
  currentAngle?: string | null;
  currentChannel?: string;
  sourceIdea?: string;
  sourceObjective?: string;
  sourceAngle?: string | null;
}

export default function ResultActions(p: ResultActionsProps) {
  const { format, result, hasVisuals } = p;
  const isCarousel = format === "carousel";
  const isStory = format === "story";
  const cost = isCarousel ? "1 carrousel" : "1 crédit";

  // ── Récupérer : télécharger les visuels, ou copier le texte ──
  const download: DownloadSpec | null =
    isCarousel && hasVisuals && (p.onExportVisualPng || p.onExportHybridPptx)
      ? { onPng: p.onExportVisualPng, onPdf: p.onExportVisualPdf, onPptx: p.onExportHybridPptx, count: p.visualCount, logo: true, canva: p.onOpenInCanva, openingCanva: p.openingCanva }
      : isStory && p.storyActions
        ? { onPng: p.storyActions.exportPng, onPptx: p.storyActions.exportPptx, count: p.storyActions.frameCount, downloadingPng: p.storyActions.exporting, downloadingPptx: p.storyActions.exportingPptx, canva: p.storyActions.openInCanva, openingCanva: p.storyActions.openingCanva }
        : format === "pinterest_visual" && (result?.pin_html || result?.title) && (p.onExportPinterestPng || p.onExportPinterestEditablePptx)
          ? { onPng: p.onExportPinterestPng, onPptx: p.onExportPinterestEditablePptx, count: 1, logo: true }
          : format === "pinterest_photo" && result?.overlay_html && p.onExportPinterestPng
            ? { onPng: p.onExportPinterestPng, count: 1 }
            : null;

  const publishPrimary = !!p.onPublishOrSchedule && !p.createVisualsPending && p.canAutoPublish !== false && format !== "newsletter" && !isStory;
  const getPrimary = !p.createVisualsPending && !publishPrimary;
  // Stories : la fenêtre ne propose que le calendrier (publication directe désactivée).
  const publishLabel = p.publishOrScheduleLabel || (format === "newsletter" || isStory || p.canAutoPublish === false ? "Mettre dans mon calendrier" : "Publier ou mettre au calendrier");
  // Bouton secondaire (3 par ligne, colonne étroite des stories) : « Mettre dans mon
  // calendrier » était coupé en « Mettre dans mon calen… » (passe du 16/10/2026).
  const publishShort = ({ "Mettre dans mon calendrier": "Mettre au calendrier", "Sauvegarder dans le calendrier": "Garder au calendrier" } as Record<string, string>)[publishLabel] || publishLabel;

  const publishButton = p.onPublishOrSchedule && (
    <Button
      data-testid="publish-or-schedule"
      onClick={p.onPublishOrSchedule}
      variant={publishPrimary ? "default" : "outline"}
      className={`gap-2 font-semibold ${publishPrimary ? "w-full h-11" : "flex-1 min-w-0 h-10 px-2 sm:px-4"}`}
    >
      <Send className="h-4 w-4 shrink-0" />
      {publishPrimary ? publishLabel : (
        // Téléphone : 3 boutons sur une ligne, libellé court.
        <span className="truncate" title={publishLabel}><span className="hidden sm:inline">{publishShort}</span><span className="sm:hidden">Planifier</span></span>
      )}
    </Button>
  );

  const getClass = `gap-2 ${getPrimary ? "w-full h-11 font-semibold" : "flex-1 min-w-0 h-10 px-2 sm:px-4"}`;
  const getButton = download ? (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button data-testid="download-visuals" variant={getPrimary ? "default" : "outline"} className={getClass}>
          <Download className="h-4 w-4 shrink-0" /> <span className="truncate">Télécharger<span className="hidden sm:inline"> mes visuels</span></span> <ChevronDown className="h-3 w-3 shrink-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" className="w-64">
        <DownloadMenuItems
          onPng={download.onPng}
          onPdf={download.onPdf}
          onPptxEditable={download.onPptx}
          downloadingPng={download.downloadingPng}
          downloadingPptx={download.downloadingPptx}
          count={download.count}
          logoAvailable={download.logo ? p.logoAvailable : undefined}
          includeLogo={p.includeLogo}
          onIncludeLogoChange={p.onIncludeLogoChange}
        />
        {download.canva && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={download.canva} disabled={download.openingCanva} className="gap-2">
              {download.openingCanva ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUpRight className="h-4 w-4" />}
              <div className="flex flex-col">
                <span>{download.openingCanva ? "Ouverture…" : "Ouvrir dans Canva"}</span>
                <span className="text-2xs text-muted-foreground">Pour continuer la mise en page là-bas</span>
              </div>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  ) : (
    <Button
      data-testid={format === "newsletter" ? "copy-newsletter" : "copy-text"}
      aria-label={format === "newsletter" ? "Copier ma newsletter" : "Copier mon texte"}
      onClick={p.onCopyText}
      variant={getPrimary ? "default" : "outline"}
      className={getClass}
    >
      <Copy className="h-4 w-4 shrink-0" /> <span className="truncate">Copier<span className="hidden sm:inline">{format === "newsletter" ? " ma newsletter" : " mon texte"}</span></span>
    </Button>
  );

  const saveBlock = p.autoSavedToIdeas ? (
    <Link
      to="/idees"
      data-testid="auto-saved-to-ideas"
      className="flex-1 min-w-0 h-10 inline-flex items-center justify-center gap-1.5 rounded-md px-2 sm:px-3 text-sm text-muted-foreground hover:text-foreground"
    >
      <Check className="h-4 w-4 text-primary shrink-0" /> <span className="truncate"><span className="hidden sm:inline">Enregistré dans </span><span className="sm:hidden">Dans </span>Mes idées</span>
    </Link>
  ) : p.onSave ? (
    <Button onClick={p.onSave} disabled={p.savingContent} variant="outline" data-testid="save-as-idea" className="flex-1 min-w-0 gap-2 h-10 px-2 sm:px-4">
      <Lightbulb className="h-4 w-4 shrink-0" /> <span className="truncate">{p.savingContent ? "Enregistrement…" : <>Garder <span className="hidden sm:inline">dans mes idées</span><span className="sm:hidden">en idée</span></>}</span>
    </Button>
  ) : null;

  const angleList: EditorialAngle[] =
    p.currentChannel === "linkedin" ? LINKEDIN_EDITORIAL_ANGLES : p.currentChannel === "pinterest" ? PINTEREST_EDITORIAL_ANGLES : EDITORIAL_ANGLES;
  const currentAngleLabel = p.currentAngle ? angleList.find((a) => a.id === p.currentAngle)?.label : null;
  const canRedo = !!result && (isCarousel || !!p.onChangeAngle);
  const transformTargets = p.sourceIdea && p.sourceIdea.trim().length > 0 ? TRANSFORM_TARGETS.filter((t) => t.id !== format) : [];

  const moreMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" data-testid="more-actions" aria-label="Plus d'options" className="h-10 gap-1.5 px-2 sm:px-3 text-sm text-muted-foreground shrink-0">
          <MoreHorizontal className="h-4 w-4" /> <span className="hidden sm:inline">Plus d'options</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        {download && (
          <DropdownMenuItem onClick={p.onCopyText} className="gap-2">
            <Copy className="h-4 w-4" /> Copier le texte
          </DropdownMenuItem>
        )}
        {isCarousel && !hasVisuals && p.onExportPptx && (
          <DropdownMenuItem onClick={p.onExportPptx} className="gap-2">
            <Download className="h-4 w-4" />
            <div className="flex flex-col">
              <span>Télécharger le texte en PowerPoint</span>
              <span className="text-2xs text-muted-foreground whitespace-normal max-w-[220px] leading-snug">
                Installe les polices de ta marque pour conserver leur rendu dans PowerPoint.
              </span>
            </div>
          </DropdownMenuItem>
        )}
        {canRedo && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="gap-2">
              <RefreshCw className="h-4 w-4" /> Refaire une version
              <span className="ml-auto text-2xs text-muted-foreground">{cost}</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-72 max-h-96 overflow-y-auto">
              <DropdownMenuLabel className="text-2xs text-muted-foreground font-normal">
                Chaque nouvelle version compte pour {cost} du mois.
                {currentAngleLabel ? ` Angle actuel : ${currentAngleLabel}.` : ""}
              </DropdownMenuLabel>
              {isCarousel && (
                <DropdownMenuItem onClick={p.onRegenerate} className="gap-2">
                  <RefreshCw className="h-4 w-4 text-primary shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold">Même sujet, même angle</p>
                    <p className="text-2xs text-muted-foreground">Une autre proposition</p>
                  </div>
                </DropdownMenuItem>
              )}
              {p.onChangeAngle && (
                <>
                  <DropdownMenuItem onClick={() => p.onChangeAngle!(null)} className="gap-2">
                    <Sparkles className="h-4 w-4 text-primary shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold">Laisser l'IA choisir l'angle</p>
                      <p className="text-2xs text-muted-foreground">Selon ton idée et ta voix</p>
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-2xs text-muted-foreground font-normal">Avec un autre angle</DropdownMenuLabel>
                  {angleList.map((a) => (
                    <DropdownMenuItem key={a.id} onClick={() => p.onChangeAngle!(a.id)} disabled={a.id === p.currentAngle} className="gap-2">
                      <span className="text-base shrink-0">{a.emoji}</span>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold">{a.label}</p>
                        <p className="text-2xs text-muted-foreground line-clamp-2">{a.principle}</p>
                      </div>
                    </DropdownMenuItem>
                  ))}
                </>
              )}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}
        {isCarousel && hasVisuals && p.onGenerateVisuals && (
          <DropdownMenuItem onClick={p.onGenerateVisuals} disabled={p.visualLoading} className="gap-2">
            {p.visualLoading ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Création des visuels…</>
            ) : (
              <><Palette className="h-4 w-4" /> Refaire les visuels (le texte reste) <span className="ml-auto text-2xs text-muted-foreground">1 crédit</span></>
            )}
          </DropdownMenuItem>
        )}
        {transformTargets.length > 0 && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="gap-2">
              <ArrowUpRight className="h-4 w-4" /> Même idée, autre format
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-64">
              <DropdownMenuLabel className="text-2xs font-normal text-muted-foreground">
                S'ouvre dans un nouvel onglet, avec ton idée déjà remplie
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {transformTargets.map((t) => (
                <DropdownMenuItem
                  key={t.id}
                  onClick={() => {
                    const params = new URLSearchParams({
                      sujet: p.sourceIdea!,
                      ...(p.sourceObjective ? { objectif: p.sourceObjective } : {}),
                      format: t.id,
                      ...(p.sourceAngle ? { angle: p.sourceAngle } : {}),
                      from: "transform",
                    });
                    window.open(`/creer?${params.toString()}`, "_blank", "noopener,noreferrer");
                  }}
                  className="gap-2 cursor-pointer"
                >
                  <span className="text-base">{t.emoji}</span>
                  <span className="text-sm">{t.label}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const first = getPrimary ? getButton : publishButton;
  const second = getPrimary ? publishButton : getButton;

  return (
    <>
      {/* Barre collée en bas de l'écran : les actions restent visibles sans
          défiler, même sous un long carrousel. Au-dessus de la barre du bas
          sur téléphone (même réglage que l'écran Format, chantier B). */}
      <div
        data-testid="result-actions"
        className="sticky bottom-[calc(3.5rem+env(safe-area-inset-bottom))] md:bottom-0 z-30 -mx-4 sm:-mx-6 px-4 sm:px-6 pt-2 pb-3 bg-background/95 backdrop-blur-sm border-t border-border/60"
      >
        {/* Deux lignes : l'action principale en entier, puis les deux autres et
            le menu (une seule ligne tronquait les libellés dans la colonne étroite). */}
        <div className="flex flex-col gap-2">
          {first}
          <div className="flex gap-2">
            {second}
            {saveBlock}
            {moreMenu}
          </div>
        </div>
        {format === "newsletter" && (
          <p className="mt-1 text-2xs text-muted-foreground text-center">Colle-la dans ton outil d’emailing pour l’envoyer. Aucun email n’est envoyé depuis cet écran.</p>
        )}
      </div>

      {p.saveNotice && <p role="status" className="text-sm text-muted-foreground rounded-xl border border-border bg-muted/20 p-3">{p.saveNotice}</p>}
      <div className="flex justify-center">
        <Button onClick={p.onReset} disabled={p.savingContent} variant="link" className="gap-1.5 h-9 text-sm text-muted-foreground">
          <RotateCcw className="h-3.5 w-3.5" /> Créer un autre contenu
        </Button>
      </div>
    </>
  );
}
