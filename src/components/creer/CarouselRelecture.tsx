/**
 * « Pistes de relecture » sous un carrousel : suggestions facultatives.
 * Un fait trouvé sur le web (16/10/2026) arrive avec le lien de sa page,
 * rendu cliquable pour vérifier le chiffre avant de publier.
 */
export function CarouselRelecture({ suggestions, publishable }: { suggestions: string[]; publishable: boolean }) {
  return (
    <div data-testid="carousel-relecture" className="mt-4 rounded-lg border border-border bg-muted/40 p-4 text-sm text-foreground">
      <p className="font-medium">Pistes de relecture (facultatif)</p>
      <p className="mt-1 text-xs text-muted-foreground">{publishable ? "Ton carrousel est publiable tel quel. " : ""}Ces passages gagneraient peut-être à être retouchés.</p>
      <ul className="mt-2 list-disc pl-5">
        {suggestions.map((message, i) => {
          const link = message.match(/^(.*?)(https?:\/\/\S+)$/);
          return (
            <li key={i}>
              {link ? <>{link[1]}<a href={link[2]} target="_blank" rel="noopener noreferrer" className="underline break-all">{link[2]}</a></> : message}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
