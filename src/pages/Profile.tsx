import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import AppHeader from "@/components/AppHeader";
import { InputWithVoice as Input } from "@/components/ui/input-with-voice";
import { TextareaWithVoice as Textarea } from "@/components/ui/textarea-with-voice";
import { useToast } from "@/hooks/use-toast";
import { HelpCircle, ArrowRight, Info } from "lucide-react";
import SaveButton from "@/components/SaveButton";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { useActiveChannels, ALL_CHANNELS, type ChannelId } from "@/hooks/use-active-channels";

const PILIERS = [
  "Coulisses / fabrication", "Éducation / pédagogie", "Valeurs / engagements",
  "Témoignages clients", "Vie d'entrepreneuse", "Inspiration / tendances",
  "Conseils pratiques", "Storytelling personnel",
];

const TONS = ["Chaleureux", "Expert·e", "Drôle", "Engagé·e", "Poétique", "Direct", "Inspirant·e"];

const ACTIVITY_TYPES = [
  { id: "creatrice", label: "Créatrice / Artisane" },
  { id: "freelance", label: "Freelance" },
  { id: "prestataire", label: "Prestataire / Consultante" },
  { id: "accompagnante", label: "Coach / Formatrice" },
  { id: "autre", label: "Autre" },
];

type HelpKey = string | null;

interface ProfileData {
  prenom: string;
  activite: string;
  typeActivite: string;
  cible: string;
  probleme: string;
  piliers: string[];
  tons: string[];
}

function HelpToggle({ text, fieldKey, openHelp, setOpenHelp }: { text: string; fieldKey: string; openHelp: HelpKey; setOpenHelp: (k: HelpKey) => void }) {
  const isOpen = openHelp === fieldKey;
  return (
    <div className="mt-1">
      <button onClick={() => setOpenHelp(isOpen ? null : fieldKey)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors">
        <HelpCircle className="w-3.5 h-3.5" />
        <span className="font-mono-ui">Exemple</span>
      </button>
      {isOpen && (
        <p className="mt-1.5 text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2 italic animate-fade-in">{text}</p>
      )}
    </div>
  );
}

export default function Profile() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [openHelp, setOpenHelp] = useState<HelpKey>(null);

  const [current, setCurrent] = useState<ProfileData>({
    prenom: "", activite: "", typeActivite: "", cible: "", probleme: "", piliers: [], tons: [],
  });
  const [saved, setSaved] = useState<ProfileData>({
    prenom: "", activite: "", typeActivite: "", cible: "", probleme: "", piliers: [], tons: [],
  });

  const hasChanges = JSON.stringify(current) !== JSON.stringify(saved);
  useUnsavedChanges(hasChanges);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("*")
      .eq("user_id", user.id)
      .single()
      .then(({ data }) => {
        if (data) {
          const loaded: ProfileData = {
            prenom: data.prenom || "",
            activite: data.activite || "",
            typeActivite: data.type_activite || "",
            cible: data.cible || "",
            probleme: data.probleme_principal || "",
            piliers: data.piliers || [],
            tons: data.tons || [],
          };
          setCurrent(loaded);
          setSaved(loaded);
        }
        setLoading(false);
      });
  }, [user?.id]);

  const update = (field: keyof ProfileData, value: string | string[]) => {
    setCurrent((prev) => ({ ...prev, [field]: value }));
  };

  const togglePilier = (p: string) =>
    update("piliers", current.piliers.includes(p) ? current.piliers.filter((x) => x !== p) : current.piliers.length < 4 ? [...current.piliers, p] : current.piliers);
  const toggleTon = (t: string) =>
    update("tons", current.tons.includes(t) ? current.tons.filter((x) => x !== t) : [...current.tons, t]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        prenom: current.prenom,
        activite: current.activite,
        type_activite: current.typeActivite,
        cible: current.cible,
        probleme_principal: current.probleme,
        piliers: current.piliers,
        tons: current.tons,
      })
      .eq("user_id", user.id);
    setSaving(false);
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } else {
      setSaved({ ...current });
      toast({ title: "✅ Modifications enregistrées" });
    }
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
      
      <main className="mx-auto max-w-2xl px-4 py-8 pb-28 animate-fade-in">
        <h1 className="font-display text-3xl font-bold text-bordeaux mb-2">Mon profil</h1>
        <p className="text-sm text-muted-foreground mb-6">Tes infos de base. Pour tout ce qui concerne ta marque (mission, ton, positionnement), c'est dans le module Branding.</p>

        {/* Link to Branding */}
        <Link
          to="/branding"
          className="flex items-center justify-between rounded-2xl bg-rose-pale border border-border p-4 mb-6 group hover:border-primary/40 transition-colors"
        >
          <div>
            <p className="text-sm font-semibold text-foreground">🎨 Module Branding</p>
            <p className="text-xs text-muted-foreground mt-0.5">Mission, cible détaillée, ton, positionnement, verbatims...</p>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
        </Link>

        <div className="rounded-2xl bg-card p-6 border border-border space-y-5">
          {/* Prénom */}
          <div>
            <label className="text-sm font-medium mb-1.5 block">Prénom</label>
            <Input value={current.prenom} onChange={(e) => update("prenom", e.target.value)} className="rounded-[10px] h-12" />
          </div>

          {/* Activité */}
          <div>
            <label className="text-sm font-medium mb-1.5 block">Activité</label>
            <Input value={current.activite} onChange={(e) => update("activite", e.target.value)} className="rounded-[10px] h-12" placeholder="Ex : Céramiste, coach, photographe..." />
          </div>

          {/* Type d'activité */}
          <div>
            <label className="text-sm font-medium mb-1.5 block">Type d'activité</label>
            <div className="grid grid-cols-2 gap-3">
              {ACTIVITY_TYPES.map((t) => (
                <button key={t.id} onClick={() => update("typeActivite", t.id)}
                  className={`rounded-lg border-2 p-3 text-left text-sm font-medium transition-all ${current.typeActivite === t.id ? "border-primary bg-secondary" : "border-border hover:border-primary/40"}`}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Cible */}
          <div>
            <label className="text-sm font-medium mb-1.5 block">Ta cliente idéale</label>
            <Textarea value={current.cible} onChange={(e) => update("cible", e.target.value)} className="rounded-[10px] min-h-[80px]" placeholder="Qui est-elle ? Quel âge, quel style de vie ?" />
            <HelpToggle fieldKey="cible" openHelp={openHelp} setOpenHelp={setOpenHelp} text="Ex : Femmes 30-45 ans, entrepreneures, qui cherchent à structurer leur communication pour gagner en visibilité." />
          </div>

          {/* Problème */}
          <div>
            <label className="text-sm font-medium mb-1.5 block">Problème principal de ta cible</label>
            <Input value={current.probleme} onChange={(e) => update("probleme", e.target.value)} className="rounded-[10px] h-12" placeholder="Qu'est-ce qui la bloque ?" />
            <HelpToggle fieldKey="probleme" openHelp={openHelp} setOpenHelp={setOpenHelp} text="Ex : Elle crée des pièces magnifiques mais personne ne les voit sur Instagram." />
          </div>

          {/* Piliers */}
          <div>
            <label className="text-sm font-medium mb-2 block">Mes thématiques <span className="text-muted-foreground font-normal">(4 max)</span></label>
            <div className="flex flex-wrap gap-2">
              {PILIERS.map((p) => (
                <button key={p} onClick={() => togglePilier(p)}
                  className={`rounded-full px-4 py-2 text-sm font-medium border transition-all ${current.piliers.includes(p) ? "bg-primary text-primary-foreground border-primary" : "bg-card text-foreground border-border hover:border-primary/40"}`}>
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Tons */}
          <div>
            <label className="text-sm font-medium mb-2 block">Ton</label>
            <div className="flex flex-wrap gap-2">
              {TONS.map((t) => (
                <button key={t} onClick={() => toggleTon(t)}
                  className={`rounded-full px-4 py-2 text-sm font-medium border transition-all ${current.tons.includes(t) ? "bg-primary text-primary-foreground border-primary" : "bg-card text-foreground border-border hover:border-primary/40"}`}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* ─── Canaux ─── */}
          <ChannelSelector />
        </div>
      </main>

      {/* Sticky save button */}
      <div className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur-sm border-t border-border p-4 z-40">
        <div className="mx-auto max-w-2xl">
          <SaveButton hasChanges={hasChanges} saving={saving} onSave={handleSave} />
        </div>
      </div>
    </div>
  );
}

function ChannelSelector() {
  const { channels, setChannels, loading } = useActiveChannels();
  const { toast } = useToast();
  const [showComingSoon, setShowComingSoon] = useState<string | null>(null);

  if (loading) return null;

  const toggle = async (id: ChannelId) => {
    const isActive = channels.includes(id);
    if (isActive && channels.length <= 1) {
      toast({ title: "Au moins 1 canal requis", variant: "destructive" });
      return;
    }
    const next = isActive ? channels.filter(c => c !== id) : [...channels, id];
    const ch = ALL_CHANNELS.find(c => c.id === id);
    if (ch?.comingSoon && !isActive) {
      setShowComingSoon(id);
      setTimeout(() => setShowComingSoon(null), 3000);
    }
    await setChannels(next as ChannelId[]);
    toast({ title: isActive ? `${ch?.label} retiré` : `${ch?.label} ajouté ✅` });
  };

  return (
    <div className="pt-2">
      <label className="text-sm font-medium mb-2 block">📱 Mes canaux de communication</label>
      <p className="text-xs text-muted-foreground mb-3">
        Sélectionne les canaux que tu utilises ou que tu veux développer. L'outil s'adapte.
      </p>
      <div className="space-y-2">
        {ALL_CHANNELS.map((ch) => {
          const active = channels.includes(ch.id);
          return (
            <button
              key={ch.id}
              onClick={() => toggle(ch.id)}
              className={`w-full flex items-center gap-3 rounded-xl border-2 px-4 py-3 text-left text-sm font-medium transition-all ${
                active
                  ? "border-primary bg-secondary"
                  : "border-border hover:border-primary/40"
              }`}
            >
              <span className="text-lg">{ch.emoji}</span>
              <span className="flex-1">{ch.label}</span>
              {ch.comingSoon && (
                <span className="text-[10px] font-bold text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">🔜</span>
              )}
              <span className={`text-xs font-semibold ${active ? "text-primary" : "text-muted-foreground"}`}>
                {active ? "✅" : ""}
              </span>
            </button>
          );
        })}
      </div>
      {showComingSoon && (
        <p className="mt-2 text-xs text-muted-foreground flex items-center gap-1 animate-fade-in">
          <Info className="h-3 w-3" /> Ce canal sera disponible prochainement. On te préviendra !
        </p>
      )}
      <p className="mt-3 text-xs text-muted-foreground">
        💡 Tu pourras modifier tes canaux à tout moment.
      </p>
    </div>
  );
}
