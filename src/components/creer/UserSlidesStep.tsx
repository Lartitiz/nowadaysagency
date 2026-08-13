// Écran de saisie du mode carrousel « Mes slides » : l'utilisatrice fournit son
// texte slide par slide, l'IA ne fait QUE le design. Aucune génération de texte
// ici : le contenu part VERBATIM vers la mise en page (gabarits + rendu).
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PhotoUploadZone, type PhotoItem } from "./PhotoUploadZone";
import { parseSlidesFromText } from "@/lib/user-slides-parse";
import { toast } from "sonner";
import { ArrowLeft, ArrowUp, ArrowDown, Trash2, Plus, Scissors, Sparkles, Loader2 } from "lucide-react";

export const USER_SLIDES_MIN = 2;
export const USER_SLIDES_MAX = 20;

export interface UserSlideDraft {
  id: string;
  /** Titre court optionnel (verbatim). */
  title: string;
  /** Texte de la slide (verbatim, jamais réécrit). */
  body: string;
  /** Photo associée (index 1-based dans la liste des photos) ou null. */
  photoIndex: number | null;
}

interface Props {
  initialPhotos?: PhotoItem[];
  /** Brouillon précédent (retour depuis l'écran résultat) — rien n'est perdu. */
  initialSlides?: UserSlideDraft[];
  initialCaption?: string;
  generating?: boolean;
  onBack: () => void;
  onGenerate: (payload: { slides: UserSlideDraft[]; photos: PhotoItem[]; caption: string }) => void;
}

const newId = () =>
  (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `s_${Date.now()}_${Math.random()}`);

const emptySlide = (): UserSlideDraft => ({ id: newId(), title: "", body: "", photoIndex: null });

const wordCount = (s: string) => (s || "").trim().split(/\s+/).filter(Boolean).length;

export default function UserSlidesStep({ initialPhotos, initialSlides, initialCaption, generating = false, onBack, onGenerate }: Props) {
  const [pasteText, setPasteText] = useState("");
  const [slides, setSlides] = useState<UserSlideDraft[]>(initialSlides || []);
  const [photos, setPhotos] = useState<PhotoItem[]>(initialPhotos || []);
  const [caption, setCaption] = useState(initialCaption || "");

  const hasSlides = slides.length > 0;

  const handleSplit = () => {
    const blocks = parseSlidesFromText(pasteText);
    if (blocks.length === 0) {
      toast.error("Colle d'abord ton texte : une ligne vide (ou « Slide 2 : ») sépare chaque slide.");
      return;
    }
    if (blocks.length > USER_SLIDES_MAX) {
      toast.error(`Maximum ${USER_SLIDES_MAX} slides — ton texte en contient ${blocks.length}. Regroupe quelques blocs.`);
      return;
    }
    setSlides(blocks.map((b) => ({ id: newId(), title: b.title, body: b.body, photoIndex: null })));
    if (blocks.length === 1) {
      toast("Une seule slide détectée : sépare tes slides par une ligne vide, puis ajuste ci-dessous.");
    }
  };

  const updateSlide = (id: string, patch: Partial<UserSlideDraft>) => {
    setSlides((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };

  const moveSlide = (index: number, delta: -1 | 1) => {
    setSlides((prev) => {
      const target = index + delta;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const removeSlide = (id: string) => setSlides((prev) => prev.filter((s) => s.id !== id));

  const addSlide = () => {
    if (slides.length >= USER_SLIDES_MAX) {
      toast.error(`Maximum ${USER_SLIDES_MAX} slides.`);
      return;
    }
    setSlides((prev) => [...prev, emptySlide()]);
  };

  // Photos retirées → on déréférence les index devenus invalides.
  const handlePhotosChange = (next: PhotoItem[]) => {
    setPhotos(next);
    setSlides((prev) =>
      prev.map((s) => (s.photoIndex && s.photoIndex > next.length ? { ...s, photoIndex: null } : s)),
    );
  };

  const filledSlides = useMemo(() => slides.filter((s) => s.body.trim() || s.title.trim()), [slides]);
  const canGenerate = filledSlides.length >= USER_SLIDES_MIN && filledSlides.length <= USER_SLIDES_MAX && !generating;

  const handleGenerate = () => {
    if (filledSlides.length < USER_SLIDES_MIN) {
      toast.error(`Il faut au moins ${USER_SLIDES_MIN} slides avec du texte.`);
      return;
    }
    onGenerate({ slides: filledSlides, photos, caption });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-foreground">Tes slides, ton texte ✍️</h2>
        <p className="text-sm text-muted-foreground">
          Colle ton texte tel quel : il ne sera <strong className="text-foreground">jamais réécrit</strong>.
          L'IA s'occupe uniquement du design.
        </p>
      </div>

      {/* Zone de collage (affichée tant que rien n'est découpé, puis repliable) */}
      {!hasSlides ? (
        <div className="space-y-3">
          <Textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            rows={12}
            placeholder={"Colle tout ton texte ici.\n\nUne ligne vide sépare chaque slide.\nTu peux aussi écrire « Slide 1 : », « 2. » ou « 3/ » en début de bloc."}
            className="text-sm"
          />
          <div className="flex flex-col sm:flex-row gap-2">
            <Button onClick={handleSplit} className="gap-2" disabled={!pasteText.trim()}>
              <Scissors className="h-4 w-4" /> Découper en slides
            </Button>
            <Button
              variant="outline"
              onClick={() => setSlides([emptySlide(), emptySlide()])}
              className="gap-2"
            >
              <Plus className="h-4 w-4" /> Partir de slides vides
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setSlides([])}
          className="text-xs text-muted-foreground hover:text-primary transition-colors underline underline-offset-2"
        >
          ← Recoller un texte (remplace les slides ci-dessous)
        </button>
      )}

      {hasSlides && (
        <>
          {/* Photos optionnelles, associables slide par slide */}
          <div className="space-y-2">
            <p className="text-sm font-semibold text-foreground">Tes photos (optionnel)</p>
            <p className="text-xs text-muted-foreground">
              Ajoute des photos puis associe-les aux slides de ton choix — une même photo peut servir plusieurs fois.
              Les slides sans photo seront designées en slides texte.
            </p>
            <PhotoUploadZone
              maxPhotos={10}
              initialPhotos={photos}
              onPhotosChange={handlePhotosChange}
              onDescriptionChange={() => {}}
              hideDescription
              compact={photos.length > 0}
            />
          </div>

          {/* Liste éditable des slides */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-foreground">
                {slides.length} slide{slides.length > 1 ? "s" : ""}
              </p>
              <span className="text-2xs text-muted-foreground">
                {USER_SLIDES_MIN} à {USER_SLIDES_MAX} slides
              </span>
            </div>

            {slides.map((slide, i) => {
              const photo = slide.photoIndex ? photos[slide.photoIndex - 1] : null;
              const longOverlay = !!photo && wordCount(slide.body) > 35;
              return (
                <div key={slide.id} className="rounded-xl border border-border bg-card p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-muted-foreground">
                      Slide {i + 1}
                      {i === 0 ? " · couverture" : i === slides.length - 1 ? " · finale" : ""}
                    </span>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => moveSlide(i, -1)} disabled={i === 0} aria-label="Monter la slide">
                        <ArrowUp className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => moveSlide(i, 1)} disabled={i === slides.length - 1} aria-label="Descendre la slide">
                        <ArrowDown className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => removeSlide(slide.id)} aria-label="Supprimer la slide">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  <Input
                    value={slide.title}
                    onChange={(e) => updateSlide(slide.id, { title: e.target.value })}
                    placeholder="Titre (optionnel)"
                    maxLength={120}
                    className="text-sm"
                  />
                  <Textarea
                    value={slide.body}
                    onChange={(e) => updateSlide(slide.id, { body: e.target.value })}
                    placeholder="Le texte de cette slide, tel que tu veux le voir."
                    rows={3}
                    className="text-sm"
                  />

                  {photos.length > 0 && (
                    <div className="flex items-center gap-2">
                      {photo?.preview && (
                        <img
                          src={photo.preview}
                          alt=""
                          className="h-9 w-9 rounded-md object-cover border border-border shrink-0"
                        />
                      )}
                      <select
                        value={slide.photoIndex ?? ""}
                        onChange={(e) =>
                          updateSlide(slide.id, { photoIndex: e.target.value ? Number(e.target.value) : null })
                        }
                        className="h-9 flex-1 rounded-md border border-input bg-background px-3 text-sm text-foreground"
                        aria-label={`Photo de la slide ${i + 1}`}
                      >
                        <option value="">Sans photo (slide texte)</option>
                        {photos.map((p, pi) => (
                          <option key={p.id || pi} value={pi + 1}>
                            Photo {pi + 1}{p.name ? ` — ${p.name.slice(0, 40)}` : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {longOverlay && (
                    <p className="text-2xs text-warning">
                      Texte long pour une slide photo : il sera posé en entier (rien ne sera coupé), mais plus il est court, plus il est lisible sur l'image.
                    </p>
                  )}
                </div>
              );
            })}

            <Button variant="outline" size="sm" onClick={addSlide} className="gap-1.5" disabled={slides.length >= USER_SLIDES_MAX}>
              <Plus className="h-3.5 w-3.5" /> Ajouter une slide
            </Button>
          </div>

          {/* Légende Instagram, gardée telle quelle */}
          <div className="space-y-1.5">
            <p className="text-sm font-semibold text-foreground">Légende Instagram (optionnel)</p>
            <Textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={4}
              placeholder="Ta légende, si tu l'as déjà écrite. Elle sera gardée telle quelle."
              className="text-sm"
            />
          </div>

          <div className="space-y-2 pt-1">
            <Button onClick={handleGenerate} disabled={!canGenerate} className="w-full gap-2" size="lg">
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Créer le design
            </Button>
            <p className="text-2xs text-muted-foreground text-center">
              L'IA choisit les gabarits et compose — elle ne touche pas à ton texte.
            </p>
          </div>
        </>
      )}

      <div className="flex justify-center">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1 text-muted-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Retour
        </Button>
      </div>
    </div>
  );
}
