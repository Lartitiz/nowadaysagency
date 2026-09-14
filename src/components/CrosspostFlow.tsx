import CrosspostSources from "@/components/crosspost/CrosspostSources";
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { crosspostText, crosspostEnvelope, CROSSPOST_TARGETS, type CrosspostResult } from '@/lib/crosspost-content';
import { crosspostScope, archiveCrosspost, crosspostHistory, readCrosspost, persistCrosspost, createCrosspostSession, saveCrosspostCalendar, saveCrosspostIdea } from '@/lib/crosspost-persistence';
import { generateCrosspost } from '@/lib/crosspost-generation';
import { calendarSaveError } from '@/lib/calendar-persistence';
import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { TextareaWithVoice as Textarea } from "@/components/ui/textarea-with-voice";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { friendlyError } from "@/lib/error-messages";
import { handleQuotaError } from "@/lib/quota-error-handler";
import { RefreshCw, Copy, Check, Sparkles, Loader2, CalendarDays, Lightbulb } from "lucide-react";
import RedFlagsChecker from "@/components/RedFlagsChecker";
import BaseReminder from "@/components/BaseReminder";
import AiGeneratedMention from "@/components/AiGeneratedMention";
import CrosspostFileUploader, { type UploadedFile } from "@/components/crosspost/CrosspostFileUploader";
import { cn } from "@/lib/utils";
import { AddToCalendarDialog } from "@/components/calendar/AddToCalendarDialog";
import { SaveToIdeasDialog } from "@/components/SaveToIdeasDialog";
import { toast } from "sonner";
import { useWorkspaceId, useProfileUserId, useWorkspaceReady } from "@/hooks/use-workspace-query";

const SOURCE_TYPES = [
  // TODO: à réactiver quand le générateur newsletter sera prêt (aligné avec LinkedInCrosspost)
  // { id: "newsletter", label: "📧 Ma newsletter" },
  { id: "instagram", label: "📸 Mon post Instagram" },
  { id: "linkedin", label: "💼 Mon post LinkedIn" },
  { id: "libre", label: "📝 Texte libre" },
];

const TARGET_CHANNELS = [
  { id: "linkedin", label: "💼 Post LinkedIn", desc: "Version expert·e, données" },
  { id: "instagram", label: "📸 Carrousel Instagram", desc: "Version visuelle, pédago" },
  { id: "reel", label: "🎬 Script Reel", desc: "Version punchy, 30-60 sec" },
  { id: "stories", label: "📱 Séquence Stories", desc: "Version intime, 5 stories" },
];

export default function CrosspostFlow() {
  const { user } = useAuth();
  const workspaceId = useWorkspaceId();
  return <CrosspostWorkspace key={`${user?.id}:${workspaceId}`} />;
}

function CrosspostWorkspace() {
  const { user } = useAuth();
  const workspaceId = useWorkspaceId();
  const ownerId = useProfileUserId();
  const ready = useWorkspaceReady();
  const { activeRole, activeWorkspace } = useWorkspace();
  const allowed = ready && !!user && !!ownerId && (!activeWorkspace || ['owner', 'manager', 'editor'].includes(activeRole));
  const scope = crosspostScope(user?.id || '', workspaceId);
  const [history, setHistory] = useState<ReturnType<typeof crosspostHistory>>([]);
  const [draft] = useState(() => { try { return JSON.parse(sessionStorage.getItem(`${scope}:draft`) || 'null'); } catch { return null; } });
  const [session, setSession] = useState(() => readCrosspost(scope));
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const result = session?.result || null;
  const [sourceType, setSourceType] = useState(draft?.sourceType || session?.source.source_type || 'libre');
  const [sourceContent, setSourceContent] = useState(draft?.sourceContent ?? session?.source.source_text ?? '');
  const [targets, setTargets] = useState<Set<string>>(new Set(draft?.targets || ['linkedin', 'instagram']));
  const [generating, setGenerating] = useState(false);
  const busy = useRef(false);
  const mounted = useRef(true);
  const [copied, setCopied] = useState<string | null>(null);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const filesRef = useRef(files); filesRef.current = files;
  useEffect(() => { mounted.current = true; return () => {
    mounted.current = false;
    filesRef.current.forEach(f => { if (f.preview) URL.revokeObjectURL(f.preview); });
  }; }, []);
  const [inputMode, setInputMode] = useState<'text' | 'files' | 'both'>(draft?.inputMode || 'text');
  const [showCalendarDialog, setShowCalendarDialog] = useState(false);
  const [showIdeasDialog, setShowIdeasDialog] = useState(false);
  const [activeVersionKey, setActiveVersionKey] = useState(Object.keys(result?.versions || {})[0] || '');
  const [addingToCalendar, setAddingToCalendar] = useState(false);
  const [planMode, setPlanMode] = useState<'one' | 'all'>('one');
  useEffect(() => {
    try { sessionStorage.setItem(`${scope}:draft`, JSON.stringify({ sourceType, sourceContent, targets: Array.from(targets), inputMode })); }
    catch { /* Saving an operation reports persistence failure before any write. */ }
  }, [scope, sourceType, sourceContent, targets, inputMode]);
  const setResult = (next: CrosspostResult) => {
    if (!session) return;
    // An explicit correction is a new revision; keep the original and receipts.
    const updated = createCrosspostSession(next, { ...session.source,
      previous_revisions: [session] });
    setSession(updated);
    try { persistCrosspost(scope, updated); archiveCrosspost(scope, session); }
    catch { toast.error('La reprise après fermeture n’est pas disponible. Garde cet onglet ouvert pour conserver ta correction.'); }
  };

  const toggleTarget = (id: string) => {
    const next = new Set(targets);
    if (next.has(id)) {
      if (next.size <= 1) return;
      next.delete(id);
    } else {
      next.add(id);
    }
    setTargets(next);
  };

  const canGenerate = () => allowed && targets.size > 0 &&
    (inputMode === 'files' ? files.length > 0 : sourceContent.length <= 10000 &&
      (sourceContent.trim().length > 0 || (inputMode === 'both' && files.length > 0)));

  const generate = async () => {
    if (!canGenerate() || busy.current) return;
    busy.current = true; setGenerating(true);
    const requestId = crypto.randomUUID();
    try {
      sessionStorage.setItem(`${scope}:request`, requestId);
      await generateCrosspost({ userId: user!.id, workspaceId: activeWorkspace?.id || null,
        sourceType, text: sourceContent, mode: inputMode, files, targets: Array.from(targets) }, (next, source) => {
        const previous = sessionRef.current;
        const fresh = createCrosspostSession(next, { ...source, ...(previous ? { previous_revisions: [previous] } : {}) });
        // Store against the originating space even if a response arrives after switching.
        if (sessionStorage.getItem(`${scope}:request`) !== requestId) {
          // A newer request owns this space. Retain the old paid result separately.
          sessionStorage.setItem(`${scope}:late:${fresh.id}`, JSON.stringify(fresh));
          return;
        }
        if (mounted.current) setSession(fresh);
        persistCrosspost(scope, fresh);
        if (previous) { try { archiveCrosspost(scope, previous); } catch { /* previous result is also in fresh provenance */ } }
        if (mounted.current) { setSession(fresh); setActiveVersionKey(Object.keys(next.versions).find(k => CROSSPOST_TARGETS.includes(k as any)) || ''); }
      });
    } catch (e: any) {
      if (mounted.current && !handleQuotaError({ message: e?.message, data: e?.data })) toast.error(friendlyError(e));
    } finally { busy.current = false; if (mounted.current) setGenerating(false); }
  };

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    }).catch(() => {
      toast.error("Copie impossible : sélectionne et copie le texte manuellement.");
    });
  };

  const getActiveChannelLabel = () => TARGET_CHANNELS.find((c) => c.id === activeVersionKey)?.label || activeVersionKey;
  const getActiveFormat = () => {
    if (activeVersionKey === "reel") return "reel";
    if (activeVersionKey === "stories") return "story_serie";
    if (activeVersionKey === "instagram") return "carousel";
    return "post";
  };

  const plan = async (date: string, keys: string[]) => {
    if (!allowed || !session || busy.current) return;
    busy.current = true; setAddingToCalendar(true);
    let confirmed = 0;
    try {
      for (const key of keys) {
        if (!mounted.current) return;
        const receipt = await saveCrosspostCalendar(session, scope, key, date, ownerId, activeWorkspace?.id || null);
        confirmed++;
        if (mounted.current && receipt.replayed) toast.info(`Version déjà enregistrée au ${receipt.date}. Elle n’a pas été remplacée.`);
      }
      if (mounted.current) { setShowCalendarDialog(false); toast.success(`${confirmed} contenu(s) enregistré(s) au calendrier.`); }
    } catch (e) {
      if (mounted.current) toast.error(`${confirmed ? `${confirmed} contenu(s) confirmé(s). ` : ''}${calendarSaveError(e)} Réessaie pour reprendre les versions restantes.`);
    } finally { busy.current = false; if (mounted.current) setAddingToCalendar(false); }
  };
  const handleAddToCalendar = (date: string) => plan(date, [activeVersionKey]);
  const handleAddAllToCalendar = (date: string) => plan(date, Object.keys(result?.versions || {}).filter(k => CROSSPOST_TARGETS.includes(k as any)));

  const versionCount = result?.versions ? Object.keys(result.versions).filter(k => CROSSPOST_TARGETS.includes(k as any)).length : 0;

  return (
    <>
      {!allowed && <p className="text-sm text-muted-foreground mb-4">Enregistrement disponible après chargement de l’espace, avec un droit de modification.</p>}
      <details className="text-sm mb-4" onToggle={() => setHistory(crosspostHistory(scope))}>
        <summary className="cursor-pointer text-muted-foreground">Résultats conservés dans cet onglet</summary>
        {history.filter(h => h.id !== session?.id).map((h, i) => <Button key={h.id} variant="outline" size="sm" className="mt-2 mr-2" disabled={generating || addingToCalendar} onClick={() => {
          if (session) archiveCrosspost(scope, session);
          persistCrosspost(scope, h); setSession(h);
          setActiveVersionKey(Object.keys(h.result.versions).find(k => CROSSPOST_TARGETS.includes(k as any)) || '');
        }}>Reprendre le résultat {i + 1} · {h.source.source_type}</Button>)}
        {!history.some(h => h.id !== session?.id) && <p className="mt-2 text-muted-foreground">Aucun autre résultat conservé.</p>}
      </details>
      {/* Input mode toggle */}
      <div className="mb-4">
        <p className="text-sm font-medium text-foreground mb-2">Ton contenu source :</p>
        <div className="flex gap-2 mb-3">
          {([
            { key: "text" as const, label: "✏️ Texte" },
            { key: "files" as const, label: "📎 Fichiers" },
            { key: "both" as const, label: "✏️📎 Les deux" },
          ]).map((m) => (
            <button
              key={m.key}
              onClick={() => setInputMode(m.key)}
              className={cn(
                "text-sm px-4 py-2 rounded-full border transition-all flex items-center gap-1.5",
                inputMode === m.key ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/40"
              )}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* Text input */}
        {(inputMode === "text" || inputMode === "both") && (
          <>
            <div className="flex flex-wrap gap-2 mb-2">
              {SOURCE_TYPES.map((s) => (
                <button key={s.id} onClick={() => setSourceType(s.id)} className={`text-xs px-3 py-1.5 rounded-full border transition-all ${sourceType === s.id ? "bg-primary/10 text-primary border-primary/30" : "border-border hover:border-primary/40 text-muted-foreground"}`}>
                  {s.label}
                </button>
              ))}
            </div>
            <Textarea
              value={sourceContent}
              onChange={(e) => setSourceContent(e.target.value)}
              placeholder={inputMode === "both" ? "Ajoute du contexte ou du texte complémentaire..." : "Colle ton contenu ici..."}
              className="min-h-[120px] mb-1"
            />
            <p className={`text-xs ${sourceContent.length > 10000 ? "text-destructive" : "text-muted-foreground"}`}>
              {sourceContent.length} / 10 000 caractères
            </p>
            {sourceContent.length > 10000 && (
              <p className="text-xs text-destructive mt-1">
                Ton contenu est un peu long pour être traité d'un coup. Garde l'essentiel ou découpe-le en deux passages.
              </p>
            )}
          </>
        )}

        {/* File upload */}
        {(inputMode === "files" || inputMode === "both") && (
          <CrosspostFileUploader
            files={files}
            onFilesChange={setFiles}
            maxFiles={10}
            disabled={generating}
          />
        )}
      </div>

      {/* Target channels */}
      <div className="mb-5">
        <p className="text-sm font-medium text-foreground mb-2">Transformer en :</p>
        <div className="grid grid-cols-2 gap-2">
          {TARGET_CHANNELS.map((ch) => {
            const isActive = targets.has(ch.id);
            return (
              <button
                key={ch.id}
                onClick={() => toggleTarget(ch.id)}
                className={cn(
                  "rounded-xl border-2 p-3 text-left transition-all relative",
                  isActive
                    ? "border-primary bg-primary/10 ring-1 ring-primary/20"
                    : "border-border hover:border-primary/40 opacity-60"
                )}
              >
                {isActive && (
                  <span className="absolute top-2 right-2 text-primary text-xs font-bold">✓</span>
                )}
                <span className="text-sm font-semibold block">{ch.label}</span>
                <span className="text-xs text-muted-foreground">{ch.desc}</span>
              </button>
            );
          })}
        </div>
        {targets.size > 0 && (
          <p className="text-xs text-muted-foreground mt-1.5">
            {targets.size} {targets.size > 1 ? "canaux sélectionnés" : "canal sélectionné"} · clique pour ajouter/retirer
          </p>
        )}
      </div>

      <Button onClick={generate} disabled={generating || !canGenerate()} className="rounded-full gap-2 mb-6">
        {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        {generating
          ? files.length > 0
            ? `Extraction de ${files.length} fichier${files.length > 1 ? "s" : ""} + adaptation...`
            : "Adaptation en cours..."
          : "✨ Adapter pour chaque canal"
        }
      </Button>

      {/* Results */}
      {result && result.versions && !generating && (
        <div className="space-y-4 animate-fade-in">
          {versionCount > 1 && (
            <div className="flex items-center justify-between gap-2 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
              <p className="text-sm font-medium text-foreground">
                {versionCount} versions adaptées prêtes
              </p>
              <Button disabled={!allowed} size="sm" onClick={() => { setPlanMode("all"); setShowCalendarDialog(true); }} className="rounded-full gap-1.5">
                <CalendarDays className="h-3.5 w-3.5" /> Tout planifier
              </Button>
            </div>
          )}
          <Tabs value={activeVersionKey} onValueChange={setActiveVersionKey}>
            <TabsList>
              {Object.keys(result.versions).filter(k => CROSSPOST_TARGETS.includes(k as any)).map((key) => {
                const label = TARGET_CHANNELS.find((c) => c.id === key)?.label || key;
                return <TabsTrigger key={key} value={key}>{label}</TabsTrigger>;
              })}
            </TabsList>
            {Object.entries(result.versions).filter(([k]) => CROSSPOST_TARGETS.includes(k as any)).map(([key, version]) => {
              const text = crosspostText(version);
              return (
                <TabsContent key={key} value={key} className="space-y-3">
                  <div className="rounded-xl border border-border bg-card p-5">
                    <p className="whitespace-pre-line text-sm text-foreground leading-relaxed">{text}</p>
                    {version.character_count && (
                      <p className="text-xs text-muted-foreground mt-3">📊 {version.character_count} caractères</p>
                    )}
                    <p className="text-xs text-primary mt-1">💡 Angle choisi : {version.angle_choisi}</p>
                  </div>
                  {(typeof version.full_text === "string" || typeof version.script === "string") && (
                    <RedFlagsChecker content={text} onFix={(fixed) => {
                      if (!result) return;
                      const updatedVersions = { ...result.versions };
                      const version = updatedVersions[key];
                      if (version.full_text) updatedVersions[key] = { ...version, full_text: fixed };
                      else if (version.script) updatedVersions[key] = { ...version, script: fixed };
                      setResult({ ...result, versions: updatedVersions });
                    }} />
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => handleCopy(text, key)} className="rounded-full gap-1.5">
                      {copied === key ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      {copied === key ? "Copié !" : "Copier"}
                    </Button>
                    <Button disabled={!allowed} variant="outline" size="sm" onClick={() => { setActiveVersionKey(key); setPlanMode("one"); setShowCalendarDialog(true); }} className="rounded-full gap-1.5">
                      <CalendarDays className="h-3.5 w-3.5" /> Planifier
                    </Button>
                    <Button disabled={!allowed} variant="outline" size="sm" onClick={() => { setActiveVersionKey(key); setShowIdeasDialog(true); }} className="rounded-full gap-1.5">
                      <Lightbulb className="h-3.5 w-3.5" /> Sauvegarder en idée
                    </Button>
                  </div>
                </TabsContent>
              );
            })}
          </Tabs>
          <CrosspostSources data={session ? crosspostEnvelope(session.result, activeVersionKey, session.source) : null} />
          <AiGeneratedMention />
          <BaseReminder variant="atelier" />

          <AddToCalendarDialog
            open={showCalendarDialog}
            onOpenChange={setShowCalendarDialog}
            onConfirm={planMode === "all" ? handleAddAllToCalendar : handleAddToCalendar}
            contentLabel={planMode === "all"
              ? `🔄 Planifier les ${versionCount} versions à la même date`
              : `🔄 Crosspost ${getActiveChannelLabel()}`}
            contentEmoji="🔄"
            loading={addingToCalendar}
          />
          <SaveToIdeasDialog
            open={showIdeasDialog}
            onOpenChange={setShowIdeasDialog}
            contentType={activeVersionKey === "linkedin" ? "post_linkedin" : activeVersionKey === "reel" ? "reel" : activeVersionKey === "stories" ? "story" : "post_instagram"}
            subject={`Crosspost ${getActiveChannelLabel()} : ${session?.source.source_type || sourceType}`}
            contentData={session ? crosspostEnvelope(session.result, activeVersionKey, session.source) : {}}
            isSaveCurrent={() => mounted.current}
            onSaveContent={async (fields) => {
              if (!allowed || !session || !mounted.current) throw new Error('Cet espace n’est pas disponible pour enregistrer.');
              return saveCrosspostIdea(session, scope, activeVersionKey, fields, ownerId, activeWorkspace?.id || null);
            }}
            sourceModule="crosspost"
            format={getActiveFormat()}
          />
        </div>
      )}
    </>
  );
}
