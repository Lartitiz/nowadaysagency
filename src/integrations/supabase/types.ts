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
      ai_usage: {
        Row: {
          action_type: string
          category: string
          created_at: string
          id: string
          model_used: string | null
          tokens_used: number | null
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          action_type: string
          category: string
          created_at?: string
          id?: string
          model_used?: string | null
          tokens_used?: number | null
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          action_type?: string
          category?: string
          created_at?: string
          id?: string
          model_used?: string | null
          tokens_used?: number | null
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      assistant_undo_log: {
        Row: {
          action_type: string
          created_at: string
          id: string
          previous_data: Json | null
          record_id: string | null
          table_name: string
          user_id: string
        }
        Insert: {
          action_type: string
          created_at?: string
          id?: string
          previous_data?: Json | null
          record_id?: string | null
          table_name: string
          user_id: string
        }
        Update: {
          action_type?: string
          created_at?: string
          id?: string
          previous_data?: Json | null
          record_id?: string | null
          table_name?: string
          user_id?: string
        }
        Relationships: []
      }
      audit_recommendations: {
        Row: {
          audit_id: string | null
          completed: boolean | null
          completed_at: string | null
          conseil: string | null
          conseil_contextuel: string | null
          created_at: string | null
          detail: string | null
          id: string
          label: string
          label_bouton: string | null
          module: string
          position: number | null
          priorite: string | null
          route: string
          temps_estime: string | null
          titre: string | null
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          audit_id?: string | null
          completed?: boolean | null
          completed_at?: string | null
          conseil?: string | null
          conseil_contextuel?: string | null
          created_at?: string | null
          detail?: string | null
          id?: string
          label: string
          label_bouton?: string | null
          module: string
          position?: number | null
          priorite?: string | null
          route: string
          temps_estime?: string | null
          titre?: string | null
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          audit_id?: string | null
          completed?: boolean | null
          completed_at?: string | null
          conseil?: string | null
          conseil_contextuel?: string | null
          created_at?: string | null
          detail?: string | null
          id?: string
          label?: string
          label_bouton?: string | null
          module?: string
          position?: number | null
          priorite?: string | null
          route?: string
          temps_estime?: string | null
          titre?: string | null
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_recommendations_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: false
            referencedRelation: "branding_audits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_recommendations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_validations: {
        Row: {
          created_at: string
          id: string
          section: string
          status: string
          updated_at: string
          user_id: string
          validated_at: string | null
          validated_content: Json | null
        }
        Insert: {
          created_at?: string
          id?: string
          section: string
          status?: string
          updated_at?: string
          user_id: string
          validated_at?: string | null
          validated_content?: Json | null
        }
        Update: {
          created_at?: string
          id?: string
          section?: string
          status?: string
          updated_at?: string
          user_id?: string
          validated_at?: string | null
          validated_content?: Json | null
        }
        Relationships: []
      }
      beta_feedback: {
        Row: {
          admin_notes: string | null
          content: string
          created_at: string
          details: string | null
          id: string
          page_url: string | null
          screenshot_url: string | null
          severity: string | null
          status: string
          type: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          admin_notes?: string | null
          content: string
          created_at?: string
          details?: string | null
          id?: string
          page_url?: string | null
          screenshot_url?: string | null
          severity?: string | null
          status?: string
          type: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          admin_notes?: string | null
          content?: string
          created_at?: string
          details?: string | null
          id?: string
          page_url?: string | null
          screenshot_url?: string | null
          severity?: string | null
          status?: string
          type?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "beta_feedback_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      bio_versions: {
        Row: {
          bio_text: string
          created_at: string | null
          id: string
          platform: string
          score: number | null
          source: string | null
          structure_type: string | null
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          bio_text: string
          created_at?: string | null
          id?: string
          platform?: string
          score?: number | null
          source?: string | null
          structure_type?: string | null
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          bio_text?: string
          created_at?: string | null
          id?: string
          platform?: string
          score?: number | null
          source?: string | null
          structure_type?: string | null
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bio_versions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_charter: {
        Row: {
          ai_generated_brief: string | null
          border_radius: string | null
          color_accent: string | null
          color_background: string | null
          color_primary: string | null
          color_secondary: string | null
          color_text: string | null
          completion_pct: number | null
          created_at: string | null
          custom_colors: Json | null
          font_accent: string | null
          font_body: string | null
          font_title: string | null
          icon_style: string | null
          id: string
          logo_url: string | null
          logo_variants: Json | null
          mood_board_urls: Json | null
          mood_keywords: Json | null
          moodboard_description: string | null
          moodboard_images: Json | null
          photo_keywords: Json | null
          photo_style: string | null
          updated_at: string | null
          uploaded_templates: Json | null
          user_id: string
          visual_donts: string | null
        }
        Insert: {
          ai_generated_brief?: string | null
          border_radius?: string | null
          color_accent?: string | null
          color_background?: string | null
          color_primary?: string | null
          color_secondary?: string | null
          color_text?: string | null
          completion_pct?: number | null
          created_at?: string | null
          custom_colors?: Json | null
          font_accent?: string | null
          font_body?: string | null
          font_title?: string | null
          icon_style?: string | null
          id?: string
          logo_url?: string | null
          logo_variants?: Json | null
          mood_board_urls?: Json | null
          mood_keywords?: Json | null
          moodboard_description?: string | null
          moodboard_images?: Json | null
          photo_keywords?: Json | null
          photo_style?: string | null
          updated_at?: string | null
          uploaded_templates?: Json | null
          user_id: string
          visual_donts?: string | null
        }
        Update: {
          ai_generated_brief?: string | null
          border_radius?: string | null
          color_accent?: string | null
          color_background?: string | null
          color_primary?: string | null
          color_secondary?: string | null
          color_text?: string | null
          completion_pct?: number | null
          created_at?: string | null
          custom_colors?: Json | null
          font_accent?: string | null
          font_body?: string | null
          font_title?: string | null
          icon_style?: string | null
          id?: string
          logo_url?: string | null
          logo_variants?: Json | null
          mood_board_urls?: Json | null
          mood_keywords?: Json | null
          moodboard_description?: string | null
          moodboard_images?: Json | null
          photo_keywords?: Json | null
          photo_style?: string | null
          updated_at?: string | null
          uploaded_templates?: Json | null
          user_id?: string
          visual_donts?: string | null
        }
        Relationships: []
      }
      brand_profile: {
        Row: {
          channels: string[] | null
          combat_alternative: string | null
          combat_cause: string | null
          combat_fights: string | null
          combat_refusals: string | null
          combats: string | null
          content_editorial_line: string | null
          content_formats: Json | null
          content_frequency: string | null
          content_pillars: Json | null
          content_twist: string | null
          created_at: string
          id: string
          key_expressions: string | null
          mission: string | null
          offer: string | null
          positioning: string | null
          recap_summary: Json | null
          story_full: string | null
          story_origin: string | null
          story_struggles: string | null
          story_turning_point: string | null
          story_unique: string | null
          story_vision: string | null
          target_beliefs: string | null
          target_description: string | null
          target_problem: string | null
          target_verbatims: string | null
          things_to_avoid: string | null
          tone_description: string | null
          tone_do: string | null
          tone_dont: string | null
          tone_engagement: string | null
          tone_humor: string | null
          tone_keywords: Json | null
          tone_level: string | null
          tone_register: string | null
          tone_style: string | null
          updated_at: string
          user_id: string
          value_prop_difference: string | null
          value_prop_problem: string | null
          value_prop_proof: string | null
          value_prop_sentence: string | null
          value_prop_solution: string | null
          values: Json | null
          visual_style: string | null
          voice_description: string | null
          workspace_id: string | null
        }
        Insert: {
          channels?: string[] | null
          combat_alternative?: string | null
          combat_cause?: string | null
          combat_fights?: string | null
          combat_refusals?: string | null
          combats?: string | null
          content_editorial_line?: string | null
          content_formats?: Json | null
          content_frequency?: string | null
          content_pillars?: Json | null
          content_twist?: string | null
          created_at?: string
          id?: string
          key_expressions?: string | null
          mission?: string | null
          offer?: string | null
          positioning?: string | null
          recap_summary?: Json | null
          story_full?: string | null
          story_origin?: string | null
          story_struggles?: string | null
          story_turning_point?: string | null
          story_unique?: string | null
          story_vision?: string | null
          target_beliefs?: string | null
          target_description?: string | null
          target_problem?: string | null
          target_verbatims?: string | null
          things_to_avoid?: string | null
          tone_description?: string | null
          tone_do?: string | null
          tone_dont?: string | null
          tone_engagement?: string | null
          tone_humor?: string | null
          tone_keywords?: Json | null
          tone_level?: string | null
          tone_register?: string | null
          tone_style?: string | null
          updated_at?: string
          user_id: string
          value_prop_difference?: string | null
          value_prop_problem?: string | null
          value_prop_proof?: string | null
          value_prop_sentence?: string | null
          value_prop_solution?: string | null
          values?: Json | null
          visual_style?: string | null
          voice_description?: string | null
          workspace_id?: string | null
        }
        Update: {
          channels?: string[] | null
          combat_alternative?: string | null
          combat_cause?: string | null
          combat_fights?: string | null
          combat_refusals?: string | null
          combats?: string | null
          content_editorial_line?: string | null
          content_formats?: Json | null
          content_frequency?: string | null
          content_pillars?: Json | null
          content_twist?: string | null
          created_at?: string
          id?: string
          key_expressions?: string | null
          mission?: string | null
          offer?: string | null
          positioning?: string | null
          recap_summary?: Json | null
          story_full?: string | null
          story_origin?: string | null
          story_struggles?: string | null
          story_turning_point?: string | null
          story_unique?: string | null
          story_vision?: string | null
          target_beliefs?: string | null
          target_description?: string | null
          target_problem?: string | null
          target_verbatims?: string | null
          things_to_avoid?: string | null
          tone_description?: string | null
          tone_do?: string | null
          tone_dont?: string | null
          tone_engagement?: string | null
          tone_humor?: string | null
          tone_keywords?: Json | null
          tone_level?: string | null
          tone_register?: string | null
          tone_style?: string | null
          updated_at?: string
          user_id?: string
          value_prop_difference?: string | null
          value_prop_problem?: string | null
          value_prop_proof?: string | null
          value_prop_sentence?: string | null
          value_prop_solution?: string | null
          values?: Json | null
          visual_style?: string | null
          voice_description?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "brand_profile_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_proposition: {
        Row: {
          completed: boolean | null
          created_at: string | null
          current_step: number | null
          id: string
          recap_summary: Json | null
          step_1_what: string | null
          step_2a_process: string | null
          step_2b_values: string | null
          step_2c_feedback: string | null
          step_2d_refuse: string | null
          step_3_for_whom: string | null
          updated_at: string | null
          user_id: string
          version_bio: string | null
          version_complete: string | null
          version_emotional: string | null
          version_engagee: string | null
          version_final: string | null
          version_networking: string | null
          version_one_liner: string | null
          version_pitch: string | null
          version_pitch_naturel: string | null
          version_short: string | null
          version_site_web: string | null
          workspace_id: string | null
        }
        Insert: {
          completed?: boolean | null
          created_at?: string | null
          current_step?: number | null
          id?: string
          recap_summary?: Json | null
          step_1_what?: string | null
          step_2a_process?: string | null
          step_2b_values?: string | null
          step_2c_feedback?: string | null
          step_2d_refuse?: string | null
          step_3_for_whom?: string | null
          updated_at?: string | null
          user_id: string
          version_bio?: string | null
          version_complete?: string | null
          version_emotional?: string | null
          version_engagee?: string | null
          version_final?: string | null
          version_networking?: string | null
          version_one_liner?: string | null
          version_pitch?: string | null
          version_pitch_naturel?: string | null
          version_short?: string | null
          version_site_web?: string | null
          workspace_id?: string | null
        }
        Update: {
          completed?: boolean | null
          created_at?: string | null
          current_step?: number | null
          id?: string
          recap_summary?: Json | null
          step_1_what?: string | null
          step_2a_process?: string | null
          step_2b_values?: string | null
          step_2c_feedback?: string | null
          step_2d_refuse?: string | null
          step_3_for_whom?: string | null
          updated_at?: string | null
          user_id?: string
          version_bio?: string | null
          version_complete?: string | null
          version_emotional?: string | null
          version_engagee?: string | null
          version_final?: string | null
          version_networking?: string | null
          version_one_liner?: string | null
          version_pitch?: string | null
          version_pitch_naturel?: string | null
          version_short?: string | null
          version_site_web?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "brand_proposition_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_strategy: {
        Row: {
          ai_concepts: Json | null
          ai_facets: Json | null
          ai_pillars: Json | null
          completed: boolean | null
          created_at: string | null
          creative_concept: string | null
          current_step: number | null
          facet_1: string | null
          facet_1_format: string | null
          facet_2: string | null
          facet_2_format: string | null
          facet_3: string | null
          facet_3_format: string | null
          id: string
          pillar_major: string | null
          pillar_minor_1: string | null
          pillar_minor_2: string | null
          pillar_minor_3: string | null
          recap_summary: Json | null
          step_1_hidden_facets: string | null
          updated_at: string | null
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          ai_concepts?: Json | null
          ai_facets?: Json | null
          ai_pillars?: Json | null
          completed?: boolean | null
          created_at?: string | null
          creative_concept?: string | null
          current_step?: number | null
          facet_1?: string | null
          facet_1_format?: string | null
          facet_2?: string | null
          facet_2_format?: string | null
          facet_3?: string | null
          facet_3_format?: string | null
          id?: string
          pillar_major?: string | null
          pillar_minor_1?: string | null
          pillar_minor_2?: string | null
          pillar_minor_3?: string | null
          recap_summary?: Json | null
          step_1_hidden_facets?: string | null
          updated_at?: string | null
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          ai_concepts?: Json | null
          ai_facets?: Json | null
          ai_pillars?: Json | null
          completed?: boolean | null
          created_at?: string | null
          creative_concept?: string | null
          current_step?: number | null
          facet_1?: string | null
          facet_1_format?: string | null
          facet_2?: string | null
          facet_2_format?: string | null
          facet_3?: string | null
          facet_3_format?: string | null
          id?: string
          pillar_major?: string | null
          pillar_minor_1?: string | null
          pillar_minor_2?: string | null
          pillar_minor_3?: string | null
          recap_summary?: Json | null
          step_1_hidden_facets?: string | null
          updated_at?: string | null
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "brand_strategy_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      branding_audits: {
        Row: {
          audit_detail: Json | null
          created_at: string
          extraction_branding: Json | null
          id: string
          instagram_username: string | null
          linkedin_url: string | null
          plan_action: Json | null
          points_faibles: Json | null
          points_forts: Json | null
          score_global: number | null
          site_url: string | null
          sources_used: Json | null
          synthese: string | null
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          audit_detail?: Json | null
          created_at?: string
          extraction_branding?: Json | null
          id?: string
          instagram_username?: string | null
          linkedin_url?: string | null
          plan_action?: Json | null
          points_faibles?: Json | null
          points_forts?: Json | null
          score_global?: number | null
          site_url?: string | null
          sources_used?: Json | null
          synthese?: string | null
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          audit_detail?: Json | null
          created_at?: string
          extraction_branding?: Json | null
          id?: string
          instagram_username?: string | null
          linkedin_url?: string | null
          plan_action?: Json | null
          points_faibles?: Json | null
          points_forts?: Json | null
          score_global?: number | null
          site_url?: string | null
          sources_used?: Json | null
          synthese?: string | null
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "branding_audits_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      branding_coaching_sessions: {
        Row: {
          completed_at: string | null
          covered_topics: Json | null
          created_at: string | null
          extracted_data: Json | null
          id: string
          is_complete: boolean | null
          messages: Json | null
          question_count: number | null
          section: string
          updated_at: string | null
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          completed_at?: string | null
          covered_topics?: Json | null
          created_at?: string | null
          extracted_data?: Json | null
          id?: string
          is_complete?: boolean | null
          messages?: Json | null
          question_count?: number | null
          section: string
          updated_at?: string | null
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          completed_at?: string | null
          covered_topics?: Json | null
          created_at?: string | null
          extracted_data?: Json | null
          id?: string
          is_complete?: boolean | null
          messages?: Json | null
          question_count?: number | null
          section?: string
          updated_at?: string | null
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "branding_coaching_sessions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      branding_mirror_results: {
        Row: {
          alignments: Json | null
          coherence_score: number | null
          created_at: string
          gaps: Json | null
          id: string
          quick_wins: Json | null
          summary: string | null
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          alignments?: Json | null
          coherence_score?: number | null
          created_at?: string
          gaps?: Json | null
          id?: string
          quick_wins?: Json | null
          summary?: string | null
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          alignments?: Json | null
          coherence_score?: number | null
          created_at?: string
          gaps?: Json | null
          id?: string
          quick_wins?: Json | null
          summary?: string | null
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "branding_mirror_results_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      branding_suggestions: {
        Row: {
          created_at: string
          id: string
          resolved_at: string | null
          status: string
          suggestions: Json | null
          trigger_field: string
          trigger_new_value: string | null
          trigger_old_value: string | null
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          resolved_at?: string | null
          status?: string
          suggestions?: Json | null
          trigger_field: string
          trigger_new_value?: string | null
          trigger_old_value?: string | null
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          resolved_at?: string | null
          status?: string
          suggestions?: Json | null
          trigger_field?: string
          trigger_new_value?: string | null
          trigger_old_value?: string | null
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "branding_suggestions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      branding_summary: {
        Row: {
          branding_hash: string | null
          generated_at: string | null
          id: string
          summaries: Json | null
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          branding_hash?: string | null
          generated_at?: string | null
          id?: string
          summaries?: Json | null
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          branding_hash?: string | null
          generated_at?: string | null
          id?: string
          summaries?: Json | null
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "branding_summary_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_comments: {
        Row: {
          author_name: string
          author_role: string
          calendar_post_id: string
          content: string
          created_at: string | null
          id: string
          is_resolved: boolean | null
          share_id: string
        }
        Insert: {
          author_name: string
          author_role?: string
          calendar_post_id: string
          content: string
          created_at?: string | null
          id?: string
          is_resolved?: boolean | null
          share_id: string
        }
        Update: {
          author_name?: string
          author_role?: string
          calendar_post_id?: string
          content?: string
          created_at?: string | null
          id?: string
          is_resolved?: boolean | null
          share_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_comments_calendar_post_id_fkey"
            columns: ["calendar_post_id"]
            isOneToOne: false
            referencedRelation: "calendar_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_comments_share_id_fkey"
            columns: ["share_id"]
            isOneToOne: false
            referencedRelation: "calendar_shares"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_posts: {
        Row: {
          accroche: string | null
          amplification_stories: Json | null
          angle: string | null
          angle_suggestion: string | null
          audience_phase: string | null
          canal: string
          category: string | null
          chapter: number | null
          chapter_label: string | null
          content_draft: string | null
          content_type: string | null
          content_type_emoji: string | null
          created_at: string
          date: string
          format: string | null
          generated_content_id: string | null
          generated_content_type: string | null
          id: string
          launch_id: string | null
          media_urls: string[] | null
          notes: string | null
          objectif: string | null
          objective: string | null
          status: string
          stories_count: number | null
          stories_objective: string | null
          stories_sequence_id: string | null
          stories_structure: string | null
          stories_timing: Json | null
          story_sequence_detail: Json | null
          theme: string
          updated_at: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          accroche?: string | null
          amplification_stories?: Json | null
          angle?: string | null
          angle_suggestion?: string | null
          audience_phase?: string | null
          canal?: string
          category?: string | null
          chapter?: number | null
          chapter_label?: string | null
          content_draft?: string | null
          content_type?: string | null
          content_type_emoji?: string | null
          created_at?: string
          date: string
          format?: string | null
          generated_content_id?: string | null
          generated_content_type?: string | null
          id?: string
          launch_id?: string | null
          media_urls?: string[] | null
          notes?: string | null
          objectif?: string | null
          objective?: string | null
          status?: string
          stories_count?: number | null
          stories_objective?: string | null
          stories_sequence_id?: string | null
          stories_structure?: string | null
          stories_timing?: Json | null
          story_sequence_detail?: Json | null
          theme: string
          updated_at?: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          accroche?: string | null
          amplification_stories?: Json | null
          angle?: string | null
          angle_suggestion?: string | null
          audience_phase?: string | null
          canal?: string
          category?: string | null
          chapter?: number | null
          chapter_label?: string | null
          content_draft?: string | null
          content_type?: string | null
          content_type_emoji?: string | null
          created_at?: string
          date?: string
          format?: string | null
          generated_content_id?: string | null
          generated_content_type?: string | null
          id?: string
          launch_id?: string | null
          media_urls?: string[] | null
          notes?: string | null
          objectif?: string | null
          objective?: string | null
          status?: string
          stories_count?: number | null
          stories_objective?: string | null
          stories_sequence_id?: string | null
          stories_structure?: string | null
          stories_timing?: Json | null
          story_sequence_detail?: Json | null
          theme?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calendar_posts_launch_id_fkey"
            columns: ["launch_id"]
            isOneToOne: false
            referencedRelation: "launches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_posts_stories_sequence_id_fkey"
            columns: ["stories_sequence_id"]
            isOneToOne: false
            referencedRelation: "stories_sequences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_posts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_shares: {
        Row: {
          canal_filter: string | null
          created_at: string | null
          expires_at: string | null
          guest_can_edit_status: boolean
          guest_can_edit_wording: boolean
          guest_name: string | null
          id: string
          is_active: boolean | null
          label: string | null
          share_token: string
          show_columns: Json
          show_content_draft: boolean | null
          user_id: string
          view_mode: string
          workspace_id: string | null
        }
        Insert: {
          canal_filter?: string | null
          created_at?: string | null
          expires_at?: string | null
          guest_can_edit_status?: boolean
          guest_can_edit_wording?: boolean
          guest_name?: string | null
          id?: string
          is_active?: boolean | null
          label?: string | null
          share_token?: string
          show_columns?: Json
          show_content_draft?: boolean | null
          user_id: string
          view_mode?: string
          workspace_id?: string | null
        }
        Update: {
          canal_filter?: string | null
          created_at?: string | null
          expires_at?: string | null
          guest_can_edit_status?: boolean
          guest_can_edit_wording?: boolean
          guest_name?: string | null
          id?: string
          is_active?: boolean | null
          label?: string | null
          share_token?: string
          show_columns?: Json
          show_content_draft?: boolean | null
          user_id?: string
          view_mode?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calendar_shares_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_exercises: {
        Row: {
          app_route: string | null
          created_at: string | null
          created_by: string
          deadline: string | null
          description: string | null
          id: string
          phase_id: string
          sort_order: number | null
          status: string | null
          title: string
          updated_at: string | null
          workspace_id: string
        }
        Insert: {
          app_route?: string | null
          created_at?: string | null
          created_by: string
          deadline?: string | null
          description?: string | null
          id?: string
          phase_id?: string
          sort_order?: number | null
          status?: string | null
          title: string
          updated_at?: string | null
          workspace_id: string
        }
        Update: {
          app_route?: string | null
          created_at?: string | null
          created_by?: string
          deadline?: string | null
          description?: string | null
          id?: string
          phase_id?: string
          sort_order?: number | null
          status?: string | null
          title?: string
          updated_at?: string | null
          workspace_id?: string
        }
        Relationships: []
      }
      coaching_actions: {
        Row: {
          completed: boolean
          completed_at: string | null
          created_at: string
          description: string | null
          due_date: string | null
          id: string
          program_id: string
          session_id: string | null
          title: string
          workspace_id: string | null
        }
        Insert: {
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          program_id: string
          session_id?: string | null
          title: string
          workspace_id?: string | null
        }
        Update: {
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          program_id?: string
          session_id?: string | null
          title?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coaching_actions_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "coaching_programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coaching_actions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "coaching_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coaching_actions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      coaching_deliverables: {
        Row: {
          assigned_session_id: string | null
          created_at: string
          delivered_at: string | null
          file_name: string | null
          file_url: string | null
          id: string
          program_id: string
          route: string | null
          seen_by_client: boolean
          status: string
          title: string
          type: string | null
          unlocked_at: string | null
          workspace_id: string | null
        }
        Insert: {
          assigned_session_id?: string | null
          created_at?: string
          delivered_at?: string | null
          file_name?: string | null
          file_url?: string | null
          id?: string
          program_id: string
          route?: string | null
          seen_by_client?: boolean
          status?: string
          title: string
          type?: string | null
          unlocked_at?: string | null
          workspace_id?: string | null
        }
        Update: {
          assigned_session_id?: string | null
          created_at?: string
          delivered_at?: string | null
          file_name?: string | null
          file_url?: string | null
          id?: string
          program_id?: string
          route?: string | null
          seen_by_client?: boolean
          status?: string
          title?: string
          type?: string | null
          unlocked_at?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coaching_deliverables_assigned_session_id_fkey"
            columns: ["assigned_session_id"]
            isOneToOne: false
            referencedRelation: "coaching_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coaching_deliverables_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "coaching_programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coaching_deliverables_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      coaching_programs: {
        Row: {
          calendly_link: string | null
          client_user_id: string
          coach_user_id: string
          created_at: string
          current_month: number
          current_phase: string
          dashboard_message: string | null
          duration_months: number | null
          end_date: string | null
          formula: string | null
          id: string
          price_monthly: number | null
          start_date: string | null
          status: string
          total_focus_sessions: number | null
          whatsapp_link: string | null
          workspace_id: string | null
        }
        Insert: {
          calendly_link?: string | null
          client_user_id: string
          coach_user_id: string
          created_at?: string
          current_month?: number
          current_phase?: string
          dashboard_message?: string | null
          duration_months?: number | null
          end_date?: string | null
          formula?: string | null
          id?: string
          price_monthly?: number | null
          start_date?: string | null
          status?: string
          total_focus_sessions?: number | null
          whatsapp_link?: string | null
          workspace_id?: string | null
        }
        Update: {
          calendly_link?: string | null
          client_user_id?: string
          coach_user_id?: string
          created_at?: string
          current_month?: number
          current_phase?: string
          dashboard_message?: string | null
          duration_months?: number | null
          end_date?: string | null
          formula?: string | null
          id?: string
          price_monthly?: number | null
          start_date?: string | null
          status?: string
          total_focus_sessions?: number | null
          whatsapp_link?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coaching_programs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      coaching_sessions: {
        Row: {
          created_at: string
          duration_minutes: number
          focus: string | null
          focus_label: string | null
          focus_topic: string | null
          id: string
          laetitia_note: string | null
          meeting_link: string | null
          modules_updated: string[] | null
          phase: string
          prep_notes: string | null
          private_notes: string | null
          program_id: string
          scheduled_date: string | null
          session_number: number
          session_type: string | null
          status: string
          summary: string | null
          title: string | null
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          duration_minutes?: number
          focus?: string | null
          focus_label?: string | null
          focus_topic?: string | null
          id?: string
          laetitia_note?: string | null
          meeting_link?: string | null
          modules_updated?: string[] | null
          phase?: string
          prep_notes?: string | null
          private_notes?: string | null
          program_id: string
          scheduled_date?: string | null
          session_number: number
          session_type?: string | null
          status?: string
          summary?: string | null
          title?: string | null
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          duration_minutes?: number
          focus?: string | null
          focus_label?: string | null
          focus_topic?: string | null
          id?: string
          laetitia_note?: string | null
          meeting_link?: string | null
          modules_updated?: string[] | null
          phase?: string
          prep_notes?: string | null
          private_notes?: string | null
          program_id?: string
          scheduled_date?: string | null
          session_number?: number
          session_type?: string | null
          status?: string
          summary?: string | null
          title?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coaching_sessions_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "coaching_programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coaching_sessions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      communication_plans: {
        Row: {
          active_days: Json | null
          channels: Json | null
          created_at: string | null
          daily_time: number | null
          id: string
          instagram_posts_week: number | null
          instagram_reels_month: number | null
          instagram_stories_week: number | null
          linkedin_posts_week: number | null
          monthly_goal: string | null
          monthly_goal_detail: string | null
          newsletter_frequency: string | null
          updated_at: string | null
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          active_days?: Json | null
          channels?: Json | null
          created_at?: string | null
          daily_time?: number | null
          id?: string
          instagram_posts_week?: number | null
          instagram_reels_month?: number | null
          instagram_stories_week?: number | null
          linkedin_posts_week?: number | null
          monthly_goal?: string | null
          monthly_goal_detail?: string | null
          newsletter_frequency?: string | null
          updated_at?: string | null
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          active_days?: Json | null
          channels?: Json | null
          created_at?: string | null
          daily_time?: number | null
          id?: string
          instagram_posts_week?: number | null
          instagram_reels_month?: number | null
          instagram_stories_week?: number | null
          linkedin_posts_week?: number | null
          monthly_goal?: string | null
          monthly_goal_detail?: string | null
          newsletter_frequency?: string | null
          updated_at?: string | null
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "communication_plans_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      community_comments: {
        Row: {
          content: string
          created_at: string
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      community_posts: {
        Row: {
          category: string
          content: string
          created_at: string
          id: string
          is_studio_only: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: string
          content: string
          created_at?: string
          id?: string
          is_studio_only?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string
          content?: string
          created_at?: string
          id?: string
          is_studio_only?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      community_reactions: {
        Row: {
          created_at: string
          id: string
          post_id: string
          reaction_type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          reaction_type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          reaction_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_reactions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_interactions: {
        Row: {
          ai_generated: boolean | null
          contact_id: string
          content: string | null
          created_at: string
          id: string
          interaction_type: string
          responded: boolean | null
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          ai_generated?: boolean | null
          contact_id: string
          content?: string | null
          created_at?: string
          id?: string
          interaction_type: string
          responded?: boolean | null
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          ai_generated?: boolean | null
          contact_id?: string
          content?: string | null
          created_at?: string
          id?: string
          interaction_type?: string
          responded?: boolean | null
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_interactions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_interactions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          activity: string | null
          contact_type: string
          conversion_amount: number | null
          converted_at: string | null
          created_at: string
          decision_phase: string | null
          display_name: string | null
          id: string
          last_conversation: string | null
          last_dm_context: string | null
          last_interaction_at: string | null
          network_category: string | null
          next_followup_at: string | null
          next_followup_text: string | null
          noted_interest: string | null
          notes: string | null
          platform: string
          potential_value: number | null
          probable_problem: string | null
          prospect_stage: string | null
          relevant_offer: string | null
          source: string | null
          strengths: string | null
          target_offer: string | null
          to_avoid: string | null
          updated_at: string
          user_id: string
          username: string
          workspace_id: string | null
        }
        Insert: {
          activity?: string | null
          contact_type?: string
          conversion_amount?: number | null
          converted_at?: string | null
          created_at?: string
          decision_phase?: string | null
          display_name?: string | null
          id?: string
          last_conversation?: string | null
          last_dm_context?: string | null
          last_interaction_at?: string | null
          network_category?: string | null
          next_followup_at?: string | null
          next_followup_text?: string | null
          noted_interest?: string | null
          notes?: string | null
          platform?: string
          potential_value?: number | null
          probable_problem?: string | null
          prospect_stage?: string | null
          relevant_offer?: string | null
          source?: string | null
          strengths?: string | null
          target_offer?: string | null
          to_avoid?: string | null
          updated_at?: string
          user_id: string
          username: string
          workspace_id?: string | null
        }
        Update: {
          activity?: string | null
          contact_type?: string
          conversion_amount?: number | null
          converted_at?: string | null
          created_at?: string
          decision_phase?: string | null
          display_name?: string | null
          id?: string
          last_conversation?: string | null
          last_dm_context?: string | null
          last_interaction_at?: string | null
          network_category?: string | null
          next_followup_at?: string | null
          next_followup_text?: string | null
          noted_interest?: string | null
          notes?: string | null
          platform?: string
          potential_value?: number | null
          probable_problem?: string | null
          prospect_stage?: string | null
          relevant_offer?: string | null
          source?: string | null
          strengths?: string | null
          target_offer?: string | null
          to_avoid?: string | null
          updated_at?: string
          user_id?: string
          username?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contacts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
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
          workspace_id: string | null
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
          workspace_id?: string | null
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
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_drafts_idea_id_fkey"
            columns: ["idea_id"]
            isOneToOne: false
            referencedRelation: "saved_ideas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_drafts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      content_recycling: {
        Row: {
          created_at: string
          formats_requested: Json | null
          id: string
          results: Json | null
          source_text: string | null
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          formats_requested?: Json | null
          id?: string
          results?: Json | null
          source_text?: string | null
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          formats_requested?: Json | null
          id?: string
          results?: Json | null
          source_text?: string | null
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_recycling_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      content_scores: {
        Row: {
          content_text: string | null
          content_type: string | null
          created_at: string
          global_score: number | null
          id: string
          improvements: Json | null
          scores: Json | null
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          content_text?: string | null
          content_type?: string | null
          created_at?: string
          global_score?: number | null
          id?: string
          improvements?: Json | null
          scores?: Json | null
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          content_text?: string | null
          content_type?: string | null
          created_at?: string
          global_score?: number | null
          id?: string
          improvements?: Json | null
          scores?: Json | null
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_scores_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      demo_profiles: {
        Row: {
          admin_user_id: string
          created_at: string
          demo_activity: string
          demo_instagram: string | null
          demo_name: string
          demo_problem: string | null
          demo_website: string | null
          generated_data: Json | null
          id: string
        }
        Insert: {
          admin_user_id: string
          created_at?: string
          demo_activity: string
          demo_instagram?: string | null
          demo_name: string
          demo_problem?: string | null
          demo_website?: string | null
          generated_data?: Json | null
          id?: string
        }
        Update: {
          admin_user_id?: string
          created_at?: string
          demo_activity?: string
          demo_instagram?: string | null
          demo_name?: string
          demo_problem?: string | null
          demo_website?: string | null
          generated_data?: Json | null
          id?: string
        }
        Relationships: []
      }
      dismissed_suggestions: {
        Row: {
          context_key: string
          dismissed_at: string
          id: string
          suggestion_type: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          context_key: string
          dismissed_at?: string
          id?: string
          suggestion_type: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          context_key?: string
          dismissed_at?: string
          id?: string
          suggestion_type?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dismissed_suggestions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      engagement_checklist_logs: {
        Row: {
          created_at: string | null
          id: string
          items_checked: Json | null
          items_total: number | null
          log_date: string
          streak_maintained: boolean | null
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          items_checked?: Json | null
          items_total?: number | null
          log_date: string
          streak_maintained?: boolean | null
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          items_checked?: Json | null
          items_total?: number | null
          log_date?: string
          streak_maintained?: boolean | null
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "engagement_checklist_logs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      engagement_comments: {
        Row: {
          comment_type: string | null
          contact_id: string | null
          created_at: string | null
          final_text: string | null
          generated_text: string | null
          id: string
          post_caption: string | null
          posted_at: string | null
          prospect_id: string | null
          target_username: string
          user_id: string
          user_intent: string | null
          was_posted: boolean | null
          workspace_id: string | null
        }
        Insert: {
          comment_type?: string | null
          contact_id?: string | null
          created_at?: string | null
          final_text?: string | null
          generated_text?: string | null
          id?: string
          post_caption?: string | null
          posted_at?: string | null
          prospect_id?: string | null
          target_username: string
          user_id: string
          user_intent?: string | null
          was_posted?: boolean | null
          workspace_id?: string | null
        }
        Update: {
          comment_type?: string | null
          contact_id?: string | null
          created_at?: string | null
          final_text?: string | null
          generated_text?: string | null
          id?: string
          post_caption?: string | null
          posted_at?: string | null
          prospect_id?: string | null
          target_username?: string
          user_id?: string
          user_intent?: string | null
          was_posted?: boolean | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "engagement_comments_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "engagement_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagement_comments_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "prospects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagement_comments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      engagement_contacts: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          last_interaction: string | null
          notes: string | null
          pseudo: string
          sort_order: number | null
          tag: string | null
          updated_at: string | null
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          last_interaction?: string | null
          notes?: string | null
          pseudo: string
          sort_order?: number | null
          tag?: string | null
          updated_at?: string | null
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          last_interaction?: string | null
          notes?: string | null
          pseudo?: string
          sort_order?: number | null
          tag?: string | null
          updated_at?: string | null
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "engagement_contacts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      engagement_exercise: {
        Row: {
          completed: boolean | null
          created_at: string | null
          follower_1_done: boolean | null
          follower_1_name: string | null
          follower_2_done: boolean | null
          follower_2_name: string | null
          follower_3_done: boolean | null
          follower_3_name: string | null
          follower_4_done: boolean | null
          follower_4_name: string | null
          follower_5_done: boolean | null
          follower_5_name: string | null
          id: string
          user_id: string
        }
        Insert: {
          completed?: boolean | null
          created_at?: string | null
          follower_1_done?: boolean | null
          follower_1_name?: string | null
          follower_2_done?: boolean | null
          follower_2_name?: string | null
          follower_3_done?: boolean | null
          follower_3_name?: string | null
          follower_4_done?: boolean | null
          follower_4_name?: string | null
          follower_5_done?: boolean | null
          follower_5_name?: string | null
          id?: string
          user_id: string
        }
        Update: {
          completed?: boolean | null
          created_at?: string | null
          follower_1_done?: boolean | null
          follower_1_name?: string | null
          follower_2_done?: boolean | null
          follower_2_name?: string | null
          follower_3_done?: boolean | null
          follower_3_name?: string | null
          follower_4_done?: boolean | null
          follower_4_name?: string | null
          follower_5_done?: boolean | null
          follower_5_name?: string | null
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      engagement_metrics: {
        Row: {
          ai_insight: string | null
          avg_likes: number | null
          avg_reach: number | null
          avg_saves: number | null
          created_at: string | null
          dm_received: number | null
          followers: number | null
          id: string
          launch_dm: number | null
          launch_link_clicks: number | null
          launch_signups: number | null
          launch_story_views: number | null
          link_clicks: number | null
          profile_visits: number | null
          updated_at: string | null
          user_id: string
          week_start: string
          workspace_id: string | null
        }
        Insert: {
          ai_insight?: string | null
          avg_likes?: number | null
          avg_reach?: number | null
          avg_saves?: number | null
          created_at?: string | null
          dm_received?: number | null
          followers?: number | null
          id?: string
          launch_dm?: number | null
          launch_link_clicks?: number | null
          launch_signups?: number | null
          launch_story_views?: number | null
          link_clicks?: number | null
          profile_visits?: number | null
          updated_at?: string | null
          user_id: string
          week_start: string
          workspace_id?: string | null
        }
        Update: {
          ai_insight?: string | null
          avg_likes?: number | null
          avg_reach?: number | null
          avg_saves?: number | null
          created_at?: string | null
          dm_received?: number | null
          followers?: number | null
          id?: string
          launch_dm?: number | null
          launch_link_clicks?: number | null
          launch_signups?: number | null
          launch_story_views?: number | null
          link_clicks?: number | null
          profile_visits?: number | null
          updated_at?: string | null
          user_id?: string
          week_start?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "engagement_metrics_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      engagement_streaks: {
        Row: {
          best_streak: number | null
          created_at: string | null
          current_streak: number | null
          id: string
          last_check_date: string | null
          updated_at: string | null
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          best_streak?: number | null
          created_at?: string | null
          current_streak?: number | null
          id?: string
          last_check_date?: string | null
          updated_at?: string | null
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          best_streak?: number | null
          created_at?: string | null
          current_streak?: number | null
          id?: string
          last_check_date?: string | null
          updated_at?: string | null
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "engagement_streaks_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      engagement_weekly: {
        Row: {
          comments_done: number | null
          comments_target: number | null
          created_at: string | null
          dm_done: number | null
          dm_target: number | null
          id: string
          objective: number | null
          replies_done: number | null
          replies_target: number | null
          total_done: number | null
          updated_at: string | null
          user_id: string
          week_start: string
          workspace_id: string | null
        }
        Insert: {
          comments_done?: number | null
          comments_target?: number | null
          created_at?: string | null
          dm_done?: number | null
          dm_target?: number | null
          id?: string
          objective?: number | null
          replies_done?: number | null
          replies_target?: number | null
          total_done?: number | null
          updated_at?: string | null
          user_id: string
          week_start: string
          workspace_id?: string | null
        }
        Update: {
          comments_done?: number | null
          comments_target?: number | null
          created_at?: string | null
          dm_done?: number | null
          dm_target?: number | null
          id?: string
          objective?: number | null
          replies_done?: number | null
          replies_target?: number | null
          total_done?: number | null
          updated_at?: string | null
          user_id?: string
          week_start?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "engagement_weekly_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      engagement_weekly_linkedin: {
        Row: {
          commented_accounts: Json | null
          comments_done: number | null
          comments_target: number | null
          created_at: string | null
          id: string
          messages_done: number | null
          messages_target: number | null
          objective: number | null
          total_done: number | null
          updated_at: string | null
          user_id: string
          week_start: string
          workspace_id: string | null
        }
        Insert: {
          commented_accounts?: Json | null
          comments_done?: number | null
          comments_target?: number | null
          created_at?: string | null
          id?: string
          messages_done?: number | null
          messages_target?: number | null
          objective?: number | null
          total_done?: number | null
          updated_at?: string | null
          user_id: string
          week_start: string
          workspace_id?: string | null
        }
        Update: {
          commented_accounts?: Json | null
          comments_done?: number | null
          comments_target?: number | null
          created_at?: string | null
          id?: string
          messages_done?: number | null
          messages_target?: number | null
          objective?: number | null
          total_done?: number | null
          updated_at?: string | null
          user_id?: string
          week_start?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "engagement_weekly_linkedin_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      generated_carousels: {
        Row: {
          calendar_post_id: string | null
          caption: string | null
          carousel_type: string
          created_at: string
          hashtags: Json | null
          hook_text: string | null
          id: string
          objective: string | null
          quality_score: number | null
          slide_count: number | null
          slides: Json | null
          status: string
          subject: string | null
          updated_at: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          calendar_post_id?: string | null
          caption?: string | null
          carousel_type: string
          created_at?: string
          hashtags?: Json | null
          hook_text?: string | null
          id?: string
          objective?: string | null
          quality_score?: number | null
          slide_count?: number | null
          slides?: Json | null
          status?: string
          subject?: string | null
          updated_at?: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          calendar_post_id?: string | null
          caption?: string | null
          carousel_type?: string
          created_at?: string
          hashtags?: Json | null
          hook_text?: string | null
          id?: string
          objective?: string | null
          quality_score?: number | null
          slide_count?: number | null
          slides?: Json | null
          status?: string
          subject?: string | null
          updated_at?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "generated_carousels_calendar_post_id_fkey"
            columns: ["calendar_post_id"]
            isOneToOne: false
            referencedRelation: "calendar_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generated_carousels_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
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
          workspace_id: string | null
        }
        Insert: {
          added_to_plan?: boolean
          contenu: string
          created_at?: string
          format: string
          id?: string
          sujet: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          added_to_plan?: boolean
          contenu?: string
          created_at?: string
          format?: string
          id?: string
          sujet?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "generated_posts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
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
          workspace_id: string | null
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
          workspace_id?: string | null
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
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "highlight_categories_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      import_mappings: {
        Row: {
          column_mapping: Json
          created_at: string | null
          date_column: number | null
          date_format: string | null
          file_name: string | null
          headers: Json | null
          id: string
          sheet_name: string | null
          start_row: number | null
          updated_at: string | null
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          column_mapping?: Json
          created_at?: string | null
          date_column?: number | null
          date_format?: string | null
          file_name?: string | null
          headers?: Json | null
          id?: string
          sheet_name?: string | null
          start_row?: number | null
          updated_at?: string | null
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          column_mapping?: Json
          created_at?: string | null
          date_column?: number | null
          date_format?: string | null
          file_name?: string | null
          headers?: Json | null
          id?: string
          sheet_name?: string | null
          start_row?: number | null
          updated_at?: string | null
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "import_mappings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
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
      instagram_audit: {
        Row: {
          best_content: string | null
          best_posts: Json | null
          best_posts_comment: string | null
          combo_gagnant: string | null
          content_analysis: Json | null
          content_dna: Json | null
          created_at: string
          current_rhythm: string | null
          details: Json | null
          editorial_recommendations: Json | null
          id: string
          main_objective: string | null
          posts_analysis: Json | null
          profile_url: string | null
          resume: string | null
          score_bio: number | null
          score_edito: number | null
          score_epingles: number | null
          score_feed: number | null
          score_global: number | null
          score_nom: number | null
          score_stories: number | null
          successful_content_notes: string | null
          unsuccessful_content_notes: string | null
          user_id: string
          workspace_id: string | null
          worst_content: string | null
          worst_posts: Json | null
          worst_posts_comment: string | null
        }
        Insert: {
          best_content?: string | null
          best_posts?: Json | null
          best_posts_comment?: string | null
          combo_gagnant?: string | null
          content_analysis?: Json | null
          content_dna?: Json | null
          created_at?: string
          current_rhythm?: string | null
          details?: Json | null
          editorial_recommendations?: Json | null
          id?: string
          main_objective?: string | null
          posts_analysis?: Json | null
          profile_url?: string | null
          resume?: string | null
          score_bio?: number | null
          score_edito?: number | null
          score_epingles?: number | null
          score_feed?: number | null
          score_global?: number | null
          score_nom?: number | null
          score_stories?: number | null
          successful_content_notes?: string | null
          unsuccessful_content_notes?: string | null
          user_id: string
          workspace_id?: string | null
          worst_content?: string | null
          worst_posts?: Json | null
          worst_posts_comment?: string | null
        }
        Update: {
          best_content?: string | null
          best_posts?: Json | null
          best_posts_comment?: string | null
          combo_gagnant?: string | null
          content_analysis?: Json | null
          content_dna?: Json | null
          created_at?: string
          current_rhythm?: string | null
          details?: Json | null
          editorial_recommendations?: Json | null
          id?: string
          main_objective?: string | null
          posts_analysis?: Json | null
          profile_url?: string | null
          resume?: string | null
          score_bio?: number | null
          score_edito?: number | null
          score_epingles?: number | null
          score_feed?: number | null
          score_global?: number | null
          score_nom?: number | null
          score_stories?: number | null
          successful_content_notes?: string | null
          unsuccessful_content_notes?: string | null
          user_id?: string
          workspace_id?: string | null
          worst_content?: string | null
          worst_posts?: Json | null
          worst_posts_comment?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "instagram_audit_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_audit_posts: {
        Row: {
          ai_analysis: string | null
          audit_id: string | null
          comments: number | null
          created_at: string
          format: string | null
          id: string
          likes: number | null
          performance: string
          reach: number | null
          saves: number | null
          screenshot_url: string | null
          shares: number | null
          subject: string | null
          user_explanation: string | null
          user_id: string
        }
        Insert: {
          ai_analysis?: string | null
          audit_id?: string | null
          comments?: number | null
          created_at?: string
          format?: string | null
          id?: string
          likes?: number | null
          performance?: string
          reach?: number | null
          saves?: number | null
          screenshot_url?: string | null
          shares?: number | null
          subject?: string | null
          user_explanation?: string | null
          user_id: string
        }
        Update: {
          ai_analysis?: string | null
          audit_id?: string | null
          comments?: number | null
          created_at?: string
          format?: string | null
          id?: string
          likes?: number | null
          performance?: string
          reach?: number | null
          saves?: number | null
          screenshot_url?: string | null
          shares?: number | null
          subject?: string | null
          user_explanation?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "instagram_audit_posts_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: false
            referencedRelation: "instagram_audit"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_editorial_line: {
        Row: {
          content_insights: Json | null
          created_at: string
          do_more: string | null
          estimated_weekly_minutes: number | null
          free_notes: string | null
          id: string
          main_objective: string | null
          objective_details: string | null
          pillar_distribution: Json | null
          pillars: Json | null
          posts_frequency: string | null
          preferred_formats: Json | null
          recommended_rhythm: string | null
          source: string | null
          stop_doing: string | null
          stories_frequency: string | null
          time_available: string | null
          time_budget_minutes: number | null
          updated_at: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          content_insights?: Json | null
          created_at?: string
          do_more?: string | null
          estimated_weekly_minutes?: number | null
          free_notes?: string | null
          id?: string
          main_objective?: string | null
          objective_details?: string | null
          pillar_distribution?: Json | null
          pillars?: Json | null
          posts_frequency?: string | null
          preferred_formats?: Json | null
          recommended_rhythm?: string | null
          source?: string | null
          stop_doing?: string | null
          stories_frequency?: string | null
          time_available?: string | null
          time_budget_minutes?: number | null
          updated_at?: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          content_insights?: Json | null
          created_at?: string
          do_more?: string | null
          estimated_weekly_minutes?: number | null
          free_notes?: string | null
          id?: string
          main_objective?: string | null
          objective_details?: string | null
          pillar_distribution?: Json | null
          pillars?: Json | null
          posts_frequency?: string | null
          preferred_formats?: Json | null
          recommended_rhythm?: string | null
          source?: string | null
          stop_doing?: string | null
          stories_frequency?: string | null
          time_available?: string | null
          time_budget_minutes?: number | null
          updated_at?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "instagram_editorial_line_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_highlights: {
        Row: {
          created_at: string
          emoji: string | null
          id: string
          is_selected: boolean | null
          role: string | null
          sort_order: number | null
          stories: Json | null
          title: string
          updated_at: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          emoji?: string | null
          id?: string
          is_selected?: boolean | null
          role?: string | null
          sort_order?: number | null
          stories?: Json | null
          title: string
          updated_at?: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          emoji?: string | null
          id?: string
          is_selected?: boolean | null
          role?: string | null
          sort_order?: number | null
          stories?: Json | null
          title?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "instagram_highlights_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_highlights_questions: {
        Row: {
          client_journey: string | null
          created_at: string
          frequent_questions: string | null
          id: string
          recurring_content: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          client_journey?: string | null
          created_at?: string
          frequent_questions?: string | null
          id?: string
          recurring_content?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          client_journey?: string | null
          created_at?: string
          frequent_questions?: string | null
          id?: string
          recurring_content?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      instagram_inspirations: {
        Row: {
          adapted_content: string | null
          analysis: Json | null
          created_at: string
          id: string
          objective: string | null
          pillar: string | null
          recommended_format: string | null
          saved_to_ideas: boolean | null
          source_text: string | null
          source_url: string | null
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          adapted_content?: string | null
          analysis?: Json | null
          created_at?: string
          id?: string
          objective?: string | null
          pillar?: string | null
          recommended_format?: string | null
          saved_to_ideas?: boolean | null
          source_text?: string | null
          source_url?: string | null
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          adapted_content?: string | null
          analysis?: Json | null
          created_at?: string
          id?: string
          objective?: string | null
          pillar?: string | null
          recommended_format?: string | null
          saved_to_ideas?: boolean | null
          source_text?: string | null
          source_url?: string | null
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "instagram_inspirations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_pinned_posts: {
        Row: {
          created_at: string
          existing_description: string | null
          generated_accroche: string | null
          generated_content: string | null
          generated_format: string | null
          has_existing: boolean | null
          id: string
          is_pinned: boolean | null
          post_type: string
          updated_at: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          existing_description?: string | null
          generated_accroche?: string | null
          generated_content?: string | null
          generated_format?: string | null
          has_existing?: boolean | null
          id?: string
          is_pinned?: boolean | null
          post_type: string
          updated_at?: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          existing_description?: string | null
          generated_accroche?: string | null
          generated_content?: string | null
          generated_format?: string | null
          has_existing?: boolean | null
          id?: string
          is_pinned?: boolean | null
          post_type?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "instagram_pinned_posts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_weekly_stats: {
        Row: {
          ai_analysis: string | null
          best_post: string | null
          best_reel: string | null
          comments_made: number | null
          comments_received: number | null
          created_at: string | null
          dm_received: number | null
          dm_sent: number | null
          followers: number | null
          id: string
          launch_conversions: number | null
          launch_dms: number | null
          launch_link_clicks: number | null
          launch_signups: number | null
          launch_story_views: number | null
          link_clicks: number | null
          new_followers: number | null
          posts_comments_avg: number | null
          posts_count: number | null
          posts_likes_avg: number | null
          posts_reach_avg: number | null
          posts_saves_avg: number | null
          posts_shares_avg: number | null
          profile_visits: number | null
          reels_count: number | null
          reels_likes_avg: number | null
          reels_saves_avg: number | null
          reels_shares_avg: number | null
          reels_views_avg: number | null
          stories_count: number | null
          stories_replies: number | null
          stories_retention_pct: number | null
          stories_sticker_clicks: number | null
          stories_views_avg: number | null
          updated_at: string | null
          user_id: string
          week_end: string
          week_start: string
          workspace_id: string | null
        }
        Insert: {
          ai_analysis?: string | null
          best_post?: string | null
          best_reel?: string | null
          comments_made?: number | null
          comments_received?: number | null
          created_at?: string | null
          dm_received?: number | null
          dm_sent?: number | null
          followers?: number | null
          id?: string
          launch_conversions?: number | null
          launch_dms?: number | null
          launch_link_clicks?: number | null
          launch_signups?: number | null
          launch_story_views?: number | null
          link_clicks?: number | null
          new_followers?: number | null
          posts_comments_avg?: number | null
          posts_count?: number | null
          posts_likes_avg?: number | null
          posts_reach_avg?: number | null
          posts_saves_avg?: number | null
          posts_shares_avg?: number | null
          profile_visits?: number | null
          reels_count?: number | null
          reels_likes_avg?: number | null
          reels_saves_avg?: number | null
          reels_shares_avg?: number | null
          reels_views_avg?: number | null
          stories_count?: number | null
          stories_replies?: number | null
          stories_retention_pct?: number | null
          stories_sticker_clicks?: number | null
          stories_views_avg?: number | null
          updated_at?: string | null
          user_id: string
          week_end: string
          week_start: string
          workspace_id?: string | null
        }
        Update: {
          ai_analysis?: string | null
          best_post?: string | null
          best_reel?: string | null
          comments_made?: number | null
          comments_received?: number | null
          created_at?: string | null
          dm_received?: number | null
          dm_sent?: number | null
          followers?: number | null
          id?: string
          launch_conversions?: number | null
          launch_dms?: number | null
          launch_link_clicks?: number | null
          launch_signups?: number | null
          launch_story_views?: number | null
          link_clicks?: number | null
          new_followers?: number | null
          posts_comments_avg?: number | null
          posts_count?: number | null
          posts_likes_avg?: number | null
          posts_reach_avg?: number | null
          posts_saves_avg?: number | null
          posts_shares_avg?: number | null
          profile_visits?: number | null
          reels_count?: number | null
          reels_likes_avg?: number | null
          reels_saves_avg?: number | null
          reels_shares_avg?: number | null
          reels_views_avg?: number | null
          stories_count?: number | null
          stories_replies?: number | null
          stories_retention_pct?: number | null
          stories_sticker_clicks?: number | null
          stories_views_avg?: number | null
          updated_at?: string | null
          user_id?: string
          week_end?: string
          week_start?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "instagram_weekly_stats_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      intake_questionnaires: {
        Row: {
          completed_at: string | null
          created_at: string
          extracted_data: Json | null
          id: string
          is_complete: boolean | null
          kickoff_summary: string | null
          messages: Json | null
          missing_topics: Json | null
          program_id: string | null
          question_count: number | null
          suggested_agenda: Json | null
          updated_at: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          extracted_data?: Json | null
          id?: string
          is_complete?: boolean | null
          kickoff_summary?: string | null
          messages?: Json | null
          missing_topics?: Json | null
          program_id?: string | null
          question_count?: number | null
          suggested_agenda?: Json | null
          updated_at?: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          extracted_data?: Json | null
          id?: string
          is_complete?: boolean | null
          kickoff_summary?: string | null
          messages?: Json | null
          missing_topics?: Json | null
          program_id?: string | null
          question_count?: number | null
          suggested_agenda?: Json | null
          updated_at?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "intake_questionnaires_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "coaching_programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intake_questionnaires_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      launch_plan_contents: {
        Row: {
          accroche: string | null
          added_to_calendar: boolean | null
          angle_suggestion: string | null
          audience_phase: string | null
          audience_phase_emoji: string | null
          category: string | null
          chapter: number | null
          chapter_label: string | null
          content_date: string
          content_type: string | null
          content_type_emoji: string | null
          contenu: string | null
          created_at: string
          format: string | null
          id: string
          is_edited: boolean | null
          launch_id: string
          objectif: string | null
          objective: string | null
          phase: string
          ratio_category: string | null
          sent_to_calendar: boolean | null
          sort_order: number | null
          story_sequence_detail: Json | null
          tip: string | null
          updated_at: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          accroche?: string | null
          added_to_calendar?: boolean | null
          angle_suggestion?: string | null
          audience_phase?: string | null
          audience_phase_emoji?: string | null
          category?: string | null
          chapter?: number | null
          chapter_label?: string | null
          content_date: string
          content_type?: string | null
          content_type_emoji?: string | null
          contenu?: string | null
          created_at?: string
          format?: string | null
          id?: string
          is_edited?: boolean | null
          launch_id: string
          objectif?: string | null
          objective?: string | null
          phase: string
          ratio_category?: string | null
          sent_to_calendar?: boolean | null
          sort_order?: number | null
          story_sequence_detail?: Json | null
          tip?: string | null
          updated_at?: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          accroche?: string | null
          added_to_calendar?: boolean | null
          angle_suggestion?: string | null
          audience_phase?: string | null
          audience_phase_emoji?: string | null
          category?: string | null
          chapter?: number | null
          chapter_label?: string | null
          content_date?: string
          content_type?: string | null
          content_type_emoji?: string | null
          contenu?: string | null
          created_at?: string
          format?: string | null
          id?: string
          is_edited?: boolean | null
          launch_id?: string
          objectif?: string | null
          objective?: string | null
          phase?: string
          ratio_category?: string | null
          sent_to_calendar?: boolean | null
          sort_order?: number | null
          story_sequence_detail?: Json | null
          tip?: string | null
          updated_at?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "launch_plan_contents_launch_id_fkey"
            columns: ["launch_id"]
            isOneToOne: false
            referencedRelation: "launches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "launch_plan_contents_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      launches: {
        Row: {
          audience_size: string | null
          checklist_post: Json | null
          checklist_pre: Json | null
          created_at: string
          extra_weekly_hours: number | null
          free_resource: string | null
          id: string
          launch_model: string | null
          name: string
          objections: string | null
          offer_type: string | null
          phases: Json | null
          plan_generated: boolean | null
          plan_sent_to_calendar: boolean | null
          price_range: string | null
          promise: string | null
          recurrence: string | null
          retrospective: Json | null
          sale_end: string | null
          sale_start: string | null
          selected_contents: string[] | null
          status: string
          teasing_end: string | null
          teasing_start: string | null
          template_type: string | null
          updated_at: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          audience_size?: string | null
          checklist_post?: Json | null
          checklist_pre?: Json | null
          created_at?: string
          extra_weekly_hours?: number | null
          free_resource?: string | null
          id?: string
          launch_model?: string | null
          name?: string
          objections?: string | null
          offer_type?: string | null
          phases?: Json | null
          plan_generated?: boolean | null
          plan_sent_to_calendar?: boolean | null
          price_range?: string | null
          promise?: string | null
          recurrence?: string | null
          retrospective?: Json | null
          sale_end?: string | null
          sale_start?: string | null
          selected_contents?: string[] | null
          status?: string
          teasing_end?: string | null
          teasing_start?: string | null
          template_type?: string | null
          updated_at?: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          audience_size?: string | null
          checklist_post?: Json | null
          checklist_pre?: Json | null
          created_at?: string
          extra_weekly_hours?: number | null
          free_resource?: string | null
          id?: string
          launch_model?: string | null
          name?: string
          objections?: string | null
          offer_type?: string | null
          phases?: Json | null
          plan_generated?: boolean | null
          plan_sent_to_calendar?: boolean | null
          price_range?: string | null
          promise?: string | null
          recurrence?: string | null
          retrospective?: Json | null
          sale_end?: string | null
          sale_start?: string | null
          selected_contents?: string[] | null
          status?: string
          teasing_end?: string | null
          teasing_start?: string | null
          template_type?: string | null
          updated_at?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "launches_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      linkedin_audit: {
        Row: {
          acceptance_policy: string | null
          accroche_style: string | null
          audit_result: Json | null
          avg_views: string | null
          connection_types: Json | null
          connections_count: string | null
          content_types: Json | null
          created_at: string
          current_rhythm: string | null
          engagement_type: string | null
          id: string
          inbound_requests: string | null
          objective: string | null
          proactive_requests: string | null
          profile_url: string | null
          publication_org: string | null
          recommendations_count: string | null
          recycling: string | null
          score_contenu: number | null
          score_global: number | null
          score_profil: number | null
          score_reseau: number | null
          score_strategie: number | null
          screenshots: Json | null
          top_priorities: Json | null
          updated_at: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          acceptance_policy?: string | null
          accroche_style?: string | null
          audit_result?: Json | null
          avg_views?: string | null
          connection_types?: Json | null
          connections_count?: string | null
          content_types?: Json | null
          created_at?: string
          current_rhythm?: string | null
          engagement_type?: string | null
          id?: string
          inbound_requests?: string | null
          objective?: string | null
          proactive_requests?: string | null
          profile_url?: string | null
          publication_org?: string | null
          recommendations_count?: string | null
          recycling?: string | null
          score_contenu?: number | null
          score_global?: number | null
          score_profil?: number | null
          score_reseau?: number | null
          score_strategie?: number | null
          screenshots?: Json | null
          top_priorities?: Json | null
          updated_at?: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          acceptance_policy?: string | null
          accroche_style?: string | null
          audit_result?: Json | null
          avg_views?: string | null
          connection_types?: Json | null
          connections_count?: string | null
          content_types?: Json | null
          created_at?: string
          current_rhythm?: string | null
          engagement_type?: string | null
          id?: string
          inbound_requests?: string | null
          objective?: string | null
          proactive_requests?: string | null
          profile_url?: string | null
          publication_org?: string | null
          recommendations_count?: string | null
          recycling?: string | null
          score_contenu?: number | null
          score_global?: number | null
          score_profil?: number | null
          score_reseau?: number | null
          score_strategie?: number | null
          screenshots?: Json | null
          top_priorities?: Json | null
          updated_at?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "linkedin_audit_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      linkedin_comment_strategy: {
        Row: {
          accounts: Json | null
          created_at: string
          id: string
          updated_at: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          accounts?: Json | null
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          accounts?: Json | null
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "linkedin_comment_strategy_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      linkedin_experiences: {
        Row: {
          company: string | null
          created_at: string | null
          description_optimized: string | null
          description_raw: string | null
          id: string
          job_title: string | null
          sort_order: number | null
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          company?: string | null
          created_at?: string | null
          description_optimized?: string | null
          description_raw?: string | null
          id?: string
          job_title?: string | null
          sort_order?: number | null
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          company?: string | null
          created_at?: string | null
          description_optimized?: string | null
          description_raw?: string | null
          id?: string
          job_title?: string | null
          sort_order?: number | null
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "linkedin_experiences_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      linkedin_profile: {
        Row: {
          banner_done: boolean | null
          created_at: string | null
          creator_mode_done: boolean | null
          custom_url: string | null
          featured_done: boolean | null
          id: string
          photo_done: boolean | null
          resume_analysis: Json | null
          resume_current: string | null
          resume_generated: string | null
          resume_score: number | null
          resume_updated_at: string | null
          summary_final: string | null
          summary_pro: string | null
          summary_storytelling: string | null
          title: string | null
          title_done: boolean | null
          updated_at: string | null
          url_done: boolean | null
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          banner_done?: boolean | null
          created_at?: string | null
          creator_mode_done?: boolean | null
          custom_url?: string | null
          featured_done?: boolean | null
          id?: string
          photo_done?: boolean | null
          resume_analysis?: Json | null
          resume_current?: string | null
          resume_generated?: string | null
          resume_score?: number | null
          resume_updated_at?: string | null
          summary_final?: string | null
          summary_pro?: string | null
          summary_storytelling?: string | null
          title?: string | null
          title_done?: boolean | null
          updated_at?: string | null
          url_done?: boolean | null
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          banner_done?: boolean | null
          created_at?: string | null
          creator_mode_done?: boolean | null
          custom_url?: string | null
          featured_done?: boolean | null
          id?: string
          photo_done?: boolean | null
          resume_analysis?: Json | null
          resume_current?: string | null
          resume_generated?: string | null
          resume_score?: number | null
          resume_updated_at?: string | null
          summary_final?: string | null
          summary_pro?: string | null
          summary_storytelling?: string | null
          title?: string | null
          title_done?: boolean | null
          updated_at?: string | null
          url_done?: boolean | null
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "linkedin_profile_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      linkedin_recommendations: {
        Row: {
          created_at: string | null
          id: string
          person_name: string | null
          person_type: string | null
          reco_received: boolean | null
          request_sent: boolean | null
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          person_name?: string | null
          person_type?: string | null
          reco_received?: boolean | null
          request_sent?: boolean | null
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          person_name?: string | null
          person_type?: string | null
          reco_received?: boolean | null
          request_sent?: boolean | null
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "linkedin_recommendations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      live_questions: {
        Row: {
          created_at: string
          id: string
          live_id: string
          question: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          live_id: string
          question: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          live_id?: string
          question?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "live_questions_live_id_fkey"
            columns: ["live_id"]
            isOneToOne: false
            referencedRelation: "lives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_questions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      live_reminders: {
        Row: {
          created_at: string
          id: string
          live_id: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          live_id: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          live_id?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "live_reminders_live_id_fkey"
            columns: ["live_id"]
            isOneToOne: false
            referencedRelation: "lives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_reminders_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      lives: {
        Row: {
          created_at: string
          description: string | null
          duration_minutes: number | null
          id: string
          live_type: string
          meeting_link: string | null
          replay_url: string | null
          scheduled_at: string | null
          status: string
          title: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          duration_minutes?: number | null
          id?: string
          live_type?: string
          meeting_link?: string | null
          replay_url?: string | null
          scheduled_at?: string | null
          status?: string
          title: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          duration_minutes?: number | null
          id?: string
          live_type?: string
          meeting_link?: string | null
          replay_url?: string | null
          scheduled_at?: string | null
          status?: string
          title?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lives_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      monthly_stats: {
        Row: {
          accounts_engaged: number | null
          ad_budget: number | null
          ai_analysis: string | null
          ai_analyzed_at: string | null
          business_data: Json | null
          clients_signed: number | null
          content_published: string | null
          created_at: string | null
          custom_data: Json | null
          discovery_calls: number | null
          email_signups: number | null
          followers: number | null
          followers_engaged: number | null
          followers_gained: number | null
          followers_lost: number | null
          ga4_users: number | null
          has_launch: boolean | null
          id: string
          interactions: number | null
          launch_conversions: number | null
          launch_data: Json | null
          launch_dms: number | null
          launch_link_clicks: number | null
          launch_name: string | null
          launch_signups: number | null
          launch_story_views: number | null
          month_date: string
          newsletter_subscribers: number | null
          objective: string | null
          page_views_academy: number | null
          page_views_agency: number | null
          page_views_plan: number | null
          profile_visits: number | null
          reach: number | null
          revenue: number | null
          sales_pages_data: Json | null
          stories_coverage: number | null
          traffic_instagram: number | null
          traffic_pinterest: number | null
          traffic_search: number | null
          traffic_social: number | null
          updated_at: string | null
          user_id: string
          views: number | null
          website_clicks: number | null
          website_data: Json | null
          website_visitors: number | null
          workspace_id: string | null
        }
        Insert: {
          accounts_engaged?: number | null
          ad_budget?: number | null
          ai_analysis?: string | null
          ai_analyzed_at?: string | null
          business_data?: Json | null
          clients_signed?: number | null
          content_published?: string | null
          created_at?: string | null
          custom_data?: Json | null
          discovery_calls?: number | null
          email_signups?: number | null
          followers?: number | null
          followers_engaged?: number | null
          followers_gained?: number | null
          followers_lost?: number | null
          ga4_users?: number | null
          has_launch?: boolean | null
          id?: string
          interactions?: number | null
          launch_conversions?: number | null
          launch_data?: Json | null
          launch_dms?: number | null
          launch_link_clicks?: number | null
          launch_name?: string | null
          launch_signups?: number | null
          launch_story_views?: number | null
          month_date: string
          newsletter_subscribers?: number | null
          objective?: string | null
          page_views_academy?: number | null
          page_views_agency?: number | null
          page_views_plan?: number | null
          profile_visits?: number | null
          reach?: number | null
          revenue?: number | null
          sales_pages_data?: Json | null
          stories_coverage?: number | null
          traffic_instagram?: number | null
          traffic_pinterest?: number | null
          traffic_search?: number | null
          traffic_social?: number | null
          updated_at?: string | null
          user_id: string
          views?: number | null
          website_clicks?: number | null
          website_data?: Json | null
          website_visitors?: number | null
          workspace_id?: string | null
        }
        Update: {
          accounts_engaged?: number | null
          ad_budget?: number | null
          ai_analysis?: string | null
          ai_analyzed_at?: string | null
          business_data?: Json | null
          clients_signed?: number | null
          content_published?: string | null
          created_at?: string | null
          custom_data?: Json | null
          discovery_calls?: number | null
          email_signups?: number | null
          followers?: number | null
          followers_engaged?: number | null
          followers_gained?: number | null
          followers_lost?: number | null
          ga4_users?: number | null
          has_launch?: boolean | null
          id?: string
          interactions?: number | null
          launch_conversions?: number | null
          launch_data?: Json | null
          launch_dms?: number | null
          launch_link_clicks?: number | null
          launch_name?: string | null
          launch_signups?: number | null
          launch_story_views?: number | null
          month_date?: string
          newsletter_subscribers?: number | null
          objective?: string | null
          page_views_academy?: number | null
          page_views_agency?: number | null
          page_views_plan?: number | null
          profile_visits?: number | null
          reach?: number | null
          revenue?: number | null
          sales_pages_data?: Json | null
          stories_coverage?: number | null
          traffic_instagram?: number | null
          traffic_pinterest?: number | null
          traffic_search?: number | null
          traffic_social?: number | null
          updated_at?: string | null
          user_id?: string
          views?: number | null
          website_clicks?: number | null
          website_data?: Json | null
          website_visitors?: number | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "monthly_stats_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          link: string | null
          message: string
          read: boolean
          title: string
          type: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          link?: string | null
          message: string
          read?: boolean
          title: string
          type?: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          link?: string | null
          message?: string
          read?: boolean
          title?: string
          type?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      offers: {
        Row: {
          benefits: Json | null
          completed: boolean | null
          completion_pct: number | null
          created_at: string
          current_step: number | null
          description_short: string | null
          emotional_after: string | null
          emotional_before: string | null
          features: Json | null
          features_to_benefits: Json | null
          feelings_after: Json | null
          id: string
          includes: Json | null
          linked_freebie_id: string | null
          name: string
          objection_handler: string | null
          objections: Json | null
          offer_type: string
          price_amount: number | null
          price_text: string | null
          problem_deep: string | null
          problem_surface: string | null
          promise: string | null
          promise_long: string | null
          sales_line: string | null
          target: string | null
          target_ideal: string | null
          target_not_for: string | null
          testimonials: Json | null
          trigger_situation: string | null
          updated_at: string
          url_booking: string | null
          url_sales_page: string | null
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          benefits?: Json | null
          completed?: boolean | null
          completion_pct?: number | null
          created_at?: string
          current_step?: number | null
          description_short?: string | null
          emotional_after?: string | null
          emotional_before?: string | null
          features?: Json | null
          features_to_benefits?: Json | null
          feelings_after?: Json | null
          id?: string
          includes?: Json | null
          linked_freebie_id?: string | null
          name?: string
          objection_handler?: string | null
          objections?: Json | null
          offer_type?: string
          price_amount?: number | null
          price_text?: string | null
          problem_deep?: string | null
          problem_surface?: string | null
          promise?: string | null
          promise_long?: string | null
          sales_line?: string | null
          target?: string | null
          target_ideal?: string | null
          target_not_for?: string | null
          testimonials?: Json | null
          trigger_situation?: string | null
          updated_at?: string
          url_booking?: string | null
          url_sales_page?: string | null
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          benefits?: Json | null
          completed?: boolean | null
          completion_pct?: number | null
          created_at?: string
          current_step?: number | null
          description_short?: string | null
          emotional_after?: string | null
          emotional_before?: string | null
          features?: Json | null
          features_to_benefits?: Json | null
          feelings_after?: Json | null
          id?: string
          includes?: Json | null
          linked_freebie_id?: string | null
          name?: string
          objection_handler?: string | null
          objections?: Json | null
          offer_type?: string
          price_amount?: number | null
          price_text?: string | null
          problem_deep?: string | null
          problem_surface?: string | null
          promise?: string | null
          promise_long?: string | null
          sales_line?: string | null
          target?: string | null
          target_ideal?: string | null
          target_not_for?: string | null
          testimonials?: Json | null
          trigger_situation?: string | null
          updated_at?: string
          url_booking?: string | null
          url_sales_page?: string | null
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "offers_linked_freebie_fkey"
            columns: ["linked_freebie_id"]
            isOneToOne: false
            referencedRelation: "offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      persona: {
        Row: {
          brands: Json | null
          buying_triggers: Json | null
          channels: string[] | null
          completed: boolean | null
          created_at: string
          current_step: number | null
          daily_life: string | null
          demographics: Json | null
          description: string | null
          desires: Json | null
          frustrations_detail: Json | null
          id: string
          is_primary: boolean
          label: string | null
          motivations: Json | null
          objections: Json | null
          persona_channels: Json | null
          pitch_long: string | null
          pitch_medium: string | null
          pitch_short: string | null
          portrait: Json | null
          portrait_prenom: string | null
          quote: string | null
          starting_point: string | null
          step_1_frustrations: string | null
          step_2_transformation: string | null
          step_3a_objections: string | null
          step_3b_cliches: string | null
          step_4_beautiful: string | null
          step_4_feeling: string | null
          step_4_inspiring: string | null
          step_4_pinterest_url: string | null
          step_4_repulsive: string | null
          step_5_actions: string | null
          updated_at: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          brands?: Json | null
          buying_triggers?: Json | null
          channels?: string[] | null
          completed?: boolean | null
          created_at?: string
          current_step?: number | null
          daily_life?: string | null
          demographics?: Json | null
          description?: string | null
          desires?: Json | null
          frustrations_detail?: Json | null
          id?: string
          is_primary?: boolean
          label?: string | null
          motivations?: Json | null
          objections?: Json | null
          persona_channels?: Json | null
          pitch_long?: string | null
          pitch_medium?: string | null
          pitch_short?: string | null
          portrait?: Json | null
          portrait_prenom?: string | null
          quote?: string | null
          starting_point?: string | null
          step_1_frustrations?: string | null
          step_2_transformation?: string | null
          step_3a_objections?: string | null
          step_3b_cliches?: string | null
          step_4_beautiful?: string | null
          step_4_feeling?: string | null
          step_4_inspiring?: string | null
          step_4_pinterest_url?: string | null
          step_4_repulsive?: string | null
          step_5_actions?: string | null
          updated_at?: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          brands?: Json | null
          buying_triggers?: Json | null
          channels?: string[] | null
          completed?: boolean | null
          created_at?: string
          current_step?: number | null
          daily_life?: string | null
          demographics?: Json | null
          description?: string | null
          desires?: Json | null
          frustrations_detail?: Json | null
          id?: string
          is_primary?: boolean
          label?: string | null
          motivations?: Json | null
          objections?: Json | null
          persona_channels?: Json | null
          pitch_long?: string | null
          pitch_medium?: string | null
          pitch_short?: string | null
          portrait?: Json | null
          portrait_prenom?: string | null
          quote?: string | null
          starting_point?: string | null
          step_1_frustrations?: string | null
          step_2_transformation?: string | null
          step_3a_objections?: string | null
          step_3b_cliches?: string | null
          step_4_beautiful?: string | null
          step_4_feeling?: string | null
          step_4_inspiring?: string | null
          step_4_pinterest_url?: string | null
          step_4_repulsive?: string | null
          step_5_actions?: string | null
          updated_at?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "persona_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      pinterest_boards: {
        Row: {
          board_type: string | null
          created_at: string | null
          description: string | null
          id: string
          name: string
          sort_order: number | null
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          board_type?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          sort_order?: number | null
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          board_type?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          sort_order?: number | null
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pinterest_boards_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      pinterest_keywords: {
        Row: {
          checklist_bio: boolean | null
          checklist_board_desc: boolean | null
          checklist_pin_desc: boolean | null
          checklist_pin_titles: boolean | null
          checklist_profile_name: boolean | null
          checklist_titles: boolean | null
          created_at: string | null
          id: string
          keywords_english: string[] | null
          keywords_inspiration: string[] | null
          keywords_need: string[] | null
          keywords_product: string[] | null
          keywords_raw: string | null
          updated_at: string | null
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          checklist_bio?: boolean | null
          checklist_board_desc?: boolean | null
          checklist_pin_desc?: boolean | null
          checklist_pin_titles?: boolean | null
          checklist_profile_name?: boolean | null
          checklist_titles?: boolean | null
          created_at?: string | null
          id?: string
          keywords_english?: string[] | null
          keywords_inspiration?: string[] | null
          keywords_need?: string[] | null
          keywords_product?: string[] | null
          keywords_raw?: string | null
          updated_at?: string | null
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          checklist_bio?: boolean | null
          checklist_board_desc?: boolean | null
          checklist_pin_desc?: boolean | null
          checklist_pin_titles?: boolean | null
          checklist_profile_name?: boolean | null
          checklist_titles?: boolean | null
          created_at?: string | null
          id?: string
          keywords_english?: string[] | null
          keywords_inspiration?: string[] | null
          keywords_need?: string[] | null
          keywords_product?: string[] | null
          keywords_raw?: string | null
          updated_at?: string | null
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pinterest_keywords_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      pinterest_pins: {
        Row: {
          board_id: string | null
          created_at: string | null
          description: string | null
          id: string
          link_url: string | null
          subject: string | null
          title: string | null
          user_id: string
          variant_type: string | null
          workspace_id: string | null
        }
        Insert: {
          board_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          link_url?: string | null
          subject?: string | null
          title?: string | null
          user_id: string
          variant_type?: string | null
          workspace_id?: string | null
        }
        Update: {
          board_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          link_url?: string | null
          subject?: string | null
          title?: string | null
          user_id?: string
          variant_type?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pinterest_pins_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "pinterest_boards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pinterest_pins_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      pinterest_profile: {
        Row: {
          bio: string | null
          bio_done: boolean | null
          created_at: string | null
          display_name: string | null
          id: string
          name_done: boolean | null
          photo_done: boolean | null
          pro_account_done: boolean | null
          updated_at: string | null
          url_done: boolean | null
          user_id: string
          website_url: string | null
          workspace_id: string | null
        }
        Insert: {
          bio?: string | null
          bio_done?: boolean | null
          created_at?: string | null
          display_name?: string | null
          id?: string
          name_done?: boolean | null
          photo_done?: boolean | null
          pro_account_done?: boolean | null
          updated_at?: string | null
          url_done?: boolean | null
          user_id: string
          website_url?: string | null
          workspace_id?: string | null
        }
        Update: {
          bio?: string | null
          bio_done?: boolean | null
          created_at?: string | null
          display_name?: string | null
          id?: string
          name_done?: boolean | null
          photo_done?: boolean | null
          pro_account_done?: boolean | null
          updated_at?: string | null
          url_done?: boolean | null
          user_id?: string
          website_url?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pinterest_profile_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      pinterest_routine: {
        Row: {
          created_at: string | null
          current_month: string | null
          id: string
          keywords_adjusted: boolean | null
          links_checked: boolean | null
          pins_done: number | null
          pins_target: number | null
          recycled_done: boolean | null
          rhythm: string | null
          stats_checked: boolean | null
          top_pins_noted: boolean | null
          updated_at: string | null
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string | null
          current_month?: string | null
          id?: string
          keywords_adjusted?: boolean | null
          links_checked?: boolean | null
          pins_done?: number | null
          pins_target?: number | null
          recycled_done?: boolean | null
          rhythm?: string | null
          stats_checked?: boolean | null
          top_pins_noted?: boolean | null
          updated_at?: string | null
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string | null
          current_month?: string | null
          id?: string
          keywords_adjusted?: boolean | null
          links_checked?: boolean | null
          pins_done?: number | null
          pins_target?: number | null
          recycled_done?: boolean | null
          rhythm?: string | null
          stats_checked?: boolean | null
          top_pins_noted?: boolean | null
          updated_at?: string | null
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pinterest_routine_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_step_overrides: {
        Row: {
          created_at: string
          id: string
          status: string
          step_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          status?: string
          step_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          status?: string
          step_id?: string
          user_id?: string
        }
        Relationships: []
      }
      plan_step_visibility: {
        Row: {
          hidden: boolean | null
          hidden_by: string | null
          id: string
          step_id: string
          updated_at: string | null
          workspace_id: string
        }
        Insert: {
          hidden?: boolean | null
          hidden_by?: string | null
          id?: string
          step_id: string
          updated_at?: string | null
          workspace_id: string
        }
        Update: {
          hidden?: boolean | null
          hidden_by?: string | null
          id?: string
          step_id?: string
          updated_at?: string | null
          workspace_id?: string
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
          workspace_id: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          id?: string
          is_completed?: boolean
          task_index: number
          user_id: string
          week_number: number
          workspace_id?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          id?: string
          is_completed?: boolean
          task_index?: number
          user_id?: string
          week_number?: number
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "plan_tasks_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          activite: string
          activity_detail: string | null
          bio_cta_text: string | null
          bio_cta_type: string | null
          bio_generator_answers: Json | null
          bonus_credits: number
          canaux: string[]
          ce_quon_evite: string
          cible: string
          created_at: string
          croyances_limitantes: string
          current_plan: string | null
          differentiation_text: string | null
          differentiation_type: string | null
          email: string | null
          expressions_cles: string
          id: string
          instagram_bio: string | null
          instagram_bio_link: string | null
          instagram_display_name: string | null
          instagram_feed_description: string | null
          instagram_feed_screenshot_url: string | null
          instagram_followers: number | null
          instagram_frequency: string | null
          instagram_highlights: Json | null
          instagram_highlights_count: number | null
          instagram_photo_description: string | null
          instagram_photo_url: string | null
          instagram_pillars: Json | null
          instagram_pinned_posts: Json | null
          instagram_posts_per_month: number | null
          instagram_url: string | null
          instagram_username: string | null
          level: string | null
          linkedin_posts_per_week: number | null
          linkedin_url: string | null
          main_blocker: string | null
          main_goal: string | null
          mission: string
          offre: string
          onboarding_completed: boolean
          onboarding_completed_at: string | null
          onboarding_step: number | null
          piliers: string[]
          plan_start_date: string | null
          posts_per_week: number | null
          prenom: string
          probleme_principal: string
          stories_per_week: number | null
          style_communication: string[]
          time_distribution: Json | null
          tons: string[]
          type_activite: string
          updated_at: string
          user_id: string
          validated_bio: string | null
          validated_bio_at: string | null
          verbatims: string
          website_url: string | null
          weekly_time: string | null
          weekly_time_available: number | null
          workspace_id: string | null
        }
        Insert: {
          activite?: string
          activity_detail?: string | null
          bio_cta_text?: string | null
          bio_cta_type?: string | null
          bio_generator_answers?: Json | null
          bonus_credits?: number
          canaux?: string[]
          ce_quon_evite?: string
          cible?: string
          created_at?: string
          croyances_limitantes?: string
          current_plan?: string | null
          differentiation_text?: string | null
          differentiation_type?: string | null
          email?: string | null
          expressions_cles?: string
          id?: string
          instagram_bio?: string | null
          instagram_bio_link?: string | null
          instagram_display_name?: string | null
          instagram_feed_description?: string | null
          instagram_feed_screenshot_url?: string | null
          instagram_followers?: number | null
          instagram_frequency?: string | null
          instagram_highlights?: Json | null
          instagram_highlights_count?: number | null
          instagram_photo_description?: string | null
          instagram_photo_url?: string | null
          instagram_pillars?: Json | null
          instagram_pinned_posts?: Json | null
          instagram_posts_per_month?: number | null
          instagram_url?: string | null
          instagram_username?: string | null
          level?: string | null
          linkedin_posts_per_week?: number | null
          linkedin_url?: string | null
          main_blocker?: string | null
          main_goal?: string | null
          mission?: string
          offre?: string
          onboarding_completed?: boolean
          onboarding_completed_at?: string | null
          onboarding_step?: number | null
          piliers?: string[]
          plan_start_date?: string | null
          posts_per_week?: number | null
          prenom?: string
          probleme_principal?: string
          stories_per_week?: number | null
          style_communication?: string[]
          time_distribution?: Json | null
          tons?: string[]
          type_activite?: string
          updated_at?: string
          user_id: string
          validated_bio?: string | null
          validated_bio_at?: string | null
          verbatims?: string
          website_url?: string | null
          weekly_time?: string | null
          weekly_time_available?: number | null
          workspace_id?: string | null
        }
        Update: {
          activite?: string
          activity_detail?: string | null
          bio_cta_text?: string | null
          bio_cta_type?: string | null
          bio_generator_answers?: Json | null
          bonus_credits?: number
          canaux?: string[]
          ce_quon_evite?: string
          cible?: string
          created_at?: string
          croyances_limitantes?: string
          current_plan?: string | null
          differentiation_text?: string | null
          differentiation_type?: string | null
          email?: string | null
          expressions_cles?: string
          id?: string
          instagram_bio?: string | null
          instagram_bio_link?: string | null
          instagram_display_name?: string | null
          instagram_feed_description?: string | null
          instagram_feed_screenshot_url?: string | null
          instagram_followers?: number | null
          instagram_frequency?: string | null
          instagram_highlights?: Json | null
          instagram_highlights_count?: number | null
          instagram_photo_description?: string | null
          instagram_photo_url?: string | null
          instagram_pillars?: Json | null
          instagram_pinned_posts?: Json | null
          instagram_posts_per_month?: number | null
          instagram_url?: string | null
          instagram_username?: string | null
          level?: string | null
          linkedin_posts_per_week?: number | null
          linkedin_url?: string | null
          main_blocker?: string | null
          main_goal?: string | null
          mission?: string
          offre?: string
          onboarding_completed?: boolean
          onboarding_completed_at?: string | null
          onboarding_step?: number | null
          piliers?: string[]
          plan_start_date?: string | null
          posts_per_week?: number | null
          prenom?: string
          probleme_principal?: string
          stories_per_week?: number | null
          style_communication?: string[]
          time_distribution?: Json | null
          tons?: string[]
          type_activite?: string
          updated_at?: string
          user_id?: string
          validated_bio?: string | null
          validated_bio_at?: string | null
          verbatims?: string
          website_url?: string | null
          weekly_time?: string | null
          weekly_time_available?: number | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      promo_codes: {
        Row: {
          code: string
          created_at: string
          current_uses: number
          duration_days: number | null
          expires_at: string | null
          id: string
          is_active: boolean
          max_uses: number | null
          plan_granted: string
        }
        Insert: {
          code: string
          created_at?: string
          current_uses?: number
          duration_days?: number | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          max_uses?: number | null
          plan_granted?: string
        }
        Update: {
          code?: string
          created_at?: string
          current_uses?: number
          duration_days?: number | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          max_uses?: number | null
          plan_granted?: string
        }
        Relationships: []
      }
      promo_redemptions: {
        Row: {
          expires_at: string | null
          id: string
          promo_code_id: string
          redeemed_at: string
          user_id: string
        }
        Insert: {
          expires_at?: string | null
          id?: string
          promo_code_id: string
          redeemed_at?: string
          user_id: string
        }
        Update: {
          expires_at?: string | null
          id?: string
          promo_code_id?: string
          redeemed_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "promo_redemptions_promo_code_id_fkey"
            columns: ["promo_code_id"]
            isOneToOne: false
            referencedRelation: "promo_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      prospect_interactions: {
        Row: {
          ai_generated: boolean | null
          content: string | null
          created_at: string | null
          id: string
          interaction_type: string
          prospect_id: string
          responded: boolean | null
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          ai_generated?: boolean | null
          content?: string | null
          created_at?: string | null
          id?: string
          interaction_type: string
          prospect_id: string
          responded?: boolean | null
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          ai_generated?: boolean | null
          content?: string | null
          created_at?: string | null
          id?: string
          interaction_type?: string
          prospect_id?: string
          responded?: boolean | null
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prospect_interactions_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "prospects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prospect_interactions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      prospects: {
        Row: {
          activity: string | null
          conversion_amount: number | null
          created_at: string | null
          decision_phase: string | null
          display_name: string | null
          id: string
          instagram_username: string
          last_conversation: string | null
          last_dm_context: string | null
          last_interaction_at: string | null
          next_reminder_at: string | null
          next_reminder_text: string | null
          note: string | null
          noted_interest: string | null
          probable_problem: string | null
          relevant_offer: string | null
          source: string | null
          stage: string | null
          strengths: string | null
          to_avoid: string | null
          updated_at: string | null
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          activity?: string | null
          conversion_amount?: number | null
          created_at?: string | null
          decision_phase?: string | null
          display_name?: string | null
          id?: string
          instagram_username: string
          last_conversation?: string | null
          last_dm_context?: string | null
          last_interaction_at?: string | null
          next_reminder_at?: string | null
          next_reminder_text?: string | null
          note?: string | null
          noted_interest?: string | null
          probable_problem?: string | null
          relevant_offer?: string | null
          source?: string | null
          stage?: string | null
          strengths?: string | null
          to_avoid?: string | null
          updated_at?: string | null
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          activity?: string | null
          conversion_amount?: number | null
          created_at?: string | null
          decision_phase?: string | null
          display_name?: string | null
          id?: string
          instagram_username?: string
          last_conversation?: string | null
          last_dm_context?: string | null
          last_interaction_at?: string | null
          next_reminder_at?: string | null
          next_reminder_text?: string | null
          note?: string | null
          noted_interest?: string | null
          probable_problem?: string | null
          relevant_offer?: string | null
          source?: string | null
          stage?: string | null
          strengths?: string | null
          to_avoid?: string | null
          updated_at?: string | null
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prospects_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      purchases: {
        Row: {
          amount: number
          created_at: string | null
          currency: string | null
          id: string
          metadata: Json | null
          product_type: string
          status: string | null
          stripe_checkout_session_id: string | null
          stripe_payment_intent_id: string | null
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string | null
          currency?: string | null
          id?: string
          metadata?: Json | null
          product_type: string
          status?: string | null
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string | null
          currency?: string | null
          id?: string
          metadata?: Json | null
          product_type?: string
          status?: string | null
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      reel_inspirations: {
        Row: {
          analysis: Json | null
          created_at: string
          id: string
          image_url: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          analysis?: Json | null
          created_at?: string
          id?: string
          image_url: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          analysis?: Json | null
          created_at?: string
          id?: string
          image_url?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reel_inspirations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      reels_metrics: {
        Row: {
          ai_insight: string | null
          avg_engagement_rate: number | null
          best_reel_retention: number | null
          best_reel_subject: string | null
          best_reel_views: number | null
          created_at: string
          id: string
          reels_published: number | null
          total_follows_gained: number | null
          total_saves: number | null
          total_shares: number | null
          total_views: number | null
          updated_at: string
          user_id: string
          week_start: string
          workspace_id: string | null
        }
        Insert: {
          ai_insight?: string | null
          avg_engagement_rate?: number | null
          best_reel_retention?: number | null
          best_reel_subject?: string | null
          best_reel_views?: number | null
          created_at?: string
          id?: string
          reels_published?: number | null
          total_follows_gained?: number | null
          total_saves?: number | null
          total_shares?: number | null
          total_views?: number | null
          updated_at?: string
          user_id: string
          week_start: string
          workspace_id?: string | null
        }
        Update: {
          ai_insight?: string | null
          avg_engagement_rate?: number | null
          best_reel_retention?: number | null
          best_reel_subject?: string | null
          best_reel_views?: number | null
          created_at?: string
          id?: string
          reels_published?: number | null
          total_follows_gained?: number | null
          total_saves?: number | null
          total_shares?: number | null
          total_views?: number | null
          updated_at?: string
          user_id?: string
          week_start?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reels_metrics_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      reels_scripts: {
        Row: {
          alt_text: string | null
          caption: string | null
          cover_text: string | null
          created_at: string
          duree_cible: string | null
          face_cam: string | null
          format_type: string | null
          hashtags: Json | null
          hook_text: string | null
          hook_type: string | null
          id: string
          is_launch: boolean | null
          objective: string | null
          published: boolean | null
          published_at: string | null
          script_result: Json | null
          subject: string | null
          time_available: string | null
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          alt_text?: string | null
          caption?: string | null
          cover_text?: string | null
          created_at?: string
          duree_cible?: string | null
          face_cam?: string | null
          format_type?: string | null
          hashtags?: Json | null
          hook_text?: string | null
          hook_type?: string | null
          id?: string
          is_launch?: boolean | null
          objective?: string | null
          published?: boolean | null
          published_at?: string | null
          script_result?: Json | null
          subject?: string | null
          time_available?: string | null
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          alt_text?: string | null
          caption?: string | null
          cover_text?: string | null
          created_at?: string
          duree_cible?: string | null
          face_cam?: string | null
          format_type?: string | null
          hashtags?: Json | null
          hook_text?: string | null
          hook_type?: string | null
          id?: string
          is_launch?: boolean | null
          objective?: string | null
          published?: boolean | null
          published_at?: string | null
          script_result?: Json | null
          subject?: string | null
          time_available?: string | null
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reels_scripts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      routine_completions: {
        Row: {
          completed_at: string
          created_at: string
          id: string
          month: string | null
          period_start: string
          routine_task_id: string | null
          task_id: string
          user_id: string
          week: string | null
          workspace_id: string | null
        }
        Insert: {
          completed_at?: string
          created_at?: string
          id?: string
          month?: string | null
          period_start: string
          routine_task_id?: string | null
          task_id: string
          user_id: string
          week?: string | null
          workspace_id?: string | null
        }
        Update: {
          completed_at?: string
          created_at?: string
          id?: string
          month?: string | null
          period_start?: string
          routine_task_id?: string | null
          task_id?: string
          user_id?: string
          week?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "routine_completions_routine_task_id_fkey"
            columns: ["routine_task_id"]
            isOneToOne: false
            referencedRelation: "routine_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "routine_completions_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "routine_completions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      routine_tasks: {
        Row: {
          channel: string | null
          created_at: string | null
          day_of_week: string | null
          duration_minutes: number | null
          id: string
          is_active: boolean | null
          is_auto_generated: boolean | null
          linked_context: Json | null
          linked_module: string | null
          recurrence: string | null
          sort_order: number | null
          task_type: string
          title: string
          user_id: string
          week_of_month: number | null
          workspace_id: string | null
        }
        Insert: {
          channel?: string | null
          created_at?: string | null
          day_of_week?: string | null
          duration_minutes?: number | null
          id?: string
          is_active?: boolean | null
          is_auto_generated?: boolean | null
          linked_context?: Json | null
          linked_module?: string | null
          recurrence?: string | null
          sort_order?: number | null
          task_type?: string
          title: string
          user_id: string
          week_of_month?: number | null
          workspace_id?: string | null
        }
        Update: {
          channel?: string | null
          created_at?: string | null
          day_of_week?: string | null
          duration_minutes?: number | null
          id?: string
          is_active?: boolean | null
          is_auto_generated?: boolean | null
          linked_context?: Json | null
          linked_module?: string | null
          recurrence?: string | null
          sort_order?: number | null
          task_type?: string
          title?: string
          user_id?: string
          week_of_month?: number | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "routine_tasks_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_page_optimizations: {
        Row: {
          created_at: string
          focus: string | null
          id: string
          raw_result: Json | null
          score_global: number | null
          site_url: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          focus?: string | null
          id?: string
          raw_result?: Json | null
          score_global?: number | null
          site_url: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          focus?: string | null
          id?: string
          raw_result?: Json | null
          score_global?: number | null
          site_url?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_page_optimizations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_ideas: {
        Row: {
          accroche_long: string | null
          accroche_short: string | null
          angle: string
          calendar_post_id: string | null
          canal: string
          content_data: Json | null
          content_draft: string | null
          created_at: string
          format: string
          format_technique: string | null
          id: string
          notes: string | null
          objectif: string | null
          personal_elements: Json | null
          planned_date: string | null
          source_module: string | null
          status: string | null
          titre: string
          type: string | null
          updated_at: string | null
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          accroche_long?: string | null
          accroche_short?: string | null
          angle: string
          calendar_post_id?: string | null
          canal?: string
          content_data?: Json | null
          content_draft?: string | null
          created_at?: string
          format: string
          format_technique?: string | null
          id?: string
          notes?: string | null
          objectif?: string | null
          personal_elements?: Json | null
          planned_date?: string | null
          source_module?: string | null
          status?: string | null
          titre: string
          type?: string | null
          updated_at?: string | null
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          accroche_long?: string | null
          accroche_short?: string | null
          angle?: string
          calendar_post_id?: string | null
          canal?: string
          content_data?: Json | null
          content_draft?: string | null
          created_at?: string
          format?: string
          format_technique?: string | null
          id?: string
          notes?: string | null
          objectif?: string | null
          personal_elements?: Json | null
          planned_date?: string | null
          source_module?: string | null
          status?: string | null
          titre?: string
          type?: string | null
          updated_at?: string | null
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "saved_ideas_calendar_post_id_fkey"
            columns: ["calendar_post_id"]
            isOneToOne: false
            referencedRelation: "calendar_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_ideas_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      shared_branding_links: {
        Row: {
          created_at: string | null
          expires_at: string | null
          id: string
          is_active: boolean | null
          title: string | null
          token: string
          user_id: string
          views_count: number | null
        }
        Insert: {
          created_at?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          title?: string | null
          token?: string
          user_id: string
          views_count?: number | null
        }
        Update: {
          created_at?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          title?: string | null
          token?: string
          user_id?: string
          views_count?: number | null
        }
        Relationships: []
      }
      stats_config: {
        Row: {
          business_metrics: Json | null
          business_type: string | null
          created_at: string | null
          custom_metrics: Json | null
          id: string
          launch_metrics: Json | null
          sales_pages: Json | null
          traffic_sources: Json | null
          updated_at: string | null
          user_id: string
          uses_ga4: boolean | null
          website_platform: string | null
          website_platform_other: string | null
          workspace_id: string | null
        }
        Insert: {
          business_metrics?: Json | null
          business_type?: string | null
          created_at?: string | null
          custom_metrics?: Json | null
          id?: string
          launch_metrics?: Json | null
          sales_pages?: Json | null
          traffic_sources?: Json | null
          updated_at?: string | null
          user_id: string
          uses_ga4?: boolean | null
          website_platform?: string | null
          website_platform_other?: string | null
          workspace_id?: string | null
        }
        Update: {
          business_metrics?: Json | null
          business_type?: string | null
          created_at?: string | null
          custom_metrics?: Json | null
          id?: string
          launch_metrics?: Json | null
          sales_pages?: Json | null
          traffic_sources?: Json | null
          updated_at?: string | null
          user_id?: string
          uses_ga4?: boolean | null
          website_platform?: string | null
          website_platform_other?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stats_config_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      stories_metrics: {
        Row: {
          best_story: string | null
          completion_rate: number | null
          created_at: string | null
          dm_replies: number | null
          id: string
          sequences_published: number | null
          stickers_used: Json | null
          updated_at: string | null
          user_id: string
          week_start: string
          workspace_id: string | null
        }
        Insert: {
          best_story?: string | null
          completion_rate?: number | null
          created_at?: string | null
          dm_replies?: number | null
          id?: string
          sequences_published?: number | null
          stickers_used?: Json | null
          updated_at?: string | null
          user_id: string
          week_start: string
          workspace_id?: string | null
        }
        Update: {
          best_story?: string | null
          completion_rate?: number | null
          created_at?: string | null
          dm_replies?: number | null
          id?: string
          sequences_published?: number | null
          stickers_used?: Json | null
          updated_at?: string | null
          user_id?: string
          week_start?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stories_metrics_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      stories_sequences: {
        Row: {
          created_at: string
          face_cam: string | null
          id: string
          is_launch: boolean | null
          objective: string | null
          price_range: string | null
          published: boolean | null
          published_at: string | null
          sequence_result: Json | null
          structure_type: string | null
          subject: string | null
          time_available: string | null
          total_stories: number | null
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          face_cam?: string | null
          id?: string
          is_launch?: boolean | null
          objective?: string | null
          price_range?: string | null
          published?: boolean | null
          published_at?: string | null
          sequence_result?: Json | null
          structure_type?: string | null
          subject?: string | null
          time_available?: string | null
          total_stories?: number | null
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          face_cam?: string | null
          id?: string
          is_launch?: boolean | null
          objective?: string | null
          price_range?: string | null
          published?: boolean | null
          published_at?: string | null
          sequence_result?: Json | null
          structure_type?: string | null
          subject?: string | null
          time_available?: string | null
          total_stories?: number | null
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stories_sequences_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      storytelling: {
        Row: {
          completed: boolean | null
          created_at: string
          current_step: number | null
          id: string
          imported_text: string | null
          is_primary: boolean | null
          pitch_long: string | null
          pitch_medium: string | null
          pitch_short: string | null
          recap_summary: Json | null
          source: string | null
          step_1_raw: string | null
          step_2_location: string | null
          step_3_action: string | null
          step_4_thoughts: string | null
          step_5_emotions: string | null
          step_6_full_story: string | null
          step_7_polished: string | null
          story_type: string | null
          title: string | null
          updated_at: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          completed?: boolean | null
          created_at?: string
          current_step?: number | null
          id?: string
          imported_text?: string | null
          is_primary?: boolean | null
          pitch_long?: string | null
          pitch_medium?: string | null
          pitch_short?: string | null
          recap_summary?: Json | null
          source?: string | null
          step_1_raw?: string | null
          step_2_location?: string | null
          step_3_action?: string | null
          step_4_thoughts?: string | null
          step_5_emotions?: string | null
          step_6_full_story?: string | null
          step_7_polished?: string | null
          story_type?: string | null
          title?: string | null
          updated_at?: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          completed?: boolean | null
          created_at?: string
          current_step?: number | null
          id?: string
          imported_text?: string | null
          is_primary?: boolean | null
          pitch_long?: string | null
          pitch_medium?: string | null
          pitch_short?: string | null
          recap_summary?: Json | null
          source?: string | null
          step_1_raw?: string | null
          step_2_location?: string | null
          step_3_action?: string | null
          step_4_thoughts?: string | null
          step_5_emotions?: string | null
          step_6_full_story?: string | null
          step_7_polished?: string | null
          story_type?: string | null
          title?: string | null
          updated_at?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "storytelling_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      studio_binomes: {
        Row: {
          cohort: string | null
          created_at: string
          id: string
          user_a: string
          user_b: string
        }
        Insert: {
          cohort?: string | null
          created_at?: string
          id?: string
          user_a: string
          user_b: string
        }
        Update: {
          cohort?: string | null
          created_at?: string
          id?: string
          user_a?: string
          user_b?: string
        }
        Relationships: []
      }
      studio_coachings: {
        Row: {
          calendly_link: string | null
          created_at: string
          id: string
          notes: string | null
          scheduled_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          calendly_link?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          scheduled_at?: string | null
          status?: string
          user_id: string
        }
        Update: {
          calendly_link?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          scheduled_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      studio_deliverables: {
        Row: {
          created_at: string
          deliverable_type: string
          feedback: string | null
          id: string
          label: string | null
          status: string
          user_id: string
          validated_at: string | null
        }
        Insert: {
          created_at?: string
          deliverable_type: string
          feedback?: string | null
          id?: string
          label?: string | null
          status?: string
          user_id: string
          validated_at?: string | null
        }
        Update: {
          created_at?: string
          deliverable_type?: string
          feedback?: string | null
          id?: string
          label?: string | null
          status?: string
          user_id?: string
          validated_at?: string | null
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          cancel_at: string | null
          canceled_at: string | null
          created_at: string | null
          current_period_end: string | null
          current_period_start: string | null
          id: string
          plan: string
          source: string | null
          status: string
          stripe_customer_id: string | null
          stripe_price_id: string | null
          stripe_subscription_id: string | null
          studio_end_date: string | null
          studio_months_paid: number | null
          studio_start_date: string | null
          updated_at: string | null
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          cancel_at?: string | null
          canceled_at?: string | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan?: string
          source?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          studio_end_date?: string | null
          studio_months_paid?: number | null
          studio_start_date?: string | null
          updated_at?: string | null
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          cancel_at?: string | null
          canceled_at?: string | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan?: string
          source?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          studio_end_date?: string | null
          studio_months_paid?: number | null
          studio_start_date?: string | null
          updated_at?: string | null
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
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
          workspace_id: string | null
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
          workspace_id?: string | null
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
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      user_badges: {
        Row: {
          badge_id: string
          id: string
          seen: boolean
          unlocked_at: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          badge_id: string
          id?: string
          seen?: boolean
          unlocked_at?: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          badge_id?: string
          id?: string
          seen?: boolean
          unlocked_at?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_badges_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      user_documents: {
        Row: {
          context: string | null
          created_at: string | null
          extracted_data: Json | null
          file_name: string | null
          file_type: string | null
          file_url: string | null
          id: string
          processed: boolean | null
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          context?: string | null
          created_at?: string | null
          extracted_data?: Json | null
          file_name?: string | null
          file_type?: string | null
          file_url?: string | null
          id?: string
          processed?: boolean | null
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          context?: string | null
          created_at?: string | null
          extracted_data?: Json | null
          file_name?: string | null
          file_type?: string | null
          file_url?: string | null
          id?: string
          processed?: boolean | null
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_documents_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      user_offers: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          name: string
          price: string | null
          sort_order: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          price?: string | null
          sort_order?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          price?: string | null
          sort_order?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_plan_config: {
        Row: {
          channels: Json
          created_at: string
          id: string
          level: string | null
          main_goal: string
          onboarding_completed: boolean | null
          onboarding_completed_at: string | null
          updated_at: string
          user_id: string
          weekly_time: string
          welcome_seen: boolean | null
          workspace_id: string | null
        }
        Insert: {
          channels?: Json
          created_at?: string
          id?: string
          level?: string | null
          main_goal?: string
          onboarding_completed?: boolean | null
          onboarding_completed_at?: string | null
          updated_at?: string
          user_id: string
          weekly_time?: string
          welcome_seen?: boolean | null
          workspace_id?: string | null
        }
        Update: {
          channels?: Json
          created_at?: string
          id?: string
          level?: string | null
          main_goal?: string
          onboarding_completed?: boolean | null
          onboarding_completed_at?: string | null
          updated_at?: string
          user_id?: string
          weekly_time?: string
          welcome_seen?: boolean | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_plan_config_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      user_plan_overrides: {
        Row: {
          id: string
          manual_status: string
          step_id: string
          updated_at: string | null
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          id?: string
          manual_status: string
          step_id: string
          updated_at?: string | null
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          id?: string
          manual_status?: string
          step_id?: string
          updated_at?: string | null
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: []
      }
      user_rhythm: {
        Row: {
          created_at: string | null
          id: string
          organization_mode: string | null
          posts_per_week: number | null
          preferred_slots: string | null
          stories_per_day: number | null
          time_available_weekly: number | null
          time_ideas_monthly: number | null
          time_scheduling_per_content: number | null
          time_texts_per_content: number | null
          time_visuals_per_content: number | null
          updated_at: string | null
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          organization_mode?: string | null
          posts_per_week?: number | null
          preferred_slots?: string | null
          stories_per_day?: number | null
          time_available_weekly?: number | null
          time_ideas_monthly?: number | null
          time_scheduling_per_content?: number | null
          time_texts_per_content?: number | null
          time_visuals_per_content?: number | null
          updated_at?: string | null
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          organization_mode?: string | null
          posts_per_week?: number | null
          preferred_slots?: string | null
          stories_per_day?: number | null
          time_available_weekly?: number | null
          time_ideas_monthly?: number | null
          time_scheduling_per_content?: number | null
          time_texts_per_content?: number | null
          time_visuals_per_content?: number | null
          updated_at?: string | null
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_rhythm_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      voice_guides: {
        Row: {
          created_at: string | null
          guide_data: Json
          id: string
          updated_at: string | null
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string | null
          guide_data: Json
          id?: string
          updated_at?: string | null
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string | null
          guide_data?: Json
          id?: string
          updated_at?: string | null
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "voice_guides_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      voice_profile: {
        Row: {
          banned_expressions: Json | null
          created_at: string
          formatting_habits: Json | null
          id: string
          sample_texts: Json | null
          signature_expressions: Json | null
          structure_patterns: Json | null
          tone_patterns: Json | null
          updated_at: string
          user_id: string
          voice_summary: string | null
          workspace_id: string | null
        }
        Insert: {
          banned_expressions?: Json | null
          created_at?: string
          formatting_habits?: Json | null
          id?: string
          sample_texts?: Json | null
          signature_expressions?: Json | null
          structure_patterns?: Json | null
          tone_patterns?: Json | null
          updated_at?: string
          user_id: string
          voice_summary?: string | null
          workspace_id?: string | null
        }
        Update: {
          banned_expressions?: Json | null
          created_at?: string
          formatting_habits?: Json | null
          id?: string
          sample_texts?: Json | null
          signature_expressions?: Json | null
          structure_patterns?: Json | null
          tone_patterns?: Json | null
          updated_at?: string
          user_id?: string
          voice_summary?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "voice_profile_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      website_about: {
        Row: {
          angle: string | null
          approach: string | null
          created_at: string
          cta: string | null
          custom_facts: Json | null
          for_whom: string | null
          id: string
          story: string | null
          title: string | null
          updated_at: string
          user_id: string
          values_blocks: Json | null
          workspace_id: string | null
        }
        Insert: {
          angle?: string | null
          approach?: string | null
          created_at?: string
          cta?: string | null
          custom_facts?: Json | null
          for_whom?: string | null
          id?: string
          story?: string | null
          title?: string | null
          updated_at?: string
          user_id: string
          values_blocks?: Json | null
          workspace_id?: string | null
        }
        Update: {
          angle?: string | null
          approach?: string | null
          created_at?: string
          cta?: string | null
          custom_facts?: Json | null
          for_whom?: string | null
          id?: string
          story?: string | null
          title?: string | null
          updated_at?: string
          user_id?: string
          values_blocks?: Json | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "website_about_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      website_audit: {
        Row: {
          answers: Json | null
          audit_mode: string | null
          completed: boolean | null
          created_at: string
          current_page: string | null
          diagnostic: string | null
          id: string
          is_latest: boolean | null
          raw_result: Json | null
          recommendations: Json | null
          score_global: number | null
          scores: Json | null
          site_url: string | null
          updated_at: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          answers?: Json | null
          audit_mode?: string | null
          completed?: boolean | null
          created_at?: string
          current_page?: string | null
          diagnostic?: string | null
          id?: string
          is_latest?: boolean | null
          raw_result?: Json | null
          recommendations?: Json | null
          score_global?: number | null
          scores?: Json | null
          site_url?: string | null
          updated_at?: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          answers?: Json | null
          audit_mode?: string | null
          completed?: boolean | null
          created_at?: string
          current_page?: string | null
          diagnostic?: string | null
          id?: string
          is_latest?: boolean | null
          raw_result?: Json | null
          recommendations?: Json | null
          score_global?: number | null
          scores?: Json | null
          site_url?: string | null
          updated_at?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "website_audit_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      website_homepage: {
        Row: {
          benefits_block: string | null
          checklist_data: Json | null
          completed: boolean | null
          created_at: string | null
          cta_micro_copy: string | null
          cta_objective: string | null
          cta_primary: string | null
          cta_secondary: string | null
          current_step: number | null
          failure_block: string | null
          faq: Json | null
          for_who_ideal: string | null
          for_who_not: string | null
          framework: string | null
          guarantee_text: string | null
          guarantee_type: string | null
          hook_image_done: boolean | null
          hook_subtitle: string | null
          hook_title: string | null
          id: string
          layout_done: boolean | null
          layout_notes: string | null
          offer_block: string | null
          offer_comparison: string | null
          offer_included: string | null
          offer_name: string | null
          offer_payment: string | null
          offer_price: string | null
          page_type: string | null
          plan_steps: Json | null
          presentation_block: string | null
          problem_block: string | null
          seo_h1: string | null
          seo_meta: string | null
          seo_title: string | null
          social_proof_done: boolean | null
          storybrand_data: Json | null
          updated_at: string | null
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          benefits_block?: string | null
          checklist_data?: Json | null
          completed?: boolean | null
          created_at?: string | null
          cta_micro_copy?: string | null
          cta_objective?: string | null
          cta_primary?: string | null
          cta_secondary?: string | null
          current_step?: number | null
          failure_block?: string | null
          faq?: Json | null
          for_who_ideal?: string | null
          for_who_not?: string | null
          framework?: string | null
          guarantee_text?: string | null
          guarantee_type?: string | null
          hook_image_done?: boolean | null
          hook_subtitle?: string | null
          hook_title?: string | null
          id?: string
          layout_done?: boolean | null
          layout_notes?: string | null
          offer_block?: string | null
          offer_comparison?: string | null
          offer_included?: string | null
          offer_name?: string | null
          offer_payment?: string | null
          offer_price?: string | null
          page_type?: string | null
          plan_steps?: Json | null
          presentation_block?: string | null
          problem_block?: string | null
          seo_h1?: string | null
          seo_meta?: string | null
          seo_title?: string | null
          social_proof_done?: boolean | null
          storybrand_data?: Json | null
          updated_at?: string | null
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          benefits_block?: string | null
          checklist_data?: Json | null
          completed?: boolean | null
          created_at?: string | null
          cta_micro_copy?: string | null
          cta_objective?: string | null
          cta_primary?: string | null
          cta_secondary?: string | null
          current_step?: number | null
          failure_block?: string | null
          faq?: Json | null
          for_who_ideal?: string | null
          for_who_not?: string | null
          framework?: string | null
          guarantee_text?: string | null
          guarantee_type?: string | null
          hook_image_done?: boolean | null
          hook_subtitle?: string | null
          hook_title?: string | null
          id?: string
          layout_done?: boolean | null
          layout_notes?: string | null
          offer_block?: string | null
          offer_comparison?: string | null
          offer_included?: string | null
          offer_name?: string | null
          offer_payment?: string | null
          offer_price?: string | null
          page_type?: string | null
          plan_steps?: Json | null
          presentation_block?: string | null
          problem_block?: string | null
          seo_h1?: string | null
          seo_meta?: string | null
          seo_title?: string | null
          social_proof_done?: boolean | null
          storybrand_data?: Json | null
          updated_at?: string | null
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "website_homepage_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      website_inspirations: {
        Row: {
          created_at: string
          custom_colors: Json | null
          html_code: string
          id: string
          section_type: string
          user_id: string
          variant: number
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          custom_colors?: Json | null
          html_code?: string
          id?: string
          section_type: string
          user_id: string
          variant?: number
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          custom_colors?: Json | null
          html_code?: string
          id?: string
          section_type?: string
          user_id?: string
          variant?: number
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "website_inspirations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      website_profile: {
        Row: {
          cms: string | null
          created_at: string | null
          id: string
          updated_at: string | null
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          cms?: string | null
          created_at?: string | null
          id?: string
          updated_at?: string | null
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          cms?: string | null
          created_at?: string | null
          id?: string
          updated_at?: string | null
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "website_profile_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_batches: {
        Row: {
          contents_generated: Json | null
          created_at: string
          id: string
          status: string
          subjects_proposed: Json | null
          subjects_selected: Json | null
          user_id: string
          week_start: string | null
          workspace_id: string | null
        }
        Insert: {
          contents_generated?: Json | null
          created_at?: string
          id?: string
          status?: string
          subjects_proposed?: Json | null
          subjects_selected?: Json | null
          user_id: string
          week_start?: string | null
          workspace_id?: string | null
        }
        Update: {
          contents_generated?: Json | null
          created_at?: string
          id?: string
          status?: string
          subjects_proposed?: Json | null
          subjects_selected?: Json | null
          user_id?: string
          week_start?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "weekly_batches_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_missions: {
        Row: {
          auto_completed: boolean
          completed_at: string | null
          created_at: string
          description: string | null
          estimated_minutes: number | null
          id: string
          is_done: boolean
          mission_key: string
          module: string | null
          priority: string
          route: string | null
          title: string
          user_id: string
          week_start: string
          workspace_id: string | null
        }
        Insert: {
          auto_completed?: boolean
          completed_at?: string | null
          created_at?: string
          description?: string | null
          estimated_minutes?: number | null
          id?: string
          is_done?: boolean
          mission_key: string
          module?: string | null
          priority?: string
          route?: string | null
          title: string
          user_id: string
          week_start: string
          workspace_id?: string | null
        }
        Update: {
          auto_completed?: boolean
          completed_at?: string | null
          created_at?: string
          description?: string | null
          estimated_minutes?: number | null
          id?: string
          is_done?: boolean
          mission_key?: string
          module?: string | null
          priority?: string
          route?: string | null
          title?: string
          user_id?: string
          week_start?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "weekly_missions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          role: string
          token: string
          workspace_id: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by: string
          role?: string
          token?: string
          workspace_id: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          role?: string
          token?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_invitations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_members: {
        Row: {
          id: string
          invited_by: string | null
          joined_at: string
          role: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          id?: string
          invited_by?: string | null
          joined_at?: string
          role?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          id?: string
          invited_by?: string | null
          joined_at?: string
          role?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          avatar_url: string | null
          created_at: string
          created_by: string
          extra_links: Json | null
          id: string
          instagram_url: string | null
          linkedin_url: string | null
          name: string
          plan: string
          slug: string | null
          updated_at: string
          website_url: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          created_by: string
          extra_links?: Json | null
          id?: string
          instagram_url?: string | null
          linkedin_url?: string | null
          name?: string
          plan?: string
          slug?: string | null
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          created_by?: string
          extra_links?: Json | null
          id?: string
          instagram_url?: string | null
          linkedin_url?: string | null
          name?: string
          plan?: string
          slug?: string | null
          updated_at?: string
          website_url?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_dashboard_summary: {
        Args: { p_user_id: string; p_workspace_id?: string }
        Returns: Json
      }
      get_user_owner_workspace: {
        Args: { target_user_id: string }
        Returns: string
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      user_has_workspace_access: { Args: { ws_id: string }; Returns: boolean }
      user_workspace_role: { Args: { ws_id: string }; Returns: string }
    }
    Enums: {
      app_role: "coach" | "admin"
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
    Enums: {
      app_role: ["coach", "admin"],
    },
  },
} as const
