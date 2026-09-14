/** Lossless boundary between crosspost's generated versions and the rich editor.
 * `_crosspost` is provenance, not the editable document. Keep it when saving. */
export interface CrosspostResult { versions: Record<string, Record<string, any>>; [key: string]: any }
export const CROSSPOST_TARGETS = ['linkedin', 'instagram', 'reel', 'stories'] as const;
export function crosspostText(value: any): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(crosspostText).filter(Boolean).join('\n\n');
  if (typeof value !== 'object') return String(value);
  const primary = value.edited_text ?? value.full_text ?? value.full_content ?? value.content ?? (value.type === "crosspost" ? value.text : undefined);
  if (typeof primary === 'string') return primary;
  if (value.script || value.sections) return crosspostText(value.sections || value.script);
  if (value.stories || value.story_sequence || value.sequence) return crosspostText(value.stories || value.story_sequence || value.sequence);
  // Include nested stickers, timing, slide bodies and all other generated fields.
  return Object.entries(value).filter(([k]) => !['angle_choisi', 'character_count', '_crosspost'].includes(k))
    .map(([, v]) => crosspostText(v)).filter(Boolean).join('\n');
}
export function isCrosspost(value: any): boolean { return value?.type === 'crosspost' || !!value?._crosspost; }
export function crosspostEnvelope(result: CrosspostResult, key: string, source: Record<string, any>): Record<string, any> {
  return { type: 'crosspost', schema_version: 2, ...source, target_channel: key,
    version: result.versions[key], result, full_content: crosspostText(result.versions[key]) };
}
export function resumeCrosspost(data: any, fallbackFormat?: string | null): { format: string; raw: any } | null {
  if (!isCrosspost(data)) return null;
  const provenance = data._crosspost || data;
  const key = provenance.target_channel || (fallbackFormat === 'story_serie' ? 'stories' : fallbackFormat);
  const version = data._crosspost ? data : (data.version || data.result?.versions?.[key] || data);
  const raw = { ...JSON.parse(JSON.stringify(version)), _crosspost: provenance };
  const text = crosspostText(version);
  const format = key === 'linkedin' ? 'linkedin' : key === 'stories' ? 'story' : key === 'reel' ? 'reel'
    : Array.isArray(raw.slides) ? 'carousel' : 'post';
  if (format === 'reel') {
    const script = data._crosspost ? (raw.script || raw.sections) : (raw.sections || raw.script);
    raw.script = Array.isArray(script) ? script : Array.isArray(script?.sections) ? script.sections : [{ section: 'script', texte_parle: typeof script === 'string' ? script : text }];
    delete raw.sections; // one editable script; original aliases remain in provenance
    raw.duree_cible ??= raw.duration;
  } else if (format === 'story') {
    const sequence = raw.stories || raw.story_sequence?.stories || raw.story_sequence || raw.sequence;
    raw.stories = Array.isArray(sequence) ? sequence.map((s: any, i: number) => (typeof s === 'string' || s == null)
      ? { number: i + 1, text: s || '' } : { ...s, number: s.number ?? i + 1, text: s.text ?? s.texte ?? s.contenu ?? crosspostText(s) })
      : [{ number: 1, text }];
  } else if (format === 'carousel') {
    if (typeof raw.caption === 'string') raw.caption = { body: raw.caption };
    else if (!raw.caption && typeof raw.full_text === 'string') raw.caption = { body: raw.full_text };
  } else if (format === 'linkedin') raw.full_text ??= text;
  else if (format === 'post') raw.content ??= text;
  return { format, raw };
}
