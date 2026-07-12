import { Button } from "@/components/ui/button";
import { Download, Loader2, Sparkles, ChevronDown, ChevronLeft, ChevronRight, Copy, Maximize2, ExternalLink } from "lucide-react";
import { useState, useCallback, useEffect } from "react";
import { exportCarouselPng } from "@/lib/export-carousel-png";
import { exportCarouselHybridPptx } from "@/lib/export-carousel-hybrid-pptx";
import { SocialMockup } from "@/components/social-mockup/SocialMockup";
import { ContentPreview } from "@/components/ContentPreview";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { DownloadMenuItems } from "@/components/exports/DownloadMenuItems";
import { toast } from "sonner";
import { useBrandCharter } from "@/hooks/use-branding";
import { getIncludeLogoPref, setIncludeLogoPref } from "@/lib/export-logo";
import { useOpenInCanva } from "@/hooks/use-open-in-canva";

interface Props {
  canal: string;
  format: string | null;
  caption: string | null;
  theme: string;
  username: string;
  displayName: string;
  mediaUrls?: string[];
  visualHtml?: { slide_number: number; html: string }[] | null;
  visualUrls?: string[] | null;
  onNavigateToGenerator: () => void;
  hasAngle: boolean;
  hasTheme: boolean;
  slidesData?: any[] | null;
  photoUrls?: string[] | null;
  compact?: boolean;
  onFullscreen?: () => void;
  syncStatus?: "synced" | "dirty";
}

export function CalendarPostPreview({
  canal, format, caption, theme, username, displayName,
  mediaUrls, visualHtml, visualUrls, onNavigateToGenerator, hasAngle, hasTheme,
  slidesData, photoUrls, compact = false, onFullscreen, syncStatus,
}: Props) {
  // Fallback : si pas de mediaUrls fournis, utiliser les photos uploadées par l'utilisateur
  const effectiveMediaUrls = (mediaUrls && mediaUrls.length > 0)
    ? mediaUrls
    : (photoUrls && photoUrls.length > 0 ? photoUrls : undefined);
  const { data: charterData } = useBrandCharter();
  const { openInCanva, openingCanva } = useOpenInCanva();
  const [downloadingPng, setDownloadingPng] = useState(false);
  const [downloadingHybrid, setDownloadingHybrid] = useState(false);
  const [slideIndex, setSlideIndex] = useState(0);
  // Repartir de la 1ʳᵉ slide quand on change de post (sinon on reste sur un index élevé
  // d'un carrousel précédent — caption est un identifiant stable du contenu affiché).
  useEffect(() => { setSlideIndex(0); }, [caption, format, canal]);
  const [includeLogo, setIncludeLogo] = useState(getIncludeLogoPref());
  const logoUrl = (charterData as any)?.logo_url || null;
  const handleIncludeLogoChange = (v: boolean) => { setIncludeLogo(v); setIncludeLogoPref(v); };

  const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9àâéèêëïîôùûüç\-_.]/g, "-");

  // ── PNG depuis visualHtml (capture html2canvas) ──
  const handleDownloadImages = useCallback(async () => {
    if (!visualHtml || visualHtml.length === 0 || downloadingPng) return;
    setDownloadingPng(true);
    try {
      const res = await exportCarouselPng(visualHtml, theme || "carrousel", includeLogo ? logoUrl : null);
      if (res.failed.length > 0) {
        toast.warning(`${res.exported}/${res.total} slides téléchargées — la slide ${res.failed.join(", ")} n'a pas pu être rendue.`);
      }
    } catch (err) {
      console.error("Download error:", err);
      toast.error("Erreur lors du téléchargement");
    } finally {
      setDownloadingPng(false);
    }
  }, [visualHtml, downloadingPng, theme, includeLogo, logoUrl]);

  // ── PNG depuis Storage URLs (déjà rendus côté serveur) ──
  const handleDownloadFromUrls = useCallback(async () => {
    const urls = visualUrls || [];
    if (urls.length === 0 || downloadingPng) return;
    setDownloadingPng(true);
    try {
      if (urls.length === 1) {
        const response = await fetch(urls[0]);
        const blob = await response.blob();
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "slide-1.png";
        a.click();
        URL.revokeObjectURL(a.href);
      } else {
        try {
          const JSZip = (await import("jszip")).default;
          const zip = new JSZip();
          for (let i = 0; i < urls.length; i++) {
            const response = await fetch(urls[i]);
            const blob = await response.blob();
            zip.file(`slide-${i + 1}.png`, blob);
          }
          const zipBlob = await zip.generateAsync({ type: "blob" });
          const a = document.createElement("a");
          a.href = URL.createObjectURL(zipBlob);
          a.download = sanitize(`visuels-${theme || "carrousel"}.zip`);
          a.click();
          URL.revokeObjectURL(a.href);
        } catch {
          for (let i = 0; i < urls.length; i++) {
            const response = await fetch(urls[i]);
            const blob = await response.blob();
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = `slide-${i + 1}.png`;
            a.click();
            URL.revokeObjectURL(a.href);
            await new Promise(r => setTimeout(r, 200));
          }
        }
      }
    } catch (err) {
      console.error("Download error:", err);
      toast.error("Erreur lors du téléchargement");
    } finally {
      setDownloadingPng(false);
    }
  }, [visualUrls, downloadingPng, theme]);

  // ── Hybride : fond capturé fidèlement + texte natif éditable PPT ──
  const handleDownloadHybridPptx = useCallback(async () => {
    if (!visualHtml || visualHtml.length === 0 || downloadingHybrid) return;
    setDownloadingHybrid(true);
    try {
      const fileName = sanitize(`editable-${theme || "carrousel"}`);
      await exportCarouselHybridPptx(visualHtml, slidesData || null, charterData || null, fileName, undefined, includeLogo ? logoUrl : null);
      toast.success("PowerPoint éditable téléchargé");
    } catch (err) {
      console.error("Hybrid PPTX error:", err);
      toast.error("Erreur lors de l'export");
    } finally {
      setDownloadingHybrid(false);
    }
  }, [visualHtml, slidesData, charterData, downloadingHybrid, theme, includeLogo, logoUrl]);

  // ── Pont Canva : même PPTX hybride que le téléchargement, importé dans Canva ──
  const handleOpenInCanva = useCallback(() => {
    if (!visualHtml || visualHtml.length === 0) return;
    return openInCanva(async () => {
      const fileName = sanitize(`editable-${theme || "carrousel"}`);
      return (await exportCarouselHybridPptx(
        visualHtml,
        slidesData || null,
        charterData || null,
        fileName,
        undefined,
        includeLogo ? logoUrl : null,
        { returnBlob: true },
      )) as Blob;
    }, theme || "Carrousel Nowadays");
  }, [visualHtml, slidesData, charterData, theme, includeLogo, logoUrl, openInCanva]);

  const handleCopyCaption = useCallback(() => {
    if (!caption) return;
    navigator.clipboard.writeText(caption);
    toast.success("Légende copiée !");
  }, [caption]);

  // ── Mini toolbar (toujours rendue si on a du contenu) ──
  const Toolbar = () => {
    const hasVisuals = (visualUrls && visualUrls.length > 0) || (visualHtml && visualHtml.length > 0);
    return (
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5">
          {syncStatus && (
            <span className={`inline-flex items-center gap-1 text-2xs font-medium px-2 py-0.5 rounded-full ${syncStatus === "synced" ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${syncStatus === "synced" ? "bg-success" : "bg-warning"}`} />
              {syncStatus === "synced" ? "Synchronisé" : "Modifs en cours"}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {caption && (
            <Button variant="ghost" size="icon" onClick={handleCopyCaption} className="h-7 w-7" title="Copier la légende" aria-label="Copier la légende">
              <Copy className="h-3.5 w-3.5" />
            </Button>
          )}
          {visualHtml && visualHtml.length > 0 && (
            <Button
              size="sm"
              onClick={handleOpenInCanva}
              disabled={openingCanva}
              className="gap-1.5 h-7 text-xs text-white border-0 hover:opacity-90"
              style={{ backgroundColor: "#FB3D80" }}
              title="Ouvrir ce carrousel dans Canva pour le retoucher"
              aria-label="Ouvrir dans Canva"
            >
              {openingCanva
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <ExternalLink className="h-3.5 w-3.5" />}
              Canva
            </Button>
          )}
          {hasVisuals && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={downloadingPng || downloadingHybrid}
                  className="gap-1.5 h-7 text-xs"
                  title="Télécharger"
                >
                  {(downloadingPng || downloadingHybrid)
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <Download className="h-3.5 w-3.5" />}
                  Télécharger
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DownloadMenuItems
                  onPng={visualUrls && visualUrls.length > 0 ? handleDownloadFromUrls : handleDownloadImages}
                  onPptxEditable={visualHtml && visualHtml.length > 0 ? handleDownloadHybridPptx : undefined}
                  downloadingPng={downloadingPng}
                  downloadingPptx={downloadingHybrid}
                  count={(visualUrls?.length ?? visualHtml?.length ?? 1)}
                  pptxDisabledReason={
                    !visualHtml || visualHtml.length === 0
                      ? "HTML source non conservé pour ce post. Régénère le carrousel pour activer l'export éditable."
                      : undefined
                  }
                  onPptxRegenerate={
                    (!visualHtml || visualHtml.length === 0)
                      ? onNavigateToGenerator
                      : undefined
                  }
                  logoAvailable={!!logoUrl}
                  includeLogo={includeLogo}
                  onIncludeLogoChange={handleIncludeLogoChange}
                />

              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {onFullscreen && (
            <Button variant="ghost" size="icon" onClick={onFullscreen} className="h-7 w-7" title="Plein écran" aria-label="Plein écran">
              <Maximize2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
    );
  };

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
            Remplis le thème et l'angle.
          </p>
        )}
      </div>
    );
  }

  // ── Slides depuis Storage URLs ──
  if (visualUrls && visualUrls.length > 0) {
    const idx = Math.min(slideIndex, visualUrls.length - 1);
    if (compact) {
      return (
        <div className="space-y-2">
          <Toolbar />
          <div className="relative rounded-xl border border-border overflow-hidden bg-card">
            <span className="absolute top-2 right-2 z-10 text-2xs font-semibold bg-black/60 text-white px-2 py-0.5 rounded-full">
              {idx + 1}/{visualUrls.length}
            </span>
            {idx > 0 && (
              <button onClick={() => setSlideIndex(i => i - 1)} aria-label="Précédente" className="absolute left-2 top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full bg-white/90 flex items-center justify-center shadow-sm hover:bg-white">
                <ChevronLeft className="h-4 w-4 text-gray-700" />
              </button>
            )}
            {idx < visualUrls.length - 1 && (
              <button onClick={() => setSlideIndex(i => i + 1)} aria-label="Suivante" className="absolute right-2 top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full bg-white/90 flex items-center justify-center shadow-sm hover:bg-white">
                <ChevronRight className="h-4 w-4 text-gray-700" />
              </button>
            )}
            <img src={visualUrls[idx]} alt={`Slide ${idx + 1}`} className="w-full h-auto" loading="lazy" />
          </div>
          <div className="flex justify-center gap-1 pt-1">
            {visualUrls.map((_, i) => (
              <button key={i} onClick={() => setSlideIndex(i)} className={`rounded-full transition-all ${i === idx ? "w-1.5 h-1.5 bg-primary" : "w-1.5 h-1.5 bg-muted-foreground/30"}`} />
            ))}
          </div>
          {caption && (
            <div className="mt-3 pt-3 border-t border-border">
              <p className="text-2xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Légende</p>
              <div className="text-xs text-foreground whitespace-pre-wrap line-clamp-6 leading-relaxed">{caption}</div>
            </div>
          )}
        </div>
      );
    }
    return (
      <div className="py-2 space-y-4 overflow-y-auto max-h-[60vh]">
        <Toolbar />
        {visualUrls.map((url, i) => (
          <div key={i} className="rounded-xl border border-border overflow-hidden bg-card max-w-[320px] mx-auto">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/50 border-b border-border">
              <span className="text-xs font-medium text-muted-foreground">Slide {i + 1}</span>
            </div>
            <img src={url} alt={`Slide ${i + 1}`} className="w-full h-auto" loading="lazy" />
          </div>
        ))}
      </div>
    );
  }

  // ── visualHtml fallback ──
  if (visualHtml && visualHtml.length > 0) {
    const idx = Math.min(slideIndex, visualHtml.length - 1);
    if (compact) {
      const vs = visualHtml[idx];
      return (
        <div className="space-y-2">
          <Toolbar />
          <div className="relative rounded-xl border border-border overflow-hidden bg-card">
            <span className="absolute top-2 right-2 z-10 text-2xs font-semibold bg-black/60 text-white px-2 py-0.5 rounded-full">
              {idx + 1}/{visualHtml.length}
            </span>
            {idx > 0 && (
              <button onClick={() => setSlideIndex(i => i - 1)} aria-label="Précédente" className="absolute left-2 top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full bg-white/90 flex items-center justify-center shadow-sm hover:bg-white">
                <ChevronLeft className="h-4 w-4 text-gray-700" />
              </button>
            )}
            {idx < visualHtml.length - 1 && (
              <button onClick={() => setSlideIndex(i => i + 1)} aria-label="Suivante" className="absolute right-2 top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full bg-white/90 flex items-center justify-center shadow-sm hover:bg-white">
                <ChevronRight className="h-4 w-4 text-gray-700" />
              </button>
            )}
            <div className="relative overflow-hidden" style={{ width: "100%", aspectRatio: "1080/1350" }}>
              <div style={{ transform: "scale(0.296)", transformOrigin: "top left", width: "1080px", height: "1350px", position: "absolute", top: 0, left: 0 }}>
                <iframe srcDoc={vs.html} title={`Slide ${vs.slide_number}`} width="1080" height="1350" style={{ border: "none", pointerEvents: "none" }} sandbox="allow-same-origin allow-scripts" />
              </div>
            </div>
          </div>
          <div className="flex justify-center gap-1 pt-1">
            {visualHtml.map((_, i) => (
              <button key={i} onClick={() => setSlideIndex(i)} className={`rounded-full transition-all ${i === idx ? "w-1.5 h-1.5 bg-primary" : "w-1.5 h-1.5 bg-muted-foreground/30"}`} />
            ))}
          </div>
          {caption && (
            <div className="mt-3 pt-3 border-t border-border">
              <p className="text-2xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Légende</p>
              <div className="text-xs text-foreground whitespace-pre-wrap line-clamp-6 leading-relaxed">{caption}</div>
            </div>
          )}
        </div>
      );
    }
    return (
      <div className="py-2 space-y-4 overflow-y-auto max-h-[60vh]">
        <Toolbar />
        {visualHtml.map((vs, i) => (
          <div key={i} className="rounded-xl border border-border overflow-hidden bg-card inline-block w-full max-w-[320px] mx-auto block">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/50 border-b border-border">
              <span className="text-xs font-medium text-muted-foreground">Slide {vs.slide_number}</span>
            </div>
            <div className="relative overflow-hidden" style={{ width: "320px", height: "400px" }}>
              <div style={{ transform: "scale(0.296)", transformOrigin: "top left", width: "1080px", height: "1350px", position: "absolute", top: 0, left: 0 }}>
                <iframe srcDoc={vs.html} title={`Slide ${vs.slide_number}`} width="1080" height="1350" style={{ border: "none", pointerEvents: "none" }} sandbox="allow-same-origin allow-scripts" />
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
        <Toolbar />
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
      <div className={compact ? "space-y-2" : "flex justify-center py-2 overflow-y-auto"}>
        <Toolbar />
        <div className={compact ? "" : ""}>
          <SocialMockup
            canal={mockupCanal}
            format="carousel"
            username={username || "mon_compte"}
            displayName={displayName || ""}
            caption={theme}
            slides={slides}
            mediaUrls={effectiveMediaUrls}
            showComments={false}
            readonly
            hideFollowButton
          />
        </div>
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
    <div className={compact ? "space-y-2" : "flex justify-center py-2 overflow-y-auto"}>
      <Toolbar />
      <SocialMockup
        canal={mockupCanal}
        format={mockupFormat}
        username={username || "mon_compte"}
        displayName={displayName || ""}
        caption={caption}
        mediaUrls={effectiveMediaUrls}
        showComments={false}
        readonly
        hideFollowButton
      />
    </div>
  );
}
