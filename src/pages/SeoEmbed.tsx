import { useParams, Navigate, Link } from "react-router-dom";
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
        <iframe
          src={`https://referencement-seo.lovable.app/${tool}`}
          className="w-full border-0 rounded-xl"
          style={{ height: "calc(100vh - 120px)" }}
          allow="clipboard-write"
          title={TOOL_LABELS[tool]}
        />
      </div>
    </div>
  );
}
