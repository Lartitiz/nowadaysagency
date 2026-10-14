// Lot E3-3 (14/10/2026) : réactions de l'aperçu à la souris et au clavier
// (écrire sur la slide, glisser, cadre de sélection, recadrer, photo déposée,
// flèches, texte qui ne tient plus, contrôle de la slide). Déplacé à
// l'identique depuis `bind` dans SlideCanvas (CarouselEditor.tsx) : le corps
// est le même, seules les valeurs de l'aperçu arrivent par `ctx`.
import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from "react";
import { isPassiveShape, syncGlass, type ElementRect } from "@/lib/carousel-editor";
import { findClippedIds, hasClippedElement, inspectSlide, type QualityIssue } from "@/lib/carousel-quality";
import {
  clamp,
  numberOr,
  VEIL,
  isPhotoEl,
  isFullBleed,
  pickAt,
  frameOf,
  followGlass,
  isLockedEl,
  snapTo,
  isInlineText,
  type CanvasApi,
} from "@/components/creer/CarouselEditorParts/canvas-geometry";

/** Actions et état du dernier rendu de l'aperçu (relus à chaque événement). */
export interface CanvasLatest {
  selected: string | null;
  onSelect: (id: string | null) => void;
  onMove: (id: string, styles: Record<string, string>) => void;
  onRemove: (id: string) => void;
  onEditText: (id: string, text: string) => void;
  onEditHtml: (id: string, html: string) => void;
  onFill: (id: string, hex: string) => void;
  onDuplicate: (id: string) => void;
  onMeasure?: (box: ElementRect | null) => void;
  onHistoryKey: (event: KeyboardEvent) => void;
  group: string[];
  onSelectAdd: (id: string) => void;
  onSelectMany?: (ids: string[], add: boolean) => void;
  onMoveMany: (moves: Record<string, Record<string, string>>) => void;
  onRemoveMany: (ids: string[]) => void;
  onCopy: () => void;
  onPaste: () => void;
  onShortcut: (event: KeyboardEvent) => boolean;
  onDropPhoto?: (file: File, targetId: string | null) => void;
  onLock?: (id: string, locked: boolean) => void;
  fitId?: string | null;
  onFitDone?: (id: string, size: number | null | "trop-long") => void;
  locked: boolean | undefined;
}
/** Outils de saisie branchés sur l'aperçu (utilisés par la barre flottante). */
export interface CanvasTools {
  format: (styles: Record<string, string>) => boolean;
  startEditing: (id: string) => void;
  finish: () => void;
}
export interface CanvasContext {
  frame: RefObject<HTMLIFrameElement>;
  keepFocus: MutableRefObject<boolean>;
  latest: MutableRefObject<CanvasLatest>;
  tools: MutableRefObject<CanvasTools>;
  api: MutableRefObject<CanvasApi | null>;
  zoomRef: MutableRefObject<(el: HTMLElement, zoom: number) => Promise<Record<string, string> | null>>;
  fitRef: MutableRefObject<(id: string) => void>;
  cropRef: MutableRefObject<string | null>;
  recheck: MutableRefObject<() => void>;
  target: () => HTMLElement | null;
  measure: () => void;
  commitLive: (id: string, styles: Record<string, string>) => void;
  commitLiveMany: (moves: Record<string, Record<string, string>>) => void;
  setEditingId: (id: string | null) => void;
  setCropId: (id: string | null) => void;
  setMarquee: (marquee: { x: number; y: number; w: number; h: number } | null) => void;
  setGuides: (guides: { x: number | null; y: number | null }) => void;
  setDropping: Dispatch<SetStateAction<false | ElementRect | null>>;
  setOverflow: (overflow: boolean) => void;
  setEmptyFrames: (frames: (ElementRect & { id: string; radius: string })[]) => void;
  setIssues: (issues: (QualityIssue & { rect: ElementRect })[]) => void;
}

/** Branche l'aperçu chargé (appelé à chaque chargement de l'iframe). */
export function bindCanvas(ctx: CanvasContext) {
  const { frame, keepFocus, latest, tools, api, zoomRef, fitRef, cropRef, recheck, target, measure } = ctx;
  const { commitLive, commitLiveMany, setEditingId, setCropId, setMarquee, setGuides, setDropping } = ctx;
  const { setOverflow, setEmptyFrames, setIssues } = ctx;
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
    // Le texte grandit en écrivant : le cadre (et la barre qui l'évite) suit.
    doc.addEventListener("input", () => {
      if (editing) measure();
    });
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
      measure();
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
    // Recadrage : zoom DANS la photo. Une photo en fond (div) garde son cadre et
    // agrandit son image (taille calculée sur l'image réelle, comme « cover ») ;
    // une balise <img> garde l'ancien zoom par transformation.
    const naturalSize = new Map<string, Promise<[number, number] | null>>();
    const sizeOf = (url: string) => {
      if (!naturalSize.has(url))
        naturalSize.set(
          url,
          new Promise((resolve) => {
            const img = new Image();
            img.onload = () => resolve([img.naturalWidth, img.naturalHeight]);
            img.onerror = () => resolve(null);
            img.src = url;
          }),
        );
      return naturalSize.get(url)!;
    };
    const zoomPhotoEl = async (el: HTMLElement, zoom: number): Promise<Record<string, string> | null> => {
      const z = clamp(Math.round(zoom * 100) / 100, 1, 3);
      if (el.tagName === "IMG") {
        const base = el.style.getPropertyValue("--editor-zoom") ? el.style.getPropertyValue("--editor-base-transform") : el.style.transform && el.style.transform !== "none" ? el.style.transform : "";
        const styles = { "--editor-base-transform": base, "--editor-zoom": String(z), transform: `${base} scale(${z})`.trim(), "transform-origin": "center" };
        Object.entries(styles).forEach(([k, v]) => el.style.setProperty(k, v));
        return styles;
      }
      const url = /url\((['"]?)(.*?)\1\)/.exec(el.style.backgroundImage || "")?.[2];
      const natural = url ? await sizeOf(url) : null;
      if (!natural) return null;
      const r = el.getBoundingClientRect();
      const cover = Math.max(r.width / natural[0], r.height / natural[1]);
      const styles = {
        "--editor-zoom": String(z),
        "background-size": z === 1 ? "cover" : `${Math.round(natural[0] * cover * z)}px ${Math.round(natural[1] * cover * z)}px`,
        "background-repeat": "no-repeat",
      };
      Object.entries(styles).forEach(([k, v]) => el.style.setProperty(k, v));
      syncGlass(doc);
      return styles;
    };
    zoomRef.current = zoomPhotoEl;
    // Molette sur la photo en recadrage : zoom.
    doc.addEventListener(
      "wheel",
      (e) => {
        const id = cropRef.current;
        const el = id ? doc.querySelector<HTMLElement>(`[data-editor-id="${id}"]`) : null;
        if (!el) return;
        e.preventDefault();
        const current = Number(el.style.getPropertyValue("--editor-zoom")) || 1;
        zoomPhotoEl(el, current * (e.deltaY < 0 ? 1.05 : 1 / 1.05)).then((styles) => styles && commitLive(id!, styles));
      },
      { passive: false },
    );
    // Texte qui ne tient plus : on réduit la taille jusqu'à ce qu'il rentre.
    // Un texte n'est « coupé » que s'il l'est vraiment : par un cadre qui masque
    // ce qui dépasse, ou par le bord de la slide. Une boîte écrasée par une mise
    // en page en colonne (flex) déborde sans être coupée : la réduire ne sert à
    // rien (vu sur une vraie slide le 03/10/2026 : titre réduit de 84 à 24 px).
    const fitText = (el: HTMLElement): number | null | "trop-long" => {
      const id = el.dataset.editorId!;
      const cut = () => {
        if (findClippedIds(doc).includes(id)) return true;
        const cs = view.getComputedStyle(el);
        return /hidden|clip|auto|scroll/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 2;
      };
      if (!cut()) return null;
      const original = el.style.fontSize;
      let size = parseFloat(view.getComputedStyle(el).fontSize) || 40;
      while (cut() && size > 24) {
        size -= 2;
        el.style.fontSize = `${size}px`;
      }
      if (cut()) {
        // Même au plus petit, ça ne tient pas : on rend la taille d'origine.
        el.style.fontSize = original;
        return "trop-long";
      }
      return size;
    };
    fitRef.current = (id) => {
      const el = doc.querySelector<HTMLElement>(`[data-editor-id="${id}"]`);
      const size = el ? fitText(el) : null;
      if (typeof size === "number") commitLive(id, { "font-size": `${size}px` });
      else if (size === "trop-long") latest.current.onFitDone?.(id, size);
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
      zoomPhoto: (id, zoom) => {
        const el = doc.querySelector<HTMLElement>(`[data-editor-id="${id}"]`);
        if (el) zoomPhotoEl(el, zoom).then((styles) => styles && latest.current.onMove(id, styles));
      },
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
      // Double-clic sur une photo : recadrage directement sur la slide.
      if (el && isPhotoEl(el) && !isLockedEl(el)) {
        e.preventDefault();
        latest.current.onSelect(el.dataset.editorId!);
        setCropId(el.dataset.editorId!);
        return;
      }
      if (!el || !isInlineText(el) || isLockedEl(el)) return;
      e.preventDefault();
      startEditing(el);
    });
    doc.addEventListener("keydown", (event) => {
      keepFocus.current = true;
      if (cropRef.current && (event.key === "Escape" || event.key === "Enter")) {
        event.preventDefault();
        setCropId(null);
        return;
      }
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
    // Cadre de sélection : on part du vide (ou du fond) et on glisse.
    let lasso: { x: number; y: number; shift: boolean; under: HTMLElement | null; moved: boolean } | null = null;
    // Clic long (sans bouger) sur un élément : le cadre de sélection part de là.
    let hold: number | undefined;
    let pointer = { x: 0, y: 0 };
    const lassoHits = (x1: number, y1: number, x2: number, y2: number) => {
      const left = Math.min(x1, x2), right = Math.max(x1, x2), top = Math.min(y1, y2), bottom = Math.max(y1, y2);
      const ok = (el: HTMLElement) =>
        !el.matches(VEIL) && !isPassiveShape(el) && !isLockedEl(el) && !(isPhotoEl(el) && isFullBleed(el));
      return Array.from(doc.querySelectorAll<HTMLElement>("[data-editor-id]"))
        .filter((el) => {
          if (!ok(el)) return false;
          // Un élément rangé dans un cadre choisissable vient avec son cadre.
          for (let p = el.parentElement?.closest<HTMLElement>("[data-editor-id]"); p; p = p.parentElement?.closest<HTMLElement>("[data-editor-id]"))
            if (ok(p)) return false;
          const r = el.getBoundingClientRect();
          if (!r.width && !r.height) return false;
          return r.left < right && r.right > left && r.top < bottom && r.bottom > top;
        })
        .map((el) => el.dataset.editorId!);
    };
    // Photo glissée depuis l'ordinateur : elle remplace la photo visée (ou la photo de la slide).
    const hasFile = (e: DragEvent) => Array.from(e.dataTransfer?.types || []).includes("Files");
    // Cadre photo visé : celui sous le pointeur, sinon un cadre vide, sinon la photo de la slide.
    const dropTarget = (e: DragEvent) =>
      (doc.elementsFromPoint?.(e.clientX, e.clientY) || [])
        .map((n) => n.closest<HTMLElement>("[data-editor-id]"))
        .find((n): n is HTMLElement => !!n && isPhotoEl(n)) ||
      doc.querySelector<HTMLElement>("[data-editor-photo-empty][data-editor-id]") ||
      Array.from(doc.body.querySelectorAll<HTMLElement>("img,[data-pptx-photo],[data-editor-photo]")).find(
        (n) => !n.parentElement?.closest("[data-pptx-photo],[data-editor-photo]"),
      ) ||
      null;
    doc.addEventListener("dragover", (e) => {
      if (!hasFile(e) || latest.current.locked || !latest.current.onDropPhoto) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
      const r = dropTarget(e)?.getBoundingClientRect();
      const next = r && r.width && r.height ? { left: r.left, top: r.top, width: r.width, height: r.height } : null;
      setDropping((prev) =>
        prev && next && prev.left === next.left && prev.top === next.top && prev.width === next.width && prev.height === next.height
          ? prev
          : prev === null && next === null
            ? prev
            : next,
      );
    });
    doc.addEventListener("dragleave", (e) => {
      if (!e.relatedTarget) setDropping(false);
    });
    doc.addEventListener("drop", (e) => {
      setDropping(false);
      const file = Array.from(e.dataTransfer?.files || []).find((f) => f.type.startsWith("image/"));
      if (!file || latest.current.locked || !latest.current.onDropPhoto) return;
      e.preventDefault();
      latest.current.onDropPhoto(file, dropTarget(e)?.dataset.editorId || null);
    });
    doc.addEventListener("click", (e) => {
      e.preventDefault();
      view.focus();
    });
    doc.addEventListener("pointerdown", (e) => {
      if (editing && editing.el.contains(e.target as Node)) return;
      finishEditing();
      const inner = pickAt(doc, e.target, e.clientX, e.clientY);
      if (cropRef.current && inner?.dataset.editorId !== cropRef.current) setCropId(null);
      // Clic dans le vide (ou sur le fond) : on désélectionne, comme dans Canva ;
      // glisser trace un cadre qui choisit tous les éléments qu'il touche.
      if (!inner || (isPassiveShape(inner) && !isPhotoEl(inner))) {
        view.focus();
        keepFocus.current = true;
        lasso = { x: e.clientX, y: e.clientY, shift: e.shiftKey, under: inner, moved: false };
        doc.documentElement.setPointerCapture?.(e.pointerId);
        e.preventDefault();
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
      // Glisser une photo plein écran (ou en recadrage) déplace l'image dans son
      // cadre ; une photo encadrée (ou un cadre vide) se déplace entière, comme
      // dans Canva : double-clic ou « Recadrer » pour bouger l'image dedans.
      const photo = isPhotoEl(el) && (isFullBleed(el) || cropRef.current === el.dataset.editorId);
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
      pointer = { x: e.clientX, y: e.clientY };
      window.clearTimeout(hold);
      hold = window.setTimeout(() => {
        const d = drag;
        if (!d || Math.abs(pointer.x - d.x) + Math.abs(pointer.y - d.y) >= 5) return;
        drag = null;
        lasso = { x: d.x, y: d.y, shift: d.shift, under: d.inner, moved: false };
        setMarquee({ x: d.x, y: d.y, w: 0, h: 0 });
      }, 450);
    });
    doc.addEventListener("pointermove", (e) => {
      pointer = { x: e.clientX, y: e.clientY };
      if (lasso) {
        const l = lasso;
        if (!l.moved && Math.abs(e.clientX - l.x) + Math.abs(e.clientY - l.y) < 5) return;
        l.moved = true;
        setMarquee({ x: Math.min(l.x, e.clientX), y: Math.min(l.y, e.clientY), w: Math.abs(e.clientX - l.x), h: Math.abs(e.clientY - l.y) });
        return;
      }
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
      window.clearTimeout(hold);
      if (lasso) {
        const l = lasso;
        lasso = null;
        setMarquee(null);
        if (!l.moved) {
          const id = l.under?.dataset.editorId || null;
          if (!l.shift) latest.current.onSelect(id);
          else if (id && l.under && !isPassiveShape(l.under)) latest.current.onSelectAdd(id);
          return;
        }
        const ids = lassoHits(l.x, l.y, e.clientX, e.clientY);
        if (latest.current.onSelectMany) latest.current.onSelectMany(ids, l.shift);
        else if (ids.length) latest.current.onSelect(ids[0]);
        return;
      }
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
      lasso = null;
      window.clearTimeout(hold);
      setMarquee(null);
      setGuides({ x: null, y: null });
    });
    // Même inspection géométrique que le contrôle qualité global : l'aperçu
    // n'annonce jamais un débordement que la QA ignorerait, ni l'inverse.
    const check = () => {
      setOverflow(hasClippedElement(doc));
      setEmptyFrames(
        Array.from(doc.querySelectorAll<HTMLElement>("[data-editor-photo-empty][data-editor-id]"))
          .map((el) => {
            const r = el.getBoundingClientRect();
            return { id: el.dataset.editorId!, left: r.left, top: r.top, width: r.width, height: r.height, radius: el.style.borderRadius };
          })
          .filter((r) => r.width > 0 && r.height > 0),
      );
      try {
        setIssues(
          inspectSlide(doc, 0)
            .filter((i) => i.kind === "overflow" || i.kind === "size" || i.kind === "contrast")
            .map((i) => {
              const r = doc.querySelector<HTMLElement>(`[data-editor-id="${i.elementId}"]`)?.getBoundingClientRect();
              return { ...i, rect: r ? { left: r.left, top: r.top, width: r.width, height: r.height } : { left: 0, top: 0, width: 0, height: 0 } };
            })
            .filter((i) => i.rect.width > 0),
        );
      } catch {
        setIssues([]);
      }
    };
    const autofit = () => {
      const id = latest.current.fitId;
      if (!id) return;
      const el = doc.querySelector<HTMLElement>(`[data-editor-id="${id}"]`);
      const size = el && !isLockedEl(el) ? fitText(el) : null;
      latest.current.onFitDone?.(id, size);
      if (typeof size === "number") commitLive(id, { "font-size": `${size}px` });
    };
    recheck.current = () => {
      check();
      measure();
    };
    const fontsReady = doc.fonts?.ready;
    if (!fontsReady) autofit();
    check();
    measure();
    fontsReady?.then(() => {
      autofit();
      check();
      measure();
    });
}
