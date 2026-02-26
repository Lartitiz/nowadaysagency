import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspaceFilter, useWorkspaceId } from "@/hooks/use-workspace-query";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import { Button } from "@/components/ui/button";
import { TextareaWithVoice as Textarea } from "@/components/ui/textarea-with-voice";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { friendlyError } from "@/lib/error-messages";
import { Sparkles } from "lucide-react";
import AiGeneratedMention from "@/components/AiGeneratedMention";

export default function PinterestMotsCles() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { column, value } = useWorkspaceFilter();
  const workspaceId = useWorkspaceId();
  const [kwId, setKwId] = useState<string | null>(null);
  const [raw, setRaw] = useState("");
  const [generated, setGenerated] = useState<{ produit: string[]; besoin: string[]; inspiration: string[]; anglais: string[] } | null>(null);
  const [generating, setGenerating] = useState(false);
  const [checklist, setChecklist] = useState({ titles: false, boardDesc: false, pinTitles: false, pinDesc: false, profileName: false, bio: false });

  useEffect(() => {
    if (!user) return;
    (supabase.from("pinterest_keywords") as any).select("*").eq(column, value).maybeSingle().then(({ data }: any) => {
      if (data) {
        setKwId(data.id);
        setRaw(data.keywords_raw || "");
        if (data.keywords_product?.length || data.keywords_need?.length) {
          setGenerated({ produit: data.keywords_product || [], besoin: data.keywords_need || [], inspiration: data.keywords_inspiration || [], anglais: data.keywords_english || [] });
        }
        setChecklist({ titles: data.checklist_titles || false, boardDesc: data.checklist_board_desc || false, pinTitles: data.checklist_pin_titles || false, pinDesc: data.checklist_pin_desc || false, profileName: data.checklist_profile_name || false, bio: data.checklist_bio || false });
      }
    });
  }, [user?.id]);

  const generateKeywords = async () => {
    setGenerating(true);
    try {
      const res = await supabase.functions.invoke("pinterest-ai", { body: { action: "keywords" } });
      if (res.error) throw new Error(res.error.message);
      const c = res.data?.content || "";
      let parsed: any;
      try { parsed = JSON.parse(c); } catch { const m = c.match(/\{[\s\S]*\}/); parsed = m ? JSON.parse(m[0]) : null; }
      if (parsed) setGenerated(parsed);
    } catch (e: any) { console.error("Erreur technique:", e); toast({ title: "Erreur", description: friendlyError(e), variant: "destructive" }); }
    finally { setGenerating(false); }
  };

  const save = async () => {
    if (!user) return;
    const payload: any = {
      user_id: user.id, workspace_id: workspaceId !== user.id ? workspaceId : undefined, keywords_raw: raw,
      keywords_product: generated?.produit || [], keywords_need: generated?.besoin || [],
      keywords_inspiration: generated?.inspiration || [], keywords_english: generated?.anglais || [],
      checklist_titles: checklist.titles, checklist_board_desc: checklist.boardDesc,
      checklist_pin_titles: checklist.pinTitles, checklist_pin_desc: checklist.pinDesc,
      checklist_profile_name: checklist.profileName, checklist_bio: checklist.bio,
      updated_at: new Date().toISOString(),
    };
    if (kwId) { await supabase.from("pinterest_keywords").update(payload).eq("id", kwId); }
    else { const { data } = await supabase.from("pinterest_keywords").insert(payload).select("id").single(); if (data) setKwId(data.id); }
    toast({ title: "✅ Mots-clés sauvegardés !" });
  };

  const renderCategory = (label: string, emoji: string, words: string[]) => (
    <div className="rounded-xl border border-border p-4">
      <h4 className="text-sm font-bold text-foreground mb-2">{emoji} {label}</h4>
      <div className="flex flex-wrap gap-1.5">{words.map((w, i) => <span key={i} className="font-mono-ui text-[11px] bg-rose-pale text-bordeaux px-2 py-0.5 rounded-md">{w}</span>)}</div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-6 py-8 max-md:px-4">
        <SubPageHeader parentTo="/pinterest" parentLabel="Pinterest" currentLabel="Mes mots-clés" useFromParam />
        <h1 className="font-display text-[22px] font-bold text-foreground mb-1">Tes mots-clés Pinterest</h1>
        <p className="text-sm text-muted-foreground italic mb-6">Comment tes clientes décrivent tes produits ? Ces mots doivent être partout : titres, descriptions, tableaux.</p>

        <section className="space-y-4 mb-8">
          <h3 className="font-display text-base font-bold">Liste tes mots-clés</h3>
          <Textarea value={raw} onChange={e => setRaw(e.target.value)} placeholder="sweat brodé, broderies tendances, vêtements uniques, personnalisation t-shirt..." className="min-h-[150px]" />
          <Button variant="outline" onClick={generateKeywords} disabled={generating} className="gap-2 rounded-pill"><Sparkles className="h-4 w-4" />{generating ? "Recherche..." : "✨ Trouver mes mots-clés"}</Button>
          {generated && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {renderCategory("Mots-clés produit", "🏷️", generated.produit)}
                {renderCategory("Mots-clés besoin", "🔍", generated.besoin)}
                {renderCategory("Mots-clés inspiration", "✨", generated.inspiration)}
                {renderCategory("Mots-clés en anglais", "🌍", generated.anglais)}
              </div>
              <AiGeneratedMention />
            </>
          )}
        </section>

        <div className="rounded-xl bg-rose-pale p-5 text-sm mb-8">
          <p className="font-semibold">📌 En panne d'inspiration ?</p>
          <p>Tape un de tes mots-clés sur Pinterest et regarde les suggestions que te propose la plateforme.</p>
          <a href="https://pinterest.com" target="_blank" rel="noopener noreferrer" className="text-primary underline mt-1 inline-block">Aller sur Pinterest →</a>
        </div>

        <section className="space-y-3 mb-8">
          <h3 className="font-display text-base font-bold">Où utiliser tes mots-clés</h3>
          {[
            { key: "titles" as const, label: "Dans le titre de mes tableaux" },
            { key: "boardDesc" as const, label: "Dans la description de mes tableaux" },
            { key: "pinTitles" as const, label: "Dans le titre de chaque épingle" },
            { key: "pinDesc" as const, label: "Dans la description de chaque épingle" },
            { key: "profileName" as const, label: "Dans mon nom de profil" },
            { key: "bio" as const, label: "Dans ma bio" },
          ].map(item => (
            <div key={item.key} className="flex items-center gap-2">
              <Checkbox checked={checklist[item.key]} onCheckedChange={v => setChecklist(prev => ({ ...prev, [item.key]: !!v }))} />
              <span className="text-sm">{item.label}</span>
            </div>
          ))}
        </section>

        <Button onClick={save} className="rounded-pill gap-2">💾 Enregistrer</Button>
      </main>
    </div>
  );
}
