// Retours bêta encore « new » : contenu des plus anciens d'abord, pour que le
// bilan du lundi puisse les citer en une ligne sans ouvrir l'admin (avant le
// 14/10/2026 seul le nombre remontait). Lus tous âges confondus : si un run
// de la routine saute, rien ne reste invisible (passer un retour à « seen » ou
// « done » dans l'onglet admin le fait sortir de la liste).

export interface FeedbackNewRow {
  user_id: string;
  type: string | null;
  severity: string | null;
  content: string | null;
  page_url: string | null;
  created_at: string;
}

export interface FeedbackNewItem {
  type: string | null;
  severite: string | null;
  contenu: string;
  page: string | null;
  quand: string;
}

export function feedbackNewItems(rows: FeedbackNewRow[], max = 10): FeedbackNewItem[] {
  return [...rows]
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .slice(0, max)
    .map((f) => ({
      type: f.type,
      severite: f.severity,
      contenu: (f.content || "").slice(0, 160),
      page: f.page_url,
      quand: f.created_at,
    }));
}

// Activation d'une cohorte : membres avec ≥1 génération ou ≥1 post DEPUIS
// l'inscription. Distingue « jamais démarré » de « a essayé puis décroché ».
export function ontGenere(cohort: { user_id: string }[], activite: { user_id: string }[]): number {
  const everActive = new Set(activite.map((r) => r.user_id));
  return cohort.filter((p) => everActive.has(p.user_id)).length;
}
