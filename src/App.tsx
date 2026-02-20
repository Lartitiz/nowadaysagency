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
import Profile from "./pages/Profile";
import SettingsPage from "./pages/SettingsPage";
import Calendar from "./pages/Calendar";
import PlanPage from "./pages/PlanPage";
import BrandingPage from "./pages/BrandingPage";
import StorytellingPage from "./pages/StorytellingPage";
import StorytellingRecapPage from "./pages/StorytellingRecapPage";
import InstagramHub from "./pages/InstagramHub";
import InstagramBio from "./pages/InstagramBio";
import InstagramHighlights from "./pages/InstagramHighlights";
import InstagramInspiration from "./pages/InstagramInspiration";
import InstagramLaunch from "./pages/InstagramLaunch";
import AtelierPage from "./pages/AtelierPage";
import RedactionPage from "./pages/RedactionPage";
import PersonaPage from "./pages/PersonaPage";
import PersonaRecapPage from "./pages/PersonaRecapPage";
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
            <Route path="/branding" element={
              <ProtectedRoute><BrandingPage /></ProtectedRoute>
            } />
            <Route path="/branding/storytelling" element={
              <ProtectedRoute><StorytellingPage /></ProtectedRoute>
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
            {/* Transversal routes */}
            <Route path="/atelier" element={
              <ProtectedRoute><AtelierPage /></ProtectedRoute>
            } />
            <Route path="/atelier/rediger" element={
              <ProtectedRoute><RedactionPage /></ProtectedRoute>
            } />
            <Route path="/calendrier" element={
              <ProtectedRoute><Calendar /></ProtectedRoute>
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
