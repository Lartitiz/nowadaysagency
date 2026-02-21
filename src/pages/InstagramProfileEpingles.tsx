import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Sparkles, Copy, Check, Loader2, CalendarDays } from "lucide-react";
import AuditInsight from "@/components/AuditInsight";

interface PinnedPost {
  id?: string;
  post_type: string;
  has_existing: boolean;
  existing_description: string;
  generated_accroche: string;
  generated_content: string;
  generated_format: string;
  is_pinned: boolean;
}

const POST_TYPES = [
  { type: "histoire", emoji: "📖", label: "Ton histoire", desc: "Un post qui raconte qui tu es et pourquoi tu fais ce que tu fais. C'est ton storytelling condensé." },
  { type: "offre", emoji: "🎁", label: "Ton offre", desc: "Un post qui présente clairement ce que tu proposes. C'est ta vitrine produit/service." },
  { type: "preuve", emoji: "⭐", label: "La preuve sociale", desc: "Un témoignage, un avant/après, un résultat concret. C'est la réassurance." },
];

export default function InstagramProfileEpingles() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [posts, setPosts] = useState<PinnedPost[]>(
    POST_TYPES.map(t => ({
      post_type: t.type,
      has_existing: false,
      existing_description: "",
      generated_accroche: "",
      generated_content: "",
      generated_format: "",
      is_pinned: false,
    }))
  );
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const loadData = async () => {
      const [pinnedRes] = await Promise.all([
        supabase.from("instagram_pinned_posts").select("*").eq("user_id", user.id),
      ]);
      if (pinnedRes.data && pinnedRes.data.length > 0) {
        setPosts(POST_TYPES.map(t => {
          const existing = pinnedRes.data.find((p: any) => p.post_type === t.type);
          return existing ? {
            id: existing.id,
            post_type: existing.post_type,
            has_existing: existing.has_existing ?? false,
            existing_description: existing.existing_description ?? "",
            generated_accroche: existing.generated_accroche ?? "",
            generated_content: existing.generated_content ?? "",
            generated_format: existing.generated_format ?? "",
            is_pinned: existing.is_pinned ?? false,
          } : {
            post_type: t.type, has_existing: false, existing_description: "",
            generated_accroche: "", generated_content: "", generated_format: "", is_pinned: false,
          };
        }));
      }
    };
    loadData();
  }, [user]);

  const handleGenerateAll = async () => {
    if (!user) return;
    setGenerating(true);
    try {
      const res = await supabase.functions.invoke("generate-content", {
        body: { type: "instagram-pinned", profile: {} },
      });
      if (res.error) throw new Error(res.error.message);
      const content = res.data?.content || "";
      let parsed: any;
      try {
        parsed = JSON.parse(content);
      } catch {
        const match = content.match(/\{[\s\S]*\}/);
        if (match) parsed = JSON.parse(match[0]);
        else throw new Error("Format inattendu");
      }

      const mapping: Record<string, string> = { post_histoire: "histoire", post_offre: "offre", post_preuve: "preuve" };
      const updated = posts.map(p => {
        const key = Object.keys(mapping).find(k => mapping[k] === p.post_type);
        const gen = key ? parsed[key] : null;
        if (gen) {
          return {
            ...p,
            generated_accroche: gen.accroche || "",
            generated_content: gen.contenu || "",
            generated_format: gen.format || "",
          };
        }
        return p;
      });
      setPosts(updated);

      // Save to DB
      for (const p of updated) {
        if (p.id) {
          await supabase.from("instagram_pinned_posts").update({
            generated_accroche: p.generated_accroche,
            generated_content: p.generated_content,
            generated_format: p.generated_format,
          }).eq("id", p.id);
        } else {
          const { data } = await supabase.from("instagram_pinned_posts").insert({
            user_id: user.id, ...p,
          }).select("id").single();
          if (data) p.id = data.id;
        }
      }

      toast({ title: "Posts épinglés générés !" });
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  const copyText = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  const togglePinned = async (idx: number) => {
    if (!user) return;
    const updated = [...posts];
    updated[idx].is_pinned = !updated[idx].is_pinned;
    setPosts(updated);
    if (updated[idx].id) {
      await supabase.from("instagram_pinned_posts").update({ is_pinned: updated[idx].is_pinned }).eq("id", updated[idx].id);
    }
  };

  const addToCalendar = async (post: PinnedPost) => {
    if (!user) return;
    const { error } = await supabase.from("calendar_posts").insert({
      user_id: user.id,
      canal: "instagram",
      date: new Date().toISOString().split("T")[0],
      theme: `Post épinglé : ${post.post_type}`,
      angle: post.generated_accroche,
      notes: post.generated_content,
      status: "idea",
    });
    if (error) toast({ title: "Erreur", description: error.message, variant: "destructive" });
    else toast({ title: "Ajouté au calendrier !" });
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-6 py-8 max-md:px-4">
        <SubPageHeader parentLabel="Mon profil" parentTo="/instagram/profil" currentLabel="Posts épinglés" />

        <h1 className="font-display text-[26px] font-bold text-foreground">📌 Mes posts épinglés</h1>
        <p className="mt-2 text-sm text-muted-foreground mb-6">
          Tes 3 posts épinglés, c'est ta vitrine. C'est la première chose que voit quelqu'un qui arrive sur ton profil.
        </p>

        <AuditInsight section="epingles" />
        <div className="rounded-2xl border border-border bg-card p-5 mb-6">
          <span className="inline-block font-mono-ui text-[11px] font-semibold uppercase tracking-wider bg-jaune text-[#2D2235] px-3 py-1 rounded-pill mb-3">
            📖 Stratégie recommandée
          </span>
          <div className="space-y-3">
            {POST_TYPES.map(t => (
              <div key={t.type} className="flex gap-3">
                <span className="text-lg">{t.emoji}</span>
                <div>
                  <p className="text-sm font-bold text-foreground">{t.label}</p>
                  <p className="text-xs text-muted-foreground">{t.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <Button onClick={handleGenerateAll} disabled={generating} className="w-full rounded-pill gap-2 mb-6">
          {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {generating ? "Génération..." : "✨ Créer mes 3 posts épinglés"}
        </Button>

        {/* Posts */}
        <div className="space-y-4">
          {posts.map((post, idx) => {
            const typeInfo = POST_TYPES.find(t => t.type === post.post_type)!;
            return (
              <div key={post.post_type} className="rounded-2xl border border-border bg-card p-5">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-lg">{typeInfo.emoji}</span>
                  <h3 className="font-display text-base font-bold text-foreground">{typeInfo.label}</h3>
                </div>

                {post.generated_content ? (
                  <div className="space-y-3">
                    <div className="rounded-xl bg-muted/50 p-4">
                      <p className="text-xs font-mono-ui uppercase text-muted-foreground mb-1">Accroche</p>
                      <p className="text-sm font-medium text-foreground">{post.generated_accroche}</p>
                    </div>
                    <div className="rounded-xl bg-muted/50 p-4">
                      <p className="text-xs font-mono-ui uppercase text-muted-foreground mb-1">Contenu</p>
                      <p className="text-sm text-foreground whitespace-pre-wrap">{post.generated_content}</p>
                    </div>
                    <p className="text-xs text-muted-foreground">📌 Format : {post.generated_format}</p>
                    <div className="flex gap-2 flex-wrap">
                      <Button
                        variant="outline" size="sm"
                        onClick={() => copyText(post.generated_accroche + "\n\n" + post.generated_content, post.post_type)}
                        className="rounded-pill gap-1.5"
                      >
                        {copied === post.post_type ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                        {copied === post.post_type ? "Copié" : "Copier"}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => addToCalendar(post)} className="rounded-pill gap-1.5">
                        <CalendarDays className="h-3.5 w-3.5" /> Calendrier
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground italic">Clique sur "Créer mes 3 posts" pour générer ce contenu.</p>
                )}

                <label className="flex items-center gap-2 mt-3 cursor-pointer">
                  <Checkbox checked={post.is_pinned} onCheckedChange={() => togglePinned(idx)} />
                  <span className="text-sm text-foreground">C'est épinglé sur mon profil</span>
                </label>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
