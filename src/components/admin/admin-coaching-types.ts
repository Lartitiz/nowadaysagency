import { useSpeechRecognition } from "@/hooks/use-speech-recognition";
import { Textarea } from "@/components/ui/textarea";
import { useState, useEffect } from "react";

/* ═══════════════════════════════════════════════════════════
   SHARED TYPES
   ═══════════════════════════════════════════════════════════ */
export interface ProgramWithProfile {
  id: string;
  client_user_id: string;
  current_phase: string;
  current_month: number;
  status: string;
  start_date: string | null;
  end_date: string | null;
  whatsapp_link: string | null;
  calendly_link: string | null;
  formula: string | null;
  duration_months: number | null;
  price_monthly: number | null;
  total_focus_sessions: number | null;
  client_name?: string;
  client_email?: string;
  client_activity?: string;
  dashboard_message?: string;
}

export interface SessionData {
  id: string;
  session_number: number;
  phase: string;
  title: string | null;
  focus: string | null;
  scheduled_date: string | null;
  status: string;
  meeting_link: string | null;
  prep_notes: string | null;
  summary: string | null;
  modules_updated: string[] | null;
  laetitia_note: string | null;
  private_notes: string | null;
  program_id: string;
  session_type: string | null;
  focus_topic: string | null;
  focus_label: string | null;
  duration_minutes: number;
}

export interface DeliverableData {
  id: string;
  program_id: string;
  title: string;
  type: string | null;
  route: string | null;
  status: string;
  delivered_at: string | null;
  file_url: string | null;
  file_name: string | null;
  assigned_session_id: string | null;
}

export interface ActionData {
  id: string;
  program_id: string;
  session_id: string | null;
  title: string;
  description: string | null;
  due_date: string | null;
  completed: boolean;
  completed_at: string | null;
}

/* ═══════════════════════════════════════════════════════════
   SHARED CONSTANTS
   ═══════════════════════════════════════════════════════════ */
export const SESSION_TYPES = [
  { value: "launch", label: "🎯 Lancement" },
  { value: "strategy", label: "📊 Stratégie" },
  { value: "checkpoint", label: "✅ Point" },
  { value: "focus", label: "🔧 Focus" },
];

export const DURATION_OPTIONS = [
  { value: 30, label: "30min" },
  { value: 60, label: "1h" },
  { value: 90, label: "1h30" },
  { value: 120, label: "2h" },
];

export const STATUS_OPTIONS = [
  { value: "scheduled", label: "🔜 À venir" },
  { value: "confirmed", label: "📅 Planifiée" },
  { value: "completed", label: "✅ Terminée" },
];

export const ALL_MODULES = ["Branding", "Cible", "Offres", "Ton", "Histoire", "Éditoriale", "Bio", "Calendrier"];

export function formatDuration(mins: number) {
  if (mins < 60) return `${mins}min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h${m.toString().padStart(2, "0")}` : `${h}h`;
}
