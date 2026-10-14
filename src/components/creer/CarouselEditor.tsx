import { INSTAGRAM_DIRECT_MAX_IMAGES, instagramTooManyImagesReason } from "@/features/creer/publish-guards";
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { createPortal } from "react-dom";
import type { CarouselQuality } from "@/hooks/use-carousel-quality";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Undo2,
  Redo2,
  Plus,
  Copy,
  ArrowLeft,
  ArrowRight,
  Trash2,
  LockKeyhole,
  Unlock,
  ImagePlus,
  Keyboard,
  ZoomIn,
  ZoomOut,
  Smartphone,
  Bookmark,
  X,
  Maximize2,
  Minimize2,
  ChevronDown,
  AlignLeft,
  AlignCenter,
  AlignRight,
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
  GOOGLE_FONTS,
  googleFontUrl,
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
  setEmphasis,
  editorialVeilAlpha,
  setEditorialVeilAlpha,
  listLayers,
  moveLayer,
  removeLayer,
  type RemovedLayer,
  photoShapeOf,
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
  restyleSlide,
  type CarouselDocument,
  type EditorSlide,
} from "@/lib/carousel-editor";
import { numberOr, type AlignMode, type CanvasApi, type CanvasBox } from "@/components/creer/CarouselEditorParts/canvas-geometry";
import { PanelSection, SlideThumb, PhotoShapePicker } from "@/components/creer/CarouselEditorParts/PanelBits";
import SlideCanvas from "@/components/creer/CarouselEditorParts/SlideCanvas";
import { LayersPanel, MultiSelectPanel } from "@/components/creer/CarouselEditorParts/LayersPanel";
import { CarouselThemeSettings, SlideTabSettings } from "@/components/creer/CarouselEditorParts/SlideSettings";
import { alphaOf, range, toHex } from "@/components/creer/CarouselEditorParts/panel-controls";


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
const SHORTCUTS: [string, string][] = [
  ["⌘Z", "Annuler"],
  ["⌘⇧Z · Ctrl+Y", "Rétablir"],
  ["⌘C · ⌘X · ⌘V", "Copier · couper · coller (aussi sur une autre slide)"],
  ["⌘D", "Dupliquer l’élément"],
  ["⌘A", "Tout sélectionner"],
  ["Maj + clic", "Ajouter / retirer de la sélection"],
  ["Tab · Maj+Tab", "Élément suivant · précédent"],
  ["Entrée · double-clic", "Écrire dans le texte choisi"],
  ["Échap", "Valider la saisie · choisir le cadre · désélectionner"],
  ["⌘B · ⌘I · ⌘U", "Gras · italique · souligné (mots choisis en écrivant)"],
  ["Flèches · Maj+flèches", "Déplacer de 1 px · 10 px"],
  ["Suppr", "Retirer l’élément"],
  ["⌘] · ⌘[", "Passer devant · derrière"],
  ["⌘G · ⌘⇧G", "Grouper · dégrouper"],
  ["⌘⇧L", "Verrouiller · déverrouiller l’élément"],
  ["Alt + glisser", "Déplacer le texte seul, hors de son cadre"],
  ["⌘ + glisser", "Placer librement, sans repères"],
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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-display text-3xl text-primary">Personnaliser mon carrousel</h2>
          <p className="text-xs text-muted-foreground">
            Clique sur un élément ou choisis-le dans les calques. Tes retouches ne
            consomment aucun crédit IA.
          </p>
        </div>
        <div className="flex gap-1">
          <Button
            variant="outline"
            size="sm"
            disabled={!history.current.past.length}
            onClick={() => undo()}
            aria-label="Annuler la modification"
            aria-keyshortcuts="Meta+Z Control+Z"
            title="Annuler (⌘Z / Ctrl+Z)"
            className="gap-1.5"
          >
            <Undo2 size={15} /> Annuler
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!history.current.future.length}
            onClick={() => undo(true)}
            aria-label="Rétablir la modification"
            aria-keyshortcuts="Meta+Shift+Z Control+Shift+Z Control+Y"
            title="Rétablir (⌘⇧Z / Ctrl+⇧Z / Ctrl+Y)"
            className="gap-1.5"
          >
            <Redo2 size={15} /> Rétablir
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setInstaOpen(true)} aria-label="Aperçu Instagram">
            <Smartphone size={15} /> <span className="hidden sm:inline">Aperçu Instagram</span>
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5" aria-label="Voir les raccourcis clavier">
                <Keyboard size={15} /> <span className="hidden sm:inline">Raccourcis</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 text-xs">
              <p className="mb-2 font-semibold">Raccourcis clavier</p>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                {SHORTCUTS.map(([keys, label]) => (
                  <Fragment key={keys}>
                    <dt className="whitespace-nowrap font-mono text-2xs">{keys}</dt>
                    <dd>{label}</dd>
                  </Fragment>
                ))}
              </dl>
              <p className="mt-2 text-muted-foreground">Sur PC, Ctrl remplace ⌘. Clique d’abord dans l’aperçu.</p>
            </PopoverContent>
          </Popover>
        </div>
      </div>
      {toolsPortal && createPortal(
        <div className="grid gap-3 md:grid-cols-2">
      {cloudTools}
      {quality && quality.status !== "idle" && (
        <div
          className="min-w-0 rounded-xl border p-3 space-y-2 text-sm"
          aria-label="Contrôle qualité"
        >
          <div className="flex items-start justify-between gap-2">
            <p role="status" className="min-w-0 flex-1">
              {quality.status === "checking"
                ? "Contrôle de toutes les slides…"
                : quality.status === "error"
                  ? quality.message
                  : quality.issues.length
                    ? `${quality.issues.filter((i) => i.severity === "error").length} point(s) bloquant(s) · ${quality.issues.filter((i) => i.severity === "warning").length} conseil(s)`
                    : "Contrôle terminé : aucun problème détecté"}
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={quality.recheck}
              disabled={quality.status === "checking"}
            >
              Revérifier
            </Button>
          </div>
          {!!quality.issues.length && (
            <details>
              <summary className="cursor-pointer">
                Voir les points à vérifier
              </summary>
              <ul className="max-h-64 overflow-auto space-y-2 pt-2">
                {quality.issues.map((issue, index) => (
                  <li
                    key={`${issue.slide}-${issue.elementId}-${index}`}
                    className="rounded border p-2"
                  >
                    <p>
                      Slide {issue.slide + 1} —{" "}
                      {issue.severity === "error" ? "À corriger : " : ""}
                      {issue.message}
                    </p>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setActive(issue.slide);
                        setSelected(issue.elementId);
                      }}
                    >
                      Voir cet élément
                    </Button>
                    {issue.fix && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={document.slides[issue.slide]?.locked}
                        onClick={() => {
                          const target = current.current.slides[issue.slide];
                          if (!target || target.locked) return;
                          commit({
                            ...current.current,
                            slides: current.current.slides.map((s, i) =>
                              i === issue.slide
                                ? patchElement(s, issue.elementId, {
                                    styles: issue.fix,
                                  })
                                : s,
                            ),
                          });
                          setActive(issue.slide);
                          setSelected(issue.elementId);
                        }}
                      >
                        Appliquer la correction
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </details>
          )}
          <p className="text-xs text-muted-foreground">
            Bloquent la publication : textes coupés, textes trop petits pour le
            mobile et images manquantes. Le contraste et les textes posés sur
            une photo ou une transparence restent des conseils : vérifie-les à
            l’œil.
          </p>

        </div>
      )}
        </div>,
        toolsPortal,
      )}
      <div
        className="flex gap-2 overflow-x-auto pb-2"
        aria-label="Slides du carrousel"
      >
        {document.slides.map((s, i) => (
          <button
            key={s.id}
            type="button"
            data-thumb={i}
            style={{ touchAction: "none" }}
            onPointerDown={(e) => {
              thumbDrag.current = { from: i, x: e.clientX, moved: false };
              (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
            }}
            onPointerMove={(e) => {
              const d = thumbDrag.current;
              if (!d || (!d.moved && Math.abs(e.clientX - d.x) < 6)) return;
              d.moved = true;
              setDragSlide(d.from);
              setDropAt(Math.min(thumbIndexAt(e.clientX), current.current.slides.length - 1));
            }}
            onPointerUp={(e) => {
              const d = thumbDrag.current;
              thumbDrag.current = null;
              setDragSlide(null);
              setDropAt(null);
              if (d?.moved) {
                justDragged.current = true;
                const at = thumbIndexAt(e.clientX);
                reorder(d.from, at > d.from ? at - 1 : at);
              }
            }}
            onPointerCancel={() => {
              thumbDrag.current = null;
              setDragSlide(null);
              setDropAt(null);
            }}
            onClick={() => {
              if (justDragged.current) {
                justDragged.current = false;
                return;
              }
              setActive(i);
              setSelected(null);
            }}
            aria-label={`Sélectionner la slide ${i + 1}`}
            aria-pressed={i === active}
            title="Clique pour ouvrir, glisse pour changer l’ordre"
            className={`relative shrink-0 cursor-grab rounded-lg border p-1 text-2xs ${i === active ? "border-primary ring-2 ring-primary/40" : "bg-background"} ${dragSlide === i ? "opacity-50" : ""} ${dropAt === i && dragSlide !== i ? "outline outline-2 outline-offset-2 outline-primary" : ""}`}
          >
            <SlideThumb html={s.html} />
            <span className="mt-0.5 block text-center font-semibold">
              {i + 1}
              {s.locked ? " 🔒" : ""}
            </span>
          </button>
        ))}
      </div>
      {document.slides.length > INSTAGRAM_DIRECT_MAX_IMAGES && (
        <p className="text-xs text-muted-foreground">
          {instagramTooManyImagesReason(document.slides.length)}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => move(-1)}
          disabled={active === 0}
          aria-label="Monter la slide"
        >
          <ArrowLeft size={14} />
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => move(1)}
          disabled={active === document.slides.length - 1}
          aria-label="Descendre la slide"
        >
          <ArrowRight size={14} />
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={document.slides.length >= CAROUSEL_MAX_SLIDES}
          onClick={() => add()}
        >
          <Plus size={14} className="mr-1" />
          Ajouter
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={document.slides.length >= CAROUSEL_MAX_SLIDES}
          onClick={() => add(true)}
        >
          <Copy size={14} className="mr-1" />
          Dupliquer
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => changeSlide({ ...slide, locked: !slide.locked })}
        >
          {slide.locked ? <Unlock size={14} /> : <LockKeyhole size={14} />}
          <span className="ml-1">
            {slide.locked ? "Déverrouiller" : "Verrouiller"}
          </span>
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={document.slides.length <= 2 || slide.locked}
          onClick={() => {
            commit(
              renumberDocument({
                ...document,
                slides: document.slides.filter((s) => s.id !== slide.id),
              }),
            );
            setActive(Math.max(0, active - 1));
            setSelected(null);
          }}
        >
          <Trash2 size={14} className="mr-1" />
          Supprimer
        </Button>
      </div>
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
              <>
                <PanelSection title="Texte" defaultOpen>
                <Textarea
                  aria-label="Texte sélectionné"
                  value={element.text}
                  rows={3}
                  onChange={(e) => {
                    setFitId(element.id);
                    changeSlide(
                      patchElement(slide, element.id, { text: e.target.value }),
                      `text-${slide.id}-${element.id}`,
                    );
                  }}
                />
                {range(
                  "Taille du texte",
                  parseFloat(css["font-size"]) || 40,
                  18,
                  160,
                  (n) => style({ "font-size": `${n}px` }, "font"),
                )}
                <div className="space-y-1 text-xs">
                  <span>Police</span>
                  <Popover onOpenChange={(open) => {
                    // Aperçu : les polices Google se chargent dans la page à l'ouverture.
                    if (!open || window.document.querySelector("link[data-font-preview]")) return;
                    const link = window.document.createElement("link");
                    link.rel = "stylesheet";
                    link.href = googleFontUrl(GOOGLE_FONTS.map((f) => f.family));
                    link.setAttribute("data-font-preview", "true");
                    window.document.head.append(link);
                  }}>
                    <PopoverTrigger asChild>
                      <Button size="sm" variant="outline" aria-label="Choisir une police" className="h-8 w-full justify-between font-normal">
                        <span className="truncate" style={{ fontFamily: css["font-family"] || undefined }}>
                          {(css["font-family"] || "").split(",")[0].replace(/['"]/g, "").trim() || "Police du thème"}
                        </span>
                        <ChevronDown size={14} aria-hidden="true" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-72 p-2">
                      <input
                        aria-label="Chercher une police"
                        placeholder="Chercher (ex. Playfair)"
                        value={fontQuery}
                        onChange={(e) => setFontQuery(e.target.value)}
                        className="mb-2 w-full rounded border bg-background px-2 py-1 text-xs"
                      />
                      <div className="max-h-72 space-y-0.5 overflow-auto" role="listbox" aria-label="Polices">
                        {[
                          ...documentFonts.map((f) => ({ label: f.label, value: f.value, family: undefined as string | undefined, tag: "Ton carrousel" })),
                          ...["Arial, sans-serif", "Georgia, serif", "Verdana, sans-serif", "Trebuchet MS, sans-serif"].map((f) => ({ label: f.split(",")[0], value: f, family: undefined as string | undefined, tag: "Classique" })),
                          ...GOOGLE_FONTS.map((f) => ({
                            label: f.family,
                            value: `'${f.family}', ${f.kind === "serif" ? "serif" : f.kind === "script" ? "cursive" : "sans-serif"}`,
                            family: f.family as string | undefined,
                            tag: { serif: "Serif", sans: "Sans", display: "Affiche", script: "Manuscrite" }[f.kind],
                          })),
                        ]
                          .filter((f) => f.label.toLowerCase().includes(fontQuery.toLowerCase()))
                          .map((f) => (
                            <button
                              key={`${f.tag}-${f.value}`}
                              type="button"
                              role="option"
                              aria-selected={(css["font-family"] || "") === f.value || (!!f.family && (css["font-family"] || "").includes(f.family))}
                              onClick={() => pickFont(f.value, f.family)}
                              className="flex w-full items-baseline justify-between rounded px-2 py-1.5 text-left hover:bg-muted aria-selected:bg-primary/10"
                            >
                              <span style={{ fontFamily: f.value, fontSize: 18 }}>{f.label}</span>
                              <span className="text-2xs text-muted-foreground">{f.tag}</span>
                            </button>
                          ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="flex items-center justify-between gap-2 text-xs">
                  <label className="flex items-center gap-2">
                    Couleur
                    <input
                      aria-label="Couleur du texte"
                      type="color"
                      value={toHex(css.color, "#222222")}
                      onChange={(e) => style({ color: e.target.value })}
                    />
                  </label>
                  <div role="group" aria-label="Alignement du texte" className="flex gap-0.5">
                    {([
                      ["left", AlignLeft, "Aligné à gauche"],
                      ["center", AlignCenter, "Centré"],
                      ["right", AlignRight, "Aligné à droite"],
                    ] as const).map(([value, Icon, label]) => (
                      <button
                        key={value}
                        type="button"
                        aria-label={label}
                        title={label}
                        aria-pressed={(css["text-align"] || "left") === value}
                        onClick={() => style({ "text-align": value })}
                        className="rounded p-1.5 hover:bg-muted aria-pressed:bg-primary/15"
                      >
                        <Icon size={14} />
                      </button>
                    ))}
                  </div>
                </div>
                </PanelSection>
                <PanelSection title="Typographie avancée">
                {range(
                  "Interligne",
                  parseFloat(css["line-height"]) < 3
                    ? parseFloat(css["line-height"]) || 1.3
                    : 1.3,
                  1,
                  2,
                  (n) => style({ "line-height": String(n) }),
                  0.1,
                )}
                <label className="block text-xs">
                  Graisse
                  <select
                    aria-label="Graisse"
                    className="mt-1 w-full rounded border bg-background p-2"
                    value={String(parseInt(css["font-weight"], 10) || 400)}
                    onChange={(e) => style({ "font-weight": e.target.value })}
                  >
                    {[["300", "Fine"], ["400", "Normale"], ["500", "Moyenne"], ["600", "Demi-grasse"], ["700", "Grasse"], ["800", "Extra-grasse"]].map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                </label>
                {range(
                  "Espacement des lettres",
                  parseFloat(css["letter-spacing"]) || 0,
                  -5,
                  30,
                  (n) => style({ "letter-spacing": n ? `${n}px` : "" }, "spacing"),
                  0.5,
                )}
                <label className="block text-xs">
                  Casse
                  <select
                    aria-label="Casse"
                    className="mt-1 w-full rounded border bg-background p-2"
                    value={css["text-transform"] || "none"}
                    onChange={(e) => style({ "text-transform": e.target.value === "none" ? "" : e.target.value })}
                  >
                    <option value="none">Comme écrit</option>
                    <option value="uppercase">MAJUSCULES</option>
                    <option value="lowercase">minuscules</option>
                    <option value="capitalize">Capitales Initiales</option>
                  </select>
                </label>
                <label className="flex items-center justify-between text-xs">
                  Ombre du texte
                  <input
                    aria-label="Ombre du texte"
                    type="checkbox"
                    checked={textShadowOn}
                    onChange={(e) => style({ "text-shadow": e.target.checked ? "0 2px 10px rgba(0,0,0,0.45)" : "none" })}
                  />
                </label>
                </PanelSection>
                {element.emphasis && !!element.emphasis.choices.length && (
                  <PanelSection title="Phrase mise en valeur" defaultOpen>
                    <label className="block text-xs">
                      Phrase mise en valeur
                      <select
                        aria-label="Phrase mise en valeur"
                        className="mt-1 w-full rounded border bg-background p-2"
                        value={element.emphasis.choices.includes(element.emphasis.sentence) ? element.emphasis.sentence : ""}
                        onChange={(e) => e.target.value && changeSlide(setEmphasis(slide, element.id, { sentence: e.target.value }))}
                      >
                        {!element.emphasis.choices.includes(element.emphasis.sentence) && (
                          <option value="">{element.emphasis.sentence ? "Extrait actuel" : "Choisir une phrase…"}</option>
                        )}
                        {element.emphasis.choices.map((c) => (
                          <option key={c} value={c}>
                            {c.length > 60 ? `${c.slice(0, 60)}…` : c}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex items-center justify-between text-xs">
                      Couleur de la phrase mise en valeur
                      <input
                        aria-label="Couleur de la phrase mise en valeur"
                        type="color"
                        value={toHex(element.emphasis.color, toHex(css.color, "#222222"))}
                        onChange={(e) =>
                          changeSlide(
                            setEmphasis(slide, element.id, { color: e.target.value }),
                            `${slide.id}-${element.id}-emphasis`,
                          )
                        }
                      />
                    </label>
                  </PanelSection>
                )}
              </>
            )}
            {element?.kind === "photo" && (
              <>
                <PanelSection title="Photo" defaultOpen>
                <label className="block text-xs">
                  Affichage de la photo
                  <select
                    aria-label="Affichage de la photo"
                    className="mt-1 w-full rounded border bg-background p-2"
                    value={css["object-fit"] === "contain" || css["background-size"] === "contain" ? "contain" : "cover"}
                    onChange={(e) => style({
                      "object-fit": e.target.value,
                      "background-size": e.target.value,
                      "background-repeat": "no-repeat",
                      "object-position": "50% 50%",
                      "background-position": "50% 50%",
                      "--editor-zoom": "1",
                      "--editor-base-transform": "",
                      transform: "none",
                    })}
                  >
                    <option value="cover">Remplir le cadre</option>
                    <option value="contain">Voir toute la photo</option>
                  </select>
                </label>
                {range(
                  "Cadrage horizontal",
                  numberOr(
                    (
                      css["object-position"] ||
                      css["background-position"] ||
                      "50% 50%"
                    ).split(" ")[0],
                    50,
                  ),
                  0,
                  100,
                  (n) => {
                    const y =
                      (
                        css["object-position"] ||
                        css["background-position"] ||
                        "50% 50%"
                      ).split(" ")[1] || "50%";
                    style({
                      "object-position": `${n}% ${y}`,
                      "background-position": `${n}% ${y}`,
                    });
                  },
                )}
                {range(
                  "Cadrage vertical",
                  numberOr(
                    (
                      css["object-position"] ||
                      css["background-position"] ||
                      "50% 50%"
                    ).split(" ")[1],
                    50,
                  ),
                  0,
                  100,
                  (n) => {
                    const x = (
                      css["object-position"] ||
                      css["background-position"] ||
                      "50% 50%"
                    ).split(" ")[0];
                    style({
                      "object-position": `${x} ${n}%`,
                      "background-position": `${x} ${n}%`,
                    });
                  },
                )}
                {range(
                  "Zoom photo",
                  Number(css["--editor-zoom"]) || 1,
                  1,
                  3,
                  (n) => canvasApi.current?.zoomPhoto(element.id, n),
                  0.05,
                )}
                {range(
                  "Opacité photo",
                  css.opacity ? Number(css.opacity) : 1,
                  0.2,
                  1,
                  (n) => style({ opacity: String(n) }),
                  0.05,
                )}
                </PanelSection>
                <PanelSection title="Cadre de la photo">
                {measured && (measured.width < 1075 || measured.height < 1345) && (
                  <>
                        {range("Position horizontale", coord("left"), -500, 1080, (n) => style({ position: css.position || "absolute", left: `${n}px` }))}
                    {range("Position verticale", coord("top"), -500, 1350, (n) => style({ position: css.position || "absolute", top: `${n}px` }))}
                    {range("Largeur du cadre", parseFloat(css.width) || Math.round(measured.width), 60, 1080, (n) => style({ width: `${n}px` }))}
                    {range("Hauteur du cadre", parseFloat(css.height) || Math.round(measured.height), 60, 1350, (n) => style({ height: `${n}px` }))}
                  </>
                )}
                {measured && (measured.width < 1075 || measured.height < 1345) && (
                  <PhotoShapePicker current={photoShapeOf(css["border-radius"])} onPick={(radius) => style({ "border-radius": radius, overflow: "hidden" })} />
                )}
                {range("Arrondi des coins", Math.min(200, parseFloat(css["border-radius"] || css["border-top-left-radius"]) || 0), 0, 200, (n) => style({ "border-radius": `${n}px`, overflow: "hidden" }))}
                </PanelSection>
                <PanelSection title="Retouche de la photo">
                {range("Luminosité", filterValue("brightness", 1), 0.5, 1.5, (n) => setFilter({ brightness: n }), 0.05)}
                {range("Contraste", filterValue("contrast", 1), 0.5, 1.5, (n) => setFilter({ contrast: n }), 0.05)}
                {range("Saturation", filterValue("saturate", 1), 0, 2, (n) => setFilter({ saturate: n }), 0.05)}
                <div className="flex flex-wrap gap-1">
                  <Button size="sm" variant="outline" aria-pressed={filterValue("saturate", 1) === 0} onClick={() => setFilter({ saturate: filterValue("saturate", 1) === 0 ? 1 : 0 })}>
                    Noir et blanc
                  </Button>
                  {css.filter && (
                    <Button size="sm" variant="ghost" onClick={() => style({ filter: "" })}>
                      Photo d’origine
                    </Button>
                  )}
                </div>
                {measured && (measured.width < 1075 || measured.height < 1345) && borderControls}
                </PanelSection>
              </>
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
              <>
                <PanelSection title="Position et taille">
                {range(
                  "Position horizontale",
                  coord("left"),
                  -500,
                  1080,
                  (n) =>
                    style({
                      position:
                        css.position === "absolute" ? "absolute" : "relative",
                      left: `${n}px`,
                    }),
                )}
                {range(
                  "Position verticale",
                  coord("top"),
                  -500,
                  1350,
                  (n) =>
                    style({
                      position:
                        css.position === "absolute" ? "absolute" : "relative",
                      top: `${n}px`,
                    }),
                )}
                {range(
                  "Largeur du bloc",
                  parseFloat(css.width) || Math.round(measured?.width || 800),
                  60,
                  1080,
                  (n) => style({ width: `${n}px`, "max-width": "none", ...(css.right ? { right: "auto" } : {}) }),
                )}
                {element.kind === "shape" &&
                  range(
                    "Hauteur du bloc",
                    parseFloat(css[element.frame ? "min-height" : "height"]) || Math.round(measured?.height || 300),
                    40,
                    1350,
                    (n) => style({ [element.frame ? "min-height" : "height"]: `${n}px` }),
                  )}
                </PanelSection>
                <PanelSection title="Style du bloc" defaultOpen>
                {element.role !== "glass" && (
                  <div className="flex flex-wrap gap-1" role="group" aria-label="Styles de bloc tout faits">
                    {blockPresets.map((preset) => (
                      <Button key={preset.label} size="sm" variant="outline" className="h-7 text-2xs" onClick={() => applyBlockPreset(preset)}>
                        {preset.label}
                      </Button>
                    ))}
                  </div>
                )}
                <details className="space-y-3 text-xs">
                  <summary className="cursor-pointer py-1 font-medium">Personnaliser (bordure, ombre, fond, rotation)</summary>
                  <div className="space-y-3 pt-2">
                {range("Arrondi des coins", parseFloat(css["border-radius"] || css["border-top-left-radius"]) || 0, 0, 200, (n) => style({ "border-radius": `${n}px` }))}
                {borderControls}
                {element.role !== "glass" && range("Rotation", rotation, -180, 180, rotate)}
                {!!rotation && (
                  <p className="text-2xs text-muted-foreground">
                    La rotation apparaît sur l’image publiée ; dans l’export PowerPoint, un texte tourné reste droit.
                  </p>
                )}
                <label className="flex items-center justify-between text-xs">
                  Fond du bloc
                  <input
                    aria-label="Fond du bloc"
                    type="color"
                    value={fillHex}
                    onChange={(e) => fill(e.target.value, fillAlpha || 1)}
                  />
                </label>
                {range(
                  "Opacité du fond",
                  fillAlpha,
                  0,
                  1,
                  (n) => fill(fillHex, n),
                  0.05,
                )}
                <div className="flex flex-wrap gap-1">
                  <Button size="sm" variant="outline" onClick={() => fill(fillHex, 0)}>
                    Fond transparent
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    aria-pressed={css["z-index"] === "30"}
                    onClick={() =>
                      style(
                        css["z-index"] === "30"
                          ? { "z-index": "" }
                          : { "z-index": "30", ...(css.position ? {} : { position: "relative" }) },
                      )
                    }
                  >
                    {css["z-index"] === "30" ? "Remettre à sa place" : "Premier plan"}
                  </Button>
                </div>
                  </div>
                </details>
                </PanelSection>
              </>
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
            <PanelSection title="Toutes les slides">
            {element?.kind === "text" && (
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() =>
                  commit({
                    ...document,
                    slides: document.slides.map((s) => {
                      const restyled = restyleSlide(
                        s,
                        Object.fromEntries(
                          ["font-family", "color"]
                            .filter((k) => css[k])
                            .map((k) => [k, css[k]]),
                        ),
                        "texts",
                      );
                      // Une police Google suit sur chaque slide (aperçu et export).
                      const google = GOOGLE_FONTS.find((f) => (css["font-family"] || "").includes(f.family));
                      return google ? ensureFontLink(restyled, google.family) : restyled;
                    }),
                  })
                }
              >
                Police et couleur sur toutes les slides
              </Button>
            )}
            {document.slides.length > 1 && (
              <label className="block text-xs">
                Appliquer à toutes les slides
                <select
                  aria-label="Appliquer à toutes les slides"
                  className="mt-1 w-full rounded border bg-background p-2"
                  value=""
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v) applyAll({ style: v !== "position", position: v !== "style" });
                  }}
                >
                  <option value="">Reporter cet élément sur les autres slides…</option>
                  <option value="style">Son style (police, taille, couleurs)</option>
                  <option value="position">Sa position et sa largeur</option>
                  <option value="both">Son style et sa position</option>
                </select>
              </label>
            )}
            </PanelSection>
            )}
            {panelTab === "element" && element && savedStyles && element.role !== "background" && (
              <div className="space-y-2 rounded-lg border p-2" aria-label="Mes styles">
                <p className="flex items-center gap-1.5 text-xs font-medium">
                  <Bookmark size={13} /> Mes styles
                </p>
                {savedStyles.list.filter((st) => st.kind === styleKind(element)).length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {savedStyles.list
                      .filter((st) => st.kind === styleKind(element))
                      .map((st) => (
                        <span key={st.id} className="inline-flex items-center rounded-full border bg-background text-2xs">
                          <button
                            type="button"
                            className="flex items-center gap-1 py-1 pl-2 pr-1 hover:text-primary"
                            title="Appliquer ce style"
                            onClick={() => applySaved(st)}
                          >
                            {st.styles.color || st.styles["background-color"] ? (
                              <span className="h-3 w-3 rounded-full border" style={{ background: st.styles.color || st.styles["background-color"] }} />
                            ) : null}
                            {st.name}
                          </button>
                          <button
                            type="button"
                            aria-label={`Supprimer le style ${st.name}`}
                            className="rounded-full p-1 text-muted-foreground hover:text-destructive"
                            onClick={() => savedStyles.remove(st.id)}
                          >
                            <X size={11} />
                          </button>
                        </span>
                      ))}
                  </div>
                ) : (
                  <p className="text-2xs text-muted-foreground">
                    Enregistre le style de cet élément pour le réappliquer d’un clic dans tes prochains carrousels.
                  </p>
                )}
                <div className="flex gap-1">
                  <input
                    aria-label="Nom du style"
                    placeholder="Nom (ex. Titre rose)"
                    value={styleName}
                    maxLength={60}
                    onChange={(e) => setStyleName(e.target.value)}
                    className="min-w-0 flex-1 rounded border bg-background px-2 py-1 text-xs"
                  />
                  <Button size="sm" variant="outline" className="h-7 text-2xs" onClick={saveStyle}>
                    Enregistrer ce style
                  </Button>
                </div>
              </div>
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
