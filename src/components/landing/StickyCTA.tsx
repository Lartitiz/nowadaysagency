import { useState, useEffect } from "react";
import { Link } from "react-router-dom";

export default function StickyCTA() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 600);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  if (!visible) return null;
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] bg-card/90 backdrop-blur-md border-t border-border lg:hidden animate-reveal-up">
      <Link to="/#signup-section"
        className="block w-full text-center rounded-pill bg-primary text-primary-foreground py-3 font-medium shadow-cta">
        🚀 Accéder gratuitement
      </Link>
    </div>
  );
}
