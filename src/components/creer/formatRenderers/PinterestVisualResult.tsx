import { useRef, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Copy, ImageOff, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { stripFontImportLeak } from "@/lib/strip-font-import-leak";

interface Props {
  result: any; // { raw: { pin_html, title, description } }
  pinHtml: string | null;
  /** Relance une génération complète (1 crédit) quand le visuel manque. */
  onRetry?: () => void;
}

export default function PinterestVisualResult({ result, pinHtml, onRetry }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);

  const title = result?.raw?.title || "";
  const description = result?.raw?.description || "";
  const html = stripFontImportLeak(pinHtml || result?.raw?.pin_html || "");

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

  const copyAll = () => {
    navigator.clipboard.writeText(`${title}\n\n${description}`);
    toast.success("Titre + description copiés !");
  };

  return (
    <div className="space-y-4 animate-fade-in">
      {/* 1) Preview du visuel */}
      <div className="flex justify-center">
        <div
          ref={containerRef}
          className="relative overflow-hidden rounded-2xl shadow-lg w-full max-w-[340px] sm:max-w-[400px]"
          style={{ aspectRatio: "2 / 3", background: "#F5F5F5" }}
        >
          {/* Sans HTML, rien ne tourne : afficher « Génération en cours » ici
              serait un mensonge (vu au test live 17/07 : l'IA avait rendu le
              titre/la description mais pas le pin_html, et le faux libellé
              restait affiché indéfiniment). */}
          {html ? (
            scale > 0 && (
              <iframe
                srcDoc={html}
                title="Épingle visuelle Pinterest"
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
                Le visuel n'a pas pu être créé cette fois.
              </p>
              <p className="text-xs text-muted-foreground">
                Ton titre et ta description sont prêts ci-dessous.
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

      {/* 2) Titre SEO */}
      <div className="space-y-1">
        <label className="text-sm font-medium text-foreground">
          📌 Titre Pinterest (SEO)
        </label>
        <div className="flex gap-2">
          <Input value={title} readOnly className="flex-1" />
          <Button
            variant="outline"
            size="icon"
            onClick={() => copyText(title, "Titre")}
            aria-label="Copier le titre"
          >
            <Copy className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {title.length} / 100 caractères
        </p>
      </div>

      {/* 3) Description SEO */}
      <div className="space-y-1">
        <label className="text-sm font-medium text-foreground">
          📝 Description Pinterest (SEO)
        </label>
        <div className="flex gap-2 items-start">
          <Textarea
            value={description}
            readOnly
            className="flex-1 min-h-[120px]"
          />
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

      {/* 4) Tout copier */}
      <div className="flex justify-center">
        <Button variant="outline" size="sm" onClick={copyAll}>
          <Copy className="h-3.5 w-3.5 mr-1.5" />
          Tout copier
        </Button>
      </div>
    </div>
  );
}
