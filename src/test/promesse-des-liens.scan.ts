/**
 * Sonde « le lien tient sa promesse ».
 *
 * Elle relève, dans le source, chaque élément cliquable (`<Link>`, `<a>`,
 * `<Button>`, `<button>`) qui emmène quelque part dans l'app, avec son TEXTE
 * VISIBLE et sa DESTINATION. Puis elle confronte les deux à un lexique
 * d'intentions : un bouton qui dit « Passer au Premium » doit atterrir sur une
 * page d'abonnement, pas ailleurs.
 *
 * Pourquoi cette sonde existe (01/08/2026) : sept boutons affichant
 * « Passer au Premium — 39 €/mois » pointaient sur /mon-plan, qui est le plan de
 * COMMUNICATION (éditorial). On cliquait pour payer, on atterrissait sur son
 * calendrier de contenus. Aucun signal technique ne pouvait le voir : la page
 * s'affichait vite, sans erreur console, sans souci d'accessibilité. Elle
 * n'était simplement pas celle que le bouton promettait.
 *
 * C'est une garde DÉTERMINISTE : elle ne juge que des formulations sans
 * ambiguïté possible, et toute exception légitime s'inscrit dans EXCEPTIONS.
 */

import fs from "node:fs";
import path from "node:path";

export type Cliquable = {
  fichier: string;
  ligne: number;
  destination: string;
  label: string;
};

export type Violation = Cliquable & {
  famille: string;
  attendu: string[];
};

/** Balises qui portent un clic dans cette base de code. */
const BALISES = ["Link", "a", "Button", "button"];

/** Destination écrite en clair dans l'élément. */
const DEST_LITTERALE =
  /(?:to=["']|href=["']|navigate\(["']|location\.assign\(["']|location\.href\s*=\s*["'])(\/[a-z0-9/_-]*)["']/i;

/**
 * Destination exprimée via un aiguilleur maison. Depuis #665/#667, les départs
 * passent par ces helpers pour mémoriser le retour — la destination n'est donc
 * plus un littéral dans l'élément.
 */
const AIGUILLEURS: Record<string, string> = {
  versTarifs: "/pricing",
  partirVersTarifs: "/pricing",
  versConnexions: "/parametres/connexions",
};

/**
 * Familles de destinations. Un libellé qui annonce une intention doit atterrir
 * dans la bonne famille.
 */
export const FAMILLES: Array<{
  famille: string;
  /** Formulations SANS AMBIGUÏTÉ — on préfère rater un cas que crier à tort. */
  libelle: RegExp;
  destinations: string[];
}> = [
  {
    famille: "abonnement",
    libelle:
      /Pass(?:er|e)\s+(?:au|à)\s+(?:Premium|plan Premium|L['’]Assistant)|Découvrir le Premium|Voir les plans|création illimitée/i,
    destinations: ["/pricing", "/abonnement", "/checkout", "/payment"],
  },
  {
    famille: "connexions",
    libelle:
      /Connecter\s+(?:ton compte|Instagram|LinkedIn|Canva|Pinterest|Google)|Connecte ton compte|\bReconnecter\b/i,
    destinations: ["/parametres/connexions"],
  },
];

/**
 * Exceptions assumées : `fichier:label` dont la destination sort de la famille
 * pour une bonne raison. Toute entrée ici doit être justifiée en commentaire.
 */
const EXCEPTIONS: string[] = [];

/** Retire les accolades JSX en comptant la profondeur : `onClick={() => f()}`
 *  contient un `>` qui casserait un simple retrait de balises. */
function sansAccolades(source: string): string {
  let out = "";
  let depth = 0;
  for (const c of source) {
    if (c === "{") depth++;
    else if (c === "}") {
      if (depth > 0) depth--;
    } else if (depth === 0) out += c;
  }
  return out;
}

function texteVisible(jsx: string): string {
  return sansAccolades(jsx)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function listeFichiers(racine: string): string[] {
  const out: string[] = [];
  (function walk(d: string) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        if (e.name !== "node_modules") walk(p);
      } else if (/\.tsx$/.test(e.name) && !/\.test\.tsx$/.test(e.name)) {
        out.push(p);
      }
    }
  })(path.join(racine, "src"));
  return out;
}

/**
 * Destination d'un élément, en remontant si besoin d'UN niveau : un
 * `onClick={handleCtaClick}` renvoie à une fonction définie dans le même
 * fichier, dont le corps porte la vraie destination (cas de QuotaWallModal).
 */
function destinationDe(slice: string, source: string): string | null {
  const litterale = slice.match(DEST_LITTERALE)?.[1];
  if (litterale) return litterale;

  for (const [nom, dest] of Object.entries(AIGUILLEURS)) {
    if (new RegExp(`\\b${nom}\\s*\\(`).test(slice)) return dest;
  }

  // onClick={monHandler} → on lit le corps de `monHandler` dans le fichier.
  const handler = slice.match(/onClick=\{\s*([A-Za-z_$][\w$]*)\s*\}/)?.[1];
  if (handler) {
    const decl = new RegExp(`(?:const|function)\\s+${handler}\\b`).exec(source);
    if (decl) {
      const corps = source.slice(decl.index, decl.index + 700);
      const dl = corps.match(DEST_LITTERALE)?.[1];
      if (dl) return dl;
      for (const [nom, dest] of Object.entries(AIGUILLEURS)) {
        if (new RegExp(`\\b${nom}\\s*\\(`).test(corps)) return dest;
      }
    }
  }
  return null;
}

/** Relève tous les éléments cliquables menant quelque part dans l'app. */
export function releveLesCliquables(racine: string): Cliquable[] {
  const vus = new Set<string>();
  const out: Cliquable[] = [];
  for (const fichier of listeFichiers(racine)) {
    const source = fs.readFileSync(fichier, "utf8");
    for (const balise of BALISES) {
      const ouvre = new RegExp(`<${balise}\\b`, "g");
      const ferme = `</${balise}>`;
      let m: RegExpExecArray | null;
      while ((m = ouvre.exec(source))) {
        const fin = source.indexOf(ferme, m.index);
        if (fin === -1) continue;
        const slice = source.slice(m.index, fin);
        // Élément anormalement long : on ne saurait pas dire quel texte lui
        // appartient vraiment. Mieux vaut passer que se tromper.
        if (slice.length > 2000) continue;
        const destination = destinationDe(slice, source);
        if (!destination) continue;
        const label = texteVisible(slice);
        if (!label) continue;
        const cle = `${fichier}::${destination}::${label}`;
        if (vus.has(cle)) continue;
        vus.add(cle);
        out.push({
          fichier: path.relative(racine, fichier),
          ligne: source.slice(0, m.index).split("\n").length,
          destination,
          label,
        });
      }
    }
  }
  return out;
}

/** Confronte chaque libellé porteur d'intention à sa destination réelle. */
export function liensQuiMentent(racine: string): Violation[] {
  const violations: Violation[] = [];
  for (const el of releveLesCliquables(racine)) {
    for (const { famille, libelle, destinations } of FAMILLES) {
      if (!libelle.test(el.label)) continue;
      if (destinations.some((d) => el.destination.startsWith(d))) continue;
      if (EXCEPTIONS.includes(`${el.fichier}:${el.label}`)) continue;
      violations.push({ ...el, famille, attendu: destinations });
    }
  }
  return violations;
}
