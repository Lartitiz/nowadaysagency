/**
 * StockPhotoPickerDialog — recherche et sélection de photos libres de droit
 * (Pexels) à injecter dans PhotoUploadZone comme si elles avaient été uploadées.
 *
 * Deux usages :
 *  - manuel : l'utilisatrice tape une requête et choisit ses photos ;
 *  - assisté : le parent passe `initialQuery` (sujet / description déjà saisis) →
 *    une première recherche se lance à l'ouverture pour proposer tout de suite des
 *    images en lien avec le contenu.
 *
 * La répartition « la bonne photo au bon endroit » est ensuite gérée par
 * carousel-ai, qui voit les photos en vision et assigne leur photo_index.
 */

import { useEffect, useRef, useState } from "react";
import { Check, Search, Loader2, ImageOff, Sparkles, AlertCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  searchStockPhotos,
  suggestStockKeywords,
  stockPhotoToPhotoItem,
  type StockPhoto,
  type StockKeywordContext,
} from "@/lib/stock-photos";
import type { PhotoItem } from "@/components/creer/PhotoUploadZone";

interface StockPhotoPickerDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  maxSelectable: number;
  onConfirm: (photos: PhotoItem[]) => void;
  /** Requête pré-remplie (sujet / description) — lance une recherche à l'ouverture. */
  initialQuery?: string;
  /**
   * Contexte du contenu à venir (sujet + angle + format du carrousel). Si fourni,
   * l'IA propose des mots-clés visuels pertinents et lance la 1re recherche avec.
   * Best-effort : en cas d'échec, on retombe sur `initialQuery`.
   */
  aiContext?: StockKeywordContext;
}

export function StockPhotoPickerDialog({
  open,
  onOpenChange,
  maxSelectable,
  onConfirm,
  initialQuery,
  aiContext,
}: StockPhotoPickerDialogProps) {
  const [query, setQuery] = useState(initialQuery ?? "");
  const [results, setResults] = useState<StockPhoto[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [searching, setSearching] = useState(false);
  const [importing, setImporting] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Mots-clés visuels proposés par l'IA (chips cliquables).
  const [aiKeywords, setAiKeywords] = useState<string[]>([]);
  const [suggesting, setSuggesting] = useState(false);
  // Évite une double recherche auto en mode React StrictMode (double effet).
  const autoSearchedFor = useRef<string | null>(null);

  // locale: pour les mots-clés IA (anglais) on cible Pexels en en-US ; pour une
  // requête tapée à la main on reste en fr-FR (défaut côté edge function).
  async function runSearch(q: string, locale?: string) {
    const term = q.trim();
    if (!term) return;
    setSearching(true);
    setSearched(true);
    setError(null);
    try {
      const photos = await searchStockPhotos(term, {
        perPage: 24,
        orientation: "portrait",
        ...(locale ? { locale } : {}),
      });
      setResults(photos);
      setSelectedIds([]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "La recherche a échoué.";
      toast.error(msg);
      setError(msg);
      setResults([]);
    } finally {
      setSearching(false);
    }
  }

  // Reset à chaque ouverture. Si un contexte IA est fourni → suggestions de
  // mots-clés + recherche auto. Sinon, recherche auto sur la requête initiale.
  useEffect(() => {
    if (!open) {
      autoSearchedFor.current = null;
      return;
    }
    const seed = (initialQuery ?? "").trim();
    const aiSubject = aiContext?.subject?.trim() || "";
    setSelectedIds([]);
    setQuery(initialQuery ?? "");
    setResults([]);
    setSearched(false);
    setError(null);
    setAiKeywords([]);

    const signature = aiSubject ? `ai:${aiSubject}` : seed;
    if (!signature || autoSearchedFor.current === signature) return;
    autoSearchedFor.current = signature;

    if (aiSubject) {
      setSuggesting(true);
      void (async () => {
        try {
          const { primary, keywords } = await suggestStockKeywords(aiContext!);
          if (keywords.length) setAiKeywords(keywords);
          const first = primary || keywords[0];
          if (first) {
            setQuery(first);
            await runSearch(first, "en-US");
            return;
          }
          // Pas de mots-clés exploitables → repli sur le sujet brut.
          if (seed) await runSearch(seed);
        } catch (e) {
          console.warn("[stock-keywords] échec, repli sur le sujet brut", e);
          if (seed) await runSearch(seed);
        } finally {
          setSuggesting(false);
        }
      })();
    } else if (seed) {
      void runSearch(seed);
    }
  }, [open, initialQuery, aiContext?.subject]);

  const atMax = selectedIds.length >= maxSelectable;

  const toggle = (id: string) => {
    setSelectedIds((cur) => {
      if (cur.includes(id)) return cur.filter((x) => x !== id);
      if (cur.length >= maxSelectable) return cur;
      return [...cur, id];
    });
  };

  const handleConfirm = async () => {
    const chosen = results.filter((p) => selectedIds.includes(p.id));
    if (chosen.length === 0) return;
    setImporting(true);
    try {
      const settled = await Promise.allSettled(
        chosen.map((p) => stockPhotoToPhotoItem(p)),
      );
      const items: PhotoItem[] = [];
      settled.forEach((s, i) => {
        if (s.status === "fulfilled") items.push(s.value);
        else console.warn("[stock-import] failed", chosen[i].id, s.reason);
      });
      if (items.length === 0) {
        toast.error("Impossible d'importer ces photos. Réessaie.");
        return;
      }
      if (items.length < chosen.length) {
        toast.warning(`${items.length}/${chosen.length} photo(s) importée(s).`);
      }
      onConfirm(items);
      onOpenChange(false);
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Photos libres de droit</DialogTitle>
          <DialogDescription>
            Cherche des photos libres de droit et ajoute-les comme si tu les avais
            uploadées. Jusqu'à {maxSelectable} photo{maxSelectable > 1 ? "s" : ""}.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void runSearch(query);
          }}
          className="flex gap-2"
        >
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ex : atelier céramique, lumière naturelle"
            autoFocus
          />
          <Button type="submit" disabled={searching || !query.trim()}>
            {searching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            <span className="ml-1.5 hidden sm:inline">Rechercher</span>
          </Button>
        </form>

        {/* Mots-clés visuels proposés par l'IA d'après le contenu du carrousel */}
        {(suggesting || aiKeywords.length > 0) && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              {suggesting ? "L'IA cherche des pistes…" : "Suggestions IA"}
            </span>
            {aiKeywords.map((kw) => {
              const active = query.trim().toLowerCase() === kw.toLowerCase();
              return (
                <button
                  key={kw}
                  type="button"
                  disabled={searching}
                  onClick={() => {
                    setQuery(kw);
                    void runSearch(kw, "en-US");
                  }}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs transition",
                    active
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-primary",
                  )}
                >
                  {kw}
                </button>
              );
            })}
          </div>
        )}

        <div className="min-h-[220px] max-h-[55vh] overflow-y-auto">
          {searching ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Recherche…
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-12 text-center gap-2 text-muted-foreground">
              <AlertCircle className="h-8 w-8 text-destructive/70" />
              <p className="text-sm max-w-sm">{error}</p>
            </div>
          ) : results.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center gap-2 text-muted-foreground">
              <ImageOff className="h-8 w-8" />
              <p className="text-sm">
                {searched
                  ? "Aucun résultat. Essaie d'autres mots-clés."
                  : "Lance une recherche pour voir des suggestions."}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 p-1">
              {results.map((p) => {
                const selected = selectedIds.includes(p.id);
                const disabled = atMax && !selected;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => toggle(p.id)}
                    disabled={disabled}
                    title={p.photographer ? `© ${p.photographer} / Pexels` : "Pexels"}
                    className={cn(
                      "group relative aspect-[3/4] overflow-hidden rounded-lg border transition",
                      selected
                        ? "ring-2 ring-primary border-primary"
                        : "border-border hover:border-primary/40",
                      disabled && "opacity-40 cursor-not-allowed",
                    )}
                    style={{ backgroundColor: p.avg_color }}
                  >
                    <img
                      src={p.thumbnail}
                      alt={p.alt}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                    {selected && (
                      <div className="absolute top-1.5 right-1.5 h-5 w-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow">
                        <Check className="h-3 w-3" />
                      </div>
                    )}
                    {p.photographer && (
                      <span className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent px-1.5 py-1 text-2xs text-white/90 truncate opacity-0 group-hover:opacity-100 transition">
                        © {p.photographer}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter className="flex sm:justify-between items-center gap-2">
          <p className="text-xs text-muted-foreground">
            {selectedIds.length} / {maxSelectable} sélectionnée
            {selectedIds.length > 1 ? "s" : ""} · via{" "}
            <a
              href="https://www.pexels.com"
              target="_blank"
              rel="noreferrer"
              className="hover:underline"
            >
              Pexels
            </a>
          </p>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={importing}
            >
              Annuler
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={selectedIds.length === 0 || importing}
            >
              {importing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                  Import…
                </>
              ) : (
                "Utiliser ces photos"
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
