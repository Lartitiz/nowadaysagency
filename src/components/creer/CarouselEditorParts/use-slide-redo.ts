// « Refaire cette slide » (chantier AA) : état de la fenêtre et appel au serveur.
// La demande part pour la slide choisie à l'ouverture (par son identifiant) ;
// on peut fermer la fenêtre pendant l'attente : la proposition rouvre la fenêtre.
// « Garder la nouvelle » passe par l'historique de l'éditeur (une étape
// d'Annuler), « Garder la mienne » ne change rien.
import { useRef, useState } from "react";
import { toast } from "sonner";
import type { CarouselDocument, EditorSlide } from "@/lib/carousel-editor";
import { fitGeneratedSchemaSlides } from "@/lib/carousel-schema-fit";
import { buildSlideRedoBody, collectSlidePhotos, slideFromRedo, type SlideRedoApi } from "@/components/creer/CarouselEditorParts/slide-redo";

export type SlideRedoState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "result"; next: EditorSlide; instruction: string; notices: string[] };

export function useSlideRedo({ api, raw, getDocument, onKeep }: {
  api: SlideRedoApi;
  raw: any;
  getDocument: () => CarouselDocument;
  onKeep: (next: EditorSlide) => void;
}) {
  const [open, setOpen] = useState(false);
  const [slideId, setSlideId] = useState<string | null>(null);
  const [instruction, setInstruction] = useState("");
  const [state, setState] = useState<SlideRedoState>({ status: "idle" });
  const run = useRef(0);

  const start = (slide: EditorSlide) => {
    // Une demande en cours ou une proposition à voir : on la rouvre, rien n'est perdu.
    if (state.status === "loading" || state.status === "result") return setOpen(true);
    setSlideId(slide.id);
    if (slide.id !== slideId) setInstruction("");
    setState({ status: "idle" });
    setOpen(true);
  };

  const submit = async () => {
    const document = getDocument();
    const index = document.slides.findIndex((s) => s.id === slideId);
    const text = instruction.trim();
    if (index < 0 || text.length < 2 || document.slides[index].locked) return;
    const id = ++run.current;
    setState({ status: "loading" });
    try {
      // Photos lues dans les slides : la slide photo garde la sienne, le mixte garde son allure.
      const { sources, indexBySlide } = collectSlidePhotos(document);
      const loaded = (raw?.carousel_type === "photo" || raw?.carousel_type === "mix") ? await Promise.all(sources.map((src) => api.loadPhoto(src).catch(() => null))) : [];
      const kept = loaded.map((p, i) => (p ? i : -1)).filter((i) => i >= 0);
      const photos = kept.map((i) => loaded[i]!);
      const remap = indexBySlide.map((n) => (n && kept.includes(n - 1) ? kept.indexOf(n - 1) + 1 : undefined));
      const body = buildSlideRedoBody({ raw, document, index, instruction: text, photos, indexBySlide: remap });
      const { data, error } = await api.request(body);
      if (id !== run.current) return;
      if (error || !data?.slide_html?.html) {
        setState({ status: "error", message: error || "La nouvelle slide n'est pas arrivée. Rien n'a été débité : réessaie." });
        setOpen(true);
        return;
      }
      const before = getDocument().slides.find((s) => s.id === slideId) || document.slides[index];
      const photoIndex = remap[index];
      let next = slideFromRedo(before, data, photoIndex ? { sent: photos[photoIndex - 1], original: sources[kept[photoIndex - 1]] } : undefined);
      // Schéma : même ajustement que les visuels créés (texte qui tient dans la slide).
      if (next.data.visual_schema) next = { ...next, html: (await fitGeneratedSchemaSlides([{ html: next.html }], [next.data]))[0].html };
      if (id !== run.current) return;
      setState({ status: "result", next, instruction: text, notices: Array.isArray(data.notices) ? data.notices : [] });
      setOpen(true);
    } catch {
      if (id !== run.current) return;
      setState({ status: "error", message: "La nouvelle slide n'est pas arrivée. Rien n'a été débité : réessaie." });
      setOpen(true);
    }
  };

  const keep = () => {
    if (state.status !== "result") return;
    if (!getDocument().slides.some((s) => s.id === state.next.id)) {
      toast.error("Cette slide n'existe plus : rien n'a été changé.");
    } else {
      onKeep(state.next);
      toast.success("Nouvelle version gardée", { description: "« Annuler » revient à ta version." });
    }
    setState({ status: "idle" });
    setInstruction("");
    setOpen(false);
  };

  const discard = () => {
    setState({ status: "idle" });
    setOpen(false);
  };

  return { open, setOpen, slideId, instruction, setInstruction, state, start, submit, keep, discard };
}
