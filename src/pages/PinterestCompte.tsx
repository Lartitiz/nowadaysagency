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
import { Sparkles, Copy, Check } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";

export default function PinterestCompte() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { column, value } = useWorkspaceFilter();
  const workspaceId = useWorkspaceId();
  const [profileId, setProfileId] = useState<string | null>(null);
  const [proAccountDone, setProAccountDone] = useState(false);
  const [photoDone, setPhotoDone] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [nameDone, setNameDone] = useState(false);
  const [bio, setBio] = useState("");
  const [bioDone, setBioDone] = useState(false);
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [urlDone, setUrlDone] = useState(false);
  const [propValue, setPropValue] = useState<string | null>(null);
  const [nameSuggestions, setNameSuggestions] = useState<string[]>([]);
  const [bioSuggestions, setBioSuggestions] = useState<string[]>([]);
  const [generatingName, setGeneratingName] = useState(false);
  const [generatingBio, setGeneratingBio] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const completedCount = [proAccountDone, photoDone, nameDone, bioDone, urlDone].filter(Boolean).length;

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const [ppRes, propRes] = await Promise.all([
        (supabase.from("pinterest_profile") as any).select("*").eq(column, value).maybeSingle(),
        (supabase.from("brand_proposition") as any).select("version_final, version_short").eq(column, value).maybeSingle(),
      ]);
      if (ppRes.data) {
        const d = ppRes.data;
        setProfileId(d.id);
        setProAccountDone(d.pro_account_done || false);
        setPhotoDone(d.photo_done || false);
        setDisplayName(d.display_name || "");
        setNameDone(d.name_done || false);
        setBio(d.bio || "");
        setBioDone(d.bio_done || false);
        setWebsiteUrl(d.website_url || "");
        setUrlDone(d.url_done || false);
      }
      if (propRes.data) setPropValue(propRes.data.version_short || propRes.data.version_final || null);
    };
    load();
  }, [user?.id]);

  const save = async () => {
    if (!user) return;
    const payload = { user_id: user.id, workspace_id: workspaceId !== user.id ? workspaceId : undefined, pro_account_done: proAccountDone, photo_done: photoDone, display_name: displayName, name_done: nameDone, bio, bio_done: bioDone, website_url: websiteUrl, url_done: urlDone, updated_at: new Date().toISOString() };
    if (profileId) {
      await supabase.from("pinterest_profile").update(payload).eq("id", profileId);
    } else {
      const { data } = await supabase.from("pinterest_profile").insert(payload).select("id").single();
      if (data) setProfileId(data.id);
    }
    toast({ title: "✅ Compte sauvegardé !" });
  };

  const generateName = async () => {
    setGeneratingName(true);
    try {
      const res = await supabase.functions.invoke("pinterest-ai", { body: { action: "name" } });
      if (res.error) throw new Error(res.error.message);
      const c = res.data?.content || "";
      let parsed: string[];
      try { parsed = JSON.parse(c); } catch { const m = c.match(/\[[\s\S]*\]/); parsed = m ? JSON.parse(m[0]) : []; }
      setNameSuggestions(parsed);
    } catch (e: any) { toast({ title: "Erreur", description: e.message, variant: "destructive" }); }
    finally { setGeneratingName(false); }
  };

  const generateBio = async () => {
    setGeneratingBio(true);
    try {
      const res = await supabase.functions.invoke("pinterest-ai", { body: { action: "bio" } });
      if (res.error) throw new Error(res.error.message);
      const c = res.data?.content || "";
      let parsed: string[];
      try { parsed = JSON.parse(c); } catch { const m = c.match(/\[[\s\S]*\]/); parsed = m ? JSON.parse(m[0]) : []; }
      setBioSuggestions(parsed);
    } catch (e: any) { toast({ title: "Erreur", description: e.message, variant: "destructive" }); }
    finally { setGeneratingBio(false); }
  };

  const copyText = (text: string, key: string) => { navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(null), 2000); };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-6 py-8 max-md:px-4">
        <SubPageHeader parentTo="/pinterest" parentLabel="Pinterest" currentLabel="Optimiser mon compte" />

         <h1 className="font-display text-[22px] font-bold text-foreground mb-1">Optimise ton compte Pinterest</h1>
         <p className="mt-1 text-[15px] text-muted-foreground mb-8">Configure ton compte pro, ta photo, ton nom et ta bio pour que Pinterest te mette en avant.</p>

        <div className="space-y-6">
          {/* 1. Pro account */}
          <section className="rounded-xl border border-border bg-card p-5 space-y-3">
            <h3 className="font-display text-base font-bold">1. Passe en compte professionnel</h3>
            <p className="text-sm text-muted-foreground">Le compte pro te donne accès aux statistiques et aux formats enrichis.</p>
            <Collapsible>
              <CollapsibleTrigger className="flex items-center gap-1 text-xs text-primary hover:underline"><ChevronDown className="h-3 w-3" /> Comment faire</CollapsibleTrigger>
              <CollapsibleContent className="mt-2 text-sm text-muted-foreground">Va dans Paramètres → Compte professionnel. Tu peux soit créer un compte pro, soit convertir ton compte perso.</CollapsibleContent>
            </Collapsible>
            <div className="flex items-center gap-2"><Checkbox checked={proAccountDone} onCheckedChange={v => setProAccountDone(!!v)} /><span className="text-sm">✅ Mon compte est en mode professionnel</span></div>
          </section>

          {/* 2. Photo */}
          <section className="rounded-xl border border-border bg-card p-5 space-y-3">
            <h3 className="font-display text-base font-bold">2. Ta photo de profil</h3>
            <p className="text-sm text-muted-foreground">Soit ton logo, soit une photo de toi. Claire et alignée avec ton univers.</p>
            <div className="flex items-center gap-2"><Checkbox checked={photoDone} onCheckedChange={v => setPhotoDone(!!v)} /><span className="text-sm">✅ Ma photo de profil est à jour</span></div>
          </section>

          {/* 3. Name */}
          <section className="rounded-xl border border-border bg-card p-5 space-y-3">
            <h3 className="font-display text-base font-bold">3. Ton nom + mot-clé</h3>
            <p className="text-sm text-muted-foreground">Sur Pinterest, ton nom apparaît partout. Ajoute un mot-clé principal pour être trouvée.</p>
            <div className="rounded-xl bg-rose-pale p-4 text-sm space-y-1.5">
              <span className="inline-block font-mono-ui text-[10px] font-semibold uppercase tracking-wider bg-jaune text-[#2D2235] px-2.5 py-0.5 rounded-pill mb-1">📖 Exemple</span>
              <p className="text-muted-foreground">Format : [Prénom] — [Mot-clé principal]</p>
              <p className="italic text-[#6B5E7B] border-l-[3px] border-l-primary pl-3">Ex : "Lucie — Céramique artisanale & déco éthique"</p>
            </div>
            <Input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Ton prénom — Mot-clé principal" />
            <Button variant="outline" onClick={generateName} disabled={generatingName} className="gap-2 rounded-pill"><Sparkles className="h-4 w-4" />{generatingName ? "Génération..." : "✨ Suggérer un nom optimisé"}</Button>
            {nameSuggestions.length > 0 && (
              <div className="space-y-2">{nameSuggestions.map((s, i) => (
                <div key={i} className="flex items-center gap-2 rounded-lg bg-muted/50 p-3">
                  <p className="flex-1 text-sm">{s}</p>
                  <button onClick={() => { setDisplayName(s); copyText(s, `n${i}`); }} className="text-xs text-primary hover:underline flex items-center gap-1">{copied === `n${i}` ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}{copied === `n${i}` ? "Copié" : "Utiliser"}</button>
                </div>
              ))}</div>
            )}
            <div className="flex items-center gap-2"><Checkbox checked={nameDone} onCheckedChange={v => setNameDone(!!v)} /><span className="text-sm">✅ Mon nom est optimisé</span></div>
          </section>

          {/* 4. Bio */}
          <section className="rounded-xl border border-border bg-card p-5 space-y-3">
            <h3 className="font-display text-base font-bold">4. Ta bio</h3>
            <p className="text-sm text-muted-foreground">Une phrase : qui tu es, ce que tu proposes, à qui tu t'adresses.</p>
            <div className="rounded-xl bg-rose-pale p-4 text-sm space-y-1.5">
              <span className="inline-block font-mono-ui text-[10px] font-semibold uppercase tracking-wider bg-jaune text-[#2D2235] px-2.5 py-0.5 rounded-pill mb-1">📖 Exemple</span>
              <p className="italic text-[#6B5E7B] border-l-[3px] border-l-primary pl-3">Ex : "Créatrice de pièces artisanales en cuir végétal 🌿 Pour un quotidien slow & élégant."</p>
            </div>
            {propValue && <div className="rounded-xl bg-accent/30 border border-accent p-4 text-sm">💡 Ta proposition de valeur : "<strong>{propValue}</strong>" — tu peux l'adapter pour Pinterest !</div>}
            <Button variant="outline" onClick={generateBio} disabled={generatingBio} className="gap-2 rounded-pill"><Sparkles className="h-4 w-4" />{generatingBio ? "Génération..." : "✨ Générer ma bio Pinterest"}</Button>
            {bioSuggestions.length > 0 && (
              <div className="space-y-2">{bioSuggestions.map((s, i) => (
                <div key={i} className="flex items-center gap-2 rounded-lg bg-muted/50 p-3">
                  <p className="flex-1 text-sm">{s}</p>
                  <button onClick={() => { setBio(s); copyText(s, `b${i}`); }} className="text-xs text-primary hover:underline flex items-center gap-1">{copied === `b${i}` ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}{copied === `b${i}` ? "Copié" : "Utiliser"}</button>
                </div>
              ))}</div>
            )}
            <Textarea value={bio} onChange={e => setBio(e.target.value)} placeholder="Ma bio Pinterest..." className="min-h-[60px]" />
            <div className="flex items-center gap-2"><Checkbox checked={bioDone} onCheckedChange={v => setBioDone(!!v)} /><span className="text-sm">✅ Ma bio est à jour</span></div>
          </section>

          {/* 5. URL */}
          <section className="rounded-xl border border-border bg-card p-5 space-y-3">
            <h3 className="font-display text-base font-bold">5. Ton URL</h3>
            <p className="text-sm text-muted-foreground">Ajoute le lien vers ton site ou ta boutique. C'est le but de Pinterest : ramener du trafic.</p>
            <Input value={websiteUrl} onChange={e => setWebsiteUrl(e.target.value)} placeholder="https://ton-site.com" />
            <div className="flex items-center gap-2"><Checkbox checked={urlDone} onCheckedChange={v => setUrlDone(!!v)} /><span className="text-sm">✅ Mon URL est ajoutée</span></div>
          </section>
        </div>

        <Button onClick={save} className="mt-8 rounded-pill gap-2">💾 Enregistrer mon compte</Button>
      </main>
    </div>
  );
}
