import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Search, Send, ChevronLeft, ChevronRight, Loader2, Mail } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";

// ── Types ──

interface UserRow {
  user_id: string;
  prenom: string;
  email: string;
  plan: string;
  ai_usage_count: number;
  last_sign_in: string | null;
  created_at: string;
}

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  html_body: string;
  category: string;
  is_active: boolean;
}

interface EmailSequence {
  id: string;
  name: string;
  trigger_event: string;
  is_active: boolean;
  created_at: string;
}

interface SequenceStep {
  id: string;
  step_number: number;
  delay_hours: number;
  template_id: string;
  template_name?: string;
}

interface EmailSend {
  id: string;
  to_email: string;
  subject: string;
  status: string;
  sent_at: string;
  resend_id: string | null;
}

// ── Helpers ──

const PLAN_FILTERS = ["all", "free", "outil", "pro", "now_pilot"] as const;
const PLAN_LABELS: Record<string, string> = { all: "Toutes", free: "Free", outil: "Assistant Com'", pro: "Pro", now_pilot: "Binôme" };

function planBadge(plan: string) {
  switch (plan) {
    case "now_pilot": return <Badge className="bg-pink-500/15 text-pink-600 border-0 text-xs">Binôme</Badge>;
    case "outil": return <Badge className="bg-violet-500/15 text-violet-600 border-0 text-xs">Outil</Badge>;
    default: return <Badge variant="secondary" className="text-xs">Free</Badge>;
  }
}

function relativeDate(dateStr: string | null) {
  if (!dateStr) return "jamais";
  const d = new Date(dateStr);
  const now = new Date();
  if (now.getTime() - d.getTime() < 86400000) return "aujourd'hui";
  return formatDistanceToNow(d, { addSuffix: true, locale: fr });
}

function formatShortDate(dateStr: string) {
  return format(new Date(dateStr), "d MMM yyyy", { locale: fr });
}

// ═══════════════════════════════════════
// SUB-VIEW 1 — Inscrites
// ═══════════════════════════════════════

function InscritesView() {
  const { session } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [planFilter, setPlanFilter] = useState("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogUser, setDialogUser] = useState<UserRow | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("libre");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [sending, setSending] = useState(false);
  const [confirmAll, setConfirmAll] = useState(false);

  useEffect(() => {
    async function load() {
      if (!session?.access_token) return;
      setLoading(true);
      try {
        const res = await supabase.functions.invoke("admin-users", {
          headers: { Authorization: `Bearer ${session.access_token}` },
          body: null,
        });
        if (res.data?.users) setUsers(res.data.users);
      } catch (e) { console.error(e); }

      const { data: tpls } = await supabase.from("email_templates").select("*").eq("is_active", true).order("name");
      if (tpls) setTemplates(tpls as any);
      setLoading(false);
    }
    load();
  }, [session?.access_token]);

  const filtered = useMemo(() => {
    let list = users;
    if (planFilter !== "all") list = list.filter(u => u.plan === planFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(u => u.prenom?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q));
    }
    return list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [users, planFilter, search]);

  const allSelected = filtered.length > 0 && filtered.every(u => selected.has(u.user_id));

  function toggleAll() {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(filtered.map(u => u.user_id)));
  }

  function toggle(uid: string) {
    const next = new Set(selected);
    if (next.has(uid)) next.delete(uid); else next.add(uid);
    setSelected(next);
  }

  function openDialog(singleUser?: UserRow) {
    setDialogUser(singleUser || null);
    setSelectedTemplateId("libre");
    setEmailSubject("");
    setEmailBody("");
    setConfirmAll(false);
    setDialogOpen(true);
  }

  function onTemplateChange(tplId: string) {
    setSelectedTemplateId(tplId);
    if (tplId !== "libre") {
      const tpl = templates.find(t => t.id === tplId);
      if (tpl) { setEmailSubject(tpl.subject); setEmailBody(tpl.html_body); }
    } else { setEmailSubject(""); setEmailBody(""); }
  }

  // Helper: resolve template variables (extracted for reuse in preview)
  function resolveVariables(html: string, subject: string, user: UserRow) {
    const vars: Record<string, string> = {
      prenom: user.prenom || "",
      email: user.email || "",
      app_url: "https://nowadaysagency.lovable.app",
    };

    let resolvedHtml = html;
    let resolvedSubject = subject;
    for (const [key, value] of Object.entries(vars)) {
      resolvedHtml = resolvedHtml.split(`{{${key}}}`).join(value);
      resolvedSubject = resolvedSubject.split(`{{${key}}}`).join(value);
    }
    return { html: resolvedHtml, subject: resolvedSubject };
  }

  const previewHtml = useMemo(() => {
    if (!emailBody) return "";
    const previewUser: UserRow = dialogUser || {
      user_id: "preview",
      prenom: "Prénom",
      email: "email@example.com",
      plan: "",
      ai_usage_count: 0,
      last_sign_in: null,
      created_at: "",
    };
    return resolveVariables(emailBody, emailSubject, previewUser).html;
  }, [emailBody, emailSubject, dialogUser]);

  async function handleSend() {
    const recipients = dialogUser
      ? [dialogUser]
      : confirmAll
        ? filtered
        : filtered.filter(u => selected.has(u.user_id));

    if (!recipients.length || !emailSubject.trim()) return;
    setSending(true);

    let successCount = 0;
    for (const r of recipients) {
      try {
        const resolved = resolveVariables(emailBody || `<p>${emailSubject}</p>`, emailSubject, r);
        const res = await supabase.functions.invoke("send-email", {
          body: {
            to: r.email,
            subject: resolved.subject,
            html: resolved.html,
            user_id: r.user_id,
            template_id: selectedTemplateId !== "libre" ? selectedTemplateId : undefined,
          },
        });
        if (res.data?.success) successCount++;
      } catch (e) { console.error(e); }
    }

    toast.success(`${successCount}/${recipients.length} email(s) envoyé(s)`);
    setSending(false);
    setDialogOpen(false);
    setSelected(new Set());
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Rechercher par nom ou email..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {PLAN_FILTERS.map(f => (
            <button key={f} onClick={() => setPlanFilter(f)} className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${planFilter === f ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
              {PLAN_LABELS[f]}
            </button>
          ))}
        </div>
        <span className="text-sm text-muted-foreground whitespace-nowrap">{filtered.length} inscrite{filtered.length > 1 ? "s" : ""}</span>
      </div>

      {selected.size > 0 && (
        <div className="flex items-center gap-3 p-3 rounded-xl bg-primary/5 border border-primary/20">
          <span className="text-sm font-medium">{selected.size} sélectionnée{selected.size > 1 ? "s" : ""}</span>
          <Button size="sm" onClick={() => openDialog()} className="gap-1.5">
            <Send className="h-3.5 w-3.5" /> Envoyer un email
          </Button>
        </div>
      )}

      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => { setConfirmAll(true); openDialog(); }}>
          <Mail className="h-3.5 w-3.5 mr-1.5" /> Envoyer à toutes ({filtered.length})
        </Button>
      </div>

      <div className="rounded-xl bg-card border overflow-hidden">
        {loading ? (
          <div className="p-4 space-y-3">{[1,2,3,4].map(i => <Skeleton key={i} className="h-8 w-full" />)}</div>
        ) : filtered.length === 0 ? (
          <p className="text-center text-muted-foreground py-12">Aucune inscrite trouvée</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="py-2 px-3 w-10"><Checkbox checked={allSelected} onCheckedChange={toggleAll} /></th>
                  <th className="text-left text-xs font-medium text-muted-foreground py-2 px-3">Prénom</th>
                  <th className="text-left text-xs font-medium text-muted-foreground py-2 px-3">Email</th>
                  <th className="text-left text-xs font-medium text-muted-foreground py-2 px-3">Plan</th>
                  <th className="text-left text-xs font-medium text-muted-foreground py-2 px-3">Dernière co.</th>
                  <th className="text-left text-xs font-medium text-muted-foreground py-2 px-3">Crédits IA</th>
                  <th className="text-left text-xs font-medium text-muted-foreground py-2 px-3">Inscrite le</th>
                  <th className="py-2 px-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(u => (
                  <tr key={u.user_id} className="hover:bg-muted/30 transition-colors">
                    <td className="py-2.5 px-3"><Checkbox checked={selected.has(u.user_id)} onCheckedChange={() => toggle(u.user_id)} /></td>
                    <td className="py-2.5 px-3 font-medium">{u.prenom || "—"}</td>
                    <td className="py-2.5 px-3 text-muted-foreground text-xs max-w-[180px] truncate">{u.email}</td>
                    <td className="py-2.5 px-3">{planBadge(u.plan)}</td>
                    <td className="py-2.5 px-3 text-xs text-muted-foreground">{relativeDate(u.last_sign_in)}</td>
                    <td className="py-2.5 px-3 text-xs">{u.ai_usage_count}</td>
                    <td className="py-2.5 px-3 text-xs text-muted-foreground">{formatShortDate(u.created_at)}</td>
                    <td className="py-2.5 px-3">
                      <Button variant="ghost" size="sm" onClick={() => openDialog(u)} className="h-7 px-2 text-xs gap-1">
                        <Mail className="h-3 w-3" /> Email
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Send Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {dialogUser ? `Email à ${dialogUser.prenom || dialogUser.email}` : confirmAll ? `Email à ${filtered.length} inscrites` : `Email à ${selected.size} sélectionnée(s)`}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Template</label>
              <Select value={selectedTemplateId} onValueChange={onTemplateChange}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="libre">✏️ Email libre</SelectItem>
                  {templates.map(t => <SelectItem key={t.id} value={t.id}>📄 {t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Sujet</label>
              <Input value={emailSubject} onChange={e => setEmailSubject(e.target.value)} placeholder="Sujet de l'email" />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Corps (HTML)</label>
              <Textarea value={emailBody} onChange={e => setEmailBody(e.target.value)} placeholder="<p>Contenu de l'email...</p>" className="min-h-[120px] font-mono text-xs" />
            </div>

            {emailBody && (
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Aperçu</label>
                <div className="border rounded-lg p-3 max-h-[200px] overflow-y-auto bg-white" dangerouslySetInnerHTML={{ __html: emailBody }} />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Annuler</Button>
            <Button onClick={handleSend} disabled={sending || !emailSubject.trim()} className="gap-1.5">
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {sending ? "Envoi..." : "Envoyer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ═══════════════════════════════════════
// SUB-VIEW 2 — Séquences
// ═══════════════════════════════════════

function SequencesView() {
  const [sequences, setSequences] = useState<EmailSequence[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [steps, setSteps] = useState<SequenceStep[]>([]);
  const [loadingSteps, setLoadingSteps] = useState(false);
  const [triggerLoading, setTriggerLoading] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from("email_sequences").select("*").order("created_at");
      if (data) setSequences(data as any);
      setLoading(false);
    }
    load();
  }, []);

  async function toggleActive(seq: EmailSequence) {
    const newVal = !seq.is_active;
    await supabase.from("email_sequences").update({ is_active: newVal } as any).eq("id", seq.id);
    setSequences(prev => prev.map(s => s.id === seq.id ? { ...s, is_active: newVal } : s));
    toast.success(newVal ? "Séquence activée" : "Séquence désactivée");
  }

  async function loadSteps(seqId: string) {
    if (expandedId === seqId) { setExpandedId(null); return; }
    setExpandedId(seqId);
    setLoadingSteps(true);
    const { data } = await supabase
      .from("email_sequence_steps")
      .select("id, step_number, delay_hours, template_id")
      .eq("sequence_id", seqId)
      .order("step_number");

    if (data?.length) {
      const tplIds = [...new Set((data as any[]).map((s: any) => s.template_id))];
      const { data: tpls } = await supabase.from("email_templates").select("id, name").in("id", tplIds);
      const tplMap = new Map((tpls || []).map((t: any) => [t.id, t.name]));
      setSteps((data as any[]).map((s: any) => ({ ...s, template_name: tplMap.get(s.template_id) || "—" })));
    } else {
      setSteps([]);
    }
    setLoadingSteps(false);
  }

  async function handleTrigger(event: string) {
    setTriggerLoading(event);
    try {
      const res = await supabase.functions.invoke("email-trigger", { body: { event } });
      if (res.error) throw new Error(res.error.message || "Erreur inconnue");
      const d = res.data || {};
      if (event === "process_queue") {
        toast.success(`File traitée : ${d.processed ?? 0} envoyés, ${d.errors ?? 0} erreurs`);
      } else if (event === "check_inactive") {
        toast.success(`${d.checked ?? 0} vérifiés, ${d.triggered ?? 0} séquences déclenchées`);
      } else if (event === "check_credits") {
        toast.success(`${d.checked ?? 0} vérifiés, ${d.triggered ?? 0} séquences déclenchées`);
      }
    } catch (e: any) {
      toast.error("Erreur : " + (e.message || "Erreur inconnue"));
    }
    setTriggerLoading(null);
  }

  const TRIGGER_LABELS: Record<string, string> = {
    signup: "🆕 Inscription",
    credits_exhausted: "💳 Crédits épuisés",
    inactive_7d: "😴 Inactif 7j",
    inactive_14d: "😴 Inactif 14j",
    plan_upgraded: "⬆️ Upgrade plan",
    manual: "🖐 Manuel",
  };

  if (loading) return <div className="p-4 space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>;

  return (
    <div className="space-y-3">
      {sequences.length === 0 ? (
        <p className="text-center text-muted-foreground py-12">Aucune séquence configurée</p>
      ) : sequences.map(seq => (
        <div key={seq.id} className="rounded-xl border bg-card overflow-hidden">
          <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/30 transition-colors" onClick={() => loadSteps(seq.id)}>
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium">{seq.name}</span>
              <Badge variant="outline" className="text-xs">{TRIGGER_LABELS[seq.trigger_event] || seq.trigger_event}</Badge>
            </div>
            <div className="flex items-center gap-3" onClick={e => e.stopPropagation()}>
              <Switch checked={seq.is_active} onCheckedChange={() => toggleActive(seq)} />
              <span className={`text-xs ${seq.is_active ? "text-green-600" : "text-muted-foreground"}`}>
                {seq.is_active ? "Active" : "Inactive"}
              </span>
            </div>
          </div>
          {expandedId === seq.id && (
            <div className="border-t px-4 py-3 bg-muted/20">
              {loadingSteps ? (
                <Skeleton className="h-8 w-full" />
              ) : steps.length === 0 ? (
                <p className="text-xs text-muted-foreground">Aucune étape configurée</p>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-muted-foreground">
                      <th className="text-left py-1 px-2">#</th>
                      <th className="text-left py-1 px-2">Délai</th>
                      <th className="text-left py-1 px-2">Template</th>
                    </tr>
                  </thead>
                  <tbody>
                    {steps.map(s => (
                      <tr key={s.id} className="border-t border-border/50">
                        <td className="py-1.5 px-2 font-medium">{s.step_number}</td>
                        <td className="py-1.5 px-2">{s.delay_hours === 0 ? "Immédiat" : `+${s.delay_hours}h`}</td>
                        <td className="py-1.5 px-2">{s.template_name}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      ))}

      <div className="bg-muted/30 border rounded-xl p-4 mt-6">
        <h3 className="text-sm font-semibold">🔧 Triggers automatiques</h3>
        <p className="text-xs text-muted-foreground mt-1">Lance manuellement les vérifications. En production, ces actions sont exécutées automatiquement par des cron jobs.</p>
        <div className="flex flex-wrap gap-2 mt-3">
          <Button variant="outline" size="sm" className="gap-1.5" disabled={!!triggerLoading} onClick={() => handleTrigger("process_queue")}>
            {triggerLoading === "process_queue" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "📬"} Traiter la file d'attente
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" disabled={!!triggerLoading} onClick={() => handleTrigger("check_inactive")}>
            {triggerLoading === "check_inactive" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "😴"} Vérifier inactivité
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" disabled={!!triggerLoading} onClick={() => handleTrigger("check_credits")}>
            {triggerLoading === "check_credits" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "💳"} Vérifier crédits
          </Button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════
// SUB-VIEW 3 — Historique
// ═══════════════════════════════════════

function HistoriqueView() {
  const [sends, setSends] = useState<EmailSend[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 20;

  useEffect(() => {
    async function load() {
      setLoading(true);
      let query = supabase.from("email_sends").select("id, to_email, subject, status, sent_at, resend_id").order("sent_at", { ascending: false }).range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
      if (statusFilter !== "all") query = query.eq("status", statusFilter);
      const { data } = await query;
      setSends((data || []) as any);
      setLoading(false);
    }
    load();
  }, [page, statusFilter]);

  return (
    <div className="space-y-4">
      <div className="flex gap-1.5">
        {["all", "sent", "failed"].map(s => (
          <button key={s} onClick={() => { setStatusFilter(s); setPage(0); }} className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${statusFilter === s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
            {s === "all" ? "Tous" : s === "sent" ? "✅ Envoyés" : "❌ Échoués"}
          </button>
        ))}
      </div>

      <div className="rounded-xl bg-card border overflow-hidden">
        {loading ? (
          <div className="p-4 space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-8 w-full" />)}</div>
        ) : sends.length === 0 ? (
          <p className="text-center text-muted-foreground py-12">Aucun email envoyé</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left text-xs font-medium text-muted-foreground py-2 px-3">Destinataire</th>
                  <th className="text-left text-xs font-medium text-muted-foreground py-2 px-3">Sujet</th>
                  <th className="text-left text-xs font-medium text-muted-foreground py-2 px-3">Statut</th>
                  <th className="text-left text-xs font-medium text-muted-foreground py-2 px-3">Date</th>
                </tr>
              </thead>
              <tbody>
                {sends.map(s => (
                  <tr key={s.id} className="hover:bg-muted/30 transition-colors border-t border-border/30">
                    <td className="py-2.5 px-3 text-xs max-w-[200px] truncate">{s.to_email}</td>
                    <td className="py-2.5 px-3 text-xs max-w-[250px] truncate">{s.subject}</td>
                    <td className="py-2.5 px-3">
                      <Badge variant={s.status === "sent" ? "default" : "destructive"} className="text-xs">
                        {s.status === "sent" ? "✅ Envoyé" : "❌ Échoué"}
                      </Badge>
                    </td>
                    <td className="py-2.5 px-3 text-xs text-muted-foreground">{s.sent_at ? formatShortDate(s.sent_at) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
          <ChevronLeft className="h-4 w-4 mr-1" /> Précédent
        </Button>
        <span className="text-xs text-muted-foreground">Page {page + 1}</span>
        <Button variant="outline" size="sm" disabled={sends.length < PAGE_SIZE} onClick={() => setPage(p => p + 1)}>
          Suivant <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════
// MAIN TAB
// ═══════════════════════════════════════

const SUB_VIEWS = [
  { key: "inscrites", label: "👥 Inscrit·es" },
  { key: "sequences", label: "🔄 Séquences" },
  { key: "historique", label: "📬 Historique" },
] as const;

type SubView = typeof SUB_VIEWS[number]["key"];

export default function AdminEmailTab() {
  const [view, setView] = useState<SubView>("inscrites");

  return (
    <div className="space-y-6">
      <div className="flex gap-1.5 border-b pb-3">
        {SUB_VIEWS.map(v => (
          <button
            key={v.key}
            onClick={() => setView(v.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              view === v.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      {view === "inscrites" && <InscritesView />}
      {view === "sequences" && <SequencesView />}
      {view === "historique" && <HistoriqueView />}
    </div>
  );
}
