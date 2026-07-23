import { describe, it, expect } from "vitest";
import { encodeWav, downmixToMono } from "@/lib/audio-wav";

function ascii(view: DataView, offset: number, len: number): string {
  let s = "";
  for (let i = 0; i < len; i++) s += String.fromCharCode(view.getUint8(offset + i));
  return s;
}

describe("encodeWav", () => {
  it("écrit un en-tête WAV valide (RIFF/WAVE/fmt/data, PCM 16 bits mono)", () => {
    const buf = encodeWav(new Float32Array([0, 0.5, -0.5]), 44100);
    const v = new DataView(buf);
    expect(ascii(v, 0, 4)).toBe("RIFF");
    expect(ascii(v, 8, 4)).toBe("WAVE");
    expect(ascii(v, 12, 4)).toBe("fmt ");
    expect(ascii(v, 36, 4)).toBe("data");
    expect(v.getUint16(20, true)).toBe(1); // PCM
    expect(v.getUint16(22, true)).toBe(1); // mono
    expect(v.getUint32(24, true)).toBe(44100);
    expect(v.getUint16(34, true)).toBe(16); // bits/échantillon
    expect(v.getUint32(40, true)).toBe(3 * 2); // taille des données
    expect(buf.byteLength).toBe(44 + 6);
  });

  it("convertit les échantillons et écrête hors bornes", () => {
    const buf = encodeWav(new Float32Array([1, -1, 2, -2, 0]), 8000);
    const v = new DataView(buf);
    expect(v.getInt16(44, true)).toBe(0x7fff); // 1 → max
    expect(v.getInt16(46, true)).toBe(-0x8000); // -1 → min
    expect(v.getInt16(48, true)).toBe(0x7fff); // 2 écrêté
    expect(v.getInt16(50, true)).toBe(-0x8000); // -2 écrêté
    expect(v.getInt16(52, true)).toBe(0);
  });
});

describe("downmixToMono", () => {
  it("moyenne les canaux", () => {
    const mono = downmixToMono([new Float32Array([1, 0]), new Float32Array([0, 1])]);
    expect(Array.from(mono)).toEqual([0.5, 0.5]);
  });
  it("laisse passer un canal unique tel quel", () => {
    const ch = new Float32Array([0.25]);
    expect(downmixToMono([ch])).toBe(ch);
  });
});
