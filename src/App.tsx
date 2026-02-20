import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import LandingPage from "./pages/LandingPage";
import LoginPage from "./pages/LoginPage";
import ResetPassword from "./pages/ResetPassword";
import Onboarding from "./pages/Onboarding";
import Dashboard from "./pages/Dashboard";
import Profile from "./pages/Profile";
import Calendar from "./pages/Calendar";
import PlanPage from "./pages/PlanPage";
import InstagramHub from "./pages/InstagramHub";
import InstagramBio from "./pages/InstagramBio";
import InstagramHighlights from "./pages/InstagramHighlights";
import InstagramInspiration from "./pages/InstagramInspiration";
import InstagramLaunch from "./pages/InstagramLaunch";
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
            <Route path="/atelier" element={
              <ProtectedRoute><Dashboard /></ProtectedRoute>
            } />
            <Route path="/plan" element={
              <ProtectedRoute><PlanPage /></ProtectedRoute>
            } />
            <Route path="/calendrier" element={
              <ProtectedRoute><Calendar /></ProtectedRoute>
            } />
            <Route path="/profil" element={
              <ProtectedRoute><Profile /></ProtectedRoute>
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
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
