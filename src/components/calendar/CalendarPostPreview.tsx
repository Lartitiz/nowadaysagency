import { Button } from "@/components/ui/button";
import { Download, Loader2, Sparkles, FileDown, ChevronDown } from "lucide-react";
import { useState, useCallback } from "react";
import html2canvas from "html2canvas";
import { exportCarouselVisualPptx } from "@/lib/export-carousel-visual-pptx";
import { SocialMockup } from "@/components/social-mockup/SocialMockup";
import { ContentPreview } from "@/components/ContentPreview";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

interface Props {
  canal: string;
  format: string | null;
  caption: string | null;
  theme: string;
  username: string;
  displayName: string;
  mediaUrls?: string[];
  visualHtml?: { slide_number: number; html: string }[] | null;
  onNavigateToGenerator: () => void;
  hasAngle: boolean;
  hasTheme: boolean;
}

export function CalendarPostPreview({
  canal, format, caption, theme, username, displayName,
  mediaUrls, visualHtml, onNavigateToGenerator, hasAngle, hasTheme,
}: Props) {
  const [downloading, setDownloading] = useState(false);
  const [downloadingPptx, setDownloadingPptx] = useState(false);

  // ── Télécharger en PNG (ZIP si plusieurs slides) ──
  const handleDownloadImages = useCallback(async () => {
    if (!visualHtml || visualHtml.length === 0 || downloading) return;
    setDownloading(true);

    const container = document.createElement("div");
    container.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:1080px;height:1350px;overflow:hidden;z-index:-1;";
    document.body.appendChild(container);

    try {
      const images: { name: string; blob: Blob }[] = [];

      for (const vs of visualHtml) {
        container.innerHTML = vs.html;
        await document.fonts.ready;
        await new Promise(r => setTimeout(r, 400));

        const canvas = await html2canvas(container, {
          width: 1080,
          height: 1350,
          scale: 1,
          useCORS: true,
          allowTaint: true,
          backgroundColor: null,
          logging: false,
        });

        const blob = await new Promise<Blob>((resolve) => {
          canvas.toBlob((b) => resolve(b!), "image/png");
        });

        images.push({ name: `slide-${vs.slide_number}.png`, blob });
      }

      if (images.length === 1) {
        const url = URL.createObjectURL(images[0].blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = images[0].name;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        try {
          const JSZip = (await import("jszip")).default;
          const zip = new JSZip();
          for (const img of images) zip.file(img.name, img.blob);
          const zipBlob = await zip.generateAsync({ type: "blob" });
          const url = URL.createObjectURL(zipBlob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `visuels-${theme || "carrousel"}.zip`.replace(/[^a-zA-Z0-9àâéèêëïîôùûüç\-_.]/g, "-");
          a.click();
          URL.revokeObjectURL(url);
        } catch {
          for (const img of images) {
            const url = URL.createObjectURL(img.blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = img.name;
            a.click();
            URL.revokeObjectURL(url);
            await new Promise(r => setTimeout(r, 200));
          }
        }
      }
    } catch (err) {
      console.error("Download error:", err);
    } finally {
      document.body.removeChild(container);
      setDownloading(false);
    }
  }, [visualHtml, downloading, theme]);

  // ── Télécharger en PPTX ──
  const handleDownloadPptx = useCallback(async () => {
    if (!visualHtml || visualHtml.length === 0 || downloadingPptx) return;
    setDownloadingPptx(true);
    try {
      const fileName = `visuels-${theme || "carrousel"}`.replace(/[^a-zA-Z0-9àâéèêëïîôùûüç\-_.]/g, "-");
      await exportCarouselVisualPptx(visualHtml, fileName);
    } catch (err) {
      console.error("PPTX export error:", err);
    } finally {
      setDownloadingPptx(false);
    }
  }, [visualHtml, downloadingPptx, theme]);

  if (!caption) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-3xl mb-3">👁️</p>
        <p className="text-sm text-muted-foreground mb-4">
          Génère d'abord ton contenu pour le prévisualiser ici.
        </p>
        {hasTheme && hasAngle && (
          <Button onClick={onNavigateToGenerator} className="rounded-full gap-1.5">
            <Sparkles className="h-4 w-4" /> Générer le contenu
          </Button>
        )}
        {(!hasTheme || !hasAngle) && (
          <p className="text-xs text-muted-foreground italic">
            Remplis le thème et l'angle dans l'onglet Éditer.
          </p>
        )}
      </div>
    );
  }

  // Visual HTML slides from carousel generator
  if (visualHtml && visualHtml.length > 0) {
    return (
      <div className="py-2 space-y-4 overflow-y-auto max-h-[60vh]">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">✨ Visuels générés ({visualHtml.length} slides)</p>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                disabled={downloading || downloadingPptx}
                className="rounded-full gap-1.5 text-xs"
              >
                {(downloading || downloadingPptx) ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5" />
                )}
                {downloading ? "Export images..." : downloadingPptx ? "Export PPTX..." : "Télécharger"}
                <ChevronDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleDownloadImages}>
                <Download className="h-4 w-4 mr-2" />
                Images PNG {visualHtml.length > 1 ? "(ZIP)" : "(PNG)"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleDownloadPptx}>
                <FileDown className="h-4 w-4 mr-2" />
                Présentation (PPTX)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {visualHtml.map((vs, idx) => (
          <div key={idx} className="rounded-xl border border-border overflow-hidden bg-card inline-block w-full max-w-[320px] mx-auto block">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/50 border-b border-border">
              <span className="text-xs font-medium text-muted-foreground">Slide {vs.slide_number}</span>
            </div>
            <div className="relative overflow-hidden" style={{ width: "320px", height: "400px" }}>
              <div style={{ transform: "scale(0.296)", transformOrigin: "top left", width: "1080px", height: "1350px", position: "absolute", top: 0, left: 0 }}>
                <iframe
                  srcDoc={vs.html}
                  title={`Slide ${vs.slide_number}`}
                  width="1080"
                  height="1350"
                  style={{ border: "none", pointerEvents: "none" }}
                  sandbox="allow-same-origin allow-scripts"
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  let parsed: any = null;
  try { parsed = JSON.parse(caption); } catch { /* plain text */ }

  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    return (
      <div className="py-2 overflow-y-auto">
        <ContentPreview contentData={parsed} />
      </div>
    );
  }

  if (parsed && Array.isArray(parsed)) {
    const slides = parsed.map((s: any, i: number) => ({
      title: s.title || s.titre || `Slide ${i + 1}`,
      body: s.body || s.texte || s.content || "",
      slideNumber: i + 1,
    }));
    const mockupCanal = (canal === "instagram" || canal === "linkedin") ? canal : "instagram";
    return (
      <div className="flex justify-center py-2 overflow-y-auto">
        <SocialMockup
          canal={mockupCanal}
          format="carousel"
          username={username || "mon_compte"}
          displayName={displayName || ""}
          caption={theme}
          slides={slides}
          mediaUrls={mediaUrls}
          showComments={false}
          readonly
          hideFollowButton
        />
      </div>
    );
  }

  const mockupCanal = (canal === "instagram" || canal === "linkedin") ? canal : "instagram";
  const mockupFormat = (() => {
    if (format === "post_carrousel") return "carousel" as const;
    if (format === "reel") return "reel" as const;
    if (format === "story_serie") return "story" as const;
    return "post" as const;
  })();

  return (
    <div className="flex justify-center py-2 overflow-y-auto">
      <SocialMockup
        canal={mockupCanal}
        format={mockupFormat}
        username={username || "mon_compte"}
        displayName={displayName || ""}
        caption={caption}
        mediaUrls={mediaUrls}
        showComments={false}
        readonly
        hideFollowButton
      />
    </div>
  );
}
