/**
 * SitePhotoImportDialog — importe dans la bibliothèque les photos déjà
 * publiées sur le site web de l'utilisatrice.
 *
 * Flux : URL (pré-remplie depuis profiles.website_url) → edge site-photos-scan
 * mode "scan" (liste d'images candidates) → grille à cocher → mode "fetch"
 * image par image (le navigateur ne peut pas lire les octets cross-origin) →
 * les File repartent dans le circuit d'upload EXISTANT via onImportFiles
 * (compression, user_photos, description IA, cartes optimistes : rien à refaire).
 *
 * Tri visuel côté client : la grille AFFICHE les images distantes (l'affichage
 * cross-origin ne demande pas de CORS) et écarte silencieusement celles qui ne
 * chargent pas ou font moins de 200 px (naturalWidth lisible sans CORS).
 */

import { useEffect, useRef, useState } from "react";
import { Check, Globe, Loader2, ImageOff, AlertCircle } from "lucide-react";
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
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { invokeWithTimeout } from "@/lib/invoke-with-timeout";

interface SiteImageCandidate {
  url: string;
  alt: string | null;
}

interface SitePhotoImportDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  maxSelectable: number;
  /** Circuit d'upload de la page (useUploadLibraryPhotos.mutate + toasts). */
  onImportFiles: (files: File[]) => Promise<void>;
}

/** En dessous de 200 px réels, ce n'est pas une photo exploitable. */
const MIN_REAL_WIDTH = 200;
/** Téléchargements simultanés côté edge (petites rafales, pas de matraquage). */
const FETCH_CONCURRENCY = 3;

function fileNameFromUrl(url: string, contentType: string): string {
  let base = "photo-site";
  try {
    const segments = new URL(url).pathname.split("/").filter(Boolean);
    const last = segments[segments.length - 1];
    if (last) base = decodeURIComponent(last).replace(/\.[^.]*$/, "").slice(0, 80) || base;
  } catch {
    /* URL déjà validée côté edge, on garde le nom générique */
  }
  const ext = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
  return `${base}.${ext}`;
}

function base64ToFile(base64: string, contentType: string, name: string): File {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], name, { type: contentType });
}

export function SitePhotoImportDialog({
  open,
  onOpenChange,
  maxSelectable,
  onImportFiles,
}: SitePhotoImportDialogProps) {
  const { user } = useAuth();
  const [url, setUrl] = useState("");
  const [candidates, setCandidates] = useState<SiteImageCandidate[]>([]);
  const [hiddenUrls, setHiddenUrls] = useState<Set<string>>(new Set());
  const [selectedUrls, setSelectedUrls] = useState<string[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Pré-remplissage une seule fois par ouverture (pas d'écrasement d'une saisie).
  const prefilledFor = useRef<string | null>(null);

  useEffect(() => {
    if (!open) {
      prefilledFor.current = null;
      return;
    }
    setCandidates([]);
    setHiddenUrls(new Set());
    setSelectedUrls([]);
    setScanned(false);
    setError(null);
    if (!user?.id || prefilledFor.current === user.id) return;
    prefilledFor.current = user.id;
    void supabase
      .from("profiles")
      .select("website_url")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        // Le champ profil peut contenir du texte libre (vu en QA : une
        // description d'activité) : on ne pré-remplit que si ça ressemble
        // à une adresse (pas d'espace + au moins un point).
        const candidate = (data?.website_url ?? "").trim();
        if (candidate && !/\s/.test(candidate) && candidate.includes(".")) {
          setUrl((cur) => cur || candidate);
        }
      });
  }, [open, user?.id]);

  async function runScan() {
    const target = url.trim();
    if (!target) return;
    setScanning(true);
    setScanned(true);
    setError(null);
    setCandidates([]);
    setHiddenUrls(new Set());
    setSelectedUrls([]);
    try {
      const { data, error: invokeError } = await invokeWithTimeout(
        "site-photos-scan",
        { body: { mode: "scan", websiteUrl: target } },
        45_000,
      );
      if (invokeError || data?.error || !data?.images) {
        setError(data?.error || invokeError?.message || "L'analyse du site a échoué.");
        return;
      }
      setCandidates(data.images as SiteImageCandidate[]);
    } finally {
      setScanning(false);
    }
  }

  const visible = candidates.filter((c) => !hiddenUrls.has(c.url));
  const atMax = selectedUrls.length >= maxSelectable;

  const hide = (u: string) => {
    setHiddenUrls((cur) => new Set(cur).add(u));
    setSelectedUrls((cur) => cur.filter((x) => x !== u));
  };

  const toggle = (u: string) => {
    setSelectedUrls((cur) => {
      if (cur.includes(u)) return cur.filter((x) => x !== u);
      if (cur.length >= maxSelectable) return cur;
      return [...cur, u];
    });
  };

  async function handleImport() {
    if (selectedUrls.length === 0) return;
    setImporting(true);
    try {
      const queue = [...selectedUrls];
      const files: File[] = [];
      let failed = 0;
      const worker = async () => {
        while (queue.length > 0) {
          const imageUrl = queue.shift()!;
          const { data, error: invokeError } = await invokeWithTimeout(
            "site-photos-scan",
            { body: { mode: "fetch", imageUrl } },
            45_000,
          );
          if (invokeError || data?.error || !data?.base64) {
            failed++;
            continue;
          }
          const contentType: string = data.contentType || "image/jpeg";
          files.push(base64ToFile(data.base64, contentType, fileNameFromUrl(imageUrl, contentType)));
        }
      };
      await Promise.all(
        Array.from({ length: Math.min(FETCH_CONCURRENCY, selectedUrls.length) }, worker),
      );

      if (files.length === 0) {
        toast.error("Aucune photo n'a pu être récupérée depuis le site. Réessaie.");
        return;
      }
      if (failed > 0) {
        toast.warning(`${failed} photo${failed > 1 ? "s" : ""} n'a pas pu être récupérée.`);
      }
      onOpenChange(false);
      // L'upload continue sur la page : cartes optimistes + compte-rendu gérés là-bas.
      await onImportFiles(files);
    } finally {
      setImporting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !importing && onOpenChange(v)}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Importer depuis mon site</DialogTitle>
          <DialogDescription>
            Récupère en un clic les photos déjà publiées sur ton site. Choisis
            uniquement des images qui t'appartiennent (pas de photos de banque
            d'images sous licence).
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void runScan();
          }}
          className="flex gap-2"
        >
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Ex : www.mon-site.fr"
            inputMode="url"
            autoFocus
            // min-w-0 : sans lui, une valeur longue empêche l'input de rétrécir
            // et pousse le bouton hors de l'écran sur mobile (vu en QA).
            className="min-w-0 flex-1"
          />
          <Button type="submit" aria-label="Analyser" disabled={scanning || !url.trim()}>
            {scanning ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Globe className="h-4 w-4" />
            )}
            <span className="ml-1.5 hidden sm:inline">Analyser</span>
          </Button>
        </form>

        <div className="min-h-[220px] max-h-[55vh] overflow-y-auto">
          {scanning ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Lecture du site…
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-12 text-center gap-2 text-muted-foreground">
              <AlertCircle className="h-8 w-8 text-destructive/70" />
              <p className="text-sm max-w-sm">{error}</p>
            </div>
          ) : visible.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center gap-2 text-muted-foreground">
              <ImageOff className="h-8 w-8" />
              <p className="text-sm max-w-sm">
                {scanned
                  ? "Aucune photo exploitable trouvée sur cette page."
                  : "Entre l'adresse de ton site puis lance l'analyse."}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 p-1">
              {visible.map((c) => {
                const selected = selectedUrls.includes(c.url);
                const disabled = atMax && !selected;
                return (
                  <button
                    key={c.url}
                    type="button"
                    onClick={() => toggle(c.url)}
                    disabled={disabled}
                    title={c.alt ?? undefined}
                    className={cn(
                      "group relative aspect-square overflow-hidden rounded-lg border bg-secondary transition",
                      selected
                        ? "ring-2 ring-primary border-primary"
                        : "border-border hover:border-primary/40",
                      disabled && "opacity-40 cursor-not-allowed",
                    )}
                  >
                    <img
                      src={c.url}
                      alt={c.alt ?? ""}
                      className="h-full w-full object-cover"
                      loading="lazy"
                      // Le vrai tri se fait ici : image morte ou trop petite → retirée.
                      onError={() => hide(c.url)}
                      onLoad={(e) => {
                        if (e.currentTarget.naturalWidth < MIN_REAL_WIDTH) hide(c.url);
                      }}
                    />
                    {selected && (
                      <div className="absolute top-1.5 right-1.5 h-5 w-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow">
                        <Check className="h-3 w-3" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Libellé court et dynamique : « Ajouter à ma bibliothèque » rendait la
            rangée de boutons (insécables) plus large que l'écran mobile — le
            pied imposait alors sa largeur à tout le dialogue (grille min-content). */}
        <DialogFooter className="items-center gap-2 sm:justify-between">
          <p className="text-xs text-muted-foreground">
            {selectedUrls.length} / {maxSelectable} sélectionnée
            {selectedUrls.length > 1 ? "s" : ""}
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={importing}>
              Annuler
            </Button>
            <Button onClick={handleImport} disabled={selectedUrls.length === 0 || importing}>
              {importing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                  Récupération…
                </>
              ) : selectedUrls.length === 0 ? (
                "Ajouter"
              ) : (
                `Ajouter ${selectedUrls.length} photo${selectedUrls.length > 1 ? "s" : ""}`
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
