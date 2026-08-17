/**
 * Toute écriture Supabase doit lire son erreur.
 *
 * Le client Supabase ne lève JAMAIS d'exception quand une écriture échoue :
 * il renvoie `{ data, error }` et c'est tout. Un `await supabase.from("x")
 * .insert(y)` dont on ne lit pas `error` échoue donc en silence — l'utilisateur
 * voit un toast de succès, rien n'est enregistré. C'est la famille de bugs
 * « succès menteur » : l'audit du 17/08/2026 en a trouvé ~55, tous corrigés à
 * la main. Cette règle empêche d'en réintroduire.
 *
 * Ce que la règle attrape (sur .insert / .update / .upsert / .delete d'une
 * chaîne contenant .from(...)) :
 *   await supabase.from("x").insert(y);                  // résultat jeté
 *   supabase.from("x").insert(y);                        // jamais attendu
 *   const { data } = await supabase.from("x").update(y); // error non lue
 *   const res = await ...update(y); use(res.data);       // res.error jamais lu
 *   ...insert(y).then(({ data }) => ...);                // callback sans error
 *
 * Ce qui passe :
 *   const { error } = await ...        // destructuré (renommage et ...rest ok)
 *   const res = await ...; if (res.error) ...            // lu plus loin
 *   if ((await ...insert(y)).error) ...                  // lu directement
 *   ...insert(y).throwOnError()                          // devient une exception
 *   return supabase.from("x").insert(y);                 // l'appelant gère
 *
 * Bénéfice du doute (non flagués, à surveiller en relecture) : le résultat
 * passé en argument (Promise.all([...])), retourné, ou rendu par une arrow en
 * expression (`() => supabase...insert(y)`) — la règle ne peut pas suivre ce
 * que l'appelant en fait. Faux positif avéré (ex. erreur vérifiée par un
 * helper qui reçoit le résultat) : désactiver sur la ligne en justifiant :
 *   // eslint-disable-next-line nowadays/require-supabase-error-check -- erreur vérifiée par <helper>
 */

const ECRITURES = new Set(["insert", "update", "upsert", "delete"]);

/** `x.error` ou `x["error"]` ? */
function estAccesErreur(membre) {
  if (membre.computed) {
    return membre.property.type === "Literal" && membre.property.value === "error";
  }
  return membre.property.name === "error";
}

/** Le pattern `{ error }`, `{ error: err }` ou `{ ...rest }` lit l'erreur. */
function patternLitErreur(pattern) {
  return pattern.properties.some((p) => {
    if (p.type === "RestElement") return true;
    if (p.computed) {
      return p.key.type === "Literal" && p.key.value === "error";
    }
    return p.key.name === "error" || p.key.value === "error";
  });
}

/** La chaîne sous ce .insert/.update/... contient-elle un appel .from(...) ? */
function chaineContientFrom(appelEcriture) {
  let n = appelEcriture.callee.object;
  while (n) {
    if (
      n.type === "CallExpression" &&
      n.callee.type === "MemberExpression" &&
      !n.callee.computed &&
      n.callee.property.name === "from"
    ) {
      return true;
    }
    if (n.type === "CallExpression") n = n.callee;
    else if (n.type === "MemberExpression") n = n.object;
    else return false;
  }
  return false;
}

/**
 * Remonte les chaînages après l'écriture (.select().eq().single()…) jusqu'au
 * sommet de l'expression. Signale au passage un .throwOnError() (l'erreur
 * devient une exception : rien à vérifier) et s'arrête sur un .then/.catch
 * (la promesse est consommée là, il faut inspecter le callback).
 */
function sommetDeChaine(node) {
  let courant = node;
  for (;;) {
    const parent = courant.parent;
    if (parent?.type !== "MemberExpression" || parent.object !== courant) {
      return { sommet: courant };
    }
    const appel = parent.parent;
    if (appel?.type !== "CallExpression" || appel.callee !== parent) {
      return { sommet: courant };
    }
    const prop = parent.computed ? null : parent.property.name;
    if (prop === "throwOnError") return { throwOnError: true };
    if (prop === "then" || prop === "catch" || prop === "finally") {
      return { promesse: { appel, prop } };
    }
    courant = appel;
  }
}

/** Une des lectures de `variable` (hors écritures) consomme-t-elle `.error` ? */
function variableConsommeErreur(variable) {
  return variable.references.some((ref) => {
    if (!ref.isRead()) return false;
    const parent = ref.identifier.parent;
    if (parent.type === "MemberExpression" && parent.object === ref.identifier) {
      return estAccesErreur(parent);
    }
    // Passée à une fonction, retournée, comparée… : bénéfice du doute.
    return true;
  });
}

/** Le corps de ce callback accède-t-il à `<param>.error` ? */
function corpsLitErreur(corps, nomParam) {
  let trouve = false;
  (function visite(n) {
    if (trouve || !n || typeof n.type !== "string") return;
    if (
      n.type === "MemberExpression" &&
      n.object.type === "Identifier" &&
      n.object.name === nomParam &&
      estAccesErreur(n)
    ) {
      trouve = true;
      return;
    }
    for (const cle of Object.keys(n)) {
      if (cle === "parent") continue;
      const v = n[cle];
      if (Array.isArray(v)) v.forEach(visite);
      else if (v && typeof v.type === "string") visite(v);
    }
  })(corps);
  return trouve;
}

/** `.then(cb)` : le callback lit-il l'erreur du résultat ? */
function thenConsommeErreur(promesse) {
  // .catch/.finally en premier : le client Supabase ne rejette jamais sur
  // {error}, donc rien n'y arrive — l'erreur n'est lue nulle part.
  if (promesse.prop !== "then") return false;
  const cb = promesse.appel.arguments[0];
  if (!cb) return false;
  // Référence à une fonction nommée : on ne peut pas la suivre, bénéfice du doute.
  if (cb.type !== "ArrowFunctionExpression" && cb.type !== "FunctionExpression") {
    return true;
  }
  const param = cb.params[0];
  if (!param) return false;
  if (param.type === "ObjectPattern") return patternLitErreur(param);
  if (param.type === "Identifier") return corpsLitErreur(cb.body, param.name);
  return true;
}

export const requireSupabaseErrorCheck = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Exige que le résultat d'une écriture Supabase (insert/update/upsert/delete) soit vérifié : lecture de `error` ou throwOnError(). Sinon l'échec est silencieux (« succès menteur »).",
    },
    schema: [],
    messages: {
      erreurIgnoree:
        "Écriture Supabase (.{{methode}}) dont l'erreur n'est jamais lue : le client ne lève pas d'exception, un échec passe inaperçu (« succès menteur »). Destructure `{ error }` et traite-la, ou chaîne `.throwOnError()`.",
      jamaisAttendue:
        "Écriture Supabase (.{{methode}}) jamais attendue ni vérifiée : la requête part peut-être, mais personne ne saura si elle a échoué. `await` le résultat et lis `error`.",
    },
  },

  create(context) {
    const sourceCode = context.sourceCode;

    /** true = erreur consommée quelque part ; false = à signaler. */
    function erreurConsommee(node) {
      const res = sommetDeChaine(node);
      if (res.throwOnError) return true;
      if (res.promesse) return thenConsommeErreur(res.promesse);
      const { sommet } = res;
      const parent = sommet.parent;

      if (parent.type === "AwaitExpression") {
        const usage = parent.parent;
        if (usage.type === "ExpressionStatement") return false;
        if (usage.type === "VariableDeclarator" && usage.init === parent) {
          if (usage.id.type === "ObjectPattern") return patternLitErreur(usage.id);
          if (usage.id.type === "Identifier") {
            const [variable] = sourceCode.getDeclaredVariables(usage);
            return variable ? variableConsommeErreur(variable) : true;
          }
          return true;
        }
        if (usage.type === "AssignmentExpression" && usage.right === parent) {
          if (usage.left.type === "ObjectPattern") return patternLitErreur(usage.left);
          return true; // affectation à une variable existante : hors de portée locale
        }
        if (usage.type === "MemberExpression" && usage.object === parent) {
          return estAccesErreur(usage); // (await ...).error ok, (await ...).data non
        }
        return true; // return await, argument, condition… : l'appelant gère
      }

      // Pas de await : promesse flottante posée en instruction (ou jetée via void).
      if (parent.type === "ExpressionStatement") return "flottante";
      if (parent.type === "UnaryExpression" && parent.operator === "void") {
        return "flottante";
      }
      return true; // return / argument / corps d'arrow : l'appelant gère
    }

    return {
      CallExpression(node) {
        const callee = node.callee;
        if (callee.type !== "MemberExpression" || callee.computed) return;
        const methode = callee.property.name;
        if (!ECRITURES.has(methode)) return;
        if (!chaineContientFrom(node)) return;

        const verdict = erreurConsommee(node);
        if (verdict === true) return;
        context.report({
          node: callee.property,
          messageId: verdict === "flottante" ? "jamaisAttendue" : "erreurIgnoree",
          data: { methode },
        });
      },
    };
  },
};

export default {
  rules: { "require-supabase-error-check": requireSupabaseErrorCheck },
};
