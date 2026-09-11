import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Camera, Clock3, Download, FileDown, ImageIcon, Loader2, Palette, Play, Sparkles } from "lucide-react";
import { formatSlideRole } from "@/lib/slide-roles";
import AiGeneratedMention from "@/components/AiGeneratedMention";
import RedFlagsChecker, { fixRedFlags } from "@/components/RedFlagsChecker";
import { toast } from "sonner";
import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useBrandCharter } from "@/hooks/use-branding";
import { buildStoryFrameHtml, placeTextAwayFromLikelyFace, type StoryFrameBranding } from "@/lib/story-visual";
import { classerParPertinence } from "@/lib/rank-library-photos";
import { exportStoryPng } from "@/lib/export-carousel-png";
import { exportStoryPptx } from "@/lib/export-story-pptx";
import { useOpenInCanva } from "@/hooks/use-open-in-canva";
import { resolveLibraryPhotoUrls, urlToDataUrl } from "@/lib/story-photos";
import StoryPhotoSuggestions, {
  type AppliedStockPhoto,
} from "@/components/creer/formatRenderers/StoryPhotoSuggestions";
import { PhotoLibraryPickerDialog } from "@/components/photos/PhotoLibraryPickerDialog";
import { useUserPhotos } from "@/hooks/use-user-photos";
import { getSignedPhotoUrls, type UserPhotoRow } from "@/lib/photo-storage";
import StorySequenceReaderDialog from "@/components/stories/StorySequenceReaderDialog";
import StoryVisualDirectControls from "@/components/stories/StoryVisualDirectControls";

/** Photos signées d'avance, dans lesquelles chaque story pioche. */
const LIBRARY_POOL = 12;
/** Vignettes réellement montrées sous une story. */
const LIBRARY_STRIP = 4;

interface PhotoLike {
  preview?: string;
  base64?: string;
  mimeType?: string;
}

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
  photos?: PhotoLike[];
  /**
   * Quand fourni, les exports vivent dans le panneau d'actions du parent
   * (héros Canva + menu « Autres actions ») et la rangée de boutons locale
   * n'est pas rendue. null = aucune frame exportable.
   */
  onExportActionsChange?: (actions: StoryExportActions | null) => void;
}

const getTextField = (story: any): "text" | "texte" | "content" => {
  if ("text" in story) return "text";
  if ("texte" in story) return "texte";
  return "content";
};

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
  const [stories, setStories] = useState(rawStories);
  const [readerOpen, setReaderOpen] = useState(false);
  const [personalAnchor, setPersonalAnchor] = useState("");

  const rawSignature = JSON.stringify(rawStories);
  const prevSignature = useRef(rawSignature);

  useEffect(() => {
    // Une régénération peut garder le même nombre de stories. Comparer le
    // contenu, tout en gardant les éditions locales si le parent ne change rien.
    if (rawSignature !== prevSignature.current) {
      setStories(JSON.parse(rawSignature));
      prevSignature.current = rawSignature;
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

  // Photos attachées à la création (lot D) : 1 photo = fil visuel de toute la
  // séquence (comportement historique) ; 2+ photos = réparties UNE par story à
  // fond photo, dans l'ordre. Les photos venues de la bibliothèque
  // (userPhotoId) sont déjà placées par la génération (photo_id) — on ne
  // distribue que les uploads frais, sans doublonner.
  const attachedByStory = useMemo(() => {
    const itemUrl = (ph: any): string | null =>
      ph?.preview || (ph?.base64 ? `data:${ph.mimeType || "image/jpeg"};base64,${ph.base64}` : null);
    const map = new Map<number, string>();
    if (!photos?.length) return map;

    if (photos.length === 1) {
      const url = itemUrl(photos[0]);
      if (url) {
        stories.forEach((s: any, i: number) => {
          if (s?.visual?.background === "photo") map.set(i, url);
        });
      }
      return map;
    }

    const assignedLibraryIds = new Set(
      stories.map((s: any) => s?.visual?.photo_id).filter(Boolean),
    );
    const pool = photos.filter(
      (p: any) => !p.userPhotoId || !assignedLibraryIds.has(p.userPhotoId),
    );
    let k = 0;
    stories.forEach((s: any, i: number) => {
      const v = s?.visual;
      if (!v || v.background !== "photo" || v.photo_id || v.photo_url) return;
      if (k >= pool.length) return;
      const url = itemUrl(pool[k]);
      if (url) {
        map.set(i, url);
        k++;
      }
    });
    return map;
  }, [photos, stories]);

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
      if (!buildStoryFrameHtml(s, branding, { preview: false })) continue;
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
      toast.error(error instanceof Error ? error.message : "Export impossible. Réessaie.");
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
      toast.error(error instanceof Error ? error.message : "Export impossible. Réessaie.");
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

  const fixStoryExpressions = () => {
    const updated = stories.map(story => {
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
    setStories(updated);
    onStoriesUpdate?.(updated);
  };

  const ANGLE_LABELS: Record<string, { emoji: string; label: string }> = {
    coulisses: { emoji: "🎬", label: "Coulisses" },
    reflexion: { emoji: "💭", label: "Réflexion perso" },
    interpellation: { emoji: "🙋", label: "Interpellation communauté" },
    conseil_vecu: { emoji: "📖", label: "Conseil par l'expérience" },
    storytime_client: { emoji: "💬", label: "Storytime client" },
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

  const setTextPosition = (index: number, text_position: "top" | "middle" | "bottom") => {
    const updated = stories.map((story, i) => i === index
      ? { ...story, visual: {
          ...story.visual,
          text_position,
          text_position_x: null,
          text_position_y: null,
          text_position_edited: true,
          face_avoidance_applied: false,
        } } : story);
    setStories(updated);
    onStoriesUpdate?.(updated);
  };

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
      setLibraryPool([]);
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
    });
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
              PPTX éditable
            </Button>
            <Button variant="outline" size="sm" onClick={handleOpenInCanva} disabled={openingCanva} className="gap-1.5">
              {openingCanva ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Palette className="h-3.5 w-3.5" />}
              Ouvrir dans Canva
            </Button>
            </>
          )}
        </div>
      </div>

      {result?.personal_tip && stories.length > 0 && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-2" data-story-personal-anchor>
          <div className="flex items-start gap-2">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div>
              <p className="text-sm font-semibold text-foreground">Le détail qui rendra cette séquence vraiment tienne</p>
              <p className="text-xs text-muted-foreground">{result.personal_tip}</p>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1">
              <label htmlFor="story-personal-anchor" className="text-2xs font-medium text-muted-foreground">
                Ce que tu as vraiment pensé, vu ou dit
              </label>
              <Textarea
                id="story-personal-anchor"
                value={personalAnchor}
                onChange={(event) => setPersonalAnchor(event.target.value)}
                className="min-h-[64px] resize-y bg-background text-sm"
                placeholder="Ex. Là, je me suis dit : il y a un truc qui cloche."
              />
            </div>
            <Button type="button" size="sm" onClick={insertPersonalAnchor} disabled={!personalAnchor.trim()}>
              Ajouter à la story 1
            </Button>
          </div>
        </div>
      )}
      <div className="space-y-2" data-selection-enabled="true">
        {stories.map((story: any, i: number) => (
          <Card key={i} className="border-border">
            <CardContent className="p-3">
              <div className="flex flex-col gap-3 sm:flex-row">
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="secondary" className="font-mono text-2xs">
                      Story {i + 1}
                    </Badge>
                    {story.role && (
                      <Badge className="bg-primary/10 text-primary border-primary/20 text-2xs font-mono">
                        {formatSlideRole(story.role)}
                      </Badge>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2.5 text-2xs gap-1.5 font-medium border-primary/30 text-primary hover:bg-primary/10 hover:text-primary"
                      onClick={() => toggleFaceCam(i)}
                    >
                      {story.face_cam ? (
                        <>
                          <ImageIcon className="h-3.5 w-3.5" />
                          Story designée
                        </>
                      ) : (
                        <>
                          <Camera className="h-3.5 w-3.5" />
                          Me filmer
                        </>
                      )}
                    </Button>
                  </div>
                  <div className="space-y-1 pt-1">
                    <label htmlFor={`story-${i}-full-text`} className="text-2xs font-medium text-muted-foreground">
                      Texte complet de la story
                    </label>
                    <Textarea
                      id={`story-${i}-full-text`}
                      aria-label={`Texte complet de la story ${i + 1}`}
                      value={getStoryText(story)}
                      onChange={(e) => updateStoryText(i, e.target.value)}
                      className="min-h-[84px] resize-y text-sm leading-relaxed"
                      placeholder="Écris ici tout ce que tu veux dire dans cette story"
                    />
                  </div>
                  {story.sticker && (
                    <div className="space-y-1.5 rounded-lg border border-border/60 bg-muted/20 p-2">
                      <div className="flex items-center gap-1.5">
                        <Badge variant="secondary" className="text-2xs">
                          {story.sticker.type || "Sticker"}
                        </Badge>
                        <span className="text-2xs text-muted-foreground">à poser dans Instagram</span>
                      </div>
                      {Array.isArray(story.sticker.options) && story.sticker.options.length > 0 ? (
                        <div className="grid gap-1.5 sm:grid-cols-2">
                          {story.sticker.options.map((option: string, optionIndex: number) => (
                            <div key={optionIndex} className="space-y-1">
                              <label htmlFor={`story-${i}-sticker-option-${optionIndex}`} className="text-2xs text-muted-foreground">
                                Option {optionIndex + 1}
                              </label>
                              <Input
                                id={`story-${i}-sticker-option-${optionIndex}`}
                                aria-label={`Option ${optionIndex + 1} du sticker de la story ${i + 1}`}
                                value={option}
                                onChange={(e) => updateStickerText(i, optionIndex, e.target.value)}
                                className="h-7 text-xs"
                              />
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <label htmlFor={`story-${i}-sticker-label`} className="text-2xs text-muted-foreground">
                            Texte du sticker
                          </label>
                          <Input
                            id={`story-${i}-sticker-label`}
                            aria-label={`Texte du sticker de la story ${i + 1}`}
                            value={story.sticker.label || ""}
                            onChange={(e) => updateStickerText(i, null, e.target.value)}
                            className="h-7 text-xs"
                            placeholder="Texte du sticker"
                          />
                        </div>
                      )}
                    </div>
                  )}
                  {frames[i] && story.visual && (
                    <div className="space-y-1.5 pt-1">
                      <div className="flex items-center gap-1.5" role="group" aria-label="Fond de la story">
                        <span className="text-2xs text-muted-foreground">Fond :</span>
                        {([
                          ["photo", "📷 Photo"],
                          ["fond_couleur", "Couleur"],
                        ] as const).map(([value, label]) => {
                          const active = (story.visual?.background || "fond_couleur") === value;
                          return (
                            <Button
                              key={value}
                              type="button"
                              variant={active ? "secondary" : "ghost"}
                              size="sm"
                              className="h-6 px-2 text-2xs"
                              aria-pressed={active}
                              data-story-background={value}
                              onClick={() => setBackground(i, value)}
                            >
                              {label}
                            </Button>
                          );
                        })}
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap" role="group" aria-label="Emplacement du texte">
                        <span className="text-2xs text-muted-foreground">Texte :</span>
                        {([["top", "Haut"], ["middle", "Milieu"], ["bottom", "Bas"]] as const).map(([value, label]) => (
                          <Button key={value} type="button" size="sm"
                            variant={!Number.isFinite(story.visual.text_position_y) && (story.visual.text_position || "middle") === value ? "secondary" : "ghost"}
                            className="h-6 px-2 text-2xs"
                            aria-pressed={!Number.isFinite(story.visual.text_position_y) && (story.visual.text_position || "middle") === value}
                            onClick={() => setTextPosition(i, value)}>{label}</Button>
                        ))}
                      </div>
                      {story.visual.face_avoidance_applied && (
                        <p className="text-2xs text-muted-foreground">
                          Le fond semble montrer une personne : le texte a été placé en bas pour dégager le visage. Tu peux le déplacer sur l'aperçu.
                        </p>
                      )}
                      {story.visual.gabarit === "citation" ? (
                        <>
                          <div className="space-y-1">
                            <label htmlFor={`story-${i}-quote`} className="text-2xs text-muted-foreground">
                              Citation mise en avant
                            </label>
                            <Input
                              id={`story-${i}-quote`}
                              value={story.visual.quote ?? ""}
                              onChange={(e) => updateVisualPill(i, "quote", e.target.value)}
                              className="h-7 text-xs"
                              aria-label="Citation mise en avant"
                              placeholder="La citation exacte"
                            />
                          </div>
                          <div className="space-y-1">
                            <label htmlFor={`story-${i}-citation-footer`} className="text-2xs text-muted-foreground">
                              Petit texte sous la citation (optionnel)
                            </label>
                            <Input
                              id={`story-${i}-citation-footer`}
                              value={story.visual.body_pill ?? ""}
                              onChange={(e) => updateVisualPill(i, "body_pill", e.target.value)}
                              className="h-7 text-xs"
                              aria-label="Petit texte sous la citation"
                              placeholder="Ex. Avis laissé par Camille"
                            />
                          </div>
                        </>
                      ) : story.visual.gabarit === "liste" ? (
                        <>
                          {typeof story.visual.title_pill === "string" && (
                            <div className="space-y-1">
                              <label htmlFor={`story-${i}-list-title`} className="text-2xs text-muted-foreground">Titre</label>
                              <Input
                                id={`story-${i}-list-title`}
                                value={story.visual.title_pill}
                                onChange={(e) => updateVisualPill(i, "title_pill", e.target.value)}
                                className="h-7 text-xs"
                                aria-label="Titre de la liste"
                              />
                            </div>
                          )}
                          {Array.isArray(story.visual.list_pills) && story.visual.list_pills.map((item: string, itemIndex: number) => (
                            <div key={itemIndex} className="space-y-1">
                              <label htmlFor={`story-${i}-list-item-${itemIndex}`} className="text-2xs text-muted-foreground">
                                Élément {itemIndex + 1}
                              </label>
                              <Input
                                id={`story-${i}-list-item-${itemIndex}`}
                                value={item}
                                onChange={(e) => updateVisualListPill(i, itemIndex, e.target.value)}
                                className="h-7 text-xs"
                                aria-label={`Élément ${itemIndex + 1} de la liste`}
                              />
                            </div>
                          ))}
                        </>
                      ) : (
                        <>
                          {typeof story.visual.title_pill === "string" && (
                            <div className="space-y-1">
                              <label htmlFor={`story-${i}-title-pill`} className="text-2xs text-muted-foreground">Titre</label>
                              <Input
                                id={`story-${i}-title-pill`}
                                value={story.visual.title_pill}
                                onChange={(e) => updateVisualPill(i, "title_pill", e.target.value)}
                                className="h-7 text-xs"
                                aria-label="Titre affiché"
                                placeholder="Titre"
                              />
                            </div>
                          )}
                          {typeof story.visual.body_pill === "string" && (
                            <div className="space-y-1">
                              <label htmlFor={`story-${i}-body-pill`} className="text-2xs text-muted-foreground">Texte affiché</label>
                              <Textarea
                                id={`story-${i}-body-pill`}
                                value={getDisplayedBody(story)}
                                onChange={(e) => updateVisualPill(i, "body_pill", e.target.value)}
                                className="min-h-[64px] resize-y text-xs"
                                aria-label="Texte affiché"
                                placeholder="Texte affiché sur la story"
                              />
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                  {story.visual?.photo_id && libraryUrls.has(story.visual.photo_id) && !story.visual?.photo_url ? (
                    <p className="text-xs text-primary">
                      📸 Photo de ta bibliothèque
                      {story.visual.photo_library_description
                        ? ` — ${story.visual.photo_library_description}`
                        : ""}
                    </p>
                  ) : story.visual?.photo_stock_credit?.photographer ? (
                    <p className="text-xs text-muted-foreground">
                      Photo :{" "}
                      {story.visual.photo_stock_credit.source_url ? (
                        <a
                          href={story.visual.photo_stock_credit.source_url}
                          target="_blank"
                          rel="noreferrer"
                          className="underline hover:text-foreground"
                        >
                          {story.visual.photo_stock_credit.photographer}
                        </a>
                      ) : (
                        story.visual.photo_stock_credit.photographer
                      )}{" "}
                      · Pexels
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
                      autoApply={
                        !story.visual?.photo_id &&
                        !story.visual?.photo_url &&
                        !attachedByStory.has(i)
                      }
                      libraryStrip={stripPourStory(story)}
                      onApply={(photo, opts) => applyStoryPhoto(i, photo, opts)}
                      onApplyLibrary={(row) => applyLibraryPhoto(i, row)}
                      onOpenLibrary={() => setPickerFor(i)}
                    />
                  )}
                </div>
                {frames[i] && story.visual && (
                  <div className="self-center sm:self-start">
                    <StoryVisualDirectControls
                      storyIndex={i}
                      html={frames[i]!}
                      visual={story.visual}
                      photoEnabled={story.visual.background === "photo" && Boolean(getStoryPhotoUrl(story, i))}
                      onTextMove={(x, y) => moveStoryText(i, x, y)}
                      onPhotoMove={(x, y) => updateVisualViewport(i, { photo_position_x: x, photo_position_y: y })}
                      onPhotoZoom={(zoom) => updateVisualViewport(i, { photo_zoom: zoom })}
                      onReset={(mode) => resetStoryViewport(i, mode)}
                    />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

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

      <RedFlagsChecker content={fullText} onFix={fixStoryExpressions} />

      <AiGeneratedMention />
    </div>
  );
}
