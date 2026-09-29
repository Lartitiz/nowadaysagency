# Supprimer le texte d'intro du Studio sur la page Photos

## Demande
Supprimer la ligne d'explication sous les boutons de la page Photos :
« Studio : pars d'une idée, d'une question ou d'une photo. Fonds inclus dans ton quota ; création et mise en scène en Premium. »

## Modification
- `src/pages/PhotosPage.tsx` (ligne 329) : supprimer le paragraphe `<p className="text-sm text-muted-foreground">Studio : pars d'une idée…</p>`.

Rien d'autre ne change : le bouton « Créer un avant/après ou un mockup », l'import site/Instagram et le bouton « Studio visuel » restent en place.

## Vérification
- Typecheck `npx tsc --noEmit -p tsconfig.app.json`.
- Contrôle visuel dans l'aperçu : la ligne a disparu, l'en-tête reste aligné.
- Frontend non publié (publication sur demande explicite).
