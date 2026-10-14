import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { CarouselQuality } from "@/hooks/use-carousel-quality";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  LockKeyhole,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  ChevronDown,
  Info,
} from "lucide-react";
import PhotoSwapDialog from "@/components/creer/PhotoSwapDialog";
import type { PhotoItem } from "@/components/creer/PhotoUploadZone";
import RedFlagsChecker, { fixRedFlags } from "@/components/RedFlagsChecker";
import { toast } from "sonner";
import { compressImageFile } from "@/lib/image-compress";
import CarouselInstagramPreview from "@/components/creer/CarouselInstagramPreview";
import type { CarouselStylesApi, SavedCarouselStyle } from "@/hooks/use-carousel-styles";
import { editHistoryShortcut } from "@/lib/edit-history-shortcut";
import {
  slideExtraTexts,
  applyTheme,
  carouselThemes,
  composeLayout,
  ensureFontLink,
  LAYOUTS,
  slidePhotoSource,
  type LayoutVariant,
  addPreset,
  groupElements,
  setLayerLocked,
  ungroupElement,
  type PresetKind,
  applyToAllSlides,
  pasteElement,
  type ClipboardElement,
  documentColors,
  setElementHtml,
  editorialVeilAlpha,
  setEditorialVeilAlpha,
  listLayers,
  moveLayer,
  removeLayer,
  type RemovedLayer,
  duplicateElement,
  setShapeFill,
  setVeilAlpha,
  veilAlpha,
  captionFromText,
  captionText,
  CAROUSEL_MAX_SLIDES,
  documentOutput,
  documentTokens,
  extractStyleTokens,
  getEditorElements,
  listDocumentFonts,
  makeSlide,
  patchElement,
  readCarouselDocument,
  renumberDocument,
  replacePhoto,
  type CarouselDocument,
  type EditorSlide,
} from "@/lib/carousel-editor";
import { type CanvasApi, type CanvasBox } from "@/components/creer/CarouselEditorParts/canvas-geometry";
import SlideCanvas from "@/components/creer/CarouselEditorParts/SlideCanvas";
import { LayersPanel, MultiSelectPanel } from "@/components/creer/CarouselEditorParts/LayersPanel";
import { CarouselThemeSettings, SlideTabSettings } from "@/components/creer/CarouselEditorParts/SlideSettings";
import { alphaOf, range, toHex } from "@/components/creer/CarouselEditorParts/panel-controls";
import { TextSettings } from "@/components/creer/CarouselEditorParts/TextSettings";
import { BlockSettings, PhotoSettings } from "@/components/creer/CarouselEditorParts/ElementSettings";
import { EditorHeader } from "@/components/creer/CarouselEditorParts/EditorHeader";
import { QualityPanel } from "@/components/creer/CarouselEditorParts/QualityPanel";
import { SlideStrip } from "@/components/creer/CarouselEditorParts/SlideStrip";
import { AllSlidesPanel, SavedStylesPanel } from "@/components/creer/CarouselEditorParts/AllSlidesPanel";


interface Props {
  result: any;
  visualSlides: { slide_number: number; html: string }[];
  onChange: (
    raw: any,
    visuals: { slide_number: number; html: string }[],
  ) => void;
  photos?: PhotoItem[];
  onAddPhoto?: (photo: PhotoItem) => number;
  onOpenStudio?: (slideId: string) => void;
  onStaleChange?: (stale: boolean) => void;
  cloudTools?: ReactNode;
  quality?: CarouselQuality;
  /** Élément hôte sous les boutons d'action : rend les encadrés sauvegarde/qualité via un portail. */
  toolsPortal?: HTMLElement | null;
  /** « Mes styles » de l'espace de travail (absent : la section ne s'affiche pas). */
  savedStyles?: CarouselStylesApi;
  /** Couleurs de la charte, proposées en premier dans les pastilles. */
  brandColors?: string[];
}
// Compare immutable references, not megabytes of embedded photo HTML on every
// keystroke. Parent echoes retain these exact references.
const inputKey = (raw: any, visuals: any) => [
  raw.slides || raw.carousel?.slides,
  raw.caption || raw.carousel?.caption,
  visuals,
];

export default function CarouselEditor({
  result,
  visualSlides,
  onChange,
  photos,
  onAddPhoto,
  onOpenStudio,
  onStaleChange,
  cloudTools,
  quality,
  toolsPortal,
  savedStyles,
  brandColors,
}: Props) {
  const raw = result?.raw || result;
  const editorRoot = useRef<HTMLElement>(null);
  const [document, setDocument] = useState<CarouselDocument>(() =>
    readCarouselDocument(raw, visualSlides),
  );
  const [active, setActive] = useState(0),
    [selected, setSelected] = useState<string | null>(null),
    [photoOpen, setPhotoOpen] = useState(false),
    [measured, setMeasured] = useState<CanvasBox | null>(null),
    [extra, setExtra] = useState<string[]>([]),
    [zoom, setZoom] = useState(1),
    [sheetOpen, setSheetOpen] = useState(false),
    [panelTab, setPanelTab] = useState<"element" | "slide" | "carrousel">("slide"),
    [instaOpen, setInstaOpen] = useState(false),
    [fitId, setFitId] = useState<string | null>(null),
    [fullscreen, setFullscreen] = useState(false),
    [dragSlide, setDragSlide] = useState<number | null>(null),
    [dropAt, setDropAt] = useState<number | null>(null),
    [hasClip, setHasClip] = useState(false);
  // Sélection multiple (Maj + clic) : l'élément principal + les autres.
  const group = selected ? [selected, ...extra.filter((id) => id !== selected)] : [];
  const canvasApi = useRef<CanvasApi | null>(null);
  // Presse-papiers de l'éditeur : survit au changement de slide.
  const clipboard = useRef<{ from: string; items: ClipboardElement[] }>({ from: "", items: [] });
  const selectOne = (id: string | null) => {
    setSelected(id);
    setExtra([]);
  };
  const selectAdd = (id: string) => {
    if (!selected) return selectOne(id);
    if (id === selected) {
      const [next, ...rest] = extra;
      setSelected(next || null);
      setExtra(rest);
      return;
    }
    setExtra((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));
  };
  const selectMany = (ids: string[], add: boolean) => {
    const merged = add ? [...group, ...ids.filter((id) => !group.includes(id))] : ids;
    setSelected(merged[0] || null);
    setExtra(merged.slice(1));
  };
  useEffect(() => setExtra([]), [active]);
  // Colonne de droite : un élément choisi ouvre « Élément », un clic dans le vide « Slide ».
  useEffect(() => setPanelTab(selected ? "element" : "slide"), [selected]);
  // Téléphone : toucher un élément ouvre le tiroir des réglages.
  useEffect(() => {
    if (!selected) return;
    setSheetOpen(true);
    // L'aperçu remonte sous l'en-tête pour rester visible au-dessus du tiroir.
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      const preview = window.document.querySelector<HTMLElement>("[data-canvas-sticky]");
      if (preview && preview.getBoundingClientRect().top > 60)
        window.scrollBy({ top: preview.getBoundingClientRect().top - 52, behavior: "smooth" });
    }
  }, [selected]);
  const history = useRef<{
    past: CarouselDocument[];
    future: CarouselDocument[];
    key: string;
    time: number;
  }>({ past: [], future: [], key: "", time: 0 });
  const current = useRef(document);
  current.current = document;
  const echo = useRef<any[]>([]);
  const callbacks = useRef({ onChange, raw });
  callbacks.current = { onChange, raw };
  const emit = (next: CarouselDocument) => {
    const output = documentOutput(next, callbacks.current.raw);
    echo.current = inputKey(output.raw, output.visualSlides);
    current.current = next;
    setDocument(next);
    callbacks.current.onChange(output.raw, output.visualSlides);
  };
  const incoming = useMemo(
    () => inputKey(raw, visualSlides),
    [raw, visualSlides],
  );
  useEffect(() => {
    if (incoming.every((value, index) => value === echo.current[index])) return;
    echo.current = incoming;
    history.current = { past: [], future: [], key: "", time: 0 };
    const next = readCarouselDocument(raw, visualSlides);
    emit(next);
    setActive(0);
    setSelected(null);
  }, [incoming, raw, visualSlides]);
  // Editing uses the exact HTML shown and exported; no remote visual generation.
  useEffect(() => {
    onStaleChange?.(false);
  }, [onStaleChange]);
  const commit = (next: CarouselDocument, key = "") => {
    const h = history.current,
      now = Date.now();
    if (!key || h.key !== key || now - h.time > 800)
      h.past = [...h.past.slice(-29), current.current];
    h.future = [];
    h.key = key;
    h.time = now;
    emit(next);
  };
  const undo = (redo = false) => {
    const h = history.current,
      from = redo ? h.future : h.past;
    const next = from.pop();
    if (!next) return;
    (redo ? h.past : h.future).push(current.current);
    h.key = "";
    emit(next);
    setActive((i) => Math.min(i, next.slides.length - 1));
    // Keep the selected text field (and its keyboard focus) when its stable
    // element ID still exists after undo; otherwise return focus to the editor.
    const kept = selected && getEditorElements(next.slides[Math.min(active, next.slides.length - 1)]?.html || "").some(e => e.id === selected);
    setSelected(kept ? selected : null);
    return { kept };
  };
  const onHistoryKey = (event: KeyboardEvent | React.KeyboardEvent<HTMLElement>) => {
    const action = editHistoryShortcut("nativeEvent" in event ? event.nativeEvent : event);
    if (!action) return;
    event.preventDefault();
    event.stopPropagation();
    const moved = undo(action === "redo");
    if (moved && ((selected && !moved.kept) || (event.target as Node)?.ownerDocument !== editorRoot.current?.ownerDocument)) editorRoot.current?.focus();
  };
  const slide = document.slides[Math.min(active, document.slides.length - 1)];
  const elements = useMemo(
    () => (slide ? getEditorElements(slide.html) : []),
    [slide],
  );
  const element = elements.find((e) => e.id === selected);
  const remove = (id: string) => {
    const target = current.current.slides[Math.min(active, current.current.slides.length - 1)];
    if (!target || target.locked) return;
    changeSlide(removeLayer(target, id));
    setSelected(null);
  };
  const layers = useMemo(() => (slide ? listLayers(slide.html) : []), [slide]);
  const removedLayers: RemovedLayer[] = (slide?.data.editor_removed as RemovedLayer[]) || [];
  // Couleurs de la charte d'abord, puis celles du carrousel (sans quasi-doublons).
  const palette = useMemo(() => {
    const brand = (brandColors || []).filter((c) => /^#[0-9a-f]{6}$/i.test(c || "")).map((c) => c.toLowerCase());
    const rgb = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
    const out: string[] = [];
    for (const c of [...brand, ...documentColors(document.slides, 10)]) {
      const [r, g, b] = rgb(c);
      if (out.some((o) => { const [x, y, z] = rgb(o); return Math.abs(r - x) + Math.abs(g - y) + Math.abs(b - z) < 40; })) continue;
      out.push(c);
      if (out.length >= 9) break;
    }
    return out;
  }, [document.slides, brandColors]);
  const documentFonts = useMemo(
    () => listDocumentFonts(document.slides),
    [document.slides],
  );

  const changeSlide = (next: EditorSlide, key = "") =>
    commit(
      {
        ...current.current,
        slides: current.current.slides.map((s) =>
          s.id === slide.id ? next : s,
        ),
      },
      key,
    );
  const moveMany = (moves: Record<string, Record<string, string>>) => {
    let next = slide;
    Object.entries(moves).forEach(([id, styles]) => (next = patchElement(next, id, { styles })));
    if (next !== slide) changeSlide(next);
  };
  const removeMany = (ids: string[]) => {
    let next = slide;
    ids.forEach((id) => (next = removeLayer(next, id)));
    if (next !== slide) changeSlide(next);
    selectOne(null);
  };
  const copySelection = () => {
    const items = canvasApi.current?.copy(group) || [];
    if (!items.length) return;
    clipboard.current = { from: slide.id, items };
    setHasClip(true);
    toast.success(items.length > 1 ? `${items.length} éléments copiés` : "Élément copié", { description: "⌘/Ctrl + V pour coller, ici ou sur une autre slide." });
  };
  const paste = () => {
    if (!clipboard.current.items.length || slide.locked) return;
    let next = slide;
    const ids: string[] = [];
    clipboard.current.items.forEach((item) => {
      const out = pasteElement(next, item, clipboard.current.from === slide.id);
      if (out.id) {
        next = out.slide;
        ids.push(out.id);
      }
    });
    if (!ids.length) return;
    changeSlide(next);
    setSelected(ids[0]);
    setExtra(ids.slice(1));
  };
  // Raccourcis clavier de l'éditeur (en plus de ⌘Z, ⌘C/V, flèches, Suppr, Échap).
  const shortcut = (event: KeyboardEvent): boolean => {
    if (event.defaultPrevented || event.isComposing || slide.locked) return false;
    const mod = event.metaKey || event.ctrlKey;
    const key = event.key.toLowerCase();
    const layersNow = listLayers(slide.html).filter((l) => !l.fixed && !l.hidden);
    if (key === "tab" && !mod && !event.altKey) {
      // Tab / Maj+Tab : élément suivant / précédent, dans l'ordre des calques.
      if (!layersNow.length) return false;
      const i = layersNow.findIndex((l) => l.id === selected);
      const next = layersNow[(i + (event.shiftKey ? -1 : 1) + layersNow.length) % layersNow.length];
      selectOne(next.id);
      return true;
    }
    if (!mod || event.altKey) return false;
    if (key === "a" && !event.shiftKey) {
      const ids = layersNow.filter((l) => l.topLevel && l.role !== "veil").map((l) => l.id);
      if (!ids.length) return false;
      setSelected(ids[0]);
      setExtra(ids.slice(1));
      return true;
    }
    if (key === "g") {
      if (event.shiftKey) ungroupSelection();
      else groupSelection();
      return true;
    }
    if (!selected) return false;
    if (key === "l" && event.shiftKey) {
      const isLocked = !!listLayers(slide.html).find((l) => l.id === selected)?.locked;
      lockElement(selected, !isLocked);
      return true;
    }
    if (key === "d" && !event.shiftKey) {
      const out = duplicateElement(slide, selected);
      if (!out.id) return true;
      changeSlide(out.slide);
      selectOne(out.id);
      return true;
    }
    if (key === "x" && !event.shiftKey) {
      copySelection();
      removeMany(group);
      return true;
    }
    if ((key === "b" || key === "i" || key === "u") && !event.shiftKey) {
      const els = getEditorElements(slide.html).filter((e) => group.includes(e.id) && e.kind === "text");
      if (!els.length) return false;
      const first = els[0].style;
      const styles =
        key === "b"
          ? { "font-weight": (parseInt(first["font-weight"], 10) || 400) >= 600 ? "400" : "700" }
          : key === "i"
            ? { "font-style": first["font-style"] === "italic" ? "normal" : "italic" }
            : { "text-decoration": /underline/.test(first["text-decoration"] || first["text-decoration-line"] || "") ? "none" : "underline" };
      moveMany(Object.fromEntries(els.map((e) => [e.id, styles])));
      return true;
    }
    if (event.key === "]" || event.key === "[") {
      const next = moveLayer(slide, selected, event.key === "]" ? "up" : "down");
      if (next !== slide) changeSlide(next);
      return true;
    }
    return false;
  };
  // Réordonner en glissant une vignette (souris ou doigt).
  const thumbDrag = useRef<{ from: number; x: number; moved: boolean } | null>(null);
  const justDragged = useRef(false);
  const thumbIndexAt = (x: number) => {
    const thumbs = Array.from(window.document.querySelectorAll<HTMLElement>("[data-thumb]"));
    // Position d'insertion : avant la vignette dont on passe la moitié, sinon à la fin.
    let index = thumbs.length;
    for (let k = 0; k < thumbs.length; k++) {
      const r = thumbs[k].getBoundingClientRect();
      if (x < r.left + r.width / 2) {
        index = k;
        break;
      }
    }
    return index;
  };
  const reorder = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0) return;
    const slides = [...current.current.slides];
    const [moved] = slides.splice(from, 1);
    slides.splice(to, 0, moved);
    commit(renumberDocument({ ...current.current, slides }));
    setActive(to);
    selectOne(null);
  };
  // Photo glissée depuis l'ordinateur sur la slide.
  const dropPhoto = async (file: File, targetId: string | null) => {
    if (!onAddPhoto) {
      toast.error("Ajout de photo indisponible ici.");
      return;
    }
    try {
      const small = await compressImageFile(file);
      const source = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(small);
      });
      if (!/^data:image\/(png|jpeg|webp|gif);base64,/i.test(source)) {
        toast.error("Format non pris en charge. Choisis une photo JPG, PNG ou WEBP.");
        return;
      }
      const index = onAddPhoto({ base64: source, preview: source, name: small.name, mimeType: small.type || "image/jpeg" });
      if (!index) return;
      const target = current.current.slides.find((s) => s.id === slide.id) || slide;
      changeSlide(replacePhoto(target, targetId, source, index));
      toast.success("Photo ajoutée à la slide");
    } catch {
      toast.error("Cette photo n’a pas pu être lue.");
    }
  };
  // Verrouiller un élément, grouper / dégrouper, éléments tout faits.
  const lockElement = (id: string, locked: boolean) => changeSlide(setLayerLocked(slide, id, locked));
  const groupable = (id: string) => {
    const l = listLayers(slide.html).find((x) => x.id === id);
    return !!l && l.topLevel && !l.fixed && !l.locked && l.role !== "veil" && l.role !== "glass" && l.kind !== "photo";
  };
  const groupSelection = () => {
    const ids = group.filter(groupable);
    if (ids.length < 2) {
      toast("Choisis au moins deux éléments à grouper", { description: "Maj + clic sur la slide ou dans les calques. Les photos et le cadre en verre restent à part." });
      return;
    }
    const rects = canvasApi.current?.rects(ids) || {};
    const out = groupElements(slide, ids.filter((id) => rects[id]).map((id) => ({ id, rect: rects[id] })));
    if (!out.id) return;
    changeSlide(out.slide);
    selectOne(out.id);
  };
  const ungroupSelection = () => {
    if (!selected) return;
    const members = getEditorElements(slide.html).filter((e) => e.id !== selected);
    const rects = canvasApi.current?.rects(members.map((e) => e.id)) || {};
    const out = ungroupElement(slide, selected, rects);
    if (!out.ids.length) return;
    changeSlide(out.slide);
    setSelected(out.ids[0]);
    setExtra(out.ids.slice(1));
  };
  const addReady = (kind: PresetKind) => {
    // Couleur de marque : la plus vive de la palette, assez foncée pour se lire
    // sur un fond clair (le fond rose pâle est souvent la couleur la plus fréquente).
    const score = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
      const max = Math.max(r, g, b), min = Math.min(r, g, b), light = (max + min) / 2;
      const sat = max === min ? 0 : (max - min) / (1 - Math.abs(2 * light - 1));
      return light > 0.12 && light < 0.6 ? sat : -1;
    };
    const brand = [...palette].sort((a, b) => score(b) - score(a)).find((c) => score(c) > 0.2) || "#1a1a1a";
    const out = addPreset(slide, kind, brand, "#ffffff");
    if (!out.id) return;
    changeSlide(out.slide);
    selectOne(out.id);
  };
  // « Mes styles » : enregistrer le style de l'élément choisi, le réappliquer ailleurs.
  const [styleName, setStyleName] = useState("");
  const STYLE_KEYS: Record<SavedCarouselStyle["kind"], string[]> = {
    text: ["font-family", "font-size", "font-weight", "font-style", "color", "line-height", "text-align", "letter-spacing", "text-transform", "text-decoration", "text-shadow", "background-color", "border-radius", "--photo-heading"],
    shape: ["background-color", "border-radius", "border", "box-shadow", "opacity"],
    photo: ["filter", "border-radius", "border", "box-shadow", "opacity"],
    veil: [],
  };
  const styleKind = (e: NonNullable<typeof element>): SavedCarouselStyle["kind"] =>
    e.role === "veil" ? "veil" : e.kind === "photo" ? "photo" : e.kind === "text" ? "text" : "shape";
  const saveStyle = async () => {
    if (!element || !savedStyles) return;
    const kind = styleKind(element);
    const styles: Record<string, string> =
      kind === "veil"
        ? { alpha: String(veilAlpha(Object.entries(element.style).map(([k, v]) => `${k}:${v}`).join(";")) ?? 0.85) }
        : Object.fromEntries(STYLE_KEYS[kind].map((k) => [k, element.style[k]]).filter(([, v]) => v));
    if (kind === "text" && element.emphasis?.color) styles["--photo-heading"] = element.emphasis.color;
    const name = styleName.trim() || (kind === "text" ? "Mon style de texte" : kind === "photo" ? "Ma retouche photo" : kind === "veil" ? "Mon voile" : "Ma forme");
    const ok = await savedStyles.save(name, kind, styles);
    if (ok) {
      setStyleName("");
      toast.success("Style enregistré", { description: "Il est proposé pour les éléments du même type, dans tous tes carrousels." });
    } else toast.error("Le style n’a pas pu être enregistré.", { description: "Réessaie dans un instant." });
  };
  const applySaved = (saved: SavedCarouselStyle) => {
    const ids = group.length ? group : selected ? [selected] : [];
    let next = slide;
    ids.forEach((id) => {
      next = saved.kind === "veil"
        ? setVeilAlpha(next, id, Number(saved.styles.alpha) || 0.85)
        : patchElement(next, id, { styles: saved.styles });
    });
    if (next !== slide) changeSlide(next);
  };
  const applyAll = (what: { style?: boolean; position?: boolean }) => {
    if (!selected) return;
    const out = applyToAllSlides(current.current, slide.id, selected, what);
    if (!out.changed) {
      toast("Aucun élément équivalent sur les autres slides", { description: "Le report vise le même texte (titre, corps…), le même cadre ou le même décor." });
      return;
    }
    commit(out.document);
    toast.success(`Appliqué à ${out.changed} autre${out.changed > 1 ? "s" : ""} slide${out.changed > 1 ? "s" : ""}`);
  };
  const style = (styles: Record<string, string>, key = "style") => {
    if (selected)
      changeSlide(
        patchElement(slide, selected, { styles }),
        `${slide.id}-${selected}-${key}`,
      );
  };
  const move = (delta: number) => {
    const next = [...document.slides];
    const target = active + delta;
    if (target < 0 || target >= next.length) return;
    [next[active], next[target]] = [next[target], next[active]];
    commit(renumberDocument({ ...document, slides: next }));
    setActive(target);
  };
  const add = (duplicate = false) => {
    if (document.slides.length >= CAROUSEL_MAX_SLIDES) return;
    const next = duplicate
      ? { ...slide, id: crypto.randomUUID(), locked: false }
      : makeSlide({}, "text_only", "", documentTokens(document.slides));

    const slides = [...document.slides];
    slides.splice(active + 1, 0, next);
    commit(renumberDocument({ ...document, slides }));
    setActive(active + 1);
    setSelected(null);
  };
  const fix = () => {
    const next = {
      ...document,
      caption: captionFromText(fixRedFlags(captionText(document.caption))),
      slides: document.slides.map((s) => {
        if (s.locked) return s;
        let updated = s;
        getEditorElements(s.html)
          .filter((e) => e.kind === "text")
          .forEach((e) => {
            const text = fixRedFlags(e.text);
            if (text !== e.text)
              updated = patchElement(updated, e.id, { text });
          });
        return updated;
      }),
    };
    commit(next);
  };
  // Galerie de mises en page : aperçu de la slide dans chaque mise en page,
  // avec son titre, son texte, sa photo et sa charte.
  const slidePhoto = useMemo(() => (slide ? slidePhotoSource(slide.html) : ""), [slide]);
  const layoutPreviews = useMemo(
    () =>
      slide
        ? LAYOUTS.filter((l) => !l.photo || slidePhoto).map((l) => ({
            ...l,
            preview: composeLayout(slide.data, l.variant, slidePhoto, extractStyleTokens(slide.html), slideExtraTexts(slide)),
          }))
        : [],
    [slide, slidePhoto],
  );
  const changeLayout = (variant: LayoutVariant) => {
    if (slide.locked) return;
    const next = layoutPreviews.find((l) => l.variant === variant)?.preview;
    if (!next) return;
    changeSlide({ ...next, id: slide.id });
    setSelected(null);
  };
  // Thèmes pour tout le carrousel, construits sur la charte du carrousel.
  const themes = useMemo(() => {
    const tokens = documentTokens(document.slides);
    const hex = (v: string) => {
      const m = v.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      return m ? `#${m.slice(1, 4).map((x) => Number(x).toString(16).padStart(2, "0")).join("")}` : v;
    };
    const brand = (brandColors || []).find((c) => /^#[0-9a-f]{6}$/i.test(c)) || hex(tokens.titleColor);
    return carouselThemes(brand, hex(tokens.background), hex(tokens.bodyColor));
  }, [document.slides, brandColors]);
  const applyCarouselTheme = (themeId: string) => {
    const theme = themes.find((t) => t.id === themeId);
    if (!theme) return;
    const out = applyTheme(current.current, theme);
    if (!out.changed) {
      toast("Aucune slide à changer", { description: "Les slides photo et les slides verrouillées gardent leurs couleurs." });
      return;
    }
    commit(out.document);
    toast.success(`Thème « ${theme.label} » appliqué à ${out.changed} slide${out.changed > 1 ? "s" : ""}`, {
      description: out.skipped
        ? out.skipped > 1
          ? `${out.skipped} slides photo ou verrouillées gardent leurs couleurs. Tu peux annuler.`
          : "1 slide photo ou verrouillée garde ses couleurs. Tu peux annuler."
        : "Tu peux annuler.",
    });
  };
  // Police Google : la police est ajoutée à la slide (aperçu et export).
  const [fontQuery, setFontQuery] = useState("");
  const pickFont = (value: string, family?: string) => {
    if (!selected) return;
    let next = family ? ensureFontLink(slide, family) : slide;
    next = patchElement(next, selected, { styles: { "font-family": value } });
    changeSlide(next);
  };
  const css = element?.style || {};
  const fillHex = toHex(css["background-color"], "#ffffff");
  const fillAlpha = alphaOf(css["background-color"]);
  const fill = (hex: string, alpha: number) =>
    selected &&
    changeSlide(setShapeFill(slide, selected, hex, alpha), `${slide.id}-${selected}-fill`);
  // Un bloc posé en absolu sans coordonnée explicite affiche sa vraie position.
  const coord = (key: "left" | "top") =>
    css[key] && css[key] !== "auto"
      ? parseFloat(css[key]) || 0
      : css.position === "absolute" && measured
        ? Math.round(measured[key])
        : 0;
  // Réglages avancés : ombre, bordure, rotation, filtres photo.
  const shadowPresets: Record<string, string> = {
    none: "none",
    douce: "0 8px 24px rgba(0,0,0,0.18)",
    marquee: "0 16px 40px rgba(0,0,0,0.35)",
  };
  // Styles de bloc tout faits : un clic au lieu de six réglages.
  const blockPresets: { label: string; styles: Record<string, string>; fill?: [string, number] }[] = [
    { label: "Aucun", styles: { border: "", "box-shadow": "none", "border-radius": "0px" }, fill: ["#ffffff", 0] },
    { label: "Carte", styles: { border: "", "box-shadow": "0 8px 24px rgba(0,0,0,0.18)", "border-radius": "24px", padding: "32px" }, fill: ["#ffffff", 1] },
    { label: "Pastille", styles: { border: "", "box-shadow": "none", "border-radius": "999px", padding: "12px 32px" }, fill: [palette.find((c) => !/^#(f{6}|0{6})$/i.test(c)) || "#fb3d80", 1] },
    { label: "Contour", styles: { border: `4px solid ${toHex(css.color, "#1a1a1a")}`, "box-shadow": "none", "border-radius": "20px", padding: "24px" }, fill: ["#ffffff", 0] },
    { label: "Ombre douce", styles: { "box-shadow": "0 8px 24px rgba(0,0,0,0.18)" } },
  ];
  const applyBlockPreset = (preset: (typeof blockPresets)[number]) => {
    if (!selected) return;
    let next = patchElement(slide, selected, { styles: preset.styles });
    if (preset.fill) next = setShapeFill(next, selected, preset.fill[0], preset.fill[1]);
    changeSlide(next);
  };
  const shadowOf = (v: string | undefined) =>
    !v || v === "none" ? "none" : v === shadowPresets.marquee || /0\.35\)/.test(v) ? "marquee" : "douce";
  const textShadowOn = !!css["text-shadow"] && css["text-shadow"] !== "none";
  const rotation = parseFloat(css["--editor-rotate"] || "") || 0;
  const rotate = (n: number) => {
    const base = css["--editor-rotate"] ? css["--editor-base-transform"] || "" : css.transform && css.transform !== "none" ? css.transform : "";
    style(
      {
        "--editor-base-transform": base,
        "--editor-rotate": `${n}deg`,
        transform: n ? `${base} rotate(${n}deg)`.trim() : base || "none",
      },
      "rotate",
    );
  };
  const borderWidth = parseFloat(css["border-top-width"] || css["border-width"] || "") || 0;
  const borderColor = toHex(css["border-top-color"] || css["border-color"], "#ffffff");
  const filterValue = (name: string, fallback: number) => {
    const m = new RegExp(`${name}\\(([\\d.]+)`).exec(css.filter || "");
    return m ? Number(m[1]) : fallback;
  };
  const setFilter = (change: Partial<Record<"brightness" | "contrast" | "saturate", number>>) => {
    const next = {
      brightness: filterValue("brightness", 1),
      contrast: filterValue("contrast", 1),
      saturate: filterValue("saturate", 1),
      ...change,
    };
    const neutral = next.brightness === 1 && next.contrast === 1 && next.saturate === 1;
    style({ filter: neutral ? "" : `brightness(${next.brightness}) contrast(${next.contrast}) saturate(${next.saturate})` }, "filter");
  };
  const borderControls = (
    <>
      {range("Épaisseur de la bordure", borderWidth, 0, 40, (n) =>
        style({ border: n ? `${n}px solid ${borderColor}` : "" }, "border"),
      )}
      {borderWidth > 0 && (
        <label className="flex items-center justify-between text-xs">
          Couleur de la bordure
          <input
            aria-label="Couleur de la bordure"
            type="color"
            value={borderColor}
            onChange={(e) => style({ border: `${borderWidth}px solid ${e.target.value}` }, "border")}
          />
        </label>
      )}
      <label className="block text-xs">
        Ombre portée
        <select
          aria-label="Ombre portée"
          className="mt-1 w-full rounded border bg-background p-2"
          value={shadowOf(css["box-shadow"])}
          onChange={(e) => style({ "box-shadow": shadowPresets[e.target.value] })}
        >
          <option value="none">Aucune</option>
          <option value="douce">Douce</option>
          <option value="marquee">Marquée</option>
        </select>
      </label>
    </>
  );
  if (!slide) return null;
  return (
    <section ref={editorRoot} tabIndex={-1} aria-label="Éditeur de carrousel" className={`min-w-0 w-full space-y-4 md:pb-0 ${sheetOpen ? "pb-[52vh]" : "pb-16"}`} onKeyDown={(event) => {
      const tag = (event.target as HTMLElement).tagName;
      if ((event.metaKey || event.ctrlKey) && !event.shiftKey && (event.key === "c" || event.key === "v") && !/INPUT|TEXTAREA|SELECT/.test(tag) && !(event.target as HTMLElement).isContentEditable && !window.getSelection()?.toString()) {
        event.preventDefault();
        if (event.key === "c") copySelection();
        else paste();
        return;
      }
      // Tab garde son rôle de navigation dans le panneau ; il ne change d'élément que dans l'aperçu.
      if (event.key !== "Tab" && !/INPUT|TEXTAREA|SELECT/.test(tag) && !(event.target as HTMLElement).isContentEditable && shortcut(event.nativeEvent)) {
        event.preventDefault();
        return;
      }
      onHistoryKey(event);
    }}>
      <EditorHeader
        history={history}
        setInstaOpen={setInstaOpen}
        undo={undo}
      />
      {toolsPortal && createPortal(
        <QualityPanel
          cloudTools={cloudTools}
          commit={commit}
          current={current}
          document={document}
          quality={quality}
          setActive={setActive}
          setSelected={setSelected}
        />,
        toolsPortal,
      )}
      <SlideStrip
        active={active}
        add={add}
        changeSlide={changeSlide}
        commit={commit}
        current={current}
        document={document}
        dragSlide={dragSlide}
        dropAt={dropAt}
        justDragged={justDragged}
        move={move}
        reorder={reorder}
        setActive={setActive}
        setDragSlide={setDragSlide}
        setDropAt={setDropAt}
        setSelected={setSelected}
        slide={slide}
        thumbDrag={thumbDrag}
        thumbIndexAt={thumbIndexAt}
      />
      <div className="grid items-start gap-6 md:grid-cols-[minmax(0,1fr)_280px] lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* Téléphone : l'aperçu reste visible (collé sous l'en-tête, plus petit)
            pendant qu'on fait défiler les réglages en dessous. */}
        <div
          className={
            fullscreen
              ? "fixed inset-0 z-50 flex flex-col items-center justify-center gap-2 overflow-auto bg-background p-4"
              : "sticky top-12 z-30 min-w-0 w-full bg-background pb-2 md:top-28 md:bg-transparent md:pb-0"
          }
          data-canvas-sticky
          onKeyDown={(e) => {
            if (fullscreen && e.key === "Escape" && !selected) setFullscreen(false);
          }}
        >
          <div className="mb-1 flex items-center justify-end gap-1">
            {!fullscreen && (
              <>
                <Button size="sm" variant="ghost" className="h-7 px-2" aria-label="Dézoomer l’aperçu" disabled={zoom <= 1} onClick={() => setZoom((z) => Math.max(1, z - 0.5))}>
                  <ZoomOut size={14} />
                </Button>
                <span className="w-10 text-center text-2xs tabular-nums text-muted-foreground">{Math.round(zoom * 100)} %</span>
                <Button size="sm" variant="ghost" className="h-7 px-2" aria-label="Zoomer l’aperçu" disabled={zoom >= 3} onClick={() => setZoom((z) => Math.min(3, z + 0.5))}>
                  <ZoomIn size={14} />
                </Button>
              </>
            )}
            <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-2xs" aria-label={fullscreen ? "Quitter le plein écran" : "Ouvrir l’aperçu en grand"} onClick={() => setFullscreen((f) => !f)}>
              {fullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
              {fullscreen ? "Quitter le plein écran" : "En grand"}
            </Button>
          </div>
          <div
            className={
              fullscreen
                ? "w-full max-w-[min(1080px,calc((100vh-6rem)*0.8))]"
                : "mx-auto w-full max-w-[min(540px,36vh)] md:max-w-[540px]"
            }
          >
          <SlideCanvas
            onHistoryKey={onHistoryKey}
            slide={slide}
            selected={selected}
            onSelect={selectOne}
            group={group}
            onSelectAdd={selectAdd}
            onSelectMany={selectMany}
            onMoveMany={moveMany}
            onRemoveMany={removeMany}
            onCopy={copySelection}
            onPaste={paste}
            onShortcut={shortcut}
            api={canvasApi}
            onDropPhoto={onAddPhoto ? dropPhoto : undefined}
            onReplacePhoto={onAddPhoto ? () => setPhotoOpen(true) : undefined}
            onLock={lockElement}
            zoom={fullscreen ? 1 : zoom}
            onMeasure={setMeasured}
            onMove={(id, styles) =>
              changeSlide(patchElement(slide, id, { styles }))
            }
            onRemove={remove}
            onEditText={(id, text) => {
              setFitId(id);
              changeSlide(patchElement(slide, id, { text }), `text-${slide.id}-${id}`);
            }}
            onEditHtml={(id, html) => {
              setFitId(id);
              changeSlide(setElementHtml(slide, id, html));
            }}
            fitId={fitId}
            onFitDone={(_id, size) => {
              setFitId(null);
              if (typeof size === "number")
                toast(`Texte réduit à ${size} px pour tenir dans son cadre`, { description: "Tu peux l’agrandir à nouveau ou élargir le bloc." });
              else if (size === "trop-long")
                toast("Ce texte est trop long pour son cadre", { description: "Raccourcis-le ou agrandis le bloc : même réduit au minimum, il serait coupé." });
            }}
            onFill={(id, hex) => {
              // La couleur change, la transparence choisie (verre, voile) reste.
              const current = getEditorElements(slide.html).find((e) => e.id === id)?.style["background-color"];
              const alpha = current ? alphaOf(current) : 1;
              changeSlide(setShapeFill(slide, id, hex, alpha || 1));
            }}
            onDuplicate={(id) => {
              const out = duplicateElement(slide, id);
              if (!out.id) return;
              changeSlide(out.slide);
              setSelected(out.id);
            }}
            colors={palette}
          />
          <p className="mt-2 hidden items-center justify-center gap-1 text-xs text-muted-foreground md:flex">
            Slide {active + 1} / {document.slides.length} · Double-clic : écrire · Glisser : déplacer · Glisser dans le vide : choisir plusieurs
            <Info size={13} role="img" aria-label="Double-clique un texte pour l’écrire sur la slide. Glisse un bloc pour le déplacer (il s’aligne sur les repères roses ; ⌘/Ctrl pour placer librement), une photo plein écran pour la recadrer (double-clic pour recadrer une photo encadrée), les poignées pour l’agrandir. Alt + glisser : le texte seul. Glisser depuis le vide, ou clic long puis glisser, trace un cadre qui choisit plusieurs éléments. Flèches pour ajuster, Suppr pour retirer, Échap pour choisir le cadre.">
              <title>Double-clique un texte pour l’écrire sur la slide. Glisse un bloc pour le déplacer (il s’aligne sur les repères roses ; ⌘/Ctrl pour placer librement), une photo plein écran pour la recadrer (double-clic pour recadrer une photo encadrée), les poignées pour l’agrandir. Alt + glisser : le texte seul. Glisser depuis le vide, ou clic long puis glisser, trace un cadre qui choisit plusieurs éléments. Flèches pour ajuster, Suppr pour retirer, Échap pour choisir le cadre.</title>
            </Info>
          </p>
          <p className="mt-1 text-center text-2xs text-muted-foreground md:hidden">
            Slide {active + 1} / {document.slides.length} · Touche un élément, glisse-le ; « Écrire » pour changer un texte.
          </p>
          </div>
        </div>
        {/* Téléphone : le panneau devient un tiroir qui remonte du bas de l'écran. */}
        <div
          className={`fixed inset-x-0 bottom-0 z-40 min-w-0 space-y-4 overflow-y-auto rounded-t-2xl border-t bg-card px-4 pb-4 shadow-[0_-8px_30px_rgba(0,0,0,0.15)] transition-[max-height] md:static md:z-auto md:max-h-none md:overflow-visible md:rounded-xl md:border md:p-4 md:shadow-none ${sheetOpen ? "max-h-[50vh]" : "max-h-14 overflow-hidden"}`}
        >
          <button
            type="button"
            aria-expanded={sheetOpen}
            aria-label={sheetOpen ? "Replier les réglages" : "Ouvrir les réglages"}
            onClick={() => setSheetOpen((o) => !o)}
            className="sticky top-0 z-10 -mx-4 flex w-[calc(100%+2rem)] flex-col items-center gap-1 bg-card px-4 pb-2 pt-2 md:hidden"
          >
            <span className="h-1.5 w-10 rounded-full bg-muted-foreground/30" aria-hidden="true" />
            <span className="flex w-full items-center justify-between text-xs font-semibold">
              {element ? layers.find((l) => l.id === element.id)?.label || "Élément" : "Réglages"}
              <ChevronDown size={14} className={sheetOpen ? "" : "rotate-180"} aria-hidden="true" />
            </span>
          </button>
          <LayersPanel
            changeSlide={changeSlide}
            group={group}
            layers={layers}
            lockElement={lockElement}
            remove={remove}
            removedLayers={removedLayers}
            selectAdd={selectAdd}
            selectOne={selectOne}
            selected={selected}
            setSelected={setSelected}
            slide={slide}
          />
          <div role="tablist" aria-label="Réglages" className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
            {([
              ["element", "Élément"],
              ["slide", "Slide"],
              ["carrousel", "Carrousel"],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={panelTab === id}
                onClick={() => setPanelTab(id)}
                className={`rounded-md px-2 py-1.5 text-xs font-medium ${panelTab === id ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                {label}
              </button>
            ))}
          </div>
          {slide.locked && (
            <p role="status" className="text-xs">
              Slide verrouillée : déverrouille-la pour la modifier.
            </p>
          )}
          {panelTab === "element" && !element && group.length < 2 && (
            <p className="rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">
              Choisis un élément sur la slide ou dans les calques pour le régler.
            </p>
          )}
          {panelTab === "element" && group.length > 1 && !slide.locked && (
            <MultiSelectPanel
              canvasApi={canvasApi}
              copySelection={copySelection}
              group={group}
              groupSelection={groupSelection}
              removeMany={removeMany}
              selectOne={selectOne}
              selected={selected}
            />
          )}
          {panelTab === "element" && element && !slide.locked && listLayers(slide.html).find((l) => l.id === element.id)?.locked && (
            <div role="status" className="flex items-center justify-between gap-2 rounded-lg border p-2 text-xs">
              <span className="flex items-center gap-1.5"><LockKeyhole size={13} /> Élément verrouillé.</span>
              <Button size="sm" variant="outline" className="h-7 text-2xs" onClick={() => lockElement(element.id, false)}>Déverrouiller</Button>
            </div>
          )}
          {panelTab === "element" && element?.name === "groupe" && !slide.locked && (
            <Button size="sm" variant="outline" className="w-full" onClick={ungroupSelection} title="⌘⇧G">
              Dégrouper
            </Button>
          )}
          <fieldset
            disabled={slide.locked || (panelTab === "element" && !!element && !!listLayers(slide.html).find((l) => l.id === element.id)?.locked)}
            className="min-w-0 space-y-3 disabled:opacity-50"
          >
            {panelTab === "element" && (<>
            {element?.kind === "text" && (
              <TextSettings
                changeSlide={changeSlide}
                css={css}
                documentFonts={documentFonts}
                element={element}
                fontQuery={fontQuery}
                pickFont={pickFont}
                setFitId={setFitId}
                setFontQuery={setFontQuery}
                slide={slide}
                style={style}
                textShadowOn={textShadowOn}
              />
            )}
            {element?.kind === "photo" && (
              <PhotoSettings
                borderControls={borderControls}
                canvasApi={canvasApi}
                coord={coord}
                css={css}
                element={element}
                filterValue={filterValue}
                measured={measured}
                setFilter={setFilter}
                style={style}
              />
            )}
            {element?.editorialVeil &&
              range(
                "Intensité du voile derrière le texte",
                editorialVeilAlpha(slide.html) ?? 0.9,
                0.05,
                1,
                (n) => changeSlide(setEditorialVeilAlpha(slide, n), `${slide.id}-editorial-veil`),
                0.05,
              )}
            {element?.role === "veil" &&
              range(
                "Intensité du voile",
                veilAlpha(Object.entries(css).map(([k, v]) => `${k}:${v}`).join(";")) ?? 0.85,
                0.05,
                1,
                (n) =>
                  changeSlide(
                    setVeilAlpha(slide, element.id, n),
                    `${slide.id}-${element.id}-veil`,
                  ),
                0.05,
              )}
            {element && element.kind !== "photo" && element.role !== "veil" && element.role !== "background" && (
              <BlockSettings
                applyBlockPreset={applyBlockPreset}
                blockPresets={blockPresets}
                borderControls={borderControls}
                coord={coord}
                css={css}
                element={element}
                fill={fill}
                fillAlpha={fillAlpha}
                fillHex={fillHex}
                measured={measured}
                rotate={rotate}
                rotation={rotation}
                style={style}
              />
            )}
            {element?.frame && element.role !== "background" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => remove(element.id)}
              >
                Retirer le fond (garder le texte)
              </Button>
            )}
            </>)}
            {panelTab === "slide" && (<>
            <SlideTabSettings
              addReady={addReady}
              changeLayout={changeLayout}
              changeSlide={changeSlide}
              clipboard={clipboard}
              hasClip={hasClip}
              layoutPreviews={layoutPreviews}
              onAddPhoto={onAddPhoto}
              onOpenStudio={onOpenStudio}
              paste={paste}
              selectOne={selectOne}
              setPhotoOpen={setPhotoOpen}
              setSelected={setSelected}
              slide={slide}
            />
            </>)}
            {panelTab === "carrousel" && (
            <CarouselThemeSettings applyCarouselTheme={applyCarouselTheme} themes={themes} />
            )}
            {panelTab === "element" && element && element.role !== "background" && (
            <AllSlidesPanel
              applyAll={applyAll}
              commit={commit}
              css={css}
              document={document}
              element={element}
            />
            )}
            {panelTab === "element" && element && savedStyles && element.role !== "background" && (
              <SavedStylesPanel
                applySaved={applySaved}
                element={element}
                saveStyle={saveStyle}
                savedStyles={savedStyles}
                setStyleName={setStyleName}
                styleKind={styleKind}
                styleName={styleName}
              />
            )}
          </fieldset>
        </div>
      </div>
      <label className="block space-y-2">
        <span className="font-medium text-sm">Légende du carrousel</span>
        <Textarea
          aria-label="Légende du carrousel"
          rows={6}
          value={captionText(document.caption)}
          onChange={(e) =>
            commit(
              { ...document, caption: captionFromText(e.target.value) },
              "caption",
            )
          }
        />
      </label>
      <RedFlagsChecker
        content={[
          captionText(document.caption),
          ...document.slides
            .filter((s) => !s.locked)
            .flatMap((s) =>
              getEditorElements(s.html)
                .filter((e) => e.kind === "text")
                .map((e) => e.text),
            ),
        ].join("\n")}
        onFix={fix}
      />
      {instaOpen && (
        <CarouselInstagramPreview
          open={instaOpen}
          onOpenChange={setInstaOpen}
          slides={document.slides}
          caption={captionText(document.caption)}
          start={active}
        />
      )}
      {photoOpen && (
        <PhotoSwapDialog
          open
          onOpenChange={setPhotoOpen}
          currentPhotos={photos}
          currentIndex={slide.data.photo_index}
          onSelect={(photo) => {
            const source = photo.base64.startsWith("data:")
              ? photo.base64
              : `data:${photo.mimeType || "image/jpeg"};base64,${photo.base64}`;
            if (!/^data:image\/(png|jpeg|webp|gif);base64,/i.test(source)) {
              toast.error(
                "Format non pris en charge. Choisis une photo JPG, PNG ou WEBP.",
              );
              return;
            }
            const index = onAddPhoto?.(photo);
            if (!index) return;
            changeSlide(
              replacePhoto(
                slide,
                element?.kind === "photo" ? element.id : null,
                source,
                index,
              ),
            );
            setPhotoOpen(false);
            toast.success("Photo mise à jour");
          }}
        />
      )}
    </section>
  );
}
