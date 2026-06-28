import { useEffect, useRef, useState } from "react";
import { Loader2, Search, Upload, Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { PhotoItem } from "@/components/creer/PhotoUploadZone";
import {
  searchStockPhotos,
  stockPhotoToPhotoItem,
  type StockPhoto,
} from "@/lib/stock-photos";

export interface PhotoSwapDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Photos déjà présentes dans le carrousel — pour réassigner sans réimporter. */
  currentPhotos?: PhotoItem[];
  /** Index (1-based) de la photo actuellement sur la slide, pour la marquer. */
  currentIndex?: number;
  /** Requête de recherche par défaut (sujet du carrousel). */
  defaultQuery?: string;
  /** Photo choisie, déjà convertie en PhotoItem (prête à injecter dans le pipeline). */
  onSelect: (photo: PhotoItem) => void;
}

type Tab = "library" | "search" | "upload";

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 Mo

export default function PhotoSwapDialog({
  open,
  onOpenChange,
  currentPhotos = [],
  currentIndex,
  defaultQuery = "",
  onSelect,
}: PhotoSwapDialogProps) {
  const hasLibrary = currentPhotos.length > 0;
  const [tab, setTab] = useState<Tab>(hasLibrary ? "library" : "search");
  const [query, setQuery] = useState(defaultQuery);
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<StockPhoto[]>([]);
  const [importingId, setImportingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Reset à chaque ouverture.
  useEffect(() => {
    if (open) {
      setTab(hasLibrary ? "library" : "search");
      setQuery(defaultQuery);
      setResults([]);
      setSearching(false);
      setImportingId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const runSearch = async () => {
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    try {
      const photos = await searchStockPhotos(q, {
        perPage: 24,
        orientation: "portrait",
      });
      setResults(photos);
      if (photos.length === 0) {
        toast("Aucune photo trouvée", {
          description: "Essaie d'autres mots-clés (en anglais, ça marche souvent mieux).",
        });
      }
    } catch (e) {
      toast.error("Recherche indisponible", {
        description: e instanceof Error ? e.message : "Réessaie dans un instant.",
      });
    } finally {
      setSearching(false);
    }
  };

  const pickStock = async (p: StockPhoto) => {
    setImportingId(p.id);
    try {
      const item = await stockPhotoToPhotoItem(p);
      onSelect(item);
      onOpenChange(false);
    } catch (e) {
      toast.error("Import impossible", {
        description: e instanceof Error ? e.message : "Cette photo n'a pas pu être importée.",
      });
    } finally {
      setImportingId(null);
    }
  };

  const pickUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Format non supporté", {
        description: "Choisis un fichier image (JPG, PNG, WEBP).",
      });
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error("Image trop lourde", {
        description: "Maximum 10 Mo. Réduis la taille puis réessaie.",
      });
      return;
    }
    try {
      const dataUrl = await fileToDataUrl(file);
      const item: PhotoItem = {
        id: crypto.randomUUID(),
        base64: dataUrl,
        preview: dataUrl,
        name: file.name,
        mimeType: file.type,
        context: "",
      };
      onSelect(item);
      onOpenChange(false);
    } catch {
      toast.error("Lecture impossible", {
        description: "Cette image n'a pas pu être lue.",
      });
    }
  };

  const TabButton = ({ id, label, icon }: { id: Tab; label: string; icon: React.ReactNode }) => (
    <button
      type="button"
      onClick={() => setTab(id)}
      className={cn(
        "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium border transition-colors",
        tab === id
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-background text-foreground border-border hover:border-primary/40",
      )}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Changer la photo</DialogTitle>
          <DialogDescription>
            Réutilise une photo du carrousel, cherche une photo libre de droit, ou
            importe la tienne. Pense à mettre à jour les visuels ensuite.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-2">
          {hasLibrary && (
            <TabButton id="library" label="Photos du carrousel" icon={<Check className="h-3.5 w-3.5" />} />
          )}
          <TabButton id="search" label="Rechercher (Pexels)" icon={<Search className="h-3.5 w-3.5" />} />
          <TabButton id="upload" label="Importer" icon={<Upload className="h-3.5 w-3.5" />} />
        </div>

        {tab === "library" && (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 pt-1">
            {currentPhotos.map((p, i) => {
              const isCurrent = currentIndex === i + 1;
              return (
                <button
                  key={p.id || i}
                  type="button"
                  onClick={() => {
                    onSelect(p);
                    onOpenChange(false);
                  }}
                  className={cn(
                    "relative aspect-[3/4] rounded-lg overflow-hidden border-2 transition-all",
                    isCurrent ? "border-primary ring-2 ring-primary/30" : "border-border hover:border-primary/50",
                  )}
                  title={isCurrent ? "Photo actuelle" : `Utiliser la photo ${i + 1}`}
                >
                  <img src={p.preview} alt={p.name || `Photo ${i + 1}`} className="w-full h-full object-cover" />
                  {isCurrent && (
                    <span className="absolute bottom-1 left-1 rounded bg-primary/90 px-1.5 py-0.5 text-2xs font-medium text-primary-foreground">
                      Actuelle
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {tab === "search" && (
          <div className="space-y-3 pt-1">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                runSearch();
              }}
              className="flex gap-2"
            >
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Ex : bureau lumineux, café, nature…"
                className="text-sm"
              />
              <Button type="submit" size="sm" disabled={searching || !query.trim()}>
                {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              </Button>
            </form>

            {searching && (
              <div className="py-8 text-center text-xs text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2 text-primary" />
                Recherche en cours…
              </div>
            )}

            {!searching && results.length > 0 && (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {results.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => pickStock(p)}
                    disabled={!!importingId}
                    className="relative aspect-[3/4] rounded-lg overflow-hidden border border-border hover:border-primary/50 transition-all disabled:opacity-50"
                    title={p.alt || `Photo de ${p.photographer}`}
                  >
                    <img src={p.thumbnail} alt={p.alt || "Photo Pexels"} className="w-full h-full object-cover" />
                    {importingId === p.id && (
                      <div className="absolute inset-0 flex items-center justify-center bg-background/70">
                        <Loader2 className="h-5 w-5 animate-spin text-primary" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}

            {!searching && results.length === 0 && (
              <p className="py-6 text-center text-xs text-muted-foreground">
                Lance une recherche pour voir des photos libres de droit (Pexels).
              </p>
            )}
          </div>
        )}

        {tab === "upload" && (
          <div className="pt-1">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={pickUpload}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full rounded-xl border-2 border-dashed border-border hover:border-primary/50 transition-colors py-10 flex flex-col items-center gap-2 text-sm text-muted-foreground"
            >
              <Upload className="h-6 w-6" />
              Choisir une image (JPG, PNG, WEBP — max 10 Mo)
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
