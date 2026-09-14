import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { toast } from "sonner";

type ShareLink = { id: string; token: string; created_at: string; expires_at: string | null; is_active: boolean; views_count: number; user_id: string };
export const linkStatus = (link: Pick<ShareLink, "is_active" | "expires_at">, now = Date.now()) => !link.is_active ? "Révoqué" : link.expires_at && Date.parse(link.expires_at) <= now ? "Expiré" : "Actif";
export const expiryLabel = (expires: string | null) => expires ? `Expire le ${new Date(expires).toLocaleString("fr-FR")}` : "Sans date d’expiration";

export default function BrandingShareDialog({ open, onOpenChange, column, value, ownerId }: {
  open: boolean; onOpenChange: (open: boolean) => void; column: string; value: string; ownerId: string;
}) {
  const { activeRole } = useWorkspace();
  const canWrite = !!ownerId && ["owner", "manager", "editor"].includes(activeRole);
  const [links, setLinks] = useState<ShareLink[]>([]);
  const [contents, setContents] = useState<any>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const mounted = useRef(true);
  const attemptToken = useRef(crypto.randomUUID());
  const scoped = (table: string) => {
    const q = (supabase.from(table as any) as any).select("*").eq(column, value);
    return column === "user_id" ? q.is("workspace_id", null) : q;
  };
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setBusy(true); setError(""); setContents(null);
    Promise.all([scoped("shared_branding_links").order("created_at", { ascending: false }), scoped("persona").order("created_at"), scoped("storytelling").order("created_at"), scoped("offers").order("created_at")])
      .then(results => {
        if (cancelled) return;
        if (results.some(r => r.error)) throw Error("Impossible de lire les liens et leur périmètre. Réessaie avant de créer un lien.");
        setLinks(results[0].data || []);
        setContents({ personas: results[1].data || [], stories: results[2].data || [], offers: results[3].data || [] });
      }).catch(e => { if (!cancelled) setError(e.message); }).finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [open, revision, column, value]);
  const copy = async (link: ShareLink) => {
    if (linkStatus(link) !== "Actif") { setRevision(n => n + 1); return; }
    try { await navigator.clipboard.writeText(`${window.location.origin}/share/branding/${link.token}`); toast.success(`Lien copié. ${expiryLabel(link.expires_at)}.`); }
    catch { toast.error("Copie impossible. Le lien reste disponible ci-dessous."); }
  };
  const create = async () => {
    if (!canWrite || busy || !contents || error) return;
    setBusy(true); setError("");
    try {
      // The same token survives an uncertain response and subsequent retry.
      const previous = await scoped("shared_branding_links").eq("token", attemptToken.current).maybeSingle();
      if (previous.error) throw previous.error;
      let link = previous.data;
      if (!link) {
        const result = await supabase.from("shared_branding_links").insert({ user_id: ownerId, workspace_id: column === "workspace_id" ? value : null, token: attemptToken.current }).select("*").single();
        if (result.error || !result.data) throw result.error || Error("Création non confirmée");
        link = result.data;
      }
      if (!mounted.current) return;
      setLinks(current => [link, ...current.filter(l => l.id !== link.id)]);
      attemptToken.current = crypto.randomUUID();
      toast.success("Lien créé. Tu peux le copier ci-dessous.");
    } catch { if (mounted.current) setError("Création non confirmée. Actualise les liens puis réessaie : la tentative sera reprise sans doublon."); }
    finally { if (mounted.current) setBusy(false); }
  };
  const revoke = async (link: ShareLink) => {
    if (!canWrite || busy) return;
    setBusy(true); setError("");
    try {
      let q = (supabase.from("shared_branding_links") as any).update({ is_active: false }).eq("id", link.id).eq(column, value);
      if (column === "user_id") q = q.is("workspace_id", null);
      const result = await q.select("id, is_active").single();
      if (result.error || result.data?.is_active !== false) throw Error("Révocation non confirmée");
      if (mounted.current) setLinks(current => current.map(l => l.id === link.id ? { ...l, is_active: false } : l));
    } catch { if (mounted.current) setError("Révocation non confirmée. Actualise les liens puis réessaie."); }
    finally { if (mounted.current) setBusy(false); }
  };
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[85vh] overflow-y-auto"><DialogHeader>
    <DialogTitle>Partager mon identité</DialogTitle>
    <DialogDescription>Le lien relit les données à chaque ouverture. Il ne conserve pas une version figée.</DialogDescription>
  </DialogHeader>
    <p className="text-sm">Sont partagés : tous les publics, les histoires marquées principales, toutes les offres, la voix, le positionnement et la ligne éditoriale de cet espace. Les brouillons d’histoires et histoires non principales restent privés. Le positionnement utilise la référence finale ; les variantes de présentation restent identifiées.</p>
    {contents && <div className="text-sm space-y-2">
      <p><strong>Publics ({contents.personas.length}) :</strong> {contents.personas.map((p: any) => p.label || p.portrait_prenom || "Public sans nom").join(" · ") || "Aucun"}</p>
      <p><strong>Histoires principales :</strong> {contents.stories.filter((s: any) => s.is_primary).map((s: any) => s.title || "Histoire sans titre").join(" · ") || "Aucune"}. {contents.stories.filter((s: any) => !s.is_primary).length} autre(s) histoire(s) non partagée(s).</p>
      <p><strong>Offres ({contents.offers.length}) :</strong> {contents.offers.map((o: any) => o.name || "Offre sans nom").join(" · ") || "Aucune"}</p>
    </div>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <Button variant="outline" onClick={() => setRevision(n => n + 1)} disabled={busy}>{busy ? "Chargement…" : "Actualiser les liens"}</Button>
    {!canWrite && <p className="text-sm text-muted-foreground">La création et la révocation nécessitent un droit d’écriture dans cet espace.</p>}
    {links.map(link => <div key={link.id} className="rounded-lg border p-3 space-y-2 text-sm">
      <p><strong>{linkStatus(link)}</strong> · {expiryLabel(link.expires_at)} · {link.views_count || 0} vue(s)</p>
      <p>Créé le {new Date(link.created_at).toLocaleDateString("fr-FR")}</p>
      {linkStatus(link) === "Actif" && <><a className="block break-all text-primary underline" href={`/share/branding/${link.token}`} target="_blank" rel="noreferrer">Ouvrir le lien</a><Button size="sm" variant="outline" disabled={busy} onClick={() => copy(link)}>Copier ce lien</Button></>}
      {link.is_active && canWrite && <Button size="sm" variant="outline" disabled={busy} onClick={() => revoke(link)}>Révoquer</Button>}
    </div>)}
    <Button disabled={!canWrite || busy || !contents || !!error} onClick={create}>Créer un nouveau lien de 30 jours</Button>
  </DialogContent></Dialog>;
}
