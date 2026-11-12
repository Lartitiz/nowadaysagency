// Dernier choix de voix (« Ma voix » / « Sans voix ») retenu dans ce navigateur,
// pour qu'un NOUVEAU reel parte du même choix. Un montage enregistré garde
// toujours le sien. Préférence de confort : sans stockage, on repart sur « Ma voix ».
const KEY = "reel-montage:last-voice-mode";

export function lastVoiceMode(): "recorded" | "silent" {
  try { return localStorage.getItem(KEY) === "silent" ? "silent" : "recorded"; } catch { return "recorded"; }
}

export function rememberVoiceMode(mode: "recorded" | "silent") {
  try { localStorage.setItem(KEY, mode); } catch { /* préférence non retenue, sans effet sur le montage */ }
}
