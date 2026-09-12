import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
} from "lucide-react";
import PhotoSwapDialog from "@/components/creer/PhotoSwapDialog";
import type { PhotoItem } from "@/components/creer/PhotoUploadZone";
import RedFlagsChecker, { fixRedFlags } from "@/components/RedFlagsChecker";
import { toast } from "sonner";
import { hasClippedElement } from "@/lib/carousel-quality";
import {
  addTextElement,
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


interface Props {
  result: any;
  visualSlides: { slide_number: number; html: string }[];
  onChange: (
    raw: any,
    visuals: { slide_number: number; html: string }[],
  ) => void;
  photos?: PhotoItem[];
  onAddPhoto?: (photo: PhotoItem) => number;
  onStaleChange?: (stale: boolean) => void;
  cloudTools?: ReactNode;
  quality?: CarouselQuality;
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

function SlideCanvas({
  slide,
  selected,
  onSelect,
  onMove,
}: {
  slide: EditorSlide;
  selected: string | null;
  onSelect: (id: string) => void;
  onMove: (id: string, styles: Record<string, string>) => void;
}) {
  const host = useRef<HTMLDivElement>(null),
    frame = useRef<HTMLIFrameElement>(null);
  const [width, setWidth] = useState(0),
    [overflow, setOverflow] = useState(false);
  const latest = useRef({ selected, onSelect, onMove, locked: slide.locked });
  latest.current = { selected, onSelect, onMove, locked: slide.locked };
  useEffect(() => {
    const measure = () => setWidth(host.current?.clientWidth || 0);
    measure();
    const observer = new ResizeObserver(measure);
    if (host.current) observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  const highlight = () =>
    frame.current?.contentDocument
      ?.querySelectorAll<HTMLElement>("[data-editor-id]")
      .forEach((el) => {
        el.style.outline =
          el.dataset.editorId === latest.current.selected
            ? "3px solid #c02769"
            : "";
        el.style.outlineOffset = "6px";
      });
  useEffect(highlight, [selected, slide.html]);
  const bind = () => {
    const doc = frame.current?.contentDocument;
    if (!doc) return;
    highlight();
    let drag: {
      id: string;
      x: number;
      y: number;
      left: number;
      top: number;
      photo: boolean;
      el: HTMLElement;
    } | null = null;
    doc.addEventListener("click", (e) => {
      e.preventDefault();
      const el = (e.target as HTMLElement).closest<HTMLElement>(
        "[data-editor-id]",
      );
      if (el) latest.current.onSelect(el.dataset.editorId!);
    });
    doc.addEventListener("pointerdown", (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>(
        "[data-editor-id]",
      );
      if (!el || latest.current.locked) return;
      latest.current.onSelect(el.dataset.editorId!);
      const photo =
        el.tagName === "IMG" ||
        el.hasAttribute("data-pptx-photo") ||
        el.hasAttribute("data-editor-photo");
      const pos = (
        el.style.objectPosition ||
        el.style.backgroundPosition ||
        "50% 50%"
      ).split(" ");
      const computed = doc.defaultView!.getComputedStyle(el);
      drag = {
        id: el.dataset.editorId!,
        x: e.clientX,
        y: e.clientY,
        left: photo ? numberOr(pos[0], 50) : numberOr(computed.left, 0),
        top: photo ? numberOr(pos[1], 50) : numberOr(computed.top, 0),
        photo,
        el,
      };
      el.setPointerCapture?.(e.pointerId);
      e.preventDefault();
    });
    doc.addEventListener("pointermove", (e) => {
      if (!drag) return;
      const d = drag,
        dx = e.clientX - d.x,
        dy = e.clientY - d.y;
      if (d.photo) {
        const pos = `${clamp(d.left - dx / 10.8, 0, 100)}% ${clamp(d.top - dy / 13.5, 0, 100)}%`;
        d.el.style.objectPosition = pos;
        d.el.style.backgroundPosition = pos;
      } else {
        if (d.el.style.position !== "absolute")
          d.el.style.position = "relative";
        d.el.style.left = `${d.left + dx}px`;
        d.el.style.top = `${d.top + dy}px`;
      }
    });
    doc.addEventListener("pointerup", (e) => {
      if (!drag) return;
      const d = drag;
      drag = null;
      const dx = e.clientX - d.x,
        dy = e.clientY - d.y;
      if (Math.abs(dx) + Math.abs(dy) < 5) return;
      if (d.photo) {
        const pos = `${clamp(d.left - dx / 10.8, 0, 100)}% ${clamp(d.top - dy / 13.5, 0, 100)}%`;
        latest.current.onMove(d.id, {
          "object-position": pos,
          "background-position": pos,
        });
      } else
        latest.current.onMove(d.id, {
          position:
            d.el.style.position === "absolute" ? "absolute" : "relative",
          left: `${Math.round(d.left + dx)}px`,
          top: `${Math.round(d.top + dy)}px`,
        });
    });
    doc.addEventListener("pointercancel", () => {
      drag = null;
    });
    // Même inspection géométrique que le contrôle qualité global : l'aperçu
    // n'annonce jamais un débordement que la QA ignorerait, ni l'inverse.
    const check = () => setOverflow(hasClippedElement(doc));
    check();
    doc.fonts?.ready.then(check);
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
            srcDoc={`<!doctype html><html><head><style>html,body{margin:0;width:1080px;height:1350px;overflow:hidden}*{box-sizing:border-box}[data-editor-id]{cursor:${slide.locked ? "default" : "move"}}</style></head><body>${slide.html}</body></html>`}
            style={{
              position: "absolute",
              width: 1080,
              height: 1350,
              border: 0,
              transform: `scale(${width / 1080})`,
              transformOrigin: "top left",
            }}
          />
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
  onStaleChange,
  cloudTools,
  quality,
}: Props) {
  const raw = result?.raw || result;
  const [document, setDocument] = useState<CarouselDocument>(() =>
    readCarouselDocument(raw, visualSlides),
  );
  const [active, setActive] = useState(0),
    [selected, setSelected] = useState<string | null>(null),
    [photoOpen, setPhotoOpen] = useState(false);
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
    setSelected(null);
  };
  const slide = document.slides[Math.min(active, document.slides.length - 1)];
  const elements = useMemo(
    () => (slide ? getEditorElements(slide.html) : []),
    [slide],
  );
  const element = elements.find((e) => e.id === selected);
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
      <span className="flex justify-between gap-2">
        <span>{label}</span>
        <span>{Math.round(value * 10) / 10}</span>
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
    const rgb = value?.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    return rgb
      ? `#${rgb
          .slice(1)
          .map((v) => Number(v).toString(16).padStart(2, "0"))
          .join("")}`
      : fallback;
  };
  if (!slide) return null;
  return (
    <section aria-label="Éditeur de carrousel" className="space-y-4">
      {cloudTools}
      {quality && quality.status !== "idle" && (
        <div
          className="rounded-xl border p-3 space-y-2 text-sm"
          aria-label="Contrôle qualité"
        >
          <div className="flex items-center justify-between gap-2">
            <p role="status">
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
            mobile, contraste mesuré insuffisant sur fond uni et images
            manquantes. Les textes posés sur une photo ou une transparence
            restent des conseils : vérifie-les à l’œil.
          </p>

        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold text-lg">Modifier mon carrousel</h2>
          <p className="text-xs text-muted-foreground">
            Clique sur un élément ou choisis-le dans la liste. Tes retouches ne
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
          >
            <Undo2 size={15} />
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!history.current.future.length}
            onClick={() => undo(true)}
            aria-label="Rétablir la modification"
          >
            <Redo2 size={15} />
          </Button>
        </div>
      </div>
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
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_240px]">
        <div className="min-w-0 max-w-[540px] w-full mx-auto">
          <SlideCanvas
            slide={slide}
            selected={selected}
            onSelect={setSelected}
            onMove={(id, styles) =>
              changeSlide(patchElement(slide, id, { styles }))
            }
          />
          <p className="mt-2 text-xs text-muted-foreground text-center">
            Slide {active + 1} / {document.slides.length} · Glisse un texte pour
            le déplacer, une photo pour la recadrer.
          </p>
        </div>
        <div className="min-w-0 space-y-4 rounded-xl border bg-muted/20 p-3">
          <label className="block text-xs font-medium">
            Élément à modifier
            <select
              aria-label="Élément à modifier"
              value={selected || ""}
              onChange={(e) => setSelected(e.target.value || null)}
              className="mt-1 w-full rounded-md border bg-background p-2 text-sm"
            >
              <option value="">Choisir un élément…</option>
              {elements.map((e, i) => (
                <option key={e.id} value={e.id}>
                  {e.kind === "photo"
                    ? "Photo"
                    : e.kind === "shape"
                      ? "Forme"
                      : e.text.slice(0, 35) || "Texte vide"}{" "}
                  · {i + 1}
                </option>
              ))}
            </select>
          </label>
          {slide.locked && (
            <p role="status" className="text-xs">
              Slide verrouillée : déverrouille-la pour la modifier.
            </p>
          )}
          <fieldset
            disabled={slide.locked}
            className="space-y-3 disabled:opacity-50"
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
              </>
            )}
            {element?.kind === "photo" && (
              <>
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
              </>
            )}
            {element && element.kind !== "photo" && (
              <>
                {range(
                  "Position horizontale",
                  parseFloat(css.left) || 0,
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
                  parseFloat(css.top) || 0,
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
                  parseFloat(css.width) || 800,
                  80,
                  1000,
                  (n) => style({ width: `${n}px`, "max-width": "none" }),
                )}
                <label className="flex items-center justify-between text-xs">
                  Fond du bloc
                  <input
                    aria-label="Fond du bloc"
                    type="color"
                    value={toHex(css["background-color"], "#ffffff")}
                    onChange={(e) =>
                      style({ "background-color": e.target.value })
                    }
                  />
                </label>
              </>
            )}
            {element && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  changeSlide(
                    patchElement(slide, element.id, { remove: true }),
                  );
                  setSelected(null);
                }}
              >
                Retirer cet élément
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => changeSlide(addTextElement(slide))}
            >
              Ajouter un texte
            </Button>
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
