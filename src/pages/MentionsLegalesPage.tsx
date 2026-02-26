import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

export default function MentionsLegalesPage() {
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

        <h1 className="font-display text-2xl font-bold text-foreground mb-6">Mentions légales</h1>

        <div className="rounded-2xl bg-card border border-border p-6 space-y-5 text-sm leading-relaxed">
          <div>
            <p className="font-semibold text-foreground">Éditrice du site</p>
            <p className="text-muted-foreground">
              Laetitia Mattioli — EI MATTIOLI Laetitia<br />
              Micro-entreprise<br />
              SIRET : 832 189 070 00028<br />
              NDA : 11756569775<br />
              Code NACE : 7002AZ<br />
              6 rue Saint-Jacques, 89300 Joigny<br />
              Email : <a href="mailto:laetitia@nowadaysagency.com" className="text-primary hover:underline">laetitia@nowadaysagency.com</a>
            </p>
          </div>

          <div>
            <p className="font-semibold text-foreground">Directrice de la publication</p>
            <p className="text-muted-foreground">Laetitia Mattioli</p>
          </div>

          <div>
            <p className="font-semibold text-foreground">Hébergement</p>
            <p className="text-muted-foreground">
              Application : Lovable —{" "}
              <a href="https://lovable.dev" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">https://lovable.dev</a><br />
              Base de données : Supabase Inc. — 970 Toa Payoh North #07-04, Singapore 318992<br />
              Intelligence artificielle : Anthropic PBC — 548 Market St, San Francisco, CA 94104, États-Unis
            </p>
          </div>

          <div>
            <p className="font-semibold text-foreground">Crédits</p>
            <p className="text-muted-foreground">
              Site conçu et développé par Laetitia Mattioli avec Lovable.<br />
              Photographies : Laetitia Mattioli, sauf mention contraire.
            </p>
          </div>

          <div>
            <p className="font-semibold text-foreground">Propriété intellectuelle</p>
            <p className="text-muted-foreground">
              L'ensemble du contenu de ce site (textes, images, logo, code source) est la propriété de Laetitia Mattioli — EI MATTIOLI Laetitia, sauf mention contraire. Toute reproduction, même partielle, est interdite sans autorisation préalable.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
