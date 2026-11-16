import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { applyCookieChoice, readCookieChoice, type CookieChoice } from "@/lib/cookie-consent-actions";

/**
 * Bandeau cookies affiché tant qu'aucun choix n'a été fait.
 * « Refuser » est aussi simple et visible que « Accepter » (règle CNIL).
 * Non bloquant : la page reste utilisable derrière.
 */
export default function CookieConsentBanner() {
  const [visible, setVisible] = useState(() => readCookieChoice() === null);
  if (!visible) return null;

  const choose = (choice: CookieChoice) => {
    setVisible(false);
    void applyCookieChoice(choice);
  };

  return (
    <div
      role="region"
      aria-label="Choix des cookies"
      data-testid="cookie-banner"
      className="fixed inset-x-3 bottom-3 z-[60] mx-auto max-w-md rounded-2xl border border-border bg-background p-4 shadow-lg sm:inset-x-auto sm:left-4 sm:mx-0"
    >
      <p className="text-sm leading-relaxed text-foreground">
        On aimerait mesurer comment l'outil est utilisé (PostHog, hébergé en Europe) et l'effet de nos
        publicités (pixel Meta). Rien n'est envoyé sans ton accord.{" "}
        <Link to="/confidentialite" className="font-medium text-primary underline-offset-2 hover:underline">
          En savoir plus
        </Link>
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button variant="outline" size="sm" className="rounded-full" onClick={() => choose("refused")}>
          Refuser
        </Button>
        <Button variant="outline" size="sm" className="rounded-full" onClick={() => choose("accepted")}>
          Accepter
        </Button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">Tu peux changer d'avis à tout moment dans Paramètres.</p>
    </div>
  );
}
