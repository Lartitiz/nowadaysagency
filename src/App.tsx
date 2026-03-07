import { useEffect, lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation, useSearchParams, Outlet } from "react-router-dom";

import { AuthProvider } from "@/contexts/AuthContext";
import { WorkspaceProvider } from "@/contexts/WorkspaceContext";
import { DemoProvider } from "@/contexts/DemoContext";
const DemoBanner = lazy(() => import("@/components/demo/DemoBanner"));
import { ErrorBoundary } from "@/components/ErrorBoundary";
import SelectionMenuProvider from "@/components/SelectionMenuProvider";
import { SessionProvider } from "@/contexts/SessionContext";
import { useOnlineStatus } from "@/hooks/use-online-status";
const SessionOverlay = lazy(() => import("@/components/session/SessionOverlay"));
const AiDebugShortcut = lazy(() => import("@/components/admin/AiDebugShortcut"));

const AppSidebar = lazy(() => import("./components/AppSidebar"));
const CoachChat = lazy(() => import("./components/coach/CoachChat"));
const BetaFeedbackWidget = lazy(() => import("./components/feedback/BetaFeedbackWidget"));
const LandingPage = lazy(() => import("./pages/LandingPage"));
const LoginPage = lazy(() => import("./pages/LoginPage"));
const NotFound = lazy(() => import("./pages/NotFound"));
import ProtectedRoute from "./components/ProtectedRoute";
import AdminRoute from "./components/AdminRoute";

// Lazy-loaded pages
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const Onboarding = lazy(() => import("./pages/Onboarding"));
const WelcomePage = lazy(() => import("./pages/WelcomePage"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const AdaptiveHome = lazy(() => import("./pages/AdaptiveHome"));

const ChatGuidePage = lazy(() => import("./pages/ChatGuidePage"));

const Profile = lazy(() => import("./pages/Profile"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const OrganizationHub = lazy(() => import("./pages/OrganizationHub"));
const BrandingPage = lazy(() => import("./pages/BrandingPage"));
const StorytellingEditPage = lazy(() => import("./pages/StorytellingEditPage"));
const InstagramHub = lazy(() => import("./pages/InstagramHub"));
const InstagramProfile = lazy(() => import("./pages/InstagramProfile"));
const InstagramAudit = lazy(() => import("./pages/InstagramAudit"));
const InstagramBio = lazy(() => import("./pages/InstagramBio"));
const InstagramHighlights = lazy(() => import("./pages/InstagramHighlights"));
const InstagramProfileNom = lazy(() => import("./pages/InstagramProfileNom"));
const InstagramProfileEpingles = lazy(() => import("./pages/InstagramProfileEpingles"));
const InstagramProfileFeed = lazy(() => import("./pages/InstagramProfileFeed"));
const InstagramProfileEdito = lazy(() => import("./pages/InstagramProfileEdito"));
const InstagramInspirer = lazy(() => import("./pages/InstagramInspirer"));
const InstagramLaunch = lazy(() => import("./pages/InstagramLaunch"));
const InstagramLaunchPlan = lazy(() => import("./pages/InstagramLaunchPlan"));
const InstagramLaunchRecommendation = lazy(() => import("./pages/InstagramLaunchRecommendation"));
const InstagramRythme = lazy(() => import("./pages/InstagramRythme"));
const InstagramEngagement = lazy(() => import("./pages/InstagramEngagement"));
const InstagramStats = lazy(() => import("./pages/InstagramStats"));
const CreerUnifie = lazy(() => import("./pages/CreerUnifie"));
const PropositionRecapPage = lazy(() => import("./pages/PropositionRecapPage"));
const OffersPage = lazy(() => import("./pages/OffersPage"));
const ConnectionCheckPage = lazy(() => import("./pages/ConnectionCheckPage"));
const OfferWorkshopPage = lazy(() => import("./pages/OfferWorkshopPage"));
const LinkedInHub = lazy(() => import("./pages/LinkedInHub"));
const LinkedInAudit = lazy(() => import("./pages/LinkedInAudit"));
const LinkedInProfil = lazy(() => import("./pages/LinkedInProfil"));
const LinkedInResume = lazy(() => import("./pages/LinkedInResume"));
const LinkedInParcours = lazy(() => import("./pages/LinkedInParcours"));
const LinkedInRecommandations = lazy(() => import("./pages/LinkedInRecommandations"));
const LinkedInEngagement = lazy(() => import("./pages/LinkedInEngagement"));
const PinterestHub = lazy(() => import("./pages/PinterestHub"));
const PinterestCompte = lazy(() => import("./pages/PinterestCompte"));
const PinterestTableaux = lazy(() => import("./pages/PinterestTableaux"));
const PinterestMotsCles = lazy(() => import("./pages/PinterestMotsCles"));
const PinterestEpingles = lazy(() => import("./pages/PinterestEpingles"));
const PinterestRoutine = lazy(() => import("./pages/PinterestRoutine"));
const SiteHub = lazy(() => import("./pages/SiteHub"));
const SeoHub = lazy(() => import("./pages/SeoHub"));
const SeoEmbed = lazy(() => import("./pages/SeoEmbed"));
const SiteAccueil = lazy(() => import("./pages/SiteAccueil"));
const SiteAccueilRecap = lazy(() => import("./pages/SiteAccueilRecap"));
const SiteAPropos = lazy(() => import("./pages/SiteAPropos"));
const SiteTestimonials = lazy(() => import("./pages/SiteTestimonials"));
const SiteCapturePage = lazy(() => import("./pages/SiteCapturePage"));
const SiteAuditPage = lazy(() => import("./pages/SiteAuditPage"));
const SiteInspirationsPage = lazy(() => import("./pages/SiteInspirationsPage"));
const SiteInspirationGeneratorPage = lazy(() => import("./pages/SiteInspirationGeneratorPage"));
const SalesPageOptimizer = lazy(() => import("./pages/SalesPageOptimizer"));
const LegalAiPage = lazy(() => import("./pages/LegalAiPage"));
const MentionsLegalesPage = lazy(() => import("./pages/MentionsLegalesPage"));
const ConfidentialitePage = lazy(() => import("./pages/ConfidentialitePage"));
const CguCgvPage = lazy(() => import("./pages/CguCgvPage"));
const UnsubscribePage = lazy(() => import("./pages/UnsubscribePage"));
const PaymentSuccessPage = lazy(() => import("./pages/PaymentSuccessPage"));

const PricingPage = lazy(() => import("./pages/PricingPage"));
const BinomeSalesPage = lazy(() => import("./pages/BinomeSalesPage"));
const ServicesPage = lazy(() => import("./pages/ServicesPage"));
const BinomeDashboard = lazy(() => import("./pages/BinomeDashboard"));
const LivesPage = lazy(() => import("./pages/LivesPage"));
const CommunautePage = lazy(() => import("./pages/CommunautePage"));
const ContactsPage = lazy(() => import("./pages/ContactsPage"));
const BrandingAuditPage = lazy(() => import("./pages/BrandingAuditPage"));
const BrandingAuditResultPage = lazy(() => import("./pages/BrandingAuditResultPage"));
const AbonnementPage = lazy(() => import("./pages/AbonnementPage"));
const AccompagnementPage = lazy(() => import("./pages/AccompagnementPage"));
const AdminCoachingPage = lazy(() => import("./pages/AdminCoachingPage"));
const AdminAuditPage = lazy(() => import("./pages/AdminAuditPage"));
const AdminToolsPage = lazy(() => import("./pages/AdminToolsPage"));


const BrandingCoachingPage = lazy(() => import("./pages/BrandingCoachingPage"));
const BrandingSectionPage = lazy(() => import("./pages/BrandingSectionPage"));
const IntakePage = lazy(() => import("./pages/IntakePage"));
const LinkedInPostGenerator = lazy(() => import("./pages/LinkedInPostGenerator"));
const LinkedInCommentStrategy = lazy(() => import("./pages/LinkedInCommentStrategy"));
const LinkedInCrosspost = lazy(() => import("./pages/LinkedInCrosspost"));

const CheckoutBinomePage = lazy(() => import("./pages/CheckoutBinomePage"));
const InvitePage = lazy(() => import("./pages/InvitePage"));
const SharedBrandingPage = lazy(() => import("./pages/SharedBrandingPage"));
const SharedCalendarPage = lazy(() => import("./pages/SharedCalendarPage"));
const VoiceGuidePage = lazy(() => import("./pages/VoiceGuidePage"));
const BrandCharterPage = lazy(() => import("./pages/BrandCharterPage"));


const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const SuspenseFallback = () => (
  <div className="flex min-h-screen items-center justify-center bg-background">
    <div className="flex gap-1">
      <div className="h-3 w-3 rounded-full bg-primary animate-bounce-dot" />
      <div className="h-3 w-3 rounded-full bg-primary animate-bounce-dot" style={{ animationDelay: "0.16s" }} />
      <div className="h-3 w-3 rounded-full bg-primary animate-bounce-dot" style={{ animationDelay: "0.32s" }} />
    </div>
  </div>
);

const ErrorBoundaryLayout = () => <ErrorBoundary><Outlet /></ErrorBoundary>;

/** Redirect preserving existing query params and merging new ones */
function RedirectWithParams({ to, mergeParams }: { to: string; mergeParams?: Record<string, string> }) {
  const [searchParams] = useSearchParams();
  const [basePath, baseQuery] = to.split("?");
  const merged = new URLSearchParams(baseQuery || "");
  if (mergeParams) Object.entries(mergeParams).forEach(([k, v]) => merged.set(k, v));
  searchParams.forEach((v, k) => { if (!merged.has(k)) merged.set(k, v); });
  const qs = merged.toString();
  return <Navigate to={qs ? `${basePath}?${qs}` : basePath} replace />;
}

function SmartRedirect({ to, mergeParams }: { to: string; mergeParams?: Record<string, string> }) {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const [basePath, baseQuery] = to.split("?");
  const merged = new URLSearchParams(baseQuery || "");
  if (mergeParams) Object.entries(mergeParams).forEach(([k, v]) => merged.set(k, v));
  searchParams.forEach((v, k) => { if (!merged.has(k)) merged.set(k, v); });
  const qs = merged.toString();
  return <Navigate to={qs ? `${basePath}?${qs}` : basePath} replace state={location.state} />;
}

const PUBLIC_PATHS = ["/", "/login", "/connexion", "/reset-password", "/now-pilot", "/binome", "/pricing", "/services", "/share/branding", "/checkout/binome", "/unsubscribe"];

function AnimatedRoutes() {
  const location = useLocation();
  useOnlineStatus();
  const showAppWidgets = !PUBLIC_PATHS.includes(location.pathname) && !location.pathname.startsWith("/invite/") && !location.pathname.startsWith("/share/") && !location.pathname.startsWith("/calendrier/partage/");
  const showCoach = showAppWidgets && location.pathname !== "/onboarding" && location.pathname !== "/welcome";

  return (
    <>
      {showAppWidgets && <Suspense fallback={null}><DemoBanner /></Suspense>}
      <Suspense fallback={null}><SessionOverlay /></Suspense>
      <Suspense fallback={null}><AiDebugShortcut /></Suspense>
      
      {showAppWidgets && <Suspense fallback={null}><AppSidebar /></Suspense>}
      {/* BETA_MODE: replace CoachChat with BetaFeedbackWidget during beta */}
      {showCoach && <Suspense fallback={null}><BetaFeedbackWidget /></Suspense>}
      {/* {showCoach && <Suspense fallback={null}><CoachChat /></Suspense>} */}
      <div key={location.pathname} className="animate-page-fade">
          <Suspense fallback={<SuspenseFallback />}>
            <Routes location={location}>
              <Route path="/" element={<LandingPage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/connexion" element={<LoginPage />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/now-studio" element={<Navigate to="/binome" replace />} />
              <Route path="/onboarding" element={<ProtectedRoute><Onboarding /></ProtectedRoute>} />
              <Route path="/welcome" element={<ProtectedRoute><WelcomePage /></ProtectedRoute>} />
              <Route path="/dashboard" element={<ProtectedRoute><AdaptiveHome /></ProtectedRoute>} />
              <Route path="/dashboard/guide" element={<ProtectedRoute><ChatGuidePage /></ProtectedRoute>} />
              <Route path="/dashboard/complet" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
              <Route path="/idees" element={<RedirectWithParams to="/calendrier" mergeParams={{ tab: "idees" }} />} />
              <Route element={<ErrorBoundaryLayout />}>
                <Route path="/branding" element={<ProtectedRoute><BrandingPage /></ProtectedRoute>} />
                <Route path="/branding/audit" element={<ProtectedRoute><BrandingAuditPage /></ProtectedRoute>} />
                <Route path="/branding/audit/:id" element={<ProtectedRoute><BrandingAuditResultPage /></ProtectedRoute>} />
                <Route path="/branding/ton" element={<Navigate to="/branding/section?section=tone_style" replace />} />
                <Route path="/branding/ton/recap" element={<Navigate to="/branding/section?section=tone_style&tab=synthese" replace />} />
                <Route path="/branding/storytelling" element={<Navigate to="/branding/section?section=story" replace />} />
                <Route path="/branding/storytelling/new" element={<Navigate to="/branding/coaching?section=story" replace />} />
                <Route path="/branding/storytelling/import" element={<Navigate to="/branding/section?section=story" replace />} />
                <Route path="/branding/storytelling/:id" element={<Navigate to="/branding/section?section=story" replace />} />
                <Route path="/branding/storytelling/:id/recap" element={<Navigate to="/branding/section?section=story&tab=synthese" replace />} />
                <Route path="/branding/storytelling/:id/edit" element={<ProtectedRoute><StorytellingEditPage /></ProtectedRoute>} />
                <Route path="/branding/storytelling/recap" element={<Navigate to="/branding/section?section=story&tab=synthese" replace />} />
                <Route path="/branding/persona" element={<Navigate to="/branding/section?section=persona" replace />} />
                <Route path="/branding/persona/recap" element={<Navigate to="/branding/section?section=persona&tab=synthese" replace />} />
                <Route path="/branding/proposition" element={<Navigate to="/branding/proposition/recap" replace />} />
                <Route path="/branding/proposition/recap" element={<ProtectedRoute><PropositionRecapPage /></ProtectedRoute>} />
                <Route path="/branding/niche" element={<Navigate to="/branding/section?section=tone_style" replace />} />
                <Route path="/branding/niche/recap" element={<Navigate to="/branding/section?section=tone_style" replace />} />
                <Route path="/branding/strategie" element={<Navigate to="/branding/section?section=content_strategy" replace />} />
                <Route path="/branding/strategie/recap" element={<Navigate to="/branding/section?section=content_strategy&tab=synthese" replace />} />
                <Route path="/branding/offres" element={<ProtectedRoute><OffersPage /></ProtectedRoute>} />
                <Route path="/branding/offres/:id" element={<ProtectedRoute><OfferWorkshopPage /></ProtectedRoute>} />
                <Route path="/branding/coaching" element={<ProtectedRoute><BrandingCoachingPage /></ProtectedRoute>} />
                <Route path="/branding/section" element={<ProtectedRoute><BrandingSectionPage /></ProtectedRoute>} />
                <Route path="/branding/voice-guide" element={<ProtectedRoute><VoiceGuidePage /></ProtectedRoute>} />
                <Route path="/branding/charter" element={<ProtectedRoute><BrandCharterPage /></ProtectedRoute>} />
              </Route>
              <Route path="/intake" element={<IntakePage />} />
              <Route path="/plan" element={<RedirectWithParams to="/calendrier" mergeParams={{ tab: "strategie" }} />} />
              <Route path="/mon-plan" element={<RedirectWithParams to="/calendrier" mergeParams={{ tab: "strategie" }} />} />
              <Route path="/pricing" element={<PricingPage />} />
              <Route path="/studio" element={<Navigate to="/binome" replace />} />
              <Route path="/services" element={<ServicesPage />} />
              <Route path="/lives" element={<ProtectedRoute><LivesPage /></ProtectedRoute>} />
              <Route path="/communaute" element={<ProtectedRoute><CommunautePage /></ProtectedRoute>} />
              <Route path="/contacts" element={<ProtectedRoute><ContactsPage /></ProtectedRoute>} />
              <Route path="/profil" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
              <Route path="/parametres" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
              <Route path="/parametres/connexions" element={<ProtectedRoute><ConnectionCheckPage /></ProtectedRoute>} />
              <Route path="/abonnement" element={<ProtectedRoute><AbonnementPage /></ProtectedRoute>} />
              <Route path="/accompagnement" element={<ProtectedRoute><AccompagnementPage /></ProtectedRoute>} />
              <Route path="/admin/coaching" element={<AdminRoute><AdminCoachingPage /></AdminRoute>} />
              <Route path="/clients" element={<Navigate to="/admin/coaching" replace />} />
              <Route path="/admin/audit" element={<AdminRoute><AdminAuditPage /></AdminRoute>} />
              <Route path="/admin/tools" element={<AdminRoute><AdminToolsPage /></AdminRoute>} />
              <Route path="/admin/analytics" element={<Navigate to="/admin/coaching" replace />} />
              <Route path="/now-pilot" element={<Navigate to="/binome" replace />} />
              <Route path="/now-studio" element={<Navigate to="/binome" replace />} />
              <Route path="/binome" element={<BinomeSalesPage />} />
              <Route path="/legal-ia" element={<ProtectedRoute><LegalAiPage /></ProtectedRoute>} />
              <Route path="/mentions-legales" element={<MentionsLegalesPage />} />
              <Route path="/confidentialite" element={<ConfidentialitePage />} />
              <Route path="/cgu-cgv" element={<CguCgvPage />} />
              <Route path="/checkout/binome" element={<CheckoutBinomePage />} />
              <Route path="/payment/success" element={<PaymentSuccessPage />} />
              <Route path="/unsubscribe" element={<UnsubscribePage />} />
              <Route path="/invite/:token" element={<InvitePage />} />
              <Route path="/share/branding/:token" element={<SharedBrandingPage />} />
              <Route path="/calendrier/partage/:token" element={<SharedCalendarPage />} />
              <Route element={<ErrorBoundaryLayout />}>
                <Route path="/instagram" element={<ProtectedRoute><InstagramHub /></ProtectedRoute>} />
                <Route path="/instagram/profil" element={<ProtectedRoute><InstagramProfile /></ProtectedRoute>} />
                <Route path="/instagram/stats" element={<ProtectedRoute><InstagramStats /></ProtectedRoute>} />
                <Route path="/instagram/audit" element={<ProtectedRoute><InstagramAudit /></ProtectedRoute>} />
                <Route path="/instagram/profil/audit" element={<Navigate to="/instagram/audit" replace />} />
                <Route path="/instagram/profil/nom" element={<ProtectedRoute><InstagramProfileNom /></ProtectedRoute>} />
                <Route path="/instagram/profil/bio" element={<ProtectedRoute><InstagramBio /></ProtectedRoute>} />
                <Route path="/instagram/profil/stories" element={<ProtectedRoute><InstagramHighlights /></ProtectedRoute>} />
                <Route path="/instagram/profil/epingles" element={<ProtectedRoute><InstagramProfileEpingles /></ProtectedRoute>} />
                <Route path="/instagram/profil/feed" element={<ProtectedRoute><InstagramProfileFeed /></ProtectedRoute>} />
                <Route path="/instagram/profil/edito" element={<ProtectedRoute><InstagramProfileEdito /></ProtectedRoute>} />
                <Route path="/instagram/inspirer" element={<Navigate to="/creer?mode=transform" replace />} />
                <Route path="/instagram/lancement" element={<ProtectedRoute><InstagramLaunch /></ProtectedRoute>} />
                <Route path="/instagram/lancement/plan" element={<ProtectedRoute><InstagramLaunchPlan /></ProtectedRoute>} />
                <Route path="/instagram/lancement/recommandation" element={<ProtectedRoute><InstagramLaunchRecommendation /></ProtectedRoute>} />
                <Route path="/instagram/rythme" element={<ProtectedRoute><InstagramRythme /></ProtectedRoute>} />
                <Route path="/instagram/routine" element={<ProtectedRoute><InstagramEngagement /></ProtectedRoute>} />
                <Route path="/instagram/engagement" element={<Navigate to="/instagram/routine" replace />} />
                <Route path="/instagram/stories" element={<SmartRedirect to="/creer" mergeParams={{ format: "story" }} />} />
                <Route path="/instagram/reels" element={<SmartRedirect to="/creer" mergeParams={{ format: "reel" }} />} />
                <Route path="/transformer" element={<Navigate to="/creer?mode=transform" replace />} />
                <Route path="/creer" element={<ProtectedRoute><CreerUnifie /></ProtectedRoute>} />
                <Route path="/creer-legacy" element={<Navigate to="/creer" replace />} />
                <Route path="/instagram/creer" element={<Navigate to="/creer" replace />} />
                <Route path="/instagram/carousel" element={<SmartRedirect to="/creer" mergeParams={{ format: "carousel" }} />} />
                {/* Redirects from old routes */}
                <Route path="/instagram/bio" element={<Navigate to="/instagram/profil/bio" replace />} />
                <Route path="/instagram/highlights" element={<Navigate to="/instagram/profil/stories" replace />} />
                <Route path="/instagram/inspiration" element={<Navigate to="/instagram/inspirer" replace />} />
              </Route>
              {/* Transversal routes */}
              <Route path="/atelier" element={<SmartRedirect to="/creer" />} />
              <Route path="/atelier/rediger" element={<SmartRedirect to="/creer" />} />
              {/* LinkedIn module */}
              <Route path="/linkedin" element={<ProtectedRoute><LinkedInHub /></ProtectedRoute>} />
              <Route path="/linkedin/audit" element={<ProtectedRoute><LinkedInAudit /></ProtectedRoute>} />
              <Route path="/linkedin/profil" element={<ProtectedRoute><LinkedInProfil /></ProtectedRoute>} />
              <Route path="/linkedin/resume" element={<ProtectedRoute><LinkedInResume /></ProtectedRoute>} />
              <Route path="/linkedin/parcours" element={<ProtectedRoute><LinkedInParcours /></ProtectedRoute>} />
              <Route path="/linkedin/recommandations" element={<ProtectedRoute><LinkedInRecommandations /></ProtectedRoute>} />
              <Route path="/linkedin/engagement" element={<ProtectedRoute><LinkedInEngagement /></ProtectedRoute>} />
              <Route path="/linkedin/post" element={<ProtectedRoute><LinkedInPostGenerator /></ProtectedRoute>} />
              <Route path="/linkedin/comment-strategy" element={<ProtectedRoute><LinkedInCommentStrategy /></ProtectedRoute>} />
              <Route path="/linkedin/crosspost" element={<ProtectedRoute><LinkedInCrosspost /></ProtectedRoute>} />
              {/* Pinterest module */}
              <Route path="/pinterest" element={<ProtectedRoute><PinterestHub /></ProtectedRoute>} />
              <Route path="/pinterest/compte" element={<ProtectedRoute><PinterestCompte /></ProtectedRoute>} />
              <Route path="/pinterest/tableaux" element={<ProtectedRoute><PinterestTableaux /></ProtectedRoute>} />
              <Route path="/pinterest/mots-cles" element={<ProtectedRoute><PinterestMotsCles /></ProtectedRoute>} />
              <Route path="/pinterest/epingles" element={<ProtectedRoute><PinterestEpingles /></ProtectedRoute>} />
              <Route path="/pinterest/routine" element={<ProtectedRoute><PinterestRoutine /></ProtectedRoute>} />
              <Route element={<ErrorBoundaryLayout />}>
                <Route path="/calendrier" element={<ProtectedRoute><OrganizationHub /></ProtectedRoute>} />
              </Route>
              {/* Site Web module */}
              <Route path="/site" element={<ProtectedRoute><SiteHub /></ProtectedRoute>} />
              <Route path="/seo" element={<ProtectedRoute><SeoHub /></ProtectedRoute>} />
              <Route path="/seo/:tool" element={<ProtectedRoute><SeoEmbed /></ProtectedRoute>} />
              <Route path="/site/accueil" element={<ProtectedRoute><SiteAccueil /></ProtectedRoute>} />
              <Route path="/site/accueil/recap" element={<ProtectedRoute><SiteAccueilRecap /></ProtectedRoute>} />
              <Route path="/site/a-propos" element={<ProtectedRoute><SiteAPropos /></ProtectedRoute>} />
              <Route path="/site/temoignages" element={<ProtectedRoute><SiteTestimonials /></ProtectedRoute>} />
              <Route path="/site/capture" element={<ProtectedRoute><SiteCapturePage /></ProtectedRoute>} />
              <Route path="/site/audit" element={<ProtectedRoute><SiteAuditPage /></ProtectedRoute>} />
              <Route path="/site/inspirations" element={<ProtectedRoute><SiteInspirationsPage /></ProtectedRoute>} />
              <Route path="/site/inspirations/:sectionType" element={<ProtectedRoute><SiteInspirationGeneratorPage /></ProtectedRoute>} />
              <Route path="/site/optimiser" element={<ProtectedRoute><SalesPageOptimizer /></ProtectedRoute>} />
              {/* Redirects from old routes */}
              <Route path="/instagram/idees" element={<RedirectWithParams to="/calendrier" mergeParams={{ tab: "idees", canal: "instagram" }} />} />
              <Route path="/instagram/calendrier" element={<Navigate to="/calendrier?canal=instagram" replace />} />
              <Route path="/instagram/atelier" element={<Navigate to="/atelier?canal=instagram" replace />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
      </div>
    </>
  );
}

const App = () => {
  useEffect(() => {
    window.dispatchEvent(new Event('app-ready'));
  }, []);

  function ScrollToTop() {
    const { pathname } = useLocation();
    useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
    return null;
  }

  return (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <ScrollToTop />
        <ErrorBoundary>
        <DemoProvider>
          <AuthProvider>
            <WorkspaceProvider>
            <SessionProvider>
            <SelectionMenuProvider>
            <AnimatedRoutes />
            </SelectionMenuProvider>
            </SessionProvider>
            </WorkspaceProvider>
          </AuthProvider>
        </DemoProvider>
        </ErrorBoundary>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
  );
};

export default App;
