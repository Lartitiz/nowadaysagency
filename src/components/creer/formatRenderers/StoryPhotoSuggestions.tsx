/**
 * StoryPhotoSuggestions — le fond d'une story sans photo (lot C).
 *
 * Pour une story en background photo qui n'a reçu NI photo de bibliothèque
 * (lot B) ni photo attachée : recherche Pexels avec la photo_query_en émise
 * par le brief, classement en vision par l'IA (mode pick_stock), et
 * PRÉ-APPLICATION de la meilleure — une story ne reste jamais vide (décision
 * produit 08/07/2026). L'utilisatrice peut changer de vignette, uploader la
 * sienne (versée à la bibliothèque au passage), ou envoyer la directive dans
 * « Photos à prendre ».
 *
 * Chargement DIFFÉRÉ : ne bloque jamais l'affichage de la séquence ; les
 * requêtes sont étalées (stagger par index) pour ménager le rate-limit.
 */

import { useEffect, useRef, useState } from "react";
import { Camera, Check, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { searchStockPhotos, type StockPhoto } from "@/lib/stock-photos";
import { fileToResizedDataUrl } from "@/lib/story-photos";
import { invokeWithTimeout } from "@/lib/invoke-with-timeout";
import { uploadPhotoOriginal } from "@/lib/photo-storage";
import { usePhotoWishlistMutations } from "@/hooks/use-photo-wishlist";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspaceId } from "@/hooks/use-workspace-query";

export interface AppliedStockPhoto {
  url: string;
  credit: { photographer?: string | null; source_url?: string | null } | null;
}

interface Props {
  storyIndex: number;
  directive: string | null;
  queryEn: string | null;
  /** URL actuellement appliquée à la story (pour marquer la vignette active). */
  appliedUrl: string | null;
  /** true si la story n'a aucune photo → on pré-applique la meilleure candidate. */
  autoApply: boolean;
  onApply: (photo: AppliedStockPhoto) => void;
}

const VISIBLE = 4;
const EXPANDED = 8;

export default function StoryPhotoSuggestions({
  storyIndex,
  directive,
  queryEn,
  appliedUrl,
  autoApply,
  onApply,
}: Props) {
  const { user } = useAuth();
  const workspaceId = useWorkspaceId();
  const { addDirective } = usePhotoWishlistMutations();
  const [suggestions, setSuggestions] = useState<StockPhoto[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [wishlisted, setWishlisted] = useState(false);
  const [wishlistBusy, setWishlistBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const started = useRef(false);
  const autoApplied = useRef(false);

  const query = (queryEn || directive || "").trim();

  useEffect(() => {
    if (!query || started.current) return;
    started.current = true;
    let cancelled = false;

    (async () => {
      // Stagger : les stories chargent leurs suggestions l'une après l'autre
      await new Promise((r) => setTimeout(r, storyIndex * 700));
      if (cancelled) return;
      try {
        const results = await searchStockPhotos(query, {
          perPage: EXPANDED,
          orientation: "portrait",
          locale: "en-US",
        });
        if (cancelled) return;
        if (!results.length) {
          setFailed(true);
          return;
        }

        let ordered = results;
        if (results.length >= 2 && directive) {
          // Classement vision — best-effort : en cas d'échec on garde l'ordre Pexels
          const { data, error } = await invokeWithTimeout(
            "photo-describe",
            {
              body: {
                mode: "pick_stock",
                workspace_id: workspaceId || undefined,
                directive,
                candidates: results.slice(0, EXPANDED).map((r) => ({ id: r.id, url: r.thumbnail })),
              },
            },
            45_000,
          );
          const ranked: string[] = Array.isArray(data?.ranked_ids) ? data.ranked_ids : [];
          if (!error && ranked.length > 0) {
            const byId = new Map(results.map((r) => [r.id, r]));
            const top = ranked.map((id) => byId.get(id)).filter(Boolean) as StockPhoto[];
            const rest = results.filter((r) => !ranked.includes(r.id));
            ordered = [...top, ...rest];
          } else if (error) {
            console.warn("[pick_stock]", error.message);
          }
        }
        if (cancelled) return;
        setSuggestions(ordered);

        if (autoApply && !autoApplied.current && ordered[0]) {
          autoApplied.current = true;
          onApply({
            url: ordered[0].url,
            credit: {
              photographer: ordered[0].photographer,
              source_url: ordered[0].source_url,
            },
          });
        }
      } catch (e) {
        console.warn("[StoryPhotoSuggestions]", e);
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  async function handleOwnPhoto(file: File | null | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Le fichier doit être une image.");
      return;
    }
    try {
      const dataUrl = await fileToResizedDataUrl(file);
      onApply({ url: dataUrl, credit: null });
      // Croissance de la bibliothèque par l'usage : la photo y est versée en
      // arrière-plan (description IA comprise), sans bloquer la story.
      if (user?.id && workspaceId && workspaceId !== user.id) {
        uploadPhotoOriginal({ file, userId: user.id, workspaceId, purpose: "library" })
          .then(({ photoId }) =>
            invokeWithTimeout(
              "photo-describe",
              { body: { mode: "describe", photo_id: photoId, workspace_id: workspaceId } },
              60_000,
            ),
          )
          .then((r) => {
            if (r && "error" in r && r.error) console.warn("[photo-describe]", r.error.message);
          })
          .catch((e) => console.warn("[bibliothèque]", e));
      }
    } catch (e: any) {
      toast.error(e?.message || "Impossible de lire cette image");
    }
  }

  async function handleWishlist() {
    if (!directive || wishlisted) return;
    setWishlistBusy(true);
    try {
      await addDirective(directive);
      setWishlisted(true);
      toast.success("Ajouté à « Photos à prendre »");
    } catch (e: any) {
      toast.error(e?.message || "Ajout impossible");
    } finally {
      setWishlistBusy(false);
    }
  }

  if (!query) return null;

  const shown = suggestions ? suggestions.slice(0, expanded ? EXPANDED : VISIBLE) : [];

  return (
    <div className="pt-1.5 space-y-1.5">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-2xs font-medium text-muted-foreground uppercase tracking-wide">
          Le fond de cette story
        </span>
        {!suggestions && !failed && (
          <span className="inline-flex items-center gap-1 text-2xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> recherche de photos…
          </span>
        )}
      </div>

      {shown.length > 0 && (
        <div className="flex items-start gap-1.5 flex-wrap">
          {shown.map((p) => {
            const isApplied = appliedUrl === p.url;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() =>
                  onApply({
                    url: p.url,
                    credit: { photographer: p.photographer, source_url: p.source_url },
                  })
                }
                className={cn(
                  "relative w-11 rounded-md overflow-hidden border transition-all",
                  isApplied
                    ? "border-primary ring-2 ring-primary/40"
                    : "border-border hover:border-primary/50",
                )}
                style={{ aspectRatio: "9 / 16" }}
                aria-label={`Utiliser la photo de ${p.photographer}`}
                title={`${p.alt || "Photo"} — ${p.photographer} · Pexels`}
              >
                <img
                  src={p.thumbnail}
                  alt={p.alt || `Photo de ${p.photographer}`}
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
                {isApplied && (
                  <span className="absolute top-0.5 right-0.5 h-3.5 w-3.5 rounded-full bg-primary flex items-center justify-center">
                    <Check className="h-2.5 w-2.5 text-primary-foreground" />
                  </span>
                )}
              </button>
            );
          })}
          {suggestions && suggestions.length > VISIBLE && !expanded && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="w-11 rounded-md border border-dashed border-border text-2xs text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors"
              style={{ aspectRatio: "9 / 16" }}
            >
              voir
              <br />
              plus
            </button>
          )}
        </div>
      )}

      <div className="flex items-center gap-1.5 flex-wrap">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-2xs text-foreground hover:bg-muted transition-colors"
        >
          <Upload className="h-3 w-3" /> Ma photo
        </button>
        {directive && (
          <button
            type="button"
            onClick={handleWishlist}
            disabled={wishlistBusy || wishlisted}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-2xs transition-colors",
              wishlisted
                ? "border-success/40 text-success"
                : "border-warning/40 text-warning hover:bg-warning-bg",
            )}
          >
            {wishlistBusy ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : wishlisted ? (
              <Check className="h-3 w-3" />
            ) : (
              <Camera className="h-3 w-3" />
            )}
            {wishlisted ? "Dans ta liste" : "À prendre plus tard"}
          </button>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          handleOwnPhoto(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </div>
  );
}
