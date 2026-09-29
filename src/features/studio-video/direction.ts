export const shotOptions = {
  "": "Je laisse le Studio choisir",
  wide: "Plan large",
  medium: "Plan moyen",
  close: "Gros plan",
  detail: "Très gros plan / détail",
  overhead: "Vue de dessus",
} as const;

export const cameraOptions = {
  "": "Je laisse le Studio choisir",
  static: "Caméra fixe",
  push: "La caméra avance doucement",
  pull: "La caméra recule doucement",
  orbit: "La caméra tourne lentement autour du sujet",
  pan: "Panoramique lent",
  follow: "La caméra suit le sujet",
} as const;

export const lightOptions = {
  "": "Je laisse le Studio choisir",
  natural: "Lumière naturelle douce",
  studio: "Lumière de studio diffuse",
  golden: "Lumière chaude de fin de journée",
  contrast: "Lumière contrastée",
  backlit: "Contre-jour doux",
} as const;

export type Shot = keyof typeof shotOptions;
export type Camera = keyof typeof cameraOptions;
export type Light = keyof typeof lightOptions;

export function videoPrompt(prompt: string, shot: Shot, camera: Camera, light: Light) {
  const directions = [
    shot && `Cadrage : ${shotOptions[shot]}.`,
    camera && `Caméra : ${cameraOptions[camera]}.`,
    light && `Lumière : ${lightOptions[light]}.`,
  ].filter(Boolean);
  return [prompt.trim(), ...directions].filter(Boolean).join("\n");
}

export function isVideoDirection(value: unknown, options: Record<string, string>): value is string {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(options, value);
}
