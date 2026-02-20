export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      brand_profile: {
        Row: {
          channels: string[] | null
          created_at: string
          id: string
          key_expressions: string | null
          mission: string | null
          offer: string | null
          target_beliefs: string | null
          target_description: string | null
          target_problem: string | null
          target_verbatims: string | null
          things_to_avoid: string | null
          tone_engagement: string | null
          tone_humor: string | null
          tone_level: string | null
          tone_register: string | null
          tone_style: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          channels?: string[] | null
          created_at?: string
          id?: string
          key_expressions?: string | null
          mission?: string | null
          offer?: string | null
          target_beliefs?: string | null
          target_description?: string | null
          target_problem?: string | null
          target_verbatims?: string | null
          things_to_avoid?: string | null
          tone_engagement?: string | null
          tone_humor?: string | null
          tone_level?: string | null
          tone_register?: string | null
          tone_style?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          channels?: string[] | null
          created_at?: string
          id?: string
          key_expressions?: string | null
          mission?: string | null
          offer?: string | null
          target_beliefs?: string | null
          target_description?: string | null
          target_problem?: string | null
          target_verbatims?: string | null
          things_to_avoid?: string | null
          tone_engagement?: string | null
          tone_humor?: string | null
          tone_level?: string | null
          tone_register?: string | null
          tone_style?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      calendar_posts: {
        Row: {
          angle: string | null
          canal: string
          created_at: string
          date: string
          id: string
          notes: string | null
          objectif: string | null
          status: string
          theme: string
          updated_at: string
          user_id: string
        }
        Insert: {
          angle?: string | null
          canal?: string
          created_at?: string
          date: string
          id?: string
          notes?: string | null
          objectif?: string | null
          status?: string
          theme: string
          updated_at?: string
          user_id: string
        }
        Update: {
          angle?: string | null
          canal?: string
          created_at?: string
          date?: string
          id?: string
          notes?: string | null
          objectif?: string | null
          status?: string
          theme?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      content_drafts: {
        Row: {
          accroche: string | null
          canal: string | null
          content: string | null
          created_at: string
          format: string | null
          format_technique: string | null
          id: string
          idea_id: string | null
          objectif: string | null
          status: string | null
          theme: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          accroche?: string | null
          canal?: string | null
          content?: string | null
          created_at?: string
          format?: string | null
          format_technique?: string | null
          id?: string
          idea_id?: string | null
          objectif?: string | null
          status?: string | null
          theme?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          accroche?: string | null
          canal?: string | null
          content?: string | null
          created_at?: string
          format?: string | null
          format_technique?: string | null
          id?: string
          idea_id?: string | null
          objectif?: string | null
          status?: string | null
          theme?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_drafts_idea_id_fkey"
            columns: ["idea_id"]
            isOneToOne: false
            referencedRelation: "saved_ideas"
            referencedColumns: ["id"]
          },
        ]
      }
      generated_posts: {
        Row: {
          added_to_plan: boolean
          contenu: string
          created_at: string
          format: string
          id: string
          sujet: string
          user_id: string
        }
        Insert: {
          added_to_plan?: boolean
          contenu: string
          created_at?: string
          format: string
          id?: string
          sujet: string
          user_id: string
        }
        Update: {
          added_to_plan?: boolean
          contenu?: string
          created_at?: string
          format?: string
          id?: string
          sujet?: string
          user_id?: string
        }
        Relationships: []
      }
      highlight_categories: {
        Row: {
          added_to_profile: boolean | null
          canva_link: string | null
          category: string
          covers_created: boolean | null
          created_at: string
          has_existing_stories: boolean | null
          id: string
          needs_content_creation: boolean | null
          noted_in_calendar: boolean | null
          notes: string | null
          stories_grouped: boolean | null
          updated_at: string
          user_id: string
        }
        Insert: {
          added_to_profile?: boolean | null
          canva_link?: string | null
          category: string
          covers_created?: boolean | null
          created_at?: string
          has_existing_stories?: boolean | null
          id?: string
          needs_content_creation?: boolean | null
          noted_in_calendar?: boolean | null
          notes?: string | null
          stories_grouped?: boolean | null
          updated_at?: string
          user_id: string
        }
        Update: {
          added_to_profile?: boolean | null
          canva_link?: string | null
          category?: string
          covers_created?: boolean | null
          created_at?: string
          has_existing_stories?: boolean | null
          id?: string
          needs_content_creation?: boolean | null
          noted_in_calendar?: boolean | null
          notes?: string | null
          stories_grouped?: boolean | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      inspiration_accounts: {
        Row: {
          account_handle: string
          appeal: string | null
          created_at: string
          frequent_formats: string | null
          id: string
          slot_index: number
          tone: string[] | null
          top_engagement: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          account_handle?: string
          appeal?: string | null
          created_at?: string
          frequent_formats?: string | null
          id?: string
          slot_index?: number
          tone?: string[] | null
          top_engagement?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          account_handle?: string
          appeal?: string | null
          created_at?: string
          frequent_formats?: string | null
          id?: string
          slot_index?: number
          tone?: string[] | null
          top_engagement?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      inspiration_notes: {
        Row: {
          content: string | null
          created_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content?: string | null
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string | null
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      launches: {
        Row: {
          created_at: string
          free_resource: string | null
          id: string
          name: string
          objections: string | null
          promise: string | null
          sale_end: string | null
          sale_start: string | null
          selected_contents: string[] | null
          status: string
          teasing_end: string | null
          teasing_start: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          free_resource?: string | null
          id?: string
          name?: string
          objections?: string | null
          promise?: string | null
          sale_end?: string | null
          sale_start?: string | null
          selected_contents?: string[] | null
          status?: string
          teasing_end?: string | null
          teasing_start?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          free_resource?: string | null
          id?: string
          name?: string
          objections?: string | null
          promise?: string | null
          sale_end?: string | null
          sale_start?: string | null
          selected_contents?: string[] | null
          status?: string
          teasing_end?: string | null
          teasing_start?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      plan_tasks: {
        Row: {
          completed_at: string | null
          created_at: string
          id: string
          is_completed: boolean
          task_index: number
          user_id: string
          week_number: number
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          id?: string
          is_completed?: boolean
          task_index: number
          user_id: string
          week_number: number
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          id?: string
          is_completed?: boolean
          task_index?: number
          user_id?: string
          week_number?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          activite: string
          canaux: string[]
          ce_quon_evite: string
          cible: string
          created_at: string
          croyances_limitantes: string
          expressions_cles: string
          id: string
          mission: string
          offre: string
          onboarding_completed: boolean
          piliers: string[]
          plan_start_date: string | null
          prenom: string
          probleme_principal: string
          style_communication: string[]
          tons: string[]
          type_activite: string
          updated_at: string
          user_id: string
          verbatims: string
        }
        Insert: {
          activite?: string
          canaux?: string[]
          ce_quon_evite?: string
          cible?: string
          created_at?: string
          croyances_limitantes?: string
          expressions_cles?: string
          id?: string
          mission?: string
          offre?: string
          onboarding_completed?: boolean
          piliers?: string[]
          plan_start_date?: string | null
          prenom?: string
          probleme_principal?: string
          style_communication?: string[]
          tons?: string[]
          type_activite?: string
          updated_at?: string
          user_id: string
          verbatims?: string
        }
        Update: {
          activite?: string
          canaux?: string[]
          ce_quon_evite?: string
          cible?: string
          created_at?: string
          croyances_limitantes?: string
          expressions_cles?: string
          id?: string
          mission?: string
          offre?: string
          onboarding_completed?: boolean
          piliers?: string[]
          plan_start_date?: string | null
          prenom?: string
          probleme_principal?: string
          style_communication?: string[]
          tons?: string[]
          type_activite?: string
          updated_at?: string
          user_id?: string
          verbatims?: string
        }
        Relationships: []
      }
      saved_ideas: {
        Row: {
          angle: string
          canal: string
          created_at: string
          format: string
          id: string
          objectif: string | null
          titre: string
          user_id: string
        }
        Insert: {
          angle: string
          canal?: string
          created_at?: string
          format: string
          id?: string
          objectif?: string | null
          titre: string
          user_id: string
        }
        Update: {
          angle?: string
          canal?: string
          created_at?: string
          format?: string
          id?: string
          objectif?: string | null
          titre?: string
          user_id?: string
        }
        Relationships: []
      }
      tasks: {
        Row: {
          completed_at: string | null
          created_at: string
          duration_minutes: number
          id: string
          is_completed: boolean
          label: string
          order_index: number
          period: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          duration_minutes?: number
          id?: string
          is_completed?: boolean
          label: string
          order_index?: number
          period?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          duration_minutes?: number
          id?: string
          is_completed?: boolean
          label?: string
          order_index?: number
          period?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
