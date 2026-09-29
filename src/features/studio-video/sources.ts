import { isVideoDirection, shotOptions, cameraOptions, lightOptions, type Shot, type Camera, type Light } from "./direction";

export interface VideoSource {
  kind: "photo" | "studio_version";
  id: string;
  name: string;
  previewUrl?: string | null;
}
export type VideoReference = VideoSource & {
  role: "subject" | "product" | "casting" | "background" | "style" | "composition";
};
export const sourceKey = (source: VideoSource) => `${source.kind}:${source.id}`;
export const MAX_VIDEO_IMAGES = 4;

export interface VideoDraft {
  images: VideoReference[];
  useImages: boolean;
  prompt: string;
  duration: number;
  resolution: "480p" | "720p";
  aspectRatio: "9:16" | "16:9" | "1:1";
  shot: Shot;
  camera: Camera;
  light: Light;
}
export function readVideoDraft(key?: string): VideoDraft | null {
  if (!key) return null;
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    if (!value || !Array.isArray(value.images) || value.images.length > MAX_VIDEO_IMAGES ||
      !value.images.every((r: VideoReference) => r && ["photo", "studio_version"].includes(r.kind) &&
        typeof r.id === "string" && typeof r.name === "string" &&
        ["subject", "product", "casting", "background", "style", "composition"].includes(r.role)) ||
      typeof value.prompt !== "string" || typeof value.useImages !== "boolean" ||
      !Number.isInteger(value.duration) || value.duration < 4 || value.duration > 10 ||
      !["480p", "720p"].includes(value.resolution) || !["9:16", "16:9", "1:1"].includes(value.aspectRatio)) return null;
    return { ...value,
      shot: isVideoDirection(value.shot, shotOptions) ? value.shot as Shot : "",
      camera: isVideoDirection(value.camera, cameraOptions) ? value.camera as Camera : "",
      light: isVideoDirection(value.light, lightOptions) ? value.light as Light : "",
    };
  } catch { return null; }
}
export function writeVideoDraft(key: string | undefined, draft: VideoDraft) {
  if (!key) return;
  try {
    // Signed media URLs and the consent/quote are deliberately not persisted.
    localStorage.setItem(key, JSON.stringify({ ...draft, images: draft.images.map(({ kind, id, name, role }) => ({ kind, id, name, role })) }));
  } catch { /* The visible draft remains usable when storage is unavailable. */ }
}
