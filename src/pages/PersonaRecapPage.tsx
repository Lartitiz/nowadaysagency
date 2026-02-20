import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Copy, Pencil, Loader2, ExternalLink } from "lucide-react";

export default function PersonaRecapPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [aiLoading, setAiLoading] = useState(false);
  const [pitchTab, setPitchTab] = useState<"short" | "medium" | "long">("short");
  const [profile, setProfile] = useState<any>(null);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      supabase.from("persona").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("profiles").select("activite, prenom").eq("user_id", user.id).single(),
      supabase.from("brand_profile").select("mission, offer, target_description, tone_register").eq("user_id", user.id).maybeSingle(),
    ]).then(([pRes, profRes, bpRes]) => {
      setData(pRes.data);
      setProfile({ ...(profRes.data || {}), ...(bpRes.data || {}) });
      setLoading(false);
    });
  }, [user]);

  const copyText = async (text: string) => {
    await navigator.clipboard.writeText(text);
    toast({ title: "Copié !" });
  };

  const handleGeneratePitch = async () => {
    setAiLoading(true);
    try {
      const { data: fnData, error } = await supabase.functions.invoke("persona-ai", {
        body: { type: "pitch", profile, persona: data },
      });
      if (error) throw error;
      const raw = fnData.content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      let parsed: any;
      try { parsed = JSON.parse(raw); } catch { parsed = { short: fnData.content, medium: "", long: "" }; }
      const updated = {
        pitch_short: parsed.short || "", pitch_medium: parsed.medium || "", pitch_long: parsed.long || "",
      };
      await supabase.from("persona").update(updated).eq("id", data.id);
      setData({ ...data, ...updated });
    } catch (e: any) {
      toast({ title: "Erreur IA", description: e.message, variant: "destructive" });
    }
    setAiLoading(false);
  };

  if (loading) return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <div className="flex justify-center py-20"><p className="text-muted-foreground">Chargement...</p></div>
    </div>
  );

  const sections = [
    { icon: "😩", title: "Ses frustrations", text: data?.step_1_frustrations, borderColor: "border-l-primary" },
    { icon: "✨", title: "Sa transformation rêvée", text: data?.step_2_transformation, borderColor: "border-l-accent" },
    { icon: "🚧", title: "Ses freins & clichés", text: [data?.step_3a_objections, data?.step_3b_cliches].filter(Boolean).join("\n\n"), borderColor: "border-l-bordeaux" },
    {
      icon: "🎨", title: "Son univers visuel",
      text: [
        data?.step_4_beautiful && `Ce qu'elle trouve beau : ${data.step_4_beautiful}`,
        data?.step_4_inspiring && `Ce qui l'inspire : ${data.step_4_inspiring}`,
        data?.step_4_repulsive && `Ce qui la rebute : ${data.step_4_repulsive}`,
        data?.step_4_feeling && `Ce qu'elle a besoin de ressentir : ${data.step_4_feeling}`,
      ].filter(Boolean).join("\n"),
      borderColor: "border-l-rose-medium",
      pinterestUrl: data?.step_4_pinterest_url,
    },
  ];

  const allText = sections.map((s) => s.text).join("\n\n");

  const pitches = [
    { key: "short" as const, label: "Version courte", sublabel: "Bio Instagram", text: data?.pitch_short || "" },
    { key: "medium" as const, label: "Version moyenne", sublabel: "Page de vente", text: data?.pitch_medium || "" },
    { key: "long" as const, label: "Version longue", sublabel: "Page À propos", text: data?.pitch_long || "" },
  ];

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-[700px] px-6 py-8 max-md:px-4">
        <SubPageHeader parentLabel="Branding" parentTo="/branding" currentLabel="Fiche persona" />

        <h1 className="font-display text-[22px] font-bold text-foreground mb-1">Le portrait de ta cliente idéale</h1>
        <div className="mb-6">
          <span className="font-mono-ui text-[11px] font-semibold px-2 py-0.5 rounded-md bg-rose-pale text-foreground">
            {data?.starting_point === "existing" ? "Basé sur un·e client·e existant·e" : "Persona imaginé·e"}
          </span>
        </div>

        {/* Persona blocks */}
        {sections.map((s, i) => (
          <div key={i} className={`rounded-2xl bg-card border border-border ${s.borderColor} border-l-4 p-5 mb-4 shadow-card`}>
            <h3 className="flex items-center gap-2 font-display text-base font-bold text-foreground mb-2">
              <span>{s.icon}</span> {s.title}
            </h3>
            <p className="text-[14px] text-foreground leading-relaxed whitespace-pre-line">
              {s.text || <span className="italic text-muted-foreground">Non renseigné</span>}
            </p>
            {s.pinterestUrl && (
              <a href={s.pinterestUrl} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline mt-2">
                Voir mon moodboard → <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
        ))}

        <div className="flex gap-2 mb-8">
          <Button variant="outline" size="sm" onClick={() => copyText(allText)} className="rounded-pill text-xs">
            <Copy className="h-3 w-3 mr-1" /> Copier ma fiche
          </Button>
          <Link to="/branding/persona">
            <Button variant="outline" size="sm" className="rounded-pill text-xs">
              <Pencil className="h-3 w-3 mr-1" /> Modifier
            </Button>
          </Link>
        </div>

        {/* Pitch */}
        <h2 className="font-display text-xl font-bold text-foreground mb-4">Pitch client·e</h2>

        <Button onClick={handleGeneratePitch} disabled={aiLoading}
          className="rounded-pill bg-primary text-primary-foreground hover:bg-bordeaux mb-4 w-full h-12 text-base">
          {aiLoading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Génération en cours...</> : "✨ Générer mon pitch client·e"}
        </Button>

        {(data?.pitch_short || data?.pitch_medium || data?.pitch_long) && (
          <div className="mb-8">
            <div className="flex gap-1 bg-rose-pale rounded-xl p-1 mb-3">
              {pitches.map((p) => (
                <button key={p.key} onClick={() => setPitchTab(p.key)}
                  className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-all ${pitchTab === p.key ? "bg-card text-foreground font-semibold shadow-sm" : "text-muted-foreground"}`}>
                  {p.label}
                </button>
              ))}
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-[10px] text-muted-foreground mb-2">{pitches.find((p) => p.key === pitchTab)?.sublabel}</p>
              <p className="text-[14px] text-foreground leading-relaxed whitespace-pre-line">
                {pitches.find((p) => p.key === pitchTab)?.text || <span className="italic text-muted-foreground">Non généré</span>}
              </p>
              <div className="flex justify-end mt-3">
                <Button variant="outline" size="sm" onClick={() => copyText(pitches.find((p) => p.key === pitchTab)?.text || "")} className="rounded-pill text-[11px]">
                  <Copy className="h-3 w-3 mr-1" /> Copier
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Encouragement */}
        <div className="rounded-xl bg-rose-pale border border-border p-5 mb-6">
          <p className="text-[14px] text-foreground leading-relaxed">
            ✨ Ce portrait va évoluer avec le temps. Reviens le mettre à jour quand tu apprends de nouvelles choses sur tes clientes. Et surtout : utilise ces mots dans tes contenus, tes emails, tes pages de vente. C'est ce qui crée la connexion.
          </p>
        </div>

        <Link to="/branding" className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
          ← Retour au Branding
        </Link>
      </main>
    </div>
  );
}
