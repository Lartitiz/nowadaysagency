import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import { SocialMockup } from "@/components/social-mockup/SocialMockup";
import { ContentPreview } from "@/components/ContentPreview";

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
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">✨ Visuels générés ({visualHtml.length} slides)</p>
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
