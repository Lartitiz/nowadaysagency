import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

export default function ConfidentialitePage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-2xl px-4 py-8 animate-fade-in">
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary mb-6"
        >
          <ArrowLeft className="h-4 w-4" /> Retour
        </button>

        <h1 className="font-display text-2xl font-bold text-foreground mb-6">Politique de confidentialité</h1>

        <div className="rounded-2xl bg-card border border-border p-6 space-y-5 text-sm leading-relaxed">
          <p className="text-xs text-muted-foreground">Dernière mise à jour : 26 février 2026</p>

          <p className="italic text-muted-foreground">
            Chez Nowadays Agency, on prend la protection de tes données au sérieux. Pas par obligation (bon, un peu quand même), mais parce qu'on croit que la confiance, ça se construit aussi dans les petits caractères.
          </p>

          <div>
            <p className="font-semibold text-foreground">1. Qui est responsable de tes données ?</p>
            <p className="text-muted-foreground mt-1">
              Laetitia Mattioli — EI MATTIOLI Laetitia<br />
              SIRET : 832 189 070 00028<br />
              6 rue Saint-Jacques, 89300 Joigny<br />
              Email : <a href="mailto:laetitia@nowadaysagency.com" className="text-primary hover:underline">laetitia@nowadaysagency.com</a>
            </p>
          </div>

          <div>
            <p className="font-semibold text-foreground">2. Quelles données sont collectées ?</p>
            <div className="text-muted-foreground mt-1 space-y-2">
              <p><span className="font-medium text-foreground/80">Données de compte :</span> ton email et ton mot de passe (hashé et sécurisé, on n'y a pas accès en clair).</p>
              <p><span className="font-medium text-foreground/80">Données de profil :</span> ton prénom, ton activité, tes canaux de communication, ta cible.</p>
              <p><span className="font-medium text-foreground/80">Données de branding :</span> ton identité visuelle, ton storytelling, ta proposition de valeur, ta charte — tout ce que tu renseignes dans l'outil pour construire ta communication.</p>
              <p><span className="font-medium text-foreground/80">Contenus créés :</span> tes posts générés, brouillons, calendrier éditorial, idées sauvegardées, scripts, carrousels.</p>
              <p><span className="font-medium text-foreground/80">Données de navigation :</span> pages visitées et actions dans l'outil, collectées via PostHog (hébergé en Union européenne, serveur eu.i.posthog.com) — uniquement après ton consentement.</p>
              <p><span className="font-medium text-foreground/80">Données techniques :</span> logs d'erreur anonymisés via Sentry, avec masquage automatique du texte et des médias. Utilisés uniquement pour corriger les bugs.</p>
              <p><span className="font-medium text-foreground/80">Données de facturation :</span> gérées directement par Stripe. On ne stocke jamais tes coordonnées bancaires.</p>
            </div>
          </div>

          <div>
            <p className="font-semibold text-foreground">3. Pourquoi on collecte ces données ?</p>
            <div className="text-muted-foreground mt-1 space-y-2">
              <p><span className="font-medium text-foreground/80">Exécution du contrat (article 6.1.b RGPD) :</span> te fournir le service, générer des contenus, sauvegarder ton travail, gérer ton abonnement.</p>
              <p><span className="font-medium text-foreground/80">Intérêt légitime (article 6.1.f RGPD) :</span> améliorer l'outil, corriger les bugs, assurer la sécurité du service.</p>
              <p><span className="font-medium text-foreground/80">Consentement (article 6.1.a RGPD) :</span> analytics de navigation via PostHog — uniquement si tu acceptes le bandeau cookies.</p>
            </div>
          </div>

          <div>
            <p className="font-semibold text-foreground">4. Combien de temps on garde tes données ?</p>
            <div className="text-muted-foreground mt-1 space-y-1">
              <p><span className="font-medium text-foreground/80">Données de compte et contenus :</span> tant que ton compte est actif.</p>
              <p><span className="font-medium text-foreground/80">Après suppression de ton compte :</span> suppression définitive de toutes tes données sous 30 jours.</p>
              <p><span className="font-medium text-foreground/80">Logs de navigation (PostHog) :</span> 12 mois maximum.</p>
              <p><span className="font-medium text-foreground/80">Logs d'erreur (Sentry) :</span> 90 jours.</p>
              <p><span className="font-medium text-foreground/80">Données de facturation (Stripe) :</span> conservées par Stripe selon leurs obligations légales.</p>
            </div>
          </div>

          <div>
            <p className="font-semibold text-foreground">5. Qui a accès à tes données ?</p>
            <p className="text-muted-foreground mt-1">On travaille avec des sous-traitants techniques de confiance :</p>
            <ul className="list-disc list-inside text-muted-foreground mt-1 space-y-1">
              <li><span className="font-medium text-foreground/80">Supabase</span> (hébergement base de données) — serveurs UE</li>
              <li><span className="font-medium text-foreground/80">Anthropic</span> (traitement IA pour la génération de contenus) — tes données sont envoyées ponctuellement pour générer du contenu, elles ne sont pas stockées par Anthropic</li>
              <li><span className="font-medium text-foreground/80">Stripe</span> (paiements sécurisés)</li>
              <li><span className="font-medium text-foreground/80">PostHog</span> (analytics) — serveurs UE</li>
              <li><span className="font-medium text-foreground/80">Sentry</span> (monitoring d'erreurs)</li>
            </ul>
            <p className="text-muted-foreground mt-2 font-medium">Aucune donnée n'est vendue. Aucune donnée n'est partagée à des fins publicitaires. Jamais.</p>
          </div>

          <div>
            <p className="font-semibold text-foreground">6. Transferts hors Union européenne</p>
            <p className="text-muted-foreground mt-1">
              Certains sous-traitants sont basés aux États-Unis (Anthropic, Stripe, Sentry). Ces transferts sont encadrés par les clauses contractuelles types de la Commission européenne (article 46.2.c RGPD).
            </p>
          </div>

          <div>
            <p className="font-semibold text-foreground">7. Tes droits</p>
            <p className="text-muted-foreground mt-1">Conformément aux articles 15 à 21 du RGPD, tu peux à tout moment :</p>
            <ul className="list-disc list-inside text-muted-foreground mt-1 space-y-1">
              <li>Accéder à tes données</li>
              <li>Les rectifier</li>
              <li>Les supprimer (depuis Paramètres &gt; Supprimer mon compte, ou sur demande par email)</li>
              <li>Demander leur portabilité</li>
              <li>T'opposer au traitement</li>
              <li>Retirer ton consentement pour les cookies (depuis Paramètres &gt; Cookies et traceurs)</li>
            </ul>
            <p className="text-muted-foreground mt-2">
              Pour exercer tes droits : <a href="mailto:laetitia@nowadaysagency.com" className="text-primary hover:underline">laetitia@nowadaysagency.com</a> — réponse sous 30 jours maximum.
            </p>
            <p className="text-muted-foreground mt-1">
              Si tu estimes que tes droits ne sont pas respectés, tu peux saisir la CNIL : <a href="https://www.cnil.fr" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">www.cnil.fr</a>
            </p>
          </div>

          <div>
            <p className="font-semibold text-foreground">8. Cookies et traceurs</p>
            <div className="text-muted-foreground mt-1 space-y-1">
              <p>L'outil utilise :</p>
              <ul className="list-disc list-inside space-y-1">
                <li><span className="font-medium text-foreground/80">Cookies strictement nécessaires</span> (session d'authentification) — pas besoin de consentement.</li>
                <li><span className="font-medium text-foreground/80">PostHog</span> (analytics) — activé uniquement après ton consentement via le bandeau cookies.</li>
                <li><span className="font-medium text-foreground/80">Sentry</span> (monitoring d'erreurs de base) — intérêt légitime, pas de consentement requis. Les replays de session ne sont activés qu'avec ton consentement.</li>
              </ul>
              <p className="mt-1">Tu peux modifier ton choix à tout moment dans Paramètres &gt; Cookies et traceurs.</p>
            </div>
          </div>

          <div>
            <p className="font-semibold text-foreground">9. Utilisation de l'intelligence artificielle</p>
            <div className="text-muted-foreground mt-1 space-y-1">
              <p>L'outil utilise l'IA (Claude, par Anthropic) pour t'aider à structurer et rédiger ta communication. Concrètement :</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Tes données de branding et tes instructions sont envoyées à l'API Anthropic pour générer du contenu.</li>
                <li>Anthropic ne stocke pas tes données et ne les utilise pas pour entraîner ses modèles (API usage).</li>
                <li>Chaque contenu généré est signalé comme tel dans l'interface.</li>
                <li>L'IA propose, toi tu décides. Toujours.</li>
              </ul>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
