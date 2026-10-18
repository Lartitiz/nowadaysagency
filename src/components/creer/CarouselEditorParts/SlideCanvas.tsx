// Lot E3-3 (14/10/2026) : l'aperçu d'une slide dans l'éditeur (iframe, cadre
// de sélection, poignées, repères, cadres photo vides, pastilles « ! »),
// déplacé à l'identique depuis CarouselEditor.tsx. Ses réactions à la souris
// et au clavier sont dans canvas-events.ts, sa barre flottante dans
// CanvasToolbar.tsx.
// Chantier V (18/10/2026) : « Ajuster la taille » dans l'alerte de débordement
// réduit chaque texte coupé (même réglage que « ! Corriger » de la barre).
import { useEffect, useRef, useState } from "react";
import { ImagePlus } from "lucide-react";
import { toast } from "sonner";
import { getEditorElements, isPassiveShape, type ElementRect, type EditorSlide } from "@/lib/carousel-editor";
import { findClippedIds, type QualityIssue } from "@/lib/carousel-quality";
import {
  clamp,
  numberOr,
  VEIL,
  isPhotoEl,
  followGlass,
  isLockedEl,
  type Handle,
  type CanvasApi,
  type CanvasBox,
} from "@/components/creer/CarouselEditorParts/canvas-geometry";
import CanvasToolbar, { type SelectionBox } from "@/components/creer/CarouselEditorParts/CanvasToolbar";
import { bindCanvas } from "@/components/creer/CarouselEditorParts/canvas-events";

export default function SlideCanvas({
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
  simple,
  group,
  onSelectAdd,
  onSelectMany,
  onMoveMany,
  onRemoveMany,
  onCopy,
  onPaste,
  onShortcut,
  onDropPhoto,
  onReplacePhoto,
  onLock,
  fitId,
  onFitDone,
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
  onEditText: (id: string, text: string, live?: boolean) => void;
  onEditHtml: (id: string, html: string, live?: boolean) => void;
  onFill: (id: string, hex: string) => void;
  onDuplicate: (id: string) => void;
  /** Couleurs du carrousel proposées dans la barre d'outils. */
  colors: string[];
  /** Mode simple de l'éditeur : barre flottante allégée. */
  simple?: boolean;
  /** Éléments sélectionnés ensemble (Maj + clic), l'élément principal compris. */
  group: string[];
  onSelectAdd: (id: string) => void;
  /** Cadre de sélection glissé depuis le vide : les éléments qu'il touche. */
  onSelectMany?: (ids: string[], add: boolean) => void;
  onMoveMany: (moves: Record<string, Record<string, string>>) => void;
  onRemoveMany: (ids: string[]) => void;
  onCopy: () => void;
  onPaste: () => void;
  /** Raccourcis de l'éditeur (⌘D, ⌘X, ⌘A, ⌘B/I/U, ⌘]/[, Tab) ; true si traité. */
  onShortcut: (event: KeyboardEvent) => boolean;
  api: React.MutableRefObject<CanvasApi | null>;
  /** Photo glissée depuis l'ordinateur sur la slide (cible : la photo sous le pointeur). */
  onDropPhoto?: (file: File, targetId: string | null) => void;
  /** Bouton « Remplacer » de la barre flottante d'une photo. */
  onReplacePhoto?: () => void;
  onLock?: (id: string, locked: boolean) => void;
  /** Texte qui vient d'être modifié : sa taille se réduit s'il ne tient plus dans son cadre. */
  fitId?: string | null;
  onFitDone?: (id: string, size: number | null | "trop-long") => void;
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
    [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null),
    [box, setBox] = useState<
      | SelectionBox
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
  // Fin d'une saisie déjà enregistrée mot à mot : la slide est remise en page.
  const [reloads, setReloads] = useState(0);
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
  }, [slide.html, slide.id, reloads]);
  const commitLive = (id: string, styles: Record<string, string>) => {
    liveUntil.current = Date.now() + 1000;
    latest.current.onMove(id, styles);
  };
  const commitLiveMany = (moves: Record<string, Record<string, string>>) => {
    liveUntil.current = Date.now() + 1000;
    latest.current.onMoveMany(moves);
  };
  // Texte tapé sur la slide : enregistré sans recharger l'aperçu (la frappe continue).
  const commitText = (id: string, value: string, editorial: boolean) => {
    liveUntil.current = Date.now() + 1000;
    if (editorial) latest.current.onEditText(id, value, true);
    else latest.current.onEditHtml(id, value, true);
  };
  const reload = () => {
    liveUntil.current = 0;
    setReloads((n) => n + 1);
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
  const latest = useRef({ selected, onSelect, onMove, onRemove, onEditText, onEditHtml, onFill, onDuplicate, onMeasure, onHistoryKey, group, onSelectAdd, onSelectMany, onMoveMany, onRemoveMany, onCopy, onPaste, onShortcut, onDropPhoto, onLock, fitId, onFitDone, locked: slide.locked });
  latest.current = { selected, onSelect, onMove, onRemove, onEditText, onEditHtml, onFill, onDuplicate, onMeasure, onHistoryKey, group, onSelectAdd, onSelectMany, onMoveMany, onRemoveMany, onCopy, onPaste, onShortcut, onDropPhoto, onLock, fitId, onFitDone, locked: slide.locked };
  const [extraBoxes, setExtraBoxes] = useState<CanvasBox[]>([]);
  // Glisser d'une photo depuis l'ordinateur : cadre qui la recevra (null = toute la slide).
  const [dropping, setDropping] = useState<false | ElementRect | null>(false);
  // Problèmes repérés sur la slide (texte coupé, trop petit, contraste) et recadrage en cours.
  const [issues, setIssues] = useState<(QualityIssue & { rect: ElementRect })[]>([]);
  // Cadres photo encore vides : invitation dessinée au-dessus de l'aperçu.
  const [emptyFrames, setEmptyFrames] = useState<(ElementRect & { id: string; radius: string })[]>([]);
  const [cropId, setCropId] = useState<string | null>(null);
  const cropRef = useRef<string | null>(null);
  const zoomRef = useRef<(el: HTMLElement, zoom: number) => Promise<Record<string, string> | null>>(async () => null);
  const fitRef = useRef<(ids: string | string[]) => void>(() => {});
  cropRef.current = cropId;
  useEffect(() => setCropId(null), [slide.id]);
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
              emptyFrame: el.hasAttribute("data-editor-photo-empty"),
              radius: el.style.borderRadius,
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
  const bind = () =>
    bindCanvas({
      frame,
      keepFocus,
      latest,
      tools,
      api,
      zoomRef,
      fitRef,
      cropRef,
      recheck,
      target,
      measure,
      commitLive,
      commitLiveMany,
      commitText,
      reload,
      setEditingId,
      setCropId,
      setMarquee,
      setGuides,
      setDropping,
      setOverflow,
      setEmptyFrames,
      setIssues,
    });
  // Poignées : élargir, rétrécir, allonger ; le coin agrandit aussi le texte.
  const startResize = (handle: Handle) => (e: React.PointerEvent<HTMLDivElement>) => {
    const el = target();
    const view = frame.current?.contentWindow;
    if (!el || !view || slide.locked) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    // Recadrage : le coin zoome dans la photo au lieu de changer son cadre.
    if (cropId && el.dataset.editorId === cropId) {
      const startZoom = Number(el.style.getPropertyValue("--editor-zoom")) || 1;
      const x0 = e.clientX;
      let last: Record<string, string> | null = null;
      const move = (ev: PointerEvent) => {
        const z = startZoom * (1 + (ev.clientX - x0) / Math.max(120, width / 2));
        zoomRef.current(el, z).then((st) => { last = st; measure(); });
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        if (last) commitLive(el.dataset.editorId!, last);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      return;
    }
    const computed = view.getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const text = !el.matches("[data-pptx-shape],[data-editor-shape]") && !isPhotoEl(el);
    const frameLike = !!el.querySelector("[data-editor-id]");
    const start = {
      x: e.clientX,
      y: e.clientY,
      w: el.offsetWidth || r.width, // vraie taille du bloc (la boîte à l'écran grandit s'il est tourné)
      h: el.offsetHeight || r.height,
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
    box && cropId && cropId === selected && !slide.locked
      ? ["se"]
      : !box || slide.locked || box.locked || box.kind === "veil" || (box.kind === "photo" && box.width >= 1075 && box.height >= 1345)
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

  return (
    <div className={zoom > 1 ? "max-h-[75vh] overflow-auto rounded-xl" : undefined}>
      {/* La barre de l'élément est posée à côté de la slide (pas dedans, qui coupe ce qui dépasse) :
          elle peut en sortir quand le texte choisi remplit la slide (W élargi, 18/10/2026). */}
      <div className="relative">
      <div
        ref={host}
        className="relative overflow-hidden rounded-xl border bg-white shadow-sm"
        style={{ aspectRatio: "1080 / 1350", width: `${zoom * 100}%` }}
        // Photo lâchée à côté de l’aperçu (bord, barre flottante) : sans ça, le
        // navigateur ouvrirait le fichier à la place de l'éditeur.
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes("Files") || slide.locked || !onDropPhoto) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        }}
        onDrop={(e) => {
          if (!e.dataTransfer.types.includes("Files")) return;
          e.preventDefault();
          setDropping(false);
          const file = Array.from(e.dataTransfer.files).find((f) => f.type.startsWith("image/"));
          if (!file || slide.locked || !onDropPhoto) return;
          onDropPhoto(file, box?.kind === "photo" ? selected : null);
        }}
      >
        {dropping !== false && (
          <div
            data-testid="photo-drop-target"
            className="pointer-events-none absolute z-20 flex items-center justify-center rounded-sm border-2 border-dashed border-primary bg-primary/20 p-2 text-center text-sm font-semibold text-primary"
            style={dropping ? { left: dropping.left * scale, top: dropping.top * scale, width: dropping.width * scale, height: dropping.height * scale } : { inset: 0 }}
          >
            <span className="rounded-md bg-background/90 px-2 py-1 shadow">{dropping ? "Dépose la photo dans ce cadre" : "Dépose la photo ici"}</span>
          </div>
        )}
        {width > 0 && (
          <iframe
            ref={frame}
            title={`Éditeur de la slide ${slide.data.slide_number}`}
            sandbox="allow-same-origin"
            onLoad={bind}
            srcDoc={`<!doctype html><html><head><style>html,body{margin:0;width:1080px;height:1350px;overflow:hidden;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;touch-action:none}*{box-sizing:border-box}[data-editor-id]{cursor:${slide.locked ? "default" : "move"}}</style></head><body>${shown}</body></html>`}
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
        {marquee && (
          <div aria-hidden="true" data-testid="selection-marquee" style={{ position: "absolute", left: marquee.x * scale, top: marquee.y * scale, width: marquee.w * scale, height: marquee.h * scale, border: "1px solid #FB3D80", background: "rgba(251, 61, 128, 0.08)", pointerEvents: "none" }} />
        )}
        {guides.x !== null && (
          <div aria-hidden="true" data-testid="guide-x" style={{ position: "absolute", top: 0, bottom: 0, left: guides.x * scale, width: 0, borderLeft: "1px dashed #FB3D80", pointerEvents: "none" }} />
        )}
        {guides.y !== null && (
          <div aria-hidden="true" data-testid="guide-y" style={{ position: "absolute", left: 0, right: 0, top: guides.y * scale, height: 0, borderTop: "1px dashed #FB3D80", pointerEvents: "none" }} />
        )}
        {emptyFrames.map((f) => (
          <div
            key={f.id}
            aria-hidden="true"
            data-testid="empty-photo-frame"
            className="pointer-events-none absolute z-[5] flex flex-col items-center justify-center gap-1 border-2 border-dashed border-muted-foreground/40 p-1 text-center text-2xs font-medium text-muted-foreground"
            style={{
              left: f.left * scale,
              top: f.top * scale,
              width: f.width * scale,
              height: f.height * scale,
              // Même forme que le cadre (rayons en px de la slide → px de l'aperçu).
              borderRadius: f.radius.replace(/([\d.]+)px/g, (_, n) => `${parseFloat(n) * scale}px`),
            }}
          >
            {f.width * scale > 60 && f.height * scale > 40 && (
              <>
                <ImagePlus size={18} />
                {f.width * scale > 110 && <span>Glisse une photo ici</span>}
              </>
            )}
          </div>
        ))}
        {/* Problèmes repérés sur la slide : une pastille par élément, un clic pour le choisir. */}
        {issues.map((issue, k) => (
          <button
            key={`${issue.elementId}-${issue.kind}-${k}`}
            type="button"
            data-testid="slide-issue"
            title={issue.message}
            aria-label={`À vérifier : ${issue.message}`}
            onClick={() => latest.current.onSelect(issue.elementId)}
            className={`absolute z-[15] flex h-5 w-5 items-center justify-center rounded-full text-2xs font-bold text-white shadow ${issue.severity === "error" ? "bg-red-600" : "bg-amber-500"}`}
            style={{
              left: Math.min(width - 22, Math.max(2, (issue.rect.left + issue.rect.width) * scale - 10)),
              top: Math.min(width * 1.25 - 22, Math.max(2, issue.rect.top * scale - 10)),
            }}
          >
            !
          </button>
        ))}
        {cropId && (
          <div className="absolute inset-x-2 top-2 z-20 flex items-center justify-between gap-2 rounded-lg bg-background/95 px-3 py-1.5 text-2xs shadow">
            <span>Recadrage : glisse la photo, zoome avec la molette ou le coin.</span>
            <button type="button" className="rounded-md bg-primary px-2 py-1 font-semibold text-primary-foreground" onClick={() => setCropId(null)}>
              Terminé
            </button>
          </div>
        )}
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
      <CanvasToolbar
        box={box}
        selected={selected}
        slide={slide}
        dropping={dropping}
        scale={scale}
        width={width}
        issues={issues}
        tools={tools}
        latest={latest}
        fitRef={fitRef}
        cropId={cropId}
        setCropId={setCropId}
        onReplacePhoto={onReplacePhoto}
        colors={colors}
        editingId={editingId}
        simple={simple}
        outside={zoom <= 1}
      />
      </div>
      {overflow && (
        <p role="status" className="mt-2 text-xs text-amber-700">
          Un élément dépasse ou manque de place. Ajuste sa taille ou sa position
          avant d’exporter.
          {!slide.locked && (
            <button
              type="button"
              className="ml-2 rounded-md border border-amber-700/40 px-2 py-0.5 font-medium hover:bg-amber-50"
              onClick={() => {
                const doc = frame.current?.contentDocument;
                const texts = new Set(getEditorElements(slide.html).filter((e) => e.kind === "text").map((e) => e.id));
                const ids = doc
                  ? findClippedIds(doc).filter((id) => {
                      const el = doc.querySelector<HTMLElement>(`[data-editor-id="${id}"]`);
                      return texts.has(id) && !!el && !isLockedEl(el);
                    })
                  : [];
                if (!ids.length) {
                  toast("Ce n’est pas un texte qui dépasse", { description: "Déplace ou réduis le bloc signalé sur la slide." });
                  return;
                }
                fitRef.current(ids);
              }}
            >
              Ajuster la taille
            </button>
          )}
        </p>
      )}
    </div>
  );
}
