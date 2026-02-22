import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Pencil, RefreshCw } from "lucide-react";
import EditableText from "@/components/EditableText";

interface Portrait {
  prenom: string;
  phrase_signature: string;
  qui_elle_est: { age: string; metier: string; situation: string; ca: string; temps_com: string };
  frustrations: string[];
  objectifs: string[];
  blocages: string[];
  comment_parler: { ton: string; canal: string; convainc: string; fuir: string[] };
  ses_mots: string[];
}

export default function PersonaRecapPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [data, setData] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [portrait, setPortrait] = useState<Portrait | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [customName, setCustomName] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      supabase.from("persona").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("profiles").select("activite, prenom").eq("user_id", user.id).single(),
      supabase.from("brand_profile").select("mission, offer, target_description, tone_register, voice_description, target_verbatims, combat_cause").eq("user_id", user.id).maybeSingle(),
    ]).then(([pRes, profRes, bpRes]) => {
      const personaData = pRes.data;
      setData(personaData);
      setProfile({ ...(profRes.data || {}), ...(bpRes.data || {}) });
      if (personaData?.portrait) {
        setPortrait(personaData.portrait as unknown as Portrait);
        setCustomName(personaData.portrait_prenom || (personaData.portrait as unknown as Portrait).prenom || "");
      }
      setLoading(false);
    });
  }, [user]);

  const canGenerate = data?.step_1_frustrations && data?.step_2_transformation;

  const savePortraitField = async (path: string[], value: string) => {
    if (!data || !portrait) return;
    const updated = JSON.parse(JSON.stringify(portrait));
    let obj = updated;
    for (let i = 0; i < path.length - 1; i++) obj = obj[path[i]];
    obj[path[path.length - 1]] = value;
    await supabase.from("persona").update({ portrait: updated as any }).eq("id", data.id);
    setPortrait(updated);
  };

  const savePortraitArrayItem = async (arrayKey: string, index: number, value: string) => {
    if (!data || !portrait) return;
    const updated = JSON.parse(JSON.stringify(portrait));
    updated[arrayKey][index] = value;
    await supabase.from("persona").update({ portrait: updated as any }).eq("id", data.id);
    setPortrait(updated);
  };

  const generatePortrait = async () => {
    if (!canGenerate) return;
    setGenerating(true);
    try {
      const { data: fnData, error } = await supabase.functions.invoke("persona-ai", {
        body: { type: "portrait", profile, persona: data },
      });
      if (error) throw error;
      const raw = fnData.content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const parsed: Portrait = JSON.parse(raw);
      await supabase.from("persona").update({ portrait: parsed as any, portrait_prenom: parsed.prenom }).eq("id", data.id);
      setPortrait(parsed);
      setCustomName(parsed.prenom);
      setData({ ...data, portrait: parsed, portrait_prenom: parsed.prenom });
    } catch (e: any) {
      toast({ title: "Erreur IA", description: e.message, variant: "destructive" });
    }
    setGenerating(false);
  };

  const saveName = async (name: string) => {
    setCustomName(name);
    if (data?.id) await supabase.from("persona").update({ portrait_prenom: name }).eq("id", data.id);
    setEditingName(false);
  };

  const displayName = customName || portrait?.prenom || "";
  const initials = displayName ? displayName.slice(0, 1).toUpperCase() : "?";

  if (loading) return (
    <div className="min-h-screen bg-background"><AppHeader /><div className="flex justify-center py-20"><p className="text-muted-foreground">Chargement...</p></div></div>
  );

  if (!canGenerate) return (
    <div className="min-h-screen bg-background"><AppHeader />
      <main className="mx-auto max-w-[700px] px-6 py-8 max-md:px-4">
        <SubPageHeader parentLabel="Branding" parentTo="/branding" currentLabel="Fiche portrait" />
        <div className="rounded-2xl bg-rose-pale border border-border p-6 text-center">
          <p className="text-foreground text-[15px] mb-4">💡 Ta fiche portrait a besoin d'au moins tes étapes "Frustrations" et "Transformation".</p>
          <Link to="/branding/persona"><Button className="rounded-pill">Compléter mon persona →</Button></Link>
        </div>
      </main>
    </div>
  );

  if (!portrait) return (
    <div className="min-h-screen bg-background"><AppHeader />
      <main className="mx-auto max-w-[700px] px-6 py-8 max-md:px-4">
        <SubPageHeader parentLabel="Branding" parentTo="/branding" currentLabel="Fiche portrait" />
        <h1 className="font-display text-[22px] font-bold text-foreground mb-2">Le portrait de ta cliente idéale</h1>
        <p className="text-muted-foreground text-[15px] mb-6">Génère ta fiche portrait pour visualiser ta cliente idéale comme une vraie personne.</p>
        <Button onClick={generatePortrait} disabled={generating} className="rounded-pill w-full h-12 text-base">
          {generating ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Génération en cours...</> : "✨ Générer ma fiche portrait"}
        </Button>
      </main>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-[700px] px-6 py-8 max-md:px-4">
        <SubPageHeader parentLabel="Branding" parentTo="/branding" currentLabel="Fiche portrait" />

        <div className="flex items-center justify-between mb-6">
          <h1 className="font-display text-[22px] font-bold text-foreground">Le portrait de ta cliente idéale</h1>
          <div className="flex gap-2">
            <Link to="/branding/persona"><Button variant="outline" size="sm" className="rounded-pill text-xs"><Pencil className="h-3 w-3 mr-1" /> Modifier</Button></Link>
          </div>
        </div>

        <div className="rounded-2xl border border-[hsl(var(--border))] bg-card shadow-card p-6 sm:p-8 mb-6">
          {/* Avatar + Name */}
          <div className="flex flex-col items-center mb-6">
            <div className="w-[100px] h-[100px] rounded-full bg-rose-pale flex items-center justify-center mb-3">
              <span className="font-display text-[36px] font-bold text-primary">{initials}</span>
            </div>

            {editingName ? (
              <div className="flex items-center gap-2 mb-1">
                <Input ref={nameRef} value={customName} onChange={(e) => setCustomName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && saveName(customName)} onBlur={() => saveName(customName)}
                  className="w-48 text-center font-display text-lg" autoFocus />
              </div>
            ) : (
              <div className="flex items-center gap-2 mb-1">
                <h2 className="font-display text-2xl font-bold text-foreground">{displayName}</h2>
                <button onClick={() => setEditingName(true)} className="text-muted-foreground hover:text-primary transition-colors" title="Changer le prénom">
                  <RefreshCw className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            <EditableText
              value={portrait.phrase_signature}
              onSave={(v) => savePortraitField(["phrase_signature"], v)}
              type="input"
              className="text-[14px] italic text-muted-foreground text-center max-w-[400px]"
            />
          </div>

          {/* Qui elle est */}
          <h3 className="flex items-center gap-2 font-display text-[15px] font-bold text-foreground mb-2.5"><span>👤</span> Qui elle est</h3>
          <div className="space-y-1 text-[14px] text-foreground mb-5">
            {(["age", "metier", "situation", "ca", "temps_com"] as const).map((key) => {
              const labels: Record<string, string> = { age: "Âge", metier: "Métier", situation: "Situation", ca: "CA", temps_com: "Temps pour sa com'" };
              return portrait.qui_elle_est[key] ? (
                <p key={key}>
                  <span className="text-muted-foreground">{labels[key]} : </span>
                  <EditableText value={portrait.qui_elle_est[key]} onSave={(v) => savePortraitField(["qui_elle_est", key], v)} type="input" className="text-[14px] inline" />
                </p>
              ) : null;
            })}
          </div>

          {/* List sections */}
          {([
            { icon: "😩", title: "Ce qui la frustre", key: "frustrations" },
            { icon: "✨", title: "Ce qu'elle veut", key: "objectifs" },
            { icon: "🚫", title: "Ce qui la bloque", key: "blocages" },
          ] as const).map((section) => (
            <div key={section.key}>
              <div className="border-t border-border my-5" />
              <h3 className="flex items-center gap-2 font-display text-[15px] font-bold text-foreground mb-2.5"><span>{section.icon}</span> {section.title}</h3>
              <ul className="space-y-1.5 text-[14px] text-foreground">
                {portrait[section.key].map((item, i) => (
                  <li key={i} className="flex items-start gap-1">
                    <span className="shrink-0">•</span>
                    <EditableText value={item} onSave={(v) => savePortraitArrayItem(section.key, i, v)} type="input" className="text-[14px]" />
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {/* Comment lui parler */}
          <div className="border-t border-border my-5" />
          <h3 className="flex items-center gap-2 font-display text-[15px] font-bold text-foreground mb-2.5"><span>💬</span> Comment lui parler</h3>
          <div className="space-y-1.5 text-[14px] text-foreground">
            <p><span className="text-muted-foreground">Ton : </span><EditableText value={portrait.comment_parler.ton} onSave={(v) => savePortraitField(["comment_parler", "ton"], v)} type="input" className="text-[14px] inline" /></p>
            <p><span className="text-muted-foreground">Canal préféré : </span><EditableText value={portrait.comment_parler.canal} onSave={(v) => savePortraitField(["comment_parler", "canal"], v)} type="input" className="text-[14px] inline" /></p>
            <p><span className="text-muted-foreground">Ce qui la convainc : </span><EditableText value={portrait.comment_parler.convainc} onSave={(v) => savePortraitField(["comment_parler", "convainc"], v)} type="input" className="text-[14px] inline" /></p>
            <p><span className="text-muted-foreground">Les mots qui la font fuir : </span>{portrait.comment_parler.fuir?.join(", ")}</p>
          </div>

          {/* Ses mots */}
          <div className="border-t border-border my-5" />
          <h3 className="flex items-center gap-2 font-display text-[15px] font-bold text-foreground mb-2.5"><span>🗣️</span> Ses mots à elle</h3>
          <div className="space-y-1.5 text-[14px] text-foreground italic">
            {portrait.ses_mots.map((m, i) => (
              <EditableText key={i} value={m} onSave={(v) => savePortraitArrayItem("ses_mots", i, v)} type="input" className="text-[14px] italic" />
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-6">
          <Button onClick={generatePortrait} disabled={generating} variant="outline" size="sm" className="rounded-pill text-xs">
            {generating ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-1" />}
            Régénérer la fiche
          </Button>
        </div>

        <Link to="/branding" className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">← Retour au Branding</Link>
      </main>
    </div>
  );
}
