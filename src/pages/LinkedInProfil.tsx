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
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { friendlyError } from "@/lib/error-messages";
import { Sparkles, Copy, Check } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

export default function LinkedInProfil() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { column, value } = useWorkspaceFilter();
  const workspaceId = useWorkspaceId();
  const [profileId, setProfileId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [titleDone, setTitleDone] = useState(false);
  const [customUrl, setCustomUrl] = useState("");
  const [urlDone, setUrlDone] = useState(false);
  const [photoDone, setPhotoDone] = useState(false);
  const [bannerDone, setBannerDone] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [titleSuggestions, setTitleSuggestions] = useState<string[]>([]);
  const [propValue, setPropValue] = useState<string | null>(null);
  const [copied, setCopied] = useState<number | null>(null);

  const completedCount = [titleDone, urlDone, photoDone, bannerDone].filter(Boolean).length;

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const [lpRes, propRes] = await Promise.all([
        (supabase.from("linkedin_profile") as any).select("*").eq(column, value).maybeSingle(),
        (supabase.from("brand_proposition") as any).select("version_final, version_short").eq(column, value).maybeSingle(),
      ]);
      if (lpRes.data) {
        setProfileId(lpRes.data.id);
        setTitle(lpRes.data.title || "");
        setTitleDone(lpRes.data.title_done || false);
        setCustomUrl(lpRes.data.custom_url || "");
        setUrlDone(lpRes.data.url_done || false);
        setPhotoDone(lpRes.data.photo_done || false);
        setBannerDone(lpRes.data.banner_done || false);
      }
      if (propRes.data) {
        setPropValue(propRes.data.version_short || propRes.data.version_final || null);
      }
    };
    load();
  }, [user?.id]);

  const save = async () => {
    if (!user) return;
    const payload = { user_id: user.id, workspace_id: workspaceId !== user.id ? workspaceId : undefined, title, title_done: titleDone, custom_url: customUrl, url_done: urlDone, photo_done: photoDone, banner_done: bannerDone, updated_at: new Date().toISOString() };
    if (profileId) {
      await supabase.from("linkedin_profile").update(payload).eq("id", profileId);
    } else {
      const { data } = await supabase.from("linkedin_profile").insert(payload).select("id").single();
      if (data) setProfileId(data.id);
    }
    toast({ title: "✅ Profil sauvegardé !" });
  };

  const generateTitle = async () => {
    setGenerating(true);
    try {
      const res = await supabase.functions.invoke("linkedin-ai", { body: { action: "title" } });
      if (res.error) throw new Error(res.error.message);
      const content = res.data?.content || "";
      let parsed: string[];
      try { parsed = JSON.parse(content); } catch { const m = content.match(/\[[\s\S]*\]/); parsed = m ? JSON.parse(m[0]) : []; }
      setTitleSuggestions(parsed);
    } catch (e: any) {
      console.error("Erreur technique:", e);
      toast({ title: "Erreur", description: friendlyError(e), variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  const copyText = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopied(idx);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-6 py-8 max-md:px-4">
        <SubPageHeader parentTo="/linkedin" parentLabel="LinkedIn" currentLabel="Optimiser mon profil" />

        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-display text-[22px] font-bold text-foreground">Optimise ton profil LinkedIn</h1>
          </div>
          <span className="font-mono-ui text-xs font-semibold text-primary bg-rose-pale px-3 py-1 rounded-pill">{completedCount}/4</span>
        </div>
        <Progress value={(completedCount / 4) * 100} className="h-2 mb-8" />

        <Accordion type="multiple" defaultValue={["title"]} className="space-y-4">
          {/* Section 1: Title */}
          <AccordionItem value="title" className="rounded-xl border border-border bg-card px-5">
            <AccordionTrigger className="font-display text-base font-bold">1. Ton titre</AccordionTrigger>
            <AccordionContent className="space-y-4 pb-5">
              <p className="text-sm text-muted-foreground">C'est la petite phrase sous ta photo. C'est elle qui donne envie de cliquer.</p>
              <div className="rounded-xl bg-rose-pale p-4 text-sm space-y-2">
                <span className="inline-block font-mono-ui text-[10px] font-semibold uppercase tracking-wider bg-jaune text-[#2D2235] px-2.5 py-0.5 rounded-pill mb-1">📖 Exemple</span>
                <p className="font-semibold">2 façons simples de le rédiger :</p>
                <p className="italic text-[#6B5E7B] border-l-[3px] border-l-primary pl-3"><span className="not-italic font-mono-ui text-[10px] uppercase text-muted-foreground mr-1">Ex :</span><strong className="not-italic">Option A :</strong> Ta proposition de valeur — "J'aide [type de personnes] à [résultat] grâce à [ta méthode]."</p>
                <p className="italic text-[#6B5E7B] border-l-[3px] border-l-primary pl-3"><span className="not-italic font-mono-ui text-[10px] uppercase text-muted-foreground mr-1">Ex :</span><strong className="not-italic">Option B :</strong> Qui es-tu — "[Poste] + [Mots-clés] pour apparaître dans les recherches."</p>
              </div>
              <div className="rounded-xl bg-rose-pale p-4 text-sm space-y-1.5">
                <span className="inline-block font-mono-ui text-[10px] font-semibold uppercase tracking-wider bg-jaune text-[#2D2235] px-2.5 py-0.5 rounded-pill mb-1">📖 Exemples concrets</span>
                <p className="italic text-[#6B5E7B] border-l-[3px] border-l-primary pl-3">🌿 J'aide les femmes à oser la couleur avec une mode éthique artisanale</p>
                <p className="italic text-[#6B5E7B] border-l-[3px] border-l-primary pl-3">☀️ J'accompagne les marques éthiques à construire une communication sincère</p>
              </div>
              {propValue && (
                <div className="rounded-xl bg-accent/30 border border-accent p-4 text-sm">
                  💡 Ta proposition de valeur : "<strong>{propValue}</strong>" — tu peux l'utiliser directement comme titre !
                </div>
              )}
              <Button onClick={generateTitle} disabled={generating} variant="outline" className="gap-2 rounded-pill">
                <Sparkles className="h-4 w-4" />
                {generating ? "Génération..." : "✨ Générer mon titre LinkedIn"}
              </Button>
              {titleSuggestions.length > 0 && (
                <div className="space-y-2">
                  {titleSuggestions.map((s, i) => (
                    <div key={i} className="flex items-center gap-2 rounded-lg bg-muted/50 p-3">
                      <p className="flex-1 text-sm">{s}</p>
                      <button onClick={() => { setTitle(s); copyText(s, i); }} className="text-xs text-primary hover:underline flex items-center gap-1">
                        {copied === i ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                        {copied === i ? "Copié" : "Utiliser"}
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <Textarea value={title} onChange={e => setTitle(e.target.value)} placeholder="Mon titre LinkedIn..." className="min-h-[60px]" />
              <div className="flex items-center gap-2">
                <Checkbox checked={titleDone} onCheckedChange={v => setTitleDone(!!v)} />
                <span className="text-sm">✅ Mon titre est à jour sur LinkedIn</span>
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* Section 2: URL */}
          <AccordionItem value="url" className="rounded-xl border border-border bg-card px-5">
            <AccordionTrigger className="font-display text-base font-bold">2. Ton URL personnalisée</AccordionTrigger>
            <AccordionContent className="space-y-4 pb-5">
              <p className="text-sm text-muted-foreground">Par défaut, ton URL LinkedIn c'est ton nom + une suite de chiffres. C'est moche et pas mémorisable.</p>
              <p className="text-sm text-muted-foreground">Astuce : va dans Profil → Modifier le profil public et l'URL. Garde une forme courte : initiale du prénom + nom.</p>
              <Input value={customUrl} onChange={e => setCustomUrl(e.target.value)} placeholder="linkedin.com/in/..." />
              <div className="flex items-center gap-2">
                <Checkbox checked={urlDone} onCheckedChange={v => setUrlDone(!!v)} />
                <span className="text-sm">✅ Mon URL est personnalisée</span>
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* Section 3: Photo */}
          <AccordionItem value="photo" className="rounded-xl border border-border bg-card px-5">
            <AccordionTrigger className="font-display text-base font-bold">3. Ta photo de profil</AccordionTrigger>
            <AccordionContent className="space-y-4 pb-5">
              <p className="text-sm text-muted-foreground">Premier élément visible avec ton titre. Elle doit être professionnelle sans gommer tes singularités.</p>
              <div className="space-y-2 text-sm">
                <p>☐ Je suis un minimum sérieux·se (pas une photo de soirée)</p>
                <p>☐ Je suis seul·e et sans accessoires inutiles</p>
                <p>☐ Je suis de face</p>
                <p>☐ On me voit jusqu'aux épaules</p>
                <p>☐ Le fond est clair de préférence</p>
                <p>☐ Cette photo me ressemble</p>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox checked={photoDone} onCheckedChange={v => setPhotoDone(!!v)} />
                <span className="text-sm">✅ Ma photo de profil est à jour</span>
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* Section 4: Banner */}
          <AccordionItem value="banner" className="rounded-xl border border-border bg-card px-5">
            <AccordionTrigger className="font-display text-base font-bold">4. Ta bannière</AccordionTrigger>
            <AccordionContent className="space-y-4 pb-5">
              <p className="text-sm text-muted-foreground">La bannière permet au visiteur de comprendre immédiatement ton univers.</p>
              <div className="rounded-xl bg-rose-pale p-4 text-sm">
                <p>💡 Ressources :</p>
                <p>Photos libres de droit : <a href="https://unsplash.com" target="_blank" rel="noopener noreferrer" className="text-primary underline">Unsplash</a></p>
                <p>Templates : utilise <a href="https://canva.com" target="_blank" rel="noopener noreferrer" className="text-primary underline">Canva</a> pour créer une bannière à tes couleurs</p>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox checked={bannerDone} onCheckedChange={v => setBannerDone(!!v)} />
                <span className="text-sm">✅ Ma bannière est à jour</span>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        <Button onClick={save} className="mt-8 rounded-pill gap-2">💾 Enregistrer mon profil</Button>
      </main>
    </div>
  );
}
