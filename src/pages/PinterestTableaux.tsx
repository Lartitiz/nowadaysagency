import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspaceFilter, useWorkspaceId } from "@/hooks/use-workspace-query";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import { Button } from "@/components/ui/button";
import { InputWithVoice as Input } from "@/components/ui/input-with-voice";
import { TextareaWithVoice as Textarea } from "@/components/ui/textarea-with-voice";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { friendlyError } from "@/lib/error-messages";
import { Sparkles, Plus, Trash2, Copy, Check } from "lucide-react";

const BOARD_TYPES = [
  { value: "principal", label: "Principal" },
  { value: "cadeaux", label: "Idées cadeaux" },
  { value: "educatif", label: "Éducatif" },
  { value: "inspiration", label: "Inspiration" },
  { value: "coulisses", label: "Coulisses" },
  { value: "autre", label: "Autre" },
];

interface Board { id?: string; name: string; description: string; board_type: string; }

export default function PinterestTableaux() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { column, value } = useWorkspaceFilter();
  const workspaceId = useWorkspaceId();
  const [boards, setBoards] = useState<Board[]>([]);
  const [generatingIdx, setGeneratingIdx] = useState<number | null>(null);
  const [copied, setCopied] = useState<number | null>(null);

  useEffect(() => {
    if (!user) return;
    (supabase.from("pinterest_boards") as any).select("*").eq("user_id", user.id).order("sort_order").then(({ data }: any) => {
      if (data && data.length > 0) setBoards(data.map(d => ({ id: d.id, name: d.name || "", description: d.description || "", board_type: d.board_type || "autre" })));
    });
  }, [user?.id]);

  const addBoard = () => setBoards(prev => [...prev, { name: "", description: "", board_type: "autre" }]);

  const updateBoard = (idx: number, field: keyof Board, value: string) => {
    setBoards(prev => { const next = [...prev]; next[idx] = { ...next[idx], [field]: value }; return next; });
  };

  const removeBoard = async (idx: number) => {
    const b = boards[idx];
    if (b.id) await supabase.from("pinterest_boards").delete().eq("id", b.id);
    setBoards(prev => prev.filter((_, i) => i !== idx));
    toast({ title: "Tableau supprimé" });
  };

  const optimizeDescription = async (idx: number) => {
    const b = boards[idx];
    if (!b.name.trim()) return;
    setGeneratingIdx(idx);
    try {
      const res = await supabase.functions.invoke("pinterest-ai", { body: { action: "board-description", board_name: b.name, board_type: b.board_type } });
      if (res.error) throw new Error(res.error.message);
      updateBoard(idx, "description", res.data?.content || "");
    } catch (e: any) { console.error("Erreur technique:", e); toast({ title: "Erreur", description: friendlyError(e), variant: "destructive" }); }
    finally { setGeneratingIdx(null); }
  };

  const saveAll = async () => {
    if (!user) return;
    await (supabase.from("pinterest_boards") as any).delete().eq("user_id", user.id);
    if (boards.length > 0) {
      await supabase.from("pinterest_boards").insert(boards.filter(b => b.name.trim()).map((b, i) => ({ user_id: user.id, name: b.name, description: b.description, board_type: b.board_type, sort_order: i })));
    }
    toast({ title: "✅ Tableaux sauvegardés !" });
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-6 py-8 max-md:px-4">
        <SubPageHeader parentTo="/pinterest" parentLabel="Pinterest" currentLabel="Mes tableaux" />
        <h1 className="font-display text-[22px] font-bold text-foreground mb-1">Tes tableaux Pinterest</h1>
        <p className="text-sm text-muted-foreground italic mb-6">Crée 3 à 5 tableaux en lien avec ton univers. Chaque tableau est une porte d'entrée vers ta marque.</p>

        <div className="rounded-xl bg-rose-pale p-5 text-sm mb-6 space-y-1">
          <p className="font-semibold">💡 Types de tableaux à créer :</p>
          <p>• Ton tableau principal : tes créations, tes produits</p>
          <p>• Un tableau "idées cadeaux" : pour capter les recherches saisonnières</p>
          <p>• Un tableau éducatif : conseils, tutos, astuces</p>
          <p>• Un tableau d'inspiration : ambiance, moodboard</p>
          <p>• Un tableau coulisses : fabrication, atelier, processus</p>
        </div>

        <p className="text-sm font-semibold text-foreground mb-4">Tu as {boards.length} tableau{boards.length !== 1 ? "x" : ""}. On recommande entre 3 et 5 pour commencer.</p>

        <div className="space-y-4">
          {boards.map((b, idx) => (
            <div key={idx} className="rounded-xl border border-border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-foreground">Tableau {idx + 1}</span>
                <Button variant="ghost" size="sm" onClick={() => removeBoard(idx)}><Trash2 className="h-4 w-4 text-muted-foreground" /></Button>
              </div>
              <Input value={b.name} onChange={e => updateBoard(idx, "name", e.target.value)} placeholder="Ex : Bijoux artisanaux minimalistes" />
              <Select value={b.board_type} onValueChange={v => updateBoard(idx, "board_type", v)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{BOARD_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
              <Textarea value={b.description} onChange={e => updateBoard(idx, "description", e.target.value)} placeholder="Description avec mots-clés pour le SEO Pinterest..." className="min-h-[80px]" />
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => optimizeDescription(idx)} disabled={generatingIdx === idx} className="rounded-pill gap-2">
                  <Sparkles className="h-4 w-4" />{generatingIdx === idx ? "Optimisation..." : "✨ Optimiser la description SEO"}
                </Button>
                {b.description && (
                  <Button variant="ghost" size="sm" onClick={() => { navigator.clipboard.writeText(b.description); setCopied(idx); setTimeout(() => setCopied(null), 2000); toast({ title: "📋 Copié !" }); }} className="gap-1">
                    {copied === idx ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />} Copier
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-3 mt-6">
          <Button variant="outline" onClick={addBoard} className="gap-2 rounded-pill"><Plus className="h-4 w-4" /> Ajouter un tableau</Button>
          <Button onClick={saveAll} className="rounded-pill gap-2">💾 Enregistrer</Button>
        </div>
      </main>
    </div>
  );
}
