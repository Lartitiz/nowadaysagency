import type { VideoInput } from "./higgsfield.ts";

type SourceKind = "photo" | "studio_version" | "text" | "references";
type Ratio = "9:16" | "16:9" | "1:1";
type Resolution = "480p" | "720p";

export function preparationAspectRatio(sourceKind: SourceKind, aspectRatio: Ratio) {
  return sourceKind === "photo" || sourceKind === "studio_version" ?
    "follows the source image; no aspect_ratio parameter on image-to-video" : aspectRatio;
}

export function videoInputForQuote(sourceKind: SourceKind, prompt: string, duration: number,
  resolution: Resolution, aspectRatio: Ratio, inputUrls: string[]): VideoInput {
  const common = { prompt, duration, resolution, output_format: "mp4" as const,
    generate_audio: false as const };
  if (sourceKind === "text") return { ...common, aspect_ratio: aspectRatio };
  if (sourceKind === "references") return { ...common, image_urls: inputUrls, aspect_ratio: aspectRatio };
  return { ...common, image_url: inputUrls[0] };
}

export function videoInputFromJob(row: Record<string, unknown>): VideoInput {
  const sourceKind = row.source_kind as SourceKind;
  const urls = sourceKind === "references" ? row.input_urls as string[] :
    sourceKind === "text" ? [] : [String(row.input_url)];
  return videoInputForQuote(sourceKind, String(row.prompt), Number(row.duration),
    row.resolution as Resolution, row.aspect_ratio as Ratio, urls);
}
