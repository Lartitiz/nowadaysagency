/**
 * NewsPhotoPickerDialog — choisir une photo d'actualité LIBRE DE DROITS
 * (Openverse : Wikimedia Commons, Flickr CC…) pour une slide de carrousel
 * newsjacking dont l'actu mentionne une entité nommée (personnalité, marque,
 * événement). Licences déjà filtrées : CC0 / domaine public / CC BY.
 *
 * À la sélection, le parent reçoit la photo convertie en PhotoItem ET la ligne
 * de crédit à injecter dans la légende (obligatoire en CC BY).
 */

import { useEffect, useState } from "react";
import { Loader2, Search, ExternalLink } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import type { PhotoItem } from "@/components/creer/PhotoUploadZone";
import {
  searchNewsPhotos,
  newsPhotoCredit,
  newsPhotoLicenseLabel,
  newsPhotoToPhotoItem,
  type NewsPhoto,
} from "@/lib/news-photos";

export interface NewsPhotoPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Requête pré-remplie (l'entité de l'actu, ex : "Zendaya"). */
  defaultQuery?: string;
  /** Photo choisie (PhotoItem prêt) + ligne de crédit pour la légende. */
  onSelect: (photo: PhotoItem, credit: string) => void;
}

export default function NewsPhotoPickerDialog({
  open,
  onOpenChange,
  defaultQuery = "",
  onSelect,
}: NewsPhotoPickerDialogProps) {
  const [query, setQuery] = useState(defaultQuery);
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<NewsPhoto[]>([]);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  const runSearch = async (q0?: string) => {
    const q = (q0 ?? query).trim();
    if (!q) return;
    setSearching(true);
    setSearched(true);
    try {
      const photos = await searchNewsPhotos(q);
      setResults(photos);
      if (photos.length === 0) {
        toast("Aucune photo libre trouvée", {
          description: "Essaie une autre orthographe, ou le nom en anglais.",
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

  // Reset + recherche automatique sur l'entité à chaque ouverture.
  useEffect(() => {
    if (open) {
      setQuery(defaultQuery);
      setResults([]);
      setImportingId(null);
      setSearched(false);
      if (defaultQuery.trim()) runSearch(defaultQuery);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const pick = async (p: NewsPhoto) => {
    setImportingId(p.id);
    try {
      const item = await newsPhotoToPhotoItem(p);
      onSelect(item, newsPhotoCredit(p));
      onOpenChange(false);
    } catch (e) {
      toast.error("Import impossible", {
        description: e instanceof Error ? e.message : "Cette photo n'a pas pu être importée.",
      });
    } finally {
      setImportingId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Photo d'actu (libre de droits)</DialogTitle>
          <DialogDescription>
            Photos sous licence libre (CC0, domaine public, CC BY) issues de Wikimedia
            Commons, Flickr CC… Le crédit est ajouté automatiquement à ta légende.
          </DialogDescription>
        </DialogHeader>

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
            placeholder="Nom de la personnalité, marque, événement…"
            className="text-sm"
          />
          <Button type="submit" size="sm" disabled={searching || !query.trim()}>
            {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          </Button>
        </form>

        {searching && (
          <div className="py-8 text-center text-xs text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2 text-primary" />
            Recherche dans les banques libres…
          </div>
        )}

        {!searching && results.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {results.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => pick(p)}
                disabled={!!importingId}
                className="group relative rounded-lg overflow-hidden border border-border hover:border-primary/50 transition-all disabled:opacity-50 text-left"
                title={p.title || "Photo"}
              >
                <div className="aspect-[4/3] bg-muted/40">
                  <img
                    loading="lazy"
                    src={p.thumbnail}
                    alt={p.title || "Photo d'actualité"}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="p-1.5 space-y-0.5">
                  <div className="flex items-center gap-1">
                    <Badge variant="outline" className="text-2xs shrink-0">
                      {newsPhotoLicenseLabel(p)}
                    </Badge>
                    <span className="truncate text-2xs text-muted-foreground">
                      {p.creator || p.provider}
                    </span>
                  </div>
                </div>
                {importingId === p.id && (
                  <div className="absolute inset-0 flex items-center justify-center bg-background/70">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  </div>
                )}
              </button>
            ))}
          </div>
        )}

        {!searching && searched && results.length === 0 && (
          <p className="py-6 text-center text-xs text-muted-foreground">
            Aucune photo libre trouvée pour cette recherche.
          </p>
        )}

        <p className="text-2xs text-muted-foreground border-t border-border pt-2 flex items-start gap-1.5">
          <ExternalLink className="h-3 w-3 mt-0.5 shrink-0" />
          <span>
            Licence libre ≠ droit à l'image : utilise ces photos pour <strong>commenter
            l'actualité</strong>, jamais pour laisser croire qu'une personnalité soutient
            ta marque.
          </span>
        </p>
      </DialogContent>
    </Dialog>
  );
}
