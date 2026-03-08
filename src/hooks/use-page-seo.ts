import { useEffect } from "react";

interface PageSEO {
  title: string;
  description: string;
  canonical?: string;
  ogTitle?: string;
  ogDescription?: string;
  noindex?: boolean;
}

const BASE_TITLE = "Nowadays";
const BASE_URL = "https://nowadays-assistant.fr";

/**
 * Sets per-page <title>, meta description, canonical, and OG tags.
 * Restores defaults on unmount.
 */
export function usePageSEO({ title, description, canonical, ogTitle, ogDescription, noindex }: PageSEO) {
  useEffect(() => {
    // Title
    const prevTitle = document.title;
    document.title = `${title} — ${BASE_TITLE}`;

    // Meta description
    const descEl = getOrCreateMeta("description");
    const prevDesc = descEl.getAttribute("content") || "";
    descEl.setAttribute("content", description);

    // Canonical
    let canonicalEl = document.querySelector<HTMLLinkElement>("link[rel='canonical']");
    const prevCanonical = canonicalEl?.getAttribute("href") || "";
    if (canonical) {
      if (!canonicalEl) {
        canonicalEl = document.createElement("link");
        canonicalEl.setAttribute("rel", "canonical");
        document.head.appendChild(canonicalEl);
      }
      canonicalEl.setAttribute("href", `${BASE_URL}${canonical}`);
    }

    // OG
    setMeta("og:title", ogTitle || title);
    setMeta("og:description", ogDescription || description);
    if (canonical) setMeta("og:url", `${BASE_URL}${canonical}`);

    // Robots
    const robotsEl = getOrCreateMeta("robots");
    const prevRobots = robotsEl.getAttribute("content") || "";
    if (noindex) robotsEl.setAttribute("content", "noindex, nofollow");

    return () => {
      document.title = prevTitle;
      descEl.setAttribute("content", prevDesc);
      if (canonicalEl) canonicalEl.setAttribute("href", prevCanonical);
      if (noindex) robotsEl.setAttribute("content", prevRobots);
    };
  }, [title, description, canonical, ogTitle, ogDescription, noindex]);
}

function getOrCreateMeta(name: string): HTMLMetaElement {
  let el = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("name", name);
    document.head.appendChild(el);
  }
  return el;
}

function setMeta(property: string, content: string) {
  let el = document.querySelector<HTMLMetaElement>(`meta[property="${property}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("property", property);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}
