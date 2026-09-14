import { invokeWithTimeout } from "@/lib/invoke-with-timeout";
import { usePinterestEditor, usePinterestUi } from "@/hooks/use-pinterest-editor";
import PinterestSaveStatus from "@/components/pinterest/PinterestSaveStatus";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import { Button } from "@/components/ui/button";
import { TextareaWithVoice as Textarea } from "@/components/ui/textarea-with-voice";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { friendlyError } from "@/lib/error-messages";
import { Sparkles } from "lucide-react";
import AiGeneratedMention from "@/components/AiGeneratedMention";

export default function PinterestMotsCles() {
  const editor = usePinterestEditor("pinterest_keywords", { keywords_raw: "", keywords_product: [], keywords_need: [], keywords_inspiration: [], keywords_english: [], checklist_titles: false, checklist_board_desc: false, checklist_pin_titles: false, checklist_pin_desc: false, checklist_profile_name: false, checklist_bio: false });
  const row = editor.rows[0];
  const raw = row.keywords_raw || "";
  const setRaw = (value: string) => editor.setRows([{ ...row, keywords_raw: value }]);
  const generated = [row.keywords_product, row.keywords_need, row.keywords_inspiration, row.keywords_english].some(words => words?.length) ? { produit: row.keywords_product || [], besoin: row.keywords_need || [], inspiration: row.keywords_inspiration || [], anglais: row.keywords_english || [] } : null;
  const setGenerated = (value: any) => editor.setRows(rows => [{ ...rows[0], keywords_product: value.produit || [], keywords_need: value.besoin || [], keywords_inspiration: value.inspiration || [], keywords_english: value.anglais || [] }]);
  const [generating, setGenerating] = usePinterestUi(editor, `generating:${editor.key}`, false);
  const checklist = { titles: !!row.checklist_titles, boardDesc: !!row.checklist_board_desc, pinTitles: !!row.checklist_pin_titles, pinDesc: !!row.checklist_pin_desc, profileName: !!row.checklist_profile_name, bio: !!row.checklist_bio };
  const setChecklist = (fn: (value: typeof checklist) => typeof checklist) => {
    const next = fn(checklist);
    editor.setRows([{ ...row, checklist_titles: next.titles, checklist_board_desc: next.boardDesc, checklist_pin_titles: next.pinTitles, checklist_pin_desc: next.pinDesc, checklist_profile_name: next.profileName, checklist_bio: next.bio }]);
  };

  const generateKeywords = async () => {
    setGenerating(true);
    try {
      const res = await invokeWithTimeout("pinterest-ai", { body: { action: "keywords", workspace_id: editor.workspaceId || undefined } }, 60000);
      if (res.error) throw new Error(res.error.message);
      const c = res.data?.content || "";
      let parsed: any;
      try { parsed = JSON.parse(c); } catch { const m = c.match(/\{[\s\S]*\}/); parsed = m ? JSON.parse(m[0]) : null; }
      if (editor.isCurrent() && parsed) setGenerated(parsed);
    } catch (e: any) { console.error("Erreur technique:", e); if (editor.isCurrent()) toast.error("Erreur", { description: friendlyError(e) }); }
    finally { setGenerating(false); }
  };

  const save = () => editor.save(undefined, "✅ Mots-clés sauvegardés !");

  const renderCategory = (label: string, emoji: string, words: string[]) => (
    <div className="rounded-xl border border-border p-4">
      <h4 className="text-sm font-bold text-foreground mb-2">{emoji} {label}</h4>
      <div className="flex flex-wrap gap-1.5">{words.map((w, i) => <span key={i} className="font-mono-ui text-2xs bg-rose-pale text-bordeaux px-2 py-0.5 rounded-md">{w}</span>)}</div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-6 py-8 max-md:px-4">
        <PinterestSaveStatus editor={editor} />
        <fieldset disabled={editor.disabled || generating} className="min-w-0">
        <SubPageHeader parentTo="/pinterest" parentLabel="Pinterest" currentLabel="Mes mots-clés" useFromParam />
        <h1 className="font-display text-2xl font-bold text-foreground mb-1">Tes mots-clés Pinterest</h1>
        <p className="text-sm text-muted-foreground italic mb-6">Comment tes clientes décrivent tes produits ? Ces mots doivent être partout : titres, descriptions, tableaux.</p>

        <section className="space-y-4 mb-8">
          <h3 className="font-body text-base font-bold">Liste tes mots-clés</h3>
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
          <h3 className="font-body text-base font-bold">Où utiliser tes mots-clés</h3>
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
        </fieldset>
      </main>
    </div>
  );
}
