// cron-health, scope weekly : grilles de prix des modèles (€), avec leur historique.
// Sorties d'index.ts à l'identique (fiche 18, lot 3). C'est LE fichier à toucher pour
// tarifer un nouveau modèle ; _shared/usage-labels_test.ts relit ce fichier.

// Coût images estimé (€/image, tarifs ~juillet 2026) : les APIs images sont
// facturées à l'image, et logUsage écrit 1 ligne ai_usage PAR image — le
// compte d'appels par modèle suffit donc. gpt-image-2 = high 1024x1536.
// GPT Image 2.5 (bascule 28/09) : même tarif au token que gpt-image-2 mais
// consommation par image différente (doc OpenAI) → 0,15 PROVISOIRE, à
// recaler sur les tokens_used réels d'ai_usage.
export const IMAGE_COST_EUR: Record<string, number> = {
  "gpt-image-2": 0.15,
  "gpt-image-2.5-flare": 0.15,
  "gpt-image-2.5-sunburst": 0.15,
  "gpt-image-1": 0.22,
  "photoroom-v2": 0.05,
  "recraftv3-vector": 0.04,
  // Higgsfield (05/10/2026, prix lus sur open.higgsfield.ai) : images
  // routées là depuis #1228 tant que le crédit OpenAI direct est épuisé.
  // Comptées 0 € « NON TARIFÉ » au bilan du 05/10 (22 appels).
  // Marketing Studio (GPT Image 2.5) est facturé au TOKEN (image en sortie
  // 30 $/Mtok, image en entrée 8 $, texte 5 $), réconcilié après coup par
  // Higgsfield : aucun coût réel n'est stocké chez nous (higgsfield_image_spend
  // ne garde que la RÉSERVATION, borne haute ~0,33 $). Forfait = tarif
  // standard (hors remise -15 %) de la 4k high, 0,72 $, ÷ 4 pour la 2k high
  // utilisée ici (¼ des pixels) ≈ 0,18 $, + prompt et photos d'entrée ≈ 0,02 $.
  // PROVISOIRE, à recaler sur la facture Higgsfield.
  "marketing-studio/image/flare": 0.2,
  "marketing-studio/image/sunburst": 0.2,
  // Soul 2 : prix fixe à l'image, 0,0057 $ en 1080p (la résolution du Studio).
  "higgsfield-ai/soul/v2/standard": 0.0057,
  "higgsfield-ai/soul/v2/image-to-image": 0.0057,
};

// ⚠️ Les chiffres ci-dessous sont les tarifs publics en DOLLARS repris tels
// quels (1 $ ≈ 1 €, sans conversion) : le « € » surestime donc le coût réel
// de ~10-15 %. Borne prudente assumée, garder la même convention partout.
// Coût texte estimé (€/million de tokens, tarifs Anthropic ~août 2026 :
// Haiku 4.5 = 1$/5$, Sonnet 5 = 2$/10$, Sonnet 4.6 = 3$/15$,
// Opus 4.8 et Opus 5 = 5$/25$ in/out).
// `tokens_used` mélange input+output ; on applique un tarif MIXTE avec une
// hypothèse 75 % input / 25 % output (les prompts contexte+charte dominent).
// Approximation assumée — l'ordre de grandeur suffit pour la tendance hebdo.
//
// ⚠️ TOUT modèle absent de ce map était compté ZÉRO EN SILENCE (le `|| 0`
// plus bas). C'est exactement ce qui est arrivé à `claude-sonnet-5` : la
// bascule prod de mi-juillet 2026 (secret `AI_MODEL_SONNET`, le défaut du
// code étant resté `claude-sonnet-4-6`) a rendu le compteur aveugle au
// modèle DOMINANT pendant ~1 mois — le rapport du 03/08 affichait 1,92 €
// là où le réel était ~4,8 €. D'où `modeles_non_tarifes` renvoyé plus bas :
// un modèle inconnu doit CRIER, pas coûter 0. À chaque nouveau modèle,
// l'ajouter ici (sinon il ressortira dans l'alerte du rapport hebdo).
export const TEXT_COST_EUR_PER_MTOKEN: Record<string, number> = {
  "claude-haiku-4-5": 2,
  "claude-sonnet-5": 4,
  "claude-sonnet-4-6": 6,
  "claude-opus-5-5": 8, // 4 $ / 20 $ par Mtok → 0,75×4 + 0,25×20
  "claude-opus-5": 10,
  "claude-opus-4-8": 10,
  "claude-opus-4-7": 10,
  // Modèles servis par la passerelle Lovable (`ai.gateway.lovable.dev`,
  // préfixe `google/`) : mini-audit Instagram, audit IA, impact branding,
  // suggestion de format, score de contenu, insight engagement, LinkedIn.
  // Lovable les facture en CRÉDITS d'abonnement, pas à l'appel — on retient
  // donc le tarif public Google comme APPROXIMATION d'ordre de grandeur
  // (Flash 0,30$/2,50$ ; Flash-Lite 0,10$/0,40$ par Mtok), même hypothèse
  // 75 % input / 25 % output que ci-dessus. Sans ces lignes, ces appels
  // étaient comptés ZÉRO et ressortaient chaque lundi dans l'alerte
  // `modeles_non_tarifes` (bilan du 07/09).
  "google/gemini-2.5-flash": 0.85,
  "google/gemini-2.5-flash-lite": 0.18,
  // OpenAI GPT-6 Astra (10$/50$ par Mtok, page de prix vérifiée le 28/09) :
  // rédacteur « qualité max » des carrousels. Astra RAISONNE et ses tokens
  // de réflexion sont facturés en SORTIE : l'hypothèse 75/25 (qui donnerait
  // 20) le sous-estime. Mix MESURÉ le 28/09 sur 2 carrousels réels :
  // 68 % entrée / 32 % sortie → 0,68×10 + 0,32×50 ≈ 23. Absent jusqu'ici :
  // chaque carrousel qualité max était compté ZÉRO (signalé le 14/09).
  "gpt-6-astra": 23,
  // Claude Fable 5.1 (10 $ / 50 $ par Mtok, même grille qu'Astra) : rédacteur
  // du mode Max depuis le 02/10. Il raisonne aussi (réflexion facturée en
  // sortie) → même mix mesuré qu'Astra en attendant une mesure propre : 23.
  "claude-fable-5-1": 23,
};
// Relecture éditoriale de CHAQUE carrousel (Astra jusqu’au 02/10, Claude ensuite) : elle n'écrit PAS dans
// ai_usage (une ligne = un crédit décompté à l'utilisatrice), ses tokens
// arrivent via content_quality_events.content_preview.editorial_usage, avec
// entrée et sortie SÉPARÉES → tarif exact, pas de mix supposé.
export const REVIEW_COST_EUR_PER_MTOKEN: Record<string, { input: number; output: number }> = {
  "gpt-6-astra": { input: 10, output: 50 }, // relecture jusqu'au 02/10
  // Relecture sur Claude depuis le 02/10 (4 $ / 20 $ par Mtok). Le cache
  // de prompt est compté au plein tarif d'entrée : borne haute.
  "claude-opus-5-5": { input: 4, output: 20 },
};

// Générations RÉELLES mais sans appel modèle : coût API nul, et c'est VOULU.
// Aujourd'hui le carrousel photo pur, dont le HTML est composé par code
// (chantier gabarits 13/07) — un crédit est bien débité, aucun modèle n'est
// appelé. Ces libellés sont donc « tarifés à 0 », pas « inconnus » : sans
// cette liste, la garde `modeles_non_tarifes` crierait à chaque carrousel
// photo et on réapprendrait à ignorer l'alerte, ce qui recréerait le bug
// qu'elle est censée empêcher.
// ⚠️ `composition-code` est la recopie de COMPOSED_BY_CODE_MODEL
// (`_shared/plan-limiter.ts`), gardée pour ne pas charger ce gros module dans
// cette edge (elle importe d'autres modules de `_shared/` depuis #1364 et #1450).
// Toute modification doit toucher les deux : `_shared/usage-labels_test.ts` y veille.
export const ZERO_COST_LABELS = new Set<string>(["composition-code"]);
