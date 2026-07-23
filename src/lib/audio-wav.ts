/**
 * audio-wav — encodage WAV (PCM 16 bits, mono) en pur TypeScript.
 *
 * Pourquoi : le micro du navigateur enregistre en WebM/Opus, un format que le
 * moteur de montage (JSON2Video) ne garantit pas. Le WAV est lisible partout.
 * La conversion se fait côté client : décodage WebAudio → `encodeWav`.
 *
 * `encodeWav` est une fonction pure (échantillons → octets) → testable sans
 * navigateur.
 */

/** Mixe plusieurs canaux en un seul (moyenne échantillon par échantillon). */
export function downmixToMono(channels: Float32Array[]): Float32Array {
  if (channels.length === 0) return new Float32Array(0);
  if (channels.length === 1) return channels[0];
  const len = channels[0].length;
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    let sum = 0;
    for (const ch of channels) sum += ch[i] ?? 0;
    out[i] = sum / channels.length;
  }
  return out;
}

/**
 * Encode des échantillons mono [-1, 1] en fichier WAV PCM 16 bits.
 * Les valeurs hors bornes sont écrêtées (pas de wrap-around audible).
 */
export function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const bytesPerSample = 2;
  const dataSize = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeString = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true); // taille du sous-bloc fmt
  view.setUint16(20, 1, true); // PCM non compressé
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true); // octets/seconde
  view.setUint16(32, bytesPerSample, true); // alignement de bloc
  view.setUint16(34, 16, true); // bits par échantillon
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, Math.round(clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff), true);
    offset += 2;
  }
  return buffer;
}
