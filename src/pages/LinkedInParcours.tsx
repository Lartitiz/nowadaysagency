import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspaceFilter, useWorkspaceId } from "@/hooks/use-workspace-query";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import { Button } from "@/components/ui/button";
import { InputWithVoice as Input } from "@/components/ui/input-with-voice";
import { TextareaWithVoice as Textarea } from "@/components/ui/textarea-with-voice";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { friendlyError } from "@/lib/error-messages";
import { Sparkles, Copy, Check, Plus, Trash2 } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

interface Experience {
  id?: string;
  job_title: string;
  company: string;
  description_raw: string;
  description_optimized: string;
}

export default function LinkedInParcours() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { column, value } = useWorkspaceFilter();
  const workspaceId = useWorkspaceId();
  const [experiences, setExperiences] = useState<Experience[]>([]);
  const [generatingIdx, setGeneratingIdx] = useState<number | null>(null);
  const [copied, setCopied] = useState<number | null>(null);
  const [skills, setSkills] = useState<{ techniques: string[]; comportementales: string[] } | null>(null);
  const [generatingSkills, setGeneratingSkills] = useState(false);

  // Checklist states
  const [formationsDone, setFormationsDone] = useState(false);
  const [formationDetails, setFormationDetails] = useState(false);
  const [formationProjects, setFormationProjects] = useState(false);
  const [formationVisuals, setFormationVisuals] = useState(false);
  const [mediaEvents, setMediaEvents] = useState(false);
  const [mediaPresentation, setMediaPresentation] = useState(false);
  const [mediaVideos, setMediaVideos] = useState(false);
  const [mediaArticles, setMediaArticles] = useState(false);
  const [mediaPortfolio, setMediaPortfolio] = useState(false);

  useEffect(() => {
    if (!user) return;
    (supabase.from("linkedin_experiences") as any).select("*").eq(column, value).order("sort_order").then(({ data }: any) => {
      if (data && data.length > 0) setExperiences(data.map(d => ({ id: d.id, job_title: d.job_title || "", company: d.company || "", description_raw: d.description_raw || "", description_optimized: d.description_optimized || "" })));
    });
  }, [user?.id]);

  const addExperience = () => {
    setExperiences(prev => [...prev, { job_title: "", company: "", description_raw: "", description_optimized: "" }]);
  };

  const updateExp = (idx: number, field: keyof Experience, value: string) => {
    setExperiences(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  };

  const removeExp = async (idx: number) => {
    const exp = experiences[idx];
    if (exp.id) await supabase.from("linkedin_experiences").delete().eq("id", exp.id);
    setExperiences(prev => prev.filter((_, i) => i !== idx));
    toast({ title: "Expérience supprimée" });
  };

  const optimizeExp = async (idx: number) => {
    const exp = experiences[idx];
    if (!exp.description_raw.trim()) return;
    setGeneratingIdx(idx);
    try {
      const res = await supabase.functions.invoke("linkedin-ai", {
        body: { action: "optimize-experience", job_title: exp.job_title, company: exp.company, description: exp.description_raw },
      });
      if (res.error) throw new Error(res.error.message);
      const content = res.data?.content || "";
      updateExp(idx, "description_optimized", content);
    } catch (e: any) {
      console.error("Erreur technique:", e);
      toast({ title: "Erreur", description: friendlyError(e), variant: "destructive" });
    } finally {
      setGeneratingIdx(null);
    }
  };

  const saveExperiences = async () => {
    if (!user) return;
    // Delete all then re-insert
    await (supabase.from("linkedin_experiences") as any).delete().eq(column, value);
    if (experiences.length > 0) {
      await supabase.from("linkedin_experiences").insert(
        experiences.map((e, i) => ({ user_id: user.id, workspace_id: workspaceId !== user.id ? workspaceId : undefined, job_title: e.job_title, company: e.company, description_raw: e.description_raw, description_optimized: e.description_optimized, sort_order: i }))
      );
    }
    toast({ title: "✅ Parcours sauvegardé !" });
  };

  const suggestSkills = async () => {
    setGeneratingSkills(true);
    try {
      const res = await supabase.functions.invoke("linkedin-ai", { body: { action: "suggest-skills" } });
      if (res.error) throw new Error(res.error.message);
      const content = res.data?.content || "";
      let parsed: any;
      try { parsed = JSON.parse(content); } catch { const m = content.match(/\{[\s\S]*\}/); parsed = m ? JSON.parse(m[0]) : null; }
      if (parsed) setSkills(parsed);
    } catch (e: any) {
      console.error("Erreur technique:", e);
      toast({ title: "Erreur", description: friendlyError(e), variant: "destructive" });
    } finally {
      setGeneratingSkills(false);
    }
  };

  const copyText = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopied(idx);
    setTimeout(() => setCopied(null), 2000);
    toast({ title: "📋 Copié !" });
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-6 py-8 max-md:px-4">
        <SubPageHeader parentTo="/linkedin" parentLabel="LinkedIn" currentLabel="Mon parcours" />

        <h1 className="font-display text-[22px] font-bold text-foreground mb-1">Ton parcours professionnel</h1>
        <p className="text-sm text-muted-foreground italic mb-8">Chaque expérience doit montrer ce que tu as apporté, pas juste ce que tu as fait.</p>

        <Accordion type="multiple" defaultValue={["experiences"]} className="space-y-4">
          {/* Experiences */}
          <AccordionItem value="experiences" className="rounded-xl border border-border bg-card px-5">
            <AccordionTrigger className="font-display text-base font-bold">💼 Tes expériences professionnelles</AccordionTrigger>
            <AccordionContent className="space-y-4 pb-5">
              <div className="rounded-xl bg-rose-pale p-4 text-sm">
                <p className="font-semibold mb-1">Structure recommandée :</p>
                <p>1. <strong>Contexte</strong> : Présente l'entreprise et ton rôle</p>
                <p>2. <strong>Problématique</strong> : Quel était leur besoin ?</p>
                <p>3. <strong>Solution</strong> : Ce que tu as mis en place</p>
                <p>4. <strong>Résultats</strong> : Les bénéfices (chiffrés si possible)</p>
              </div>

              {experiences.map((exp, idx) => (
                <div key={idx} className="rounded-xl border border-border p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-foreground">Expérience {idx + 1}</span>
                    <Button variant="ghost" size="sm" onClick={() => removeExp(idx)}><Trash2 className="h-4 w-4 text-muted-foreground" /></Button>
                  </div>
                  <Input value={exp.job_title} onChange={e => updateExp(idx, "job_title", e.target.value)} placeholder="Intitulé du poste" />
                  <Input value={exp.company} onChange={e => updateExp(idx, "company", e.target.value)} placeholder="Entreprise" />
                  <Textarea value={exp.description_raw} onChange={e => updateExp(idx, "description_raw", e.target.value)} placeholder="Décris ton poste et tes missions (en vrac, c'est OK)" className="min-h-[100px]" />
                  <Button variant="outline" size="sm" onClick={() => optimizeExp(idx)} disabled={generatingIdx === idx} className="rounded-pill gap-2">
                    <Sparkles className="h-4 w-4" />
                    {generatingIdx === idx ? "Rédaction..." : "✨ Rédiger avec la structure"}
                  </Button>
                  {exp.description_optimized && (
                    <div className="space-y-2">
                      <Textarea value={exp.description_optimized} onChange={e => updateExp(idx, "description_optimized", e.target.value)} className="min-h-[120px]" />
                      <Button variant="ghost" size="sm" onClick={() => copyText(exp.description_optimized, idx)} className="gap-1">
                        {copied === idx ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                        {copied === idx ? "Copié" : "📋 Copier"}
                      </Button>
                    </div>
                  )}
                </div>
              ))}

              <Button variant="outline" onClick={addExperience} className="gap-2 rounded-pill">
                <Plus className="h-4 w-4" /> Ajouter une expérience
              </Button>
            </AccordionContent>
          </AccordionItem>

          {/* Formations */}
          <AccordionItem value="formations" className="rounded-xl border border-border bg-card px-5">
            <AccordionTrigger className="font-display text-base font-bold">🎓 Tes formations</AccordionTrigger>
            <AccordionContent className="space-y-3 pb-5">
              <p className="text-sm text-muted-foreground">Ajoute tes études avec le détail des matières et des réalisations.</p>
              <div className="space-y-2">
                {[
                  { checked: formationsDone, set: setFormationsDone, label: "J'ai ajouté mes études/formations" },
                  { checked: formationDetails, set: setFormationDetails, label: "J'ai détaillé les matières étudiées" },
                  { checked: formationProjects, set: setFormationProjects, label: "J'ai ajouté des réalisations (projets, mémoires)" },
                  { checked: formationVisuals, set: setFormationVisuals, label: "J'ai mis des visuels illustrant mes projets" },
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Checkbox checked={item.checked} onCheckedChange={v => item.set(!!v)} />
                    <span className="text-sm">{item.label}</span>
                  </div>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* Skills */}
          <AccordionItem value="skills" className="rounded-xl border border-border bg-card px-5">
            <AccordionTrigger className="font-display text-base font-bold">⚡ Tes compétences</AccordionTrigger>
            <AccordionContent className="space-y-4 pb-5">
              <p className="text-sm text-muted-foreground">Ajoute des compétences qui te différencient. Pas de "Microsoft Office".</p>
              <div className="rounded-xl bg-rose-pale p-4 text-sm">
                <p>✅ Pertinentes dans ton activité</p>
                <p>✅ Mettent en avant tes qualités humaines</p>
                <p>✅ Te différencient</p>
                <p>❌ Ne pas être banales</p>
              </div>
              <Button variant="outline" onClick={suggestSkills} disabled={generatingSkills} className="rounded-pill gap-2">
                <Sparkles className="h-4 w-4" />
                {generatingSkills ? "Recherche..." : "✨ Suggérer des compétences"}
              </Button>
              {skills && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-semibold mb-2">🔧 Techniques</p>
                    {skills.techniques.map((s, i) => (
                      <p key={i} className="text-sm bg-muted/50 rounded-lg px-3 py-1.5 mb-1">{s}</p>
                    ))}
                  </div>
                  <div>
                    <p className="text-sm font-semibold mb-2">💡 Comportementales</p>
                    {skills.comportementales.map((s, i) => (
                      <p key={i} className="text-sm bg-muted/50 rounded-lg px-3 py-1.5 mb-1">{s}</p>
                    ))}
                  </div>
                </div>
              )}
            </AccordionContent>
          </AccordionItem>

          {/* Rich media */}
          <AccordionItem value="media" className="rounded-xl border border-border bg-card px-5">
            <AccordionTrigger className="font-display text-base font-bold">📎 Rich media</AccordionTrigger>
            <AccordionContent className="space-y-3 pb-5">
              <p className="text-sm text-muted-foreground">Ajoute du contenu concret à ton profil.</p>
              <div className="space-y-2">
                {[
                  { checked: mediaEvents, set: setMediaEvents, label: "Images d'événements ou de réalisations" },
                  { checked: mediaPresentation, set: setMediaPresentation, label: "Présentation de mes services" },
                  { checked: mediaVideos, set: setMediaVideos, label: "Vidéos (conférences, interviews, reels)" },
                  { checked: mediaArticles, set: setMediaArticles, label: "Liens vers des articles publiés" },
                  { checked: mediaPortfolio, set: setMediaPortfolio, label: "Portfolio ou book de réalisations" },
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Checkbox checked={item.checked} onCheckedChange={v => item.set(!!v)} />
                    <span className="text-sm">{item.label}</span>
                  </div>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        <Button onClick={saveExperiences} className="mt-8 rounded-pill gap-2">💾 Enregistrer mon parcours</Button>
      </main>
    </div>
  );
}
