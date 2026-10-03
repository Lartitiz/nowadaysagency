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
  Maximize2,
  Minimize2,
  Eye,
  EyeOff,
  ChevronUp,
  ChevronDown,
  Type,
  Image as ImageIcon,
  Square,
  Layers,
  RotateCcw,
} from "lucide-react";
import PhotoSwapDialog from "@/components/creer/PhotoSwapDialog";
import type { PhotoItem } from "@/components/creer/PhotoUploadZone";
import RedFlagsChecker, { fixRedFlags } from "@/components/RedFlagsChecker";
import { toast } from "sonner";
import { hasClippedElement } from "@/lib/carousel-quality";
import { compressImageFile } from "@/lib/image-compress";
import { editHistoryShortcut } from "@/lib/edit-history-shortcut";
import {
  addPreset,
  groupElements,
  PRESETS,
  setLayerLocked,
  ungroupElement,
  type ElementRect,
  type PresetKind,
  applyToAllSlides,
  pasteElement,
  type ClipboardElement,
  documentColors,
  setElementHtml,
  setEmphasis,
  editorialVeilAlpha,
  setEditorialVeilAlpha,
  isPassiveShape,
  listLayers,
  moveLayer,
  removeLayer,
  restoreLayer,
  setLayerHidden,
  type RemovedLayer,
  addShapeElement,
  addTextElement,
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
  positionPhotoText,
  readCarouselDocument,
  renumberDocument,
  replacePhoto,
  restyleSlide,
  syncGlass,
  type CarouselDocument,
  type EditorSlide,
} from "@/lib/carousel-editor";


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
}
// Compare immutable references, not megabytes of embedded photo HTML on every
// keystroke. Parent echoes retain these exact references.
const inputKey = (raw: any, visuals: any) => [
  raw.slides || raw.carousel?.slides,
  raw.caption || raw.carousel?.caption,
  visuals,
];
const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, n));
const numberOr = (value: string | undefined, fallback: number) =>
  Number.isFinite(parseFloat(value || "")) ? parseFloat(value!) : fallback;

const VEIL = "[data-injected-scrim]";
const isPhotoEl = (el: HTMLElement) =>
  el.tagName === "IMG" ||
  el.hasAttribute("data-pptx-photo") ||
  el.hasAttribute("data-editor-photo");
/** Photo qui couvre toute la slide : on la recadre, on ne déplace pas son cadre. */
const isFullBleed = (el: HTMLElement) => {
  const r = el.getBoundingClientRect();
  return r.width >= 1075 && r.height >= 1345;
};
/** Élément choisi sous le pointeur : le plus proche, sinon le premier calque
 * en dessous (la photo est souvent recouverte par le calque de mise en page). */
function pickAt(doc: Document, target: EventTarget | null, x: number, y: number) {
  let found: HTMLElement | null = null;
  const direct = (target as HTMLElement | null)?.closest?.<HTMLElement>("[data-editor-id]");
  if (direct && !direct.matches(VEIL)) found = direct;
  else
    for (const node of doc.elementsFromPoint?.(x, y) || []) {
      const hit = node.closest<HTMLElement>("[data-editor-id]");
      if (hit && !hit.matches(VEIL)) {
        found = hit;
        break;
      }
    }
  if (found && !isPassiveShape(found)) return found;
  // Sur le fond : un élément fin (ligne, filet) tout proche est visé, à
  // 12 px près, comme dans Canva. Le plus petit l'emporte.
  let best: HTMLElement | null = null,
    area = Infinity;
  doc.querySelectorAll<HTMLElement>("[data-editor-id]").forEach((el) => {
    if (el.matches(VEIL) || isPassiveShape(el)) return;
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) return;
    if (x < r.left - 12 || x > r.right + 12 || y < r.top - 12 || y > r.bottom + 12) return;
    if (r.width * r.height < area) {
      best = el;
      area = r.width * r.height;
    }
  });
  return best || found;
}
/** Cadre le plus large qui contient l'élément (carte, verre, colonne) : on le
 * déplace avec ses textes, comme un groupe dans Canva. */
function frameOf(el: HTMLElement): HTMLElement {
  let frame = el;
  for (
    let p = el.parentElement?.closest<HTMLElement>("[data-editor-id]");
    p;
    p = p.parentElement?.closest<HTMLElement>("[data-editor-id]")
  )
    if (p.matches("[data-pptx-shape],[data-editor-shape]") && !isPassiveShape(p)) frame = p;
  return frame;
}
/** La copie floue du verre suit le cadre pendant qu'on le glisse. */
function followGlass(el: HTMLElement) {
  const blur = el.matches("[data-photo-glass]")
    ? el.querySelector<HTMLElement>("[data-photo-glass-blur]")
    : null;
  if (!blur) return;
  blur.style.left = `${-numberOr(el.style.left, 0)}px`;
  blur.style.top = `${-numberOr(el.style.top, 0)}px`;
  blur.style.removeProperty("bottom");
}
type Handle = "e" | "w" | "s" | "se";
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
type AlignMode = "left" | "center" | "right" | "top" | "middle" | "bottom" | "spread-x" | "spread-y";
interface CanvasApi {
  align: (mode: AlignMode) => void;
  copy: (ids: string[]) => ClipboardElement[];
  /** Boîtes affichées (repère de la slide), pour grouper / dégrouper sans rien décaler. */
  rects: (ids: string[]) => Record<string, ElementRect>;
}
/** Élément verrouillé (lui ou le groupe qui le contient). */
const isLockedEl = (el: HTMLElement) => !!el.closest("[data-editor-locked]");
const SNAP = 8;
/**
 * Repères d'alignement : bords et centre de la slide, bords et centres des
 * autres éléments. Renvoie la correction à appliquer et les lignes à dessiner.
 */
function snapTo(doc: Document, el: HTMLElement) {
  const r = el.getBoundingClientRect();
  const xs = [0, 540, 1080],
    ys = [0, 675, 1350];
  doc.querySelectorAll<HTMLElement>("[data-editor-id]").forEach((o) => {
    if (o === el || o.contains(el) || el.contains(o) || o.matches(VEIL) || isPassiveShape(o)) return;
    const b = o.getBoundingClientRect();
    if (!b.width || !b.height) return;
    xs.push(b.left, b.left + b.width / 2, b.right);
    ys.push(b.top, b.top + b.height / 2, b.bottom);
  });
  const best = (values: number[], targets: number[]) => {
    let out: { delta: number; line: number } | null = null;
    for (const v of values)
      for (const t of targets) {
        const delta = t - v;
        if (Math.abs(delta) <= SNAP && (!out || Math.abs(delta) < Math.abs(out.delta))) out = { delta, line: t };
      }
    return out;
  };
  return {
    x: best([r.left, r.left + r.width / 2, r.right], xs),
    y: best([r.top, r.top + r.height / 2, r.bottom], ys),
  };
}
/** Texte modifiable directement sur la slide (pas une photo ni un cadre). */
const isInlineText = (el: HTMLElement) =>
  !isPhotoEl(el) && !el.matches(VEIL) && !el.querySelector("[data-editor-id]") && !!el.textContent?.trim() &&
  !el.closest("svg");
interface CanvasBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Miniature réelle d'une slide (rendu du HTML exporté, réduit). */
function SlideThumb({ html }: { html: string }) {
  const W = 84;
  return (
    <span className="relative block overflow-hidden rounded-md bg-white" style={{ width: W, height: W * 1.25 }} aria-hidden="true">
      <iframe
        title=""
        tabIndex={-1}
        // Comme l'aperçu : pas de scripts ; une origine opaque empêchait certaines slides photo de s'afficher.
        sandbox="allow-same-origin"
        srcDoc={`<!doctype html><html><head><style>html,body{margin:0;width:1080px;height:1350px;overflow:hidden}</style></head><body>${html}</body></html>`}
        style={{ position: "absolute", width: 1080, height: 1350, border: 0, transform: `scale(${W / 1080})`, transformOrigin: "top left", pointerEvents: "none" }}
      />
    </span>
  );
}

function SlideCanvas({
  slide,
  selected,
  onSelect,
  onMove,
  onRemove,
  onEditText,
  onEditHtml,
  onFill,
  onDuplicate,
  colors,
  group,
  onSelectAdd,
  onMoveMany,
  onRemoveMany,
  onCopy,
  onPaste,
  onShortcut,
  onDropPhoto,
  onLock,
  zoom = 1,
  api,
  onMeasure,
  onHistoryKey,
}: {
  slide: EditorSlide;
  selected: string | null;
  onSelect: (id: string | null) => void;
  onMove: (id: string, styles: Record<string, string>) => void;
  onRemove: (id: string) => void;
  onEditText: (id: string, text: string) => void;
  onEditHtml: (id: string, html: string) => void;
  onFill: (id: string, hex: string) => void;
  onDuplicate: (id: string) => void;
  /** Couleurs du carrousel proposées dans la barre d'outils. */
  colors: string[];
  /** Éléments sélectionnés ensemble (Maj + clic), l'élément principal compris. */
  group: string[];
  onSelectAdd: (id: string) => void;
  onMoveMany: (moves: Record<string, Record<string, string>>) => void;
  onRemoveMany: (ids: string[]) => void;
  onCopy: () => void;
  onPaste: () => void;
  /** Raccourcis de l'éditeur (⌘D, ⌘X, ⌘A, ⌘B/I/U, ⌘]/[, Tab) ; true si traité. */
  onShortcut: (event: KeyboardEvent) => boolean;
  api: React.MutableRefObject<CanvasApi | null>;
  /** Photo glissée depuis l'ordinateur sur la slide (cible : la photo sous le pointeur). */
  onDropPhoto?: (file: File, targetId: string | null) => void;
  onLock?: (id: string, locked: boolean) => void;
  /** Zoom de l'aperçu (1 = largeur de la colonne). */
  zoom?: number;
  onMeasure?: (box: CanvasBox | null) => void;
  onHistoryKey: (event: KeyboardEvent) => void;
}) {
  const host = useRef<HTMLDivElement>(null),
    frame = useRef<HTMLIFrameElement>(null);
  const [width, setWidth] = useState(0),
    [overflow, setOverflow] = useState(false),
    [guides, setGuides] = useState<{ x: number | null; y: number | null }>({ x: null, y: null }),
    [box, setBox] = useState<
      | (CanvasBox & {
          kind: "photo" | "veil" | "text" | "shape";
          bold?: boolean;
          italic?: boolean;
          underline?: boolean;
          editorial?: boolean;
          glass?: boolean;
          locked?: boolean;
          /** L'élément verrouillé (lui-même ou son groupe), à déverrouiller. */
          lockedId?: string;
          fontSize?: number;
          align?: string;
        })
      | null
    >(null);
  const scale = width / 1080 || 1;
  // Une retouche faite DANS l'aperçu (glisser, poignée, flèche) y est déjà
  // appliquée : on ne recharge pas l'iframe (pas de clignotement, le clavier et
  // les appuis répétés ne sont plus perdus). Toute autre retouche recharge.
  const [shown, setShown] = useState(slide.html);
  const liveUntil = useRef(0);
  const recheck = useRef<() => void>(() => {});
  const shownId = useRef(slide.id);
  useEffect(() => {
    const sameSlide = shownId.current === slide.id;
    shownId.current = slide.id;
    if (sameSlide && Date.now() < liveUntil.current) {
      liveUntil.current = 0;
      recheck.current();
      return;
    }
    liveUntil.current = 0;
    setShown(slide.html);
  }, [slide.html, slide.id]);
  const commitLive = (id: string, styles: Record<string, string>) => {
    liveUntil.current = Date.now() + 1000;
    latest.current.onMove(id, styles);
  };
  const commitLiveMany = (moves: Record<string, Record<string, string>>) => {
    liveUntil.current = Date.now() + 1000;
    latest.current.onMoveMany(moves);
  };
  // L'aperçu se recharge après chaque retouche : s'il avait le clavier, il le
  // reprend (flèches répétées) ; jamais s'il a été quitté pour le panneau.
  const keepFocus = useRef(false);
  useEffect(() => {
    const leave = (e: FocusEvent) => {
      if (e.target !== frame.current) keepFocus.current = false;
    };
    window.document.addEventListener("focusin", leave);
    return () => window.document.removeEventListener("focusin", leave);
  }, []);
  const latest = useRef({ selected, onSelect, onMove, onRemove, onEditText, onEditHtml, onFill, onDuplicate, onMeasure, onHistoryKey, group, onSelectAdd, onMoveMany, onRemoveMany, onCopy, onPaste, onShortcut, onDropPhoto, onLock, locked: slide.locked });
  latest.current = { selected, onSelect, onMove, onRemove, onEditText, onEditHtml, onFill, onDuplicate, onMeasure, onHistoryKey, group, onSelectAdd, onMoveMany, onRemoveMany, onCopy, onPaste, onShortcut, onDropPhoto, onLock, locked: slide.locked };
  const [extraBoxes, setExtraBoxes] = useState<CanvasBox[]>([]);
  const [dropping, setDropping] = useState(false);
  // Barre d'outils : état de la saisie sur la slide et actions branchées sur l'aperçu.
  const [editingId, setEditingId] = useState<string | null>(null);
  const tools = useRef<{
    format: (styles: Record<string, string>) => boolean;
    startEditing: (id: string) => void;
    finish: () => void;
  }>({ format: () => false, startEditing: () => {}, finish: () => {} });
  useEffect(() => {
    const measure = () => setWidth(host.current?.clientWidth || 0);
    measure();
    const observer = new ResizeObserver(measure);
    if (host.current) observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  const target = () =>
    latest.current.selected
      ? frame.current?.contentDocument?.querySelector<HTMLElement>(
          `[data-editor-id="${latest.current.selected}"]`,
        ) || null
      : null;
  // Cadre de sélection dessiné AU-DESSUS de l'aperçu (jamais dans le HTML exporté).
  const measure = () => {
    const el = target();
    if (!el) {
      setBox(null);
      latest.current.onMeasure?.(null);
      measureGroup();
      return;
    }
    const r = el.getBoundingClientRect();
    // Calque masqué : rien à encadrer sur l'aperçu.
    if (!r.width && !r.height) {
      setBox(null);
      latest.current.onMeasure?.(null);
      return;
    }
    const next = { left: r.left, top: r.top, width: r.width, height: r.height };
    setBox({
      ...next,
      kind: isPhotoEl(el)
        ? "photo"
        : el.matches(VEIL) || isPassiveShape(el)
          ? "veil"
          : el.matches("[data-pptx-shape],[data-editor-shape]")
            ? "shape"
            : "text",
      ...(() => {
        const cs = frame.current?.contentWindow?.getComputedStyle(el);
        return cs
          ? {
              bold: parseInt(cs.fontWeight, 10) >= 600,
              italic: cs.fontStyle === "italic",
              underline: /underline/.test(cs.textDecorationLine || cs.textDecoration || ""),
              fontSize: parseFloat(cs.fontSize) || 40,
              align: cs.textAlign,
              editorial: el.hasAttribute("data-photo-editorial-text"),
              glass: el.hasAttribute("data-photo-glass"),
              locked: isLockedEl(el),
              lockedId: el.closest<HTMLElement>("[data-editor-locked]")?.dataset.editorId,
            }
          : {};
      })(),
    });
    latest.current.onMeasure?.(next);
    measureGroup();
  };
  // Cadres des autres éléments de la sélection multiple.
  const measureGroup = () => {
    const doc = frame.current?.contentDocument;
    setExtraBoxes(
      (latest.current.group || [])
        .filter((id) => id !== latest.current.selected)
        .map((id) => doc?.querySelector<HTMLElement>(`[data-editor-id="${id}"]`)?.getBoundingClientRect())
        .filter((r): r is DOMRect => !!r && (r.width > 0 || r.height > 0))
        .map((r) => ({ left: r.left, top: r.top, width: r.width, height: r.height })),
    );
  };
  useEffect(measure, [selected, slide.html, group.join(",")]);
  const bind = () => {
    const doc = frame.current?.contentDocument;
    if (!doc) return;
    const view = doc.defaultView!;
    // Keyboard events inside the sandboxed preview do not bubble to React.
    if (keepFocus.current) view.focus();
    // Édition du texte sur la slide (double-clic) : le texte devient
    // modifiable sur place ; il est enregistré quand on clique ailleurs ou
    // qu'on appuie sur Échap (⌘/Ctrl + Entrée aussi).
    let editing: { el: HTMLElement; id: string; before: string; html: string } | null = null;
    const readText = (el: HTMLElement) =>
      el.hasAttribute("data-photo-editorial-text") ? el.textContent || "" : (el.innerText ?? el.textContent ?? "").replace(/\n$/, "");
    const finishEditing = () => {
      const e = editing;
      if (!e) return;
      editing = null;
      setEditingId(null);
      e.el.removeAttribute("contenteditable");
      e.el.style.removeProperty("user-select");
      e.el.style.removeProperty("-webkit-user-select");
      e.el.style.removeProperty("cursor");
      const text = readText(e.el);
      if (!text.trim()) e.el.innerHTML = e.html;
      // Texte éditorial : le texte seul (sa mise en valeur est recomposée).
      else if (e.el.hasAttribute("data-photo-editorial-text")) {
        if (text !== e.before) latest.current.onEditText(e.id, text);
        else e.el.innerHTML = e.html;
      } else if (e.el.innerHTML !== e.html) latest.current.onEditHtml(e.id, e.el.innerHTML);
    };
    view.addEventListener("blur", finishEditing);
    // Mise en forme d'un mot : la sélection reçoit sa propre couleur/graisse.
    const format = (styles: Record<string, string>) => {
      if (!editing || editing.el.hasAttribute("data-photo-editorial-text")) return false;
      const sel = view.getSelection();
      if (!sel || sel.isCollapsed || !sel.rangeCount) return false;
      const range = sel.getRangeAt(0);
      if (!editing.el.contains(range.commonAncestorContainer)) return false;
      const start = range.startContainer.nodeType === 3 ? range.startContainer.parentElement! : (range.startContainer as HTMLElement);
      const cs = view.getComputedStyle(start);
      const next = { ...styles };
      // Bascule : un mot déjà en gras / italique / souligné revient à la normale.
      if (next["font-weight"] === "toggle") next["font-weight"] = parseInt(cs.fontWeight, 10) >= 600 ? "400" : "700";
      if (next["font-style"] === "toggle") next["font-style"] = cs.fontStyle === "italic" ? "normal" : "italic";
      if (next["text-decoration"] === "toggle")
        next["text-decoration"] = /underline/.test(cs.textDecorationLine || "") ? "none" : "underline";
      const fragment = range.extractContents();
      fragment.querySelectorAll?.<HTMLElement>("[style]").forEach((n) => Object.keys(next).forEach((k) => n.style.removeProperty(k)));
      const span = doc.createElement("span");
      Object.entries(next).forEach(([k, v]) => span.style.setProperty(k, v));
      span.append(fragment);
      range.insertNode(span);
      sel.removeAllRanges();
      const r = doc.createRange();
      r.selectNodeContents(span);
      sel.addRange(r);
      return true;
    };
    const startEditing = (el: HTMLElement) => {
      finishEditing();
      editing = { el, id: el.dataset.editorId!, before: readText(el), html: el.innerHTML };
      setEditingId(editing.id);
      const editorial = el.hasAttribute("data-photo-editorial-text");
      el.setAttribute("contenteditable", editorial ? "plaintext-only" : "true");
      if (editorial && el.contentEditable !== "plaintext-only") el.setAttribute("contenteditable", "true");
      el.style.setProperty("user-select", "text");
      el.style.setProperty("-webkit-user-select", "text");
      el.style.setProperty("cursor", "text");
      el.focus();
      const range = doc.createRange();
      range.selectNodeContents(el);
      const sel = view.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      latest.current.onSelect(editing.id);
    };
    tools.current = {
      format,
      finish: finishEditing,
      startEditing: (id) => {
        const el = doc.querySelector<HTMLElement>(`[data-editor-id="${id}"]`);
        if (el && isInlineText(el) && !latest.current.locked) {
          view.focus();
          startEditing(el);
        }
      },
    };
    // Aligner / répartir la sélection multiple, copier des éléments.
    api.current = {
      align: (mode) => {
        const members = (latest.current.group || [])
          .map((id) => doc.querySelector<HTMLElement>(`[data-editor-id="${id}"]`))
          .filter((m): m is HTMLElement => !!m && !(isPhotoEl(m) && isFullBleed(m)) && !m.matches(VEIL) && !isPassiveShape(m));
        if (members.length < 2) return;
        const items = members.map((el) => {
          const r = el.getBoundingClientRect();
          const cs = view.getComputedStyle(el);
          return { el, r, left: numberOr(cs.left, 0), top: numberOr(cs.top, 0), abs: cs.position === "absolute" };
        });
        const minL = Math.min(...items.map((i) => i.r.left)), maxR = Math.max(...items.map((i) => i.r.right));
        const minT = Math.min(...items.map((i) => i.r.top)), maxB = Math.max(...items.map((i) => i.r.bottom));
        const dxOf = new Map<HTMLElement, number>(), dyOf = new Map<HTMLElement, number>();
        items.forEach((i) => {
          if (mode === "left") dxOf.set(i.el, minL - i.r.left);
          if (mode === "right") dxOf.set(i.el, maxR - i.r.right);
          if (mode === "center") dxOf.set(i.el, (minL + maxR) / 2 - (i.r.left + i.r.width / 2));
          if (mode === "top") dyOf.set(i.el, minT - i.r.top);
          if (mode === "bottom") dyOf.set(i.el, maxB - i.r.bottom);
          if (mode === "middle") dyOf.set(i.el, (minT + maxB) / 2 - (i.r.top + i.r.height / 2));
        });
        if (mode === "spread-x" || mode === "spread-y") {
          const x = mode === "spread-x";
          const sorted = [...items].sort((a, b) => (x ? a.r.left - b.r.left : a.r.top - b.r.top));
          const span = x ? maxR - minL : maxB - minT;
          const sizes = sorted.reduce((sum, i) => sum + (x ? i.r.width : i.r.height), 0);
          const gap = (span - sizes) / (sorted.length - 1);
          let cursor = x ? minL : minT;
          sorted.forEach((i) => {
            (x ? dxOf : dyOf).set(i.el, cursor - (x ? i.r.left : i.r.top));
            cursor += (x ? i.r.width : i.r.height) + gap;
          });
        }
        const moves: Record<string, Record<string, string>> = {};
        items.forEach((i) => {
          const dx = dxOf.get(i.el) || 0, dy = dyOf.get(i.el) || 0;
          if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
          moves[i.el.dataset.editorId!] = {
            position: i.abs ? "absolute" : "relative",
            left: `${Math.round(i.left + dx)}px`,
            top: `${Math.round(i.top + dy)}px`,
            ...(i.abs && i.el.style.right && !i.el.style.width ? { width: `${Math.round(i.r.width)}px` } : {}),
          };
        });
        if (Object.keys(moves).length) latest.current.onMoveMany(moves);
      },
      copy: (ids) =>
        ids
          .map((id) => doc.querySelector<HTMLElement>(`[data-editor-id="${id}"]`))
          .filter((el): el is HTMLElement => !!el && !isPassiveShape(el) && !el.matches(VEIL))
          .map((el) => {
            const r = el.getBoundingClientRect();
            return { html: el.outerHTML, rect: { left: r.left, top: r.top, width: r.width, height: r.height } };
          }),
      rects: (ids) =>
        Object.fromEntries(
          ids
            .map((id) => [id, doc.querySelector<HTMLElement>(`[data-editor-id="${id}"]`)?.getBoundingClientRect()] as const)
            .filter(([, r]) => !!r && (r.width > 0 || r.height > 0))
            .map(([id, r]) => [id, { left: r!.left, top: r!.top, width: r!.width, height: r!.height }]),
        ),
    };
    doc.addEventListener("dblclick", (e) => {
      if (latest.current.locked) return;
      // Déjà en train d'écrire ici : le double-clic choisit un mot.
      if (editing && editing.el.contains(e.target as Node)) return;
      const el = pickAt(doc, e.target, e.clientX, e.clientY);
      if (!el || !isInlineText(el) || isLockedEl(el)) return;
      e.preventDefault();
      startEditing(el);
    });
    doc.addEventListener("keydown", (event) => {
      keepFocus.current = true;
      if (editing) {
        if (event.key === "Escape" || (event.key === "Enter" && (event.metaKey || event.ctrlKey))) {
          event.preventDefault();
          finishEditing();
        }
        // ⌘/Ctrl + B, I, U : sur les mots choisis (même mise en forme que la barre).
        const word = { b: { "font-weight": "toggle" }, i: { "font-style": "toggle" }, u: { "text-decoration": "toggle" } }[
          (event.metaKey || event.ctrlKey) && !event.altKey ? event.key.toLowerCase() : ""
        ];
        if (word) {
          event.preventDefault();
          format(word);
        }
        // Pendant la saisie, flèches, Suppr et ⌘Z agissent sur le texte.
        return;
      }
      // Copier / coller (⌘/Ctrl + C, V).
      if ((event.metaKey || event.ctrlKey) && !event.shiftKey && (event.key === "c" || event.key === "v")) {
        event.preventDefault();
        if (event.key === "c") latest.current.onCopy();
        else latest.current.onPaste();
        return;
      }
      if (latest.current.onShortcut(event)) {
        event.preventDefault();
        return;
      }
      // Entrée : écrire dans le texte choisi (comme un double-clic).
      if (event.key === "Enter" && !event.metaKey && !event.ctrlKey && latest.current.selected) {
        const chosen = target();
        if (chosen && isInlineText(chosen) && !latest.current.locked && !isLockedEl(chosen)) {
          event.preventDefault();
          startEditing(chosen);
          return;
        }
      }
      const el = target();
      const many = (latest.current.group || []).length > 1;
      if (el && many && !latest.current.locked) {
        const step = event.shiftKey ? 10 : 1;
        const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[event.key];
        const members = latest.current.group
          .map((id) => doc.querySelector<HTMLElement>(`[data-editor-id="${id}"]`))
          .filter((m): m is HTMLElement => !!m && !(isPhotoEl(m) && isFullBleed(m)) && !m.matches(VEIL) && !isPassiveShape(m) && !isLockedEl(m));
        if (d) {
          event.preventDefault();
          const moves: Record<string, Record<string, string>> = {};
          members.forEach((m) => {
            const cs = view.getComputedStyle(m);
            const styles = {
              position: cs.position === "absolute" ? "absolute" : "relative",
              left: `${Math.round(numberOr(cs.left, 0) + d[0])}px`,
              top: `${Math.round(numberOr(cs.top, 0) + d[1])}px`,
            };
            Object.entries(styles).forEach(([k, v]) => m.style.setProperty(k, v));
            followGlass(m);
            moves[m.dataset.editorId!] = styles;
          });
          measure();
          commitLiveMany(moves);
          return;
        }
        if (event.key === "Delete" || event.key === "Backspace") {
          event.preventDefault();
          latest.current.onRemoveMany(latest.current.group);
          return;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          latest.current.onSelect(latest.current.selected);
          return;
        }
      }
      if (el && !latest.current.locked) {
        const id = el.dataset.editorId!;
        const step = event.shiftKey ? 10 : 1;
        const arrows: Record<string, [number, number]> = {
          ArrowLeft: [-step, 0],
          ArrowRight: [step, 0],
          ArrowUp: [0, -step],
          ArrowDown: [0, step],
        };
        const delta = arrows[event.key];
        const elLocked = isLockedEl(el);
        if (delta && !elLocked && (!isPhotoEl(el) || !isFullBleed(el)) && !el.matches(VEIL) && !isPassiveShape(el)) {
          event.preventDefault();
          const computed = view.getComputedStyle(el);
          const absolute = computed.position === "absolute";
          const styles = {
            position: absolute ? "absolute" : "relative",
            left: `${Math.round(numberOr(computed.left, 0) + delta[0])}px`,
            top: `${Math.round(numberOr(computed.top, 0) + delta[1])}px`,
            ...(absolute && el.style.right && !el.style.width
              ? { width: `${Math.round(el.getBoundingClientRect().width)}px`, right: "auto" }
              : {}),
          };
          Object.entries(styles).forEach(([k, v]) => el.style.setProperty(k, v));
          el.style.bottom = "auto";
          followGlass(el);
          measure();
          commitLive(id, styles);
          return;
        }
        if ((event.key === "Delete" || event.key === "Backspace") && !elLocked && !el.matches('[data-pptx-shape="background"]')) {
          event.preventDefault();
          latest.current.onRemove(id);
          return;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          const parent = el.parentElement?.closest<HTMLElement>("[data-editor-id]");
          latest.current.onSelect(parent?.dataset.editorId || null);
          return;
        }
      }
      latest.current.onHistoryKey(event);
    });
    let drag: {
      id: string;
      x: number;
      y: number;
      left: number;
      top: number;
      photo: boolean;
      el: HTMLElement;
      inner: HTMLElement;
      fixedWidth: string | null;
      /** Les autres éléments de la sélection multiple, déplacés ensemble. */
      members: { el: HTMLElement; left: number; top: number }[];
      shift: boolean;
    } | null = null;
    // Photo glissée depuis l'ordinateur : elle remplace la photo visée (ou la photo de la slide).
    const hasFile = (e: DragEvent) => Array.from(e.dataTransfer?.types || []).includes("Files");
    doc.addEventListener("dragover", (e) => {
      if (!hasFile(e) || latest.current.locked || !latest.current.onDropPhoto) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
      setDropping(true);
    });
    doc.addEventListener("dragleave", (e) => {
      if (!e.relatedTarget) setDropping(false);
    });
    doc.addEventListener("drop", (e) => {
      setDropping(false);
      const file = Array.from(e.dataTransfer?.files || []).find((f) => f.type.startsWith("image/"));
      if (!file || latest.current.locked || !latest.current.onDropPhoto) return;
      e.preventDefault();
      const under = (doc.elementsFromPoint?.(e.clientX, e.clientY) || [])
        .map((n) => n.closest<HTMLElement>("[data-editor-id]"))
        .find((n): n is HTMLElement => !!n && isPhotoEl(n));
      latest.current.onDropPhoto(file, under?.dataset.editorId || null);
    });
    doc.addEventListener("click", (e) => {
      e.preventDefault();
      view.focus();
    });
    doc.addEventListener("pointerdown", (e) => {
      if (editing && editing.el.contains(e.target as Node)) return;
      finishEditing();
      const inner = pickAt(doc, e.target, e.clientX, e.clientY);
      // Clic dans le vide : on désélectionne, comme dans Canva.
      if (!inner) {
        latest.current.onSelect(null);
        return;
      }
      // preventDefault below disables native pointer focus; explicitly focus
      // the preview so subsequent ⌘Z/Ctrl+Z reaches its keydown listener.
      view.focus();
      keepFocus.current = true;
      if (latest.current.locked || isLockedEl(inner)) {
        latest.current.onSelect(inner.dataset.editorId!);
        return;
      }
      // Glisser déplace le cadre entier ; Alt + glisser déplace l'élément seul.
      // Le fond de la slide se choisit mais ne se déplace pas.
      if (isPassiveShape(inner) && !isPhotoEl(inner)) {
        latest.current.onSelect(inner.dataset.editorId!);
        return;
      }
      const el = e.altKey || isPhotoEl(inner) ? inner : frameOf(inner);
      const photo = isPhotoEl(el);
      const pos = (
        el.style.objectPosition ||
        el.style.backgroundPosition ||
        "50% 50%"
      ).split(" ");
      const computed = view.getComputedStyle(el);
      // Un cadre ancré par ses deux côtés (verre) garde sa largeur en bougeant.
      const fixedWidth =
        !photo && computed.position === "absolute" && el.style.right && !el.style.width
          ? `${Math.round(el.getBoundingClientRect().width)}px`
          : null;
      drag = {
        id: el.dataset.editorId!,
        x: e.clientX,
        y: e.clientY,
        left: photo ? numberOr(pos[0], 50) : numberOr(computed.left, 0),
        top: photo ? numberOr(pos[1], 50) : numberOr(computed.top, 0),
        photo,
        el,
        inner,
        fixedWidth,
        shift: e.shiftKey,
        members:
          !photo && (latest.current.group || []).length > 1 &&
          (latest.current.group.includes(el.dataset.editorId!) || latest.current.group.includes(inner.dataset.editorId!))
            ? latest.current.group
                .map((id) => doc.querySelector<HTMLElement>(`[data-editor-id="${id}"]`))
                .filter((m): m is HTMLElement => !!m && m !== el && m !== inner && !isPhotoEl(m) && !m.matches(VEIL) && !isPassiveShape(m) && !isLockedEl(m))
                .map((m) => {
                  const cs = view.getComputedStyle(m);
                  return { el: m, left: numberOr(cs.left, 0), top: numberOr(cs.top, 0) };
                })
            : [],
      };
      el.setPointerCapture?.(e.pointerId);
      e.preventDefault();
    });
    doc.addEventListener("pointermove", (e) => {
      if (!drag) return;
      const d = drag,
        dx = e.clientX - d.x,
        dy = e.clientY - d.y;
      if (Math.abs(dx) + Math.abs(dy) < 5) return;
      if (d.photo) {
        const pos = `${clamp(d.left - dx / 10.8, 0, 100)}% ${clamp(d.top - dy / 13.5, 0, 100)}%`;
        d.el.style.objectPosition = pos;
        d.el.style.backgroundPosition = pos;
        syncGlass(doc);
      } else {
        if (d.el.style.position !== "absolute")
          d.el.style.position = "relative";
        if (d.fixedWidth) {
          d.el.style.width = d.fixedWidth;
          d.el.style.right = "auto";
        }
        d.el.style.bottom = "auto";
        d.el.style.left = `${d.left + dx}px`;
        d.el.style.top = `${d.top + dy}px`;
        // Repères d'alignement (⌘/Ctrl maintenu : placement libre).
        const snap = e.metaKey || e.ctrlKey || d.members.length ? { x: null, y: null } : snapTo(doc, d.el);
        d.members.forEach((m) => {
          if (m.el.style.position !== "absolute") m.el.style.position = "relative";
          m.el.style.left = `${m.left + dx}px`;
          m.el.style.top = `${m.top + dy}px`;
          followGlass(m.el);
        });
        if (snap.x) d.el.style.left = `${d.left + dx + snap.x.delta}px`;
        if (snap.y) d.el.style.top = `${d.top + dy + snap.y.delta}px`;
        setGuides({ x: snap.x?.line ?? null, y: snap.y?.line ?? null });
        followGlass(d.el);
      }
      if (!d.members.length && latest.current.selected !== d.id) latest.current.onSelect(d.id);
      else measure();
    });
    doc.addEventListener("pointerup", (e) => {
      if (!drag) return;
      const d = drag;
      drag = null;
      const dx = e.clientX - d.x,
        dy = e.clientY - d.y;
      setGuides({ x: null, y: null });
      // Simple clic : on choisit l'élément précis (le texte dans sa carte) ;
      // Maj + clic l'ajoute à la sélection (ou l'en retire).
      if (Math.abs(dx) + Math.abs(dy) < 5) {
        if (d.shift) latest.current.onSelectAdd(d.inner.dataset.editorId!);
        else latest.current.onSelect(d.inner.dataset.editorId!);
        return;
      }
      if (d.members.length) {
        const moves: Record<string, Record<string, string>> = {};
        [{ el: d.el }, ...d.members].forEach(({ el: m }) => {
          moves[m.dataset.editorId!] = {
            position: m.style.position === "absolute" ? "absolute" : "relative",
            left: `${Math.round(numberOr(m.style.left, 0))}px`,
            top: `${Math.round(numberOr(m.style.top, 0))}px`,
            ...(m === d.el && d.fixedWidth ? { width: d.fixedWidth } : {}),
          };
        });
        commitLiveMany(moves);
        return;
      }
      latest.current.onSelect(d.id);
      if (d.photo) {
        const pos = `${clamp(d.left - dx / 10.8, 0, 100)}% ${clamp(d.top - dy / 13.5, 0, 100)}%`;
        commitLive(d.id, {
          "object-position": pos,
          "background-position": pos,
        });
      } else
        commitLive(d.id, {
          position:
            d.el.style.position === "absolute" ? "absolute" : "relative",
          left: `${Math.round(numberOr(d.el.style.left, d.left + dx))}px`,
          top: `${Math.round(numberOr(d.el.style.top, d.top + dy))}px`,
          ...(d.fixedWidth ? { width: d.fixedWidth } : {}),
        });
    });
    doc.addEventListener("pointercancel", () => {
      drag = null;
      setGuides({ x: null, y: null });
    });
    // Même inspection géométrique que le contrôle qualité global : l'aperçu
    // n'annonce jamais un débordement que la QA ignorerait, ni l'inverse.
    const check = () => setOverflow(hasClippedElement(doc));
    recheck.current = () => {
      check();
      measure();
    };
    check();
    measure();
    doc.fonts?.ready.then(() => {
      check();
      measure();
    });
  };
  // Poignées : élargir, rétrécir, allonger ; le coin agrandit aussi le texte.
  const startResize = (handle: Handle) => (e: React.PointerEvent<HTMLDivElement>) => {
    const el = target();
    const view = frame.current?.contentWindow;
    if (!el || !view || slide.locked) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    const computed = view.getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const text = !el.matches("[data-pptx-shape],[data-editor-shape]") && !isPhotoEl(el);
    const frameLike = !!el.querySelector("[data-editor-id]");
    const start = {
      x: e.clientX,
      y: e.clientY,
      w: r.width,
      h: r.height,
      left: numberOr(computed.left, 0),
      font: numberOr(computed.fontSize, 40),
      position: computed.position === "absolute" ? "absolute" : "relative",
    };
    let styles: Record<string, string> = {};
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - start.x) / scale,
        dy = (ev.clientY - start.y) / scale;
      const w = Math.max(60, start.w + (handle === "w" ? -dx : dx));
      styles = {};
      if (handle !== "s") {
        styles.width = `${Math.round(w)}px`;
        styles["max-width"] = "none";
        if (el.style.right) styles.right = "auto";
      }
      if (handle === "w") {
        styles.position = start.position;
        styles.left = `${Math.round(start.left + start.w - w)}px`;
      }
      if (handle === "se" && text)
        styles["font-size"] = `${Math.round(clamp((start.font * w) / start.w, 18, 200))}px`;
      if (handle === "s" || (handle === "se" && !text))
        styles[frameLike ? "min-height" : "height"] = `${Math.round(Math.max(40, start.h + dy))}px`;
      Object.entries(styles).forEach(([k, v]) => el.style.setProperty(k, v));
      followGlass(el);
      measure();
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (Object.keys(styles).length)
        commitLive(el.dataset.editorId!, styles);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  const handles: Handle[] =
    !box || slide.locked || box.locked || box.kind === "veil" || (box.kind === "photo" && box.width >= 1075 && box.height >= 1345)
      ? []
      : box.kind === "text"
        ? ["w", "e", "se"]
        : ["w", "e", "s", "se"];
  // Écran tactile : poignées plus grandes, faciles à attraper au doigt.
  const coarse = typeof window !== "undefined" && !!window.matchMedia?.("(pointer: coarse)").matches;
  const handleStyle = (h: Handle): React.CSSProperties => {
    const size = coarse ? 24 : 14;
    const base: React.CSSProperties = {
      position: "absolute",
      width: size,
      height: size,
      background: "#ffffff",
      border: "2px solid #c02769",
      borderRadius: 999,
      pointerEvents: "auto",
      touchAction: "none",
    };
    if (h === "e") return { ...base, right: -size / 2, top: "50%", marginTop: -size / 2, cursor: "ew-resize" };
    if (h === "w") return { ...base, left: -size / 2, top: "50%", marginTop: -size / 2, cursor: "ew-resize" };
    if (h === "s") return { ...base, bottom: -size / 2, left: "50%", marginLeft: -size / 2, cursor: "ns-resize" };
    return { ...base, right: -size / 2, bottom: -size / 2, cursor: "nwse-resize" };
  };

  // Barre d'outils flottante au-dessus de l'élément choisi (comme Canva).
  const apply = (word: Record<string, string>, whole: Record<string, string>) => {
    if (!selected) return;
    if (tools.current.format(word)) return;
    tools.current.finish();
    latest.current.onMove(selected, whole);
  };
  const keep = (e: React.MouseEvent) => e.preventDefault(); // garde la sélection dans la slide
  const toolButton = "flex h-8 min-w-8 items-center justify-center rounded-md px-1.5 text-xs font-semibold hover:bg-muted aria-pressed:bg-primary/15";
  const toolbar =
    box && selected && !slide.locked && box.kind !== "veil" ? (
      <div
        role="toolbar"
        aria-label="Barre d’outils de l’élément"
        onMouseDown={keep}
        className="absolute z-10 flex max-w-full flex-wrap items-center gap-0.5 rounded-lg border bg-background p-1 shadow-lg"
        style={{
          left: Math.max(4, Math.min(box.left * scale, width - 300)),
          top: box.top * scale > 52 ? box.top * scale - 48 : Math.min((box.top + box.height) * scale + 8, width * 1.25 - 48),
        }}
      >
        {box.locked && (
          <button type="button" className={toolButton} aria-label="Déverrouiller l’élément" onClick={() => latest.current.onLock?.(box.lockedId || selected, false)}>
            <Unlock size={14} className="mr-1" /> Déverrouiller
          </button>
        )}
        {!box.locked && box.kind === "text" && (
          <>
            <button type="button" className={toolButton} aria-pressed={!!box.bold} aria-label="Gras" title="Gras (sur les mots choisis en écrivant)"
              onClick={() => apply({ "font-weight": "toggle" }, { "font-weight": box.bold ? "400" : "700" })}>B</button>
            <button type="button" className={`${toolButton} italic`} aria-pressed={!!box.italic} aria-label="Italique"
              onClick={() => apply({ "font-style": "toggle" }, { "font-style": box.italic ? "normal" : "italic" })}>I</button>
            <button type="button" className={`${toolButton} underline`} aria-pressed={!!box.underline} aria-label="Souligné"
              onClick={() => apply({ "text-decoration": "toggle" }, { "text-decoration": box.underline ? "none" : "underline" })}>U</button>
            <button type="button" className={toolButton} aria-label="Réduire le texte"
              onClick={() => { tools.current.finish(); latest.current.onMove(selected, { "font-size": `${Math.max(18, Math.round((box.fontSize || 40) - 4))}px` }); }}>A−</button>
            <button type="button" className={toolButton} aria-label="Agrandir le texte"
              onClick={() => { tools.current.finish(); latest.current.onMove(selected, { "font-size": `${Math.min(200, Math.round((box.fontSize || 40) + 4))}px` }); }}>A+</button>
            <button type="button" className={toolButton} aria-label="Changer l’alignement"
              title="Alignement"
              onClick={() => { tools.current.finish(); latest.current.onMove(selected, { "text-align": box.align === "left" || box.align === "start" ? "center" : box.align === "center" ? "right" : "left" }); }}>
              {box.align === "center" ? "≡" : box.align === "right" ? "⫶" : "☰"}
            </button>
          </>
        )}
        {!box.locked && (
          <>
        {box.kind !== "photo" &&
          colors.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`${box.kind === "text" ? "Couleur du texte" : "Couleur du fond"} ${c}`}
              title={box.kind === "text" ? (editingId ? "Couleur des mots choisis (ou du texte)" : "Couleur du texte") : "Couleur du fond"}
              className="m-0.5 h-5 w-5 rounded-full border border-black/20"
              style={{ background: c }}
              onClick={() =>
                box.kind === "text"
                  ? apply({ color: c }, { color: c })
                  : latest.current.onFill?.(selected, c)
              }
            />
          ))}
        {box.kind === "text" && !editingId && (
          <button type="button" className={toolButton} onClick={() => tools.current.startEditing(selected)}>Écrire</button>
        )}
        {box.kind === "text" && editingId && box.editorial && (
          <span className="px-1 text-2xs text-muted-foreground">Mots : utilise la phrase mise en valeur</span>
        )}
        <button type="button" className={toolButton} aria-label="Copier l’élément" title="Copier (⌘/Ctrl + C), puis coller ici ou sur une autre slide"
          onClick={() => { tools.current.finish(); latest.current.onCopy(); }}>Copier</button>
        {box.kind !== "photo" && !box.glass && (
          <button type="button" className={toolButton} aria-label="Dupliquer l’élément" title="Dupliquer"
            onClick={() => { tools.current.finish(); latest.current.onDuplicate?.(selected); }}><Copy size={14} /></button>
        )}
        <button type="button" className={toolButton} aria-label="Retirer l’élément" title="Retirer"
          onClick={() => { tools.current.finish(); latest.current.onRemove(selected); }}><Trash2 size={14} /></button>
            <button type="button" className={toolButton} aria-label="Verrouiller l’élément" title="Verrouiller (⌘⇧L) : il ne bougera plus par erreur"
              onClick={() => { tools.current.finish(); latest.current.onLock?.(selected, true); }}><LockKeyhole size={14} /></button>
          </>
        )}
      </div>
    ) : null;
  return (
    <div className={zoom > 1 ? "max-h-[75vh] overflow-auto rounded-xl" : undefined}>
      <div
        ref={host}
        className="relative overflow-hidden rounded-xl border bg-white shadow-sm"
        style={{ aspectRatio: "1080 / 1350", width: `${zoom * 100}%` }}
      >
        {dropping && (
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-primary/20 text-sm font-semibold text-primary">
            Dépose la photo ici
          </div>
        )}
        {width > 0 && (
          <iframe
            ref={frame}
            title={`Éditeur de la slide ${slide.data.slide_number}`}
            sandbox="allow-same-origin"
            onLoad={bind}
            srcDoc={`<!doctype html><html><head><style>html,body{margin:0;width:1080px;height:1350px;overflow:hidden;-webkit-user-select:none;user-select:none;touch-action:none}*{box-sizing:border-box}[data-editor-id]{cursor:${slide.locked ? "default" : "move"}}</style></head><body>${shown}</body></html>`}
            style={{
              position: "absolute",
              width: 1080,
              height: 1350,
              border: 0,
              transform: `scale(${scale})`,
              transformOrigin: "top left",
            }}
          />
        )}
        {guides.x !== null && (
          <div aria-hidden="true" data-testid="guide-x" style={{ position: "absolute", top: 0, bottom: 0, left: guides.x * scale, width: 0, borderLeft: "1px dashed #FB3D80", pointerEvents: "none" }} />
        )}
        {guides.y !== null && (
          <div aria-hidden="true" data-testid="guide-y" style={{ position: "absolute", left: 0, right: 0, top: guides.y * scale, height: 0, borderTop: "1px dashed #FB3D80", pointerEvents: "none" }} />
        )}
        {toolbar}
        {extraBoxes.map((b, i) => (
          <div
            key={i}
            aria-hidden="true"
            data-testid="group-box"
            style={{ position: "absolute", left: b.left * scale, top: b.top * scale, width: b.width * scale, height: b.height * scale, border: "2px dashed #c02769", borderRadius: 4, pointerEvents: "none" }}
          />
        ))}
        {box && (
          <div
            aria-hidden="true"
            data-testid="selection-box"
            style={{
              position: "absolute",
              left: box.left * scale,
              top: box.top * scale,
              width: box.width * scale,
              height: box.height * scale,
              border: "2px solid #c02769",
              borderRadius: 4,
              pointerEvents: "none",
            }}
          >
            {handles.map((h) => (
              <div
                key={h}
                data-handle={h}
                style={handleStyle(h)}
                onPointerDown={startResize(h)}
              />
            ))}
          </div>
        )}
      </div>
      {overflow && (
        <p role="status" className="mt-2 text-xs text-amber-700">
          Un élément dépasse ou manque de place. Ajuste sa taille ou sa position
          avant d’exporter.
        </p>
      )}
    </div>
  );
}

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
  useEffect(() => setExtra([]), [active]);
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
  const palette = useMemo(() => documentColors(document.slides), [document.slides]);
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
  const changeTemplate = (type: string) => {
    if (slide.locked) return;
    const doc = new DOMParser().parseFromString(slide.html, "text/html");
    const img = doc.querySelector<HTMLImageElement>("img");
    const bg = doc
      .querySelector<HTMLElement>("[data-pptx-photo],[data-editor-photo]")
      ?.style.backgroundImage.match(/url\(["']?(.*?)["']?\)/)?.[1];
    changeSlide({
      // La mise en page change, la charte de la slide reste.
      ...makeSlide(
        slide.data,
        type,
        img?.src || bg || "",
        extractStyleTokens(slide.html),
      ),
      id: slide.id,
    });

    setSelected(null);
  };
  const range = (
    label: string,
    value: number,
    min: number,
    max: number,
    onValue: (n: number) => void,
    step = 1,
  ) => (
    <label className="block text-xs space-y-1">
      <span className="flex items-center justify-between gap-2">
        <span>{label}</span>
        <input
          aria-label={`${label} (valeur)`}
          type="number"
          min={min}
          max={max}
          step={step}
          value={Math.round(value * 10) / 10}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isNaN(n)) return;
            onValue(Math.min(max, Math.max(min, n)));
          }}
          className="w-16 rounded-md border border-input bg-background px-1 py-0.5 text-right text-xs"
        />
      </span>
      <input
        aria-label={label}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onValue(Number(e.target.value))}
        className="w-full accent-primary"
      />
    </label>

  );
  const css = element?.style || {};
  const toHex = (value: string | undefined, fallback: string) => {
    if (/^#[0-9a-f]{6}$/i.test(value || "")) return value!;
    const rgb = value?.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    return rgb
      ? `#${rgb
          .slice(1)
          .map((v) => Number(v).toString(16).padStart(2, "0"))
          .join("")}`
      : fallback;
  };
  const alphaOf = (value: string | undefined) => {
    if (!value || value === "transparent") return 0;
    const m = value.match(/^rgba\([^)]*,\s*([\d.]+)\s*\)/);
    return m ? Number(m[1]) : 1;
  };
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
    <section ref={editorRoot} tabIndex={-1} aria-label="Éditeur de carrousel" className="min-w-0 w-full space-y-4" onKeyDown={(event) => {
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
      {document.slides.length > 10 && (
        <p className="text-xs text-muted-foreground">
          Ce carrousel dépasse les 10 images prises en charge par la publication
          directe de l’outil. Tu peux exporter les slides pour publier depuis
          Instagram.
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
            onMoveMany={moveMany}
            onRemoveMany={removeMany}
            onCopy={copySelection}
            onPaste={paste}
            onShortcut={shortcut}
            api={canvasApi}
            onDropPhoto={onAddPhoto ? dropPhoto : undefined}
            onLock={lockElement}
            zoom={fullscreen ? 1 : zoom}
            onMeasure={setMeasured}
            onMove={(id, styles) =>
              changeSlide(patchElement(slide, id, { styles }))
            }
            onRemove={remove}
            onEditText={(id, text) =>
              changeSlide(patchElement(slide, id, { text }), `text-${slide.id}-${id}`)
            }
            onEditHtml={(id, html) => changeSlide(setElementHtml(slide, id, html))}
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
          <p className="mt-2 hidden text-xs text-muted-foreground text-center md:block">
            Slide {active + 1} / {document.slides.length} · Double-clique un
            texte pour l’écrire sur la slide. Glisse un bloc pour le déplacer
            (il s’aligne sur les repères roses ; ⌘/Ctrl pour placer librement),
            une photo pour la recadrer, les poignées pour l’agrandir. Alt +
            glisser : le texte seul. Flèches pour ajuster, Suppr pour retirer,
            Échap pour choisir le cadre.
          </p>
          <p className="mt-1 text-center text-2xs text-muted-foreground md:hidden">
            Slide {active + 1} / {document.slides.length} · Touche un élément, glisse-le ; « Écrire » pour changer un texte.
          </p>
          </div>
        </div>
        <div className="min-w-0 space-y-4 rounded-xl border bg-card p-4">
          <h3 className="text-sm font-semibold">Texte, photos et mise en page</h3>
          <div className="space-y-1">
            <p className="flex items-center gap-1.5 text-xs font-medium">
              <Layers size={14} aria-hidden="true" /> Calques
              <span className="font-normal text-muted-foreground">
                · le plus haut en premier
              </span>
            </p>
            <ul
              aria-label="Calques de la slide"
              className="max-h-72 space-y-0.5 overflow-auto rounded-md border bg-background p-1"
            >
              {layers.map((layer, i) => {
                const Icon =
                  layer.kind === "photo"
                    ? ImageIcon
                    : layer.kind === "text"
                      ? Type
                      : Square;
                const peers = layers.filter((l) => l.topLevel);
                const rank = peers.findIndex((l) => l.id === layer.id);
                return (
                  <li
                    key={layer.id}
                    className={`flex items-center gap-1 rounded px-1 ${selected === layer.id ? "bg-primary/10 ring-1 ring-primary" : group.includes(layer.id) ? "bg-primary/5 ring-1 ring-dashed ring-primary/60" : "hover:bg-muted"}`}
                    style={{ paddingLeft: 4 + layer.depth * 16 }}
                  >
                    <button
                      type="button"
                      aria-pressed={group.includes(layer.id)}
                      aria-label={`Choisir le calque ${layer.label}`}
                      onClick={(e) => (e.shiftKey ? selectAdd(layer.id) : selectOne(layer.id))}
                      className={`flex min-w-0 flex-1 items-center gap-1.5 py-1.5 text-left text-xs ${layer.hidden ? "text-muted-foreground line-through" : ""}`}
                    >
                      <Icon size={13} className="shrink-0" aria-hidden="true" />
                      <span className="truncate">{layer.label}</span>
                    </button>
                    {layer.topLevel && (
                      <>
                        <button
                          type="button"
                          disabled={slide.locked || rank <= 0}
                          aria-label={`Monter le calque ${layer.label}`}
                          title="Monter (passer devant)"
                          onClick={() => changeSlide(moveLayer(slide, layer.id, "up"))}
                          className="rounded p-1 hover:bg-muted disabled:opacity-30"
                        >
                          <ChevronUp size={13} />
                        </button>
                        <button
                          type="button"
                          disabled={slide.locked || rank === peers.length - 1}
                          aria-label={`Descendre le calque ${layer.label}`}
                          title="Descendre (passer derrière)"
                          onClick={() => changeSlide(moveLayer(slide, layer.id, "down"))}
                          className="rounded p-1 hover:bg-muted disabled:opacity-30"
                        >
                          <ChevronDown size={13} />
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      disabled={slide.locked || layer.fixed}
                      aria-pressed={!!layer.locked}
                      aria-label={`${layer.locked ? "Déverrouiller" : "Verrouiller"} le calque ${layer.label}`}
                      title={layer.locked ? "Déverrouiller" : "Verrouiller : il ne bougera plus par erreur"}
                      onClick={() => lockElement(layer.id, !layer.locked)}
                      className={`rounded p-1 hover:bg-muted disabled:opacity-30 ${layer.locked ? "text-primary" : "opacity-40 hover:opacity-100"}`}
                    >
                      {layer.locked ? <LockKeyhole size={13} /> : <Unlock size={13} />}
                    </button>
                    <button
                      type="button"
                      disabled={slide.locked || layer.fixed}
                      aria-label={`${layer.hidden ? "Afficher" : "Masquer"} le calque ${layer.label}`}
                      title={layer.hidden ? "Afficher" : "Masquer (ni exporté ni publié)"}
                      onClick={() => changeSlide(setLayerHidden(slide, layer.id, !layer.hidden))}
                      className="rounded p-1 hover:bg-muted disabled:opacity-30"
                    >
                      {layer.hidden ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                    <button
                      type="button"
                      disabled={slide.locked || layer.fixed || layer.locked}
                      aria-label={`Retirer le calque ${layer.label}`}
                      title={layer.frame ? "Retirer le fond (garder le texte)" : "Retirer"}
                      onClick={() => remove(layer.id)}
                      className="rounded p-1 hover:bg-muted disabled:opacity-30"
                    >
                      <Trash2 size={13} />
                    </button>
                  </li>
                );
              })}
            </ul>
            {!!removedLayers.length && (
              <details className="text-xs">
                <summary className="cursor-pointer py-1">
                  Éléments retirés ({removedLayers.length})
                </summary>
                <ul className="space-y-1 pt-1" aria-label="Éléments retirés">
                  {removedLayers.map((r, i) => (
                    <li key={`${r.label}-${i}`} className="flex items-center justify-between gap-2 rounded border px-2 py-1">
                      <span className="truncate">
                        {r.unwrapOf ? `Fond : ${r.label}` : r.label}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={slide.locked}
                        onClick={() => {
                          changeSlide(restoreLayer(slide, i));
                          setSelected(null);
                        }}
                      >
                        <RotateCcw size={13} className="mr-1" />
                        Remettre
                      </Button>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
          {slide.locked && (
            <p role="status" className="text-xs">
              Slide verrouillée : déverrouille-la pour la modifier.
            </p>
          )}
          {group.length > 1 && !slide.locked && (
            <div className="space-y-2 rounded-lg border border-dashed border-primary/60 p-2" aria-label="Sélection multiple">
              <p className="text-xs font-medium">
                {group.length} éléments sélectionnés · glisse-les ensemble, ou aligne-les :
              </p>
              <div className="grid grid-cols-3 gap-1">
                {([
                  ["left", "À gauche"],
                  ["center", "Centrés"],
                  ["right", "À droite"],
                  ["top", "En haut"],
                  ["middle", "Au milieu"],
                  ["bottom", "En bas"],
                ] as [AlignMode, string][]).map(([mode, label]) => (
                  <Button key={mode} size="sm" variant="outline" className="h-7 px-1 text-2xs" onClick={() => canvasApi.current?.align(mode)}>
                    {label}
                  </Button>
                ))}
              </div>
              {group.length > 2 && (
                <div className="grid grid-cols-2 gap-1">
                  <Button size="sm" variant="outline" className="h-7 px-1 text-2xs" onClick={() => canvasApi.current?.align("spread-x")}>
                    Répartir en largeur
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 px-1 text-2xs" onClick={() => canvasApi.current?.align("spread-y")}>
                    Répartir en hauteur
                  </Button>
                </div>
              )}
              <div className="flex flex-wrap gap-1">
                <Button size="sm" variant="outline" className="h-7 text-2xs" onClick={groupSelection} title="⌘G">
                  Grouper
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-2xs" onClick={copySelection}>
                  <Copy size={12} className="mr-1" /> Copier
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-2xs" onClick={() => removeMany(group)}>
                  <Trash2 size={12} className="mr-1" /> Retirer
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-2xs" onClick={() => selectOne(selected)}>
                  Ne garder que le premier
                </Button>
              </div>
              <p className="text-2xs text-muted-foreground">Maj + clic sur un élément ou un calque pour l’ajouter ou le retirer.</p>
            </div>
          )}
          {element && !slide.locked && listLayers(slide.html).find((l) => l.id === element.id)?.locked && (
            <div role="status" className="flex items-center justify-between gap-2 rounded-lg border p-2 text-xs">
              <span className="flex items-center gap-1.5"><LockKeyhole size={13} /> Élément verrouillé.</span>
              <Button size="sm" variant="outline" className="h-7 text-2xs" onClick={() => lockElement(element.id, false)}>Déverrouiller</Button>
            </div>
          )}
          {element?.name === "groupe" && !slide.locked && (
            <Button size="sm" variant="outline" className="w-full" onClick={ungroupSelection} title="⌘⇧G">
              Dégrouper
            </Button>
          )}
          <fieldset
            disabled={slide.locked || (!!element && !!listLayers(slide.html).find((l) => l.id === element.id)?.locked)}
            className="min-w-0 space-y-3 disabled:opacity-50"
          >
            {element?.kind === "text" && (
              <>
                <Textarea
                  aria-label="Texte sélectionné"
                  value={element.text}
                  rows={4}
                  onChange={(e) =>
                    changeSlide(
                      patchElement(slide, element.id, { text: e.target.value }),
                      `text-${slide.id}-${element.id}`,
                    )
                  }
                />
                {range(
                  "Taille du texte",
                  parseFloat(css["font-size"]) || 40,
                  18,
                  160,
                  (n) => style({ "font-size": `${n}px` }, "font"),
                )}
                <label className="block text-xs">
                  Police
                  <select
                    aria-label="Police"
                    value={css["font-family"] || ""}
                    onChange={(e) => style({ "font-family": e.target.value })}
                    className="mt-1 w-full rounded border bg-background p-2"
                  >
                    <option value={css["font-family"] || ""}>
                      Police actuelle
                    </option>
                    {documentFonts.map((f) => (
                      <option key={f.value} value={f.value}>
                        {f.label} (ton carrousel)
                      </option>
                    ))}
                    {[
                      "Arial, sans-serif",
                      "Georgia, serif",
                      "Verdana, sans-serif",
                      "Trebuchet MS, sans-serif",
                    ].map((f) => (
                      <option key={f} value={f}>
                        {f.split(",")[0]}
                      </option>
                    ))}

                  </select>
                </label>
                <div className="flex flex-wrap gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    aria-pressed={css["font-weight"] === "700"}
                    onClick={() =>
                      style({
                        "font-weight":
                          css["font-weight"] === "700" ? "400" : "700",
                      })
                    }
                  >
                    Gras
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    aria-pressed={css["font-style"] === "italic"}
                    onClick={() =>
                      style({
                        "font-style":
                          css["font-style"] === "italic" ? "normal" : "italic",
                      })
                    }
                  >
                    Italique
                  </Button>
                </div>
                <label className="flex items-center justify-between text-xs">
                  Couleur du texte
                  <input
                    aria-label="Couleur du texte"
                    type="color"
                    value={toHex(css.color, "#222222")}
                    onChange={(e) => style({ color: e.target.value })}
                  />
                </label>
                <select
                  aria-label="Alignement du texte"
                  className="w-full rounded border bg-background p-2 text-sm"
                  value={css["text-align"] || "left"}
                  onChange={(e) => style({ "text-align": e.target.value })}
                >
                  <option value="left">Aligné à gauche</option>
                  <option value="center">Centré</option>
                  <option value="right">Aligné à droite</option>
                </select>
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
                {element.emphasis && !!element.emphasis.choices.length && (
                  <>
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
                  </>
                )}
              </>
            )}
            {element?.kind === "photo" && (
              <>
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
                  2.5,
                  (n) => {
                    const base = css["--editor-zoom"]
                      ? css["--editor-base-transform"] || ""
                      : css.transform || "";
                    style({
                      "--editor-base-transform": base,
                      "--editor-zoom": String(n),
                      transform: `${base} scale(${n})`,
                      "transform-origin": "center",
                    });
                  },
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
                {measured && (measured.width < 1075 || measured.height < 1345) && (
                  <>
                    <p className="pt-1 text-xs font-medium">Cadre de la photo</p>
                    {range("Position horizontale", coord("left"), -500, 1080, (n) => style({ position: css.position || "absolute", left: `${n}px` }))}
                    {range("Position verticale", coord("top"), -500, 1350, (n) => style({ position: css.position || "absolute", top: `${n}px` }))}
                    {range("Largeur du cadre", parseFloat(css.width) || Math.round(measured.width), 60, 1080, (n) => style({ width: `${n}px` }))}
                    {range("Hauteur du cadre", parseFloat(css.height) || Math.round(measured.height), 60, 1350, (n) => style({ height: `${n}px` }))}
                  </>
                )}
                {range("Arrondi des coins", parseFloat(css["border-radius"] || css["border-top-left-radius"]) || 0, 0, 200, (n) => style({ "border-radius": `${n}px`, overflow: "hidden" }))}
                <p className="pt-1 text-xs font-medium">Retouche de la photo</p>
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
                  {element.role !== "glass" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const out = duplicateElement(slide, element.id);
                        if (!out.id) return;
                        changeSlide(out.slide);
                        setSelected(out.id);
                      }}
                    >
                      <Copy size={14} className="mr-1" />
                      Dupliquer
                    </Button>
                  )}
                </div>
              </>
            )}
            {element && element.role !== "background" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => remove(element.id)}
              >
                {element.frame
                  ? "Retirer le fond (garder le texte)"
                  : "Retirer cet élément"}
              </Button>
            )}
            <div className="grid grid-cols-2 gap-2">
              {hasClip && (
                <Button
                  variant="outline"
                  size="sm"
                  className="col-span-2"
                  onClick={paste}
                  title="⌘/Ctrl + V"
                >
                  Coller {clipboard.current.items.length > 1 ? `les ${clipboard.current.items.length} éléments copiés` : "l’élément copié"}
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => changeSlide(addTextElement(slide))}
              >
                Ajouter un texte
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const out = addShapeElement(slide);
                  if (!out.id) return;
                  changeSlide(out.slide);
                  setSelected(out.id);
                }}
              >
                Ajouter une forme
              </Button>
            </div>
            <label className="block text-xs">
              Ajouter un élément tout fait
              <select
                aria-label="Ajouter un élément tout fait"
                className="mt-1 w-full rounded border bg-background p-2"
                value=""
                onChange={(e) => e.target.value && addReady(e.target.value as PresetKind)}
              >
                <option value="">Flèche, numéro, pastille, ligne…</option>
                {PRESETS.map((p) => (
                  <option key={p.kind} value={p.kind}>{p.label}</option>
                ))}
              </select>
            </label>
            {onOpenStudio && <Button variant="outline" size="sm" className="w-full" disabled={slide.locked} onClick={() => onOpenStudio(slide.id)}>Créer / remplacer avec le Studio</Button>}
            {onAddPhoto && (
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => setPhotoOpen(true)}
              >
                <ImagePlus size={14} className="mr-1" />
                Ajouter / changer la photo
              </Button>
            )}
            <label className="block text-xs">
              Mise en page
              <select
                aria-label="Mise en page"
                value=""
                onChange={(e) => changeTemplate(e.target.value)}
                className="mt-1 w-full rounded border bg-background p-2"
              >
                <option value="">Choisir une mise en page…</option>
                <option value="text_only">Texte</option>
                <option value="photo_full">Photo plein écran</option>
                <option value="photo_integrated">
                  Photo en haut, texte en bas
                </option>
              </select>
            </label>
            <p className="text-xs text-muted-foreground">
              Changer de mise en page recompose cette slide. Tu peux annuler.
            </p>
            {slide.html.includes("data-photo-text-layout") && (
              <label className="block text-xs">
                Texte sur la photo
                <select
                  aria-label="Texte sur la photo"
                  className="mt-1 w-full rounded border bg-background p-2"
                  value={slide.data.overlay_position === "center" ? "center" : String(slide.data.overlay_position || "").startsWith("top") ? "top_left" : "bottom_left"}
                  onChange={(e) => changeSlide(positionPhotoText(slide, e.target.value as "top_left" | "bottom_left" | "center"))}
                >
                  <option value="top_left">En haut</option>
                  <option value="bottom_left">En bas</option>
                  <option value="center">Au centre</option>
                </select>
              </label>
            )}
            <label className="flex items-center justify-between text-xs">
              Fond de la slide
              <input
                aria-label="Fond de la slide"
                type="color"
                value={toHex(
                  (
                    new DOMParser().parseFromString(slide.html, "text/html")
                      .body.firstElementChild as HTMLElement
                  )?.style.backgroundColor,
                  "#faf7f2",
                )}
                onChange={(e) =>
                  changeSlide(
                    restyleSlide(slide, { "background-color": e.target.value }),
                    `background-${slide.id}`,
                  )
                }
              />
            </label>
            {element?.kind === "text" && (
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() =>
                  commit({
                    ...document,
                    slides: document.slides.map((s) =>
                      restyleSlide(
                        s,
                        Object.fromEntries(
                          ["font-family", "color"]
                            .filter((k) => css[k])
                            .map((k) => [k, css[k]]),
                        ),
                        "texts",
                      ),
                    ),
                  })
                }
              >
                Police et couleur sur toutes les slides
              </Button>
            )}
            {element && element.role !== "background" && document.slides.length > 1 && (
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
