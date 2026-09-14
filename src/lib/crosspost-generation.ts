import { toast } from "sonner";
import { supabase } from '@/integrations/supabase/client';
import { invokeWithTimeout } from '@/lib/invoke-with-timeout';
import { parseAIResponse } from '@/lib/parse-ai-response';
import { CROSSPOST_TARGETS, type CrosspostResult } from './crosspost-content';
import type { UploadedFile } from '@/components/crosspost/CrosspostFileUploader';
export async function generateCrosspost(input: { userId: string; workspaceId: string | null; sourceType: string;
  text: string; mode: 'text' | 'files' | 'both'; files: UploadedFile[]; targets: string[] },
  received: (result: CrosspostResult, source: Record<string, any>) => void) {
  const temporary: string[] = [], originals: string[] = [];
  let retained = false;
  const sourceFiles: Record<string, any>[] = [];
  const fileUrls: Record<string, string>[] = [];
  const selectedFiles = input.mode === 'text' ? [] : input.files;
  const text = input.mode === 'files' ? '' : input.text;
  try {
    for (const f of selectedFiles) {
      const fileId = crypto.randomUUID();
      const ext = f.name.split('.').pop()?.toLowerCase() || 'bin';
      const path = `${input.userId}/crosspost-${fileId}.${ext}`;
      temporary.push(path); // also covers an uncertain upload or signed-URL failure
      const upload = await supabase.storage.from('crosspost-uploads').upload(path, f.file, { upsert: false, contentType: f.file.type });
      if (upload.error) throw upload.error;
      const signed = await supabase.storage.from('crosspost-uploads').createSignedUrl(path, 3600);
      if (signed.error || !signed.data?.signedUrl) throw signed.error || new Error('URL du fichier indisponible');
      fileUrls.push({ url: signed.data.signedUrl, type: f.type, name: f.name });
      const original = `${input.workspaceId ? `workspace/${input.workspaceId}` : `user/${input.userId}`}/${fileId}.${ext}`;
      originals.push(original);
      const saved = await supabase.storage.from('crosspost-sources').upload(original, f.file, { upsert: false, contentType: f.file.type });
      if (saved.error) throw saved.error;
      sourceFiles.push({ bucket: 'crosspost-sources', path: original, name: f.name, type: f.type, mime_type: f.file.type, size: f.file.size });
    }
    const response = await invokeWithTimeout('linkedin-ai', { body: {
      action: 'crosspost', sourceContent: text, sourceType: input.sourceType,
      targetChannels: input.targets, fileUrls, workspace_id: input.workspaceId || undefined,
    } }, 145000);
    if (response.error || response.data?.error) throw Object.assign(new Error(response.error?.message || response.data?.message || 'Adaptation indisponible'), { data: response.data });
    const result = parseAIResponse(response.data?.content || '') as CrosspostResult;
    if (!result?.versions || !Object.keys(result.versions).length || Object.values(result.versions).some(v => !v || typeof v !== 'object' || Array.isArray(v))) throw new Error('Le résultat reçu ne contient pas de version exploitable.');
    // Preserve unexpected output in the result, but never activate an unsupported target.
    if (!Object.keys(result.versions).some(k => CROSSPOST_TARGETS.includes(k as any))) throw new Error('Aucun format compatible reçu.');
    retained = true;
    received(result, { source_type: input.sourceType, source_text: text, input_mode: input.mode, source_files: sourceFiles });
    retained = true;
  } finally {
    const cleanup = async (bucket: string, paths: string[]) => {
      if (!paths.length) return;
      const { error } = await supabase.storage.from(bucket).remove(paths);
      if (error) throw error;
    };
    const results = await Promise.allSettled([cleanup('crosspost-uploads', temporary), ...(!retained ? [cleanup('crosspost-sources', originals)] : [])]);
    if (results.some(r => r.status === 'rejected')) toast.warning('Le nettoyage de certains fichiers temporaires n’a pas pu être confirmé.');
  }
}
