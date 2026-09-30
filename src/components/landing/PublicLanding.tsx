import { useEffect, useRef, useState } from "react";
import BrandLogo from "@/components/BrandLogo";
import SignupForm from "@/components/landing/SignupForm";
import MiniDiagnostic from "@/components/landing/MiniDiagnostic";
import "./public-landing.css";
const views = {
  creer: {
    number: "01",
    title: "Choisis ce que tu veux créer.",
    description:
      "Un post LinkedIn, un carrousel Instagram, une newsletter… Tu pars de ton idée, de ton texte ou de tes photos.",
    image: "/landing/capture-creer.png",
    alt: "Les entrées de création : Instagram, LinkedIn, newsletter et Pinterest",
  },
  carrousel: {
    number: "02",
    title: "Ajuste le texte et les slides.",
    description:
      "Relis les propositions, modifie les textes et vérifie le rendu de ton carrousel.",
    image: "/landing/capture-carrousel.png",
    alt: "L’éditeur de carrousel : textes modifiables et aperçus",
  },
  calendrier: {
    number: "03",
    title: "Vois ta communication d’un coup d’œil.",
    description:
      "Retrouve tes contenus par date et par canal, avec leur état d’avancement.",
    image: "/landing/capture-calendrier.png",
    alt: "Le calendrier mensuel rempli de contenus fictifs",
  },
} as const;
type View = keyof typeof views;
export default function PublicLanding({
  loginTarget,
}: {
  loginTarget: string;
}) {
  const [mobileNav, setMobileNav] = useState(false);
  const [view, setView] = useState<View>("creer");
  const [zoomedView, setZoomedView] = useState<View | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (zoomedView && !dialogRef.current?.open) dialogRef.current?.showModal();
  }, [zoomedView]);
  useEffect(() => {
    const closeMenu = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileNav(false);
    };
    document.addEventListener("keydown", closeMenu);
    return () => document.removeEventListener("keydown", closeMenu);
  }, []);
  return (
    <div className="public-landing">
      <a className="skip" href="#contenu">
        Aller au contenu
      </a>
      <header>
        <nav className="wrap" aria-label="Navigation principale">
          <a className="logo" href="#" aria-label="L’Assistant Com’, accueil">
            <BrandLogo />
          </a>
          <button
            className="menu"
            aria-controls="navigation"
            aria-expanded={mobileNav}
            onClick={() => setMobileNav(!mobileNav)}
          >
            {mobileNav ? "Fermer ×" : "Menu ☰"}
          </button>
          <div
            id="navigation"
            className={`nav-links${mobileNav ? " open" : ""}`}
            onClick={() => setMobileNav(false)}
          >
            <a className="nav-secondary" href="#outil">
              Découvrir l’outil
            </a>
            <a className="nav-secondary" href="#methode">
              La méthode
            </a>
            <a href="/pricing">Tarifs</a>
            <a href={loginTarget}>Se connecter</a>
            <a className="btn small" href="#signup-section">
              Créer mon compte <span aria-hidden="true">→</span>
            </a>
          </div>
        </nav>
      </header>
      <main id="contenu" tabIndex={-1}>
        <section
          className="constellation"
          aria-label="Découvrir L’Assistant Com’"
        >
          <div className="hero-center">
            <p className="eyebrow">La plateforme IA des indépendants</p>
            <h1>
              Crée tes contenus.
              <br />
              <em>Organise ta com’.</em>
            </h1>
            <p className="intro">
              Tes posts, tes carrousels, tes visuels et ton calendrier,
              <br className="desktop-br" /> au même endroit. À ton image.
            </p>
            <div className="hero-cta">
              <a className="btn" href="#signup-section">
                Créer mon compte <span aria-hidden="true">→</span>
              </a>
              <a className="text-link" href="#outil">
                Voir l’outil ↓
              </a>
            </div>
            <div className="hero-person">
              <img
                src="/landing/laetitia-portrait-fourni.webp"
                alt="Laetitia"
                decoding="async"
              />
              <p>
                Imaginé par Laetitia,
                <br />
                <span>pour les indépendants.</span>
              </p>
            </div>
          </div>
          <div
            className="orbit-examples"
            aria-label="Quatre possibilités de la plateforme"
          >
            <a
              className="orbit orbit-carousel"
              href="#outil"
              onClick={() => setView("carrousel")}
            >
              <span className="orbit-label">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <rect x="4" y="5" width="12" height="15" rx="2"></rect>
                  <path d="M9 2h9a2 2 0 0 1 2 2v13"></path>
                </svg>
                Tes carrousels
              </span>
              <div className="mini-carousel">
                <div className="mini-slide-back" aria-hidden="true">
                  <span>02</span>
                </div>
                <div className="mini-slide">
                  <span>LES COULISSES</span>
                  <strong>
                    Ce qui rend
                    <br />
                    mon travail
                    <br />
                    <em>unique.</em>
                  </strong>
                  <div className="mini-rule"></div>
                  <small>À découvrir →</small>
                </div>
              </div>
            </a>
            <a className="orbit orbit-visual" href="#studio-demo">
              <span className="orbit-label">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <rect x="3" y="3" width="18" height="18" rx="3"></rect>
                  <circle cx="8" cy="8" r="2"></circle>
                  <path d="m3 17 6-6 5 5 3-3 4 4"></path>
                </svg>
                Tes visuels
              </span>
              <div className="mini-studio">
                <img
                  src="/landing/studio-resultat-fourni.webp"
                  alt="Exemple de rendu IA : une femme portant la veste fleurie dans une cour"
                  decoding="async"
                />
                <span className="studio-input">
                  <img
                    src="/landing/studio-produit-fourni.webp"
                    alt="La veste utilisée comme référence"
                    decoding="async"
                  />
                </span>
                <span className="studio-tag">À partir de ton produit</span>
              </div>
            </a>
            <a
              className="orbit orbit-post"
              href="#outil"
              onClick={() => setView("creer")}
            >
              <span className="orbit-label">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M5 3h14v18H5zM8 7h8M8 11h8M8 15h5"></path>
                </svg>
                Tes posts
              </span>
              <div className="mini-post">
                <div className="post-meta">
                  <span className="post-avatar" aria-hidden="true">
                    m.
                  </span>
                  <span>
                    Ton activité<small>Ta voix, tes idées.</small>
                  </span>
                  <b aria-hidden="true">···</b>
                </div>
                <p>
                  Ce que j’aime dans mon métier ?<br />
                  Donner vie à vos idées.
                </p>
                <div className="post-lines" aria-hidden="true">
                  <i></i>
                  <i></i>
                </div>
              </div>
            </a>
            <a
              className="orbit orbit-calendar"
              href="#outil"
              onClick={() => setView("calendrier")}
            >
              <span className="orbit-label">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <rect x="3" y="5" width="18" height="16" rx="2"></rect>
                  <path d="M7 2v6M17 2v6M3 11h18"></path>
                </svg>
                Ton calendrier
              </span>
              <div className="mini-calendar">
                <div className="cal-top">
                  <b>Ta semaine</b>
                  <span>‹ ›</span>
                </div>
                <div className="cal-days">
                  <div>
                    <small>LUN.</small>
                    <b>12</b>
                    <span className="cal-event">Post</span>
                  </div>
                  <div>
                    <small>MAR.</small>
                    <b>13</b>
                    <span className="cal-event pale">Visuel</span>
                  </div>
                  <div>
                    <small>MER.</small>
                    <b>14</b>
                    <span className="cal-event">Carrousel</span>
                  </div>
                </div>
              </div>
            </a>
          </div>
          <p className="hero-disclosure">
            Aperçus illustratifs · exemple visuel fourni par Laetitia.
          </p>
        </section>
        <div className="wrap channels">
          <span className="muted">Pour tes contenus sur</span>
          <b>Instagram</b>
          <b>LinkedIn</b>
          <b>Pinterest</b>
          <b>Newsletter</b>
        </div>
        <section
          className="reasons wrap"
          aria-label="Ce que L’Assistant t’aide à faire"
        >
          <div>
            <span>« Je ne sais pas quoi dire. »</span>
            <strong>Trouve un angle pour ton activité.</strong>
          </div>
          <div>
            <span>« Ça ne me ressemble pas. »</span>
            <strong>Pars de ta voix et de ton univers.</strong>
          </div>
          <div>
            <span>« Je publie au dernier moment. »</span>
            <strong>Prépare la suite dans ton calendrier.</strong>
          </div>
        </section>
        <section className="brand-section" id="methode">
          <div className="wrap split">
            <div className="section-copy">
              <p className="eyebrow">D’ABORD, TA MARQUE</p>
              <h2>
                L’IA écrit mieux
                <br />
                quand elle sait
                <br />
                <em>qui tu es.</em>
              </h2>
              <p>
                Tu poses les bases avec des questions guidées : ton activité,
                tes clients, tes offres et ta façon de parler.
              </p>
              <p>
                L’Assistant s’appuie sur ce contexte pour t’aider à créer tes
                contenus.
              </p>
              <a className="text-link" href="#outil">
                Et ensuite, on crée ↓
              </a>
            </div>
            <figure className="brand-visual">
              <div className="brand-sheet">
                <div className="sheet-top">
                  <span className="brand-mark">m.</span>
                  <span>
                    MON IDENTITÉ DE MARQUE
                    <br />
                    <b>Maison Alma</b>
                  </span>
                  <span className="tiny-pill">Exemple</span>
                </div>
                <dl>
                  <div>
                    <dt>Ce que je propose</dt>
                    <dd>Du conseil pour repenser son intérieur.</dd>
                  </div>
                  <div>
                    <dt>À qui je m’adresse</dt>
                    <dd>
                      Aux personnes qui veulent se sentir bien chez elles.
                    </dd>
                  </div>
                  <div>
                    <dt>Ma voix</dt>
                    <dd>
                      <span className="tag">Simple</span>
                      <span className="tag">Chaleureuse</span>
                      <span className="tag">Concrète</span>
                    </dd>
                  </div>
                  <div>
                    <dt>Mon univers</dt>
                    <dd className="swatches">
                      <span style={{ background: "#d9cbb4" }}></span>
                      <span style={{ background: "#433b2f" }}></span>
                      <span style={{ background: "#fffaf1" }}></span>
                      <i>Une identité qui se retrouve dans mes contenus.</i>
                    </dd>
                  </div>
                </dl>
              </div>
              <figcaption className="caption">
                Identité fictive · illustration du principe, pas une capture de
                l’interface.
              </figcaption>
            </figure>
          </div>
        </section>
        <section className="product wrap" id="outil">
          <span id="features" aria-hidden="true"></span>
          <div className="section-head">
            <h2>Regarde ce que tu peux faire.</h2>
            <p>Choisis une vue. Clique sur l’aperçu pour l’agrandir.</p>
          </div>
          <div
            className="tabs"
            role="group"
            aria-label="Choisir une vue du produit"
          >
            <button
              aria-pressed={view === "creer"}
              onClick={() => setView("creer")}
            >
              Créer mes contenus
            </button>
            <button
              aria-pressed={view === "carrousel"}
              onClick={() => setView("carrousel")}
            >
              Les personnaliser
            </button>
            <button
              aria-pressed={view === "calendrier"}
              onClick={() => setView("calendrier")}
            >
              Les organiser
            </button>
          </div>
          <div className="product-stage">
            <div className="product-copy" aria-live="polite">
              <span className="count" id="view-number">
                {views[view].number}
              </span>
              <h3 id="view-title">{views[view].title}</h3>
              <p id="view-description">{views[view].description}</p>
            </div>
            <figure>
              <button
                className="screen-button"
                id="product-image"
                aria-label="Agrandir la vue du produit"
                onClick={() => setZoomedView(view)}
              >
                <img
                  id="view-image"
                  src={views[view].image}
                  alt={views[view].alt}
                  loading="lazy"
                  decoding="async"
                />
                <span className="zoom">Agrandir ⤢</span>
              </button>
              <figcaption className="caption">
                Aperçu de l’outil · exemple avec des données fictives.
              </figcaption>
            </figure>
          </div>
        </section>
        <section className="studio-showcase wrap" id="studio-demo">
          <div className="studio-copy">
            <p className="eyebrow">LE STUDIO VISUEL</p>
            <h2>
              Des visuels soignés.
              <br />
              <em>Un rendu naturel.</em>
            </h2>
            <p>
              Ton produit, une ambiance, une idée. Crée des mises en scène qui
              donnent envie de découvrir ton univers.
            </p>
            <p className="studio-sub">
              Tu décris ce que tu veux. Tu ajustes le résultat avec L’Assistant.
            </p>
            <a className="text-link" href="#outil">
              Découvrir les outils de création ↑
            </a>
          </div>
          <figure className="studio-proof">
            <div className="studio-references">
              <div>
                <span>Ton produit</span>
                <div className="source-product">
                  <img
                    src="/landing/studio-produit-fourni.webp"
                    alt="Photo de départ : veste noire aux motifs floraux colorés"
                    loading="lazy"
                    decoding="async"
                  />
                </div>
              </div>
              <span className="source-plus" aria-hidden="true">
                +
              </span>
              <div>
                <span>Ton décor</span>
                <img
                  className="source-scene"
                  src="/landing/studio-scene-fournie.webp"
                  alt="Scène de départ : une cour avec une table et un vélo"
                  loading="lazy"
                  decoding="async"
                />
              </div>
            </div>
            <span className="proof-arrow" aria-hidden="true">
              →
            </span>
            <div className="studio-final">
              <span>La mise en scène</span>
              <img
                src="/landing/studio-resultat-fourni.webp"
                alt="Résultat fourni : une femme porte la veste fleurie dans le décor de la cour"
                loading="lazy"
                decoding="async"
              />
            </div>
            <figcaption>Exemple de création IA fourni par Laetitia.</figcaption>
          </figure>
        </section>
        <section className="diagnostic-section wrap">
          <figure className="diagnostic-card">
            <div className="audit-sheet">
              <span className="eyebrow">EXEMPLE DE PISTES À TRAVAILLER</span>
              <h4>Par où commencer ?</h4>
              <div>
                <span>01</span>
                <p>
                  <b>Rendre ton offre plus lisible</b>
                  <small>Dire à qui tu t’adresses et ce que tu proposes.</small>
                </p>
              </div>
              <div>
                <span>02</span>
                <p>
                  <b>Montrer ton savoir-faire</b>
                  <small>Partager un exemple concret de ton travail.</small>
                </p>
              </div>
              <div>
                <span>03</span>
                <p>
                  <b>Faciliter le prochain pas</b>
                  <small>Indiquer comment te contacter.</small>
                </p>
              </div>
            </div>
          </figure>
          <div className="diagnostic-copy">
            <p className="eyebrow">LES DIAGNOSTICS</p>
            <h2>
              Vois ce que tu
              <br />
              peux améliorer.
            </h2>
            <p>
              Fais le point sur ta communication avec les audits Instagram et
              SEO. Identifie des pistes à travailler pour la suite.
            </p>
            <span className="feature-tags">
              Instagram · Site web · Recommandations
            </span>
            <details className="landing-mini-diagnostic">
              <summary>Faire un mini-diagnostic Instagram</summary>
              <MiniDiagnostic />
            </details>
          </div>
        </section>
        <section className="channels-section">
          <div className="wrap">
            <div>
              <p className="eyebrow">À CHAQUE CANAL, SON FORMAT</p>
              <h2>
                Tu ne communiques
                <br />
                pas partout pareil.
              </h2>
              <p>
                Des espaces dédiés, des guides et des outils pour avancer selon
                tes besoins.
              </p>
            </div>
            <div className="channel-list">
              <div>
                <b>Instagram</b>
                <span>Posts, carrousels, stories, reels</span>
              </div>
              <div>
                <b>LinkedIn</b>
                <span>Ton expertise, tes idées, tes posts</span>
              </div>
              <div>
                <b>Pinterest</b>
                <span>Des épingles pour tes contenus</span>
              </div>
              <div>
                <b>Newsletter</b>
                <span>Un lien direct avec ton audience</span>
              </div>
              <div>
                <b>Site web & SEO</b>
                <span>Des contenus et des repères pour ton site</span>
              </div>
            </div>
          </div>
        </section>
        <section className="wrap founder-story">
          <figure>
            <img
              src="/landing/laetitia-portrait-fourni.webp"
              alt="Laetitia, créatrice de L’Assistant Com’"
              loading="lazy"
              decoding="async"
            />
            <figcaption>Laetitia · Nowadays</figcaption>
          </figure>
          <div>
            <p className="eyebrow">UNE MÉTHODE, UNE PERSONNE DERRIÈRE</p>
            <h2>
              Tu connais ton métier.
              <br />
              Je t’aide à en parler.
            </h2>
            <p>
              J’ai créé L’Assistant Com’ à partir de mon travail auprès des
              indépendants : des projets qui ont beaucoup à raconter, mais pas
              toujours les mots ni le temps pour le faire.
            </p>
            <p>
              J’y ai réuni ma méthode de communication et des outils pour passer
              à la pratique, de ton identité de marque à ton prochain contenu.
            </p>
            <p className="signature">Laetitia</p>
          </div>
        </section>
        <section className="faq-section wrap" id="questions">
          <div>
            <p className="eyebrow">AVANT DE TE LANCER</p>
            <h2>
              Quelques réponses
              <br />
              pour y voir clair.
            </h2>
            <a className="text-link" href="/pricing">
              Découvrir les offres et les tarifs ↗
            </a>
          </div>
          <div className="questions">
            <details>
              <summary>C’est fait pour mon activité ?</summary>
              <p>
                L’Assistant s’adresse aux indépendants : conseil, création,
                artisanat, formation, services… Tu renseignes ton activité et
                ton public pour donner du contexte aux propositions.
              </p>
            </details>
            <details>
              <summary>Et si ma marque n’est pas encore bien définie ?</summary>
              <p>
                Tu peux commencer par les questions guidées sur ton identité,
                ton offre et tes clients. Tu construis tes repères
                progressivement.
              </p>
            </details>
            <details>
              <summary>
                Est-ce que je peux modifier ce que l’IA propose ?
              </summary>
              <p>
                Oui. Tu peux relire, réécrire et personnaliser les propositions.
                Pour les carrousels, tu ajustes aussi les textes et la mise en
                page des slides.
              </p>
            </details>
            <details>
              <summary>Est-ce que tout se publie automatiquement ?</summary>
              <p>
                Tu gardes la main sur tes contenus. La préparation, l’export et
                la publication dépendent du format et des connexions disponibles
                dans ton compte.
              </p>
            </details>
            <details>
              <summary>Comment choisir mon offre ?</summary>
              <p>
                La page Tarifs présente les formules, les fonctionnalités
                incluses et leurs limites de création. Tu peux les comparer
                avant de choisir.
              </p>
              <a href="/pricing">Voir les offres ↗</a>
            </details>
          </div>
        </section>
        <section className="last">
          <h2>Et si tu créais ton premier contenu ?</h2>
          <a className="btn" href="#signup-section">
            Créer mon compte <span aria-hidden="true">→</span>
          </a>
          <p>
            <a href="/pricing">Voir les offres et leurs limites ↗</a>
          </p>
        </section>
        <section
          className="landing-signup wrap"
          id="signup-section"
          aria-label="Créer mon compte"
        >
          <div>
            <p className="eyebrow">TON PREMIER PAS</p>
            <h2>
              Bienvenue dans
              <br />
              L’Assistant Com’.
            </h2>
            <p>
              Présente ton activité, pose les bases de ta marque et prépare ton
              premier contenu.
            </p>
          </div>
          <div className="signup-form-slot">
            <SignupForm />
          </div>
        </section>
      </main>
      <footer className="wrap">
        <span>L’Assistant Com’ · Nowadays</span>
        <div>
          <a href="/mentions-legales">Mentions légales ↗</a>
          <a href="/cgu-cgv">CGU / CGV ↗</a>
          <a href="/confidentialite">Confidentialité ↗</a>
        </div>
      </footer>
      <dialog
        className="lightbox"
        id="lightbox"
        aria-labelledby="lightbox-title"
        ref={dialogRef}
        onClose={() => setZoomedView(null)}
      >
        <button
          className="close"
          aria-label="Fermer l’image"
          onClick={() => dialogRef.current?.close()}
        >
          ×
        </button>
        <p className="lightbox-title" id="lightbox-title">
          {zoomedView ? views[zoomedView].alt : ""}
        </p>
        <p className="zoom-help">
          Fais glisser la capture de gauche à droite pour la parcourir.
        </p>
        <div
          className="image-scroll"
          tabIndex={0}
          role="region"
          aria-label="Capture agrandie à faire défiler"
        >
          <img
            id="large-image"
            alt={zoomedView ? views[zoomedView].alt : ""}
            src={zoomedView ? views[zoomedView].image : undefined}
            decoding="async"
          />
        </div>
        <p className="caption">
          Aperçu de l’outil · exemple avec des données fictives.
        </p>
      </dialog>
    </div>
  );
}
