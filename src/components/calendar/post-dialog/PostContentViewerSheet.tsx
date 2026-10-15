// Lecteur plein écran du contenu d'un post du calendrier (script, slides,
// séquence) avec retour à la version d'origine. Sorti de CalendarPostDialog.tsx
// à l'identique (fiche 13 de docs/robustesse/gros-fichiers.md, lot 2).
// `savedPreviewContent` et `previewMounted` restent dans la fenêtre (anti-mise
// à jour après démontage) et arrivent en props.
import type { MutableRefObject } from "react";
import { SavedContentPreview } from "@/components/SavedContentPreview";
import { RevertToOriginalButton } from "@/components/ContentPreview";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { friendlyError } from "@/lib/error-messages";
import { toast } from "sonner";
import type { CalendarPost } from "@/lib/calendar-constants";

interface PostContentViewerSheetProps {
  showContentViewer: boolean;
  setShowContentViewer: (open: boolean) => void;
  editingPost: CalendarPost | null;
  column: string;
  value: string;
  savedPreviewContent: any;
  setSavedPreviewContent: (content: any) => void;
  previewMounted: MutableRefObject<boolean>;
  handleOpenAtelier: () => Promise<void>;
}

export function PostContentViewerSheet({ showContentViewer, setShowContentViewer, editingPost, column, value, savedPreviewContent, setSavedPreviewContent, previewMounted, handleOpenAtelier }: PostContentViewerSheetProps) {
  return (
    <Sheet open={showContentViewer} onOpenChange={setShowContentViewer}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="font-display">
            {(editingPost?.story_sequence_detail as any)?.type === "reel" ? "🎬 Script complet"
              : (editingPost?.story_sequence_detail as any)?.type === "carousel" ? "📑 Slides détaillées"
              : (editingPost?.story_sequence_detail as any)?.type === "carousel_photo" ? "📸 Carrousel photo"
              : (editingPost?.story_sequence_detail as any)?.type === "carousel_mix" ? "✨ Carrousel mixte"
              : "📱 Séquence complète"}
          </SheetTitle>
          <SheetDescription className="sr-only">Visualisation du contenu généré</SheetDescription>
        </SheetHeader>
        <div className="mt-4 space-y-4">
          {showContentViewer && editingPost && <SavedContentPreview
            key={`${editingPost.id}:${showContentViewer}`}
            target={{ table: "calendar_posts", id: editingPost.id, scope: { column, value } }}
            editable={!/^carousel/.test((savedPreviewContent as any)?.type || "")}
            onLoaded={(row) => { if (previewMounted.current) setSavedPreviewContent(row.story_sequence_detail); }}
            onSaved={(receipt) => {
              if (previewMounted.current) setSavedPreviewContent(receipt.row.story_sequence_detail);
            }}
          />}
          {/^carousel/.test((editingPost?.story_sequence_detail as any)?.type || "") && <Button variant="outline" onClick={() => { setShowContentViewer(false); void handleOpenAtelier(); }}>Modifier dans l’éditeur de carrousel</Button>}
          {editingPost && (editingPost as any).original_content_data && (
            <RevertToOriginalButton onRevert={async () => {
              const original = (editingPost as any).original_content_data;
              const { error } = await supabase.from("calendar_posts").update({ story_sequence_detail: original, updated_at: new Date().toISOString() } as any).eq("id", editingPost.id);
              if (error) {
                console.error("Erreur technique:", error);
                toast.error("Erreur", { description: friendlyError(error) });
                return;
              }
              toast.success("Version originale restaurée");
              setShowContentViewer(false);
            }} />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
