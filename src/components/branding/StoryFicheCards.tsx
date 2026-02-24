import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspaceFilter, useWorkspaceId } from "@/hooks/use-workspace-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus, ArrowLeft } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

interface StoryRow {
  id: string;
  step_7_polished?: string | null;
  pitch_short?: string | null;
  is_primary?: boolean;
  created_at?: string | null;
  updated_at?: string | null;
}

function truncate(text: string, max: number) {
  if (!text) return "";
  return text.length > max ? text.slice(0, max) + "…" : text;
}

export default function StoryFicheCards() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { column, value } = useWorkspaceFilter();
  const workspaceId = useWorkspaceId();
  const [stories, setStories] = useState<StoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStory, setSelectedStory] = useState<StoryRow | null>(null);

  useEffect(() => {
    if (!user) return;
    (supabase.from("storytelling" as any) as any)
      .select("id, step_7_polished, pitch_short, is_primary, created_at, updated_at")
      .eq(column, value)
      .order("is_primary", { ascending: false })
      .order("created_at", { ascending: false })
      .then(({ data }: any) => {
        setStories((data as StoryRow[]) || []);
        setLoading(false);
      });
  }, [user?.id, column, value]);

  const createNew = async () => {
    if (!user) return;
    const { data, error } = await (supabase.from("storytelling" as any) as any)
      .insert({ user_id: user.id, workspace_id: workspaceId })
      .select("id")
      .single();
    if (data?.id) {
      navigate(`/branding/storytelling/${data.id}/edit`);
    }
  };

  if (loading) {
    return <div className="py-8 text-center text-muted-foreground text-sm">Chargement…</div>;
  }

  // Detail view of a selected story
  if (selectedStory) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => setSelectedStory(null)}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Retour à mes storytellings
        </button>

        <div className="flex items-center gap-2 mb-2">
          {selectedStory.is_primary && (
            <Badge variant="default" className="text-[10px]">✨ Principal</Badge>
          )}
          {selectedStory.updated_at && (
            <span className="text-[11px] text-muted-foreground">
              Modifié le {format(new Date(selectedStory.updated_at), "d MMM yyyy", { locale: fr })}
            </span>
          )}
        </div>

        {selectedStory.pitch_short && (
          <Card className="p-5">
            <h4 className="text-xs font-semibold text-foreground uppercase tracking-wide mb-2">Pitch court</h4>
            <p className="text-[13px] text-muted-foreground leading-relaxed whitespace-pre-wrap">{selectedStory.pitch_short}</p>
          </Card>
        )}

        {selectedStory.step_7_polished && (
          <Card className="p-5">
            <h4 className="text-xs font-semibold text-foreground uppercase tracking-wide mb-2">Histoire complète</h4>
            <p className="text-[13px] text-muted-foreground leading-relaxed whitespace-pre-wrap">{selectedStory.step_7_polished}</p>
          </Card>
        )}

        {!selectedStory.step_7_polished && !selectedStory.pitch_short && (
          <Card className="p-6 text-center border-dashed">
            <p className="text-muted-foreground text-sm italic">Ce storytelling est encore vide.</p>
            <Button size="sm" className="mt-3" onClick={() => navigate(`/branding/storytelling/${selectedStory.id}/edit`)}>
              Commencer le coaching →
            </Button>
          </Card>
        )}

        <Button
          variant="outline"
          className="w-full mt-2"
          onClick={() => navigate(`/branding/storytelling/${selectedStory.id}/edit`)}
        >
          Modifier ce storytelling →
        </Button>
      </div>
    );
  }

  // Empty state
  if (stories.length === 0) {
    return (
      <Card className="p-6 text-center border-dashed">
        <p className="text-muted-foreground text-sm mb-3">Aucun storytelling pour l'instant.</p>
        <Button size="sm" className="rounded-pill text-xs" onClick={createNew}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Créer mon premier storytelling
        </Button>
      </Card>
    );
  }

  // Card list
  return (
    <div className="space-y-3">
      {stories.map((s) => {
        const preview = s.pitch_short
          ? truncate(s.pitch_short, 120)
          : s.step_7_polished
            ? truncate(s.step_7_polished, 120)
            : null;

        return (
          <Card
            key={s.id}
            className="rounded-xl border-2 border-border hover:border-primary/30 p-5 cursor-pointer transition-all"
            onClick={() => setSelectedStory(s)}
          >
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="flex items-center gap-2">
                {s.is_primary && (
                  <Badge variant="default" className="text-[10px] shrink-0">✨ Principal</Badge>
                )}
              </div>
            </div>

            {preview ? (
              <p className="text-[13px] text-muted-foreground leading-relaxed line-clamp-3">{preview}</p>
            ) : (
              <p className="text-[13px] text-muted-foreground italic">Storytelling en cours...</p>
            )}

            {s.updated_at && (
              <p className="text-[11px] text-muted-foreground/60 mt-2">
                Modifié le {format(new Date(s.updated_at), "d MMM yyyy", { locale: fr })}
              </p>
            )}
          </Card>
        );
      })}

      <Button variant="outline" className="w-full mt-2 gap-2" onClick={createNew}>
        <Plus className="h-4 w-4" /> Nouveau storytelling
      </Button>
    </div>
  );
}
