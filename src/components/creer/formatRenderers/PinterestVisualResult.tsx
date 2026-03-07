import { useRef, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Copy } from "lucide-react";
import { toast } from "sonner";

interface Props {
  result: any; // { raw: { pin_html, title, description } }
  pinHtml: string | null;
}

export default function PinterestVisualResult({ result, pinHtml }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);

  const title = result?.raw?.title || "";
  const description = result?.raw?.description || "";
  const html = pinHtml || result?.raw?.pin_html || "";

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
          {html && scale > 0 ? (
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
          ) : (
            <div className="flex items-center justify-center h-full">
              <p className="text-sm text-muted-foreground animate-pulse">
                Génération en cours...
              </p>
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
