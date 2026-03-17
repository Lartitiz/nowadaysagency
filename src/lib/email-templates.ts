// ── Email Templates — Nowadays Agency ──
// Each function returns an HTML string ready for Resend.
// Variables use {{placeholder}} syntax for server-side replacement.

interface TemplateVars {
  prenom?: string;
  activite?: string;
  app_url?: string;
}

// ── Shared layout ──

function wrap(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
</head>
<body style="margin:0;padding:0;background-color:#FFF4F8;font-family:Arial,'Helvetica Neue',Helvetica,sans-serif;-webkit-font-smoothing:antialiased;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#FFF4F8;">
<tr><td align="center" style="padding:40px 16px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#FFFFFF;border-radius:12px;overflow:hidden;">

<!-- Header -->
<tr><td style="padding:32px 40px 16px;text-align:center;">
<h1 style="margin:0;font-family:Georgia,'Libre Baskerville','Times New Roman',serif;font-size:28px;font-weight:400;color:#91014b;letter-spacing:0.5px;">Nowadays</h1>
</td></tr>
<tr><td style="padding:0 40px;">
<div style="height:2px;background-color:#FB3D80;border-radius:1px;"></div>
</td></tr>

<!-- Body -->
<tr><td style="padding:28px 40px 36px;">
${body}
</td></tr>

<!-- Footer -->
<tr><td style="padding:24px 40px;background-color:#FFF4F8;border-top:1px solid #f0e0e8;">
<p style="margin:0 0 8px;font-size:12px;color:#999;text-align:center;line-height:1.5;">
Tu reçois cet email car tu es inscrite sur <a href="{{app_url}}" style="color:#FB3D80;text-decoration:none;">L'Assistant Com'</a>.
</p>
<p style="margin:0;font-size:11px;color:#bbb;text-align:center;line-height:1.5;">
Nowadays Agency · Joigny, France<br>
<a href="{{app_url}}/unsubscribe" style="color:#bbb;text-decoration:underline;">Se désinscrire</a>
</p>
</td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

function cta(label: string, url: string): string {
  return `<div style="text-align:center;margin:28px 0 8px;">
<a href="${url}" style="display:inline-block;background-color:#FB3D80;color:#ffffff;font-size:15px;font-weight:bold;text-decoration:none;padding:12px 32px;border-radius:25px;mso-padding-alt:12px 32px;">${label}</a>
</div>`;
}

function p(text: string): string {
  return `<p style="margin:0 0 16px;font-size:16px;color:#1A1A1A;line-height:1.6;">${text}</p>`;
}

function greeting(prenom: string = "{{prenom}}"): string {
  return p(`Hey ${prenom} 👋`);
}

// ── 1. Bienvenue ──

export function welcomeEmail(vars?: TemplateVars): string {
  const prenom = vars?.prenom || "{{prenom}}";
  const app_url = vars?.app_url || "{{app_url}}";

  return wrap("Bienvenue dans L'Assistant Com' !", `
${greeting(prenom)}
${p(`Bienvenue dans <strong>L'Assistant Com'</strong> ! Tu as bien fait de te lancer — c'est le premier pas pour structurer ta communication sans y passer tes nuits.`)}
${p(`Ton espace est prêt. Voici ce que tu peux faire dès maintenant :`)}
<ul style="margin:0 0 16px;padding-left:20px;font-size:15px;color:#1A1A1A;line-height:1.8;">
<li>🔍 <strong>Auditer ton profil Instagram</strong> pour savoir où tu en es vraiment</li>
<li>✍️ <strong>Définir ta proposition de valeur</strong> — ce qui te différencie</li>
<li>📝 <strong>Générer ton premier contenu</strong> avec l'IA</li>
</ul>
${p(`Tu as <strong>30 crédits IA gratuits</strong> pour explorer. Pas de piège, pas d'engagement.`)}
${cta("Découvrir mon espace", `${app_url}/dashboard`)}
${p(`À très vite,<br><span style="color:#91014b;font-family:Georgia,'Libre Baskerville',serif;">Laetitia</span>`)}
  `);
}

// ── 2. Tips J+3 ──

export function tipsDay3Email(vars?: TemplateVars): string {
  const prenom = vars?.prenom || "{{prenom}}";
  const app_url = vars?.app_url || "{{app_url}}";

  return wrap("Le secret des comptes qui percent", `
${greeting(prenom)}
${p(`Ça fait 3 jours que tu es sur L'Assistant Com'. Et si je te disais que la différence entre un compte qui stagne et un compte qui décolle, c'est rarement l'algorithme ?`)}
${p(`C'est la <strong>clarté de ton positionnement</strong>.`)}
${p(`Quand quelqu'un tombe sur ton profil, il doit comprendre en 3 secondes :`)}
<ol style="margin:0 0 16px;padding-left:20px;font-size:15px;color:#1A1A1A;line-height:1.8;">
<li>Ce que tu fais</li>
<li>Pour qui tu le fais</li>
<li>Pourquoi toi et pas une autre</li>
</ol>
${p(`Mon conseil du jour : va relire ta bio Instagram. Est-ce qu'elle coche ces 3 cases ? (Spoiler : pour 80% des entrepreneures, la réponse est non. Et c'est pas grave — c'est pour ça qu'on est là.)`)}
${cta("Travailler mon branding", `${app_url}/branding`)}
${p(`Bonne exploration,<br><span style="color:#91014b;font-family:Georgia,'Libre Baskerville',serif;">Laetitia</span>`)}
  `);
}

// ── 3. Crédits épuisés ──

export function creditsExhaustedEmail(vars?: TemplateVars): string {
  const prenom = vars?.prenom || "{{prenom}}";
  const app_url = vars?.app_url || "{{app_url}}";

  return wrap("Tes 30 crédits IA sont utilisés !", `
${greeting(prenom)}
${p(`Tes 30 crédits gratuits sont épuisés — et franchement, bravo. Ça veut dire que tu as testé, exploré, et commencé à poser les bases de ta com'. C'est déjà beaucoup. 💪`)}
${p(`Si tu veux continuer à utiliser l'IA pour tes audits, tes contenus et ta stratégie, tu peux passer au plan <strong>Assistant Com'</strong> :`)}
<ul style="margin:0 0 16px;padding-left:20px;font-size:15px;color:#1A1A1A;line-height:1.8;">
<li>📊 <strong>300 crédits IA / mois</strong> — audits, génération, coaching</li>
<li>📅 <strong>Calendrier éditorial</strong> avec génération de contenu</li>
<li>🎯 <strong>CRM de prospection</strong> pour transformer tes abonné·es en client·es</li>
</ul>
${p(`Pas de pression. Si tu veux d'abord appliquer ce que tu as déjà généré, c'est très bien aussi. Ton espace reste accessible.`)}
${cta("Voir les plans", `${app_url}/abonnement`)}
${p(`À bientôt,<br><span style="color:#91014b;font-family:Georgia,'Libre Baskerville',serif;">Laetitia</span>`)}
  `);
}

// ── 4. Inactive 7 jours ──

export function inactive7dEmail(vars?: TemplateVars): string {
  const prenom = vars?.prenom || "{{prenom}}";
  const app_url = vars?.app_url || "{{app_url}}";

  return wrap("Ta com' t'attend", `
${greeting(prenom)}
${p(`Ça fait une semaine qu'on ne t'a pas vue. Ta communication, elle, n'a pas bougé non plus. (Mais elle est pas rancunière, promis.)`)}
${p(`Je sais comment c'est : on a mille trucs à gérer, et la com' passe toujours en dernier. Mais justement — <strong>10 minutes suffisent</strong> pour avancer.`)}
${p(`Voici une action simple que tu peux faire maintenant :`)}
<div style="background-color:#FFF4F8;border-left:4px solid #FB3D80;padding:16px 20px;border-radius:0 8px 8px 0;margin:0 0 16px;">
<p style="margin:0;font-size:15px;color:#1A1A1A;line-height:1.5;">
<strong>🎯 Mini-défi :</strong> Ouvre ton espace, lance un audit de ton profil Instagram. En 2 minutes, tu sauras exactement quoi améliorer en priorité.
</p>
</div>
${cta("Relancer mon audit", `${app_url}/instagram/audit`)}
${p(`On est là si tu as besoin,<br><span style="color:#91014b;font-family:Georgia,'Libre Baskerville',serif;">Laetitia</span>`)}
  `);
}

// ── 5. Teaser Premium ──

export function teaserPremiumEmail(vars?: TemplateVars): string {
  const prenom = vars?.prenom || "{{prenom}}";
  const app_url = vars?.app_url || "{{app_url}}";

  return wrap("Et si ta com' devenait un jeu ?", `
${greeting(prenom)}
${p(`Ça fait 2 semaines que tu utilises L'Assistant Com'. Tu as posé les bases — positionnement, bio, premiers contenus. C'est déjà énorme.`)}
${p(`Mais imagine si tu pouvais aller plus loin, <strong>sans y passer plus de temps</strong> :`)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
<tr><td style="padding:12px 16px;border-bottom:1px solid #f5e8ee;">
<span style="font-size:15px;color:#1A1A1A;">📊 <strong>300 crédits IA / mois</strong></span>
<span style="font-size:13px;color:#999;display:block;margin-top:2px;">Audits, contenus, coaching — sans compter</span>
</td></tr>
<tr><td style="padding:12px 16px;border-bottom:1px solid #f5e8ee;">
<span style="font-size:15px;color:#1A1A1A;">📅 <strong>Calendrier éditorial intelligent</strong></span>
<span style="font-size:13px;color:#999;display:block;margin-top:2px;">Plus jamais "je sais pas quoi poster"</span>
</td></tr>
<tr><td style="padding:12px 16px;border-bottom:1px solid #f5e8ee;">
<span style="font-size:15px;color:#1A1A1A;">🤝 <strong>CRM de prospection</strong></span>
<span style="font-size:13px;color:#999;display:block;margin-top:2px;">Transforme tes abonné·es en client·es</span>
</td></tr>
<tr><td style="padding:12px 16px;">
<span style="font-size:15px;color:#1A1A1A;">💬 <strong>Communauté privée</strong></span>
<span style="font-size:13px;color:#999;display:block;margin-top:2px;">Des entrepreneures qui avancent ensemble</span>
</td></tr>
</table>
${p(`Le plan <strong>Assistant Com'</strong> démarre à 29€/mois. Sans engagement. Et tu peux annuler quand tu veux.`)}
${cta("Découvrir les plans", `${app_url}/abonnement`)}
${p(`À très vite,<br><span style="color:#91014b;font-family:Georgia,'Libre Baskerville',serif;">Laetitia</span>`)}
  `);
}

// ── Export map for programmatic access ──

export const EMAIL_TEMPLATES = {
  welcome: { fn: welcomeEmail, subject: "Bienvenue dans L'Assistant Com' !" },
  tips_day3: { fn: tipsDay3Email, subject: "Le secret des comptes qui percent (indice : c'est pas l'algorithme)" },
  credits_exhausted: { fn: creditsExhaustedEmail, subject: "Tes 10 crédits IA sont utilisés !" },
  inactive_7d: { fn: inactive7dEmail, subject: "Ta com' t'attend (et elle est pas rancunière)" },
  teaser_premium: { fn: teaserPremiumEmail, subject: "Et si ta com' devenait un jeu ?" },
} as const;
