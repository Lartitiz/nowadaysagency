/**
 * Feature flags pour masquer/afficher des modules.
 * Les modules "hidden" sont invisibles dans la navigation et le dashboard
 * SAUF pour les admin qui voient tout avec un badge "Masqué".
 */

export interface ModuleFlag {
  id: string;
  label: string;
  /** Si false : masqué pour les utilisateur·ices, visible pour admin uniquement */
  enabled: boolean;
  /** Routes associées (préfixes) */
  routes: string[];
}

export const MODULE_FLAGS: ModuleFlag[] = [
  { id: "site",       label: "Site Web",    enabled: false, routes: ["/site"] },
  { id: "seo",        label: "SEO",         enabled: false, routes: ["/seo"] },
  { id: "pinterest",  label: "Pinterest",   enabled: false, routes: ["/pinterest"] },
  { id: "communaute", label: "Communauté",  enabled: false, routes: ["/communaute"] },
  { id: "lives",      label: "Lives",       enabled: false, routes: ["/lives"] },
];

/**
 * Vérifie si un module est visible pour l'utilisateur·ice.
 * Admin voit tout, les autres ne voient que les modules enabled.
 */
export function isModuleVisible(moduleId: string, isAdmin: boolean): boolean {
  const flag = MODULE_FLAGS.find(f => f.id === moduleId);
  if (!flag) return true;
  return flag.enabled || isAdmin;
}

/**
 * Vérifie si une route est accessible.
 */
export function isRouteVisible(path: string, isAdmin: boolean): boolean {
  const flag = MODULE_FLAGS.find(f => f.routes.some(r => path.startsWith(r)));
  if (!flag) return true;
  return flag.enabled || isAdmin;
}

/**
 * Vérifie si un module est masqué (pour afficher le badge admin)
 */
export function isModuleHidden(moduleId: string): boolean {
  const flag = MODULE_FLAGS.find(f => f.id === moduleId);
  return flag ? !flag.enabled : false;
}
