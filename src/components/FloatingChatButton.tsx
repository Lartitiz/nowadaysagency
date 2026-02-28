import { useLocation, useNavigate } from "react-router-dom";
import { MessageCircle } from "lucide-react";
import { motion } from "framer-motion";

const HIDDEN_ROUTES = [
  "/dashboard",
  "/dashboard/guide",
  "/dashboard/complet",
  "/onboarding",
  "/login",
  "/register",
  "/landing",
];

export default function FloatingChatButton() {
  const location = useLocation();
  const navigate = useNavigate();

  const isHidden =
    HIDDEN_ROUTES.some((r) => location.pathname === r) ||
    location.pathname.startsWith("/onboarding");

  if (isHidden) return null;

  return (
    <motion.button
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 1, duration: 0.3 }}
      onClick={() => navigate("/dashboard/guide")}
      className="fixed bottom-6 right-6 w-[52px] h-[52px] rounded-2xl bg-primary text-primary-foreground shadow-[0_4px_16px_rgba(0,0,0,0.15)] hover:shadow-[0_6px_24px_rgba(0,0,0,0.2)] hover:scale-105 transition-all z-40 items-center justify-center hidden sm:flex"
      aria-label="Ouvrir l'assistant com'"
    >
      <MessageCircle className="h-[22px] w-[22px]" />
    </motion.button>
  );
}
