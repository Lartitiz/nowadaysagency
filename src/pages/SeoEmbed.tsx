import { useParams, Navigate, Link } from "react-router-dom";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import AppHeader from "@/components/AppHeader";

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

  if (!tool || !VALID_TOOLS.includes(tool)) {
    return <Navigate to="/seo" replace />;
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <div className="mx-auto max-w-7xl px-4 py-3">
        <nav className="flex items-center gap-1 text-sm text-muted-foreground mb-3">
          <Link to="/dashboard" className="hover:text-primary transition-colors">Retour au hub</Link>
          <span className="mx-1">›</span>
          <Link to="/seo" className="hover:text-primary transition-colors">SEO</Link>
          <span className="mx-1">›</span>
          <span className="text-foreground font-medium">{TOOL_LABELS[tool]}</span>
        </nav>
        {iframeSrc ? (
          <iframe
            src={iframeSrc}
            className="w-full border-0 rounded-xl"
            style={{ height: "calc(100vh - 120px)" }}
            allow="clipboard-write"
            title={TOOL_LABELS[tool]}
          />
        ) : (
          <div className="flex items-center justify-center" style={{ height: "calc(100vh - 120px)" }}>
            <p className="text-sm text-muted-foreground">Chargement…</p>
          </div>
        )}
      </div>
    </div>
  );
}