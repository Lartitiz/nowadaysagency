import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useParams, useNavigate } from "react-router-dom";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

export default function StorytellingEditPage() {
  const { user } = useAuth();
  const { id } = useParams();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user || !id) return;
    supabase.from("storytelling").select("title, imported_text, step_7_polished").eq("id", id).eq("user_id", user.id).single().then(({ data }) => {
      if (data) {
        setTitle((data as any).title || "");
        setText((data as any).imported_text || (data as any).step_7_polished || "");
      }
      setLoading(false);
    });
  }, [user, id]);

  const handleSave = async () => {
    if (!id) return;
    setSaving(true);
    await supabase.from("storytelling").update({ title, imported_text: text } as any).eq("id", id);
    toast({ title: "Modifications enregistrées !" });
    setSaving(false);
    navigate("/branding/storytelling");
  };

  if (loading) return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <div className="flex justify-center py-20"><p className="text-muted-foreground">Chargement...</p></div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-[640px] px-6 py-8 max-md:px-4">
        <SubPageHeader parentLabel="Mes storytellings" parentTo="/branding/storytelling" currentLabel="Modifier" />

        <h1 className="font-display text-[26px] font-bold text-foreground mb-6">Modifier le storytelling</h1>

        <div className="space-y-4">
          <div>
            <p className="text-sm font-semibold text-foreground mb-2">Titre</p>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground mb-2">Texte</p>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="w-full min-h-[400px] rounded-xl border-2 border-input bg-card px-4 py-3 text-[15px] leading-relaxed focus:outline-none focus:border-primary transition-colors resize-none"
            />
          </div>
          <Button onClick={handleSave} disabled={saving} className="rounded-pill w-full">
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Enregistrer les modifications
          </Button>
        </div>
      </main>
    </div>
  );
}
