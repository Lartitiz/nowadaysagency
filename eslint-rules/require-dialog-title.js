/**
 * Toute fenêtre Radix doit contenir son titre.
 *
 * Sans <DialogTitle> (ou son équivalent Sheet / AlertDialog / Drawer), un lecteur
 * d'écran annonce « boîte de dialogue » et rien d'autre, et Radix crie dans la
 * console à chaque ouverture. Ces avertissements-là ne se voient qu'en ouvrant la
 * modale : ils survivent des mois sans que personne les croise. Cette règle les
 * attrape à l'écriture, sans rien monter ni rendre.
 *
 * Le titre peut être masqué à l'œil (`className="sr-only"`) quand le design n'en
 * veut pas : c'est la présence du composant que Radix vérifie, pas sa visibilité.
 *
 * Portée : les composants applicatifs (<DialogContent>, <SheetContent>…), pas la
 * forme primitive <DialogPrimitive.Content>. Cette dernière n'existe que dans les
 * 4 wrappers de src/components/ui/, où le titre vient forcément de l'appelant :
 * l'y exiger ne produirait que des faux positifs.
 *
 * Autre faux positif possible : un titre rendu par un sous-composant
 * (`<MonEnTete />`), que la règle ne peut pas suivre. Dans ce cas seulement,
 * désactiver sur la ligne :
 *   // eslint-disable-next-line nowadays/require-dialog-title -- titre rendu par <MonEnTete />
 */

const PAIRES = {
  DialogContent: "DialogTitle",
  SheetContent: "SheetTitle",
  AlertDialogContent: "AlertDialogTitle",
  DrawerContent: "DrawerTitle",
};

const TITRES = new Set(Object.values(PAIRES));

/** `DialogContent` ou `DialogPrimitive.Content` → chaîne comparable. */
function nomDe(node) {
  if (node.type === "JSXIdentifier") return node.name;
  if (node.type === "JSXMemberExpression") {
    return `${nomDe(node.object)}.${nomDe(node.property)}`;
  }
  return null;
}

export const requireDialogTitle = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Exige un Title dans chaque DialogContent / SheetContent / AlertDialogContent / DrawerContent (accessibilité Radix).",
    },
    schema: [],
    messages: {
      titreManquant:
        "<{{content}}> sans <{{titre}}> : les lecteurs d'écran n'annoncent rien à l'ouverture et Radix émet un avertissement. Ajoute un <{{titre}}>, en `className=\"sr-only\"` si le design n'en veut pas.",
    },
  },

  create(context) {
    // Repérés pendant le parcours, comparés à la fin : un titre peut être niché
    // dans n'importe quelle expression ({cond && <DialogTitle/>}, .map(), etc.),
    // donc on raisonne sur les positions plutôt que sur l'arbre des enfants.
    const titres = [];
    const contenus = [];

    return {
      JSXOpeningElement(node) {
        const nom = nomDe(node.name);
        if (nom && TITRES.has(nom)) titres.push({ nom, range: node.range });
      },

      JSXElement(node) {
        const nom = nomDe(node.openingElement.name);
        const attendu = nom && PAIRES[nom];
        if (attendu) contenus.push({ node, nom, attendu });
      },

      "Program:exit"() {
        for (const { node, nom, attendu } of contenus) {
          const [debut, fin] = node.range;
          const trouve = titres.some(
            (t) => t.nom === attendu && t.range[0] > debut && t.range[1] < fin,
          );
          if (!trouve) {
            context.report({
              node: node.openingElement,
              messageId: "titreManquant",
              data: { content: nom, titre: attendu },
            });
          }
        }
      },
    };
  },
};

export default {
  rules: { "require-dialog-title": requireDialogTitle },
};
