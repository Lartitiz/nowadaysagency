import { useState, useEffect, useRef } from "react";

const BRANDS = [
  "Napperon", "Mazeh Paris", "Boom Boom Dance", "Terra y Mar",
  "Atelier Tiket", "Hopla Studio", "File ton cuir",
  "Yza Handmade", "Awqa", "Ti Matelot",
];

export default function BrandMarquee() {
  const [isVisible, setIsVisible] = useState(false);
  const marqueeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = marqueeRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setIsVisible(true); observer.disconnect(); } },
      { rootMargin: "100px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={marqueeRef} className="overflow-hidden relative py-4">
      <div className={`flex whitespace-nowrap gap-8 ${isVisible ? "animate-marquee" : ""}`}>
        {[...BRANDS, ...BRANDS].map((b, i) => (
          <span key={i} className="inline-block px-6 py-2.5 rounded-xl bg-card border border-border text-sm font-semibold text-foreground shrink-0">
            {b}
          </span>
        ))}
      </div>
    </div>
  );
}
