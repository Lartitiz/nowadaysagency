import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import LandingPage from "./pages/LandingPage";
import LoginPage from "./pages/LoginPage";
import ResetPassword from "./pages/ResetPassword";
import Onboarding from "./pages/Onboarding";
import Dashboard from "./pages/Dashboard";
import IdeasPage from "./pages/IdeasPage";
import Profile from "./pages/Profile";
import SettingsPage from "./pages/SettingsPage";
import Calendar from "./pages/Calendar";
import CommPlanPage from "./pages/CommPlanPage";
import PlanPage from "./pages/PlanPage";
import BrandingPage from "./pages/BrandingPage";
import TonStylePage from "./pages/TonStylePage";
import TonStyleRecapPage from "./pages/TonStyleRecapPage";
import StorytellingPage from "./pages/StorytellingPage";
import StorytellingRecapPage from "./pages/StorytellingRecapPage";
import StorytellingListPage from "./pages/StorytellingListPage";
import StorytellingImportPage from "./pages/StorytellingImportPage";
import StorytellingEditPage from "./pages/StorytellingEditPage";
import InstagramHub from "./pages/InstagramHub";
import InstagramProfile from "./pages/InstagramProfile";
import InstagramAudit from "./pages/InstagramAudit";
import InstagramBio from "./pages/InstagramBio";
import InstagramHighlights from "./pages/InstagramHighlights";
import InstagramProfileNom from "./pages/InstagramProfileNom";
import InstagramProfileEpingles from "./pages/InstagramProfileEpingles";
import InstagramProfileFeed from "./pages/InstagramProfileFeed";
import InstagramProfileEdito from "./pages/InstagramProfileEdito";
import InstagramInspirer from "./pages/InstagramInspirer";
import InstagramLaunch from "./pages/InstagramLaunch";
import InstagramLaunchPlan from "./pages/InstagramLaunchPlan";
import InstagramLaunchRecommendation from "./pages/InstagramLaunchRecommendation";
import InstagramRythme from "./pages/InstagramRythme";
import InstagramEngagement from "./pages/InstagramEngagement";
import InstagramStats from "./pages/InstagramStats";
import InstagramStories from "./pages/InstagramStories";
import InstagramReels from "./pages/InstagramReels";
import InstagramCreer from "./pages/InstagramCreer";
import InstagramCarousel from "./pages/InstagramCarousel";
import AtelierPage from "./pages/AtelierPage";
import RedactionPage from "./pages/RedactionPage";
import PersonaPage from "./pages/PersonaPage";
import PersonaRecapPage from "./pages/PersonaRecapPage";
import PropositionPage from "./pages/PropositionPage";
import PropositionRecapPage from "./pages/PropositionRecapPage";
import StrategiePage from "./pages/StrategiePage";
import StrategieRecapPage from "./pages/StrategieRecapPage";
import OffersPage from "./pages/OffersPage";
import OfferWorkshopPage from "./pages/OfferWorkshopPage";
import LinkedInHub from "./pages/LinkedInHub";
import LinkedInAudit from "./pages/LinkedInAudit";
import LinkedInProfil from "./pages/LinkedInProfil";
import LinkedInResume from "./pages/LinkedInResume";
import LinkedInParcours from "./pages/LinkedInParcours";
import LinkedInRecommandations from "./pages/LinkedInRecommandations";
import LinkedInEngagement from "./pages/LinkedInEngagement";
import PinterestHub from "./pages/PinterestHub";
import PinterestCompte from "./pages/PinterestCompte";
import PinterestTableaux from "./pages/PinterestTableaux";
import PinterestMotsCles from "./pages/PinterestMotsCles";
import PinterestEpingles from "./pages/PinterestEpingles";
import PinterestRoutine from "./pages/PinterestRoutine";
import SiteHub from "./pages/SiteHub";
import SiteAccueil from "./pages/SiteAccueil";
import SiteAccueilRecap from "./pages/SiteAccueilRecap";
import SiteAPropos from "./pages/SiteAPropos";
import SiteTestimonials from "./pages/SiteTestimonials";
import SiteCapturePage from "./pages/SiteCapturePage";
import LegalAiPage from "./pages/LegalAiPage";
import PaymentSuccessPage from "./pages/PaymentSuccessPage";
import PricingPage from "./pages/PricingPage";
import NowStudioSalesPage from "./pages/NowStudioSalesPage";
import ServicesPage from "./pages/ServicesPage";
import StudioDashboard from "./pages/StudioDashboard";
import LivesPage from "./pages/LivesPage";
import CommunautePage from "./pages/CommunautePage";
import ContactsPage from "./pages/ContactsPage";
import ProtectedRoute from "./components/ProtectedRoute";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/connexion" element={<LoginPage />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            {/* /plan is handled below as a protected route */}
            <Route path="/now-studio" element={<Navigate to="/studio/discover" replace />} />
            <Route path="/onboarding" element={<ProtectedRoute><Onboarding /></ProtectedRoute>} />
            <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/idees" element={<ProtectedRoute><IdeasPage /></ProtectedRoute>} />
            <Route path="/branding" element={<ProtectedRoute><BrandingPage /></ProtectedRoute>} />
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
            <Route path="/legal-ia" element={<ProtectedRoute><LegalAiPage /></ProtectedRoute>} />
            <Route path="/payment/success" element={<PaymentSuccessPage />} />
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
            <Route path="/instagram/idees" element={<Navigate to="/atelier?canal=instagram" replace />} />
            <Route path="/instagram/calendrier" element={<Navigate to="/calendrier?canal=instagram" replace />} />
            <Route path="/instagram/atelier" element={<Navigate to="/atelier?canal=instagram" replace />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
