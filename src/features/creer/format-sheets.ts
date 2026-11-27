// LA FICHE PAR FORMAT (27/11/2026).
//
// Un seul tableau qui dit, pour chaque format de /creer, par quel chemin il
// passe : ses questions, son écriture, ce qu'on voit pendant l'attente, s'il
// s'enregistre tout seul, quelles règles d'écriture le couvrent.
//
// Ce fichier ne pilote rien : il DÉCRIT le code. `src/test/format-sheets.test.ts`
// relit le vrai code et échoue si une case ne dit plus la vérité, ou si un
// « non » n'a pas sa raison écrite. Quand tu changes le chemin d'un format,
// change sa fiche dans la même PR : c'est le test qui te le rappellera.
//
// À quoi ça sert : une amélioration faite pour un format (« afficher au fur et
// à mesure », « enregistrer tout seul ») devient une colonne. On voit d'un
// coup d'œil quels formats ne l'ont pas, et pourquoi.
import type { SupportedFormat } from "@/lib/format-normalizer";

/** Oui, ou non avec sa raison (obligatoire : un « non » sans raison est un oubli). */
export type OuiNon = { etat: "oui"; detail: string } | { etat: "non" | "en_partie"; raison: string };

export interface FormatSheet {
  /** Nom lisible. */
  nom: string;
  /** Fonction serveur qui prépare les questions ; null = pas d'étape questions. */
  questions: { fonction: "carousel-ai" | "creative-flow" } | { fonction: null; raison: string };
  ecriture: {
    /** Fonction serveur qui écrit le contenu. */
    fonction: "carousel-ai" | "creative-flow" | "pinterest-visual" | "pinterest-photo-brief" | "pinterest-inspiration";
    /**
     * Comment /creer l'appelle : `signaux` = invokeWithHeartbeat (le serveur
     * envoie des étapes et des brouillons), `texte` = generateStream (flux de
     * texte), `bloc` = une réponse d'un seul tenant.
     */
    appel: "signaux" | "texte" | "bloc";
  };
  /** Voit-on le contenu s'écrire avant la fin ? */
  filDeLeau: OuiNon;
  /** Arrive-t-il dans Mes idées sans cliquer ? */
  enregistreSeul: OuiNon;
  /**
   * Formats du registre des règles d'écriture (`supabase/functions/_shared/socle.ts`,
   * `SOCLE_CHEMINS`) qui couvrent ce format ; liste vide = aucune règle du socle.
   */
  socle: { formats: string[]; raison?: string };
}

export const FORMAT_SHEETS: Record<SupportedFormat, FormatSheet> = {
  carousel: {
    nom: "Carrousel (texte, photo, mixte, LinkedIn)",
    questions: { fonction: "carousel-ai" },
    ecriture: { fonction: "carousel-ai", appel: "signaux" },
    filDeLeau: { etat: "oui", detail: "Titres prévus, puis slides en brouillon." },
    enregistreSeul: { etat: "oui", detail: "Sauvegarde continue dans Mes idées." },
    socle: { formats: ["carrousel_texte", "carrousel_photo", "carrousel_mixte", "carrousel_linkedin"] },
  },
  reel: {
    nom: "Reel",
    questions: { fonction: "creative-flow" },
    ecriture: { fonction: "creative-flow", appel: "signaux" },
    filDeLeau: { etat: "oui", detail: "Accroche choisie, puis script en brouillon." },
    enregistreSeul: { etat: "oui", detail: "Sauvegarde continue dans Mes idées." },
    socle: { formats: ["reel"] },
  },
  story: {
    nom: "Stories",
    questions: { fonction: "creative-flow" },
    ecriture: { fonction: "creative-flow", appel: "signaux" },
    filDeLeau: { etat: "oui", detail: "Chaque story finie, en brouillon (pas en mode photo : réponse d'un bloc)." },
    enregistreSeul: { etat: "oui", detail: "Sauvegarde continue dans Mes idées." },
    socle: { formats: ["stories"] },
  },
  post: {
    nom: "Post Instagram",
    questions: { fonction: "creative-flow" },
    ecriture: { fonction: "creative-flow", appel: "texte" },
    filDeLeau: { etat: "oui", detail: "Le texte s'écrit mot à mot." },
    enregistreSeul: { etat: "oui", detail: "Sauvegarde continue, sauf post avec photos (bouton « Garder dans mes idées »)." },
    socle: { formats: ["post_instagram", "legende_photo"] },
  },
  linkedin: {
    nom: "Post LinkedIn",
    questions: { fonction: "creative-flow" },
    ecriture: { fonction: "creative-flow", appel: "texte" },
    filDeLeau: { etat: "non", raison: "Écrit en deux passes (rédaction puis relecture) : seules les étapes s'affichent, le texte arrive relu." },
    enregistreSeul: { etat: "oui", detail: "Sauvegarde continue, sauf post avec photos." },
    socle: { formats: ["post_linkedin"] },
  },
  newsletter: {
    nom: "Newsletter",
    questions: { fonction: "creative-flow" },
    ecriture: { fonction: "creative-flow", appel: "texte" },
    filDeLeau: { etat: "non", raison: "Écrite en deux passes (rédaction puis relecture) : seules les étapes s'affichent." },
    enregistreSeul: { etat: "non", raison: "Pas de sauvegarde continue pour ce format : bouton « Garder dans mes idées »." },
    socle: { formats: ["newsletter"] },
  },
  pinterest: {
    nom: "Épingle Pinterest (texte)",
    questions: { fonction: "creative-flow" },
    ecriture: { fonction: "creative-flow", appel: "texte" },
    filDeLeau: { etat: "oui", detail: "Le texte s'écrit mot à mot." },
    enregistreSeul: { etat: "non", raison: "Pas de sauvegarde continue pour ce format : bouton « Garder dans mes idées »." },
    socle: { formats: ["pinterest"] },
  },
  pinterest_visual: {
    nom: "Épingle Pinterest (visuel)",
    questions: { fonction: "creative-flow" },
    ecriture: { fonction: "pinterest-visual", appel: "bloc" },
    filDeLeau: { etat: "non", raison: "Une image composée d'un seul tenant : rien à montrer avant la fin." },
    enregistreSeul: { etat: "non", raison: "Pas de sauvegarde continue pour ce format." },
    socle: { formats: [], raison: "Fonction à part (pinterest-visual) : pas encore dans le registre des règles d'écriture." },
  },
  pinterest_photo: {
    nom: "Épingle Pinterest (photo)",
    questions: { fonction: "creative-flow" },
    ecriture: { fonction: "pinterest-photo-brief", appel: "bloc" },
    filDeLeau: { etat: "non", raison: "Consignes photo rendues d'un seul tenant." },
    enregistreSeul: { etat: "non", raison: "Pas de sauvegarde continue pour ce format." },
    socle: { formats: [], raison: "Fonction à part (pinterest-photo-brief) : pas encore dans le registre des règles d'écriture." },
  },
  pinterest_inspiration: {
    nom: "Épingle Pinterest (inspiration)",
    questions: { fonction: null, raison: "L'analyse de l'épingle envoyée remplace les questions : on choisit une proposition." },
    ecriture: { fonction: "pinterest-inspiration", appel: "bloc" },
    filDeLeau: { etat: "non", raison: "Analyse d'image rendue d'un seul tenant." },
    enregistreSeul: { etat: "non", raison: "Pas de sauvegarde continue pour ce format." },
    socle: { formats: [], raison: "Fonction à part (pinterest-inspiration) : pas encore dans le registre des règles d'écriture." },
  },
};
