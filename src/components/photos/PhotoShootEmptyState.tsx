/**
 * PhotoShootEmptyState — première visite de la bibliothèque.
 *
 * Pas de « aucune photo » : une séance photo de 20 minutes générée depuis le
 * branding (edge photo-describe, mode shoot_ideas). Les idées peuvent être
 * versées dans « Photos à prendre » pour être cochées au fil des uploads.
 */

import { useEffect, useRef, useState } from "react";
import {
  Camera,
  Eye,
  Globe,
  Hand,
  Home,
  ListChecks,
  Loader2,
  Package,
  Sun,
  Upload,
  User,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { invokeWithTimeout } from "@/lib/invoke-with-timeout";
import { useWorkspaceId } from "@/hooks/use-workspace-query";
import { usePhotoWishlistMutations } from "@/hooks/use-photo-wishlist";

interface ShootIdea {
  label: string;
  icon: string;
}

interface WorkspaceShootState {
  ideas: ShootIdea[] | null;
  fromFallback: boolean;
  saving: boolean;
  saved: boolean;
}

const EMPTY_SHOOT_STATE: WorkspaceShootState = {
  ideas: null,
  fromFallback: false,
  saving: false,
  saved: false,
};

const ICON_MAP: Record<string, typeof Camera> = {
  portrait: User,
  mains: Hand,
  lieu: Home,
  produit: Package,
  detail: Eye,
  lumiere: Sun,
  outil: Wrench,
  coulisses: Camera,
};

/** Filet si l'edge échoue : idées universelles, la page reste utile. */
const FALLBACK_IDEAS: ShootIdea[] = [
  { label: "Toi, face caméra, souriante", icon: "portrait" },
  { label: "Tes mains en plein geste de travail", icon: "mains" },
  { label: "Ton espace de travail, vue large", icon: "lieu" },
  { label: "Ton produit ou service en situation", icon: "produit" },
  { label: "Un détail que personne ne remarque", icon: "detail" },
  { label: "Ton coin préféré, lumière du jour", icon: "lumiere" },
  { label: "L'outil que tu utilises tous les jours", icon: "outil" },
  { label: "Les coulisses d'une journée type", icon: "coulisses" },
];

interface PhotoShootEmptyStateProps {
  onAddPhotos: () => void;
  uploadDisabled?: boolean;
  /** Ouvre l'import depuis le site / Instagram (bibliothèque vide = le meilleur
   * moment pour récupérer ce qui est déjà publié). */
  onImport?: () => void;
}

export function PhotoShootEmptyState({ onAddPhotos, uploadDisabled, onImport }: PhotoShootEmptyStateProps) {
  const workspaceId = useWorkspaceId();
  const { addMany } = usePhotoWishlistMutations();
  const [statesByWorkspace, setStatesByWorkspace] = useState<Record<string, WorkspaceShootState>>({});
  const initializedWorkspaces = useRef(new Set<string>());
  const requestsByWorkspace = useRef(new Map<string, Promise<Pick<WorkspaceShootState, "ideas" | "fromFallback">>>());

  const currentState = workspaceId
    ? (statesByWorkspace[workspaceId] ?? EMPTY_SHOOT_STATE)
    : EMPTY_SHOOT_STATE;
  const { ideas, fromFallback, saving, saved } = currentState;

  useEffect(() => {
    if (!workspaceId || initializedWorkspaces.current.has(workspaceId)) return;
    initializedWorkspaces.current.add(workspaceId);

    setStatesByWorkspace((previous) => ({
      ...previous,
      [workspaceId]: EMPTY_SHOOT_STATE,
    }));

    let request = requestsByWorkspace.current.get(workspaceId);
    if (!request) {
      request = invokeWithTimeout(
        "photo-describe",
        { body: { mode: "shoot_ideas", workspace_id: workspaceId } },
        45_000,
      )
        .then(({ data, error }) => {
          const list = (data as { ideas?: ShootIdea[] } | null)?.ideas;
          if (error || !list?.length) {
            if (error) console.warn("[shoot_ideas]", error.message);
            return { ideas: FALLBACK_IDEAS, fromFallback: true };
          }
          return { ideas: list, fromFallback: false };
        })
        .catch((error) => {
          console.warn("[shoot_ideas]", error);
          return { ideas: FALLBACK_IDEAS, fromFallback: true };
        });
      requestsByWorkspace.current.set(workspaceId, request);
    }

    // La réponse met uniquement à jour l'entrée de l'espace qui l'a demandée.
    // Elle peut donc arriver après A → B (ou après le nettoyage d'effet de
    // StrictMode) sans remplacer la liste actuellement affichée.
    void request.then((result) => {
      requestsByWorkspace.current.delete(workspaceId);
      setStatesByWorkspace((previous) => ({
        ...previous,
        [workspaceId]: {
          ...(previous[workspaceId] ?? EMPTY_SHOOT_STATE),
          ...result,
        },
      }));
    });
  }, [workspaceId]);

  async function handleKeepList() {
    if (!workspaceId || !ideas?.length || saved) return;
    const targetWorkspaceId = workspaceId;
    const labels = ideas.map((idea) => idea.label);
    setStatesByWorkspace((previous) => ({
      ...previous,
      [targetWorkspaceId]: {
        ...(previous[targetWorkspaceId] ?? EMPTY_SHOOT_STATE),
        saving: true,
      },
    }));
    try {
      await addMany(labels, "seance", targetWorkspaceId);
      setStatesByWorkspace((previous) => ({
        ...previous,
        [targetWorkspaceId]: {
          ...(previous[targetWorkspaceId] ?? EMPTY_SHOOT_STATE),
          saving: false,
          saved: true,
        },
      }));
      toast.success("Liste ajoutée à « Photos à prendre »");
    } catch (e: any) {
      setStatesByWorkspace((previous) => ({
        ...previous,
        [targetWorkspaceId]: {
          ...(previous[targetWorkspaceId] ?? EMPTY_SHOOT_STATE),
          saving: false,
        },
      }));
      toast.error(e?.message || "Impossible d'enregistrer la liste");
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-8 sm:p-10 text-center">
      <div className="mx-auto h-12 w-12 sm:h-14 sm:w-14 rounded-full bg-secondary flex items-center justify-center mb-4">
        <Camera className="h-6 w-6 text-primary" />
      </div>
      <h2 className="font-display text-xl sm:text-2xl text-foreground mb-2">
        Ta séance photo de 20 minutes
      </h2>
      <p className="text-sm text-muted-foreground max-w-md mx-auto mb-6">
        Pas besoin de photographe : ton téléphone suffit. Voilà les photos qui serviront le
        plus dans tes stories et tes posts{fromFallback ? "" : ", d'après ton activité"}.
      </p>

      {!ideas ? (
        <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Je prépare ta liste…</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-xl mx-auto mb-6 text-left">
          {ideas.map((idea) => {
            const Icon = ICON_MAP[idea.icon] ?? Camera;
            return (
              <div
                key={idea.label}
                className="flex items-center gap-2.5 rounded-xl border border-border bg-background px-3 py-2.5"
              >
                <Icon className="h-4 w-4 shrink-0 text-primary" />
                <span className="text-xs sm:text-sm text-foreground">{idea.label}</span>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex flex-col sm:flex-row items-center justify-center gap-2">
        <Button onClick={onAddPhotos} disabled={uploadDisabled}>
          <Upload className="h-4 w-4 mr-2" /> J'ai mes photos — les ajouter
        </Button>
        {onImport && (
          <Button variant="outline" onClick={onImport} disabled={uploadDisabled}>
            <Globe className="h-4 w-4 mr-2" /> Importer depuis mon site ou Instagram
          </Button>
        )}
        <Button
          variant="outline"
          onClick={handleKeepList}
          disabled={!ideas?.length || saving || saved}
        >
          {saving ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <ListChecks className="h-4 w-4 mr-2" />
          )}
          {saved ? "Liste enregistrée" : "Garder cette liste"}
        </Button>
      </div>
    </div>
  );
}
