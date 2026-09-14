import { useEffect, useRef, useState } from "react";
import { ContentPreview } from "@/components/ContentPreview";
import { previewContent, readPreviewRow, savePreviewEdit, type ContentReceipt, type PreviewTarget } from "@/lib/content-preview-save";

/** Mount once per viewer visit. Re-read persistence instead of stale calendar props. */
export function SavedContentPreview({ target, editable, onSaved, onLoaded }: {
  target: PreviewTarget;
  editable: boolean;
  onSaved: (receipt: ContentReceipt) => void;
  onLoaded?: (row: any) => void;
}) {
  const [loaded, setLoaded] = useState<{ content: any } | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const mounted = useRef(false);
  const onLoadedRef = useRef(onLoaded);
  onLoadedRef.current = onLoaded;
  const { table, id, format, scope: { column, value } } = target;
  useEffect(() => {
    mounted.current = true;
    let active = true;
    setLoaded(null); setError(false);
    void readPreviewRow({ table, id, format, scope: { column, value } }).then(row => {
      if (active) {
        setLoaded({ content: previewContent(row.story_sequence_detail, row.content_draft, format) });
        onLoadedRef.current?.(row);
      }
    }).catch(() => { if (active) setError(true); });
    return () => { active = false; mounted.current = false; };
  }, [table, id, column, value, format, attempt]);
  if (error) return <div role="alert"><p>Impossible de charger le contenu enregistré.</p><button onClick={() => setAttempt(v => v + 1)}>Réessayer</button></div>;
  if (!loaded) return <p role="status">Chargement du contenu enregistré…</p>;
  return <ContentPreview contentData={loaded.content} contentType={target.format} editable={editable}
    onContentChange={async edit => {
      const receipt = await savePreviewEdit(target, edit);
      if (mounted.current) onSaved(receipt);
      return receipt;
    }} />;
}
