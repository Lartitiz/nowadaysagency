import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useParams, useNavigate, Link } from "react-router-dom";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { invokeWithTimeout } from "@/lib/invoke-with-timeout";
import { useWorkspaceId, useWorkspaceFilter } from "@/hooks/use-workspace-query";
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

const DEFAULT_COLORS = { primary: "#c2185b", secondary: "#f8bbd0", text: "#212121", bg: "#ffffff" };

// Build the color-overridden HTML idempotently from the IMMUTABLE original `html`.
// Always derive from `html` (never from a previous customHtml) so repeated edits don't stack
// <style>/<head> blocks or corrupt the markup.
function buildCustomHtml(html: string, colors: SavedVariant["colors"]): string {
  const styleTag = `<style>:root{--primary:${colors.primary};--secondary:${colors.secondary};--text-color:${colors.text};--bg-color:${colors.bg};}body{background-color:var(--bg-color)!important;color:var(--text-color)!important;}</style>`;
  if (html.includes("</head>")) return html.replace("</head>", styleTag + "</head>");
  if (html.includes("<body")) return html.replace("<body", `<head>${styleTag}</head><body`);
  return styleTag + html; // fragment without head/body
}

export default function SiteInspirationGeneratorPage() {
  const { sectionType } = useParams<{ sectionType: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const workspaceId = useWorkspaceId();
  const { column, value } = useWorkspaceFilter();

  const section = sectionType ? SECTION_TYPES[sectionType] : null;

  const [variants, setVariants] = useState<SavedVariant[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const colorSaveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Load saved inspirations when the section changes.
  // The route element is reused across /site/inspirations/:sectionType, so we MUST reset
  // variants/loaded on each section change — otherwise a section with no saved inspiration
  // keeps showing the previous section's variants.
  useEffect(() => {
    if (!user?.id || !sectionType) return;
    let cancelled = false;
    setVariants([]);
    setLoaded(false);
    (async () => {
      try {
        const { data, error } = await (supabase
          .from("website_inspirations") as any)
          .select("*")
          .eq(column, value)
          .eq("section_type", sectionType)
          .order("variant", { ascending: true });
        if (cancelled) return;
        if (error) throw error;

        if (data && data.length > 0) {
          setVariants(
            data.map((row) => {
              const colors = (row.custom_colors as any) ?? DEFAULT_COLORS;
              return {
                id: row.id,
                name: `Variante ${row.variant}`,
                description: "",
                html: row.html_code,
                viewMode: "desktop" as const,
                showColors: false,
                colors,
                customHtml: row.custom_colors ? buildCustomHtml(row.html_code, colors) : row.html_code,
              };
            })
          );
          setLoaded(true);
        } else {
          setVariants([]);
          setLoaded(false);
        }
      } catch {
        if (!cancelled) {
          setVariants([]);
          setLoaded(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id, sectionType, column, value]);

  const generate = useCallback(async () => {
    if (!sectionType) return;
    setLoading(true);
    try {
      const { data, error } = await invokeWithTimeout("website-ai", {
        body: {
          action: "generate-section-html",
          section_type: sectionType,
          variant_count: 2,
          workspace_id: workspaceId,
        },
      }, 90000);
      if (error) throw new Error(error.message);

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

      const newVariants: SavedVariant[] = parsed.variants.map((v) => ({
        ...v,
        viewMode: "desktop" as const,
        showColors: false,
        colors: { ...DEFAULT_COLORS },
        customHtml: v.html,
      }));

      setLoaded(true);

      // Save to DB
      if (user?.id) {
        // Delete old ones first
        await (supabase
          .from("website_inspirations") as any)
          .delete()
          .eq(column, value)
          .eq("section_type", sectionType);

        // Single batched insert (avoids partial state if the user reloads mid-loop).
        // workspace_id must match the read filter: a real workspace id, else null.
        const rows = newVariants.map((nv, i) => ({
          user_id: user.id,
          workspace_id: column === "workspace_id" ? value : null,
          section_type: sectionType,
          html_code: nv.html,
          variant: i + 1,
        }));
        const { data: insertedRows } = await (supabase
          .from("website_inspirations") as any)
          .insert(rows)
          .select("id, variant");
        if (insertedRows) {
          for (const r of insertedRows) {
            const idx = (r.variant as number) - 1;
            if (newVariants[idx]) newVariants[idx].id = r.id;
          }
        }
      }
      setVariants([...newVariants]);

      toast.success("Templates générés ! 🎨", { description: "Tes 2 variantes sont prêtes." });
    } catch (err) {
      toast.error("Erreur", { description: friendlyError(err) });
    } finally {
      setLoading(false);
    }
  }, [sectionType, workspaceId, user?.id]);

  const copyHtml = async (html: string) => {
    try {
      await navigator.clipboard.writeText(html);
      toast.success("📋 HTML copié !", { description: "Colle-le dans ton éditeur de site." });
    } catch {
      toast.error("Impossible de copier", { description: "Sélectionne et copie le texte manuellement." });
    }
  };

  // Debounced persistence of the custom palette so it survives a reload.
  const persistColors = (v: SavedVariant) => {
    if (!v.id) return;
    const id = v.id;
    clearTimeout(colorSaveTimers.current[id]);
    colorSaveTimers.current[id] = setTimeout(() => {
      (supabase.from("website_inspirations") as any)
        .update({ custom_colors: v.colors })
        .eq("id", id);
    }, 600);
  };

  const updateColor = (index: number, key: keyof SavedVariant["colors"], value: string) => {
    let toPersist: SavedVariant | null = null;
    setVariants((prev) => {
      const updated = [...prev];
      const v = { ...updated[index] };
      v.colors = { ...v.colors, [key]: value };
      // Rebuild from the immutable original each time → idempotent, never corrupts markup.
      v.customHtml = buildCustomHtml(v.html, v.colors);
      updated[index] = v;
      toPersist = v;
      return updated;
    });
    if (toPersist) persistColors(toPersist);
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

  // Redirect side-effect must not run during render.
  useEffect(() => {
    if (sectionType && !section) navigate("/site/inspirations", { replace: true });
  }, [sectionType, section, navigate]);

  if (!section || !sectionType) return null;

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
                sandbox=""
              />
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => copyHtml(variant.customHtml || variant.html)}>
                <Copy className="h-4 w-4 mr-1" />
                Copier le HTML
              </Button>
              <Button
                variant={variant.viewMode === "mobile" ? "default" : "outline"}
                size="sm"
                aria-pressed={variant.viewMode === "mobile"}
                onClick={() => toggleView(index, "mobile")}
              >
                <Smartphone className="h-4 w-4 mr-1" />
                Mobile
              </Button>
              <Button
                variant={variant.viewMode === "desktop" ? "default" : "outline"}
                size="sm"
                aria-pressed={variant.viewMode === "desktop"}
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
