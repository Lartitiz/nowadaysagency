import { useParams, Navigate, Link } from "react-router-dom";
import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import AppHeader from "@/components/AppHeader";
import { ExternalLink, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

const TOOL_LABELS: Record<string, string> = {
  audit: "Audit",
  idees: "Mots-clés",
  cockpit: "Cockpit",
  analyser: "Analyser",
  optimiser: "Optimiser",
  structure: "Structure",
  presse: "Presse",
  plan: "Mon plan",
  dashboard: "Dashboard",
};

const VALID_TOOLS = Object.keys(TOOL_LABELS);

export default function SeoEmbed() {
  const { tool } = useParams<{ tool: string }>();
  const [iframeSrc, setIframeSrc] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const buildSrc = async () => {
      const base = `https://referencement-seo.lovable.app/${tool}`;
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        setIframeSrc(`${base}?token=${session.access_token}`);
      } else {
        setIframeSrc(base);
      }
    };
    if (tool && VALID_TOOLS.includes(tool)) buildSrc();
  }, [tool]);

  // Timeout fallback: if iframe doesn't signal success within 8s, show error
  useEffect(() => {
    if (!iframeSrc) return;
    setLoadError(false);
    timerRef.current = setTimeout(() => setLoadError(true), 8000);

    const handleMessage = (e: MessageEvent) => {
      if (e.origin === "https://referencement-seo.lovable.app" && e.data === "seo-ready") {
        setLoadError(false);
        if (timerRef.current) clearTimeout(timerRef.current);
      }
    };
    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [iframeSrc]);

  if (!tool || !VALID_TOOLS.includes(tool)) {
    return <Navigate to="/seo" replace />;
  }

  const externalUrl = iframeSrc || `https://referencement-seo.lovable.app/${tool}`;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <div className="mx-auto max-w-7xl px-4 py-3">
        <div className="flex items-center justify-between mb-3">
          <nav className="flex items-center gap-1 text-sm text-muted-foreground">
            <Link to="/dashboard" className="hover:text-primary transition-colors">Retour au hub</Link>
            <span className="mx-1">›</span>
            <Link to="/seo" className="hover:text-primary transition-colors">SEO</Link>
            <span className="mx-1">›</span>
            <span className="text-foreground font-medium">{TOOL_LABELS[tool]}</span>
          </nav>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-xs text-muted-foreground"
            asChild
          >
            <a href={externalUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-3.5 w-3.5" />
              Ouvrir dans un nouvel onglet
            </a>
          </Button>
        </div>

        {loadError && (
          <div className="rounded-xl border border-amber-300/50 bg-amber-50/50 dark:bg-amber-900/10 px-4 py-3 mb-3 animate-fade-in">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-foreground">
                  L'outil SEO a besoin d'une mise à jour
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  En attendant, tu peux y accéder directement ici :{" "}
                  <a
                    href={externalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline hover:text-primary/80"
                  >
                    {TOOL_LABELS[tool]} SEO →
                  </a>
                </p>
              </div>
            </div>
          </div>
        )}

        {iframeSrc ? (
          <iframe
            src={iframeSrc}
            className="w-full border-0 rounded-xl"
            style={{ height: "calc(100vh - 140px)" }}
            allow="clipboard-write"
            title={TOOL_LABELS[tool]}
          />
        ) : (
          <div className="flex items-center justify-center" style={{ height: "calc(100vh - 140px)" }}>
            <p className="text-sm text-muted-foreground">Chargement…</p>
          </div>
        )}
      </div>
    </div>
  );
}