import { useState, useEffect } from "react";
import EmptyState from "@/components/EmptyState";
import { MESSAGES } from "@/lib/messages";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Link, useNavigate } from "react-router-dom";
import { useWorkspaceFilter } from "@/hooks/use-workspace-query";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Star, Eye, Pencil, Trash2, Plus, Download } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useDemoContext } from "@/contexts/DemoContext";

interface StorytellingRow {
  id: string;
  title: string | null;
  story_type: string | null;
  source: string | null;
  is_primary: boolean | null;
  step_7_polished: string | null;
  imported_text: string | null;
  pitch_short: string | null;
  created_at: string;
  completed: boolean | null;
}

const TYPE_BADGES: Record<string, { label: string; className: string }> = {
  fondatrice: { label: "👩 Fondatrice", className: "bg-rose-pale text-foreground" },
  marque: { label: "🏷️ Marque", className: "bg-[#F3E8FF] text-foreground" },
  produit: { label: "💚 Produit/Offre", className: "bg-[#E8F5E9] text-foreground" },
  autre: { label: "📝 Autre", className: "bg-secondary text-foreground" },
};

const SOURCE_BADGES: Record<string, { label: string; className: string }> = {
  stepper: { label: "✨ Créé avec le stepper", className: "bg-rose-pale text-muted-foreground" },
  import: { label: "📥 Importé", className: "bg-secondary text-muted-foreground" },
};

function getPreview(row: StorytellingRow): string {
  const text = row.step_7_polished || row.imported_text || "";
  if (!text) return "Pas encore de texte";
  return text.length > 120 ? text.slice(0, 120) + "…" : text;
}

export default function StorytellingListPage() {
  const { user } = useAuth();
  const { column, value } = useWorkspaceFilter();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { isDemoMode, demoData } = useDemoContext();
  const [items, setItems] = useState<StorytellingRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchItems = async () => {
    if (isDemoMode) {
      setItems([{
        id: "demo-story",
        title: "Mon histoire de photographe",
        story_type: "fondatrice",
        source: "stepper",
        is_primary: true,
        step_7_polished: demoData?.story_summary || "",
        imported_text: null,
        pitch_short: "Je capture la confiance.",
        created_at: "2026-02-10T10:00:00Z",
        completed: true,
      }]);
      setLoading(false);
      return;
    }
    if (!user) return;
    const { data } = await (supabase
      .from("storytelling") as any)
      .select("id, title, story_type, source, is_primary, step_7_polished, imported_text, pitch_short, created_at, completed")
      .eq(column, value)
      .order("created_at", { ascending: false });
    setItems((data as StorytellingRow[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchItems(); }, [user?.id, isDemoMode, column, value]);

  const setPrimary = async (id: string) => {
    await supabase.from("storytelling").update({ is_primary: true } as any).eq("id", id);
    toast({ title: "Ce storytelling est maintenant le principal ✨" });
    fetchItems();
  };

  const deleteItem = async (id: string) => {
    await supabase.from("storytelling").delete().eq("id", id);
    toast({ title: "Storytelling supprimé" });
    fetchItems();
  };

  if (loading) return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <div className="flex justify-center py-20">
        <div className="flex gap-1">
          <div className="h-3 w-3 rounded-full bg-primary animate-bounce-dot" />
          <div className="h-3 w-3 rounded-full bg-primary animate-bounce-dot" style={{ animationDelay: "0.16s" }} />
          <div className="h-3 w-3 rounded-full bg-primary animate-bounce-dot" style={{ animationDelay: "0.32s" }} />
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-[700px] px-6 py-8 max-md:px-4">
        <SubPageHeader parentLabel="Branding" parentTo="/branding" currentLabel="Mes storytellings" />

        <h1 className="font-display text-[26px] font-bold text-foreground mb-1">Mes storytellings</h1>
        <p className="text-[15px] text-muted-foreground mb-6">
          Ton histoire de fondatrice, l'histoire de ta marque, l'histoire d'un produit... Tu peux en avoir plusieurs.
        </p>

        {/* Action buttons */}
        <div className="flex flex-wrap gap-3 mb-8">
          <Button onClick={() => navigate("/branding/storytelling/new")} className="rounded-pill">
            <Plus className="h-4 w-4 mr-1" /> Créer un nouveau storytelling guidé
          </Button>
          <Button variant="outline" onClick={() => navigate("/branding/storytelling/import")} className="rounded-pill">
            <Download className="h-4 w-4 mr-1" /> Importer un storytelling existant
          </Button>
        </div>

        {/* List */}
        {items.length === 0 ? (
          <EmptyState {...MESSAGES.empty.storytelling} onAction={() => navigate("/branding/storytelling/new")} />
        ) : (
          <div className="space-y-4">
            {items.map((item) => {
              const typeBadge = TYPE_BADGES[item.story_type || "fondatrice"] || TYPE_BADGES.autre;
              const sourceBadge = SOURCE_BADGES[item.source || "stepper"] || SOURCE_BADGES.stepper;
              return (
                <div key={item.id} className="rounded-2xl border border-border bg-card p-5 shadow-card">
                  <div className="flex flex-wrap gap-2 mb-3">
                    <span className={`font-mono-ui text-[11px] font-medium px-2 py-0.5 rounded-md ${typeBadge.className}`}>
                      {typeBadge.label}
                    </span>
                    <span className={`font-mono-ui text-[11px] font-medium px-2 py-0.5 rounded-md ${sourceBadge.className}`}>
                      {sourceBadge.label}
                    </span>
                    {item.is_primary && (
                      <span className="font-mono-ui text-[11px] font-semibold px-2 py-0.5 rounded-md bg-yellow text-foreground">
                        ⭐ Principal
                      </span>
                    )}
                  </div>

                  <h3 className="font-display text-lg font-bold text-foreground mb-1">
                    {item.title || "Sans titre"}
                  </h3>
                  <p className="text-[13px] text-muted-foreground leading-relaxed mb-3">
                    {getPreview(item)}
                  </p>
                  <p className="font-mono-ui text-[11px] text-muted-foreground mb-4">
                    Créé le {new Date(item.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}
                  </p>

                  <div className="flex flex-wrap gap-2">
                    {!item.is_primary && (
                      <Button variant="outline" size="sm" onClick={() => setPrimary(item.id)} className="rounded-pill text-xs">
                        <Star className="h-3 w-3 mr-1" /> Définir comme principal
                      </Button>
                    )}
                    <Link to={`/branding/storytelling/${item.id}/recap`}>
                      <Button variant="outline" size="sm" className="rounded-pill text-xs">
                        <Eye className="h-3 w-3 mr-1" /> Voir
                      </Button>
                    </Link>
                    <Link to={item.source === "import" ? `/branding/storytelling/${item.id}/edit` : `/branding/storytelling/${item.id}`}>
                      <Button variant="outline" size="sm" className="rounded-pill text-xs">
                        <Pencil className="h-3 w-3 mr-1" /> Modifier
                      </Button>
                    </Link>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" size="sm" className="rounded-pill text-xs text-destructive hover:text-destructive">
                          <Trash2 className="h-3 w-3 mr-1" /> Supprimer
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Supprimer ce storytelling ?</AlertDialogTitle>
                          <AlertDialogDescription>Cette action est irréversible.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Annuler</AlertDialogCancel>
                          <AlertDialogAction onClick={() => deleteItem(item.id)}>Supprimer</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
