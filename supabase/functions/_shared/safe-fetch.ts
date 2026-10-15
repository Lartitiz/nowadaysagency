// Lecture d'URL anti-SSRF, SANS aucune dépendance : importable par n'importe quel
// module (_shared/linkedin-graph.ts est aussi lu par les tests du front).
// Ré-exporté par scraping.ts.

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

export function isSafePublicUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;

    const hostname = parsed.hostname;

    // Block localhost-like names
    if (
      hostname === "localhost" ||
      hostname.endsWith(".local") ||
      hostname.endsWith(".localhost") ||
      hostname.endsWith(".internal")
    ) {
      return false;
    }

    // Block non-dotted numeric hosts (decimal/octal/hex IP notation, e.g. 2130706433 = 127.0.0.1)
    if (/^\d+$/.test(hostname) || /^0x[0-9a-f]+$/i.test(hostname)) return false;

    // Block IPv4 private/reserved ranges
    const ipv4Match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (ipv4Match) {
      const [, a, b, c, d] = ipv4Match.map(Number);
      if (a === 127) return false; // 127.0.0.0/8
      if (a === 10) return false; // 10.0.0.0/8
      if (a === 172 && b >= 16 && b <= 31) return false; // 172.16.0.0/12
      if (a === 192 && b === 168) return false; // 192.168.0.0/16
      if (a === 169 && b === 254) return false; // 169.254.0.0/16
      if (a === 0 && b === 0 && c === 0 && d === 0) return false; // 0.0.0.0
    }

    // Block IPv6 private/reserved
    const ipv6Lower = hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (ipv6Lower === "::1") return false;
    if (ipv6Lower.startsWith("fc") || ipv6Lower.startsWith("fd")) return false; // fc00::/7
    if (ipv6Lower.startsWith("fe80:")) return false; // fe80::/10

    return true;
  } catch {
    return false;
  }
}

/**
 * Fetch une URL en suivant les redirections MANUELLEMENT, avec une vérification
 * anti-SSRF (isSafePublicUrl) à CHAQUE saut. `redirect: "follow"` ferait la
 * requête vers la cible finale avant qu'on puisse la valider — d'où la boucle.
 * Retourne la réponse finale + l'URL finale (pour résoudre les liens relatifs).
 */
export async function safeFetchFollow(
  rawUrl: string,
  signal: AbortSignal,
  maxRedirects = 4,
  headers: Record<string, string> = { "User-Agent": USER_AGENT },
): Promise<{ response: Response; finalUrl: string } | null> {
  let url = rawUrl;
  for (let i = 0; i <= maxRedirects; i++) {
    if (!isSafePublicUrl(url)) return null;
    const response = await fetch(url, {
      signal,
      headers,
      redirect: "manual",
    });
    if (response.status >= 300 && response.status < 400) {
      const loc = response.headers.get("location");
      if (!loc) return { response, finalUrl: url };
      await response.body?.cancel().catch(() => {}); // libère le corps de la redirection
      try {
        url = new URL(loc, url).toString();
      } catch {
        return null;
      }
      continue;
    }
    return { response, finalUrl: url };
  }
  return null; // trop de redirections
}
