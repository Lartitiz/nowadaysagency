/**
 * Pre-generated demo flow for Auriana (marchande de biens).
 * Used to bypass AI generation and show a complete carousel demo instantly.
 */

export const AURIANA_DEMO_EMAILS = ["auriana.demo@nowadaysagency.com"];

export function isAurianaDemoEmail(email: string | null | undefined): boolean {
  return !!email && AURIANA_DEMO_EMAILS.includes(email.toLowerCase().trim());
}

export const AURIANA_DEMO_SUBJECT = "La pré-commercialisation en MDB : je vends avant d'acheter";

export const AURIANA_DEMO_FLOW = {
  step: "idea" as const,
  ideaText: AURIANA_DEMO_SUBJECT,
  demoScenario: "auriana-carousel" as const,
  objective: "visibilite",
  selectedFormat: "carousel",
  carouselSubMode: "text" as const,
  editorialAngle: "decryptage",
  questions: [
    { id: "q_0", question: "Quel moment précis t'a fait comprendre que pré-commercialiser changeait tout ?", placeholder: "Un deal, une situation, un déclic..." },
    { id: "q_1", question: "Quelle objection entends-tu le plus quand tu parles de cette approche ?", placeholder: "Ex : 'C'est trop risqué', 'Ça ne marche pas partout'..." },
    { id: "q_2", question: "Quel résultat concret as-tu obtenu grâce à la pré-commercialisation ?", placeholder: "Un chiffre, un projet, un gain de temps..." },
  ],
  answers: {
    q_0: "Sur mon 3e projet, j'avais signé 80% des lots avant même d'avoir l'acte. C'est là que j'ai compris : on ne vend pas un bien, on vend une vision du quartier.",
    q_1: "\"T'as pas peur de vendre un truc qui n'existe pas encore ?\" — alors que c'est exactement le contraire : tu sécurises ton opération AVANT de t'engager.",
    q_2: "Sur une découpe de 5 lots à Bordeaux, j'ai pré-vendu 4 lots en 3 semaines. Résultat : financement bouclé avant la signature, marge sécurisée dès le départ.",
  },
  result: {
    type: "carousel",
    format: "carousel",
    slides: [
      {
        slide_number: 1,
        title: "Je vends avant d'acheter.\nEt c'est pour ça que mes opérations sont rentables.",
        body: "",
        role: "hook",
        visual_suggestion: "Texte bold centré, fond sombre avec texture béton subtile"
      },
      {
        slide_number: 2,
        title: "",
        body: "La plupart des marchands de biens achètent d'abord.\nPuis cherchent des acquéreurs.\nPuis croisent les doigts.\n\nMoi j'ai inversé le process.",
        role: "context",
        visual_suggestion: "Texte aéré, fond clair, icône flèche inversée"
      },
      {
        slide_number: 3,
        title: "La pré-commercialisation, c'est simple :",
        body: "→ Tu identifies le bien\n→ Tu crées une offre (plans, prix, vision)\n→ Tu signes des réservations AVANT l'acte\n→ Tu achètes avec la certitude de revendre",
        role: "explication",
        visual_suggestion: "Liste à puces, flèches directionnelles, fond structuré"
      },
      {
        slide_number: 4,
        title: "80% des lots signés avant l'acte",
        body: "Sur mon 3e projet, j'avais signé 80% des lots avant même d'avoir l'acte.\n\nFinancement bouclé.\nMarge sécurisée.\nStress : zéro.",
        role: "preuve",
        visual_suggestion: "Chiffres en gros, fond accent, mise en avant du 80%"
      },
      {
        slide_number: 5,
        title: "\"T'as pas peur de vendre un truc qui n'existe pas ?\"",
        body: "Non. Parce que je ne vends pas un bien.\nJe vends une vision du quartier, un plan, un projet.\n\nEt c'est exactement ça qui rassure les acquéreurs.",
        role: "objection",
        visual_suggestion: "Citation en italique + réponse en gras, fond contrasté"
      },
      {
        slide_number: 6,
        title: "Résultats concrets",
        body: "Sur une découpe de 5 lots à Bordeaux :\n• 4 lots pré-vendus en 3 semaines\n• Financement bouclé avant signature\n• Marge sécurisée dès le départ\n\nPas de suspense. Du process.",
        role: "résultat",
        visual_suggestion: "Résultats chiffrés, style dashboard, fond sombre"
      },
      {
        slide_number: 7,
        title: "Un mindset, pas une astuce",
        body: "1. Valider la demande avant l'offre\n2. Sécuriser le financement par les réservations\n3. Réduire le risque à chaque étape\n\nC'est comme ça qu'on passe de \"j'espère\" à \"je sais\".",
        role: "synthèse",
        visual_suggestion: "Liste numérotée, fond clair, progression visuelle"
      },
      {
        slide_number: 8,
        title: "Envie de structurer ta prochaine opération ?",
        body: "📩 Envoie-moi \"PRÉ-CO\" en DM.\nJe t'explique comment j'applique ça concrètement.",
        role: "cta",
        visual_suggestion: "CTA clair, bouton DM, fond accent avec logo"
      },
    ],
    hashtags: ["#marchanddebiens #immobilier #precommercialisation #investissementimmobilier #mdb #strategieimmo"],
    caption: "La pré-commercialisation, c'est le game changer que personne ne t'explique en formation. 👇",
    accroche: "Je vends avant d'acheter. Et c'est pour ça que mes opérations sont rentables.",
  },
  savedId: null,
  visualSlides: [] as { slide_number: number; html: string }[],
  editContent: "",
  ts: Date.now(),
};

/**
 * Pre-built HTML visual slides for demo — avoids calling carousel-visual edge function.
 */
function demoSlideHtml(slideNum: number, title: string, body: string, bgColor: string, accent: string): string {
  const bodyHtml = body.replace(/\n/g, "<br/>");
  return `<div style="width:1080px;height:1350px;display:flex;flex-direction:column;justify-content:center;align-items:center;padding:80px;background:${bgColor};font-family:'Inter',sans-serif;box-sizing:border-box;text-align:center;">
    ${title ? `<div style="font-size:52px;font-weight:800;color:${accent};line-height:1.2;margin-bottom:40px;">${title}</div>` : ""}
    ${body ? `<div style="font-size:32px;font-weight:400;color:#2d2d2d;line-height:1.6;">${bodyHtml}</div>` : ""}
    <div style="position:absolute;bottom:50px;right:60px;font-size:20px;color:#aaa;font-weight:600;">@auriana.mdb</div>
  </div>`;
}

const HANDLE = `<div style="position:absolute;bottom:40px;right:50px;font-size:18px;font-family:'IBM Plex Mono',monospace;color:#1B3A4B88;letter-spacing:1px;">@auriana.mdb</div>`;
const BADGE = (text: string, bg = "#1B3A4B") => `<div style="display:inline-block;background:${bg};color:#fff;font-family:'IBM Plex Mono',monospace;font-size:14px;text-transform:uppercase;letter-spacing:2px;padding:8px 22px;border-radius:100px;margin-bottom:28px;">${text}</div>`;
const CARD = (content: string, extra = "") => `<div style="background:#fff;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,0.06);padding:56px 52px;max-width:920px;width:100%;${extra}">${content}</div>`;
const WRAP = (bg: string, content: string) => `<div style="width:1080px;height:1350px;display:flex;flex-direction:column;justify-content:center;align-items:center;padding:60px 80px;background:${bg};font-family:'Libre Baskerville',Georgia,serif;box-sizing:border-box;position:relative;">${content}${HANDLE}</div>`;

export function getAurianaDemoVisualSlides(): { slide_number: number; html: string }[] {
  return [
    // Slide 1 — HOOK
    { slide_number: 1, html: WRAP("#F5F3EF", `
      ${BADGE("HOOK")}
      ${CARD(`
        <div style="font-size:52px;font-weight:400;color:#1B3A4B;line-height:1.25;text-align:center;">Je vends avant d'acheter.<br/><span style="font-style:italic;color:#91014b;">Et c'est pour ça que mes opérations sont rentables.</span></div>
      `)}
    `) },

    // Slide 2 — CONTEXTE
    { slide_number: 2, html: WRAP("#ffffff", `
      <div style="border:2px dashed #1B3A4B40;border-radius:16px;padding:52px 48px;max-width:920px;width:100%;">
        <div style="font-size:40px;font-weight:400;color:#1B3A4B;line-height:1.3;margin-bottom:32px;text-align:center;font-family:'Libre Baskerville',Georgia,serif;">Le problème ?</div>
        <div style="font-size:28px;color:#2C2C2C;line-height:1.7;font-family:'IBM Plex Mono',monospace;text-align:left;">
          La plupart des marchands de biens achètent d'abord.<br/>Puis cherchent des acquéreurs.<br/>Puis croisent les doigts.<br/><br/><span style="color:#91014b;font-weight:600;">Moi j'ai inversé le process.</span>
        </div>
      </div>
    `) },

    // Slide 3 — EXPLICATION
    { slide_number: 3, html: WRAP("#ffffff", `
      ${BADGE("MÉTHODE")}
      <div style="border-left:4px solid #D4A843;padding:40px 48px;max-width:880px;width:100%;background:#FAFAFA;border-radius:0 16px 16px 0;">
        <div style="font-size:36px;font-weight:400;color:#1B3A4B;margin-bottom:28px;font-family:'Libre Baskerville',Georgia,serif;">La pré-commercialisation, c'est simple :</div>
        <div style="font-size:26px;color:#2C2C2C;line-height:2;font-family:'IBM Plex Mono',monospace;">
          → Tu identifies le bien<br/>→ Tu crées une offre (plans, prix, vision)<br/>→ Tu signes des réservations AVANT l'acte<br/>→ Tu achètes avec la certitude de revendre
        </div>
      </div>
    `) },

    // Slide 4 — PREUVE (dark)
    { slide_number: 4, html: `<div style="width:1080px;height:1350px;display:flex;flex-direction:column;justify-content:center;align-items:center;padding:60px 80px;background:#1A1A1A;font-family:'Libre Baskerville',Georgia,serif;box-sizing:border-box;position:relative;">
      ${BADGE("PREUVE", "#D4A843")}
      <div style="font-size:120px;font-weight:700;color:#D4A843;font-family:'IBM Plex Mono',monospace;margin-bottom:24px;">80%</div>
      <div style="font-size:32px;color:#D4A843;margin-bottom:40px;font-family:'Libre Baskerville',Georgia,serif;">des lots signés avant l'acte</div>
      <div style="font-size:24px;color:#ffffff99;line-height:1.8;max-width:800px;text-align:center;font-family:'IBM Plex Mono',monospace;">
        Sur mon 3e projet, j'avais signé 80% des lots avant même d'avoir l'acte.<br/><br/>Financement bouclé. Marge sécurisée. Stress : zéro.
      </div>
      <div style="position:absolute;bottom:40px;right:50px;font-size:18px;font-family:'IBM Plex Mono',monospace;color:#ffffff44;letter-spacing:1px;">@auriana.mdb</div>
    </div>` },

    // Slide 5 — OBJECTION
    { slide_number: 5, html: WRAP("#F5F3EF", `
      <div style="border:2px dashed #1B3A4B30;border-radius:16px;padding:36px 40px;max-width:880px;width:100%;margin-bottom:32px;">
        <div style="font-size:30px;font-style:italic;color:#1B3A4B;line-height:1.5;text-align:center;font-family:'Libre Baskerville',Georgia,serif;">
          "T'as pas peur de vendre un truc qui n'existe pas encore ?"
        </div>
      </div>
      ${CARD(`
        <div style="border-left:4px solid #C0392B;padding-left:28px;">
          <div style="font-size:26px;color:#2C2C2C;line-height:1.7;font-family:'IBM Plex Mono',monospace;">
            Non. Parce que je ne vends pas un bien.<br/>Je vends une vision du quartier, un plan, un projet.<br/><br/><span style="color:#91014b;font-weight:600;">Et c'est exactement ça qui rassure les acquéreurs.</span>
          </div>
        </div>
      `)}
    `) },

    // Slide 6 — RÉSULTATS
    { slide_number: 6, html: WRAP("#ffffff", `
      ${BADGE("RÉSULTATS")}
      ${CARD(`
        <div style="text-align:center;margin-bottom:28px;">
          <div style="font-size:20px;color:#1B3A4B88;font-family:'IBM Plex Mono',monospace;margin-bottom:12px;">Découpe de 5 lots — Bordeaux</div>
        </div>
        <div style="display:flex;justify-content:space-around;margin-bottom:36px;">
          <div style="text-align:center;"><div style="font-size:56px;font-weight:700;color:#1B3A4B;font-family:'IBM Plex Mono',monospace;">4</div><div style="font-size:16px;color:#2C2C2C;font-family:'IBM Plex Mono',monospace;">lots pré-vendus</div></div>
          <div style="text-align:center;"><div style="font-size:56px;font-weight:700;color:#1B3A4B;font-family:'IBM Plex Mono',monospace;">3</div><div style="font-size:16px;color:#2C2C2C;font-family:'IBM Plex Mono',monospace;">semaines</div></div>
        </div>
        <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;">
          ${BADGE("Financement bouclé", "#1B3A4B")}
          ${BADGE("Marge sécurisée", "#D4A843")}
        </div>
        <div style="text-align:center;margin-top:24px;font-size:22px;color:#91014b;font-family:'Libre Baskerville',Georgia,serif;font-style:italic;">Pas de suspense. Du process.</div>
      `)}
    `) },

    // Slide 7 — SYNTHÈSE
    { slide_number: 7, html: WRAP("#ffffff", `
      <div style="border-left:4px solid #D4A843;padding:40px 48px;max-width:880px;width:100%;background:#FAFAFA;border-radius:0 16px 16px 0;">
        <div style="font-size:36px;font-weight:400;color:#1B3A4B;margin-bottom:36px;font-family:'Libre Baskerville',Georgia,serif;">Un mindset, pas une astuce</div>
        <div style="font-size:26px;color:#2C2C2C;line-height:2.2;font-family:'IBM Plex Mono',monospace;">
          <div style="display:flex;align-items:center;gap:16px;margin-bottom:12px;"><div style="width:40px;height:40px;border-radius:50%;background:#1B3A4B;color:#fff;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;">1</div> Valider la demande avant l'offre</div>
          <div style="display:flex;align-items:center;gap:16px;margin-bottom:12px;"><div style="width:40px;height:40px;border-radius:50%;background:#1B3A4B;color:#fff;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;">2</div> Sécuriser le financement par les réservations</div>
          <div style="display:flex;align-items:center;gap:16px;margin-bottom:12px;"><div style="width:40px;height:40px;border-radius:50%;background:#1B3A4B;color:#fff;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;">3</div> Réduire le risque à chaque étape</div>
        </div>
        <div style="font-size:24px;color:#91014b;font-style:italic;margin-top:20px;font-family:'Libre Baskerville',Georgia,serif;">C'est comme ça qu'on passe de "j'espère" à "je sais".</div>
      </div>
    `) },

    // Slide 8 — CTA
    { slide_number: 8, html: WRAP("#F5F3EF", `
      ${CARD(`
        <div style="text-align:center;">
          <div style="font-size:40px;font-weight:400;color:#1B3A4B;line-height:1.3;margin-bottom:32px;font-family:'Libre Baskerville',Georgia,serif;">Envie de structurer ta prochaine opération ?</div>
          <div style="font-size:28px;color:#2C2C2C;line-height:1.7;margin-bottom:36px;font-family:'IBM Plex Mono',monospace;">📩 Envoie-moi <span style="color:#91014b;font-weight:600;">"PRÉ-CO"</span> en DM.<br/>Je t'explique comment j'applique ça concrètement.</div>
          ${BADGE("LIEN EN BIO", "#91014b")}
        </div>
      `)}
    `) },
  ];
}
