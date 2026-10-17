/** Rappel du sujet en haut de l'écran Format : elle voit de quoi parlera le
    contenu avant « Suivant », et peut revenir le changer (passe du 16/10). */
export default function CreerSubjectLine({ idea, onChange }: { idea: string; onChange: () => void }) {
  const sujet = idea.trim();
  if (!sujet) return null;
  return (
    <div className="flex items-baseline gap-3 text-sm" data-testid="creer-format-subject">
      {/* Sujet long (brief collé) : deux lignes au plus, le lien reste visible. */}
      <p className="min-w-0 flex-1 line-clamp-2 text-foreground">
        <span className="font-semibold">Sujet :</span> {sujet}
      </p>
      <button type="button" onClick={onChange} className="shrink-0 text-primary underline underline-offset-4 rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2">
        Changer le sujet
      </button>
    </div>
  );
}
