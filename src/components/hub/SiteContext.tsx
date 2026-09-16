import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useDemoContext } from "@/contexts/DemoContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useWorkspaceFilter } from "@/hooks/use-workspace-query";
import { readImportRows, importTarget, saveImportRow } from "@/lib/branding-import-persistence";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { PresenceLink } from "./PresenceLayout";

const CMS_OPTIONS = [
  ["squarespace", "Squarespace"], ["wordpress", "WordPress"], ["shopify", "Shopify"],
  ["wix", "Wix"], ["autre", "Autre"], ["none", "Je n’ai pas encore de site"],
] as const;

/** Mounted inside PresenceScope; a response from a closed visit cannot update the next one. */
export default function SiteContext() {
  const { user } = useAuth();
  const { isDemoMode } = useDemoContext();
  const { column, value } = useWorkspaceFilter();
  const { activeRole, switchingWorkspaceId } = useWorkspace();
  const writable = !isDemoMode && !switchingWorkspaceId && ["owner", "manager", "editor"].includes(activeRole ?? "");
  const active = useRef(true);
  useLayoutEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const [profile, setProfile] = useState<{ id: string; cms: string | null } | null>(null);
  const [score, setScore] = useState<number | null>(null);
  const [auditError, setAuditError] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const [saveError, setSaveError] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (isDemoMode) { setLoading(false); return; }
    if (!user) return;
    let current = true;
    setLoading(true); setLoadError(false); setAuditError(false);
    const scope = { column, value, userId: user.id };
    const profileRead = readImportRows("website_profile", scope).then(rows => {
      const row = importTarget(rows);
      if (current) { setProfile(row ? { id: row.id, cms: row.cms } : null); setDraft(row?.cms ?? ""); }
    }).catch(() => { if (current) setLoadError(true); });
    let audit = supabase.from("website_audit").select("score_global").eq(column as "workspace_id" | "user_id", value);
    if (column === "user_id") audit = audit.is("workspace_id", null);
    const auditRead = Promise.resolve(audit.order("created_at", { ascending: false }).limit(1).maybeSingle()).then(({ data, error }) => {
      if (!current) return;
      if (error) { setAuditError(true); setScore(null); }
      else setScore(data?.score_global ?? null);
    }).catch(() => { if (current) { setAuditError(true); setScore(null); } });
    Promise.all([profileRead, auditRead]).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [user?.id, column, value, isDemoMode, retry]);

  async function save() {
    if (!user || !writable || loading || loadError || busy.current || !draft) return;
    busy.current = true; setSaving(true); setSaveError(false); setSaved(false);
    try {
      const row = await saveImportRow("website_profile", { column, value, userId: user.id }, profile?.id ?? null, { cms: draft });
      if (!active.current) return;
      setProfile({ id: row.id, cms: row.cms }); setDraft(row.cms ?? ""); setEditing(false); setSaved(true);
    } catch {
      if (active.current) setSaveError(true);
    } finally {
      busy.current = false;
      if (active.current) setSaving(false);
    }
  }

  return <div className="mt-7 space-y-4">
    {!loading && !auditError && score !== null && score < 60 && <div className="rounded-xl border border-border bg-rose-pale/40 p-4">
      <p className="text-sm text-foreground">Ton dernier audit : <strong>{score}/100</strong>. Retrouve les points à améliorer dans tes recommandations.</p>
      <PresenceLink to="/site/audit">Voir mon audit</PresenceLink>
    </div>}
    {auditError && <p className="text-sm text-muted-foreground" role="status">Le dernier audit n’a pas pu être chargé. <button onClick={() => setRetry(n => n + 1)} className="min-h-11 underline">Réessayer de charger l’audit</button></p>}
    <details className="border-t border-border py-4">
      <summary className="cursor-pointer text-sm font-medium text-foreground">Mon outil de site web · facultatif</summary>
      <p className="my-3 text-sm text-muted-foreground">Ce repère adapte les conseils pour intégrer tes textes. Tu peux commencer sans le renseigner.</p>
      {loading ? <p role="status" className="text-sm">Chargement de mon outil…</p>
        : loadError ? <p role="alert" className="text-sm">Impossible de charger ton choix. <button onClick={() => setRetry(n => n + 1)} className="min-h-11 underline">Réessayer</button></p>
        : <>
          {!editing && <div className="flex flex-wrap items-center gap-3 text-sm">
            <span>{CMS_OPTIONS.find(([key]) => key === profile?.cms)?.[1] ?? profile?.cms ?? "Pas encore renseigné"}</span>
            {writable && <Button variant="outline" size="sm" onClick={() => { setEditing(true); setSaved(false); setSaveError(false); }}>Modifier mon outil</Button>}
          </div>}
          {editing && <form className="max-w-md space-y-3" onSubmit={e => { e.preventDefault(); void save(); }}>
            <label htmlFor="site-cms" className="block text-sm font-medium">Quel outil utilises-tu ?</label>
            <select id="site-cms" value={draft} onChange={e => setDraft(e.target.value)} disabled={saving || !writable} className="min-h-11 w-full rounded-lg border border-input bg-background px-3 text-sm">
              <option value="" disabled>Choisir un outil</option>
              {profile?.cms && !CMS_OPTIONS.some(([key]) => key === profile.cms) && <option value={profile.cms}>{profile.cms}</option>}
              {CMS_OPTIONS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
            {saveError && <p role="alert" className="text-sm text-destructive">Le choix n’a pas été enregistré. Tu peux réessayer.</p>}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={!draft || saving || !writable}>{saving ? "Enregistrement…" : "Enregistrer mon outil"}</Button>
              <Button type="button" variant="ghost" disabled={saving} onClick={() => { setEditing(false); setDraft(profile?.cms ?? ""); setSaveError(false); }}>Annuler</Button>
            </div>
          </form>}
          {saved && <p role="status" className="mt-2 text-sm">Outil enregistré.</p>}
          {!writable && <p className="mt-2 text-sm text-muted-foreground">{isDemoMode ? "Aperçu de démonstration." : "Ce choix est disponible en consultation."}</p>}
        </>}
    </details>
  </div>;
}
