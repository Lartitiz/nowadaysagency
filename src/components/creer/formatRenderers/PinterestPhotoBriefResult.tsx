import { useRef, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Copy } from "lucide-react";
import { toast } from "sonner";

interface Props {
  result: any; // { raw: { photo_brief, overlay_html, title, description } }
  overlayHtml: string | null;
}

export default function PinterestPhotoBriefResult({ result, overlayHtml }: Props) {
  const r = result?.raw || {};
  const brief = r.photo_brief || {};
  const title = r.title || "";
  const description = r.description || "";
  const html = overlayHtml || r.overlay_html || "";

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

  const copyText = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copié !`);
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
    navigator.clipboard.writeText(text);
    toast.success("Tout copié !");
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
          {html && scale > 0 ? (
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
          ) : (
            <div className="flex items-center justify-center h-full">
              <p className="text-sm text-muted-foreground animate-pulse">
                Génération en cours...
              </p>
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
          <Button variant="outline" size="icon" onClick={() => copyText(title, "Titre")}>
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
