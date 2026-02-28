import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

export default function CguCgvPage() {
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

        <h1 className="font-display text-2xl font-bold text-foreground mb-2">
          Conditions Générales d'Utilisation et de Vente
        </h1>
        <p className="text-xs text-muted-foreground mb-6">Dernière mise à jour : 28 février 2026</p>

        <div className="rounded-2xl bg-card border border-border p-6 space-y-6 text-sm leading-relaxed">
          <p className="italic text-muted-foreground">
            "Ces conditions, on les a écrites pour que tout soit clair entre nous. Pas de petits caractères piégeux, pas de clauses cachées. Si tu utilises L'Assistant Com', voilà ce qui s'applique."
          </p>

          {/* SECTION 1 */}
          <div>
            <p className="font-semibold text-foreground mb-1">1. Objet</p>
            <p className="text-muted-foreground">
              Les présentes Conditions Générales d'Utilisation et de Vente (ci-après « CGU/CGV ») régissent l'utilisation de la plateforme L'Assistant Com' (ci-après « l'Outil »), éditée par :
            </p>
            <p className="text-muted-foreground mt-2">
              Laetitia Mattioli — EI MATTIOLI Laetitia<br />
              Micro-entreprise<br />
              SIRET : 832 189 070 00028<br />
              6 rue Saint-Jacques, 89300 Joigny<br />
              Email :{" "}
              <a href="mailto:laetitia@nowadaysagency.com" className="text-primary hover:underline">
                laetitia@nowadaysagency.com
              </a>
            </p>
            <p className="text-muted-foreground mt-2">
              L'Outil est accessible à l'adresse{" "}
              <a href="https://nowadays-assistant.fr" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
                https://nowadays-assistant.fr
              </a>{" "}
              et ses sous-domaines.
            </p>
          </div>

          {/* SECTION 2 */}
          <div>
            <p className="font-semibold text-foreground mb-1">2. Acceptation des conditions</p>
            <p className="text-muted-foreground">
              L'inscription à l'Outil vaut acceptation pleine et entière des présentes CGU/CGV. Si tu n'es pas d'accord avec l'une de ces conditions, tu ne dois pas utiliser l'Outil.
            </p>
          </div>

          {/* SECTION 3 */}
          <div>
            <p className="font-semibold text-foreground mb-1">3. Description des services</p>
            <p className="text-muted-foreground">L'Assistant Com' est un outil de communication en ligne qui propose :</p>
            <ul className="list-disc pl-5 text-muted-foreground space-y-1 mt-1">
              <li>Un espace de branding (storytelling, persona, proposition de valeur, ton et style, stratégie de contenu, offres)</li>
              <li>Des générateurs de contenu assistés par intelligence artificielle</li>
              <li>Un calendrier éditorial et une bibliothèque d'idées</li>
              <li>Des audits automatisés (Instagram, LinkedIn, site web)</li>
              <li>Un espace d'accompagnement pour les abonné·es au programme "Ton binôme de com'"</li>
            </ul>
            <p className="text-muted-foreground mt-2">
              Les contenus générés par l'IA sont des bases de travail. L'utilisateur·ice reste seul·e responsable de leur publication et de leur adaptation.
            </p>
          </div>

          {/* SECTION 4 */}
          <div>
            <p className="font-semibold text-foreground mb-1">4. Inscription et compte</p>
            <p className="text-muted-foreground">
              Pour utiliser l'Outil, tu dois créer un compte avec une adresse email valide et un mot de passe. Tu es responsable de la confidentialité de tes identifiants. Toute activité réalisée depuis ton compte est réputée effectuée par toi.
            </p>
            <p className="text-muted-foreground mt-2">
              Tu t'engages à fournir des informations exactes et à les maintenir à jour.
            </p>
          </div>

          {/* SECTION 5 */}
          <div>
            <p className="font-semibold text-foreground mb-1">5. Offres et tarifs</p>
            <p className="text-muted-foreground">L'Outil propose plusieurs formules :</p>
            <ul className="list-disc pl-5 text-muted-foreground space-y-1 mt-1">
              <li><strong>Plan Gratuit :</strong> accès à l'ensemble de l'outil avec 25 crédits IA par mois.</li>
              <li><strong>Plan L'Assistant Com' Premium :</strong> 39€ TTC par mois, sans engagement. Crédits IA étendus (300/mois), audits illimités, tous les modules débloqués.</li>
              <li><strong>Programme "Ton binôme de com'" :</strong> 250€ TTC par mois, engagement de 6 mois (soit 1 500€ TTC au total). Inclut le plan Premium + accompagnement individuel avec Laetitia Mattioli (sessions visio 2h/mois, support WhatsApp jours ouvrés, stratégie personnalisée).</li>
              <li><strong>Paiement unique "Ton binôme de com'" :</strong> 1 500€ TTC en une fois.</li>
              <li><strong>Packs de crédits IA :</strong> 3,90€ (10 crédits), 8,90€ (30 crédits), 14,90€ (60 crédits).</li>
            </ul>
            <p className="text-muted-foreground mt-2">TVA non applicable, article 293 B du Code Général des Impôts.</p>
            <p className="text-muted-foreground mt-2">
              Les tarifs peuvent être modifiés à tout moment. Les modifications s'appliquent aux nouveaux abonnements et aux renouvellements, jamais en cours de période.
            </p>
            <p className="italic text-muted-foreground mt-3">
              "(En résumé : le prix affiché est le prix que tu paies. Pas de frais cachés, pas de surprises.)"
            </p>
          </div>

          {/* SECTION 6 */}
          <div>
            <p className="font-semibold text-foreground mb-1">6. Paiement et facturation</p>
            <p className="text-muted-foreground">
              Les paiements sont gérés par Stripe (Stripe Payments Europe, Ltd). Nous ne stockons jamais tes coordonnées bancaires.
            </p>
            <p className="text-muted-foreground mt-2">
              Pour les abonnements : le prélèvement est automatique chaque mois à la date anniversaire de la souscription.
            </p>
            <p className="text-muted-foreground mt-2">
              Pour le programme "Ton binôme de com'" en mensuel : l'engagement est de 6 mois. En cas de résiliation anticipée, les mensualités restantes jusqu'au terme de l'engagement sont dues.
            </p>
          </div>

          {/* SECTION 7 */}
          <div>
            <p className="font-semibold text-foreground mb-1">7. Droit de rétractation</p>
            <p className="text-muted-foreground">
              Conformément à l'article L.221-28 du Code de la consommation, le droit de rétractation ne s'applique pas aux contenus numériques fournis sur un support immatériel dont l'exécution a commencé avec ton accord.
            </p>
            <p className="text-muted-foreground mt-2">
              En acceptant ces CGV et en utilisant l'Outil après inscription, tu reconnais renoncer expressément à ton droit de rétractation pour les services déjà exécutés.
            </p>
            <p className="italic text-muted-foreground mt-3">
              "(Concrètement : dès que tu utilises l'Outil ou que tu génères un contenu, le service est considéré comme commencé. Mais si tu rencontres un problème, on en discute : laetitia@nowadaysagency.com.)"
            </p>
          </div>

          {/* SECTION 8 */}
          <div>
            <p className="font-semibold text-foreground mb-1">8. Résiliation</p>
            <p className="text-muted-foreground">
              <strong>Plan mensuel (Premium) :</strong> tu peux résilier à tout moment depuis ton espace Stripe (rubrique "Gérer mon abonnement" dans les paramètres). La résiliation prend effet à la fin de la période en cours. Aucun remboursement au prorata.
            </p>
            <p className="text-muted-foreground mt-2">
              <strong>Programme "Ton binôme de com'" :</strong> en cas de résiliation avant le terme des 6 mois, les mensualités restantes restent dues sauf accord écrit de Laetitia Mattioli.
            </p>
            <p className="text-muted-foreground mt-2">
              <strong>Plan gratuit :</strong> tu peux supprimer ton compte à tout moment depuis les paramètres. Toutes tes données seront effacées conformément à notre politique de confidentialité.
            </p>
          </div>

          {/* SECTION 9 */}
          <div>
            <p className="font-semibold text-foreground mb-1">9. Propriété intellectuelle</p>
            <p className="text-muted-foreground">
              <strong>L'Outil :</strong> l'ensemble du code source, du design, des textes et des fonctionnalités de L'Assistant Com' est la propriété de Laetitia Mattioli — EI MATTIOLI Laetitia. Toute reproduction, même partielle, est interdite sans autorisation.
            </p>
            <p className="text-muted-foreground mt-2">
              <strong>Tes contenus :</strong> les contenus que tu crées ou génères via l'Outil t'appartiennent. Tu en es libre d'usage. Nous ne les utilisons pas à des fins commerciales, marketing ou de formation IA sans ton consentement explicite.
            </p>
            <p className="italic text-muted-foreground mt-3">
              "(Ce que tu crées ici est à toi. Point.)"
            </p>
          </div>

          {/* SECTION 10 */}
          <div>
            <p className="font-semibold text-foreground mb-1">10. Intelligence artificielle</p>
            <p className="text-muted-foreground">
              L'Outil utilise des modèles d'IA pour la génération de contenus et le coaching. Les données transmises sont utilisées uniquement pour fournir le service et ne sont pas utilisées pour entraîner les modèles.
            </p>
            <p className="text-muted-foreground mt-2">
              L'IA est un assistant. Les contenus générés peuvent contenir des erreurs ou des approximations. Tu es responsable de la relecture et de la validation de tout contenu avant publication.
            </p>
          </div>

          {/* SECTION 11 */}
          <div>
            <p className="font-semibold text-foreground mb-1">11. Données personnelles</p>
            <p className="text-muted-foreground">
              Le traitement de tes données personnelles est décrit dans notre{" "}
              <a href="/confidentialite" className="text-primary hover:underline">Politique de confidentialité</a>.
            </p>
          </div>

          {/* SECTION 12 */}
          <div>
            <p className="font-semibold text-foreground mb-1">12. Responsabilité</p>
            <p className="text-muted-foreground">
              L'Outil est fourni « en l'état ». Nous faisons notre maximum pour assurer sa disponibilité et sa fiabilité, mais nous ne pouvons garantir une disponibilité ininterrompue.
            </p>
            <p className="text-muted-foreground mt-2">Nous ne sommes pas responsables :</p>
            <ul className="list-disc pl-5 text-muted-foreground space-y-1 mt-1">
              <li>des résultats obtenus grâce à l'utilisation des contenus générés</li>
              <li>des interruptions temporaires pour maintenance ou mise à jour</li>
              <li>des dommages indirects liés à l'utilisation de l'Outil</li>
            </ul>
          </div>

          {/* SECTION 13 */}
          <div>
            <p className="font-semibold text-foreground mb-1">13. Modification des CGU/CGV</p>
            <p className="text-muted-foreground">
              Nous nous réservons le droit de modifier les présentes CGU/CGV. Tu seras informé·e par email ou via l'Outil en cas de modification substantielle. La poursuite de l'utilisation de l'Outil après modification vaut acceptation.
            </p>
          </div>

          {/* SECTION 14 */}
          <div>
            <p className="font-semibold text-foreground mb-1">14. Droit applicable et litiges</p>
            <p className="text-muted-foreground">
              Les présentes CGU/CGV sont régies par le droit français.
            </p>
            <p className="text-muted-foreground mt-2">
              En cas de litige, une solution amiable sera recherchée en priorité. À défaut, le litige sera porté devant le tribunal compétent de Sens (89).
            </p>
            <p className="text-muted-foreground mt-2">
              Conformément à l'article L.612-1 du Code de la consommation, tu peux recourir gratuitement au service de médiation MEDICYS :{" "}
              <a href="https://www.medicys.fr" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
                www.medicys.fr
              </a>
            </p>
          </div>

          <p className="italic text-muted-foreground pt-2 border-t border-border">
            "Ces conditions sont là pour nous protéger mutuellement. Si tu as une question, un doute, ou si quelque chose te semble flou :{" "}
            <a href="mailto:laetitia@nowadaysagency.com" className="text-primary hover:underline">laetitia@nowadaysagency.com</a>. On en parle."
          </p>
        </div>
      </main>
    </div>
  );
}
