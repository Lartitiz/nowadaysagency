import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import { Button } from "@/components/ui/button";
import { InputWithVoice as Input } from "@/components/ui/input-with-voice";
import { TextareaWithVoice as Textarea } from "@/components/ui/textarea-with-voice";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Sparkles, Copy, Trash2 } from "lucide-react";

interface BoardOption { id: string; name: string; }
interface Pin { id?: string; subject: string; board_id: string; link_url: string; title: string; description: string; variant_type: string; }
interface PinVariant { title: string; description: string; }

export default function PinterestEpingles() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [boards, setBoards] = useState<BoardOption[]>([]);
  const [pins, setPins] = useState<Pin[]>([]);
  // Generator state
  const [subject, setSubject] = useState("");
  const [boardId, setBoardId] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [variants, setVariants] = useState<PinVariant[]>([]);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const [bRes, pRes] = await Promise.all([
        supabase.from("pinterest_boards").select("id, name").eq("user_id", user.id).order("sort_order"),
        supabase.from("pinterest_pins").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
      ]);
      if (bRes.data) setBoards(bRes.data);
      if (pRes.data) setPins(pRes.data.map((d: any) => ({ id: d.id, subject: d.subject || "", board_id: d.board_id || "", link_url: d.link_url || "", title: d.title || "", description: d.description || "", variant_type: d.variant_type || "seo" })));
    };
    load();
  }, [user?.id]);

  const generatePin = async () => {
    if (!subject.trim()) return;
    setGenerating(true);
    try {
      const boardName = boards.find(b => b.id === boardId)?.name || "";
      const res = await supabase.functions.invoke("pinterest-ai", { body: { action: "pin", subject, board_name: boardName } });
      if (res.error) throw new Error(res.error.message);
      const c = res.data?.content || "";
      let parsed: PinVariant[];
      try { parsed = JSON.parse(c); } catch { const m = c.match(/\[[\s\S]*\]/); parsed = m ? JSON.parse(m[0]) : []; }
      setVariants(parsed);
    } catch (e: any) { toast({ title: "Erreur", description: e.message, variant: "destructive" }); }
    finally { setGenerating(false); }
  };

  const savePin = async (variant: PinVariant, variantType: string) => {
    if (!user) return;
    const { data } = await supabase.from("pinterest_pins").insert({
      user_id: user.id, subject, board_id: boardId || null, link_url: linkUrl,
      title: variant.title, description: variant.description, variant_type: variantType,
    }).select("*").single();
    if (data) setPins(prev => [{ id: data.id, subject: data.subject || "", board_id: data.board_id || "", link_url: data.link_url || "", title: data.title || "", description: data.description || "", variant_type: data.variant_type || "seo" }, ...prev]);
    toast({ title: "✅ Épingle sauvegardée !" });
  };

  const deletePin = async (id: string) => {
    await supabase.from("pinterest_pins").delete().eq("id", id);
    setPins(prev => prev.filter(p => p.id !== id));
    toast({ title: "Épingle supprimée" });
  };

  const copyText = (text: string) => { navigator.clipboard.writeText(text); toast({ title: "📋 Copié !" }); };

  const VARIANT_LABELS = ["SEO", "Storytelling", "Bénéfice"];
  const VARIANT_KEYS = ["seo", "storytelling", "benefice"];

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-6 py-8 max-md:px-4">
        <SubPageHeader parentTo="/pinterest" parentLabel="Pinterest" currentLabel="Mes épingles" />
        <h1 className="font-display text-[22px] font-bold text-foreground mb-1">Tes épingles</h1>
        <p className="text-sm text-muted-foreground italic mb-6">Chaque épingle est une porte d'entrée vers ton site. On va les optimiser pour qu'elles travaillent pour toi.</p>

        {/* Guide */}
        <div className="rounded-xl bg-rose-pale p-5 text-sm mb-6 space-y-1">
          <p className="font-semibold">📌 Pour chaque épingle :</p>
          <p>• Format vertical recommandé : 1000×1500px</p>
          <p>• Un titre court avec tes mots-clés</p>
          <p>• Un lien vers ta boutique ou ton site (très important)</p>
          <p>• Une description avec des mots-clés pour le SEO</p>
          <p>• Pas de # sur Pinterest (contrairement à Instagram)</p>
        </div>

        {/* Generator */}
        <section className="rounded-xl border border-border bg-card p-5 space-y-4 mb-8">
          <h3 className="font-display text-base font-bold">✨ Créer une épingle optimisée</h3>
          <Input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Ex : Mon tote bag en lin fait main" />
          {boards.length > 0 && (
            <Select value={boardId} onValueChange={setBoardId}>
              <SelectTrigger><SelectValue placeholder="Tableau de destination" /></SelectTrigger>
              <SelectContent>{boards.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
            </Select>
          )}
          <Input value={linkUrl} onChange={e => setLinkUrl(e.target.value)} placeholder="https://ton-site.com/produit" />
          <Button onClick={generatePin} disabled={generating} className="gap-2 rounded-pill"><Sparkles className="h-4 w-4" />{generating ? "Génération..." : "✨ Générer titre + description"}</Button>

          {variants.length > 0 && (
            <Tabs defaultValue="0" className="mt-4">
              <TabsList>{VARIANT_LABELS.map((l, i) => <TabsTrigger key={i} value={String(i)}>{l}</TabsTrigger>)}</TabsList>
              {variants.map((v, i) => (
                <TabsContent key={i} value={String(i)} className="space-y-3">
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">Titre</label>
                    <div className="flex items-center gap-2">
                      <Input value={v.title} readOnly className="flex-1" />
                      <Button variant="ghost" size="sm" onClick={() => copyText(v.title)}><Copy className="h-3 w-3" /></Button>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">Description</label>
                    <Textarea value={v.description} readOnly className="min-h-[120px]" />
                    <Button variant="ghost" size="sm" onClick={() => copyText(v.description)} className="mt-1"><Copy className="h-3 w-3" /> Copier</Button>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => savePin(v, VARIANT_KEYS[i])} className="rounded-pill gap-2">💾 Sauvegarder cette épingle</Button>
                </TabsContent>
              ))}
            </Tabs>
          )}
        </section>

        {/* Saved pins */}
        <section>
          <h3 className="font-display text-base font-bold mb-3">Mes épingles sauvegardées</h3>
          <p className="text-sm text-muted-foreground mb-4">Tu as {pins.length} épingle{pins.length !== 1 ? "s" : ""}. On recommande au moins 10 pour lancer ta présence.</p>
          <div className="space-y-3">
            {pins.map(p => (
              <div key={p.id} className="rounded-xl border border-border p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-bold text-foreground">{p.title || p.subject}</span>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={() => copyText(`${p.title}\n\n${p.description}`)}><Copy className="h-3 w-3" /></Button>
                    <Button variant="ghost" size="sm" onClick={() => p.id && deletePin(p.id)}><Trash2 className="h-3 w-3 text-muted-foreground" /></Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2">{p.description}</p>
                {p.link_url && <p className="text-xs text-primary mt-1 truncate">{p.link_url}</p>}
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
