import { Card, CardContent } from "@/components/ui/card";
import { readableError } from "@/lib/error-messages";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Camera, Clock3, Download, FileDown, ImageIcon, Loader2, Palette, Play } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatSlideRole } from "@/lib/slide-roles";
import AiGeneratedMention from "@/components/AiGeneratedMention";
import RedFlagsChecker, { fixRedFlags } from "@/components/RedFlagsChecker";
import { toast } from "sonner";
import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useBrandCharter } from "@/hooks/use-branding";
import { buildStoryFrameHtml, placeTextAwayFromLikelyFace, storyVisualOrFallback, withStoryVisualFallback, type StoryFrameBranding } from "@/lib/story-visual";
import { classerParPertinence } from "@/lib/rank-library-photos";
import { exportStoryPng } from "@/lib/export-carousel-png";
import { exportStoryPptx } from "@/lib/export-story-pptx";
import { useOpenInCanva } from "@/hooks/use-open-in-canva"; import { useScrollIntoViewOnPhone } from "@/hooks/use-scroll-into-view-on-phone"; import { takeOpenStoryIndex } from "@/lib/calendar-story-open";
import { resolveLibraryPhotoUrls, urlToDataUrl } from "@/lib/story-photos";
import StoryPhotoSuggestions, {
  type AppliedStockPhoto,
} from "@/components/creer/formatRenderers/StoryPhotoSuggestions";
import { PhotoLibraryPickerDialog } from "@/components/photos/PhotoLibraryPickerDialog";
import { useUserPhotos } from "@/hooks/use-user-photos";
import { getSignedPhotoUrls, type UserPhotoRow } from "@/lib/photo-storage";
import StorySequenceReaderDialog from "@/components/stories/StorySequenceReaderDialog";
import StoryVisualDirectControls from "@/components/stories/StoryVisualDirectControls";
import StoryStrip from "@/components/stories/StoryStrip";
import StoryEditorPanel from "@/components/stories/StoryEditorPanel";
import StoryUndoButtons from "@/components/stories/StoryUndoButtons";
import { storyInlineField } from "@/components/stories/story-inline-fields";
import { storyChangeKind, useStoryHistory } from "@/components/stories/use-story-history";
import StoryPersonalAnchor from "@/components/stories/StoryPersonalAnchor";
import { StoryActionsMenu } from "@/components/stories/StoryActionsMenu";
import { useStoryStructure } from "@/components/stories/use-story-structure";
import { attachedPhotoSlots, attachedPhotoUrl, pinAttachedPhotos, type AttachedPhotoLike } from "@/lib/story-attached-photos";

/** Photos signées d'avance, dans lesquelles chaque story pioche. */
const LIBRARY_POOL = 12;
/** Vignettes réellement montrées sous une story. */
const LIBRARY_STRIP = 4;

/** Actions d'export remontées au panneau minimal (#608) quand des frames existent. */
export interface StoryExportActions {
  exportPng: () => void;
  exportPptx: () => void;
  openInCanva: () => void;
  exporting: boolean;
  exportingPptx: boolean;
  openingCanva: boolean;
  /** Nombre de frames rendues (affichage "(ZIP)" du menu Télécharger). */
  frameCount: number;
}

interface Props {
  result: any;
  onStoriesUpdate?: (stories: any[]) => void;
  photos?: AttachedPhotoLike[];
  /**
   * Quand fourni, les exports vivent dans le panneau d'actions du parent
   * (héros Canva + menu « Autres actions ») et la rangée de boutons locale
   * n'est pas rendue. null = aucune frame exportable.
   */
  onExportActionsChange?: (actions: StoryExportActions | null) => void;
}

// Même lecture que l'aperçu (story-visual.ts : text || texte || content) ;
// sans texte nulle part, le premier champ présent reste celui qu'on modifie.
const TEXT_FIELDS = ["text", "texte", "content"] as const;
const getTextField = (story: any): (typeof TEXT_FIELDS)[number] =>
  TEXT_FIELDS.find((f) => story[f]) ?? TEXT_FIELDS.find((f) => f in story) ?? "content";

const getStoryText = (story: any): string => String(story[getTextField(story)] ?? "");

const getDisplayedBody = (story: any): string => {
  if (story.visual?.body_pill_edited) return String(story.visual.body_pill ?? "");
  return getStoryText(story).trim() || String(story.visual?.body_pill ?? "");
};

// Les nouvelles stories photo/fond/interaction affichent le texte entier.
// Garder ces deux représentations ensemble quand elles étaient identiques.
// Les anciennes pastilles personnalisées, listes et attributions restent
// indépendantes : leur contenu n'a pas le même rôle que la narration.
const hasMirroredBody = (story: any): boolean => {
  const visual = story.visual;
  return !story.face_cam && !!visual &&
    [undefined, null, "", "photo_pills", "fond_pills", "interaction"].includes(visual.gabarit) &&
    typeof visual.body_pill === "string" && visual.body_pill === story[getTextField(story)];
};

const replaceCitationInNarration = (narration: string, oldQuote: string, newQuote: string): string => {
  if (!narration || !oldQuote) return narration;
  const index = narration.toLocaleLowerCase("fr").indexOf(oldQuote.toLocaleLowerCase("fr"));
  if (index < 0) return narration;
  return narration.slice(0, index) + newQuote + narration.slice(index + oldQuote.length);
};

function publicationTimeLabel(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const normalized = value.trim().toLowerCase();
  const labels: Record<string, string> = { matin: "le matin", midi: "à midi", soir: "le soir" };
  return labels[normalized] || value.trim();
}

export default function StoryResult({ result, onStoriesUpdate, photos, onExportActionsChange }: Props) {
  const rawStories: any[] = result?.stories || result?.sequences || result?.slides || [];
  const storyCardsRef = useScrollIntoViewOnPhone<HTMLDivElement>(); // téléphone : défile seul jusqu'à la story affichée
  // Une story sans plan visuel (ni face cam) reçoit le plan de repli
  // photo + texte complet : aperçu, choix de photo et exports existent.
  const [stories, setStories] = useState(() => rawStories.map(withStoryVisualFallback));
  const [readerOpen, setReaderOpen] = useState(false);
  const [personalAnchor, setPersonalAnchor] = useState("");
  const [currentStory, setCurrentStory] = useState(takeOpenStoryIndex); // story cliquée dans le calendrier, sinon la 1re
  const shownStory = Math.min(currentStory, Math.max(0, stories.length - 1));
  const storiesRef = useRef(stories);
  storiesRef.current = stories;
  const [historyEpoch, setHistoryEpoch] = useState(0);
  const automaticChange = useRef(false);

  const rawSignature = JSON.stringify(rawStories);
  const prevSignature = useRef(rawSignature);

  useEffect(() => {
    // Une régénération peut garder le même nombre de stories. Comparer le
    // contenu, tout en gardant les éditions locales si le parent ne change rien.
    if (rawSignature !== prevSignature.current) {
      prevSignature.current = rawSignature;
      const incoming = JSON.parse(rawSignature).map(withStoryVisualFallback);
      // Le parent renvoie souvent nos propres modifications (enregistrement) :
      // rien à changer, et Annuler garde son historique.
      if (JSON.stringify(incoming) === JSON.stringify(storiesRef.current)) return;
      setStories(incoming);
      setHistoryEpoch((n) => n + 1);
    }
  }, [rawSignature]);

  const { data: charter } = useBrandCharter();
  const branding: StoryFrameBranding | null = charter
    ? {
        color_primary: charter.color_primary,
        color_secondary: charter.color_secondary,
        color_background: charter.color_background,
        color_text: charter.color_text,
        // Réglages « Stories » de la charte (assemblage, pastilles, coins,
        // alignement) — absents tant que la migration n'est pas passée : le
        // renderer retombe alors sur l'assemblage A.
        story_assemblage: charter.story_assemblage ?? null,
        story_pill_color: charter.story_pill_color ?? null,
        story_corners: charter.story_corners ?? null,
        story_align: charter.story_align ?? null,
      }
    : null;

  // Photos attachées à la création (lot D) : voir story-attached-photos.ts.
  const attachedSlots = useMemo(() => attachedPhotoSlots(stories, photos), [photos, stories]);
  const attachedByStory = useMemo(
    () => new Map([...attachedSlots].map(([i, slot]) => [i, attachedPhotoUrl(photos?.[slot])!])),
    [attachedSlots, photos],
  );

  // Photos de bibliothèque assignées par la génération (visual.photo_id) :
  // résolues en URLs signées à l'affichage, jamais persistées (elles expirent).
  const [libraryUrls, setLibraryUrls] = useState<Map<string, string>>(new Map());
  const libraryIdsSignature = useMemo(
    () =>
      stories
        .map((s: any) => s?.visual?.photo_id)
        .filter(Boolean)
        .sort()
        .join(","),
    [stories],
  );
  useEffect(() => {
    if (!libraryIdsSignature) {
      setLibraryUrls(new Map());
      return;
    }
    let cancelled = false;
    resolveLibraryPhotoUrls(stories).then((map) => {
      if (!cancelled) setLibraryUrls(map);
    }).catch(() => { if (!cancelled) setLibraryUrls(new Map()); });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [libraryIdsSignature]);

  // Photo par story : choix post-génération (photo_url), sinon bibliothèque
  // (photo_id résolu), sinon la photo attachée répartie sur cette story.
  const getStoryPhotoUrl = useCallback(
    (story: any, index: number): string | null => {
      const v = story?.visual;
      if (v?.photo_url) return v.photo_url;
      if (v?.photo_id) {
        const resolved = libraryUrls.get(v.photo_id);
        if (resolved) return resolved;
      }
      return attachedByStory.get(index) ?? null;
    },
    [libraryUrls, attachedByStory],
  );

  // Rendu déterministe : recalculé à chaque édition (instantané, aucun appel réseau).
  const frames = useMemo(
    () =>
      stories.map((s: any, i: number) =>
        buildStoryFrameHtml(s, branding, { photoUrl: getStoryPhotoUrl(s, i), preview: true }),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stories, charter, getStoryPhotoUrl],
  );

  const hasFrames = frames.some(Boolean);
  const [exporting, setExporting] = useState(false);
  const [exportingPptx, setExportingPptx] = useState(false);
  const { openInCanva, openingCanva } = useOpenInCanva();

  // Export : chaque photo (URL signée ou stock https) est convertie en data URL
  // pour que html2canvas et le PPTX n'aient jamais de souci CORS / d'expiration.
  const buildExportFrames = useCallback(async () => {
    const frames: { story_number: number; html: string; photoUrl?: string | null }[] = [];
    // Resolve library IDs at export time: the preview's signed URLs can expire.
    const freshUrls = await resolveLibraryPhotoUrls(stories);
    for (let i = 0; i < stories.length; i++) {
      const s = stories[i];
      if (!storyVisualOrFallback(s)) continue; // même test que buildStoryFrameHtml, sans fabriquer le HTML deux fois
      const visual = s?.visual;
      const usesPhoto = visual?.background === "photo";
      // Never substitute an attached photo for an explicitly selected missing ID.
      const rawUrl = !usesPhoto ? null : visual?.photo_url ||
        (visual?.photo_id ? freshUrls.get(visual.photo_id) : getStoryPhotoUrl(s, i));
      const exportUrl = rawUrl ? await urlToDataUrl(rawUrl) : null;
      if (usesPhoto && (visual?.photo_id || visual?.photo_url || rawUrl) && !exportUrl) {
        throw new Error(`La photo de la story ${i + 1} est indisponible. Réessaie ou choisis une autre photo avant d'exporter.`);
      }
      const html = buildStoryFrameHtml(s, branding, { photoUrl: exportUrl, preview: false });
      if (html) frames.push({ story_number: i + 1, html, photoUrl: exportUrl });
    }
    return frames;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stories, charter, getStoryPhotoUrl]);

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      await exportStoryPng(await buildExportFrames(), result?.structure_type || "sequence");
    } catch (error) {
      toast.error(readableError(error, "Export impossible. Réessaie."));
    } finally {
      setExporting(false);
    }
  }, [buildExportFrames, result?.structure_type]);

  const handleExportPptx = useCallback(async () => {
    setExportingPptx(true);
    try {
      await exportStoryPptx(await buildExportFrames(), {
        fileName: result?.structure_type || "sequence",
      });
    } catch (error) {
      toast.error(readableError(error, "Export impossible. Réessaie."));
    } finally {
      setExportingPptx(false);
    }
  }, [buildExportFrames, result?.structure_type]);

  const handleOpenInCanva = useCallback(() => {
    openInCanva(
      async () =>
        (await exportStoryPptx(await buildExportFrames(), { returnBlob: true })) as Blob,
      `Stories — ${result?.structure_label || result?.structure_type || "séquence"}`,
      { etapes: frames.length },
    );
  }, [openInCanva, buildExportFrames, frames.length, result?.structure_label, result?.structure_type]);

  // Remonte les actions d'export au panneau minimal du parent (#608) : les
  // stories y gagnent le même héros « Ouvrir dans Canva » que les carrousels.
  useEffect(() => {
    if (!onExportActionsChange) return;
    onExportActionsChange(
      hasFrames
        ? {
            exportPng: handleExport,
            exportPptx: handleExportPptx,
            openInCanva: handleOpenInCanva,
            exporting,
            exportingPptx,
            openingCanva,
            frameCount: frames.filter(Boolean).length,
          }
        : null,
    );
    return () => onExportActionsChange(null);
  }, [
    onExportActionsChange,
    hasFrames,
    handleExport,
    handleExportPptx,
    handleOpenInCanva,
    exporting,
    exportingPptx,
    openingCanva,
    frames,
  ]);

  const fullText = stories
    .map(getStoryText)
    .filter(Boolean)
    .join("\n\n");

  const fixStoryExpressions = () => setStories(prev => {
    const updated = prev.map(story => {
      const field = getTextField(story);
      const visual = story.visual;
      return {
        ...story,
        [field]: fixRedFlags(getStoryText(story)),
        ...(visual ? { visual: {
          ...visual,
          ...Object.fromEntries(["title_pill", "body_pill", "quote"]
            .filter(key => typeof visual[key] === "string")
            .map(key => [key, fixRedFlags(visual[key])])),
          ...(Array.isArray(visual.list_pills) ? { list_pills: visual.list_pills.map((text: string) => fixRedFlags(text)) } : {}),
        } } : {}),
      };
    });
    onStoriesUpdate?.(updated);
    return updated;
  });

  const ANGLE_LABELS: Record<string, { emoji: string; label: string }> = {
    coulisses: { emoji: "🎬", label: "Coulisses" },
    reflexion: { emoji: "💭", label: "Réflexion perso" },
    interpellation: { emoji: "🙋", label: "Interpellation communauté" },
    conseil_vecu: { emoji: "📖", label: "Conseil par l'expérience" },
    storytime_client: { emoji: "💬", label: "Histoire de client·e" },
    coup_de_gueule: { emoji: "🔥", label: "Coup de gueule doux" },
    journal_bord: { emoji: "📓", label: "Journal de bord" },
  };

  const narrativeAngle = result?.narrative_angle;
  const angleInfo = narrativeAngle ? ANGLE_LABELS[narrativeAngle] : null;
  const publicationTime = publicationTimeLabel(
    result?.publication_time || stories.find((story: any) => story?.timing)?.timing,
  );

  const updateStoryText = useCallback((index: number, newValue: string) => {
    setStories(prev => {
      const updated = [...prev];
      const field = getTextField(updated[index]);
      const story = updated[index];
      updated[index] = {
        ...story,
        [field]: newValue,
        ...(hasMirroredBody(story) ? { visual: { ...story.visual, body_pill: newValue } } : {}),
      };
      onStoriesUpdate?.(updated);
      return updated;
    });
  }, [onStoriesUpdate]);

  const insertPersonalAnchor = useCallback(() => {
    const note = personalAnchor.trim();
    if (!note || stories.length === 0) return;
    const existing = getStoryText(stories[0]).trim();
    const separator = /[.!?…]$/u.test(note) ? " " : ". ";
    updateStoryText(0, `${note}${existing ? separator + existing : ""}`);
    setPersonalAnchor("");
    toast.success("Ta phrase a été ajoutée au début de la story 1.");
  }, [personalAnchor, stories, updateStoryText]);

  const updateVisualPill = useCallback((index: number, field: "title_pill" | "body_pill" | "quote", newValue: string) => {
    setStories(prev => {
      const updated = [...prev];
      const story = updated[index];
      const textField = getTextField(story);
      const narration = String(story[textField] || "");
      const syncedNarration = field === "quote"
        ? replaceCitationInNarration(narration, String(story.visual?.quote || ""), newValue)
        : narration;
      updated[index] = {
        ...story,
        ...(field === "quote" && syncedNarration !== narration ? { [textField]: syncedNarration } : {}),
        ...(field === "body_pill" && hasMirroredBody(story) ? { [getTextField(story)]: newValue } : {}),
        visual: { ...story.visual, [field]: newValue, ...(field === "body_pill" ? { body_pill_edited: true } : {}) },
      };
      onStoriesUpdate?.(updated);
      return updated;
    });
  }, [onStoriesUpdate]);

  const updateVisualListPill = useCallback((storyIndex: number, itemIndex: number, newValue: string) => {
    setStories(prev => {
      const updated = [...prev];
      const story = updated[storyIndex];
      const list = Array.isArray(story.visual?.list_pills) ? [...story.visual.list_pills] : [];
      list[itemIndex] = newValue;
      updated[storyIndex] = { ...story, visual: { ...story.visual, list_pills: list } };
      onStoriesUpdate?.(updated);
      return updated;
    });
  }, [onStoriesUpdate]);

  const updateStickerText = useCallback((storyIndex: number, optionIndex: number | null, newValue: string) => {
    setStories(prev => {
      const updated = [...prev];
      const story = updated[storyIndex];
      if (optionIndex === null) {
        updated[storyIndex] = { ...story, sticker: { ...story.sticker, label: newValue } };
      } else {
        const options = Array.isArray(story.sticker?.options) ? [...story.sticker.options] : [];
        options[optionIndex] = newValue;
        updated[storyIndex] = { ...story, sticker: { ...story.sticker, options } };
      }
      onStoriesUpdate?.(updated);
      return updated;
    });
  }, [onStoriesUpdate]);

  const setTextPosition = (index: number, text_position: "top" | "middle" | "bottom") => setStories(prev => {
    const updated = prev.map((story, i) => i === index
      ? { ...story, visual: {
          ...story.visual,
          text_position,
          text_position_x: null,
          text_position_y: null,
          text_position_edited: true,
          face_avoidance_applied: false,
        } } : story);
    onStoriesUpdate?.(updated);
    return updated;
  });

  const updateVisualViewport = useCallback((index: number, patch: Record<string, unknown>) => {
    setStories((prev) => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        visual: { ...(updated[index]?.visual || {}), ...patch },
      };
      onStoriesUpdate?.(updated);
      return updated;
    });
  }, [onStoriesUpdate]);

  const moveStoryText = useCallback((index: number, x: number, y: number) => {
    updateVisualViewport(index, {
      text_position_x: x,
      text_position_y: y,
      text_position_edited: true,
      face_avoidance_applied: false,
    });
  }, [updateVisualViewport]);

  const resetStoryViewport = useCallback((index: number, mode: "text" | "photo") => {
    updateVisualViewport(index, mode === "text"
      ? { text_position: "middle", text_position_x: null, text_position_y: null, text_position_edited: true, face_avoidance_applied: false }
      : { photo_position_x: 50, photo_position_y: 50, photo_zoom: 1 });
  }, [updateVisualViewport]);

  // Choix du fond, story par story : photo (la bande de photos s'ouvre dessous)
  // ou couleur de la marque, sans rien. Vaut pour tous les gabarits, citation
  // comprise (demande Laetitia 07/09 : « soit un fond sans rien, soit la photo
  // que je veux »).
  const setBackground = useCallback((index: number, background: "photo" | "fond_couleur") => {
    setStories((prev) => {
      const updated = [...prev];
      const story = updated[index];
      updated[index] = { ...story, visual: { ...(story.visual || {}), background } };
      onStoriesUpdate?.(updated);
      return updated;
    });
  }, [onStoriesUpdate]);

  // Choix face cam / story designée, story par story. L'IA propose souvent du
  // face cam ; beaucoup de créatrices ne se filment pas. Le passage en version
  // designée fabrique un plan visuel minimal (fond photo + pastilles tirées du
  // texte) pour que l'aperçu et les exports existent tout de suite.
  const toggleFaceCam = useCallback((index: number) => {
    setStories((prev) => {
      const updated = [...prev];
      const story = updated[index];
      const text = getStoryText(story).trim();
      if (story.face_cam) {
        // Le vrai texte de la story dans la pastille (pas un titre + un résumé) :
        // c'est ce qu'on lit. 350 caractères = plafond du brief.
        const title = "";
        const body = text.slice(0, 350);
        updated[index] = {
          ...story,
          face_cam: false,
          format: "photo",
          format_label: "📸 Photo avec texte",
          visual: {
            photo_directive: story.visual?.photo_directive ?? null,
            photo_query_en: story.visual?.photo_query_en ?? null,
            ...(story.visual || {}),
            title_pill: story.visual?.title_pill || title || null,
            body_pill: story.visual?.body_pill || body,
            background: "photo",
            gabarit:
              story.visual?.gabarit && story.visual.gabarit !== "fond_pills"
                ? story.visual.gabarit
                : "photo_pills",
          },
        };
      } else {
        updated[index] = {
          ...story,
          face_cam: true,
          format: "face_cam",
          format_label: "🎥 Face cam",
        };
      }
      onStoriesUpdate?.(updated);
      return updated;
    });
  }, [onStoriesUpdate]);

  // Fond choisi après génération (stock Pexels ou « Ma photo ») : URL stable
  // (https Pexels ou data:) + crédit — persistés dans le JSON de la séquence.
  const applyStoryPhoto = useCallback(
    (index: number, photo: AppliedStockPhoto, opts?: { onlyIfEmpty?: boolean }) => {
      setStories((prev) => {
        const current = prev[index]?.visual;
        // Pré-application automatique : ne JAMAIS écraser une photo déjà là
        // (photo de bibliothèque placée par la génération, choix manuel…).
        // Vérifié au niveau de l'état pour être insensible aux courses
        // (résolution d'URL signée encore en vol au moment du fetch stock).
        if (opts?.onlyIfEmpty && (current?.photo_id || current?.photo_url)) {
          return prev;
        }
        // Photo posée d'office : pas une modification à annuler.
        if (opts?.onlyIfEmpty) automaticChange.current = true;
        const positionedVisual = placeTextAwayFromLikelyFace(
          current,
          photo.alt,
          current?.photo_directive,
        );
        const updated = [...prev];
        updated[index] = {
          ...updated[index],
          visual: {
            ...positionedVisual,
            photo_url: photo.url,
            photo_stock_credit: photo.credit,
          },
        };
        onStoriesUpdate?.(updated);
        return updated;
      });
    },
    [onStoriesUpdate],
  );

  // Fond choisi dans la BIBLIOTHÈQUE (lot D) : on persiste le photo_id (les
  // URLs signées expirent) et on efface tout choix stock précédent.
  const applyLibraryPhoto = useCallback(
    (index: number, row: UserPhotoRow) => {
      setStories((prev) => {
        const updated = [...prev];
        const current = updated[index]?.visual;
        const positionedVisual = placeTextAwayFromLikelyFace(
          current,
          row.kind,
          row.description,
          ...(row.tags || []),
          current?.photo_directive,
        );
        updated[index] = {
          ...updated[index],
          visual: {
            ...positionedVisual,
            photo_id: row.id,
            photo_library_description: row.description ?? null,
            photo_url: null,
            photo_stock_credit: null,
          },
        };
        onStoriesUpdate?.(updated);
        return updated;
      });
    },
    [onStoriesUpdate],
  );

  // Vignettes bibliothèque : on signe un VIVIER (12 photos récentes) une seule
  // fois, puis chaque story y pioche les 4 plus pertinentes POUR ELLE.
  // Avant (audit 14/08) : les 4 plus récentes, identiques pour toutes les
  // stories — sur une story qui parlait d'un livre, la bande proposait trois
  // ordinateurs portables, alors que le rapprochement automatique, lui, avait
  // su choisir le livre. Le tri intelligent existait, la bande l'ignorait.
  const { data: libRows = [] } = useUserPhotos();
  const [libraryPool, setLibraryPool] = useState<{ row: UserPhotoRow; url: string }[]>([]);
  useEffect(() => {
    const ready = libRows.filter((p) => p.status === "ready" && p.storage_path).slice(0, LIBRARY_POOL);
    if (ready.length === 0) {
      setLibraryPool((prev) => (prev.length ? [] : prev)); // même état : pas de rendu en boucle tant que la bibliothèque charge
      return;
    }
    let cancelled = false;
    getSignedPhotoUrls(ready.map((r) => r.storage_path)).then((map) => {
      if (cancelled) return;
      setLibraryPool(
        ready
          .map((row) => ({ row, url: map.get(row.storage_path) || "" }))
          .filter((x) => x.url),
      );
    }).catch(() => { if (!cancelled) setLibraryPool([]); });
    return () => {
      cancelled = true;
    };
  }, [libRows]);

  // Les 4 photos du vivier qui collent le mieux à CETTE story. La demande =
  // la directive photo (ce que l'IA voulait voir) + le texte de la story.
  // Classement déterministe et gratuit (cf. rank-library-photos) : on ne
  // FILTRE jamais, on ne fait que remonter les plus parlantes.
  const stripPourStory = useCallback(
    (story: any) => {
      const demande = [
        story?.visual?.photo_directive || "",
        story?.text || story?.texte || story?.content || "",
      ]
        .join(" ")
        .trim();
      return classerParPertinence(
        libraryPool,
        demande,
        ({ row }) => `${row.description || ""} ${(row.tags || []).join(" ")}`,
      ).slice(0, LIBRARY_STRIP);
    },
    [libraryPool],
  );

  // Picker « toute la bibliothèque » : un seul dialog, ciblé sur une story.
  const [pickerFor, setPickerFor] = useState<number | null>(null);

  // Suppression d'une story : confirmation obligatoire, jamais la dernière.
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);
  // Chantier 4 : déplacer, dupliquer, ajouter (sans IA), clés stables par story.
  const structure = useStoryStructure({ stories, setStories, onStoriesUpdate, setCurrent: setCurrentStory,
    prepare: (list) => pinAttachedPhotos(list, attachedSlots) });
  const removeStory = useCallback((index: number) => {
    if (stories.length > 1) structure.forget(index);
    setStories((prev) => {
      if (prev.length <= 1) return prev;
      const updated = prev.filter((_, i) => i !== index);
      onStoriesUpdate?.(updated);
      return updated;
    });
    setPickerFor((prev) => (prev === null ? null : prev === index ? null : prev > index ? prev - 1 : prev));
    setDeleteTarget(null);
    toast.success("Story supprimée. Les suivantes ont été renumérotées.");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onStoriesUpdate, stories.length]);

  // Annuler / Rétablir, comme le carrousel. Une nouvelle séquence venue du parent repart de zéro.
  const restore = useCallback((next: typeof stories) => { setStories(next); onStoriesUpdate?.(next); }, [onStoriesUpdate]);
  const history = useStoryHistory(stories, restore, String(historyEpoch), storyChangeKind, automaticChange);
  // Écrire sur la story ou dans la case du panneau : les mêmes champs.
  const textSetters = (i: number, story: (typeof stories)[number]) => ({
    narration: getStoryText(story),
    setNarration: (value: string) => updateStoryText(i, value),
    setPill: (field: "title_pill" | "body_pill" | "quote", value: string) => updateVisualPill(i, field, value),
    setListItem: (itemIndex: number, value: string) => updateVisualListPill(i, itemIndex, value),
  });

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between gap-2 px-1 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          {angleInfo && (
            <Badge variant="outline" className="text-xs font-medium bg-primary/5 border-primary/20 text-primary">
              {angleInfo.emoji} {angleInfo.label}
            </Badge>
          )}
          {result?.structure_label && (
            <span className="text-xs text-muted-foreground">{result.structure_label}</span>
          )}
          {publicationTime && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Clock3 className="h-3.5 w-3.5" /> Toute la séquence à la suite, {publicationTime}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {stories.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => setReaderOpen(true)} className="gap-1.5">
              <Play className="h-3.5 w-3.5" /> Lire la séquence
            </Button>
          )}
          {hasFrames && !onExportActionsChange && (
            <>
            <Button variant="outline" size="sm" onClick={handleExport} disabled={exporting} className="gap-1.5">
              {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              Télécharger les visuels
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportPptx} disabled={exportingPptx} className="gap-1.5">
              {exportingPptx ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />}
              Télécharger le PPTX éditable
            </Button>
            <Button variant="outline" size="sm" onClick={handleOpenInCanva} disabled={openingCanva} className="gap-1.5">
              {openingCanva ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Palette className="h-3.5 w-3.5" />}
              Ouvrir dans Canva
            </Button>
            </>
          )}
        </div>
      </div>

      {/* Stories comme le carrousel (12/11/2026) : vignettes à gauche, story au centre, réglages à droite. */}
      <div ref={storyCardsRef} className="grid gap-3 scroll-mt-16 lg:grid-cols-[88px_minmax(0,1fr)] lg:items-start" data-story-editor>
        <StoryStrip frames={frames} current={shownStory} onChange={setCurrentStory} onMove={structure.move}
          onDuplicate={structure.duplicate} onAdd={structure.add} onDelete={setDeleteTarget} />
        <div className="min-w-0" data-selection-enabled="true">
          {stories.map((story: any, i: number) => (
            <div key={structure.keys[i] ?? i} hidden={i !== shownStory} className={i === shownStory ? "grid gap-3 md:grid-cols-[auto_minmax(0,1fr)] md:items-start" : "hidden"}>
              <div className="min-w-0 space-y-2 lg:sticky lg:top-20">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Badge variant="secondary" className="font-mono text-2xs">Story {i + 1}</Badge>
                  {story.role && (
                    <Badge className="bg-primary/10 text-primary border-primary/20 text-2xs font-mono">{formatSlideRole(story.role)}</Badge>
                  )}
                  <StoryActionsMenu index={i} count={stories.length} onDelete={() => setDeleteTarget(i)} onMove={(to) => structure.move(i, to)}
                    onDuplicate={() => structure.duplicate(i)} onAdd={() => structure.add(i)} hideDelete
                    redo={{ number: i + 1, total: stories.length, role: story.role ? formatSlideRole(story.role) : null, text: getStoryText(story),
                      previous: i > 0 ? getStoryText(stories[i - 1]) : null, next: i < stories.length - 1 ? getStoryText(stories[i + 1]) : null,
                      listNote: story.visual?.gabarit === "liste", onKeep: ((key) => (text: string) => {
                        const at = structure.indexOfKey(key);
                        if (at < 0) toast.error("Cette story n'existe plus : rien n'a été changé."); else updateStoryText(at, text);
                      })(structure.keys[i]) }} />
                  {i === shownStory && <StoryUndoButtons history={history} />}
                  <Button variant="outline" size="sm"
                    className="h-7 px-2.5 text-2xs gap-1.5 font-medium border-primary/30 text-primary hover:bg-primary/10 hover:text-primary"
                    onClick={() => toggleFaceCam(i)}>
                    {story.face_cam ? (
                      <><ImageIcon className="h-3.5 w-3.5" /> Revenir à la story designée</>
                    ) : (
                      <><Camera className="h-3.5 w-3.5" /><span>Me filmer<span className="hidden min-[400px]:inline"> à la place</span></span></>
                    )}
                  </Button>
                </div>
                {frames[i] && story.visual ? (
                  <StoryVisualDirectControls
                    className="mx-auto"
                    storyIndex={i} html={frames[i]!} visual={story.visual}
                    photoEnabled={story.visual.background === "photo" && Boolean(getStoryPhotoUrl(story, i))}
                    onTextMove={(x, y) => moveStoryText(i, x, y)}
                    onPhotoMove={(x, y) => updateVisualViewport(i, { photo_position_x: x, photo_position_y: y })}
                    inlineField={(box) => storyInlineField(story, box, textSetters(i, story))}
                  />
                ) : (
                  <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
                    Story filmée : écris à droite ce que tu vas dire face caméra.
                  </p>
                )}
              </div>
              <StoryEditorPanel
                story={story} index={i} narration={getStoryText(story)} displayedBody={getDisplayedBody(story)}
                photoEnabled={story.visual?.background === "photo" && Boolean(getStoryPhotoUrl(story, i))}
                {...textSetters(i, story)}
                setSticker={(optionIndex, value) => updateStickerText(i, optionIndex, value)}
                setTextPosition={(position) => setTextPosition(i, position)}
                setTextSize={(text_size) => updateVisualViewport(i, { text_size })}
                setBackground={(background) => setBackground(i, background)}
                setPhotoZoom={(zoom) => updateVisualViewport(i, { photo_zoom: zoom })}
                resetViewport={(mode) => resetStoryViewport(i, mode)}
                photoTools={<>
                  {story.visual?.photo_id && libraryUrls.has(story.visual.photo_id) && !story.visual?.photo_url ? (
                    <p className="text-xs text-primary">
                      📸 Photo de ta bibliothèque{story.visual.photo_library_description ? ` — ${story.visual.photo_library_description}` : ""}
                    </p>
                  ) : story.visual?.photo_stock_credit?.photographer ? (
                    <p className="text-xs text-muted-foreground">
                      Photo :{" "}
                      {story.visual.photo_stock_credit.source_url ? (
                        <a href={story.visual.photo_stock_credit.source_url} target="_blank" rel="noreferrer" className="underline hover:text-foreground">
                          {story.visual.photo_stock_credit.photographer}
                        </a>
                      ) : story.visual.photo_stock_credit.photographer}{" "}· Pexels
                    </p>
                  ) : story.visual?.photo_directive && !story.visual?.photo_url ? (
                    <p className="text-xs text-muted-foreground">📷 {story.visual.photo_directive}</p>
                  ) : null}
                  {story.visual?.background === "photo" && (
                    <StoryPhotoSuggestions
                      storyIndex={i}
                      directive={story.visual?.photo_directive ?? null}
                      queryEn={story.visual?.photo_query_en ?? null}
                      appliedUrl={getStoryPhotoUrl(story, i)}
                      appliedPhotoId={story.visual?.photo_id ?? null}
                      autoApply={!story.visual?.photo_id && !story.visual?.photo_url && !attachedByStory.has(i)}
                      libraryStrip={stripPourStory(story)}
                      onApply={(photo, opts) => applyStoryPhoto(i, photo, opts)}
                      onApplyLibrary={(row) => applyLibraryPhoto(i, row)}
                      onOpenLibrary={() => setPickerFor(i)}
                    />
                  )}
                </>}
              />
            </div>
          ))}
        </div>
      </div>
      {/* Après la story (chantier 3, 12/11/2026) : avant, cet encadré cachait la story 1 sur téléphone. */}
      {result?.personal_tip && stories.length > 0 && (
        <StoryPersonalAnchor tip={result.personal_tip} value={personalAnchor} onChange={setPersonalAnchor} onInsert={() => { insertPersonalAnchor(); setCurrentStory(0); }} />
      )}

      <PhotoLibraryPickerDialog
        open={pickerFor !== null}
        onOpenChange={(v) => !v && setPickerFor(null)}
        maxSelectable={1}
        onConfirm={(rows) => {
          if (pickerFor !== null && rows[0]) applyLibraryPhoto(pickerFor, rows[0]);
          setPickerFor(null);
        }}
      />

      <StorySequenceReaderDialog
        open={readerOpen}
        onOpenChange={setReaderOpen}
        stories={stories}
        frames={frames}
      />

      <AlertDialog open={deleteTarget !== null} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer la story {deleteTarget !== null ? deleteTarget + 1 : ""} ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette story sera retirée de la séquence et les suivantes seront renumérotées. Cette action est définitive.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Garder la story</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget !== null && removeStory(deleteTarget)}
            >
              Supprimer cette story
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <RedFlagsChecker content={fullText} onFix={fixStoryExpressions} />

      <AiGeneratedMention />
    </div>
  );
}
