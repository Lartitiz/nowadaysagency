// Formes des statistiques Instagram renvoyées par instagram-insights.ts
// (sorties de ce gros fichier pour qu'il ne grossisse plus).
import type { PostVerdict } from "./post-median.ts";

export interface IgPostMetrics {
  id: string;
  subject: string; // début de la légende, sert de "sujet" dans l'audit
  format: string; // IMAGE / CAROUSEL / VIDEO / REEL
  timestamp: string;
  permalink?: string;
  reach?: number;
  views?: number; // nouvelle métrique Meta (remplace impressions) — clé pour les Reels
  likes?: number;
  comments?: number;
  saves?: number;
  shares?: number;
  engagementRate?: number; // (likes+comments+saves+shares) / (reach ou, à défaut, views)
  xMedian?: number; // likes ÷ médiane des likes du compte (post-median.ts), au dixième
  verdict?: PostVerdict; // sorti du lot / au-dessus / en dessous / trop tôt (< 7 j)
}

export interface IgAudienceBucket {
  label: string; // ex: "25-34", "Femmes", "Paris, Île-de-France", "FR"
  value: number; // nb d'abonnés dans ce segment (compte, pas %)
}

export interface IgAudience {
  age?: IgAudienceBucket[]; // tranches d'âge, triées desc
  gender?: IgAudienceBucket[]; // genre (libellés FR)
  cities?: IgAudienceBucket[]; // top villes
  countries?: IgAudienceBucket[]; // top pays (codes ISO)
}

export interface IgLiveMetrics {
  username?: string;
  displayName?: string; // champ "name" du profil
  biography?: string; // bio du profil
  profilePictureUrl?: string;
  website?: string; // lien en bio
  followers?: number;
  follows?: number;
  mediaCount?: number;
  reach30d?: number;
  views30d?: number; // vues du compte sur 28 j (remplace impressions, dépréciées par Meta)
  totalInteractions30d?: number; // likes + commentaires + partages + enregistrements du compte
  accountsEngaged30d?: number; // nb de comptes uniques ayant interagi
  profileViews30d?: number; // visites du profil (réintroduit par Meta en 2025)
  followerGrowth30d?: number;
  postsLast30d?: number;
  postsMonthCount?: number; // nb de posts du MOIS CALENDAIRE en cours (≠ fenêtre 30 j)
  frequencyLabel?: string;
  avgEngagementRate?: number; // moyenne sur les posts mesurés
  topPosts: IgPostMetrics[]; // 3 meilleurs par engagement
  flopPosts: IgPostMetrics[]; // 3 moins bons par engagement
  recentPosts?: IgPostMetrics[]; // les 12 derniers posts, du plus récent au plus ancien, avec xMedian/verdict
  medianLikes?: number; // likes du post « habituel » (médiane des 12 à 24 derniers posts posés)
  medianSample?: number; // nb de posts qui ont servi à la médiane
  audience?: IgAudience; // démographie des abonnés (follower_demographics)
  fetchedAt: string;
  partial: boolean; // true si une partie des appels a échoué
  authError?: boolean; // true si Meta a signalé un token invalide / permission retirée
}
