import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
/** Sources remain private; signed URLs are obtained on demand, never persisted. */
export default function CrosspostSources({ data }: { data: any }) {
  const source = data?._crosspost || (data?.type === 'crosspost' ? data : null);
  if (!source) return null;
  return <details className="text-sm my-3">
    <summary className="cursor-pointer text-muted-foreground">Texte et fichiers sources</summary>
    {source.source_text && <p className="whitespace-pre-wrap mt-2">{source.source_text}</p>}
    {(source.source_files || []).map((f: any) => <Button key={f.path} variant="outline" size="sm" className="mt-2 mr-2" onClick={async () => {
      if (f.bucket !== 'crosspost-sources' || typeof f.path !== 'string') return;
      try {
        const { data, error } = await supabase.storage.from('crosspost-sources').download(f.path);
        if (error || !data) throw error || new Error('Fichier indisponible');
        const url = URL.createObjectURL(data), anchor = document.createElement('a');
        anchor.href = url; anchor.download = f.name || 'source'; anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } catch { toast.error('Impossible de récupérer ce fichier source. Vérifie ton accès à cet espace puis réessaie.'); }
    }}>{f.name}</Button>)}
  </details>;
}
