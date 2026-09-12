import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspaceReady, useWorkspaceFilter, useWorkspaceId, useProfileUserId } from "@/hooks/use-workspace-query";
import { Button } from "@/components/ui/button";

type Props = { kind: "offers" | "persona"; id?: string; renderChoice?: (content: ReactNode) => ReactNode; children: (id: string) => ReactNode };

/** Keyed boundary: a different object or space never inherits another conversation. */
export default function CoachingTarget(props: Props) {
  const { column, value } = useWorkspaceFilter();
  const ready = useWorkspaceReady();
  if (!ready) return <p className="p-6 text-sm">Chargement de l'espace…</p>;
  return <TargetChoice key={`${column}:${value}:${props.kind}:${props.id || ""}`} {...props} />;
}
function TargetChoice({ kind, id, children, renderChoice = content => content }: Props) {
  const { column, value } = useWorkspaceFilter();
  const workspaceId = useWorkspaceId();
  const ownerId = useProfileUserId();
  const [rows, setRows] = useState<Array<{ id: string; name?: string; label?: string }>>([]);
  const [selected, setSelected] = useState<string>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true); setError("");
    const query = (supabase.from(kind) as any).select(kind === "offers" ? "id, name" : "id, label").eq(column, value);
    if (id) query.eq("id", id);
    query.then(({ data, error }) => {
      if (!active) return;
      if (error || (id && !data?.length)) setError("Impossible de retrouver la fiche dans cet espace. Réessaie.");
      else { setRows(data as any || []); if (id) setSelected(id); }
      setLoading(false);
    });
    return () => { active = false; };
  }, [kind, id, column, value, attempt]);
  const create = async () => {
    setLoading(true); setError("");
    const { data, error } = await supabase.from(kind).insert({
      user_id: ownerId, workspace_id: column === "workspace_id" ? workspaceId : null,
      ...(kind === "offers" ? { name: "", offer_type: "paid" } : { label: "Nouveau public", is_primary: rows.length === 0 }),
    } as any).select("id").single();
    if (error || !data) { setError("La fiche n'a pas pu être créée. Réessaie."); setLoading(false); return; }
    setSelected(data.id); setLoading(false);
  };
  if (loading) return <>{renderChoice(<p className="p-6 text-sm">Chargement des fiches…</p>)}</>;
  if (selected) return <>{children(selected)}</>;
  return <>{renderChoice(<div className="space-y-4 p-6">
    <p>{kind === "offers" ? "Quelle offre veux-tu travailler ?" : "Quel public veux-tu travailler ?"}</p>
    {error && <><p role="alert">{error}</p><Button variant="outline" onClick={() => setAttempt(n => n + 1)}>Réessayer</Button></>}
    {!error && rows.map(row => <Button key={row.id} variant="outline" className="block" onClick={() => setSelected(row.id)}>{row.name || row.label || "Fiche sans nom"}</Button>)}
    {!error && <Button onClick={create}>{kind === "offers" ? "Ajouter une offre" : "Ajouter un public"}</Button>}
    <Link className="block text-sm underline" to={kind === "offers" ? "/branding/offres" : "/branding/section?section=persona&tab=fiche"}>Retour aux fiches</Link>
  </div>)}</>;
}
