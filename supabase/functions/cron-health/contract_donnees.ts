// Jeu de données du contrat de cron-health (fiche 18, lot T) — tests UNIQUEMENT.
// Une seule petite « base » qui fait sortir chaque branche des deux scopes :
// voir handler_contract_test.ts pour ce que chaque ligne doit déclencher.
import type { FauxMonde } from "./contract_harness.ts";

/** L'heure figée des tests : le 9 du mois = jour du reset Photoroom (rythme non significatif). */
export const MAINTENANT = "2026-10-09T08:00:00.000Z";
const T = Date.parse(MAINTENANT);
const H = 3600000;
const J = 24 * H;
/** Date ISO à `ms` millisecondes AVANT MAINTENANT. */
export const ilYa = (ms: number) => new Date(T - ms).toISOString();
/** Date ISO à `ms` millisecondes APRÈS MAINTENANT. */
const dansLe = (ms: number) => new Date(T + ms).toISOString();

// Comptes : 2 clientes, l'admin (gardée en daily, exclue en weekly), un compte de
// test (exclu partout), un compte de recette en domaine réservé (exclu partout).
export const PROFILS = [
  { user_id: "u-marie", email: "marie@client.fr", created_at: ilYa(4 * J) },
  { user_id: "u-jo", email: "jo@client.fr", created_at: ilYa(19 * J) },
  { user_id: "u-sam", email: "sam@client.fr", created_at: ilYa(30 * J) },
  { user_id: "u-admin", email: "laetitia@nowadaysagency.com", created_at: ilYa(200 * J) },
  { user_id: "u-test", email: "laetitiatest@nowadaysagency.com", created_at: ilYa(9 * J) },
  { user_id: "u-recette", email: "qa-premiere-1@example.com", created_at: ilYa(2 * J) },
];

const POSTS = [
  // Échec récent (12 h) avec une erreur longue : tronquée à 140 caractères.
  { id: "p1", user_id: "u-marie", canal: "instagram", status: "planned", publish_status: "failed", publish_error: "Erreur Instagram : " + "x".repeat(200), scheduled_publish_at: null, published_at: null, created_at: ilYa(3 * J), updated_at: ilYa(12 * H) },
  // Échec ancien (4 j) : hors des 48 h.
  { id: "p2", user_id: "u-marie", canal: "linkedin", status: "planned", publish_status: "failed", publish_error: "vieux", scheduled_publish_at: null, published_at: null, created_at: ilYa(6 * J), updated_at: ilYa(4 * J) },
  // Échec de l'admin : GARDÉ en daily (c'est sa vraie publication).
  { id: "p3", user_id: "u-admin", canal: "linkedin", status: "planned", publish_status: "failed", publish_error: null, scheduled_publish_at: null, published_at: null, created_at: ilYa(2 * J), updated_at: ilYa(5 * H) },
  // Échec du compte de test : exclu.
  { id: "p4", user_id: "u-test", canal: "instagram", status: "planned", publish_status: "failed", publish_error: "test", scheduled_publish_at: null, published_at: null, created_at: ilYa(2 * J), updated_at: ilYa(2 * H) },
  // Bloqué en « publishing » depuis 2 h ; un autre depuis 20 min (pas encore bloqué).
  { id: "p5", user_id: "u-jo", canal: "instagram", status: "planned", publish_status: "publishing", publish_error: null, scheduled_publish_at: ilYa(2 * H), published_at: null, created_at: ilYa(2 * J), updated_at: ilYa(2 * H) },
  { id: "p6", user_id: "u-jo", canal: "instagram", status: "planned", publish_status: "publishing", publish_error: null, scheduled_publish_at: ilYa(H / 3), published_at: null, created_at: ilYa(2 * J), updated_at: ilYa(H / 3) },
  // Programmé en retard d'1 h (> 45 min) ; un autre en retard de 30 min seulement.
  { id: "p7", user_id: "u-marie", canal: "linkedin", status: "planned", publish_status: "scheduled", publish_error: null, scheduled_publish_at: ilYa(H), published_at: null, created_at: ilYa(J), updated_at: ilYa(J) },
  { id: "p8", user_id: "u-jo", canal: "linkedin", status: "planned", publish_status: "scheduled", publish_error: null, scheduled_publish_at: ilYa(H / 2), published_at: null, created_at: ilYa(J), updated_at: ilYa(J) },
  // Publiés : il y a 20 h (dans les 24 h et dans la semaine), il y a 9 j (semaine d'avant).
  { id: "p9", user_id: "u-marie", canal: "instagram", status: "published", publish_status: "published", publish_error: null, scheduled_publish_at: ilYa(20 * H), published_at: ilYa(20 * H), created_at: ilYa(2 * J), updated_at: ilYa(20 * H) },
  { id: "p10", user_id: "u-jo", canal: "instagram", status: "published", publish_status: "published", publish_error: null, scheduled_publish_at: ilYa(9 * J), published_at: ilYa(9 * J), created_at: ilYa(10 * J), updated_at: ilYa(9 * J) },
  // Brouillon : écarté par le filtre `in.(failed,publishing,scheduled,published)` du daily.
  { id: "p11", user_id: "u-sam", canal: "instagram", status: "draft", publish_status: "draft", publish_error: null, scheduled_publish_at: null, published_at: null, created_at: ilYa(J), updated_at: ilYa(J) },
];

const CONNEXIONS = [
  { user_id: "u-marie", platform: "instagram", platform_account_name: "marie.photo", token_expires_at: ilYa(2 * J), updated_at: ilYa(60 * J) },
  { user_id: "u-jo", platform: "linkedin", platform_account_name: "jo-linkedin", token_expires_at: dansLe(3 * J), updated_at: ilYa(57 * J) },
  { user_id: "u-admin", platform: "linkedin", platform_account_name: "laetitia", token_expires_at: null, updated_at: ilYa(55 * J) },
  { user_id: "u-sam", platform: "linkedin", platform_account_name: "sam-jeune", token_expires_at: null, updated_at: ilYa(10 * J) },
  { user_id: "u-sam", platform: "instagram", platform_account_name: "sam.ok", token_expires_at: dansLe(30 * J), updated_at: ilYa(10 * J) },
  // Pinterest et Canva : ignorées même expirées (refresh_token).
  { user_id: "u-marie", platform: "pinterest", platform_account_name: "marie-pins", token_expires_at: ilYa(5 * J), updated_at: ilYa(40 * J) },
  { user_id: "u-jo", platform: "canva", platform_account_name: "jo-canva", token_expires_at: ilYa(5 * J), updated_at: ilYa(40 * J) },
  // Compte de test : exclu.
  { user_id: "u-test", platform: "instagram", platform_account_name: "camille.test", token_expires_at: ilYa(J), updated_at: ilYa(70 * J) },
];

const RETOURS_BETA = [
  { user_id: "u-jo", type: "bug", severity: "minor", content: "Petit décalage du bouton", details: null, page_url: "/creer", screenshot_url: null, status: "new", created_at: ilYa(2 * H) },
  { user_id: "u-marie", type: "bug", severity: "blocking", content: "Impossible de publier " + "y".repeat(250), details: "Détail " + "z".repeat(250), page_url: "/calendrier", screenshot_url: "https://capture", status: "new", created_at: ilYa(6 * H) },
  { user_id: "u-sam", type: "idea", severity: null, content: "Une idée", details: null, page_url: "/", screenshot_url: null, status: "seen", created_at: ilYa(3 * H) },
  // Compte de test : exclu des deux listes.
  { user_id: "u-test", type: "bug", severity: "blocking", content: "test", details: null, page_url: "/", screenshot_url: null, status: "new", created_at: ilYa(H) },
  // Ancien (3 j) encore « new » : seulement dans feedback_new_*.
  { user_id: "u-sam", type: "bug", severity: "annoying", content: "Vieux retour pas traité", details: null, page_url: "/branding", screenshot_url: null, status: "new", created_at: ilYa(3 * J) },
];

const ABONNEMENTS = [
  { stripe_subscription_id: "sub_ok", status: "active", plan: "premium", current_period_end: dansLe(20 * J), studio_months_paid: 2, updated_at: ilYa(10 * J) },
  { stripe_subscription_id: "sub_perime", status: "active", plan: "premium", current_period_end: ilYa(5 * J), studio_months_paid: 1, updated_at: ilYa(35 * J) },
  { stripe_subscription_id: "sub_vide", status: "active", plan: "binome", current_period_end: null, studio_months_paid: 0, updated_at: ilYa(3 * J) },
  { stripe_subscription_id: "sub_annule", status: "canceled", plan: "premium", current_period_end: ilYa(40 * J), studio_months_paid: 3, updated_at: ilYa(40 * J) },
  // Ligne manuelle (sans id Stripe) : pas de période, jamais comptée.
  { stripe_subscription_id: null, status: "active", plan: "binome", current_period_end: null, studio_months_paid: 0, updated_at: ilYa(50 * J) },
];

const WEBHOOKS = [
  { event_type: "invoice.paid", processed_at: ilYa(3 * H) },
  { event_type: "customer.subscription.updated", processed_at: ilYa(3 * J) },
  { event_type: "invoice.paid", processed_at: ilYa(10 * J) },
];

const unix = (ms: number) => Math.floor((T - ms) / 1000);
export const STRIPE_EVENTS = {
  data: [
    { id: "evt_1", type: "invoice.payment_failed", pending_webhooks: 2, created: unix(3 * H) },
    { id: "evt_2", type: "invoice.payment_failed", pending_webhooks: 1, created: unix(5 * H) },
    { id: "evt_3", type: "customer.subscription.updated", pending_webhooks: 1, created: unix(2 * J) },
    // Dans le délai de grâce (10 min) : pas encore un échec.
    { id: "evt_4", type: "invoice.paid", pending_webhooks: 1, created: unix(10 * 60000) },
    { id: "evt_5", type: "invoice.paid", pending_webhooks: 0, created: unix(6 * H) },
  ],
};
export const STRIPE_SUBS = {
  data: [
    { id: "sub_ok", created: unix(40 * J), metadata: { user_id: "u-marie" } },
    { id: "sub_orpheline", created: unix(2 * J), metadata: { user_id: "u-jo" } },
    // Abonnement Binôme vendu par lien de paiement : pas de metadata.user_id, jamais compté.
    { id: "sub_binome_lien", created: unix(20 * J), metadata: {} },
  ],
};

const ERREURS_JS = [
  { user_id: "u-marie", kind: "render", route: "/creer", asset: null, created_at: ilYa(2 * H) },
  { user_id: null, kind: "chunk", route: "/", asset: "index.js", created_at: ilYa(4 * H) },
  { user_id: "u-test", kind: "render", route: "/creer", asset: null, created_at: ilYa(H) },
];

const EMAILS_ENVOYES = [
  { user_id: "u-marie", to_email: "marie@client.fr", template_id: "t-bienvenue", status: "sent", error: null, sent_at: ilYa(5 * H) },
  { user_id: "u-jo", to_email: "jo@client.fr", template_id: "t-relance", status: "bounced", error: "boîte pleine", sent_at: ilYa(7 * H) },
  { user_id: "u-test", to_email: "laetitiatest@nowadaysagency.com", template_id: "t-relance", status: "failed", error: "test", sent_at: ilYa(H) },
];

const FILE_EMAILS = [
  { user_id: "u-sam", scheduled_at: ilYa(3 * H), sent: false, cancelled: false },
  { user_id: "u-test", scheduled_at: ilYa(4 * H), sent: false, cancelled: false },
  { user_id: "u-marie", scheduled_at: ilYa(3 * H), sent: true, cancelled: false },
  { user_id: "u-jo", scheduled_at: ilYa(20 * 60000), sent: false, cancelled: false },
];

const TEMPLATES = [
  { id: "t-bienvenue", name: "Bienvenue" },
  { id: "t-relance", name: "Relance J+3" },
];

const DEPENSES_HIGGSFIELD = [
  { source: "creer", estimated_usd: 0.33, status: "succeeded", created_at: ilYa(2 * J) },
  { source: "creer", estimated_usd: 0.33, status: "uncertain", created_at: ilYa(6 * J) },
  { source: "carrousel", estimated_usd: 0.2, status: "failed", created_at: ilYa(J) },
  // Mois précédent : hors du mois, mais dans les 7 j.
  { source: "creer", estimated_usd: 0.33, status: "succeeded", created_at: ilYa(8.5 * J) },
];
const REQUETES_STUDIO = [
  { estimated_usd: 0.4, status: "succeeded", created_at: ilYa(3 * J) },
];

const CRON_JOBS = [
  { jobname: "social-publish-scheduled", schedule: "*/5 * * * *", active: true, last_start: ilYa(3 * 60000), last_status: "succeeded", last_message: null },
  { jobname: "email-trigger", schedule: "*/10 * * * *", active: true, last_start: ilYa(3 * H), last_status: "failed", last_message: "permission denied" },
];

const VERSIONS_STUDIO = [
  { id: "v1", status: "processing", created_at: ilYa(2 * H) },
  { id: "v2", status: "processing", created_at: ilYa(10 * 60000) },
  { id: "v3", status: "done", created_at: ilYa(5 * H) },
];

// ── Scope weekly ───────────────────────────────────────────────────────────
const IA = [
  // Semaine en cours, clientes.
  { user_id: "u-marie", created_at: ilYa(J), action_type: "generate_carousel", model_used: "claude-sonnet-5", tokens_used: 120000 },
  { user_id: "u-marie", created_at: ilYa(2 * J), action_type: "studio_image", model_used: "gpt-image-2", tokens_used: 0 },
  { user_id: "u-marie", created_at: ilYa(2 * J), action_type: "studio_image", model_used: "gpt-image-2", tokens_used: 0 },
  { user_id: "u-jo", created_at: ilYa(3 * J), action_type: "generate_post", model_used: "modele-mystere", tokens_used: 5000 },
  { user_id: "u-jo", created_at: ilYa(3 * J), action_type: "generate_carousel", model_used: "composition-code", tokens_used: 0 },
  { user_id: "u-jo", created_at: ilYa(4 * J), action_type: null, model_used: null, tokens_used: 300 },
  { user_id: "u-sam", created_at: ilYa(5 * J), action_type: "audit_instagram", model_used: "google/gemini-2.5-flash", tokens_used: 40000 },
  { user_id: "u-sam", created_at: ilYa(5 * J), action_type: "studio_image", model_used: "higgsfield-ai/soul/v2/standard", tokens_used: 0 },
  // Tier Haiku depuis le 26/10/2026 (0,2 €/Mtok mélangé) : 30 000 tokens = 0,006 €.
  { user_id: "u-sam", created_at: ilYa(2 * J), action_type: "generate_post", model_used: "claude-haiku-5-5", tokens_used: 30000 },
  // Semaine précédente.
  { user_id: "u-marie", created_at: ilYa(9 * J), action_type: "generate_post", model_used: "claude-haiku-4-5", tokens_used: 30000 },
  { user_id: "u-jo", created_at: ilYa(10 * J), action_type: "generate_carousel", model_used: "claude-fable-5-1", tokens_used: 50000 },
  // Comptes internes (hors totaux, comptés à part) : admin et recette.
  { user_id: "u-admin", created_at: ilYa(J), action_type: "generate_carousel", model_used: "claude-opus-5-5", tokens_used: 200000 },
  { user_id: "u-recette", created_at: ilYa(J), action_type: "generate_carousel", model_used: "gpt-6-astra", tokens_used: 10000 },
  { user_id: "u-test", created_at: ilYa(2 * J), action_type: "studio_image", model_used: "marketing-studio/image/flare", tokens_used: 0 },
];

const MEMBRES_ESPACES = [
  { user_id: "u-marie", workspace_id: "w1", joined_at: ilYa(4 * J), role: "owner" },
  { user_id: "u-marie", workspace_id: "w2", joined_at: ilYa(2 * J), role: "owner" },
  { user_id: "u-admin", workspace_id: "w3", joined_at: ilYa(200 * J), role: "owner" },
  { user_id: "u-admin", workspace_id: "w4", joined_at: ilYa(100 * J), role: "owner" },
  { user_id: "u-jo", workspace_id: "w5", joined_at: ilYa(19 * J), role: "owner" },
  { user_id: "u-jo", workspace_id: "w1", joined_at: ilYa(3 * J), role: "member" },
];

const CARROUSELS = [
  // Retravaillé (réédité 30 min après) et mis au calendrier, post publié (p9).
  { user_id: "u-marie", carousel_type: "tips", subject: "Trois erreurs de lumière", hook_text: "Ta lumière te trahit", caption: "Légende", slides: [{ title: "1" }], slide_count: 7, quality_score: 82, calendar_post_id: "p9", status: "draft", created_at: ilYa(2 * J), updated_at: ilYa(2 * J - 30 * 60000) },
  // Même sujet regénéré, score bas, au calendrier mais pas publié.
  { user_id: "u-marie", carousel_type: "tips", subject: "  trois erreurs de LUMIÈRE ", hook_text: "Encore la lumière", caption: null, slides: [], slide_count: 5, quality_score: 55, calendar_post_id: "p7", status: "draft", created_at: ilYa(J), updated_at: ilYa(J) },
  { user_id: "u-jo", carousel_type: "story", subject: "Mon parcours", hook_text: "Il y a 3 ans", caption: "Légende", slides: [], slide_count: 8, quality_score: null, calendar_post_id: null, status: "draft", created_at: ilYa(3 * J), updated_at: ilYa(3 * J) },
  // Semaine précédente.
  { user_id: "u-jo", carousel_type: "story", subject: "Avant", hook_text: "Avant", caption: null, slides: [], slide_count: 6, quality_score: 70, calendar_post_id: null, status: "draft", created_at: ilYa(9 * J), updated_at: ilYa(9 * J) },
  // Compte interne : exclu.
  { user_id: "u-admin", carousel_type: "tips", subject: "Recette", hook_text: "x", caption: null, slides: [], slide_count: 5, quality_score: 40, calendar_post_id: null, status: "draft", created_at: ilYa(J), updated_at: ilYa(J) },
];

const EVENEMENTS_QUALITE = [
  {
    user_id: "u-marie", format: "carousel", redac_score: 78, redac_repassed: false, created_at: ilYa(2 * J),
    content_preview: {
      hook: "Ta lumière te trahit", subject: "Trois erreurs de lumière",
      editorial_usage: { model: "claude-opus-5-5-20261001", input_tokens: 12000, output_tokens: 3000, status: "applied", guard: ["lost-number:12 %", "new-unsupported-number:3", "hook-drift"] },
    },
  },
  {
    user_id: "u-jo", format: "carousel", redac_score: 52, redac_repassed: true, created_at: ilYa(3 * J),
    content_preview: {
      hook: "Il y a 3 ans", subject: "Mon parcours",
      editorial_usage: { model: "relecteur-inconnu", input_tokens: 5000, output_tokens: 1000, status: "rejected", guard: ["lost-number:5"] },
    },
  },
  { user_id: "u-sam", format: "post_linkedin", redac_score: null, redac_repassed: false, created_at: ilYa(4 * J), content_preview: null },
  // Semaine précédente.
  {
    user_id: "u-marie", format: "carousel", redac_score: 61, redac_repassed: false, created_at: ilYa(9 * J),
    content_preview: { editorial_usage: { model: "gpt-6-astra", input_tokens: 8000, output_tokens: 4000, status: "applied" } },
  },
  // Compte interne : relecture comptée à part.
  {
    user_id: "u-admin", format: "carousel", redac_score: 90, redac_repassed: false, created_at: ilYa(J),
    content_preview: { hook: "Recette", editorial_usage: { model: "claude-opus-5-5", input_tokens: 20000, output_tokens: 6000, status: "applied" } },
  },
  // Plan des carrousels : mis à part (ni score ni contenu).
  { user_id: "u-marie", format: "carousel_plan", redac_score: null, redac_repassed: false, created_at: ilYa(2 * J), content_preview: { plan_ms: 42000 } },
  { user_id: "u-recette", format: "carousel_plan", redac_score: null, redac_repassed: false, created_at: ilYa(J), content_preview: { plan_ms: 180000 } },
];

// Appels comptés sans crédit (audit de coût du 20/10/2026) : visite du matin sur
// le compte de recette (dont une ligne de plus de 24 h), inscription, passerelle
// Lovable publique (sans compte), et la semaine précédente.
const HORS_CREDIT = [
  { user_id: "u-test", created_at: ilYa(2 * H), source: "compte_test", action_type: "generate_carousel", model_used: "claude-opus-5-5", tokens_used: 90000 },
  { user_id: "u-test", created_at: ilYa(3 * H), source: "compte_test", action_type: "creative_flow_post", model_used: "claude-sonnet-5", tokens_used: 20000 },
  { user_id: "u-test", created_at: ilYa(30 * H), source: "compte_test", action_type: "generate_carousel", model_used: "claude-opus-5-5", tokens_used: 80000 },
  { user_id: "u-marie", created_at: ilYa(2 * J), source: "inscription", action_type: "deep_diagnostic", model_used: "claude-sonnet-5", tokens_used: 15000 },
  { user_id: null, created_at: ilYa(3 * J), source: "passerelle_lovable", action_type: "mini_audit_instagram", model_used: "google/gemini-2.5-flash", tokens_used: 8000 },
  { user_id: "u-test", created_at: ilYa(9 * J), source: "compte_test", action_type: "generate_carousel", model_used: "claude-opus-5-5", tokens_used: 85000 },
];

/** La base complète, pour les deux scopes. Chaque test peut remplacer une table. */
export function mondeComplet(): FauxMonde {
  return {
    tables: {
      profiles: PROFILS,
      calendar_posts: POSTS,
      social_connections: CONNEXIONS,
      beta_feedback: RETOURS_BETA,
      subscriptions: ABONNEMENTS,
      webhook_events: WEBHOOKS,
      client_error_events: ERREURS_JS,
      email_sends: EMAILS_ENVOYES,
      email_queue: FILE_EMAILS,
      email_templates: TEMPLATES,
      higgsfield_image_spend: DEPENSES_HIGGSFIELD,
      studio_image_requests: REQUETES_STUDIO,
      visual_studio_versions: VERSIONS_STUDIO,
      ai_usage: IA,
      workspace_members: MEMBRES_ESPACES,
      generated_carousels: CARROUSELS,
      content_quality_events: EVENEMENTS_QUALITE,
      ai_usage_hors_credit: HORS_CREDIT,
    },
    cronJobs: CRON_JOBS,
    photoroom: { status: 200, body: { credits: { available: 790, subscription: 1000 } } },
    stripeEvents: { status: 200, body: STRIPE_EVENTS },
    stripeSubscriptions: { status: 200, body: STRIPE_SUBS },
  };
}
