import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useParams, useNavigate, Link } from "react-router-dom";
import AppHeader from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { InputWithVoice as Input } from "@/components/ui/input-with-voice";
import { TextareaWithVoice as Textarea } from "@/components/ui/textarea-with-voice";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, Sparkles, Check, Pencil, Loader2, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAutoSave, SaveIndicator } from "@/hooks/use-auto-save";

const STEPS = [
  { num: 1, label: "Bases" },
  { num: 2, label: "Problème" },
  { num: 3, label: "Promesse" },
  { num: 4, label: "Bénéfices" },
  { num: 5, label: "Cible" },
  { num: 6, label: "Objections" },
  { num: 7, label: "Désirabilité" },
];

function computeCompletion(offer: any): number {
  let filled = 0;
  const total = 7;
  if (offer.name?.trim()) filled++;
  if (offer.problem_surface?.trim() || offer.problem_deep?.trim()) filled++;
  if (offer.promise?.trim()) filled++;
  if (offer.features && (Array.isArray(offer.features) ? offer.features.length > 0 : offer.features)) filled++;
  if (offer.target_ideal?.trim()) filled++;
  if (offer.objections && (Array.isArray(offer.objections) ? offer.objections.length > 0 : offer.objections)) filled++;
  if (offer.sales_line?.trim() || offer.emotional_after?.trim()) filled++;
  return Math.round((filled / total) * 100);
}

export default function OfferWorkshopPage() {
  const { user } = useAuth();
  const { id } = useParams();
  const navigate = useNavigate();
  const [offer, setOffer] = useState<any>(null);
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResponse, setAiResponse] = useState<any>(null);

  // Form fields per step
  const [formData, setFormData] = useState<Record<string, any>>({});
  const formDataRef = useRef(formData);
  formDataRef.current = formData;

  // Map formData keys to DB columns for auto-save
  const getDbFields = useCallback(() => {
    const fd = formDataRef.current;
    return {
      offer_type: fd.offer_type,
      name: fd.name,
      description_short: fd.description_short,
      price_text: fd.price_text,
      url_sales_page: fd.url_sales_page,
      url_booking: fd.url_booking,
      problem_surface: fd.problem_surface,
      problem_deep: fd.problem_deep,
      promise: fd.promise,
      features: fd.features_text ? fd.features_text.split("\n").filter((f: string) => f.trim()) : [],
      target_ideal: fd.target_ideal,
      target_not_for: fd.target_not_for,
      objections: fd.objections_text
        ? fd.objections_text.split("\n").filter((o: string) => o.trim()).map((o: string) => ({ objection: o, response: "" }))
        : [],
      testimonials: fd.testimonials || [],
    };
  }, []);

  const autoSaveFn = useCallback(async () => {
    if (!id || !user) return;
    const fields = getDbFields();
    await supabase.from("offers").update({
      ...fields,
      updated_at: new Date().toISOString(),
    }).eq("id", id);
  }, [id, user, getDbFields]);

  const { saved, saving: autoSaving, triggerSave } = useAutoSave(autoSaveFn, 1000);

  // Wrap setFormData to trigger auto-save on every change
  const updateFormData = useCallback((updater: (prev: Record<string, any>) => Record<string, any>) => {
    setFormData(prev => {
      const next = updater(prev);
      return next;
    });
    triggerSave();
  }, [triggerSave]);

  useEffect(() => {
    if (!user || !id || !loading) return;
    supabase.from("offers").select("*").eq("id", id).eq("user_id", user.id).single().then(({ data, error }) => {
      if (error || !data) { navigate("/branding/offres"); return; }
      setOffer(data);
      setStep(data.current_step || 1);
      setFormData({
        offer_type: data.offer_type || "paid",
        name: data.name || "",
        description_short: data.description_short || "",
        price_text: data.price_text || "",
        url_sales_page: data.url_sales_page || "",
        url_booking: data.url_booking || "",
        problem_surface: data.problem_surface || "",
        problem_deep: data.problem_deep || "",
        promise: data.promise || "",
        features_text: Array.isArray(data.features) ? data.features.join("\n") : "",
        target_ideal: data.target_ideal || "",
        target_not_for: data.target_not_for || "",
        objections_text: Array.isArray(data.objections) ? data.objections.map((o: any) => o.objection).join("\n") : "",
        testimonials: data.testimonials || [],
      });
      setLoading(false);
    });
  }, [user?.id, id]);

  const save = useCallback(async (fields: Record<string, any>, nextStep?: number) => {
    if (!id || !user) return;
    setSaving(true);
    const update: any = { ...fields, updated_at: new Date().toISOString() };
    if (nextStep) update.current_step = nextStep;
    // Compute completion
    const merged = { ...offer, ...update };
    update.completion_pct = computeCompletion(merged);
    if (update.completion_pct === 100) update.completed = true;

    const { error } = await supabase.from("offers").update(update).eq("id", id);
    if (error) toast.error("Erreur de sauvegarde");
    else setOffer((prev: any) => ({ ...prev, ...update }));
    setSaving(false);
  }, [id, user, offer]);

  const askAI = async (stepNum: number, answer: string) => {
    
    setAiLoading(true);
    setAiResponse(null);
    try {
      const res = await supabase.functions.invoke("offer-coaching", {
        body: { step: stepNum, answer, offerData: { ...offer, ...formData }, brandContext: {} },
      });
      
      if (res.error) {
        const msg = typeof res.error === "string" ? res.error : (res.error as any)?.message || "Erreur inconnue";
        throw new Error(msg);
      }
      if (res.data?.error) {
        throw new Error(res.data.error === "limit_reached" ? (res.data.message || "Quota IA atteint") : res.data.error);
      }
      setAiResponse(res.data);
    } catch (e: any) {
      console.error("offer-coaching error:", e);
      toast.error(e.message || "Une erreur est survenue. Réessaie.");
    }
    setAiLoading(false);
  };

  const goNext = async () => {
    // Save current step data
    const fields: Record<string, any> = {};
    if (step === 1) {
      fields.offer_type = formData.offer_type;
      fields.name = formData.name;
      fields.description_short = formData.description_short;
      fields.price_text = formData.price_text;
      fields.url_sales_page = formData.url_sales_page;
      fields.url_booking = formData.url_booking;
    } else if (step === 2) {
      fields.problem_surface = formData.problem_surface;
      if (aiResponse?.deep_problem) fields.problem_deep = aiResponse.deep_problem;
    } else if (step === 3) {
      fields.promise = formData.promise;
      if (aiResponse?.suggestions) fields.promise_long = aiResponse.suggestions.map((s: any) => s.text).join(" | ");
    } else if (step === 4) {
      fields.features = formData.features_text.split("\n").filter((f: string) => f.trim());
      if (aiResponse?.features_to_benefits) {
        fields.features_to_benefits = aiResponse.features_to_benefits;
        fields.benefits = aiResponse.features_to_benefits.map((f: any) => f.benefit);
      }
    } else if (step === 5) {
      fields.target_ideal = formData.target_ideal;
      fields.target_not_for = formData.target_not_for;
    } else if (step === 6) {
      const rawObj = formData.objections_text.split("\n").filter((o: string) => o.trim());
      if (aiResponse?.objections) {
        fields.objections = aiResponse.objections;
      } else {
        fields.objections = rawObj.map((o: string) => ({ objection: o, response: "" }));
      }
      fields.testimonials = formData.testimonials;
    } else if (step === 7) {
      if (aiResponse) {
        fields.sales_line = aiResponse.sales_line || formData.sales_line;
        fields.emotional_before = aiResponse.before || "";
        fields.emotional_after = aiResponse.after || "";
        fields.feelings_after = aiResponse.feelings || [];
        if (aiResponse.promise_summary) fields.promise = aiResponse.promise_summary;
        if (aiResponse.sales_line_long) fields.promise_long = aiResponse.sales_line_long;
      }
      fields.completed = true;
    }

    const nextStep = step < 7 ? step + 1 : 7;
    await save(fields, nextStep);
    if (step < 7) {
      setStep(nextStep);
      setAiResponse(null);
    } else {
      toast.success("🎉 Fiche offre complétée !");
      navigate("/branding/offres");
    }
  };

  const goPrev = () => {
    if (step > 1) { setStep(step - 1); setAiResponse(null); }
  };

  const deleteOffer = async () => {
    if (!id) return;
    if (!confirm("Supprimer cette offre ?")) return;
    await supabase.from("offers").delete().eq("id", id);
    navigate("/branding/offres");
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex gap-1">
          <div className="h-3 w-3 rounded-full bg-primary animate-bounce-dot" />
          <div className="h-3 w-3 rounded-full bg-primary animate-bounce-dot" style={{ animationDelay: "0.16s" }} />
          <div className="h-3 w-3 rounded-full bg-primary animate-bounce-dot" style={{ animationDelay: "0.32s" }} />
        </div>
      </div>
    );
  }

  const pct = Math.round((step / 7) * 100);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-[700px] px-6 py-8 max-md:px-4">
        <div className="flex items-center justify-between mb-6">
          <Link to="/branding/offres" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" />
            Mes offres
          </Link>
          <Button variant="ghost" size="sm" onClick={deleteOffer} className="text-destructive hover:text-destructive">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>

        {/* Progress bar */}
        <div className="mb-8">
          <div className="flex items-center gap-1 mb-2 flex-wrap">
            {STEPS.map((s) => (
              <button
                key={s.num}
                onClick={() => { if (s.num <= (offer?.current_step || step)) { setStep(s.num); setAiResponse(null); } }}
                className={`text-[11px] font-mono-ui font-semibold px-2 py-1 rounded-full transition-colors ${
                  s.num === step ? "bg-primary text-primary-foreground" :
                  s.num < step ? "bg-primary/20 text-primary cursor-pointer" :
                  "bg-muted text-muted-foreground"
                }`}
              >
                {s.num}. {s.label}
              </button>
            ))}
          </div>
          <Progress value={pct} className="h-2" />
          <p className="text-[11px] text-muted-foreground mt-1">Étape {step}/7</p>
        </div>

        {/* Step content */}
        {step === 1 && <Step1 formData={formData} setFormData={updateFormData} saved={saved} autoSaving={autoSaving} />}
        {step === 2 && <Step2 formData={formData} setFormData={updateFormData} aiResponse={aiResponse} aiLoading={aiLoading} onAskAI={() => askAI(2, formData.problem_surface)} saved={saved} autoSaving={autoSaving} />}
        {step === 3 && <Step3 formData={formData} setFormData={updateFormData} aiResponse={aiResponse} aiLoading={aiLoading} onAskAI={() => askAI(3, formData.promise)} saved={saved} autoSaving={autoSaving} />}
        {step === 4 && <Step4 formData={formData} setFormData={updateFormData} aiResponse={aiResponse} aiLoading={aiLoading} onAskAI={() => askAI(4, formData.features_text)} saved={saved} autoSaving={autoSaving} />}
        {step === 5 && <Step5 formData={formData} setFormData={updateFormData} aiResponse={aiResponse} aiLoading={aiLoading} onAskAI={() => askAI(5, formData.target_ideal)} saved={saved} autoSaving={autoSaving} />}
        {step === 6 && <Step6 formData={formData} setFormData={updateFormData} aiResponse={aiResponse} aiLoading={aiLoading} onAskAI={() => askAI(6, formData.objections_text)} saved={saved} autoSaving={autoSaving} />}
        {step === 7 && <Step7 formData={formData} setFormData={updateFormData} aiResponse={aiResponse} aiLoading={aiLoading} offer={offer} onAskAI={() => askAI(7, "")} />}

        {/* Navigation */}
        <div className="flex items-center justify-between mt-8 pt-4 border-t border-border">
          <Button variant="outline" onClick={goPrev} disabled={step === 1}>← Retour</Button>
          <Button onClick={goNext} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            {step === 7 ? "✅ Terminer" : "Suivant →"}
          </Button>
        </div>
      </main>
    </div>
  );
}

// ── STEP COMPONENTS ──────────────────────────

function Step1({ formData, setFormData, saved, autoSaving }: any) {
  const update = (k: string, v: any) => setFormData((p: any) => ({ ...p, [k]: v }));
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl font-bold">① Les bases de ton offre</h2>
        <SaveIndicator saved={saved} saving={autoSaving} />
      </div>
      <div>
        <label className="text-sm font-semibold text-foreground mb-2 block">Type d'offre</label>
        <div className="flex gap-2 flex-wrap">
          {[
            { v: "paid", l: "💎 Payante" },
            { v: "free", l: "🎁 Gratuite (lead magnet)" },
            { v: "service", l: "🎤 Ponctuelle" },
          ].map((t) => (
            <button
              key={t.v}
              onClick={() => update("offer_type", t.v)}
              className={`px-4 py-2 rounded-full text-sm font-medium border-2 transition-colors ${
                formData.offer_type === t.v ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/30"
              }`}
            >
              {t.l}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="text-sm font-semibold text-foreground mb-1 block">Nom de l'offre</label>
        <Input value={formData.name} onChange={(e) => update("name", e.target.value)} placeholder="Ex: Programme Sérénité, Pack Coaching 3 mois..." />
      </div>
      <div>
        <label className="text-sm font-semibold text-foreground mb-1 block">Décris ton offre en 2-3 phrases</label>
        <Textarea value={formData.description_short} onChange={(e) => update("description_short", e.target.value)} placeholder="Comme tu l'expliquerais à une amie..." rows={3} />
      </div>
      <div>
        <label className="text-sm font-semibold text-foreground mb-1 block">Prix</label>
        <Input value={formData.price_text} onChange={(e) => update("price_text", e.target.value)} placeholder="Ex: 290€/mois × 6 mois" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-semibold text-foreground mb-1 block">Lien page de vente</label>
          <Input value={formData.url_sales_page} onChange={(e) => update("url_sales_page", e.target.value)} placeholder="https://..." />
        </div>
        <div>
          <label className="text-sm font-semibold text-foreground mb-1 block">Lien prise de RDV</label>
          <Input value={formData.url_booking} onChange={(e) => update("url_booking", e.target.value)} placeholder="https://calendly.com/..." />
        </div>
      </div>
    </div>
  );
}

function Step2({ formData, setFormData, aiResponse, aiLoading, onAskAI, saved, autoSaving }: any) {
  const update = (k: string, v: any) => setFormData((p: any) => ({ ...p, [k]: v }));
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl font-bold">② Le problème que ton offre résout</h2>
        <SaveIndicator saved={saved} saving={autoSaving} />
      </div>
      <p className="text-sm text-muted-foreground">Quel problème ta cliente a AVANT de travailler avec toi ?</p>
      <Textarea value={formData.problem_surface} onChange={(e) => update("problem_surface", e.target.value)} placeholder="Elle ne sait pas communiquer, elle est invisible..." rows={3} />
      
      <Button onClick={onAskAI} disabled={aiLoading || !formData.problem_surface?.trim()} variant="outline" className="gap-2">
        {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        L'IA te coache
      </Button>

      {aiResponse && (
        <div className="rounded-xl border-2 border-primary/20 bg-primary/5 p-4 space-y-3">
          <p className="text-sm font-semibold text-primary">🤖 L'IA réagit</p>
          <p className="text-sm text-foreground whitespace-pre-line">{aiResponse.reaction}</p>
          {aiResponse.follow_up_questions && (
            <ul className="text-sm text-muted-foreground space-y-1">
              {aiResponse.follow_up_questions.map((q: string, i: number) => (
                <li key={i}>· {q}</li>
              ))}
            </ul>
          )}
          {aiResponse.deep_problem && (
            <div className="rounded-lg bg-card border border-border p-3 mt-2">
              <p className="text-xs font-semibold text-primary mb-1">💡 Le problème profond que je retiens :</p>
              <p className="text-sm text-foreground italic">"{aiResponse.deep_problem}"</p>
              <div className="flex gap-2 mt-2">
                <Button size="sm" className="text-xs rounded-pill" onClick={() => update("problem_deep_confirmed", true)}>
                  <Check className="h-3 w-3 mr-1" />C'est exactement ça
                </Button>
                <Button size="sm" variant="outline" className="text-xs rounded-pill" onClick={() => {}}>
                  <Pencil className="h-3 w-3 mr-1" />Pas tout à fait
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Step3({ formData, setFormData, aiResponse, aiLoading, onAskAI, saved, autoSaving }: any) {
  const update = (k: string, v: any) => setFormData((p: any) => ({ ...p, [k]: v }));
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl font-bold">③ Ta promesse</h2>
        <SaveIndicator saved={saved} saving={autoSaving} />
      </div>
      <p className="text-sm text-muted-foreground">Si ta cliente devait résumer ce qu'elle obtient en 1 phrase, ce serait quoi ?</p>
      <Textarea value={formData.promise} onChange={(e) => update("promise", e.target.value)} placeholder="Un système de communication complet posé en 6 mois" rows={2} />

      <Button onClick={onAskAI} disabled={aiLoading || !formData.promise?.trim()} variant="outline" className="gap-2">
        {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        L'IA challenge ta promesse
      </Button>

      {aiResponse && (
        <div className="rounded-xl border-2 border-primary/20 bg-primary/5 p-4 space-y-3">
          <p className="text-sm font-semibold text-primary">🤖 L'IA challenge</p>
          <p className="text-sm text-foreground whitespace-pre-line">{aiResponse.reaction}</p>
          {aiResponse.suggestions && (
            <div className="space-y-2 mt-2">
              <p className="text-xs font-semibold text-muted-foreground">3 reformulations proposées :</p>
              {aiResponse.suggestions.map((s: any, i: number) => (
                <button
                  key={i}
                  onClick={() => update("promise", s.text)}
                  className={`block w-full text-left rounded-lg border-2 p-3 text-sm transition-colors ${
                    formData.promise === s.text ? "border-primary bg-primary/10" : "border-border hover:border-primary/30"
                  }`}
                >
                  <span className="font-semibold text-primary mr-2">{s.label}.</span>
                  {s.text}
                </button>
              ))}
              <button
                onClick={() => {}}
                className="text-xs text-primary underline mt-1"
              >
                ✏️ Écrire la mienne
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Step4({ formData, setFormData, aiResponse, aiLoading, onAskAI, saved, autoSaving }: any) {
  const update = (k: string, v: any) => setFormData((p: any) => ({ ...p, [k]: v }));
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl font-bold">④ Ce que ta cliente obtient</h2>
        <SaveIndicator saved={saved} saving={autoSaving} />
      </div>
      <p className="text-sm text-muted-foreground">Liste ce que ton offre INCLUT (les features), une par ligne :</p>
      <Textarea value={formData.features_text} onChange={(e) => update("features_text", e.target.value)} placeholder={"6 mois d'accompagnement\n6 modules\n1 session individuelle par mois\nCommunauté WhatsApp\nTemplates Canva"} rows={5} />

      <Button onClick={onAskAI} disabled={aiLoading || !formData.features_text?.trim()} variant="outline" className="gap-2">
        {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        Transformer en bénéfices
      </Button>

      {aiResponse && (
        <div className="rounded-xl border-2 border-primary/20 bg-primary/5 p-4 space-y-3">
          <p className="text-sm font-semibold text-primary">🤖 L'IA transforme en bénéfices</p>
          {aiResponse.reaction && <p className="text-sm text-foreground">{aiResponse.reaction}</p>}
          {aiResponse.features_to_benefits && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 pr-3 text-muted-foreground font-medium">Tu dis (feature)</th>
                    <th className="text-left py-2 text-muted-foreground font-medium">Elle entend (bénéfice)</th>
                  </tr>
                </thead>
                <tbody>
                  {aiResponse.features_to_benefits.map((f: any, i: number) => (
                    <tr key={i} className="border-b border-border/50">
                      <td className="py-2 pr-3 text-muted-foreground">{f.feature}</td>
                      <td className="py-2 font-medium text-foreground">{f.benefit}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {aiResponse.tip && <p className="text-xs text-muted-foreground italic mt-2">💡 {aiResponse.tip}</p>}
        </div>
      )}
    </div>
  );
}

function Step5({ formData, setFormData, aiResponse, aiLoading, onAskAI, saved, autoSaving }: any) {
  const update = (k: string, v: any) => setFormData((p: any) => ({ ...p, [k]: v }));
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl font-bold">⑤ Pour qui c'est fait</h2>
        <SaveIndicator saved={saved} saving={autoSaving} />
      </div>
      <div>
        <label className="text-sm font-semibold text-foreground mb-1 block">Ta cliente idéale pour cette offre :</label>
        <Textarea value={formData.target_ideal} onChange={(e) => update("target_ideal", e.target.value)} placeholder="Solopreneuse créative dans la mode éthique, artisanat, bien-être..." rows={3} />
      </div>
      <div>
        <label className="text-sm font-semibold text-foreground mb-1 block">Pour qui c'est PAS fait :</label>
        <Textarea value={formData.target_not_for} onChange={(e) => update("target_not_for", e.target.value)} placeholder="Quelqu'un qui veut déléguer sans apprendre..." rows={2} />
      </div>

      <Button onClick={onAskAI} disabled={aiLoading || !formData.target_ideal?.trim()} variant="outline" className="gap-2">
        {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        L'IA affine ta cible
      </Button>

      {aiResponse && (
        <div className="rounded-xl border-2 border-primary/20 bg-primary/5 p-4 space-y-3">
          <p className="text-sm font-semibold text-primary">🤖 L'IA pose des questions</p>
          <p className="text-sm text-foreground whitespace-pre-line">{aiResponse.reaction}</p>
          {aiResponse.follow_up_questions && (
            <ul className="text-sm text-muted-foreground space-y-1">
              {aiResponse.follow_up_questions.map((q: string, i: number) => (
                <li key={i}>· {q}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function Step6({ formData, setFormData, aiResponse, aiLoading, onAskAI, saved, autoSaving }: any) {
  const update = (k: string, v: any) => setFormData((p: any) => ({ ...p, [k]: v }));

  const addTestimonial = () => {
    const t = [...(formData.testimonials || []), { name: "", sector: "", result: "", quote: "" }];
    update("testimonials", t);
  };
  const updateTestimonial = (i: number, field: string, value: string) => {
    const t = [...(formData.testimonials || [])];
    t[i] = { ...t[i], [field]: value };
    update("testimonials", t);
  };
  const removeTestimonial = (i: number) => {
    const t = [...(formData.testimonials || [])];
    t.splice(i, 1);
    update("testimonials", t);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl font-bold">⑥ Les objections</h2>
        <SaveIndicator saved={saved} saving={autoSaving} />
      </div>
      <p className="text-sm text-muted-foreground">Quand quelqu'un hésite, elle dit quoi ? (une objection par ligne)</p>
      <Textarea value={formData.objections_text} onChange={(e) => update("objections_text", e.target.value)} placeholder={"J'ai pas le budget\nJ'ai pas le temps\nJe peux trouver ça gratuitement"} rows={4} />

      <Button onClick={onAskAI} disabled={aiLoading || !formData.objections_text?.trim()} variant="outline" className="gap-2">
        {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        Générer des réponses
      </Button>

      {aiResponse?.objections && (
        <div className="rounded-xl border-2 border-primary/20 bg-primary/5 p-4 space-y-3">
          <p className="text-sm font-semibold text-primary">🤖 Réponses aux objections</p>
          {aiResponse.objections.map((o: any, i: number) => (
            <div key={i} className="rounded-lg bg-card border border-border p-3">
              <p className="text-sm font-semibold text-foreground mb-1">{o.emoji} "{o.objection}"</p>
              <p className="text-sm text-muted-foreground">→ {o.response}</p>
            </div>
          ))}
        </div>
      )}

      <div className="pt-4 border-t border-border">
        <p className="text-sm font-semibold text-foreground mb-3">Témoignages client·es (optionnel)</p>
        {(formData.testimonials || []).map((t: any, i: number) => (
          <div key={i} className="rounded-xl border border-border p-3 mb-3 space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs font-semibold text-muted-foreground">Témoignage {i + 1}</span>
              <button onClick={() => removeTestimonial(i)} className="text-destructive text-xs">✕</button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Prénom" value={t.name} onChange={(e) => updateTestimonial(i, "name", e.target.value)} className="text-sm" />
              <Input placeholder="Secteur" value={t.sector} onChange={(e) => updateTestimonial(i, "sector", e.target.value)} className="text-sm" />
            </div>
            <Input placeholder="Résultat obtenu" value={t.result} onChange={(e) => updateTestimonial(i, "result", e.target.value)} className="text-sm" />
            <Textarea placeholder="Citation" value={t.quote} onChange={(e) => updateTestimonial(i, "quote", e.target.value)} rows={2} className="text-sm" />
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={addTestimonial} className="text-xs">+ Ajouter un témoignage</Button>
      </div>
    </div>
  );
}

function Step7({ formData, setFormData, aiResponse, aiLoading, offer, onAskAI }: any) {
  return (
    <div className="space-y-5">
      <h2 className="font-display text-xl font-bold">⑦ L'angle émotionnel</h2>
      <p className="text-sm text-muted-foreground">L'IA synthétise toute ta fiche en un positionnement émotionnel puissant.</p>

      <Button onClick={onAskAI} disabled={aiLoading} className="gap-2">
        {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        Générer la synthèse
      </Button>

      {aiResponse && (
        <div className="rounded-xl border-2 border-primary/20 bg-primary/5 p-4 space-y-4">
          <p className="text-sm font-semibold text-primary">🤖 Voici ce que j'ai compris de ton offre</p>

          {aiResponse.problem_summary && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1">🎯 LE PROBLÈME PROFOND :</p>
              <p className="text-sm text-foreground italic">"{aiResponse.problem_summary}"</p>
            </div>
          )}
          {aiResponse.promise_summary && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1">✨ LA PROMESSE :</p>
              <p className="text-sm text-foreground font-semibold">"{aiResponse.promise_summary}"</p>
            </div>
          )}
          {(aiResponse.before || aiResponse.after) && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1">💡 LA TRANSFORMATION :</p>
              {aiResponse.before && <p className="text-sm text-muted-foreground"><span className="font-semibold">AVANT :</span> {aiResponse.before}</p>}
              {aiResponse.after && <p className="text-sm text-foreground"><span className="font-semibold">APRÈS :</span> {aiResponse.after}</p>}
            </div>
          )}
          {aiResponse.feelings && aiResponse.feelings.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1">🫀 CE QU'ELLE RESSENT APRÈS :</p>
              <div className="flex flex-wrap gap-2">
                {aiResponse.feelings.map((f: string, i: number) => (
                  <span key={i} className="text-xs bg-primary/10 text-primary rounded-full px-3 py-1 font-medium">{f}</span>
                ))}
              </div>
            </div>
          )}
          {aiResponse.sales_line && (
            <div className="rounded-lg bg-card border border-border p-3">
              <p className="text-xs font-semibold text-muted-foreground mb-1">📣 LA PHRASE DE VENTE :</p>
              <p className="text-sm text-foreground font-semibold">"{aiResponse.sales_line}"</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
