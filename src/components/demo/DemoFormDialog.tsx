import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useDemoContext } from "@/contexts/DemoContext";
import { Loader2, Film, Trash2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import type { DemoData } from "@/contexts/DemoContext";

interface DemoProfile {
  id: string;
  demo_name: string;
  demo_activity: string;
  demo_instagram: string | null;
  demo_website: string | null;
  demo_problem: string | null;
  generated_data: DemoData | null;
  created_at: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function DemoFormDialog({ open, onOpenChange }: Props) {
  const { user } = useAuth();
  const { activateDemo } = useDemoContext();
  const [name, setName] = useState("");
  const [activity, setActivity] = useState("");
  const [instagram, setInstagram] = useState("");
  const [website, setWebsite] = useState("");
  const [problem, setProblem] = useState("");
  const [generating, setGenerating] = useState(false);
  const [demos, setDemos] = useState<DemoProfile[]>([]);
  const [loadingDemos, setLoadingDemos] = useState(false);

  useEffect(() => {
    if (open) loadDemos();
  }, [open]);

  const loadDemos = async () => {
    if (!user) return;
    setLoadingDemos(true);
    const { data } = await supabase
      .from("demo_profiles")
      .select("*")
      .eq("admin_user_id", user.id)
      .order("created_at", { ascending: false });
    setDemos((data as unknown as DemoProfile[]) || []);
    setLoadingDemos(false);
  };

  const handleGenerate = async () => {
    if (!name.trim() || !activity.trim()) {
      toast.error("Le prénom et l'activité sont obligatoires.");
      return;
    }
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-demo", {
        body: {
          prenom: name.trim(),
          activite: activity.trim(),
          instagram: instagram.trim() || undefined,
          site_web: website.trim() || undefined,
          probleme: problem.trim() || undefined,
        },
      });

      if (error) throw error;
      if (!data?.generated_data) throw new Error("Pas de données générées");

      // Save to DB
      const { error: saveErr } = await supabase.from("demo_profiles").insert({
        admin_user_id: user!.id,
        demo_name: name.trim(),
        demo_activity: activity.trim(),
        demo_instagram: instagram.trim() || null,
        demo_website: website.trim() || null,
        demo_problem: problem.trim() || null,
        generated_data: data.generated_data,
      } as any);

      if (saveErr) throw saveErr;

      toast.success(`Démo pour ${name} créée !`);
      activateDemo(data.generated_data as DemoData, name.trim(), activity.trim());
      onOpenChange(false);
      resetForm();
    } catch (err: any) {
      console.error("Demo generation error:", err);
      toast.error(err.message || "Erreur lors de la génération");
    } finally {
      setGenerating(false);
    }
  };

  const handleOpen = (demo: DemoProfile) => {
    if (!demo.generated_data) return;
    activateDemo(demo.generated_data, demo.demo_name, demo.demo_activity);
    onOpenChange(false);
  };

  const handleDelete = async (id: string) => {
    await supabase.from("demo_profiles").delete().eq("id", id);
    setDemos((prev) => prev.filter((d) => d.id !== id));
    toast.success("Démo supprimée");
  };

  const resetForm = () => {
    setName("");
    setActivity("");
    setInstagram("");
    setWebsite("");
    setProblem("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Film className="h-5 w-5 text-primary" />
            Créer une démo personnalisée
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          3 infos suffisent. L'IA fait le reste.
        </p>

        <div className="space-y-4 mt-2">
          <div>
            <Label htmlFor="demo-name">Prénom *</Label>
            <Input
              id="demo-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Camille"
              disabled={generating}
            />
          </div>

          <div>
            <Label htmlFor="demo-activity">Son activité *</Label>
            <Input
              id="demo-activity"
              value={activity}
              onChange={(e) => setActivity(e.target.value)}
              placeholder="Ex : Photographe portrait, Coach sportive, Graphiste freelance..."
              disabled={generating}
            />
          </div>

          <div>
            <Label htmlFor="demo-ig">Son Instagram (optionnel)</Label>
            <Input
              id="demo-ig"
              value={instagram}
              onChange={(e) => setInstagram(e.target.value)}
              placeholder="@camille_bijoux"
              disabled={generating}
            />
          </div>

          <div>
            <Label htmlFor="demo-site">Son site web (optionnel)</Label>
            <Input
              id="demo-site"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://camille-bijoux.com"
              disabled={generating}
            />
          </div>

          <div>
            <Label htmlFor="demo-problem">Un mot sur son problème (optionnel)</Label>
            <Textarea
              id="demo-problem"
              value={problem}
              onChange={(e) => setProblem(e.target.value)}
              placeholder="Elle poste au feeling, pas de stratégie"
              className="min-h-[80px]"
              disabled={generating}
            />
          </div>

          <Button
            onClick={handleGenerate}
            disabled={generating || !name.trim() || !activity.trim()}
            className="w-full"
          >
            {generating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ✨ On prépare l'univers de {name || "..."}
              </>
            ) : (
              "✨ Générer la démo · ~30 secondes"
            )}
          </Button>
        </div>

        {/* Previous demos */}
        {demos.length > 0 && (
          <div className="mt-6 border-t border-border pt-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase mb-3">
              Démos précédentes
            </p>
            <div className="space-y-2">
              {demos.map((demo) => (
                <div
                  key={demo.id}
                  className="flex items-center justify-between rounded-lg border border-border px-3 py-2"
                >
                  <div className="flex items-center gap-2 text-sm">
                    <Film className="h-4 w-4 text-primary" />
                    <span className="font-medium">{demo.demo_name}</span>
                    <span className="text-muted-foreground">· {demo.demo_activity}</span>
                    <span className="text-muted-foreground text-xs">
                      · {new Date(demo.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleOpen(demo)}
                      className="h-7 text-xs"
                    >
                      <ExternalLink className="h-3.5 w-3.5 mr-1" />
                      Ouvrir
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(demo.id)}
                      className="h-7 text-xs text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
