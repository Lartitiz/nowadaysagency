import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useProfile, useBrandProfile } from "@/hooks/use-profile";
import { usePersona } from "@/hooks/use-branding";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useWorkspaceFilter } from "@/hooks/use-workspace-query";
import { useQueryClient } from "@tanstack/react-query";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { friendlyError } from "@/lib/error-messages";
import { Loader2, Pencil, RefreshCw, Sparkles, Download } from "lucide-react";
import EditableText from "@/components/EditableText";
import CoachingFlow from "@/components/CoachingFlow";
import { useDemoContext } from "@/contexts/DemoContext";
import { DEMO_DATA } from "@/lib/demo-data";
import { SkeletonCard } from "@/components/ui/skeleton-card";

interface QuiElleEst {
  age: string;
  metier: string;
  situation: string;
  ca: string;
  temps_com: string;
}

interface CommentParler {
  ton: string;
  canal: string;
  convainc: string;
  fuir: string[];
}

interface Portrait {
  prenom: string;
  phrase_signature: string;
  qui_elle_est: QuiElleEst;
  frustrations: string[];
  objectifs: string[];
  blocages: string[];
  comment_parler: CommentParler;
  ses_mots: string[];
}

const QUI_LABELS: Record<keyof QuiElleEst, string> = {
  age: "Âge",
  metier: "Métier",
  situation: "Situation",
  ca: "CA",
  temps_com: "Temps pour sa com'",
};

export default function PersonaRecapPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const { isDemoMode } = useDemoContext();
  const { column, value } = useWorkspaceFilter();
  const queryClient = useQueryClient();
  const { data: personaHookData, isLoading: personaHookLoading } = usePersona();
  const [data, setData] = useState<any>(null);
  const { data: profileData } = useProfile();
  const { data: brandProfileData } = useBrandProfile();
  const profile = profileData ? { ...profileData, ...(brandProfileData || {}) } : null;
  const [portrait, setPortrait] = useState<Portrait | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [customName, setCustomName] = useState("");
  const [editingName, setEditingName] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  // Coaching state
  const fromAudit = searchParams.get("from") === "audit";
  const recId = searchParams.get("rec_id") || undefined;
  const [coachingOpen, setCoachingOpen] = useState(false);

  useEffect(() => {
    if (isDemoMode) {
      const dp = DEMO_DATA.persona_portrait;
      setPortrait(dp as unknown as Portrait);
      setCustomName(dp.prenom);
      setData({ id: "demo", portrait: dp, portrait_prenom: dp.prenom });
      // profile is now derived from hooks — no need to set it in demo mode
      setLoading(false);
      return;
    }
    if (personaHookLoading) return;
    if (personaHookData) {
      setData(personaHookData);
      if (personaHookData.portrait) {
        setPortrait(personaHookData.portrait as unknown as Portrait);
        setCustomName(personaHookData.portrait_prenom || (personaHookData.portrait as unknown as Portrait).prenom || "");
      }
    }
    setLoading(false);
  }, [isDemoMode, personaHookLoading, personaHookData]);

  const canGenerate = data?.step_1_frustrations && data?.step_2_transformation;

  const savePortraitField = async (path: string[], value: string) => {
    if (isDemoMode || !data || !portrait) return;
    const updated = JSON.parse(JSON.stringify(portrait));
    let obj = updated;
    for (let i = 0; i < path.length - 1; i++) obj = obj[path[i]];
    obj[path[path.length - 1]] = value;
    await supabase.from("persona").update({ portrait: updated as any }).eq("id", data.id);
    setPortrait(updated);
    queryClient.invalidateQueries({ queryKey: ["persona"] });
  };

  const savePortraitArrayItem = async (arrayKey: string, index: number, value: string) => {
    if (isDemoMode || !data || !portrait) return;
    const updated = JSON.parse(JSON.stringify(portrait));
    updated[arrayKey][index] = value;
    await supabase.from("persona").update({ portrait: updated as any }).eq("id", data.id);
    setPortrait(updated);
    queryClient.invalidateQueries({ queryKey: ["persona"] });
  };

  const saveFuirItem = async (index: number, value: string) => {
    if (isDemoMode || !data || !portrait) return;
    const updated = JSON.parse(JSON.stringify(portrait));
    updated.comment_parler.fuir[index] = value;
    await supabase.from("persona").update({ portrait: updated as any }).eq("id", data.id);
    setPortrait(updated);
    queryClient.invalidateQueries({ queryKey: ["persona"] });
  };

  const generatePortrait = async () => {
    if (!canGenerate) return;
    setGenerating(true);
    try {
      const { data: fnData, error } = await supabase.functions.invoke("persona-ai", {
        body: { type: "portrait", profile, persona: data },
      });
      if (error) throw error;
      const raw = fnData.content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const parsed: Portrait = JSON.parse(raw);
      await supabase.from("persona").update({ portrait: parsed as any, portrait_prenom: parsed.prenom }).eq("id", data.id);
      setPortrait(parsed);
      setCustomName(parsed.prenom);
      setData({ ...data, portrait: parsed, portrait_prenom: parsed.prenom });
      queryClient.invalidateQueries({ queryKey: ["persona"] });
    } catch (e: any) {
      console.error("Erreur technique:", e);
      toast({ title: "Erreur IA", description: friendlyError(e), variant: "destructive" });
    }
    setGenerating(false);
  };

  const saveName = async (name: string) => {
    setCustomName(name);
    if (data?.id) {
      await supabase.from("persona").update({ portrait_prenom: name }).eq("id", data.id);
      queryClient.invalidateQueries({ queryKey: ["persona"] });
    }
    setEditingName(false);
  };

  const handleCoachingComplete = () => {
    setCoachingOpen(false);
    // Invalidate cache to reload data with coaching changes
    queryClient.invalidateQueries({ queryKey: ["persona"] });
  };

  const displayName = customName || portrait?.prenom || "";
  const initials = displayName ? displayName.slice(0, 1).toUpperCase() : "?";

  const handleExportPdf = async () => {
    if (!portrait) return;
    const { default: jsPDF } = await import("jspdf");
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const marginL = 20;
    const marginR = 20;
    const maxW = pageW - marginL - marginR;
    let y = 25;

    const checkPage = (needed: number) => {
      if (y + needed > pageH - 25) {
        doc.addPage();
        y = 20;
      }
    };

    const addSection = (icon: string, title: string) => {
      checkPage(14);
      y += 6;
      doc.setFont("Helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(233, 30, 140);
      doc.text(`${icon}  ${title}`, marginL, y);
      y += 8;
      doc.setTextColor(40, 40, 40);
      doc.setFont("Helvetica", "normal");
      doc.setFontSize(10);
    };

    const addBullets = (items: string[]) => {
      items.forEach((item) => {
        checkPage(8);
        const lines = doc.splitTextToSize(`•  ${item}`, maxW - 6);
        doc.text(lines, marginL + 4, y);
        y += lines.length * 5;
      });
    };

    const addKeyValue = (key: string, val: string) => {
      checkPage(8);
      doc.setFont("Helvetica", "bold");
      doc.text(`${key} : `, marginL + 4, y);
      const keyW = doc.getTextWidth(`${key} : `);
      doc.setFont("Helvetica", "normal");
      const lines = doc.splitTextToSize(val, maxW - 6 - keyW);
      doc.text(lines, marginL + 4 + keyW, y);
      y += lines.length * 5;
    };

    // Title
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(233, 30, 140);
    doc.text(`Fiche Persona${displayName ? ` — ${displayName}` : ""}`, marginL, y);
    y += 10;

    if (portrait.phrase_signature) {
      doc.setFont("Helvetica", "italic");
      doc.setFontSize(10);
      doc.setTextColor(120, 120, 120);
      doc.text(`"${portrait.phrase_signature}"`, marginL, y);
      y += 8;
    }

    // Qui elle est
    addSection("👤", "Qui elle est");
    (Object.keys(QUI_LABELS) as (keyof QuiElleEst)[]).forEach((key) => {
      if (portrait.qui_elle_est?.[key]) addKeyValue(QUI_LABELS[key], portrait.qui_elle_est[key]);
    });

    // Frustrations
    if (portrait.frustrations?.length) {
      addSection("😤", "Ses frustrations");
      addBullets(portrait.frustrations);
    }

    // Objectifs
    if (portrait.objectifs?.length) {
      addSection("✨", "Ce qu'elle veut vraiment");
      addBullets(portrait.objectifs);
    }

    // Blocages
    if (portrait.blocages?.length) {
      addSection("🚫", "Ce qui la bloque");
      addBullets(portrait.blocages);
    }

    // Ce qu'elle dit
    if (portrait.ses_mots?.length) {
      addSection("💬", "Ce qu'elle dit");
      portrait.ses_mots.forEach((m) => {
        checkPage(8);
        const lines = doc.splitTextToSize(`"${m}"`, maxW - 6);
        doc.setFont("Helvetica", "italic");
        doc.text(lines, marginL + 4, y);
        doc.setFont("Helvetica", "normal");
        y += lines.length * 5;
      });
    }

    // Comment lui parler
    addSection("🗣️", "Comment lui parler");
    if (portrait.comment_parler?.ton) addKeyValue("Ton", portrait.comment_parler.ton);
    if (portrait.comment_parler?.canal) addKeyValue("Canal préféré", portrait.comment_parler.canal);
    if (portrait.comment_parler?.convainc) addKeyValue("Ce qui la convainc", portrait.comment_parler.convainc);
    if (portrait.comment_parler?.fuir?.length) {
      checkPage(8);
      doc.setFont("Helvetica", "bold");
      doc.text("À éviter : ", marginL + 4, y);
      const kw = doc.getTextWidth("À éviter : ");
      doc.setFont("Helvetica", "normal");
      doc.text(portrait.comment_parler.fuir.join(", "), marginL + 4 + kw, y);
      y += 6;
    }

    // Footer
    const footerY = pageH - 12;
    const totalPages = doc.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      doc.setFontSize(8);
      doc.setTextColor(160, 160, 160);
      doc.text(`Généré avec L'Assistant Com' · nowadays.agency — ${new Date().toLocaleDateString("fr-FR")}`, marginL, footerY);
      doc.text(`${p}/${totalPages}`, pageW - marginR, footerY, { align: "right" });
    }

    doc.save(`persona-${displayName || "fiche"}.pdf`);
  };

  if (loading) return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-[700px] px-6 py-8 max-md:px-4 space-y-4">
        <SkeletonCard variant="large" />
        <SkeletonCard variant="large" />
      </main>
    </div>
  );

  // Empty state — no portrait yet
  if (!portrait) return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-[700px] px-6 py-8 max-md:px-4">
        <SubPageHeader breadcrumbs={[{ label: "Branding", to: "/branding" }, { label: "Ma cliente idéale", to: "/branding/section?section=persona" }]} currentLabel="Portrait" />

        <div className="rounded-2xl border border-border bg-card p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-rose-pale flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">👤</span>
          </div>
          <h1 className="font-display text-xl font-bold text-foreground mb-2">Le portrait de ta cliente idéale</h1>
          <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
            Tu n'as pas encore défini ta cliente idéale. C'est la première étape pour créer des contenus qui parlent aux bonnes personnes.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            {canGenerate ? (
              <Button onClick={generatePortrait} disabled={generating} className="rounded-pill gap-2">
                {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                L'assistant m'aide à la définir
              </Button>
            ) : (
              <Button onClick={() => navigate("/branding/persona")} className="rounded-pill gap-2">
                <Sparkles className="h-4 w-4" /> L'assistant m'aide à la définir
              </Button>
            )}
            <Button variant="outline" onClick={() => {
              if (canGenerate) generatePortrait();
              else navigate("/branding/persona");
            }} className="rounded-pill gap-2">
              <Pencil className="h-4 w-4" /> Je remplis moi-même
            </Button>
          </div>
        </div>
      </main>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-[700px] px-6 py-8 max-md:px-4">
        <SubPageHeader breadcrumbs={[{ label: "Branding", to: "/branding" }, { label: "Ma cliente idéale", to: "/branding/section?section=persona" }]} currentLabel="Portrait" />

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="font-display text-[22px] font-bold text-foreground">Le portrait de ta cliente idéale</h1>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="rounded-pill gap-1.5 text-xs"
              onClick={handleExportPdf}
            >
              <Download className="h-3.5 w-3.5" /> PDF
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="rounded-pill gap-1.5 text-xs"
              onClick={() => setCoachingOpen(true)}
            >
              <Sparkles className="h-3.5 w-3.5" /> Optimiser
            </Button>
          </div>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-border bg-card shadow-sm p-6 sm:p-8 mb-6">

          {/* Avatar + Name + Signature */}
          <div className="flex flex-col items-center mb-8">
            <div className="w-20 h-20 rounded-full bg-rose-pale flex items-center justify-center mb-3">
              <span className="font-display text-3xl font-bold text-primary">{initials}</span>
            </div>

            {editingName ? (
              <input
                ref={nameRef}
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && saveName(customName)}
                onBlur={() => saveName(customName)}
                className="font-display text-xl font-bold text-foreground text-center bg-transparent border-b-2 border-primary outline-none w-48 mb-1"
                autoFocus
              />
            ) : (
              <button
                onClick={() => setEditingName(true)}
                className="group flex items-center gap-2 mb-1"
              >
                <h2 className="font-display text-xl font-bold text-foreground">{displayName}</h2>
                <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            )}

            <EditableText
              value={portrait.phrase_signature}
              onSave={(v) => savePortraitField(["phrase_signature"], v)}
              type="input"
              placeholder="Sa phrase signature..."
              className="text-sm italic text-muted-foreground text-center max-w-[400px]"
            />
          </div>

          {/* ── QUI ELLE EST ── */}
          <SectionHeader icon="👤" title="Qui elle est" />
          <div className="space-y-2 mb-6">
            {(Object.keys(QUI_LABELS) as (keyof QuiElleEst)[]).map((key) => (
              <div key={key} className="flex items-start gap-2 group">
                <span className="text-sm text-muted-foreground w-28 shrink-0 pt-0.5">{QUI_LABELS[key]}</span>
                <div className="flex-1">
                  <EditableText
                    value={portrait.qui_elle_est[key] || ""}
                    onSave={(v) => savePortraitField(["qui_elle_est", key], v)}
                    type="input"
                    placeholder="Clique pour remplir..."
                    className="text-sm text-foreground"
                  />
                </div>
              </div>
            ))}
          </div>

          {/* ── SES FRUSTRATIONS ── */}
          <SectionHeader icon="😤" title="Ses frustrations" />
          <EditableList
            items={portrait.frustrations}
            onSave={(i, v) => savePortraitArrayItem("frustrations", i, v)}
          />

          {/* ── CE QU'ELLE VEUT VRAIMENT ── */}
          <SectionHeader icon="✨" title="Ce qu'elle veut vraiment" />
          <EditableList
            items={portrait.objectifs}
            onSave={(i, v) => savePortraitArrayItem("objectifs", i, v)}
          />

          {/* ── CE QUI LA BLOQUE ── */}
          {portrait.blocages?.length > 0 && (
            <>
              <SectionHeader icon="🚫" title="Ce qui la bloque" />
              <EditableList
                items={portrait.blocages}
                onSave={(i, v) => savePortraitArrayItem("blocages", i, v)}
              />
            </>
          )}

          {/* ── CE QU'ELLE DIT ── */}
          <SectionHeader icon="💬" title="Ce qu'elle dit" />
          <div className="space-y-1.5 mb-6">
            {portrait.ses_mots.map((m, i) => (
              <div key={i} className="flex items-start gap-1.5">
                <span className="shrink-0 text-sm text-muted-foreground">"</span>
                <EditableText
                  value={m}
                  onSave={(v) => savePortraitArrayItem("ses_mots", i, v)}
                  type="input"
                  className="text-sm italic text-foreground"
                />
                <span className="shrink-0 text-sm text-muted-foreground">"</span>
              </div>
            ))}
          </div>

          {/* ── COMMENT LUI PARLER ── */}
          <SectionHeader icon="🗣️" title="Comment lui parler" />
          <div className="space-y-3 mb-6">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Ton</p>
              <EditableText
                value={portrait.comment_parler.ton}
                onSave={(v) => savePortraitField(["comment_parler", "ton"], v)}
                type="input"
                placeholder="Le ton à adopter..."
                className="text-sm text-foreground"
              />
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Canal préféré</p>
              <EditableText
                value={portrait.comment_parler.canal}
                onSave={(v) => savePortraitField(["comment_parler", "canal"], v)}
                type="input"
                placeholder="Son canal préféré..."
                className="text-sm text-foreground"
              />
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Ce qui la convainc</p>
              <EditableText
                value={portrait.comment_parler.convainc}
                onSave={(v) => savePortraitField(["comment_parler", "convainc"], v)}
                type="input"
                placeholder="Ce qui la convainc..."
                className="text-sm text-foreground"
              />
            </div>

            {/* Mots qui résonnent */}
            <div>
              <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wider mb-1">✅ Mots qui résonnent</p>
              <EditableText
                value={portrait.ses_mots?.join(", ") || ""}
                onSave={async (v) => {
                  const items = v.split(",").map(s => s.trim()).filter(Boolean);
                  if (!data || !portrait) return;
                  const updated = { ...portrait, ses_mots: items };
                  await supabase.from("persona").update({ portrait: updated as any }).eq("id", data.id);
                  setPortrait(updated);
                  queryClient.invalidateQueries({ queryKey: ["persona"] });
                }}
                type="input"
                placeholder="Mots qui résonnent avec elle..."
                className="text-sm text-foreground"
              />
            </div>

            {/* Mots à éviter */}
            <div>
              <p className="text-xs font-semibold text-red-500 uppercase tracking-wider mb-1">🚫 Mots à éviter</p>
              <EditableText
                value={portrait.comment_parler.fuir?.join(", ") || ""}
                onSave={async (v) => {
                  const items = v.split(",").map(s => s.trim()).filter(Boolean);
                  if (!data || !portrait) return;
                  const updated = JSON.parse(JSON.stringify(portrait));
                  updated.comment_parler.fuir = items;
                  await supabase.from("persona").update({ portrait: updated as any }).eq("id", data.id);
                  setPortrait(updated);
                  queryClient.invalidateQueries({ queryKey: ["persona"] });
                }}
                type="input"
                placeholder="Mots à éviter..."
                className="text-sm text-foreground"
              />
            </div>
          </div>
        </div>

        {/* Bottom actions */}
        <div className="flex flex-wrap gap-2 mb-6">
          <Button onClick={generatePortrait} disabled={generating} variant="outline" size="sm" className="rounded-pill text-xs gap-1.5">
            {generating ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            Régénérer la fiche
          </Button>
        </div>
      </main>

      {/* Coaching panel */}
      {coachingOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/40" onClick={() => setCoachingOpen(false)} />
          <div className="relative ml-auto w-full max-w-lg bg-background h-full overflow-y-auto shadow-xl animate-fade-in">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="font-display text-lg font-bold text-foreground flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" /> Optimiser ta cliente idéale
                </h2>
                <button onClick={() => setCoachingOpen(false)} className="text-muted-foreground hover:text-foreground text-xl">✕</button>
              </div>
              <CoachingFlow
                module="persona"
                recId={recId}
                conseil={portrait ? `L'utilisatrice a déjà défini ${displayName}. Son portrait contient : frustrations (${portrait.frustrations?.length || 0} items), objectifs (${portrait.objectifs?.length || 0} items). Adapte tes questions pour creuser et challenger ce qui existe.` : undefined}
                onComplete={handleCoachingComplete}
                onSkip={() => setCoachingOpen(false)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Sub-components ── */

function SectionHeader({ icon, title }: { icon: string; title: string }) {
  return (
    <>
      <div className="border-t border-border my-5" />
      <h3 className="flex items-center gap-2 font-display text-sm font-bold text-foreground mb-3 uppercase tracking-wider">
        <span>{icon}</span> {title}
      </h3>
    </>
  );
}

function EditableList({ items, onSave }: { items: string[]; onSave: (index: number, value: string) => Promise<void> }) {
  return (
    <ul className="space-y-1.5 mb-6">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-1.5">
          <span className="shrink-0 text-muted-foreground mt-0.5">•</span>
          <EditableText
            value={item}
            onSave={(v) => onSave(i, v)}
            type="input"
            className="text-sm text-foreground"
          />
        </li>
      ))}
    </ul>
  );
}
