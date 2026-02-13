import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import AppHeader from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

const PILIERS = [
  "Coulisses / fabrication", "Éducation / pédagogie", "Valeurs / engagements",
  "Témoignages clients", "Vie d'entrepreneuse", "Inspiration / tendances",
  "Conseils pratiques", "Storytelling personnel",
];

const TONS = ["Chaleureux", "Expert·e", "Drôle", "Engagé·e", "Poétique", "Direct", "Inspirant·e"];

const ACTIVITY_TYPES = [
  { id: "creatrice", label: "Créatrice / Artisane" },
  { id: "prestataire", label: "Prestataire de services" },
  { id: "accompagnante", label: "Accompagnante / Coach" },
  { id: "autre", label: "Autre" },
];

export default function Profile() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [prenom, setPrenom] = useState("");
  const [activite, setActivite] = useState("");
  const [typeActivite, setTypeActivite] = useState("");
  const [cible, setCible] = useState("");
  const [probleme, setProbleme] = useState("");
  const [piliers, setPiliers] = useState<string[]>([]);
  const [tons, setTons] = useState<string[]>([]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("*")
      .eq("user_id", user.id)
      .single()
      .then(({ data }) => {
        if (data) {
          setPrenom(data.prenom);
          setActivite(data.activite);
          setTypeActivite(data.type_activite);
          setCible(data.cible);
          setProbleme(data.probleme_principal);
          setPiliers(data.piliers || []);
          setTons(data.tons || []);
        }
        setLoading(false);
      });
  }, [user]);

  const togglePilier = (p: string) =>
    setPiliers((prev) => prev.includes(p) ? prev.filter((x) => x !== p) : prev.length < 4 ? [...prev, p] : prev);
  const toggleTon = (t: string) =>
    setTons((prev) => prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ prenom, activite, type_activite: typeActivite, cible, probleme_principal: probleme, piliers, tons })
      .eq("user_id", user.id);
    setSaving(false);
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Profil mis à jour !" });
    }
  };

  if (loading) return <div className="min-h-screen bg-background"><AppHeader /><div className="flex justify-center py-20"><p className="text-muted-foreground">Chargement...</p></div></div>;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="font-display text-3xl font-bold mb-8">Mon profil</h1>
        <div className="rounded-2xl bg-card p-6 border border-border space-y-5">
          <div>
            <label className="text-sm font-medium mb-1.5 block">Prénom</label>
            <Input value={prenom} onChange={(e) => setPrenom(e.target.value)} className="rounded-[10px] h-12" />
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block">Activité</label>
            <Input value={activite} onChange={(e) => setActivite(e.target.value)} className="rounded-[10px] h-12" />
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block">Type d'activité</label>
            <div className="grid grid-cols-2 gap-3">
              {ACTIVITY_TYPES.map((t) => (
                <button key={t.id} onClick={() => setTypeActivite(t.id)}
                  className={`rounded-lg border-2 p-3 text-left text-sm font-medium transition-all ${typeActivite === t.id ? "border-primary bg-secondary" : "border-border hover:border-primary/40"}`}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block">Ta cliente idéale</label>
            <Textarea value={cible} onChange={(e) => setCible(e.target.value)} className="rounded-[10px] min-h-[80px]" />
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block">Problème principal</label>
            <Input value={probleme} onChange={(e) => setProbleme(e.target.value)} className="rounded-[10px] h-12" />
          </div>
          <div>
            <label className="text-sm font-medium mb-2 block">Piliers de contenu</label>
            <div className="flex flex-wrap gap-2">
              {PILIERS.map((p) => (
                <button key={p} onClick={() => togglePilier(p)}
                  className={`rounded-pill px-4 py-2 text-sm font-medium border transition-all ${piliers.includes(p) ? "bg-primary text-primary-foreground border-primary" : "bg-card text-foreground border-border hover:border-primary/40"}`}>
                  {p}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-sm font-medium mb-2 block">Ton</label>
            <div className="flex flex-wrap gap-2">
              {TONS.map((t) => (
                <button key={t} onClick={() => toggleTon(t)}
                  className={`rounded-pill px-4 py-2 text-sm font-medium border transition-all ${tons.includes(t) ? "bg-primary text-primary-foreground border-primary" : "bg-card text-foreground border-border hover:border-primary/40"}`}>
                  {t}
                </button>
              ))}
            </div>
          </div>
          <Button onClick={handleSave} disabled={saving} className="w-full rounded-pill bg-primary text-primary-foreground hover:bg-bordeaux h-12">
            {saving ? "Enregistrement..." : "Enregistrer les modifications"}
          </Button>
        </div>
      </main>
    </div>
  );
}
