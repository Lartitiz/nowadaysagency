import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import { Sentry } from "@/lib/sentry";
import { MESSAGES } from "@/lib/messages";
import { Button } from "@/components/ui/button";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
    Sentry.captureMessage(`404: ${location.pathname}`, { level: "warning" });
  }, [location.pathname]);

  const msg = MESSAGES.errors.not_found;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-6 text-center">
      <span className="text-6xl mb-6">🌸</span>
      <h1 className="font-heading text-3xl font-bold text-foreground mb-3">
        {msg.title}
      </h1>
      <p className="text-muted-foreground text-base max-w-md mb-8">
        {msg.body}
      </p>
      <Button asChild>
        <Link to="/dashboard">Retour à l'accueil →</Link>
      </Button>
    </div>
  );
};

export default NotFound;
