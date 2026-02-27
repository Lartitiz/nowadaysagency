import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspaceFilter, useWorkspaceId } from "@/hooks/use-workspace-query";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, Loader2, Check, Plus, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";

interface SimpleOffer {
  name: string;
  description: string;
  target_price: string;
}

interface StructuredOffer {
  name: string;
  description: string;
  target: string;
  promise: string;
  includes: string[];
}

export default function OffersSimplePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { column, value } = useWorkspaceFilter();
  const workspaceId = useWorkspaceId();
  const queryClient = useQueryClient();

  const [offers, setOffers] = useState<SimpleOffer[]>([{ name: "", description: "", target_price: "" }]);
  const [generating, setGenerating] = useState(false);
  const [results, setResults] = useState<StructuredOffer[] | null>(null);
  const [validated, setValidated] = useState(false);
  const [existingIds, setExistingIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data: rows } = await (supabase.from("offers") as any)
        .select("*").eq(column, value).order("created_at", { ascending: true });
      if (rows?.length > 0) {
        setOffers(rows.map((r: any) => ({
          name: r.name || "",
          description: r.description || "",
          target_price: `${r.target_ideal || ""} ${r.price_text || ""}`.trim(),
        })));
        setExistingIds(rows.map((r: any) => r.id));
        if (rows.some((r: any) => r.promise)) {
          setResults(rows.map((r: any) => ({
            name: r.name,
            description: r.description || "",
            target: r.target_ideal || "",
            promise: r.promise || "",
            includes: r.includes || [],
          })));
          setValidated(true);
        }
      }
      setLoading(false);
    };
    load();
  }, [user?.id]);

  const addOffer = () => {
    if (offers.length >= 6) { toast.info("Maximum 6 offres"); return; }
    setOffers([...offers, { name: "", description: "", target_price: "" }]);
  };

  const removeOffer = (idx: number) => {
    setOffers(offers.filter((_, i) => i !== idx));
  };

  const updateOffer = (idx: number, field: keyof SimpleOffer, val: string) => {
    const updated = [...offers];
    updated[idx] = { ...updated[idx], [field]: val };
    setOffers(updated);
  };

  const handleGenerate = async () => {
    const filled = offers.filter(o => o.name.trim());
    if (filled.length === 0) { toast.info("Ajoute au moins une offre avec un nom."); return; }
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("branding-structure-ai", {
        body: { section: "offers", input: { offers: filled } },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setResults(data.result?.offers || []);
      setValidated(false);
    } catch (e: any) {
      toast.error(e.message || "Oups, réessaie !");
    } finally {
      setGenerating(false);
    }
  };

  const handleValidate = async () => {
    if (!results || !user) return;
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const payload: any = {
        name: r.name,
        description: r.description,
        target_ideal: r.target,
        promise: r.promise,
        includes: r.includes,
        completed: true,
        updated_at: new Date().toISOString(),
      };
      if (existingIds[i]) {
        await supabase.from("offers").update(payload as any).eq("id", existingIds[i]);
      } else {
        payload.user_id = user.id;
        payload.offer_type = "paid";
        if (workspaceId && workspaceId !== user.id) payload.workspace_id = workspaceId;
        const { data: ins } = await (supabase.from("offers") as any).insert(payload).select("id").single();
        if (ins) setExistingIds(prev => [...prev, ins.id]);
      }
    }
    setValidated(true);
    toast.success("Tes offres sont enregistrées ✓");
  };

  if (loading) return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-[640px] px-6 py-8 max-md:px-4">
        <SubPageHeader breadcrumbs={[{ label: "Mon identité", to: "/branding" }]} currentLabel="Mes offres" />

        <div className="flex items-center gap-3 mb-1">
          <span className="text-2xl">🎁</span>
          <h1 className="font-display text-[26px] text-foreground" style={{ fontWeight: 400 }}>Mes offres</h1>
        </div>

        {!results && (
          <div className="mt-6 space-y-4">
            {offers.map((offer, idx) => (
              <div key={idx} className="rounded-[20px] bg-white border border-border p-5 shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">Offre {idx + 1}</span>
                  {offers.length > 1 && (
                    <button onClick={() => removeOffer(idx)} className="text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <Input
                  value={offer.name}
                  onChange={(e) => updateOffer(idx, "name", e.target.value)}
                  placeholder="Nom de l'offre"
                  className="text-[15px] font-medium"
                />
                <Textarea
                  value={offer.description}
                  onChange={(e) => updateOffer(idx, "description", e.target.value)}
                  placeholder="C'est quoi en quelques mots ?"
                  rows={2}
                  className="text-sm"
                />
                <Textarea
                  value={offer.target_price}
                  onChange={(e) => updateOffer(idx, "target_price", e.target.value)}
                  placeholder="C'est pour qui et combien ?"
                  rows={2}
                  className="text-sm"
                />
              </div>
            ))}

            <button
              onClick={addOffer}
              className="flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 transition-colors mx-auto"
            >
              <Plus className="h-4 w-4" /> Ajouter une offre
            </button>

            <Button
              onClick={handleGenerate}
              disabled={generating || !offers.some(o => o.name.trim())}
              className="w-full h-12 rounded-full text-[15px] font-semibold gap-2"
              style={{ backgroundColor: "#fb3d80", color: "white" }}
            >
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {generating ? "Je structure tes offres..." : "Structurer mes offres ✨"}
            </Button>

            <button
              onClick={() => navigate("/branding/offres")}
              className="block mx-auto text-xs text-muted-foreground hover:text-foreground transition-colors mt-2"
            >
              Vue détaillée →
            </button>
          </div>
        )}

        {results && (
          <div className="mt-6 space-y-4">
            {results.map((offer, idx) => (
              <div key={idx} className="rounded-[20px] bg-white border border-border p-5 shadow-sm">
                <h3 className="font-display text-lg text-foreground mb-2" style={{ fontWeight: 400 }}>{offer.name}</h3>
                <p className="text-sm text-foreground leading-relaxed mb-3">{offer.description}</p>
                
                <div className="space-y-2 mb-3">
                  <div>
                    <p className="text-xs font-medium text-foreground">🎯 Pour qui</p>
                    <p className="text-xs text-muted-foreground">{offer.target}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-foreground">✨ Promesse</p>
                    <p className="text-xs text-muted-foreground">{offer.promise}</p>
                  </div>
                </div>

                {offer.includes?.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-foreground mb-1">📦 Ce qui est inclus</p>
                    <ul className="space-y-0.5">
                      {offer.includes.map((item, i) => (
                        <li key={i} className="text-xs text-muted-foreground">✓ {item}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}

            {!validated ? (
              <div className="flex gap-3">
                <Button onClick={handleValidate} className="flex-1 h-11 rounded-full gap-2" style={{ backgroundColor: "#fb3d80", color: "white" }}>
                  <Check className="h-4 w-4" /> C'est bon ✓
                </Button>
                <Button variant="outline" onClick={() => setResults(null)} className="flex-1 h-11 rounded-full gap-2">
                  <Pencil className="h-4 w-4" /> Modifier
                </Button>
              </div>
            ) : (
              <Button variant="outline" onClick={() => setResults(null)} className="w-full h-11 rounded-full gap-2">
                <Sparkles className="h-4 w-4" /> Regénérer
              </Button>
            )}

            <button
              onClick={() => navigate("/branding/offres")}
              className="block mx-auto text-xs text-muted-foreground hover:text-foreground transition-colors mt-2"
            >
              Vue détaillée →
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
