export const MESSAGES = {
  errors: {
    generic: {
      title: "Oups, quelque chose a coincé",
      body: "Réessaie dans quelques secondes. Si ça persiste, écris-nous 💌",
    },
    network: {
      title: "Connexion perdue",
      body: "On dirait que le wifi fait des siennes. Vérifie ta connexion et réessaie.",
    },
    save_failed: {
      title: "Pas réussi à sauvegarder",
      body: "Tes modifications sont encore là, réessaie.",
    },
    auth_expired: {
      title: "Session expirée",
      body: "Ça fait un moment ! Reconnecte-toi pour continuer.",
    },
    file_too_large: {
      title: "Fichier trop lourd",
      body: "Max 5 Mo par fichier. Essaie de le compresser un peu.",
    },
    file_wrong_format: {
      title: "Format pas supporté",
      body: "On accepte les PDF, Word, PNG et JPG.",
    },
    ai_failed: {
      title: "L'IA a eu un blanc",
      body: "Ça arrive même aux meilleur·es. Relance la génération.",
    },
    ai_credits_empty: {
      title: "Tes crédits du mois sont utilisés",
      body: "Bonne nouvelle : ça veut dire que tu avances. Ils reviennent le 1er du mois. Et si tu veux continuer maintenant, tu peux ajouter un petit pack sans engagement.",
    },
    not_found: {
      title: "Page introuvable",
      body: "Cette page n'existe pas (ou plus). Retourne à l'accueil, on t'y attend.",
    },
  },

  success: {
    saved: "C'est noté !",
    published: "✅ Publié !",
    copied: "Copié dans le presse-papier 👍",
    deleted: "Supprimé.",
    code_activated: "🎉 Code activé !",
    profile_updated: "Profil mis à jour.",
    file_uploaded: "Fichier importé, nickel.",
    audit_launched: "Audit lancé, ça arrive...",
    branding_saved: "Branding sauvegardé ✨",
    post_scheduled: "Contenu planifié 📅",
    badge_unlocked: "Nouveau badge débloqué !",
  },

  loading: {
    generic: "Un instant...",
    ai_generating: "L'IA travaille pour toi...",
    audit_running: "Analyse en cours...",
    saving: "Sauvegarde...",
    uploading: "Import en cours...",
  },

  empty: {
    calendar: {
      icon: "📅",
      title: "Ton calendrier t'attend",
      body: "Planifie ton premier contenu : même un seul, c'est un début.",
      cta: "Planifier un contenu →",
    },
    posts: {
      icon: "✍️",
      title: "Aucun contenu encore",
      body: "C'est normal, tout commence ici. Crée ton premier post.",
      cta: "Créer un contenu →",
    },
    branding: {
      icon: "🎨",
      title: "Ton branding est à construire",
      body: "Positionnement, cible, ton : on pose les bases ensemble.",
      cta: "Commencer mon branding →",
    },
    offers: {
      icon: "💼",
      title: "Pas encore d'offres",
      body: "Définis tes offres pour que l'outil te crée du contenu adapté.",
      cta: "Ajouter une offre →",
    },
    badges: {
      icon: "🏅",
      title: "Tes badges arrivent bientôt",
      body: "Les badges arrivent au fil de ta pratique. Pas de course, pas de classement : juste toi qui avances.",
    },
    audit: {
      icon: "🔍",
      title: "Pas encore d'audit",
      body: "Ajoute ton Instagram ou ton site web pour lancer une analyse.",
      cta: "Lancer mon audit →",
    },
    storytelling: {
      icon: "📖",
      title: "Ton storytelling t'attend",
      body: "Raconte ton histoire pour connecter avec ta communauté. C'est ce qui fait la différence.",
      cta: "Créer mon storytelling →",
    },
    contacts: {
      icon: "👥",
      title: "Ton carnet est vide",
      body: "Ajoute tes premiers contacts ou prospects pour commencer à construire ta communauté.",
      cta: "Ajouter un contact →",
    },
    stats: {
      icon: "📊",
      title: "Pas encore de données",
      body: "Ajoute tes stats mensuelles pour suivre ta progression. Même si c'est petit, ça compte.",
      cta: "Ajouter mes stats →",
    },
    ideas: {
      icon: "💡",
      title: "Ta boîte à idées est vide",
      body: "Commence par générer des idées dans l'atelier. Elles atterriront ici automatiquement.",
      cta: "Aller à l'atelier →",
    },
    lives: {
      icon: "🎬",
      title: "Pas encore de replay",
      body: "Les replays de tes lives apparaîtront ici. En attendant, prépare ton prochain live !",
    },
    community: {
      icon: "🌱",
      title: "La communauté démarre ici",
      body: "Sois le·la premier·e à poster ! Partage une victoire, une galère, ou juste un bonjour.",
      cta: "Écrire un message →",
    },
    calendar_empty: {
      icon: "📅",
      title: "Rien de prévu ici",
      body: "Aucun post pour cette période. Ajoute un contenu ou change de période.",
      cta: "Ajouter un contenu →",
    },
    prospects: {
      icon: "🌱",
      title: "Aucun prospect pour l'instant",
      body: "Ajoute ton premier prospect pour commencer à suivre tes opportunités.",
      cta: "Ajouter un prospect →",
    },
    pinterest_boards: {
      icon: "🎨",
      title: "Aucun tableau pour l'instant",
      body: "Crée 3 à 5 tableaux en lien avec ton univers. Chaque tableau est une porte d'entrée vers ta marque.",
      cta: "Ajouter un tableau →",
    },
    pinterest_pins: {
      icon: "📌",
      title: "Aucune épingle sauvegardée",
      body: "Génère ta première épingle optimisée ci-dessus, puis sauvegarde-la ici.",
    },
    linkedin_recos: {
      icon: "💬",
      title: "Pas encore de recommandations",
      body: "Les recommandations LinkedIn sont la preuve sociale la plus puissante en B2B. Commence par en demander 3.",
    },
  },
} as const;
