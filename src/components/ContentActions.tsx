import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspaceId } from "@/hooks/use-workspace-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Copy, Check, Save, CalendarPlus, RefreshCw } from "lucide-react";
import { AddToCalendarDialog } from "@/components/calendar/AddToCalendarDialog";
import { SaveToIdeasDialog } from "@/components/SaveToIdeasDialog";

interface ContentActionsProps {
  content: string;
  canal: string;
  format: string;
  theme?: string;
  objectif?: string;
  accroche?: string;
  calendarPostId?: string;
  onRegenerate?: () => void;
  regenerateLabel?: string;
  regenerateLoading?: boolean;
  className?: string;
  calendarData?: {
    storySequenceDetail?: any;
    storiesCount?: number;
    storiesStructure?: string;
    storiesObjective?: string;
    accroche?: string;
  };
  ideasData?: any;
  ideasContentType?: string;
}

export default function ContentActions({
  content,
  canal,
  format,
  theme,
  objectif,
  accroche,
  calendarPostId,
  onRegenerate,
  regenerateLabel,
  regenerateLoading,
  className = "",
  calendarData,
  ideasData,
  ideasContentType,
}: ContentActionsProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const workspaceId = useWorkspaceId();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [showCalendarDialog, setShowCalendarDialog] = useState(false);
  const [showIdeasDialog, setShowIdeasDialog] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSaveToCalendar = async (dateStr: string) => {
    if (!user) return;
    const insertData: any = {
      user_id: user.id,
      date: dateStr,
      theme: theme || content.split("\n")[0]?.slice(0, 100) || "Contenu",
      canal,
      format,
      content_draft: content,
      accroche: accroche || content.split("\n")[0]?.slice(0, 200) || "",
      status: "ready",
    };
    if (objectif) insertData.objectif = objectif;
    if (calendarData?.storySequenceDetail) insertData.story_sequence_detail = calendarData.storySequenceDetail;
    if (calendarData?.storiesCount) insertData.stories_count = calendarData.storiesCount;
    if (calendarData?.storiesStructure) insertData.stories_structure = calendarData.storiesStructure;
    if (calendarData?.storiesObjective) insertData.stories_objective = calendarData.storiesObjective;
    if (calendarData?.accroche) insertData.accroche = calendarData.accroche;
    if (workspaceId && workspaceId !== user.id) {
      insertData.workspace_id = workspaceId;
    }

    if (calendarPostId) {
      const updateData: any = {
        content_draft: content,
        accroche: accroche || content.split("\n")[0]?.slice(0, 200) || "",
        status: "ready",
        updated_at: new Date().toISOString(),
      };
      if (calendarData?.storySequenceDetail) updateData.story_sequence_detail = calendarData.storySequenceDetail;
      if (calendarData?.storiesCount) updateData.stories_count = calendarData.storiesCount;
      if (calendarData?.storiesStructure) updateData.stories_structure = calendarData.storiesStructure;
      if (calendarData?.storiesObjective) updateData.stories_objective = calendarData.storiesObjective;
      if (calendarData?.accroche) updateData.accroche = calendarData.accroche;
      const { error } = await supabase
        .from("calendar_posts")
        .update(updateData)
        .eq("id", calendarPostId);

      if (error) {
        toast({ title: "Erreur", variant: "destructive" });
      } else {
        toast({ title: "Contenu mis à jour dans ton calendrier !" });
        navigate("/calendrier?canal=" + canal);
      }
    } else {
      const { error } = await supabase.from("calendar_posts").insert(insertData);
      if (error) {
        toast({ title: "Erreur", variant: "destructive" });
      } else {
        toast({ title: "📅 Planifié dans ton calendrier !" });
      }
    }
    setShowCalendarDialog(false);
  };

  return (
    <div className={className}>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={handleCopy} className="rounded-pill gap-1.5">
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? "Copié !" : "Copier"}
        </Button>

        <Button variant="outline" size="sm" onClick={() => setShowIdeasDialog(true)} className="rounded-pill gap-1.5">
          <Save className="h-4 w-4" /> Sauvegarder en idée
        </Button>

        {calendarPostId ? (
          <Button
            size="sm"
            onClick={() => handleSaveToCalendar("")}
            className="rounded-pill gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <CalendarPlus className="h-4 w-4" /> Sauvegarder dans le calendrier
          </Button>
        ) : (
          <Button variant="outline" size="sm" onClick={() => setShowCalendarDialog(true)} className="rounded-pill gap-1.5">
            <CalendarPlus className="h-4 w-4" /> Planifier
          </Button>
        )}

        {onRegenerate && (
          <Button variant="outline" size="sm" onClick={onRegenerate} disabled={regenerateLoading} className="rounded-pill gap-1.5">
            <RefreshCw className={`h-4 w-4 ${regenerateLoading ? "animate-spin" : ""}`} /> {regenerateLabel || "Réécrire"}
          </Button>
        )}
      </div>

      <AddToCalendarDialog
        open={showCalendarDialog}
        onOpenChange={setShowCalendarDialog}
        onConfirm={handleSaveToCalendar}
        contentLabel={theme || "Contenu"}
        contentEmoji="📝"
      />

      <SaveToIdeasDialog
        open={showIdeasDialog}
        onOpenChange={setShowIdeasDialog}
        contentType={(ideasContentType as any) || (canal === "linkedin" ? "post_linkedin" : "post_instagram")}
        subject={theme || content.split("\n")[0]?.slice(0, 60) || "Contenu"}
        contentData={ideasData || { content, accroche }}
        sourceModule="content-actions"
        format={format}
        objectif={objectif}
      />
    </div>
  );
}
