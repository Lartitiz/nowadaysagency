import { useEffect, lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { AuthProvider } from "@/contexts/AuthContext";
import { WorkspaceProvider } from "@/contexts/WorkspaceContext";
import { DemoProvider } from "@/contexts/DemoContext";
import DemoBanner from "@/components/demo/DemoBanner";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import SelectionMenuProvider from "@/components/SelectionMenuProvider";
import { SessionProvider } from "@/contexts/SessionContext";
import SessionOverlay from "@/components/session/SessionOverlay";
import AiDebugShortcut from "@/components/admin/AiDebugShortcut";
import AssistantButton from "./components/assistant/AssistantButton";
import LandingPage from "./pages/LandingPage";
import LoginPage from "./pages/LoginPage";
import NotFound from "./pages/NotFound";
import ProtectedRoute from "./components/ProtectedRoute";

// Lazy-loaded pages
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const Onboarding = lazy(() => import("./pages/Onboarding"));
const WelcomePage = lazy(() => import("./pages/WelcomePage"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const IdeasPage = lazy(() => import("./pages/IdeasPage"));
const Profile = lazy(() => import("./pages/Profile"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const Calendar = lazy(() => import("./pages/Calendar"));
const CommPlanPage = lazy(() => import("./pages/CommPlanPage"));
const PlanPage = lazy(() => import("./pages/PlanPage"));
const BrandingPage = lazy(() => import("./pages/BrandingPage"));
const TonStylePage = lazy(() => import("./pages/TonStylePage"));
const TonStyleRecapPage = lazy(() => import("./pages/TonStyleRecapPage"));
const StorytellingPage = lazy(() => import("./pages/StorytellingPage"));
const StorytellingRecapPage = lazy(() => import("./pages/StorytellingRecapPage"));
const StorytellingListPage = lazy(() => import("./pages/StorytellingListPage"));
const StorytellingImportPage = lazy(() => import("./pages/StorytellingImportPage"));
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
const InstagramStories = lazy(() => import("./pages/InstagramStories"));
const InstagramReels = lazy(() => import("./pages/InstagramReels"));
const InstagramCreer = lazy(() => import("./pages/InstagramCreer"));
const InstagramCarousel = lazy(() => import("./pages/InstagramCarousel"));
const AtelierPage = lazy(() => import("./pages/AtelierPage"));
const RedactionPage = lazy(() => import("./pages/RedactionPage"));
const PersonaPage = lazy(() => import("./pages/PersonaPage"));
const PersonaRecapPage = lazy(() => import("./pages/PersonaRecapPage"));
const PropositionPage = lazy(() => import("./pages/PropositionPage"));
const PropositionRecapPage = lazy(() => import("./pages/PropositionRecapPage"));
const StrategiePage = lazy(() => import("./pages/StrategiePage"));
const StrategieRecapPage = lazy(() => import("./pages/StrategieRecapPage"));
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
const SiteAccueil = lazy(() => import("./pages/SiteAccueil"));
const SiteAccueilRecap = lazy(() => import("./pages/SiteAccueilRecap"));
const SiteAPropos = lazy(() => import("./pages/SiteAPropos"));
const SiteTestimonials = lazy(() => import("./pages/SiteTestimonials"));
const SiteCapturePage = lazy(() => import("./pages/SiteCapturePage"));
const LegalAiPage = lazy(() => import("./pages/LegalAiPage"));
const PaymentSuccessPage = lazy(() => import("./pages/PaymentSuccessPage"));
const ClientsPage = lazy(() => import("./pages/ClientsPage"));
const PricingPage = lazy(() => import("./pages/PricingPage"));
const NowStudioSalesPage = lazy(() => import("./pages/NowStudioSalesPage"));
const ServicesPage = lazy(() => import("./pages/ServicesPage"));
const StudioDashboard = lazy(() => import("./pages/StudioDashboard"));
const LivesPage = lazy(() => import("./pages/LivesPage"));
const CommunautePage = lazy(() => import("./pages/CommunautePage"));
const ContactsPage = lazy(() => import("./pages/ContactsPage"));
const BrandingAuditPage = lazy(() => import("./pages/BrandingAuditPage"));
const BrandingAuditResultPage = lazy(() => import("./pages/BrandingAuditResultPage"));
const AbonnementPage = lazy(() => import("./pages/AbonnementPage"));
const AccompagnementPage = lazy(() => import("./pages/AccompagnementPage"));
const AdminCoachingPage = lazy(() => import("./pages/AdminCoachingPage"));
const AdminAuditPage = lazy(() => import("./pages/AdminAuditPage"));

const NowPilotPage = lazy(() => import("./pages/NowPilotPage"));
const BrandingCoachingPage = lazy(() => import("./pages/BrandingCoachingPage"));
const BrandingSectionPage = lazy(() => import("./pages/BrandingSectionPage"));
const IntakePage = lazy(() => import("./pages/IntakePage"));
const LinkedInPostGenerator = lazy(() => import("./pages/LinkedInPostGenerator"));
const LinkedInCommentStrategy = lazy(() => import("./pages/LinkedInCommentStrategy"));
const LinkedInCrosspost = lazy(() => import("./pages/LinkedInCrosspost"));
const InstagramInspiration = lazy(() => import("./pages/InstagramInspiration"));
const InvitePage = lazy(() => import("./pages/InvitePage"));

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

const PUBLIC_PATHS = ["/", "/login", "/connexion", "/reset-password", "/now-pilot", "/pricing", "/services", "/studio/discover"];

function AnimatedRoutes() {
  const location = useLocation();
  const showAppWidgets = !PUBLIC_PATHS.includes(location.pathname) && !location.pathname.startsWith("/invite/");

  return (
    <>
      {showAppWidgets && <DemoBanner />}
      <SessionOverlay />
      <AiDebugShortcut />
      {showAppWidgets && <AssistantButton />}
      <AnimatePresence mode="popLayout">
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.1, ease: "easeInOut" }}
        >
          <Suspense fallback={<SuspenseFallback />}>
            <Routes location={location}>
              <Route path="/" element={<LandingPage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/connexion" element={<LoginPage />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/now-studio" element={<Navigate to="/studio/discover" replace />} />
              <Route path="/onboarding" element={<ProtectedRoute><Onboarding /></ProtectedRoute>} />
              <Route path="/welcome" element={<ProtectedRoute><WelcomePage /></ProtectedRoute>} />
              <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
              <Route path="/idees" element={<ProtectedRoute><IdeasPage /></ProtectedRoute>} />
              <Route path="/branding" element={<ProtectedRoute><BrandingPage /></ProtectedRoute>} />
              <Route path="/branding/audit" element={<ProtectedRoute><BrandingAuditPage /></ProtectedRoute>} />
              <Route path="/branding/audit/:id" element={<ProtectedRoute><BrandingAuditResultPage /></ProtectedRoute>} />
              <Route path="/branding/ton" element={<ProtectedRoute><TonStylePage /></ProtectedRoute>} />
              <Route path="/branding/ton/recap" element={<ProtectedRoute><TonStyleRecapPage /></ProtectedRoute>} />
              <Route path="/branding/storytelling" element={<ProtectedRoute><StorytellingListPage /></ProtectedRoute>} />
              <Route path="/branding/storytelling/new" element={<ProtectedRoute><StorytellingPage /></ProtectedRoute>} />
              <Route path="/branding/storytelling/import" element={<ProtectedRoute><StorytellingImportPage /></ProtectedRoute>} />
              <Route path="/branding/storytelling/:id" element={<ProtectedRoute><StorytellingPage /></ProtectedRoute>} />
              <Route path="/branding/storytelling/:id/recap" element={<ProtectedRoute><StorytellingRecapPage /></ProtectedRoute>} />
              <Route path="/branding/storytelling/:id/edit" element={<ProtectedRoute><StorytellingEditPage /></ProtectedRoute>} />
              <Route path="/branding/storytelling/recap" element={<ProtectedRoute><StorytellingRecapPage /></ProtectedRoute>} />
              <Route path="/branding/persona" element={<ProtectedRoute><PersonaPage /></ProtectedRoute>} />
              <Route path="/branding/persona/recap" element={<ProtectedRoute><PersonaRecapPage /></ProtectedRoute>} />
              <Route path="/branding/proposition" element={<ProtectedRoute><PropositionPage /></ProtectedRoute>} />
              <Route path="/branding/proposition/recap" element={<ProtectedRoute><PropositionRecapPage /></ProtectedRoute>} />
              <Route path="/branding/niche" element={<Navigate to="/branding/ton" replace />} />
              <Route path="/branding/niche/recap" element={<Navigate to="/branding/ton" replace />} />
              <Route path="/branding/strategie" element={<ProtectedRoute><StrategiePage /></ProtectedRoute>} />
              <Route path="/branding/strategie/recap" element={<ProtectedRoute><StrategieRecapPage /></ProtectedRoute>} />
              <Route path="/branding/offres" element={<ProtectedRoute><OffersPage /></ProtectedRoute>} />
              <Route path="/branding/offres/:id" element={<ProtectedRoute><OfferWorkshopPage /></ProtectedRoute>} />
              <Route path="/branding/coaching" element={<ProtectedRoute><BrandingCoachingPage /></ProtectedRoute>} />
              <Route path="/branding/section" element={<ProtectedRoute><BrandingSectionPage /></ProtectedRoute>} />
              <Route path="/intake" element={<IntakePage />} />
              <Route path="/plan" element={<ProtectedRoute><PlanPage /></ProtectedRoute>} />
              <Route path="/mon-plan" element={<ProtectedRoute><CommPlanPage /></ProtectedRoute>} />
              <Route path="/pricing" element={<PricingPage />} />
              <Route path="/studio" element={<ProtectedRoute><StudioDashboard /></ProtectedRoute>} />
              <Route path="/studio/discover" element={<NowStudioSalesPage />} />
              <Route path="/services" element={<ServicesPage />} />
              <Route path="/lives" element={<ProtectedRoute><LivesPage /></ProtectedRoute>} />
              <Route path="/communaute" element={<ProtectedRoute><CommunautePage /></ProtectedRoute>} />
              <Route path="/contacts" element={<ProtectedRoute><ContactsPage /></ProtectedRoute>} />
              <Route path="/profil" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
              <Route path="/parametres" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
              <Route path="/parametres/connexions" element={<ProtectedRoute><ConnectionCheckPage /></ProtectedRoute>} />
              <Route path="/abonnement" element={<ProtectedRoute><AbonnementPage /></ProtectedRoute>} />
              <Route path="/accompagnement" element={<ProtectedRoute><AccompagnementPage /></ProtectedRoute>} />
              <Route path="/admin/coaching" element={<ProtectedRoute><AdminCoachingPage /></ProtectedRoute>} />
              <Route path="/clients" element={<Navigate to="/admin/coaching" replace />} />
              <Route path="/admin/audit" element={<ProtectedRoute><AdminAuditPage /></ProtectedRoute>} />
              <Route path="/admin/analytics" element={<Navigate to="/admin/coaching" replace />} />
              <Route path="/now-pilot" element={<NowPilotPage />} />
              <Route path="/legal-ia" element={<ProtectedRoute><LegalAiPage /></ProtectedRoute>} />
              <Route path="/payment/success" element={<PaymentSuccessPage />} />
              <Route path="/invite/:token" element={<InvitePage />} />
              {/* Instagram module */}
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
              <Route path="/instagram/inspirer" element={<ProtectedRoute><InstagramInspirer /></ProtectedRoute>} />
              <Route path="/instagram/lancement" element={<ProtectedRoute><InstagramLaunch /></ProtectedRoute>} />
              <Route path="/instagram/lancement/plan" element={<ProtectedRoute><InstagramLaunchPlan /></ProtectedRoute>} />
              <Route path="/instagram/lancement/recommandation" element={<ProtectedRoute><InstagramLaunchRecommendation /></ProtectedRoute>} />
              <Route path="/instagram/rythme" element={<ProtectedRoute><InstagramRythme /></ProtectedRoute>} />
              <Route path="/instagram/routine" element={<ProtectedRoute><InstagramEngagement /></ProtectedRoute>} />
              <Route path="/instagram/engagement" element={<Navigate to="/instagram/routine" replace />} />
              <Route path="/instagram/stories" element={<ProtectedRoute><InstagramStories /></ProtectedRoute>} />
              <Route path="/instagram/reels" element={<ProtectedRoute><InstagramReels /></ProtectedRoute>} />
              <Route path="/instagram/creer" element={<ProtectedRoute><InstagramCreer /></ProtectedRoute>} />
              <Route path="/instagram/carousel" element={<ProtectedRoute><InstagramCarousel /></ProtectedRoute>} />
              {/* Redirects from old routes */}
              <Route path="/instagram/bio" element={<Navigate to="/instagram/profil/bio" replace />} />
              <Route path="/instagram/highlights" element={<Navigate to="/instagram/profil/stories" replace />} />
              <Route path="/instagram/inspiration" element={<Navigate to="/instagram/inspirer" replace />} />
              {/* Transversal routes */}
              <Route path="/atelier" element={<ProtectedRoute><AtelierPage /></ProtectedRoute>} />
              <Route path="/atelier/rediger" element={<ProtectedRoute><RedactionPage /></ProtectedRoute>} />
              {/* LinkedIn module */}
              <Route path="/linkedin" element={<ProtectedRoute><LinkedInHub /></ProtectedRoute>} />
              <Route path="/linkedin/audit" element={<ProtectedRoute><LinkedInAudit /></ProtectedRoute>} />
              <Route path="/linkedin/profil" element={<ProtectedRoute><LinkedInProfil /></ProtectedRoute>} />
              <Route path="/linkedin/resume" element={<ProtectedRoute><LinkedInResume /></ProtectedRoute>} />
              <Route path="/linkedin/parcours" element={<ProtectedRoute><LinkedInParcours /></ProtectedRoute>} />
              <Route path="/linkedin/recommandations" element={<ProtectedRoute><LinkedInRecommandations /></ProtectedRoute>} />
              <Route path="/linkedin/engagement" element={<ProtectedRoute><LinkedInEngagement /></ProtectedRoute>} />
              {/* Pinterest module */}
              <Route path="/pinterest" element={<ProtectedRoute><PinterestHub /></ProtectedRoute>} />
              <Route path="/pinterest/compte" element={<ProtectedRoute><PinterestCompte /></ProtectedRoute>} />
              <Route path="/pinterest/tableaux" element={<ProtectedRoute><PinterestTableaux /></ProtectedRoute>} />
              <Route path="/pinterest/mots-cles" element={<ProtectedRoute><PinterestMotsCles /></ProtectedRoute>} />
              <Route path="/pinterest/epingles" element={<ProtectedRoute><PinterestEpingles /></ProtectedRoute>} />
              <Route path="/pinterest/routine" element={<ProtectedRoute><PinterestRoutine /></ProtectedRoute>} />
              <Route path="/calendrier" element={<ProtectedRoute><Calendar /></ProtectedRoute>} />
              {/* Site Web module */}
              <Route path="/site" element={<ProtectedRoute><SiteHub /></ProtectedRoute>} />
              <Route path="/site/accueil" element={<ProtectedRoute><SiteAccueil /></ProtectedRoute>} />
              <Route path="/site/accueil/recap" element={<ProtectedRoute><SiteAccueilRecap /></ProtectedRoute>} />
              <Route path="/site/a-propos" element={<ProtectedRoute><SiteAPropos /></ProtectedRoute>} />
              <Route path="/site/temoignages" element={<ProtectedRoute><SiteTestimonials /></ProtectedRoute>} />
              {/* Redirects from old routes */}
              <Route path="/instagram/idees" element={<Navigate to="/idees?canal=instagram" replace />} />
              <Route path="/instagram/calendrier" element={<Navigate to="/calendrier?canal=instagram" replace />} />
              <Route path="/instagram/atelier" element={<Navigate to="/atelier?canal=instagram" replace />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </motion.div>
      </AnimatePresence>
    </>
  );
}

const App = () => {
  useEffect(() => {
    window.dispatchEvent(new Event('app-ready'));
  }, []);

  return (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
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
