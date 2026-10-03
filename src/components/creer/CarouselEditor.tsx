import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
import { editHistoryShortcut } from "@/lib/edit-history-shortcut";
import {
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

function SlideCanvas({
  slide,
  selected,
  onSelect,
  onMove,
  onRemove,
  onEditText,
  onMeasure,
  onHistoryKey,
}: {
  slide: EditorSlide;
  selected: string | null;
  onSelect: (id: string | null) => void;
  onMove: (id: string, styles: Record<string, string>) => void;
  onRemove: (id: string) => void;
  onEditText: (id: string, text: string) => void;
  onMeasure?: (box: CanvasBox | null) => void;
  onHistoryKey: (event: KeyboardEvent) => void;
}) {
  const host = useRef<HTMLDivElement>(null),
    frame = useRef<HTMLIFrameElement>(null);
  const [width, setWidth] = useState(0),
    [overflow, setOverflow] = useState(false),
    [guides, setGuides] = useState<{ x: number | null; y: number | null }>({ x: null, y: null }),
    [box, setBox] = useState<(CanvasBox & { kind: "photo" | "veil" | "text" | "shape" }) | null>(null);
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
  const latest = useRef({ selected, onSelect, onMove, onRemove, onEditText, onMeasure, onHistoryKey, locked: slide.locked });
  latest.current = { selected, onSelect, onMove, onRemove, onEditText, onMeasure, onHistoryKey, locked: slide.locked };
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
    });
    latest.current.onMeasure?.(next);
  };
  useEffect(measure, [selected, slide.html]);
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
      e.el.removeAttribute("contenteditable");
      e.el.style.removeProperty("user-select");
      e.el.style.removeProperty("-webkit-user-select");
      e.el.style.removeProperty("cursor");
      const text = readText(e.el);
      if (text.trim() && text !== e.before) latest.current.onEditText(e.id, text);
      else e.el.innerHTML = e.html;
    };
    view.addEventListener("blur", finishEditing);
    doc.addEventListener("dblclick", (e) => {
      if (latest.current.locked) return;
      const el = pickAt(doc, e.target, e.clientX, e.clientY);
      if (!el || !isInlineText(el)) return;
      e.preventDefault();
      finishEditing();
      editing = { el, id: el.dataset.editorId!, before: readText(el), html: el.innerHTML };
      el.setAttribute("contenteditable", "plaintext-only");
      if (el.contentEditable !== "plaintext-only") el.setAttribute("contenteditable", "true");
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
    });
    doc.addEventListener("keydown", (event) => {
      keepFocus.current = true;
      if (editing) {
        if (event.key === "Escape" || (event.key === "Enter" && (event.metaKey || event.ctrlKey))) {
          event.preventDefault();
          finishEditing();
        }
        // Pendant la saisie, flèches, Suppr et ⌘Z agissent sur le texte.
        return;
      }
      const el = target();
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
        if (delta && (!isPhotoEl(el) || !isFullBleed(el)) && !el.matches(VEIL) && !isPassiveShape(el)) {
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
        if ((event.key === "Delete" || event.key === "Backspace") && !el.matches('[data-pptx-shape="background"]')) {
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
    } | null = null;
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
      if (latest.current.locked) {
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
        const snap = e.metaKey || e.ctrlKey ? { x: null, y: null } : snapTo(doc, d.el);
        if (snap.x) d.el.style.left = `${d.left + dx + snap.x.delta}px`;
        if (snap.y) d.el.style.top = `${d.top + dy + snap.y.delta}px`;
        setGuides({ x: snap.x?.line ?? null, y: snap.y?.line ?? null });
        followGlass(d.el);
      }
      if (latest.current.selected !== d.id) latest.current.onSelect(d.id);
      else measure();
    });
    doc.addEventListener("pointerup", (e) => {
      if (!drag) return;
      const d = drag;
      drag = null;
      const dx = e.clientX - d.x,
        dy = e.clientY - d.y;
      setGuides({ x: null, y: null });
      // Simple clic : on choisit l'élément précis (le texte dans sa carte).
      if (Math.abs(dx) + Math.abs(dy) < 5) {
        latest.current.onSelect(d.inner.dataset.editorId!);
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
    !box || slide.locked || box.kind === "veil" || (box.kind === "photo" && box.width >= 1075 && box.height >= 1345)
      ? []
      : box.kind === "text"
        ? ["w", "e", "se"]
        : ["w", "e", "s", "se"];
  const handleStyle = (h: Handle): React.CSSProperties => {
    const size = 14;
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

  return (
    <div>
      <div
        ref={host}
        className="relative w-full overflow-hidden rounded-xl border bg-white shadow-sm"
        style={{ aspectRatio: "1080 / 1350" }}
      >
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
    [measured, setMeasured] = useState<CanvasBox | null>(null);
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
  if (!slide) return null;
  return (
    <section ref={editorRoot} tabIndex={-1} aria-label="Éditeur de carrousel" className="min-w-0 w-full space-y-4" onKeyDown={onHistoryKey}>
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
            onClick={() => {
              setActive(i);
              setSelected(null);
            }}
            aria-label={`Sélectionner la slide ${i + 1}`}
            aria-pressed={i === active}
            className={`shrink-0 rounded-lg border px-4 py-3 text-sm ${i === active ? "border-primary bg-primary/10 font-semibold" : "bg-background"}`}
          >
            {i + 1}
            {s.locked ? " 🔒" : ""}
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
        <div className="min-w-0 max-w-[540px] w-full mx-auto md:sticky md:top-28">
          <SlideCanvas
            onHistoryKey={onHistoryKey}
            slide={slide}
            selected={selected}
            onSelect={setSelected}
            onMeasure={setMeasured}
            onMove={(id, styles) =>
              changeSlide(patchElement(slide, id, { styles }))
            }
            onRemove={remove}
            onEditText={(id, text) =>
              changeSlide(patchElement(slide, id, { text }), `text-${slide.id}-${id}`)
            }
          />
          <p className="mt-2 text-xs text-muted-foreground text-center">
            Slide {active + 1} / {document.slides.length} · Double-clique un
            texte pour l’écrire sur la slide. Glisse un bloc pour le déplacer
            (il s’aligne sur les repères roses ; ⌘/Ctrl pour placer librement),
            une photo pour la recadrer, les poignées pour l’agrandir. Alt +
            glisser : le texte seul. Flèches pour ajuster, Suppr pour retirer,
            Échap pour choisir le cadre.
          </p>
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
                    className={`flex items-center gap-1 rounded px-1 ${selected === layer.id ? "bg-primary/10 ring-1 ring-primary" : "hover:bg-muted"}`}
                    style={{ paddingLeft: 4 + layer.depth * 16 }}
                  >
                    <button
                      type="button"
                      aria-pressed={selected === layer.id}
                      aria-label={`Choisir le calque ${layer.label}`}
                      onClick={() => setSelected(layer.id)}
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
                      aria-label={`${layer.hidden ? "Afficher" : "Masquer"} le calque ${layer.label}`}
                      title={layer.hidden ? "Afficher" : "Masquer (ni exporté ni publié)"}
                      onClick={() => changeSlide(setLayerHidden(slide, layer.id, !layer.hidden))}
                      className="rounded p-1 hover:bg-muted disabled:opacity-30"
                    >
                      {layer.hidden ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                    <button
                      type="button"
                      disabled={slide.locked || layer.fixed}
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
          <fieldset
            disabled={slide.locked}
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
                {range("Arrondi des coins", parseFloat(css["border-radius"]) || 0, 0, 200, (n) => style({ "border-radius": `${n}px`, overflow: "hidden" }))}
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
                {range("Arrondi des coins", parseFloat(css["border-radius"]) || 0, 0, 200, (n) => style({ "border-radius": `${n}px` }))}
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
