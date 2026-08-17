import { useRef, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Copy, ImageOff, RefreshCw } from "lucide-react";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { stripFontImportLeak } from "@/lib/strip-font-import-leak";

interface Props {
  result: any; // { raw: { photo_brief, overlay_html, title, description } }
  overlayHtml: string | null;
  /** Relance une génération complète (1 crédit) quand l'aperçu manque. */
  onRetry?: () => void;
}

export default function PinterestPhotoBriefResult({ result, overlayHtml, onRetry }: Props) {
  const r = result?.raw || {};
  const brief = r.photo_brief || {};
  const title = r.title || "";
  const description = r.description || "";
  const html = stripFontImportLeak(overlayHtml || r.overlay_html || "");

  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.getBoundingClientRect().width;
      setScale(w / 1000);
    };
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, []);

  const wordCount = description.trim().split(/\s+/).filter(Boolean).length;
  const copy = useCopyToClipboard();

  const copyText = (text: string, label: string) => {
    copy(text, `${label} copié !`);
  };

  const formatBriefText = () => {
    const lines = ["📷 BRIEF PHOTO :"];
    if (brief.what) lines.push(`• Sujet : ${brief.what}`);
    if (brief.framing) lines.push(`• Cadrage : ${brief.framing}`);
    if (brief.lighting) lines.push(`• Lumière : ${brief.lighting}`);
    if (brief.colors) lines.push(`• Couleurs : ${brief.colors}`);
    if (brief.mood) lines.push(`• Ambiance : ${brief.mood}`);
    if (brief.props?.length) lines.push(`• Accessoires : ${brief.props.join(", ")}`);
    return lines.join("\n");
  };

  const copyAll = () => {
    const text = `📌 ${title}\n\n${description}\n\n${formatBriefText()}`;
    copy(text, "Tout copié !");
  };

  return (
    <div className="space-y-4 animate-fade-in">
      {/* 1) Preview overlay */}
      <div className="flex justify-center">
        <div
          ref={containerRef}
          className="relative overflow-hidden rounded-2xl shadow-lg w-full max-w-[340px] sm:max-w-[400px]"
          style={{ aspectRatio: "2 / 3", background: "hsl(var(--muted))" }}
        >
          {/* Sans HTML, rien ne tourne : afficher « Génération en cours » ici
              serait un mensonge (même piège que PinterestVisualResult — le
              faux libellé restait affiché indéfiniment quand l'overlay
              manquait à la réponse). */}
          {html ? (
            scale > 0 && (
              <iframe
                srcDoc={html}
                title="Overlay Pinterest"
                sandbox="allow-same-origin"
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "1000px",
                  height: "1500px",
                  transform: `scale(${scale})`,
                  transformOrigin: "top left",
                  border: "none",
                  pointerEvents: "none",
                }}
              />
            )
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-3 px-6 text-center">
              <ImageOff className="h-6 w-6 text-muted-foreground" />
              <p className="text-sm font-medium text-foreground">
                L'aperçu n'a pas pu être créé cette fois.
              </p>
              <p className="text-xs text-muted-foreground">
                Ton brief photo et ta description sont prêts ci-dessous.
              </p>
              {onRetry && (
                <Button variant="outline" size="sm" onClick={onRetry} className="gap-1.5 mt-1">
                  <RefreshCw className="h-3.5 w-3.5" /> Réessayer (1 crédit)
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 2) Brief photo */}
      {(brief.what || brief.framing || brief.lighting) && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <p className="font-semibold text-foreground">📷 Brief photo</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {brief.what && (
              <div className="rounded-lg border border-border bg-muted/50 p-3">
                <p className="text-xs font-medium text-muted-foreground mb-1">🎯 Sujet</p>
                <p className="text-sm text-foreground">{brief.what}</p>
              </div>
            )}
            {brief.framing && (
              <div className="rounded-lg border border-border bg-muted/50 p-3">
                <p className="text-xs font-medium text-muted-foreground mb-1">📐 Cadrage</p>
                <p className="text-sm text-foreground">{brief.framing}</p>
              </div>
            )}
            {brief.lighting && (
              <div className="rounded-lg border border-border bg-muted/50 p-3">
                <p className="text-xs font-medium text-muted-foreground mb-1">💡 Lumière</p>
                <p className="text-sm text-foreground">{brief.lighting}</p>
              </div>
            )}
            {brief.colors && (
              <div className="rounded-lg border border-border bg-muted/50 p-3">
                <p className="text-xs font-medium text-muted-foreground mb-1">🎨 Couleurs</p>
                <p className="text-sm text-foreground">{brief.colors}</p>
              </div>
            )}
            {brief.mood && (
              <div className="rounded-lg border border-border bg-muted/50 p-3">
                <p className="text-xs font-medium text-muted-foreground mb-1">✨ Ambiance</p>
                <p className="text-sm text-foreground">{brief.mood}</p>
              </div>
            )}
          </div>

          {brief.props?.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5">🧩 Accessoires</p>
              <div className="flex flex-wrap gap-1.5">
                {brief.props.map((prop: string, i: number) => (
                  <span
                    key={i}
                    className="inline-block rounded-full border border-border bg-muted/50 px-2.5 py-0.5 text-xs text-foreground"
                  >
                    {prop}
                  </span>
                ))}
              </div>
            </div>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={() => copyText(formatBriefText(), "Brief")}
            className="mt-1"
          >
            <Copy className="h-3.5 w-3.5 mr-1.5" />
            Copier le brief
          </Button>
        </div>
      )}

      {/* 3) Titre SEO */}
      <div className="space-y-1">
        <label className="text-sm font-medium text-foreground">
          📌 Titre Pinterest (SEO)
        </label>
        <div className="flex gap-2">
          <Input value={title} readOnly className="flex-1" />
          <Button variant="outline" size="icon" onClick={() => copyText(title, "Titre")} aria-label="Copier le titre">
            <Copy className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{title.length} / 100 caractères</p>
      </div>

      {/* 4) Description SEO */}
      <div className="space-y-1">
        <label className="text-sm font-medium text-foreground">
          📝 Description Pinterest (SEO)
        </label>
        <div className="flex gap-2 items-start">
          <Textarea value={description} readOnly className="flex-1 min-h-[120px]" />
          <Button
            variant="outline"
            size="icon"
            className="mt-0"
            onClick={() => copyText(description, "Description")}
            aria-label="Copier la description"
          >
            <Copy className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {wordCount} mot{wordCount > 1 ? "s" : ""}
        </p>
      </div>

      {/* 5) Tout copier */}
      <div className="flex justify-center">
        <Button variant="outline" size="sm" onClick={copyAll}>
          <Copy className="h-3.5 w-3.5 mr-1.5" />
          Tout copier
        </Button>
      </div>
    </div>
  );
}
