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
import PlanPage from "./pages/PlanPage";
import BrandingPage from "./pages/BrandingPage";
import TonStylePage from "./pages/TonStylePage";
import StorytellingPage from "./pages/StorytellingPage";
import StorytellingRecapPage from "./pages/StorytellingRecapPage";
import StorytellingListPage from "./pages/StorytellingListPage";
import StorytellingImportPage from "./pages/StorytellingImportPage";
import StorytellingEditPage from "./pages/StorytellingEditPage";
import InstagramHub from "./pages/InstagramHub";
import InstagramBio from "./pages/InstagramBio";
import InstagramHighlights from "./pages/InstagramHighlights";
import InstagramInspiration from "./pages/InstagramInspiration";
import InstagramLaunch from "./pages/InstagramLaunch";
import InstagramRythme from "./pages/InstagramRythme";
import InstagramEngagement from "./pages/InstagramEngagement";
import AtelierPage from "./pages/AtelierPage";
import RedactionPage from "./pages/RedactionPage";
import PersonaPage from "./pages/PersonaPage";
import PersonaRecapPage from "./pages/PersonaRecapPage";
import PropositionPage from "./pages/PropositionPage";
import PropositionRecapPage from "./pages/PropositionRecapPage";
import StrategiePage from "./pages/StrategiePage";
import StrategieRecapPage from "./pages/StrategieRecapPage";
import LinkedInHub from "./pages/LinkedInHub";
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
            <Route path="/onboarding" element={
              <ProtectedRoute><Onboarding /></ProtectedRoute>
            } />
            <Route path="/dashboard" element={
              <ProtectedRoute><Dashboard /></ProtectedRoute>
            } />
            <Route path="/idees" element={
              <ProtectedRoute><IdeasPage /></ProtectedRoute>
            } />
            <Route path="/branding" element={
              <ProtectedRoute><BrandingPage /></ProtectedRoute>
            } />
            <Route path="/branding/ton" element={
              <ProtectedRoute><TonStylePage /></ProtectedRoute>
            } />
            <Route path="/branding/storytelling" element={
              <ProtectedRoute><StorytellingListPage /></ProtectedRoute>
            } />
            <Route path="/branding/storytelling/new" element={
              <ProtectedRoute><StorytellingPage /></ProtectedRoute>
            } />
            <Route path="/branding/storytelling/import" element={
              <ProtectedRoute><StorytellingImportPage /></ProtectedRoute>
            } />
            <Route path="/branding/storytelling/:id" element={
              <ProtectedRoute><StorytellingPage /></ProtectedRoute>
            } />
            <Route path="/branding/storytelling/:id/recap" element={
              <ProtectedRoute><StorytellingRecapPage /></ProtectedRoute>
            } />
            <Route path="/branding/storytelling/:id/edit" element={
              <ProtectedRoute><StorytellingEditPage /></ProtectedRoute>
            } />
            <Route path="/branding/storytelling/recap" element={
              <ProtectedRoute><StorytellingRecapPage /></ProtectedRoute>
            } />
            <Route path="/branding/persona" element={
              <ProtectedRoute><PersonaPage /></ProtectedRoute>
            } />
            <Route path="/branding/persona/recap" element={
              <ProtectedRoute><PersonaRecapPage /></ProtectedRoute>
            } />
            <Route path="/branding/proposition" element={
              <ProtectedRoute><PropositionPage /></ProtectedRoute>
            } />
            <Route path="/branding/proposition/recap" element={
              <ProtectedRoute><PropositionRecapPage /></ProtectedRoute>
            } />
            {/* Redirect old niche routes to ton */}
            <Route path="/branding/niche" element={<Navigate to="/branding/ton" replace />} />
            <Route path="/branding/niche/recap" element={<Navigate to="/branding/ton" replace />} />
            <Route path="/branding/strategie" element={
              <ProtectedRoute><StrategiePage /></ProtectedRoute>
            } />
            <Route path="/branding/strategie/recap" element={
              <ProtectedRoute><StrategieRecapPage /></ProtectedRoute>
            } />
            <Route path="/plan" element={
              <ProtectedRoute><PlanPage /></ProtectedRoute>
            } />
            <Route path="/profil" element={
              <ProtectedRoute><Profile /></ProtectedRoute>
            } />
            <Route path="/parametres" element={
              <ProtectedRoute><SettingsPage /></ProtectedRoute>
            } />
            {/* Instagram module */}
            <Route path="/instagram" element={
              <ProtectedRoute><InstagramHub /></ProtectedRoute>
            } />
            <Route path="/instagram/bio" element={
              <ProtectedRoute><InstagramBio /></ProtectedRoute>
            } />
            <Route path="/instagram/highlights" element={
              <ProtectedRoute><InstagramHighlights /></ProtectedRoute>
            } />
            <Route path="/instagram/inspiration" element={
              <ProtectedRoute><InstagramInspiration /></ProtectedRoute>
            } />
            <Route path="/instagram/lancement" element={
              <ProtectedRoute><InstagramLaunch /></ProtectedRoute>
            } />
            <Route path="/instagram/rythme" element={
              <ProtectedRoute><InstagramRythme /></ProtectedRoute>
            } />
            <Route path="/instagram/engagement" element={
              <ProtectedRoute><InstagramEngagement /></ProtectedRoute>
            } />
            {/* Transversal routes */}
            <Route path="/atelier" element={
              <ProtectedRoute><AtelierPage /></ProtectedRoute>
            } />
            <Route path="/atelier/rediger" element={
              <ProtectedRoute><RedactionPage /></ProtectedRoute>
            } />
            {/* LinkedIn module */}
            <Route path="/linkedin" element={
              <ProtectedRoute><LinkedInHub /></ProtectedRoute>
            } />
            <Route path="/linkedin/profil" element={
              <ProtectedRoute><LinkedInProfil /></ProtectedRoute>
            } />
            <Route path="/linkedin/resume" element={
              <ProtectedRoute><LinkedInResume /></ProtectedRoute>
            } />
            <Route path="/linkedin/parcours" element={
              <ProtectedRoute><LinkedInParcours /></ProtectedRoute>
            } />
            <Route path="/linkedin/recommandations" element={
              <ProtectedRoute><LinkedInRecommandations /></ProtectedRoute>
            } />
            <Route path="/linkedin/engagement" element={
              <ProtectedRoute><LinkedInEngagement /></ProtectedRoute>
            } />
            {/* Pinterest module */}
            <Route path="/pinterest" element={
              <ProtectedRoute><PinterestHub /></ProtectedRoute>
            } />
            <Route path="/pinterest/compte" element={
              <ProtectedRoute><PinterestCompte /></ProtectedRoute>
            } />
            <Route path="/pinterest/tableaux" element={
              <ProtectedRoute><PinterestTableaux /></ProtectedRoute>
            } />
            <Route path="/pinterest/mots-cles" element={
              <ProtectedRoute><PinterestMotsCles /></ProtectedRoute>
            } />
            <Route path="/pinterest/epingles" element={
              <ProtectedRoute><PinterestEpingles /></ProtectedRoute>
            } />
            <Route path="/pinterest/routine" element={
              <ProtectedRoute><PinterestRoutine /></ProtectedRoute>
            } />
            <Route path="/calendrier" element={
              <ProtectedRoute><Calendar /></ProtectedRoute>
            } />
            {/* Site Web module */}
            <Route path="/site" element={
              <ProtectedRoute><SiteHub /></ProtectedRoute>
            } />
            <Route path="/site/accueil" element={
              <ProtectedRoute><SiteAccueil /></ProtectedRoute>
            } />
            <Route path="/site/accueil/recap" element={
              <ProtectedRoute><SiteAccueilRecap /></ProtectedRoute>
            } />
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
