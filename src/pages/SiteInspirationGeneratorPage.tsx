import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspaceId } from "@/hooks/use-workspace-query";
import { useAuth } from "@/contexts/AuthContext";
import { friendlyError } from "@/lib/error-messages";
import { Zap, Copy, Smartphone, Monitor, Palette, RefreshCw, ArrowRight, Sparkles } from "lucide-react";

const SECTION_TYPES: Record<string, { emoji: string; title: string }> = {
  hero: { emoji: "🚀", title: "Section Hero" },
  benefits: { emoji: "✨", title: "Section Bénéfices" },
  testimonials: { emoji: "💬", title: "Section Témoignages" },
  how_it_works: { emoji: "🗺️", title: "Comment ça marche" },
  pricing: { emoji: "💰", title: "Section Prix / Offre" },
  faq: { emoji: "❓", title: "Section FAQ" },
  about_mini: { emoji: "👋", title: "À propos condensé" },
  social_proof: { emoji: "🏆", title: "Preuve sociale" },
  footer: { emoji: "📍", title: "Footer" },
};

interface Variant {
  name: string;
  description: string;
  html: string;
}

interface SavedVariant extends Variant {
  id?: string;
  viewMode: "desktop" | "mobile";
  showColors: boolean;
  colors: { primary: string; secondary: string; text: string; bg: string };
  customHtml: string;
}

export default function SiteInspirationGeneratorPage() {
  const { sectionType } = useParams<{ sectionType: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const workspaceId = useWorkspaceId();

  const section = sectionType ? SECTION_TYPES[sectionType] : null;

  const [variants, setVariants] = useState<SavedVariant[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Load saved inspirations on mount
  useEffect(() => {
    if (!user?.id || !sectionType) return;
    (async () => {
      const { data } = await supabase
        .from("website_inspirations")
        .select("*")
        .eq("user_id", user.id)
        .eq("section_type", sectionType)
        .order("variant", { ascending: true });

      if (data && data.length > 0) {
        setVariants(
          data.map((row) => ({
            id: row.id,
            name: `Variante ${row.variant}`,
            description: "",
            html: row.html_code,
            viewMode: "desktop" as const,
            showColors: false,
            colors: (row.custom_colors as any) ?? { primary: "#c2185b", secondary: "#f8bbd0", text: "#212121", bg: "#ffffff" },
            customHtml: row.html_code,
          }))
        );
        setLoaded(true);
      }
    })();
  }, [user?.id, sectionType]);

  const generate = useCallback(async () => {
    if (!sectionType) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("website-ai", {
        body: {
          action: "generate-section-html",
          section_type: sectionType,
          variant_count: 2,
          workspace_id: workspaceId,
        },
      });
      if (error) throw error;

      const content = typeof data === "string" ? data : data?.content ?? data;
      let parsed: { variants: Variant[] };
      try {
        const raw = typeof content === "string" ? content : JSON.stringify(content);
        const cleaned = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
        parsed = typeof content === "object" && content.variants ? content : JSON.parse(cleaned);
      } catch {
        throw new Error("parse_error");
      }

      if (!parsed.variants?.length) throw new Error("Aucune variante générée");

      const newVariants: SavedVariant[] = parsed.variants.map((v, i) => ({
        ...v,
        viewMode: "desktop" as const,
        showColors: false,
        colors: { primary: "#c2185b", secondary: "#f8bbd0", text: "#212121", bg: "#ffffff" },
        customHtml: v.html,
      }));

      setVariants(newVariants);
      setLoaded(true);

      // Save to DB
      if (user?.id) {
        // Delete old ones first
        await supabase
          .from("website_inspirations")
          .delete()
          .eq("user_id", user.id)
          .eq("section_type", sectionType);

        for (let i = 0; i < newVariants.length; i++) {
          const { data: inserted } = await supabase
            .from("website_inspirations")
            .insert({
              user_id: user.id,
              workspace_id: workspaceId || null,
              section_type: sectionType,
              html_code: newVariants[i].html,
              variant: i + 1,
            })
            .select("id")
            .single();
          if (inserted) newVariants[i].id = inserted.id;
        }
        setVariants([...newVariants]);
      }

      toast({ title: "Templates générés ! 🎨", description: "Tes 2 variantes sont prêtes." });
    } catch (err) {
      toast({ title: "Erreur", description: friendlyError(err), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [sectionType, workspaceId, user?.id]);

  const copyHtml = (html: string) => {
    navigator.clipboard.writeText(html);
    toast({ title: "📋 HTML copié !", description: "Colle-le dans ton éditeur de site." });
  };

  const updateColor = (index: number, key: keyof SavedVariant["colors"], value: string) => {
    setVariants((prev) => {
      const updated = [...prev];
      const v = { ...updated[index] };
      v.colors = { ...v.colors, [key]: value };

      // Apply color replacement to the original html
      let html = v.html;
      // Simple search-replace for common color patterns
      const colorMap: Record<string, string> = {
        primary: v.colors.primary,
        secondary: v.colors.secondary,
      };
      // Replace inline style colors
      html = html.replace(/background-color:\s*#[0-9a-fA-F]{3,8}/g, `background-color: ${v.colors.primary}`);
      html = html.replace(/color:\s*#[0-9a-fA-F]{3,8}/g, `color: ${v.colors.text}`);

      // More targeted: use CSS variables approach
      const styleTag = `<style>:root{--primary:${v.colors.primary};--secondary:${v.colors.secondary};--text-color:${v.colors.text};--bg-color:${v.colors.bg};}body{background-color:var(--bg-color)!important;color:var(--text-color)!important;}</style>`;
      if (v.customHtml.includes("--primary")) {
        v.customHtml = v.html.replace("</head>", styleTag + "</head>");
      } else {
        // Inject a style override at the top of body
        v.customHtml = v.html.replace(
          "<body",
          `<head>${styleTag}</head><body style="background-color:${v.colors.bg};color:${v.colors.text}"`
        );
      }

      updated[index] = v;
      return updated;
    });
  };

  const toggleView = (index: number, mode: "desktop" | "mobile") => {
    setVariants((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], viewMode: mode };
      return updated;
    });
  };

  const toggleColors = (index: number) => {
    setVariants((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], showColors: !updated[index].showColors };
      return updated;
    });
  };

  if (!section || !sectionType) {
    navigate("/site/inspirations");
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="container max-w-5xl mx-auto px-4 py-8 space-y-8">
        <SubPageHeader
          parentLabel="Inspirations visuelles"
          parentTo="/site/inspirations"
          currentLabel={section.title}
        />

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-display font-bold text-foreground">
              {section.emoji} {section.title}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Templates HTML prêts à copier-coller, personnalisés avec ton branding.
            </p>
          </div>
          <div className="flex gap-2">
            {loaded && (
              <Button variant="outline" size="sm" onClick={generate} disabled={loading}>
                <RefreshCw className="h-4 w-4 mr-1" />
                Regénérer
              </Button>
            )}
            <Button size="sm" onClick={generate} disabled={loading}>
              <Zap className="h-4 w-4 mr-1" />
              {loaded ? "Nouvelles variantes" : "Générer mes templates"}
            </Button>
          </div>
        </div>

        {/* Loading state */}
        {loading && (
          <div className="space-y-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Sparkles className="h-4 w-4 animate-pulse text-primary" />
              L'IA prépare tes templates...
            </div>
            {[1, 2].map((i) => (
              <div key={i} className="rounded-2xl border border-border bg-card p-5 space-y-4">
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-3 w-72" />
                <Skeleton className="h-[300px] w-full rounded-xl" />
                <div className="flex gap-2">
                  <Skeleton className="h-9 w-32" />
                  <Skeleton className="h-9 w-28" />
                  <Skeleton className="h-9 w-28" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Variants */}
        {!loading && loaded && variants.map((variant, index) => (
          <div key={index} className="rounded-2xl border border-border bg-card p-5 sm:p-6 space-y-4">
            <div>
              <h3 className="font-display font-bold text-foreground">{variant.name}</h3>
              {variant.description && (
                <p className="text-sm text-muted-foreground">{variant.description}</p>
              )}
            </div>

            {/* Iframe preview */}
            <div
              className="mx-auto transition-all duration-300 rounded-xl border border-border overflow-hidden bg-white"
              style={{ maxWidth: variant.viewMode === "mobile" ? 375 : "100%" }}
            >
              <iframe
                srcDoc={variant.customHtml || variant.html}
                title={variant.name}
                className="w-full border-0"
                style={{ height: 500 }}
                sandbox="allow-scripts"
              />
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => copyHtml(variant.customHtml || variant.html)}>
                <Copy className="h-4 w-4 mr-1" />
                Copier le HTML
              </Button>
              <Button
                variant={variant.viewMode === "mobile" ? "ghost" : "outline"}
                size="sm"
                onClick={() => toggleView(index, "mobile")}
              >
                <Smartphone className="h-4 w-4 mr-1" />
                Mobile
              </Button>
              <Button
                variant={variant.viewMode === "desktop" ? "ghost" : "outline"}
                size="sm"
                onClick={() => toggleView(index, "desktop")}
              >
                <Monitor className="h-4 w-4 mr-1" />
                Desktop
              </Button>
              <Button variant="outline" size="sm" onClick={() => toggleColors(index)}>
                <Palette className="h-4 w-4 mr-1" />
                Personnaliser les couleurs
              </Button>
            </div>

            {/* Color panel */}
            {variant.showColors && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-xl bg-muted/50 border border-border">
                {([
                  ["primary", "Couleur primaire"],
                  ["secondary", "Couleur secondaire"],
                  ["text", "Couleur du texte"],
                  ["bg", "Couleur de fond"],
                ] as const).map(([key, label]) => (
                  <div key={key} className="space-y-1.5">
                    <Label className="text-xs">{label}</Label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={variant.colors[key]}
                        onChange={(e) => updateColor(index, key, e.target.value)}
                        className="w-8 h-8 rounded cursor-pointer border-0"
                      />
                      <Input
                        value={variant.colors[key]}
                        onChange={(e) => updateColor(index, key, e.target.value)}
                        className="h-8 text-xs font-mono"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        {/* Empty state */}
        {!loading && !loaded && (
          <div className="text-center py-16 space-y-4">
            <p className="text-4xl">{section.emoji}</p>
            <p className="text-muted-foreground">
              Clique sur "Générer mes templates" pour créer tes variantes personnalisées.
            </p>
          </div>
        )}

        {/* Go further */}
        {loaded && !loading && (
          <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
            <h3 className="font-display font-bold text-foreground">💡 Tu veux aller plus loin ?</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Link
                to="/site/accueil"
                className="flex items-center justify-between rounded-xl border border-border p-4 hover:border-primary/40 hover:bg-muted/30 transition-all group"
              >
                <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                  Rédiger ma page complète
                </span>
                <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
              </Link>
              <Link
                to="/site/a-propos"
                className="flex items-center justify-between rounded-xl border border-border p-4 hover:border-primary/40 hover:bg-muted/30 transition-all group"
              >
                <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                  Créer ma page À propos
                </span>
                <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
              </Link>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
