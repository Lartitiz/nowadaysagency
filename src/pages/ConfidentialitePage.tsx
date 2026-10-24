import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { usePageSEO } from "@/hooks/use-page-seo";

export default function ConfidentialitePage() {
  const navigate = useNavigate();
  const { hash } = useLocation();

  // Les liens #suppression-donnees (réglages de l'app Meta) et #instagram arrivent
  // avant que la page soit dessinée : le navigateur ne défile pas tout seul.
  useEffect(() => {
    if (!hash) return;
    document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView();
  }, [hash]);

  usePageSEO({
    title: "Politique de confidentialité",
    description: "Politique de confidentialité et de protection des données personnelles de l'Assistant Com'.",
    canonical: "/confidentialite",
  });

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
          <p className="text-xs text-muted-foreground">Dernière mise à jour : 24 octobre 2026</p>

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
              <p><span className="font-medium text-foreground/80">Données d'identité de marque :</span> ton identité visuelle, ton histoire, ta proposition de valeur, ta charte : tout ce que tu renseignes dans l'outil pour construire ta communication.</p>
              <p><span className="font-medium text-foreground/80">Contenus créés :</span> tes posts générés, brouillons, calendrier éditorial, idées sauvegardées, scripts, carrousels.</p>
              <p><span className="font-medium text-foreground/80">Données de navigation :</span> pages visitées et actions dans l'outil, collectées via PostHog (hébergé en Union européenne, serveur eu.i.posthog.com) : uniquement après ton consentement.</p>
              <p><span className="font-medium text-foreground/80">Données techniques :</span> un journal de pannes dans notre hébergement Supabase conserve la catégorie de panne, la rubrique concernée, le module technique et l'identifiant du compte connecté. Il ne contient ni tes textes, ni tes photos, ni tes saisies. Il sert uniquement à repérer et corriger les bugs. Sentry peut compléter ce suivi lorsqu'il est configuré ; ses replays de session nécessitent ton consentement.</p>
              <p><span className="font-medium text-foreground/80">Données de facturation :</span> gérées directement par Stripe. On ne stocke jamais tes coordonnées bancaires.</p>
            </div>
          </div>

          <div>
            <p className="font-semibold text-foreground">3. Pourquoi on collecte ces données ?</p>
            <div className="text-muted-foreground mt-1 space-y-2">
              <p><span className="font-medium text-foreground/80">Exécution du contrat (article 6.1.b RGPD) :</span> te fournir le service, générer des contenus, sauvegarder ton travail, gérer ton abonnement.</p>
              <p><span className="font-medium text-foreground/80">Intérêt légitime (article 6.1.f RGPD) :</span> améliorer l'outil, corriger les bugs, assurer la sécurité du service.</p>
              <p><span className="font-medium text-foreground/80">Consentement (article 6.1.a RGPD) :</span> analytics de navigation via PostHog, et mesure de l'effet de nos publicités via le pixel Meta (Facebook/Instagram) : uniquement si tu acceptes le bandeau cookies.</p>
            </div>
          </div>

          <div>
            <p className="font-semibold text-foreground">4. Combien de temps on garde tes données ?</p>
            <div className="text-muted-foreground mt-1 space-y-1">
              <p><span className="font-medium text-foreground/80">Données de compte et contenus :</span> tant que ton compte est actif.</p>
              <p><span className="font-medium text-foreground/80">Après suppression de ton compte :</span> suppression définitive de toutes tes données sous 30 jours.</p>
              <p><span className="font-medium text-foreground/80">Logs de navigation (PostHog) :</span> 12 mois maximum.</p>
              <p><span className="font-medium text-foreground/80">Pixel Meta :</span> selon la politique de conservation de Meta, hors de notre contrôle direct.</p>
              <p><span className="font-medium text-foreground/80">Logs d'erreur (Sentry) :</span> 90 jours.</p>
              <p><span className="font-medium text-foreground/80">Journal technique Supabase :</span> 30 jours maximum, effacé aussi à la suppression du compte.</p>
              <p><span className="font-medium text-foreground/80">Données de facturation (Stripe) :</span> conservées par Stripe selon leurs obligations légales.</p>
            </div>
          </div>

          <div>
            <p className="font-semibold text-foreground">5. Qui a accès à tes données ?</p>
            <p className="text-muted-foreground mt-1">On travaille avec des sous-traitants techniques de confiance :</p>
            <ul className="list-disc list-inside text-muted-foreground mt-1 space-y-1">
              <li><span className="font-medium text-foreground/80">Supabase</span> (hébergement base de données) : serveurs UE (Paris)</li>
              <li><span className="font-medium text-foreground/80">Lovable</span> (hébergement de l'application via Lovable Cloud, et passerelle IA) : certaines demandes à l'IA passent par sa passerelle, qui les transmet au modèle Gemini de Google (voir la section 9)</li>
              <li><span className="font-medium text-foreground/80">Anthropic</span> (traitement IA pour la génération de contenus) : tes données sont envoyées ponctuellement pour générer du contenu, elles ne sont pas stockées par Anthropic</li>
              <li><span className="font-medium text-foreground/80">Google</span> (modèle d'IA Gemini, appelé via la passerelle Lovable) : reçoit ponctuellement les données d'une analyse précise, par exemple tes statistiques Instagram pour « la lecture du coach » (voir la section 9)</li>
              <li><span className="font-medium text-foreground/80">Stripe</span> (paiements sécurisés)</li>
              <li><span className="font-medium text-foreground/80">PostHog</span> (analytics) : serveurs UE</li>
              <li><span className="font-medium text-foreground/80">Sentry</span> (monitoring d'erreurs)</li>
              <li><span className="font-medium text-foreground/80">Meta</span> (pixel publicitaire Facebook/Instagram) : uniquement avec ton consentement, pour mesurer l'effet de nos campagnes</li>
              <li><span className="font-medium text-foreground/80">Meta / Instagram</span> (API Instagram) : uniquement si tu connectes ton compte Instagram, pour publier à ta demande et lire tes statistiques (voir la section 10)</li>
            </ul>
            <p className="text-muted-foreground mt-2 font-medium">Aucune donnée n'est vendue. Avec ton consentement, certaines données de navigation sont partagées avec Meta pour mesurer l'effet de nos publicités — jamais sans ton accord, et jamais vendues à un tiers.</p>
          </div>

          <div>
            <p className="font-semibold text-foreground">6. Transferts hors Union européenne</p>
            <p className="text-muted-foreground mt-1">
              Certains sous-traitants sont basés aux États-Unis (Anthropic, Google, Stripe, Sentry). Les demandes envoyées à Gemini (Google) via la passerelle Lovable peuvent donc être traitées hors UE. Ces transferts sont encadrés par les clauses contractuelles types de la Commission européenne (article 46.2.c RGPD).
            </p>
          </div>

          <div id="suppression-donnees" className="scroll-mt-6">
            <p className="font-semibold text-foreground">7. Tes droits</p>
            <p className="text-muted-foreground mt-1">Conformément aux articles 15 à 21 du RGPD, tu peux à tout moment :</p>
            <ul className="list-disc list-inside text-muted-foreground mt-1 space-y-1">
              <li>Accéder à tes données</li>
              <li>Les rectifier</li>
              <li>Les supprimer (depuis Paramètres &gt; Supprimer mon compte, ou sur demande par email)</li>
              <li>Déconnecter Instagram et effacer les données liées (voir la section 10)</li>
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
                <li><span className="font-medium text-foreground/80">Cookies strictement nécessaires</span> (session d'authentification) : pas besoin de consentement.</li>
                <li><span className="font-medium text-foreground/80">PostHog</span> (analytics) : activé uniquement après ton consentement via le bandeau cookies.</li>
                <li><span className="font-medium text-foreground/80">Pixel Meta</span> (Facebook/Instagram Ads) : activé uniquement après ton consentement, pour mesurer l'effet de nos publicités.</li>
                <li><span className="font-medium text-foreground/80">Sentry</span> (monitoring d'erreurs de base) : intérêt légitime, pas de consentement requis. Les replays de session ne sont activés qu'avec ton consentement.</li>
              </ul>
              <p className="mt-1">Tu peux modifier ton choix à tout moment dans Paramètres &gt; Cookies et traceurs.</p>
            </div>
          </div>

          <div>
            <p className="font-semibold text-foreground">9. Utilisation de l'intelligence artificielle</p>
            <div className="text-muted-foreground mt-1 space-y-1">
              <p>L'outil utilise l'IA (surtout Claude, par Anthropic, et Gemini, par Google) pour t'aider à structurer et rédiger ta communication. Concrètement :</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Tes données d'identité de marque et tes instructions sont envoyées à l'API Anthropic pour générer du contenu.</li>
                <li>Anthropic ne stocke pas tes données et ne les utilise pas pour entraîner ses modèles (API usage).</li>
                <li>Quelques analyses passent par Gemini (Google), via la passerelle IA de Lovable : la lecture du coach sur tes statistiques (chiffres du mois et des mois précédents), l'analyse de l'effet d'un changement de ton identité de marque, les mots-clés de recherche de photos d'illustration (sujet et texte du carrousel), le mini-audit gratuit d'un compte Instagram (le nom du compte seulement), et, en secours si Claude ne répond pas, l'audit Instagram (texte seulement, sans tes images).</li>
                <li>Chaque contenu généré est signalé comme tel dans l'interface.</li>
                <li>L'IA propose, toi tu décides. Toujours.</li>
              </ul>
            </div>
          </div>

          <div id="instagram" className="scroll-mt-6">
            <p className="font-semibold text-foreground">10. Connexion à Instagram</p>
            <div className="text-muted-foreground mt-1 space-y-2">
              <p>Tu peux, si tu le souhaites, connecter ton compte Instagram professionnel depuis Paramètres &gt; Connexions. C'est facultatif : sans connexion, tout le reste de l'outil fonctionne.</p>
              <p><span className="font-medium text-foreground/80">Ce qu'on reçoit de Meta :</span></p>
              <ul className="list-disc list-inside space-y-1">
                <li>un jeton d'accès, chiffré dans notre base, qui permet à l'outil d'agir pour toi ;</li>
                <li>l'identifiant et le nom de ton compte Instagram ;</li>
                <li>tes informations de profil (bio, site, nombre d'abonnés) et la liste de tes publications (légendes, dates, liens) ;</li>
                <li>les statistiques de ton compte et de tes publications (portée, vues, interactions, abonnés gagnés, visites du profil).</li>
              </ul>
              <p><span className="font-medium text-foreground/80">Ce qu'on en fait :</span> remplir tes statistiques sans saisie à la main (y compris un relevé automatique en fin de mois), analyser tes publications pour t'aider à améliorer ta communication, et publier sur ton compte les contenus que tu as choisis, uniquement quand tu cliques sur « Publier » ou à la date que tu as programmée. L'outil ne publie jamais rien sans ton action, ne lit pas tes messages privés et ne modifie pas ton profil.</p>
              <p><span className="font-medium text-foreground/80">Partage :</span> ces données ne sont ni vendues, ni utilisées pour de la publicité, ni partagées avec d'autres clientes. Pour l'analyse de tes publications, les légendes et chiffres concernés sont envoyés ponctuellement à l'IA (voir la section 9).</p>
              <p><span className="font-medium text-foreground/80">Durée de conservation :</span> le jeton d'accès est gardé tant qu'Instagram est connecté, et effacé dès que tu déconnectes Instagram. Les statistiques déjà rangées dans tes tableaux de bord sont gardées tant que ton compte est actif, puis supprimées avec lui (sous 30 jours).</p>
              <p><span className="font-medium text-foreground/80">Déconnecter Instagram et supprimer ces données :</span></p>
              <ul className="list-disc list-inside space-y-1">
                <li>dans l'outil : Paramètres &gt; Connexions &gt; Instagram &gt; « Déconnecter ». Le jeton d'accès et les informations du compte sont effacés immédiatement ;</li>
                <li>dans Instagram : Paramètres &gt; Sécurité &gt; Applications et sites web, puis retirer « Assistant Com Nowadays » ;</li>
                <li>pour effacer aussi tes statistiques et publications importées : Paramètres &gt; Supprimer mon compte, ou un email à <a href="mailto:laetitia@nowadaysagency.com" className="text-primary hover:underline">laetitia@nowadaysagency.com</a> avec l'objet « Suppression des données Instagram ». On s'en occupe sous 30 jours maximum et on te confirme par email.</li>
              </ul>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
