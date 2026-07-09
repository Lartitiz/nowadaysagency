import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Download, FileDown, Loader2, Palette } from "lucide-react";
import { formatSlideRole } from "@/lib/slide-roles";
import AiGeneratedMention from "@/components/AiGeneratedMention";
import RedFlagsChecker from "@/components/RedFlagsChecker";
import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useBrandCharter } from "@/hooks/use-branding";
import { buildStoryFrameHtml, type StoryFrameBranding } from "@/lib/story-visual";
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

interface PhotoLike {
  preview?: string;
  base64?: string;
  mimeType?: string;
}

interface Props {
  result: any;
  onStoriesUpdate?: (stories: any[]) => void;
  photos?: PhotoLike[];
}

const PREVIEW_W = 150;

/** Aperçu d'une frame : le HTML 1080×1920 du renderer, mis à l'échelle dans une iframe. */
function StoryFramePreview({ html, title }: { html: string; title: string }) {
  return (
    <div
      className="relative overflow-hidden rounded-lg border border-border shrink-0"
      style={{ width: PREVIEW_W, aspectRatio: "1080 / 1920" }}
    >
      <iframe
        srcDoc={html}
        title={title}
        sandbox="allow-same-origin"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "1080px",
          height: "1920px",
          transform: `scale(${PREVIEW_W / 1080})`,
          transformOrigin: "top left",
          border: "none",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}

export default function StoryResult({ result, onStoriesUpdate, photos }: Props) {
  const rawStories: any[] = result?.stories || result?.sequences || result?.slides || [];
  const [stories, setStories] = useState(rawStories);

  const prevSignature = useRef(JSON.stringify(rawStories.map((_: any, i: number) => i)));

  useEffect(() => {
    const newSig = JSON.stringify(rawStories.map((_: any, i: number) => i));
    if (newSig !== prevSignature.current) {
      setStories(rawStories);
      prevSignature.current = newSig;
    }
  }, [result]);

  const { data: charter } = useBrandCharter();
  const branding: StoryFrameBranding | null = charter
    ? {
        color_primary: charter.color_primary,
        color_secondary: charter.color_secondary,
        color_background: charter.color_background,
        color_text: charter.color_text,
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
    });
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
    for (let i = 0; i < stories.length; i++) {
      const s = stories[i];
      const rawUrl = getStoryPhotoUrl(s, i);
      const exportUrl = rawUrl ? await urlToDataUrl(rawUrl) : null;
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
    } finally {
      setExportingPptx(false);
    }
  }, [buildExportFrames, result?.structure_type]);

  const handleOpenInCanva = useCallback(() => {
    openInCanva(
      async () =>
        (await exportStoryPptx(await buildExportFrames(), { returnBlob: true })) as Blob,
      `Stories — ${result?.structure_label || result?.structure_type || "séquence"}`,
    );
  }, [openInCanva, buildExportFrames, result?.structure_label, result?.structure_type]);

  const fullText = stories
    .map((s: any) => s.text || s.texte || s.content || "")
    .filter(Boolean)
    .join("\n\n");

  const [checkedText, setCheckedText] = useState(fullText);

  useEffect(() => {
    setCheckedText(fullText);
  }, [fullText]);

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

  const getTextField = (story: any): "text" | "texte" | "content" => {
    if ("text" in story) return "text";
    if ("texte" in story) return "texte";
    return "content";
  };

  const updateStoryText = useCallback((index: number, newValue: string) => {
    setStories(prev => {
      const updated = [...prev];
      const field = getTextField(updated[index]);
      updated[index] = { ...updated[index], [field]: newValue };
      onStoriesUpdate?.(updated);
      return updated;
    });
  }, [onStoriesUpdate]);

  const updateVisualPill = useCallback((index: number, field: "title_pill" | "body_pill", newValue: string) => {
    setStories(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], visual: { ...updated[index].visual, [field]: newValue } };
      onStoriesUpdate?.(updated);
      return updated;
    });
  }, [onStoriesUpdate]);

  // Fond choisi après génération (stock Pexels ou « Ma photo ») : URL stable
  // (https Pexels ou data:) + crédit — persistés dans le JSON de la séquence.
  const applyStoryPhoto = useCallback(
    (index: number, photo: AppliedStockPhoto) => {
      setStories((prev) => {
        const updated = [...prev];
        updated[index] = {
          ...updated[index],
          visual: {
            ...updated[index].visual,
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
        updated[index] = {
          ...updated[index],
          visual: {
            ...updated[index].visual,
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

  // Vignettes bibliothèque de la rangée par story (les 4 plus récentes) —
  // signées UNE fois ici, partagées par toutes les rangées.
  const { data: libRows = [] } = useUserPhotos();
  const [libraryStrip, setLibraryStrip] = useState<{ row: UserPhotoRow; url: string }[]>([]);
  useEffect(() => {
    const ready = libRows.filter((p) => p.status === "ready" && p.storage_path).slice(0, 4);
    if (ready.length === 0) {
      setLibraryStrip([]);
      return;
    }
    let cancelled = false;
    getSignedPhotoUrls(ready.map((r) => r.storage_path)).then((map) => {
      if (cancelled) return;
      setLibraryStrip(
        ready
          .map((row) => ({ row, url: map.get(row.storage_path) || "" }))
          .filter((x) => x.url),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [libRows]);

  // Picker « toute la bibliothèque » : un seul dialog, ciblé sur une story.
  const [pickerFor, setPickerFor] = useState<number | null>(null);

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between gap-2 px-1 flex-wrap">
        <div className="flex items-center gap-2">
          {angleInfo && (
            <Badge variant="outline" className="text-xs font-medium bg-primary/5 border-primary/20 text-primary">
              {angleInfo.emoji} {angleInfo.label}
            </Badge>
          )}
          {result?.structure_label && (
            <span className="text-xs text-muted-foreground">{result.structure_label}</span>
          )}
        </div>
        {hasFrames && (
          <div className="flex items-center gap-1.5 flex-wrap">
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
          </div>
        )}
      </div>
      <div className="space-y-2" data-selection-enabled="true">
        {stories.map((story: any, i: number) => (
          <Card key={i} className="border-border">
            <CardContent className="p-3">
              <div className="flex gap-3">
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="secondary" className="font-mono text-2xs">
                      Story {i + 1}
                    </Badge>
                    {story.timing && (
                      <Badge variant="outline" className="font-mono text-2xs">{story.timing}</Badge>
                    )}
                    {story.role && (
                      <Badge className="bg-primary/10 text-primary border-primary/20 text-2xs font-mono">
                        {formatSlideRole(story.role)}
                      </Badge>
                    )}
                    {story.format && (
                      <Badge variant="outline" className="text-2xs">{story.format}</Badge>
                    )}
                  </div>
                  {(story.text || story.texte || story.content) && (
                    <div
                      contentEditable
                      suppressContentEditableWarning
                      onBlur={(e) => {
                        const newText = e.currentTarget.textContent || "";
                        const oldText = story.text || story.texte || story.content || "";
                        if (newText !== oldText) {
                          updateStoryText(i, newText);
                        }
                      }}
                      className="text-sm text-foreground leading-relaxed whitespace-pre-wrap rounded px-1 -mx-1 transition-colors hover:bg-muted/50 focus:bg-muted/50 focus:outline-none focus:ring-1 focus:ring-primary/30 cursor-text"
                    >
                      {story.text || story.texte || story.content}
                    </div>
                  )}
                  {story.sticker && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Badge variant="secondary" className="text-2xs">
                        {story.sticker.type || "Sticker"}
                      </Badge>
                      {Array.isArray(story.sticker.options) && story.sticker.options.length > 0 ? (
                        <span className="text-xs text-muted-foreground">
                          {story.sticker.options.join(" · ")} — à poser dans Instagram
                        </span>
                      ) : story.sticker.label ? (
                        <span className="text-xs text-muted-foreground">{story.sticker.label}</span>
                      ) : null}
                    </div>
                  )}
                  {frames[i] && story.visual && (
                    <div className="space-y-1.5 pt-1">
                      {typeof story.visual.title_pill === "string" && (
                        <Input
                          value={story.visual.title_pill}
                          onChange={(e) => updateVisualPill(i, "title_pill", e.target.value)}
                          className="h-7 text-xs"
                          aria-label="Pastille titre"
                          placeholder="Pastille titre"
                        />
                      )}
                      {typeof story.visual.body_pill === "string" && (
                        <Input
                          value={story.visual.body_pill}
                          onChange={(e) => updateVisualPill(i, "body_pill", e.target.value)}
                          className="h-7 text-xs"
                          aria-label="Pastille texte"
                          placeholder="Pastille texte"
                        />
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
                      autoApply={!getStoryPhotoUrl(story, i)}
                      libraryStrip={libraryStrip}
                      onApply={(photo) => applyStoryPhoto(i, photo)}
                      onApplyLibrary={(row) => applyLibraryPhoto(i, row)}
                      onOpenLibrary={() => setPickerFor(i)}
                    />
                  )}
                </div>
                {frames[i] && <StoryFramePreview html={frames[i]!} title={`Aperçu story ${i + 1}`} />}
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

      <RedFlagsChecker content={checkedText} onFix={setCheckedText} />

      <AiGeneratedMention />
    </div>
  );
}
