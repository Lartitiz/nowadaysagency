import { useState, useEffect } from "react";
import { ArrowUp, ArrowDown, X, Plus, Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface SlideProposal {
  slide_number: number;
  role: string;
  title_suggestion: string;
  strategic_note: string;
  photo_index?: number;
  slide_type?: "photo_full" | "photo_integrated" | "text_only";
}

export interface StructureProposal {
  strategic_rationale: string;
  slides: SlideProposal[];
  total_slides: number;
  carousel_type?: string;
}

export interface PhotoItem {
  base64: string;
  preview: string;
}

interface StructureReviewStepProps {
  structureProposal: StructureProposal;
  onConfirm: (slides: SlideProposal[]) => void;
  onSkip: (slides: SlideProposal[]) => void;
  onBack: () => void;
  isLoading: boolean;
  photos?: PhotoItem[];
  carouselSubMode?: "text" | "photo" | "mix";
}

export default function StructureReviewStep({
  structureProposal,
  onConfirm,
  onSkip,
  onBack,
  isLoading,
  photos,
  carouselSubMode,
}: StructureReviewStepProps) {
  const [editableSlides, setEditableSlides] = useState<SlideProposal[]>(structureProposal.slides);
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState<number | null>(null);

  useEffect(() => {
    const incoming = structureProposal.slides.map((s) => s.slide_number).join(",");
    const current = editableSlides.map((s) => s.slide_number).join(",");
    if (incoming !== current) {
      setEditableSlides(structureProposal.slides);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [structureProposal.slides]);

  const renumber = (slides: SlideProposal[]) =>
    slides.map((s, i) => ({ ...s, slide_number: i + 1 }));

  const isPhotoAssigned = (photoIdx: number) =>
    editableSlides.some((s) => s.photo_index === photoIdx);

  const showPhotoBanner =
    photos && photos.length > 0 && (carouselSubMode === "photo" || carouselSubMode === "mix");

  const moveSlide = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= editableSlides.length) return;
    const next = [...editableSlides];
    [next[index], next[target]] = [next[target], next[index]];
    setEditableSlides(renumber(next));
  };

  const removeSlide = (index: number) => {
    if (editableSlides.length <= 3) return;
    const next = editableSlides.filter((_, i) => i !== index);
    setEditableSlides(renumber(next));
  };

  const updateTitle = (index: number, value: string) => {
    setEditableSlides((prev) =>
      prev.map((s, i) => (i === index ? { ...s, title_suggestion: value } : s))
    );
  };

  const assignPhoto = (slideIndex: number) => {
    if (selectedPhotoIndex === null) return;
    setEditableSlides((prev) =>
      prev.map((s, i) =>
        i === slideIndex
          ? { ...s, photo_index: selectedPhotoIndex, slide_type: "photo_full" as const }
          : s
      )
    );
    setSelectedPhotoIndex(null);
  };

  const unassignPhoto = (slideIndex: number) => {
    setEditableSlides((prev) =>
      prev.map((s, i) =>
        i === slideIndex ? { ...s, photo_index: undefined, slide_type: "text_only" as const } : s
      )
    );
  };

  const addSlide = () => {
    if (editableSlides.length >= 15) return;
    const newSlide: SlideProposal = {
      slide_number: editableSlides.length + 1,
      role: "tip",
      title_suggestion: "",
      strategic_note: "Slide ajoutée manuellement",
      slide_type: carouselSubMode === "text" ? undefined : "text_only",
    };
    setEditableSlides((prev) => [...prev, newSlide]);
  };

  const renumberedSlides = renumber(editableSlides);

  return (
    <div className="space-y-6">
      {/* ───── ZONE 1 : HEADER ───── */}
      <div className="space-y-4">
        <h2
          className="text-xl"
          style={{ fontFamily: "'Libre Baskerville', serif", color: "#91014b" }}
        >
          La structure proposée pour ton carrousel
        </h2>

        <div className="bg-[#FFF4F8] border-l-[3px] border-[#FB3D80] p-4 rounded-xl">
          <p className="text-sm italic text-gray-600" style={{ fontFamily: "'IBM Plex Sans', sans-serif" }}>
            {structureProposal.strategic_rationale}
          </p>
        </div>
      </div>

      {/* ───── ZONE 2 : BANDEAU PHOTOS ───── */}
      {showPhotoBanner && (
        <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
          <p className="text-sm font-semibold text-gray-700 mb-3">Tes photos</p>

          <div className="flex flex-wrap gap-2">
            {photos!.map((photo, i) => {
              const photoIdx = i + 1;
              const assigned = isPhotoAssigned(photoIdx);
              const selected = selectedPhotoIndex === photoIdx;

              return (
                <button
                  key={i}
                  type="button"
                  onClick={() =>
                    setSelectedPhotoIndex(selected ? null : photoIdx)
                  }
                  className={`relative w-14 h-14 rounded-lg overflow-hidden border-2 transition-all cursor-pointer flex-shrink-0 ${
                    selected
                      ? "border-[#FB3D80] ring-2 ring-[#FB3D80]/30 opacity-100"
                      : assigned
                        ? "border-green-400 opacity-60"
                        : "border-transparent opacity-100"
                  }`}
                >
                  <img
                    src={photo.preview}
                    alt={`Photo ${photoIdx}`}
                    className="w-full h-full object-cover"
                  />
                  {assigned && !selected && (
                    <span className="absolute top-0 right-0 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center">
                      <Check size={10} className="text-white" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <p className={`mt-2 text-xs ${selectedPhotoIndex ? "text-[#FB3D80] font-medium animate-pulse" : "text-gray-400"}`}>
            {selectedPhotoIndex
              ? "Clique sur une slide pour y assigner cette photo"
              : "Clique sur une photo puis sur une slide pour l'assigner"}
          </p>
        </div>
      )}

      {/* ───── ZONE 3 : LISTE DES SLIDES ───── */}
      <div className="space-y-3">
        {editableSlides.map((slide, index) => (
          <div
            key={`slide-${index}`}
            onClick={() => {
              if (selectedPhotoIndex !== null) assignPhoto(index);
            }}
            className={`bg-white rounded-2xl shadow-sm border border-gray-100 p-5 transition-all ${
              selectedPhotoIndex !== null
                ? "hover:border-[#FB3D80]/40 hover:shadow-md cursor-pointer"
                : ""
            }`}
          >
            {/* A) Ligne du haut */}
            <div className="flex items-center gap-2">
              <span className="bg-[#FB3D80] text-white text-xs font-medium px-2.5 py-0.5 rounded-full">
                {slide.slide_number}
              </span>
              <span className="bg-gray-100 text-gray-500 text-xs px-2 py-0.5 rounded-full">
                {slide.role}
              </span>

              {slide.photo_index && photos && photos[slide.photo_index - 1] && (
                <div className="flex items-center gap-1">
                  <img
                    src={photos[slide.photo_index - 1].preview}
                    alt={`Photo ${slide.photo_index}`}
                    className="w-8 h-8 rounded-md object-cover"
                  />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      unassignPhoto(index);
                    }}
                    className="w-5 h-5 bg-red-100 hover:bg-red-200 rounded-full flex items-center justify-center transition-colors"
                  >
                    <X size={12} className="text-red-500" />
                  </button>
                </div>
              )}

              <span className="flex-1" />

              <div className="flex gap-1">
                <button
                  type="button"
                  disabled={index === 0}
                  onClick={(e) => {
                    e.stopPropagation();
                    moveSlide(index, -1);
                  }}
                  className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 transition-colors"
                >
                  <ArrowUp size={16} className="text-gray-500" />
                </button>
                <button
                  type="button"
                  disabled={index === editableSlides.length - 1}
                  onClick={(e) => {
                    e.stopPropagation();
                    moveSlide(index, 1);
                  }}
                  className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 transition-colors"
                >
                  <ArrowDown size={16} className="text-gray-500" />
                </button>
                <button
                  type="button"
                  disabled={editableSlides.length <= 3}
                  onClick={(e) => {
                    e.stopPropagation();
                    removeSlide(index);
                  }}
                  className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 transition-colors"
                >
                  <X size={16} className="text-red-400 hover:text-red-600" />
                </button>
              </div>
            </div>

            {/* B) Input titre */}
            <Input
              value={slide.title_suggestion}
              onChange={(e) => updateTitle(index, e.target.value)}
              onClick={(e) => e.stopPropagation()}
              className="mt-3 font-medium text-sm"
              placeholder="Titre de la slide..."
            />

            {/* C) Note stratégique */}
            <p className="mt-1.5 text-xs italic text-gray-400">{slide.strategic_note}</p>
          </div>
        ))}

        {/* Bouton ajouter */}
        <Button
          variant="outline"
          size="sm"
          onClick={addSlide}
          disabled={editableSlides.length >= 15}
          className="w-full"
        >
          <Plus size={16} className="mr-1.5" />
          Ajouter une slide
        </Button>
      </div>

      {/* ───── ZONE 4 : FOOTER ───── */}
      <div className="flex flex-col sm:flex-row gap-3 justify-between items-center mt-8">
        <Button variant="outline" onClick={onBack} disabled={isLoading}>
          ← Modifier mon sujet
        </Button>

        <div className="flex gap-2">
          <Button
            variant="ghost"
            className="text-sm text-gray-500"
            onClick={() => onSkip(renumberedSlides)}
            disabled={isLoading}
          >
            Générer directement
          </Button>
          <Button
            className="text-white hover:opacity-90 px-6"
            style={{ backgroundColor: "#FB3D80" }}
            onClick={() => onConfirm(renumberedSlides)}
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 size={16} className="mr-2 animate-spin" />
                Génération en cours...
              </>
            ) : (
              "Générer le contenu →"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
