import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspaceId } from "@/hooks/use-workspace-query";
import { fetchPlannedKeys, plannedKey } from "@/lib/calendar-duplicates";

/**
 * Avertit AVANT de poser un contenu déjà prévu ce jour-là.
 *
 * Ici on prévient sans bloquer : le contenu vient d'être généré, le refuser
 * ferait perdre le travail. On dit juste « tu l'as déjà prévu ce jour-là »
 * pendant que la date est encore modifiable — c'est le moment où la décision
 * se prend. (Le 15 août avait fini avec 11 exemplaires du même sujet.)
 */
export default function AlreadyPlannedNotice({
  date,
  theme,
  canal,
}: {
  date: string;
  theme?: string | null;
  canal?: string | null;
}) {
  const { user } = useAuth();
  const workspaceId = useWorkspaceId();
  const [already, setAlready] = useState(false);

  useEffect(() => {
    const row = { date, theme, canal };
    if (!user || !date || !String(theme ?? "").trim()) {
      setAlready(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const keys = await fetchPlannedKeys([row], { userId: user.id, workspaceId });
      if (!cancelled) setAlready(keys.has(plannedKey(row)));
    })();
    return () => { cancelled = true; };
  }, [user, workspaceId, date, theme, canal]);

  if (!already) return null;

  return (
    <p className="flex items-start gap-1.5 text-xs text-amber-700" role="status">
      <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" aria-hidden="true" />
      <span>
        Tu as déjà ce contenu prévu ce jour-là. Continue si tu veux une 2ᵉ version,
        ou choisis une autre date.
      </span>
    </p>
  );
}
