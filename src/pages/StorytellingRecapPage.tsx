import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Copy, Pencil } from "lucide-react";

export default function StorytellingRecapPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    supabase.from("storytelling").select("*").eq("user_id", user.id).maybeSingle().then(({ data: d }) => {
      setData(d);
      setLoading(false);
    });
  }, [user]);

  const copyText = async (text: string) => {
    await navigator.clipboard.writeText(text);
    toast({ title: "Copié !" });
  };

  if (loading) return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <div className="flex justify-center py-20"><p className="text-muted-foreground">Chargement...</p></div>
    </div>
  );

  const story = data?.step_7_polished || data?.step_6_full_story || "";
  const pitches = [
    { label: "Version courte", sublabel: "Bio Instagram", text: data?.pitch_short || "" },
    { label: "Version moyenne", sublabel: "Dossier de presse", text: data?.pitch_medium || "" },
    { label: "Version longue", sublabel: "Page À propos", text: data?.pitch_long || "" },
  ];

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-[700px] px-6 py-8 max-md:px-4">
        <SubPageHeader parentLabel="Branding" parentTo="/branding" currentLabel="Mon storytelling" />

        <h1 className="font-display text-[26px] font-bold text-foreground mb-2">Ton storytelling</h1>

        {/* Story */}
        <div className="rounded-2xl bg-card border border-border p-6 shadow-card mb-8">
          <p className="text-[15px] text-foreground leading-[1.8] whitespace-pre-line">{story || "Aucun storytelling rédigé pour le moment."}</p>
          <div className="flex gap-2 mt-4 pt-4 border-t border-border">
            <Button variant="outline" size="sm" onClick={() => copyText(story)} className="rounded-pill text-xs" disabled={!story}>
              <Copy className="h-3 w-3 mr-1" /> Copier
            </Button>
            <Link to="/branding/storytelling">
              <Button variant="outline" size="sm" className="rounded-pill text-xs">
                <Pencil className="h-3 w-3 mr-1" /> Modifier
              </Button>
            </Link>
          </div>
        </div>

        {/* Pitches */}
        <h2 className="font-display text-xl font-bold text-foreground mb-4">Tes pitchs</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          {pitches.map((pitch, i) => (
            <div key={i} className="rounded-2xl bg-card border border-border p-4">
              <p className="font-mono-ui text-[11px] font-semibold text-muted-foreground mb-1">{pitch.label}</p>
              <p className="text-[10px] text-muted-foreground mb-3">{pitch.sublabel}</p>
              <p className="text-[13px] text-foreground leading-relaxed mb-3 min-h-[60px]">
                {pitch.text || <span className="italic text-muted-foreground">Non généré</span>}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => copyText(pitch.text)}
                disabled={!pitch.text}
                className="rounded-pill text-[11px] w-full"
              >
                <Copy className="h-3 w-3 mr-1" /> Copier
              </Button>
            </div>
          ))}
        </div>

        {/* Encouragement */}
        <div className="rounded-xl bg-rose-pale border border-border p-5 mb-6">
          <p className="text-[14px] text-foreground leading-relaxed">
            ✨ Ton histoire est écrite. C'est elle qui va donner de la profondeur à tout le reste : tes posts, tes emails, ta page de vente. Reviens la relire de temps en temps, elle va évoluer avec toi.
          </p>
        </div>

        <Link to="/branding" className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
          ← Retour au Branding
        </Link>
      </main>
    </div>
  );
}
