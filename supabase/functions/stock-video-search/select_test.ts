import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { pickBestVerticalFile, type PexelsVideoFile } from "./select.ts";

// Jeu de fichiers réaliste (extrait d'une vraie réponse Pexels, un même clip
// décliné en plusieurs tailles et ratios).
const files: PexelsVideoFile[] = [
  { quality: "sd", file_type: "video/mp4", width: 360, height: 640, link: "sd_360.mp4" },
  { quality: "hd", file_type: "video/mp4", width: 720, height: 1280, link: "hd_720.mp4" },
  { quality: "hd", file_type: "video/mp4", width: 1080, height: 1920, link: "hd_1080.mp4" },
  { quality: "uhd", file_type: "video/mp4", width: 2160, height: 3840, link: "uhd_2160.mp4" },
  { quality: "hd", file_type: "video/mp4", width: 1920, height: 1080, link: "paysage.mp4" },
];

Deno.test("choisit le MP4 vertical 1080 quand il existe", () => {
  assertEquals(pickBestVerticalFile(files)?.link, "hd_1080.mp4");
});

Deno.test("préfère un vertical plus petit au 4K vertical", () => {
  const sansFullHd = files.filter((f) => f.width !== 1080 || f.height !== 1920);
  // Reste : sd 360, hd 720 (verticaux), uhd 2160 (vertical mais lourd), paysage.
  assertEquals(pickBestVerticalFile(sansFullHd)?.link, "hd_720.mp4");
});

Deno.test("tombe sur le paysage seulement si aucun vertical", () => {
  const paysageSeul: PexelsVideoFile[] = [
    { file_type: "video/mp4", width: 1920, height: 1080, link: "paysage.mp4" },
  ];
  assertEquals(pickBestVerticalFile(paysageSeul)?.link, "paysage.mp4");
});

Deno.test("détecte le MP4 par l'URL quand file_type manque", () => {
  const sansType: PexelsVideoFile[] = [
    { width: 1080, height: 1920, link: "https://x/clip-hd_1080_1920.mp4" },
  ];
  assertEquals(pickBestVerticalFile(sansType)?.link, "https://x/clip-hd_1080_1920.mp4");
});

Deno.test("renvoie null si aucun MP4 exploitable", () => {
  const rien: PexelsVideoFile[] = [
    { file_type: "video/quicktime", width: 1080, height: 1920, link: "clip.mov" },
  ];
  assertEquals(pickBestVerticalFile(rien), null);
});
