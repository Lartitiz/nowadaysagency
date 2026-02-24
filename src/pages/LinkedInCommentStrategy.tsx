import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspaceFilter, useWorkspaceId } from "@/hooks/use-workspace-query";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import { Button } from "@/components/ui/button";
import { InputWithVoice as Input } from "@/components/ui/input-with-voice";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, MessageCircle } from "lucide-react";

interface CommentAccount {
  name: string;
  niche: string;
}

export default function LinkedInCommentStrategy() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { column, value } = useWorkspaceFilter();
  const workspaceId = useWorkspaceId();
  const [strategyId, setStrategyId] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<CommentAccount[]>([]);
  const [newName, setNewName] = useState("");
  const [newNiche, setNewNiche] = useState("");

  useEffect(() => {
    if (!user) return;
    (supabase
      .from("linkedin_comment_strategy" as any)
      .select("*")
      .eq(column, value)
      .maybeSingle() as any)
      .then(({ data }: any) => {
        if (data) {
          setStrategyId(data.id);
          setAccounts((data.accounts as unknown as CommentAccount[]) || []);
        }
      });
  }, [user?.id]);

  const save = async (newAccounts: CommentAccount[]) => {
    if (!user) return;
    const payload = { 
      user_id: user.id, 
      workspace_id: workspaceId !== user.id ? workspaceId : undefined,
      accounts: newAccounts as any, 
      updated_at: new Date().toISOString() 
    };
    if (strategyId) {
      await supabase.from("linkedin_comment_strategy").update(payload).eq("id", strategyId);
    } else {
      const { data } = await supabase.from("linkedin_comment_strategy").insert(payload).select("id").single();
      if (data) setStrategyId(data.id);
    }
  };

  const addAccount = () => {
    if (!newName.trim()) return;
    const updated = [...accounts, { name: newName.trim(), niche: newNiche.trim() }];
    setAccounts(updated);
    setNewName("");
    setNewNiche("");
    save(updated);
    toast({ title: "Compte ajouté !" });
  };

  const removeAccount = (idx: number) => {
    const updated = accounts.filter((_, i) => i !== idx);
    setAccounts(updated);
    save(updated);
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-6 py-8 max-md:px-4">
        <SubPageHeader parentTo="/linkedin" parentLabel="LinkedIn" currentLabel="Stratégie commentaires" />

        <div className="flex items-center gap-3 mb-2">
          <MessageCircle className="h-6 w-6 text-primary" />
          <h1 className="font-display text-[22px] font-bold text-foreground">Ma stratégie commentaires</h1>
        </div>
        <p className="text-sm text-muted-foreground mb-6">
          Commenter chez les autres = la stratégie la plus sous-estimée. 20-40 min/jour suffisent.
        </p>

        {/* Accounts list */}
        <div className="rounded-2xl border border-border bg-card p-6 mb-6">
          <h2 className="text-base font-bold text-foreground mb-4">Mes comptes à commenter régulièrement</h2>
          
          {accounts.length === 0 && (
            <p className="text-sm text-muted-foreground italic mb-4">Aucun compte ajouté. Commence par en ajouter 10-15.</p>
          )}

          <div className="space-y-2 mb-4">
            {accounts.map((acc, idx) => (
              <div key={idx} className="flex items-center gap-3 rounded-xl border border-border p-3">
                <span className="text-sm font-medium text-foreground flex-1">{acc.name}</span>
                {acc.niche && <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{acc.niche}</span>}
                <Button variant="ghost" size="sm" onClick={() => removeAccount(idx)}>
                  <Trash2 className="h-4 w-4 text-muted-foreground" />
                </Button>
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nom du compte" className="flex-1" onKeyDown={(e) => e.key === "Enter" && addAccount()} />
            <Input value={newNiche} onChange={(e) => setNewNiche(e.target.value)} placeholder="Niche (optionnel)" className="w-40" onKeyDown={(e) => e.key === "Enter" && addAccount()} />
            <Button onClick={addAccount} variant="outline" className="rounded-full gap-1.5">
              <Plus className="h-4 w-4" /> Ajouter
            </Button>
          </div>
        </div>

        {/* Tips */}
        <div className="rounded-xl bg-rose-pale p-5 text-sm space-y-2 mb-6">
          <p className="font-semibold">💡 Choisis 10-15 comptes dans ta niche :</p>
          <p className="text-muted-foreground">ESS, coopératives, com' responsable, enseignement, design, coaching, freelances, entrepreneuriat engagé.</p>
        </div>

        {/* Rules */}
        <div className="rounded-2xl border border-border bg-card p-6">
          <h2 className="text-base font-bold text-foreground mb-4">📝 Règles du bon commentaire</h2>
          <div className="space-y-2 text-sm">
            <p>✅ <strong>15+ mots</strong> : les commentaires courts sont ignorés par l'algo</p>
            <p>✅ <strong>Ajoute de la valeur</strong> : partage une expérience, un point de vue, une question de fond</p>
            <p>✅ <strong>Réponds aux réponses</strong> : conversation &gt; commentaire isolé</p>
            <p>❌ Pas de "super post !" ou "merci pour le partage"</p>
            <p>❌ Pas de pitch déguisé en commentaire</p>
            <p>❌ Pas de lien vers ton profil/offre</p>
          </div>
          <div className="mt-4 rounded-lg bg-primary/5 border border-primary/20 p-3 text-sm text-foreground">
            💡 Un commentaire de qualité chez quelqu'un avec 10K abonné·es peut t'apporter plus de visibilité qu'un de tes propres posts.
          </div>
        </div>
      </main>
    </div>
  );
}
