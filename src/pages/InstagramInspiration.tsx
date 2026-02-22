import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import AppHeader from "@/components/AppHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InputWithVoice as Input } from "@/components/ui/input-with-voice";
import { TextareaWithVoice as Textarea } from "@/components/ui/textarea-with-voice";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Search, Eye, MessageSquare, Repeat, Sparkles, Check } from "lucide-react";
import SubPageHeader from "@/components/SubPageHeader";

const TONE_OPTIONS = ["Éducatif", "Inspirant", "Humoristique", "Storytelling", "Provocateur", "Doux", "Direct", "Poétique"];

interface AccountData {
  id?: string;
  account_handle: string;
  appeal: string;
  frequent_formats: string;
  top_engagement: string;
  tone: string[];
}

const EMPTY_ACCOUNT: AccountData = {
  account_handle: "",
  appeal: "",
  frequent_formats: "",
  top_engagement: "",
  tone: [],
};

export default function InstagramInspiration() {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<AccountData[]>([
    { ...EMPTY_ACCOUNT },
    { ...EMPTY_ACCOUNT },
    { ...EMPTY_ACCOUNT },
  ]);
  const [notes, setNotes] = useState("");
  const [notesId, setNotesId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Load data
  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const [accRes, notesRes] = await Promise.all([
        supabase.from("inspiration_accounts").select("*").eq("user_id", user.id).order("slot_index"),
        supabase.from("inspiration_notes").select("*").eq("user_id", user.id).limit(1),
      ]);

      if (accRes.data) {
        const mapped = [0, 1, 2].map((i) => {
          const row = accRes.data.find((r) => r.slot_index === i + 1);
          return row
            ? {
                id: row.id,
                account_handle: row.account_handle,
                appeal: row.appeal ?? "",
                frequent_formats: row.frequent_formats ?? "",
                top_engagement: row.top_engagement ?? "",
                tone: row.tone ?? [],
              }
            : { ...EMPTY_ACCOUNT };
        });
        setAccounts(mapped);
      }

      if (notesRes.data && notesRes.data.length > 0) {
        setNotes(notesRes.data[0].content ?? "");
        setNotesId(notesRes.data[0].id);
      }
      setLoaded(true);
    };
    load();
  }, [user?.id]);

  const updateAccount = (index: number, field: keyof AccountData, value: any) => {
    setAccounts((prev) => prev.map((a, i) => (i === index ? { ...a, [field]: value } : a)));
  };

  const toggleTone = (index: number, tone: string) => {
    setAccounts((prev) =>
      prev.map((a, i) => {
        if (i !== index) return a;
        const has = a.tone.includes(tone);
        return { ...a, tone: has ? a.tone.filter((t) => t !== tone) : [...a.tone, tone] };
      })
    );
  };

  const save = useCallback(async () => {
    if (!user) return;
    setSaving(true);
    try {
      // Save accounts
      for (let i = 0; i < 3; i++) {
        const acc = accounts[i];
        const payload = {
          user_id: user.id,
          slot_index: i + 1,
          account_handle: acc.account_handle,
          appeal: acc.appeal,
          frequent_formats: acc.frequent_formats,
          top_engagement: acc.top_engagement,
          tone: acc.tone,
        };
        if (acc.id) {
          await supabase.from("inspiration_accounts").update(payload).eq("id", acc.id);
        } else if (acc.account_handle.trim()) {
          const { data } = await supabase.from("inspiration_accounts").insert(payload).select().single();
          if (data) setAccounts((prev) => prev.map((a, j) => (j === i ? { ...a, id: data.id } : a)));
        }
      }

      // Save notes
      if (notesId) {
        await supabase.from("inspiration_notes").update({ content: notes }).eq("id", notesId);
      } else if (notes.trim()) {
        const { data } = await supabase.from("inspiration_notes").insert({ user_id: user.id, content: notes }).select().single();
        if (data) setNotesId(data.id);
      }

      toast.success("Sauvegardé !");
    } catch {
      toast.error("Erreur lors de la sauvegarde");
    } finally {
      setSaving(false);
    }
  }, [user, accounts, notes, notesId]);

  if (!loaded) return null;

  const filledCount = accounts.filter((a) => a.account_handle.trim()).length;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-4xl px-6 py-8 max-md:px-4">
        <SubPageHeader parentLabel="Instagram" parentTo="/instagram" currentLabel="M'inspirer" />
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-[26px] font-bold text-foreground">🔍 M'inspirer</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Observe 3 comptes qui t'inspirent et note ce qui fonctionne chez eux.
            </p>
          </div>
          <Badge variant="secondary" className="shrink-0 mt-1">
            {filledCount}/3 comptes
          </Badge>
        </div>

        {/* Guide */}
        <Card className="mt-6 border-primary/20 bg-primary/5">
          <CardContent className="p-5">
            <h2 className="font-semibold text-foreground flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" /> Comment faire cet exercice ?
            </h2>
            <ol className="mt-3 space-y-2 text-sm text-muted-foreground list-decimal pl-5">
              <li>Choisis 3 comptes Instagram dans ta niche qui ont une audience engagée.</li>
              <li>Pour chacun, observe leur contenu pendant 5 minutes : formats, ton, sujets populaires.</li>
              <li>Remplis les fiches ci-dessous pour garder une trace de ce qui t'inspire.</li>
              <li>Note en bas ce que tu veux tester sur ton propre compte.</li>
            </ol>
          </CardContent>
        </Card>

        {/* 3 Account Cards */}
        <div className="mt-8 space-y-6">
          {accounts.map((acc, index) => (
            <Card key={index} className="overflow-hidden">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold">
                    {index + 1}
                  </div>
                  Compte {index + 1}
                  {acc.account_handle.trim() && (
                    <Check className="h-4 w-4 text-primary ml-auto" />
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Handle */}
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">@ du compte</Label>
                  <div className="relative mt-1">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      className="pl-9"
                      placeholder="ex: @nom_du_compte"
                      value={acc.account_handle}
                      onChange={(e) => updateAccount(index, "account_handle", e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  {/* Appeal */}
                  <div>
                    <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                      <Eye className="h-3 w-3" /> Ce qui m'attire
                    </Label>
                    <Textarea
                      className="mt-1 min-h-[70px]"
                      placeholder="Qu'est-ce qui te plaît dans ce compte ?"
                      value={acc.appeal}
                      onChange={(e) => updateAccount(index, "appeal", e.target.value)}
                    />
                  </div>

                  {/* Top engagement */}
                  <div>
                    <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                      <MessageSquare className="h-3 w-3" /> Post le plus engageant
                    </Label>
                    <Textarea
                      className="mt-1 min-h-[70px]"
                      placeholder="Décris le post qui a le plus de likes / commentaires"
                      value={acc.top_engagement}
                      onChange={(e) => updateAccount(index, "top_engagement", e.target.value)}
                    />
                  </div>
                </div>

                {/* Formats */}
                <div>
                  <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <Repeat className="h-3 w-3" /> Formats fréquents
                  </Label>
                  <Input
                    className="mt-1"
                    placeholder="ex: Carrousel, Reel, Story éducative..."
                    value={acc.frequent_formats}
                    onChange={(e) => updateAccount(index, "frequent_formats", e.target.value)}
                  />
                </div>

                {/* Tone tags */}
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Ton dominant</Label>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {TONE_OPTIONS.map((tone) => {
                      const selected = acc.tone.includes(tone);
                      return (
                        <button
                          key={tone}
                          type="button"
                          onClick={() => toggleTone(index, tone)}
                          className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                            selected
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border bg-card text-muted-foreground hover:border-primary/50"
                          }`}
                        >
                          {tone}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Notes */}
        <Card className="mt-8">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">📝 Ce que je veux tester</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              className="min-h-[120px]"
              placeholder="Note ici les idées que tu veux tester sur ton propre compte : formats, sujets, ton, façon de rédiger..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </CardContent>
        </Card>

        {/* Save */}
        <div className="mt-6 flex justify-end pb-12">
          <Button onClick={save} disabled={saving} size="lg">
            {saving ? "Sauvegarde..." : "💾 Sauvegarder"}
          </Button>
        </div>
      </main>
    </div>
  );
}
