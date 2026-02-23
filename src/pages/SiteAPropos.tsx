import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Copy, RefreshCw, FileText, Pencil, Check } from "lucide-react";
import { TextareaWithVoice as Textarea } from "@/components/ui/textarea-with-voice";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

interface ValueBlock { title: string; description: string }

interface AboutData {
  id?: string;
  angle?: string;
  title?: string;
  story?: string;
  values_blocks?: ValueBlock[];
  approach?: string;
  for_whom?: string;
  cta?: string;
  custom_facts?: { label: string; value: string }[];
}

const ANGLES = [
  { id: "lettre", emoji: "💌", label: "La lettre ouverte", desc: "Ton intimiste, comme si tu écrivais à ta future cliente." },
  { id: "manifeste", emoji: "✊", label: "Le manifeste", desc: "Ton engagé, tes convictions d'abord." },
  { id: "parcours", emoji: "🛤️", label: "Le parcours", desc: "Ton narratif, chronologique, ton histoire." },
];

export default function SiteAPropos() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [data, setData] = useState<AboutData | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [selectedAngle, setSelectedAngle] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [exporting, setExporting] = useState(false);
  const recapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;
    supabase.from("website_about").select("*").eq("user_id", user.id).maybeSingle()
      .then(({ data: d }) => {
        if (d) {
          setData({
            ...d,
            values_blocks: Array.isArray(d.values_blocks) ? d.values_blocks as unknown as ValueBlock[] : [],
            custom_facts: Array.isArray(d.custom_facts) ? d.custom_facts as unknown as { label: string; value: string }[] : [],
          });
          setSelectedAngle(d.angle || null);
        }
        setLoading(false);
      });
  }, [user?.id]);

  const generate = async (angle: string) => {
    if (!user) return;
    setGenerating(true);
    setSelectedAngle(angle);
    try {
      const { data: fnData, error } = await supabase.functions.invoke("website-ai", {
        body: { action: "about-page", angle },
      });
      if (error) throw error;
      const raw = fnData.content.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(raw);

      const aboutData: AboutData = {
        angle,
        title: parsed.title,
        story: parsed.story,
        values_blocks: parsed.values || [],
        approach: parsed.approach,
        for_whom: parsed.for_whom,
        cta: parsed.cta,
      };

      const { data: existing } = await supabase.from("website_about").select("id").eq("user_id", user.id).maybeSingle();
      if (existing) {
        await supabase.from("website_about").update({ ...aboutData, updated_at: new Date().toISOString() } as any).eq("user_id", user.id);
        setData({ ...aboutData, id: existing.id, custom_facts: data?.custom_facts || [] });
      } else {
        const { data: inserted } = await supabase.from("website_about").insert({ user_id: user.id, ...aboutData } as any).select("id").single();
        setData({ ...aboutData, id: inserted?.id, custom_facts: [] });
      }
      toast({ title: "Page à propos générée !" });
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  const copyAll = () => {
    if (!data) return;
    const parts = [
      data.title,
      data.story,
      data.values_blocks?.map(v => `${v.title}\n${v.description}`).join("\n\n"),
      data.approach,
      data.for_whom,
      data.cta,
    ].filter(Boolean);
    navigator.clipboard.writeText(parts.join("\n\n---\n\n"));
    toast({ title: "Copié !" });
  };

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copié !" });
  };

  const startEdit = (field: string, currentValue: string) => {
    setEditingField(field);
    setEditValue(currentValue);
  };

  const saveEdit = async (field: string) => {
    if (!user || !data) return;
    const update: any = { [field]: editValue, updated_at: new Date().toISOString() };
    await supabase.from("website_about").update(update).eq("user_id", user.id);
    setData({ ...data, [field]: editValue });
    setEditingField(null);
    toast({ title: "Sauvegardé !" });
  };

  const exportPDF = async () => {
    if (!recapRef.current) return;
    setExporting(true);
    try {
      const canvas = await html2canvas(recapRef.current, { scale: 2, useCORS: true, backgroundColor: "#ffffff" });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "mm", "a4");
      const pageW = pdf.internal.pageSize.getWidth();
      const imgW = pageW - 20;
      const imgH = (canvas.height * imgW) / canvas.width;
      pdf.addImage(imgData, "PNG", 10, 10, imgW, imgH);
      pdf.save("ma-page-a-propos.pdf");
    } finally {
      setExporting(false);
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <div className="flex justify-center py-20"><p className="text-muted-foreground">Chargement...</p></div>
    </div>
  );

  // No data yet: show angle selection
  if (!data?.title) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <main className="mx-auto max-w-[700px] px-6 py-8 max-md:px-4">
          <SubPageHeader parentLabel="Mon Site Web" parentTo="/site" currentLabel="Page à propos" />
          <h1 className="font-display text-[26px] font-bold text-foreground mb-2">📖 Ma page À propos</h1>
          <p className="text-[15px] text-muted-foreground mb-8">
            L'IA rédige ta page à propos à partir de ton branding. Choisis d'abord un angle.
          </p>

          <div className="space-y-3">
            {ANGLES.map(a => (
              <button
                key={a.id}
                onClick={() => generate(a.id)}
                disabled={generating}
                className={`w-full text-left rounded-2xl border-2 p-5 transition-all ${
                  generating && selectedAngle === a.id
                    ? "border-primary bg-rose-pale"
                    : "border-border hover:border-primary hover:shadow-md bg-card"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{a.emoji}</span>
                  <div className="flex-1">
                    <p className="font-display text-base font-bold text-foreground">{a.label}</p>
                    <p className="text-[13px] text-muted-foreground">{a.desc}</p>
                  </div>
                  {generating && selectedAngle === a.id && <Loader2 className="h-5 w-5 animate-spin text-primary" />}
                </div>
              </button>
            ))}
          </div>

          {generating && (
            <div className="mt-6 text-center">
              <p className="text-sm text-muted-foreground animate-pulse">✨ Génération en cours... L'IA rédige ta page à propos.</p>
            </div>
          )}
        </main>
      </div>
    );
  }

  // Display the generated about page
  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-4xl px-6 py-8 max-md:px-4">
        <SubPageHeader parentLabel="Mon Site Web" parentTo="/site" currentLabel="Page à propos" />

        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <Button variant="outline" size="sm" onClick={copyAll}>
            <Copy className="h-3.5 w-3.5 mr-1" /> Copier tout
          </Button>
          <Button variant="outline" size="sm" onClick={() => generate(data.angle || "parcours")} disabled={generating}>
            {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
            Regénérer
          </Button>
          <Button variant="outline" size="sm" onClick={exportPDF} disabled={exporting}>
            <FileText className="h-3.5 w-3.5 mr-1" /> PDF
          </Button>
        </div>

        <div ref={recapRef} className="bg-white rounded-2xl border border-[hsl(var(--border))] p-8 max-md:p-5">
          {/* Title */}
          <SectionBlock
            label="🎯 Titre d'accroche"
            text={data.title || ""}
            field="title"
            editing={editingField}
            editValue={editValue}
            onEdit={startEdit}
            onSave={saveEdit}
            onEditChange={setEditValue}
            onCopy={copyText}
          />

          {/* Story */}
          <SectionBlock
            label="👑 Mon histoire"
            text={data.story || ""}
            field="story"
            editing={editingField}
            editValue={editValue}
            onEdit={startEdit}
            onSave={saveEdit}
            onEditChange={setEditValue}
            onCopy={copyText}
          />

          {/* Values */}
          {data.values_blocks && data.values_blocks.length > 0 && (
            <div className="mb-8">
              <div className="flex items-center justify-between mb-3">
                <p style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, color: "#6B5E7B" }}>
                  ❤️ Mes valeurs
                </p>
                <button onClick={() => copyText(data.values_blocks!.map(v => `${v.title}\n${v.description}`).join("\n\n"))}
                  className="text-xs font-semibold hover:opacity-70" style={{ color: "#fb3d80" }}>
                  <Copy className="h-3 w-3 inline mr-1" />Copier
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {data.values_blocks.map((v, i) => (
                  <div key={i} className="rounded-xl p-4" style={{ backgroundColor: "#FFF4F8" }}>
                    <p style={{ fontWeight: 600, fontSize: 14, color: "#1a1a2e", marginBottom: 4 }}>{v.title}</p>
                    <p style={{ fontSize: 13, color: "#4B5563", lineHeight: 1.6 }}>{v.description}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Approach */}
          <SectionBlock
            label="🛠️ Mon approche"
            text={data.approach || ""}
            field="approach"
            editing={editingField}
            editValue={editValue}
            onEdit={startEdit}
            onSave={saveEdit}
            onEditChange={setEditValue}
            onCopy={copyText}
          />

          {/* For whom */}
          <SectionBlock
            label="🎯 Pour qui"
            text={data.for_whom || ""}
            field="for_whom"
            editing={editingField}
            editValue={editValue}
            onEdit={startEdit}
            onSave={saveEdit}
            onEditChange={setEditValue}
            onCopy={copyText}
          />

          {/* CTA */}
          <SectionBlock
            label="🔘 CTA"
            text={data.cta || ""}
            field="cta"
            editing={editingField}
            editValue={editValue}
            onEdit={startEdit}
            onSave={saveEdit}
            onEditChange={setEditValue}
            onCopy={copyText}
            isLast
          />

          {/* Footer */}
          <p style={{ textAlign: "center", fontSize: 11, color: "#D1D5DB", marginTop: 32 }}>
            L'Assistant Com' × Nowadays Agency
          </p>
        </div>
      </main>
    </div>
  );
}

function SectionBlock({
  label, text, field, editing, editValue, onEdit, onSave, onEditChange, onCopy, isLast = false,
}: {
  label: string; text: string; field: string;
  editing: string | null; editValue: string;
  onEdit: (field: string, val: string) => void;
  onSave: (field: string) => void;
  onEditChange: (val: string) => void;
  onCopy: (text: string) => void;
  isLast?: boolean;
}) {
  const isEditing = editing === field;
  return (
    <div className={isLast ? "" : "mb-8"}>
      <div className="flex items-center justify-between mb-2">
        <p style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, color: "#6B5E7B" }}>
          {label}
        </p>
        <div className="flex items-center gap-2">
          <button onClick={() => onCopy(text)} className="text-xs font-semibold hover:opacity-70" style={{ color: "#fb3d80" }}>
            <Copy className="h-3 w-3 inline mr-1" />Copier
          </button>
          {isEditing ? (
            <button onClick={() => onSave(field)} className="text-xs font-semibold hover:opacity-70 text-green-600">
              <Check className="h-3 w-3 inline mr-1" />OK
            </button>
          ) : (
            <button onClick={() => onEdit(field, text)} className="text-xs font-semibold hover:opacity-70 text-muted-foreground">
              <Pencil className="h-3 w-3 inline mr-1" />Modifier
            </button>
          )}
        </div>
      </div>
      {isEditing ? (
        <Textarea
          value={editValue}
          onChange={(e) => onEditChange(e.target.value)}
          className="min-h-[100px] text-sm"
          autoFocus
        />
      ) : (
        <p style={{ fontSize: 14, color: "#1a1a2e", lineHeight: 1.7, whiteSpace: "pre-line" }}>{text}</p>
      )}
    </div>
  );
}
