import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { invokeWithTimeout } from "@/lib/invoke-with-timeout";
import { useProfile, useBrandProfile } from "@/hooks/use-profile";
import { useBrandProposition, usePersona } from "@/hooks/use-branding";
import { Link } from "react-router-dom";
import { useWorkspaceFilter } from "@/hooks/use-workspace-query";
import { useQueryClient } from "@tanstack/react-query";
import AppHeader from "@/components/AppHeader";
import { PageLoader } from "@/components/ui/spinner";
import SubPageHeader from "@/components/SubPageHeader";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { friendlyError } from "@/lib/error-messages";
import { Copy, FileText, Loader2, RefreshCw, Pencil } from "lucide-react";
import { saveImportRow, readImportRows, importTarget } from "@/lib/branding-import-persistence";
import EditableText from "@/components/EditableText";

interface RecapSummary {
  what_i_do: string[];
  what_i_dont: string[];
  for_whom: string;
  for_whom_tags: string[];
  how: string[];
  differentiator: string;
}

export default function PropositionRecapPage() {
  const { user } = useAuth();
  const { column, value } = useWorkspaceFilter();
  const queryClient = useQueryClient();
  const { data: profileData } = useProfile();
  const { data: brandProfileData } = useBrandProfile();
  const { data: propositionHookData, isLoading: propositionHookLoading } = useBrandProposition();
  const { data: personaHookData } = usePersona();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [initialReference, setInitialReference] = useState("");
  const [creating, setCreating] = useState(false);
  const [exporting, setExporting] = useState(false);
  const dataRef = useRef<any>(null);
  const saveQueue = useRef<Promise<unknown>>(Promise.resolve());
  const recapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (propositionHookLoading) return;
    dataRef.current = propositionHookData || null;
    setData(propositionHookData || null);
    setLoading(false);
  }, [propositionHookLoading, propositionHookData]);

  const summary: RecapSummary | null = data?.recap_summary as any;

  const persist = (fields: Record<string, unknown> | ((latest: any) => Record<string, unknown>)) => {
    const id = data?.id;
    const save = saveQueue.current.then(async () => {
      if (!id || !user || dataRef.current?.id !== id) throw new Error("Proposition indisponible.");
      const patch = typeof fields === "function" ? fields(dataRef.current) : fields;
      const saved = await saveImportRow("brand_proposition", { column, value, userId: user.id }, id, patch);
      if (dataRef.current?.id === id) { dataRef.current = saved; setData(saved); }
      queryClient.invalidateQueries({ queryKey: ["brand-proposition"] });
    });
    saveQueue.current = save.catch(() => {});
    return save;
  };

  const saveRecapField = async (path: string[], value: string) => {
    await persist(latest => {
      const updated = JSON.parse(JSON.stringify(latest.recap_summary));
      let obj = updated;
      for (let i = 0; i < path.length - 1; i++) obj = obj[path[i]];
      obj[path[path.length - 1]] = value;
      return { recap_summary: updated };
    });
  };

  const saveRecapArrayItem = async (arrayKey: string, index: number, value: string) => {
    await saveRecapField([arrayKey, String(index)], value);
  };

  const saveVersionField = async (field: string, value: string) => {
    await persist({ [field]: value });
  };

  const generateRecap = async () => {
    if (!data) return;
    setGenerating(true);
    try {
      const mergedProfile = { ...(profileData || {}), ...(brandProfileData || {}) };
      const { data: fnData, error } = await invokeWithTimeout("proposition-ai", {
        body: {
          type: "generate-recap",
          proposition_data: data,
          profile: mergedProfile,
          persona: personaHookData || {},
          tone: brandProfileData || {},
        },
      }, 90000);
      if (error) throw new Error(error.message);
      const raw = fnData.content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const parsed = JSON.parse(raw);
      await persist({ recap_summary: parsed });
      toast.success("Synthèse générée !");
    } catch (e: any) {
      console.error("Erreur technique:", e);
      toast.error("Erreur", { description: friendlyError(e) });
    }
    setGenerating(false);
  };

  const copyText = async (text: string) => {
    await navigator.clipboard.writeText(text);
    toast.success("Copié !");
  };

  const exportPDF = async () => {
    if (!recapRef.current) return;
    setExporting(true);
    try {
      const html2canvas = (await import("html2canvas")).default;
      const jsPDF = (await import("jspdf")).default;
      const canvas = await html2canvas(recapRef.current, { scale: 2, useCORS: true, backgroundColor: "#ffffff" });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "mm", "a4");
      const pageWidth = pdf.internal.pageSize.getWidth();
      const imgWidth = pageWidth - 20;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      pdf.addImage(imgData, "PNG", 10, 10, imgWidth, imgHeight);
      pdf.save("ma-proposition-de-valeur.pdf");
    } catch (e: any) {
      console.error("Erreur technique:", e);
      toast.error("Erreur export", { description: friendlyError(e) });
    }
    setExporting(false);
  };

  if (loading || propositionHookLoading) return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <PageLoader label="Chargement…" />
    </div>
  );

  if (!data) return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-[700px] px-6 py-8 max-md:px-4">
        <SubPageHeader parentLabel="Mon identité" parentTo="/branding" currentLabel="Ma proposition de valeur" />
        <div className="rounded-2xl bg-[hsl(var(--rose-pale))] border border-border p-6 text-center">
          <p className="text-foreground text-base mb-4">Écris la formulation de référence qui présente ton activité. Tu pourras ensuite créer ta synthèse.</p>
          <Textarea aria-label="Ma formulation de référence" value={initialReference} onChange={e => setInitialReference(e.target.value)} />
          <Button className="mt-3" disabled={!initialReference.trim() || creating} onClick={async () => {
            if (!user) return;
            setCreating(true);
            try {
              const existing = importTarget(await readImportRows("brand_proposition", { column, value, userId: user.id }));
              if (existing) { dataRef.current = existing; setData(existing); throw new Error("Une proposition existe déjà. Relis-la avant de la modifier."); }
              const saved = await saveImportRow("brand_proposition", { column, value, userId: user.id }, null, { version_final: initialReference });
              dataRef.current = saved;
              setData(saved);
              queryClient.invalidateQueries({ queryKey: ["brand-proposition"] });
            } catch (e) { toast.error(friendlyError(e)); }
            finally { setCreating(false); }
          }}>Enregistrer ma référence</Button>
        </div>
      </main>
    </div>
  );

  const VERSION_FIELDS = [
    { emoji: "🪪", label: "Bio Instagram / LinkedIn", field: "version_bio" },
    { emoji: "🎤", label: "Pitch oral / networking", field: "version_pitch_naturel" },
    { emoji: "🌐", label: "Page d'accueil site web", field: "version_site_web" },
    { emoji: "🔥", label: "Accroche engagée", field: "version_engagee" },
    { emoji: "✨", label: "One-liner mémorable", field: "version_one_liner" },
    { emoji: "🎤", label: "Networking", field: "version_networking" },
    { emoji: "📄", label: "Version complète (ancienne version)", field: "version_complete" },
    { emoji: "🎤", label: "Pitch (ancienne version)", field: "version_pitch" },
    { emoji: "✨", label: "Version courte (ancienne version)", field: "version_short" },
    { emoji: "❤️", label: "Version émotionnelle (ancienne version)", field: "version_emotional" },
  ];
  const versions = VERSION_FIELDS.filter(v => data[v.field]);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-[780px] px-6 py-8 max-md:px-4">
        <SubPageHeader parentLabel="Mon identité" parentTo="/branding" currentLabel="Ma proposition de valeur" />

        {/* Action bar */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <a href="#proposition-reference">
              <Button variant="outline" size="sm" className="rounded-pill text-xs">
                <Pencil className="h-3 w-3 mr-1" /> Modifier
              </Button>
            </a>
            <Button variant="outline" size="sm" className="rounded-pill text-xs" onClick={generateRecap} disabled={generating}>
              {generating ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-1" />}
              {summary ? "Regénérer" : "Générer la synthèse"}
            </Button>
          </div>
          <Button variant="outline" size="sm" className="rounded-pill text-xs" onClick={exportPDF} disabled={exporting || !summary}>
            {exporting ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <FileText className="h-3 w-3 mr-1" />}
            Exporter PDF
          </Button>
        </div>

        <section id="proposition-reference" className="rounded-2xl border border-border bg-card p-5 mb-6 space-y-3">
          <h2 className="font-display text-lg">Formulation de référence pour l’IA</h2>
          <p className="text-sm text-muted-foreground">
            Cette formulation est prioritaire pour la création et le Coach. La synthèse ci-dessous et les variantes se modifient séparément.
          </p>
          <EditableText preserveDraftOnError value={data.version_final || ""} onSave={(v) => saveVersionField("version_final", v)}
            placeholder="Écrire ma formulation de référence" />
          {!data.version_final && <p className="text-xs text-muted-foreground">
            Sans référence, la création utilise l’ancienne version complète, puis la bio ; le Coach utilise la version complète, puis la phrase courte. Choisis une variante ci-dessous pour leur donner la même référence.
          </p>}
          {versions.map(v => <div key={v.field} className="rounded-lg border border-border p-3 space-y-2">
            <p className="text-sm whitespace-pre-line break-words">{data[v.field]}</p>
            <Button variant="outline" size="sm" className="h-auto max-w-full whitespace-normal text-left"
            disabled={data.version_final === data[v.field]}
            onClick={async () => {
              try { await saveVersionField("version_final", data[v.field]); toast.success("Formulation de référence enregistrée."); }
              catch (e) { toast.error(friendlyError(e)); }
            }}>Utiliser : {v.label}</Button></div>)}
        </section>

        {!summary && (
          <div className="rounded-2xl bg-[hsl(var(--rose-pale))] border border-border p-8 text-center mb-6">
            <p className="text-foreground text-base mb-4">✨ Clique sur "Générer la synthèse" pour créer ta fiche récap visuelle.</p>
            <Button onClick={generateRecap} disabled={generating} className="rounded-pill">
              {generating ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Génération...</> : "✨ Générer ma fiche"}
            </Button>
          </div>
        )}

        {summary && (
          <div ref={recapRef} id="proposition-recap" className="bg-white rounded-2xl border border-[hsl(var(--border))] shadow-[var(--shadow-card)] overflow-hidden">
            <div className="px-6 pt-6 pb-4 sm:px-8 sm:pt-8">
              <h1 className="font-display text-2xl sm:text-3xl font-bold" style={{ color: "#1a1a2e" }}>💎 Ma proposition de valeur</h1>
            </div>

            {data.version_bio && (
              <div className="mx-6 sm:mx-8 mb-6 rounded-xl p-5 border-l-4" style={{ backgroundColor: "#FFF4F8", borderLeftColor: "#fb3d80" }}>
                <p className="font-mono-ui text-2xs font-semibold uppercase tracking-wider mb-3" style={{ color: "#6B5E7B" }}>Bio — variante</p>
                <EditableText preserveDraftOnError
                  value={data.version_bio}
                  onSave={(v) => saveVersionField("version_bio", v)}
                  className="font-body text-lg italic leading-relaxed"
                  type="input"
                />
                <div className="flex justify-end mt-3">
                  <CopyBtn onClick={() => copyText(data.version_bio)} />
                </div>
              </div>
            )}

            <div className="px-6 sm:px-8 mb-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <EditableListCard emoji="✅" title="Ce que je fais" items={summary.what_i_do} dotColor="#22c55e" onSaveItem={(i, v) => saveRecapArrayItem("what_i_do", i, v)} />
              <EditableListCard emoji="🚫" title="Ce que je ne fais pas" items={summary.what_i_dont} dotColor="#f87171" onSaveItem={(i, v) => saveRecapArrayItem("what_i_dont", i, v)} />
            </div>

            <div className="px-6 sm:px-8 mb-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-xl p-4" style={{ backgroundColor: "#F8F4FF" }}>
                <p className="font-mono-ui text-2xs font-semibold uppercase tracking-wider mb-3" style={{ color: "#6B5E7B" }}>🎯 Pour qui</p>
                <EditableText preserveDraftOnError
                  value={summary.for_whom}
                  onSave={(v) => saveRecapField(["for_whom"], v)}
                  className="font-body text-sm leading-relaxed mb-3"
                />
                <div className="flex flex-wrap gap-1.5">
                  {summary.for_whom_tags.map((tag, i) => (
                    <span key={i} className="px-2.5 py-0.5 rounded-pill text-2xs font-semibold" style={{ backgroundColor: "#EDE8F5", color: "#6B5E7B" }}>{tag}</span>
                  ))}
                </div>
              </div>
              <div className="rounded-xl p-4" style={{ backgroundColor: "#F8F4FF" }}>
                <p className="font-mono-ui text-2xs font-semibold uppercase tracking-wider mb-3" style={{ color: "#6B5E7B" }}>🛠️ Comment</p>
                <ul className="space-y-1.5">
                  {summary.how.map((item, i) => (
                    <li key={i} className="font-body text-sm leading-relaxed flex items-start gap-2" style={{ color: "#1a1a2e" }}>
                      <span style={{ color: "#8b5cf6" }} className="mt-0.5 shrink-0">•</span>
                      <EditableText preserveDraftOnError value={item} onSave={(v) => saveRecapArrayItem("how", i, v)} type="input" className="font-body text-sm" />
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="mx-6 sm:mx-8 mb-6 rounded-xl p-5 text-center" style={{ backgroundColor: "#FFF4F8" }}>
              <p className="font-mono-ui text-2xs font-semibold uppercase tracking-wider mb-3" style={{ color: "#6B5E7B" }}>🔥 Ce qui me rend différente</p>
              <EditableText preserveDraftOnError
                value={summary.differentiator}
                onSave={(v) => saveRecapField(["differentiator"], v)}
                className="font-body text-base italic leading-relaxed"
                type="input"
              />
            </div>

            {versions.length > 0 && (
              <div className="mx-6 sm:mx-8 mb-6 rounded-xl p-5" style={{ backgroundColor: "#F8F4FF" }}>
                <p className="font-mono-ui text-2xs font-semibold uppercase tracking-wider mb-4" style={{ color: "#6B5E7B" }}>Mes versions prêtes à l'emploi</p>
                <div className="space-y-0">
                  {versions.map((v, i) => (
                    <div key={i}>
                      {i > 0 && <div className="border-t border-dashed my-4" style={{ borderColor: "#D8D0E5" }} />}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="font-mono-ui text-2xs font-semibold uppercase tracking-wide mb-1" style={{ color: "#6B5E7B" }}>{v.emoji} {v.label}</p>
                          <EditableText preserveDraftOnError
                            value={data[v.field]}
                            onSave={(val) => saveVersionField(v.field, val)}
                            className="font-body text-sm italic leading-relaxed"
                          />
                        </div>
                        <CopyBtn onClick={() => copyText(data[v.field]!)} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="px-6 sm:px-8 py-4 border-t border-[hsl(var(--border))]">
              <p className="text-center font-mono-ui text-2xs uppercase tracking-wider" style={{ color: "#6B5E7B" }}>L'Assistant Com' × Nowadays Agency</p>
            </div>
          </div>
        )}

        <div className="mt-6">
          <Link to="/branding" className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">← Retour au Branding</Link>
        </div>
      </main>
    </div>
  );
}

function EditableListCard({ emoji, title, items, dotColor, onSaveItem }: { emoji: string; title: string; items: string[]; dotColor: string; onSaveItem: (i: number, v: string) => Promise<void> }) {
  return (
    <div className="rounded-xl border p-4" style={{ borderColor: "#E5E0EB", backgroundColor: "#ffffff" }}>
      <p className="font-mono-ui text-2xs font-semibold uppercase tracking-wider mb-3" style={{ color: "#6B5E7B" }}>{emoji} {title}</p>
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li key={i} className="font-body text-sm leading-relaxed flex items-start gap-2" style={{ color: "#1a1a2e" }}>
            <span style={{ color: dotColor }} className="mt-0.5 shrink-0">•</span>
            <EditableText preserveDraftOnError value={item} onSave={(v) => onSaveItem(i, v)} type="input" className="font-body text-sm" />
          </li>
        ))}
      </ul>
    </div>
  );
}

function CopyBtn({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="shrink-0 inline-flex items-center gap-1 text-2xs font-semibold hover:opacity-70 transition-opacity" style={{ color: "#fb3d80" }}>
      <Copy className="h-3 w-3" /> Copier
    </button>
  );
}
