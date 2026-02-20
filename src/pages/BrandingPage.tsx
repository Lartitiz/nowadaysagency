import AppHeader from "@/components/AppHeader";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

export default function BrandingPage() {
  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-[800px] px-6 py-8 max-md:px-4">
        <Link to="/dashboard" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground mb-6 transition-colors">
          <ArrowLeft className="h-4 w-4" />
          Retour au hub
        </Link>
        <h1 className="font-display text-[26px] font-bold text-foreground mb-2">Mon Branding</h1>
        <p className="text-[15px] text-muted-foreground mb-8">
          Plus tu remplis cette section, plus L'Assistant Com' te connaît et plus il te propose des idées qui te ressemblent. C'est la base de tout.
        </p>
        <div className="rounded-2xl border border-border bg-card p-8 text-center">
          <p className="text-muted-foreground text-sm">Le module Branding complet arrive dans la prochaine session.</p>
        </div>
      </main>
    </div>
  );
}
