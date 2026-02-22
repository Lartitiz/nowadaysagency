// Client-side audit score calculator — no AI needed for recalculation

export interface ProfileForScore {
  instagram_display_name?: string | null;
  instagram_username?: string | null;
  instagram_bio?: string | null;
  instagram_bio_link?: string | null;
  instagram_photo_description?: string | null;
  instagram_photo_url?: string | null;
  instagram_highlights?: string[] | null;
  instagram_highlights_count?: number | null;
  instagram_pinned_posts?: { description: string }[] | null;
  instagram_feed_description?: string | null;
  instagram_pillars?: string[] | null;
  // From last AI audit
  last_audit_feed_score?: number | null;
}

function containsKeyword(name: string): boolean {
  // Check if name contains a pipe separator (common pattern for adding keywords)
  return name.includes("|") || name.includes("·") || name.includes("—");
}

export function calculateAuditScore(profile: ProfileForScore): number {
  let score = 0;

  // Photo (10 points)
  if (profile.instagram_photo_url || profile.instagram_photo_description) {
    score += 7;
  }

  // Nom (10 points)
  if (profile.instagram_display_name) {
    score += 5;
    if (containsKeyword(profile.instagram_display_name)) {
      score += 5;
    }
  }

  // Bio (25 points)
  if (profile.instagram_bio) {
    const bio = profile.instagram_bio;
    score += 5; // has a bio
    if (bio.length > 50) score += 5; // not too short
    if (bio.includes("↓") || bio.includes("👇") || bio.includes("📩") || bio.includes("⤵")) score += 5; // CTA
    if (bio.split("\n").length >= 3) score += 5; // multi-line = structured
    if (bio.length > 80) score += 5; // uses space well
  }

  // Highlights (15 points)
  const hlCount = profile.instagram_highlights_count || (profile.instagram_highlights?.length ?? 0);
  if (hlCount > 0) {
    score += 5;
    if (hlCount >= 3) score += 5;
    if (hlCount >= 5) score += 5;
  }

  // Posts épinglés (10 points)
  const pinnedCount = profile.instagram_pinned_posts?.length ?? 0;
  if (pinnedCount > 0) {
    score += 5;
    if (pinnedCount >= 3) score += 5;
  }

  // Feed (15 points) — from last AI audit
  score += Math.min(15, profile.last_audit_feed_score || 0);

  // Lien (5 points)
  if (profile.instagram_bio_link) score += 5;

  // Ligne éditoriale (10 points)
  const pillarCount = profile.instagram_pillars?.length ?? 0;
  if (pillarCount > 0) {
    score += 5;
    if (pillarCount >= 3) score += 5;
  }

  return Math.min(score, 100);
}

export function getScoreLabel(score: number): { label: string; color: string; emoji: string } {
  if (score >= 85) return { label: "Excellent", emoji: "🌟", color: "text-green-700" };
  if (score >= 70) return { label: "Bien", emoji: "✅", color: "text-green-600" };
  if (score >= 40) return { label: "À améliorer", emoji: "⚠️", color: "text-amber-600" };
  return { label: "Prioritaire", emoji: "🔴", color: "text-red-600" };
}
