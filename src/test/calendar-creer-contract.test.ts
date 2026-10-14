import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const lire = (rel: string) => fs.readFileSync(path.join(RACINE, rel), "utf8");

// Contrat calendrier → /creer (lot 2 « robustesse création de contenu »,
// 13/10/2026 ; voir docs/creation-contenu/CARTE.md, section 2).
//
// Le calendrier ouvre le générateur avec un navigate state et des paramètres
// d'URL. Les deux côtés sont typés `any` : renommer une clé d'un seul côté
// passe TypeScript, le build et les tests sans bruit, et le contexte du post
// (date, brouillon existant, retour vers le bon post) se perd en silence.
//
// Ce test est le lien mécanique entre les deux : il relit les sources et
// vérifie que chaque clé envoyée et attendue existe des DEUX côtés. Si tu
// renommes une clé, renomme-la partout, puis mets à jour les listes ci-dessous.

const creer = lire("src/pages/CreerUnifie.tsx");
const calendar = lire("src/pages/Calendar.tsx");
const dialog = lire("src/components/calendar/CalendarPostDialog.tsx");

/** Corps d'une fonction `const nom = …` jusqu'à la déclaration `const handle…` suivante. */
function corps(src: string, nom: string): string {
  const debut = src.indexOf(`const ${nom} = `);
  expect(debut, `fonction ${nom} introuvable`).toBeGreaterThan(-1);
  const suite = src.slice(debut + 1).search(/\n\s*const handle\w+ = /);
  return suite === -1 ? src.slice(debut) : src.slice(debut, debut + 1 + suite);
}

/** La clé apparaît dans un littéral d'objet : `cle:` ou forme courte `cle,` / `cle }`. */
const envoie = (bloc: string, cle: string) => new RegExp(`[{,\\s]${cle}\\s*(:|,|\\})`).test(bloc);
/** /creer lit la clé du navigate state. */
const litState = (cle: string) => new RegExp(`locState\\??\\.${cle}\\b`).test(creer);
/** /creer lit le paramètre d'URL. */
const litParam = (p: string) => creer.includes(`searchParams.get("${p}")`);

// Clés du state que /creer exploite quand on arrive du calendrier.
const CLES_STATE_COMMUNES = ["fromCalendar", "calendarPostId", "existingContent", "format", "objectif", "angle"];
// Paramètres d'URL que /creer exploite.
const PARAMS_URL = ["sujet", "objectif", "from"];

const ENVOIS: { nom: string; bloc: string; state: string[]; params: string[] }[] = [
  { nom: "Calendar.tsx › handleQuickGenerate", bloc: corps(calendar, "handleQuickGenerate"),
    state: [...CLES_STATE_COMMUNES, "postDate"], params: PARAMS_URL },
  { nom: "CalendarPostDialog › handleNavigateToGenerator", bloc: corps(dialog, "handleNavigateToGenerator"),
    state: [...CLES_STATE_COMMUNES, "postDate"], params: PARAMS_URL },
  { nom: "CalendarPostDialog › handleNavigateToDeepen", bloc: corps(dialog, "handleNavigateToDeepen"),
    state: [...CLES_STATE_COMMUNES, "postDate"], params: [...PARAMS_URL, "format"] },
  { nom: "CalendarPostDialog › handleOpenAtelier", bloc: corps(dialog, "handleOpenAtelier"),
    state: [...CLES_STATE_COMMUNES, "postDate", "resumeIdea"], params: [] },
];

describe("contrat calendrier → /creer", () => {
  it("/creer lit toujours chaque clé de state envoyée par le calendrier", () => {
    const toutes = new Set(ENVOIS.flatMap((e) => e.state));
    for (const cle of toutes) expect(litState(cle), `CreerUnifie ne lit plus locState.${cle}`).toBe(true);
  });

  it("/creer lit toujours chaque paramètre d'URL envoyé par le calendrier", () => {
    const tous = new Set(ENVOIS.flatMap((e) => e.params));
    for (const p of tous) expect(litParam(p), `CreerUnifie ne lit plus le paramètre « ${p} »`).toBe(true);
  });

  for (const envoi of ENVOIS) {
    it(`${envoi.nom} envoie toutes les clés attendues`, () => {
      for (const cle of envoi.state) expect(envoie(envoi.bloc, cle), `${envoi.nom} n'envoie plus « ${cle} »`).toBe(true);
      for (const p of envoi.params) expect(envoi.bloc.includes(`params.set("${p}"`), `${envoi.nom} n'envoie plus ?${p}=`).toBe(true);
      expect(envoi.bloc).toContain("navigate(");
    });
  }

  it("le retour vers le calendrier part bien de calendarPostId", () => {
    // fromCalendar = !!calendarPostId : sans cet identifiant, « Sauvegarder
    // dans le calendrier » crée un nouveau post au lieu de remplir l'ancien.
    expect(creer).toMatch(/const fromCalendar = !!calendarPostId/);
  });

  it("sans state, le lien vers le post vient du paramètre calendar_id", () => {
    // Le calendrier envoie calendar_id dans l'URL ET calendarPostId dans le
    // state : si le state est perdu, l'URL suffit à retrouver le post.
    expect(creer).toMatch(/useState<string \| null>\(locState\?\.calendarPostId \|\| searchParams\.get\("calendar_id"\)/);
    for (const e of ENVOIS.filter((x) => x.params.length)) expect(e.bloc, e.nom).toContain('params.set("calendar_id"');
  });
});
