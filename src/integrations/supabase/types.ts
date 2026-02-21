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
          combat_alternative: string | null
          combat_cause: string | null
          combat_fights: string | null
          combat_refusals: string | null
          created_at: string
          id: string
          key_expressions: string | null
          mission: string | null
          offer: string | null
          recap_summary: Json | null
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
          voice_description: string | null
        }
        Insert: {
          channels?: string[] | null
          combat_alternative?: string | null
          combat_cause?: string | null
          combat_fights?: string | null
          combat_refusals?: string | null
          created_at?: string
          id?: string
          key_expressions?: string | null
          mission?: string | null
          offer?: string | null
          recap_summary?: Json | null
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
          voice_description?: string | null
        }
        Update: {
          channels?: string[] | null
          combat_alternative?: string | null
          combat_cause?: string | null
          combat_fights?: string | null
          combat_refusals?: string | null
          created_at?: string
          id?: string
          key_expressions?: string | null
          mission?: string | null
          offer?: string | null
          recap_summary?: Json | null
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
          voice_description?: string | null
        }
        Relationships: []
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
        }
        Relationships: []
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
        }
        Relationships: []
      }
      calendar_posts: {
        Row: {
          accroche: string | null
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
          id: string
          launch_id: string | null
          notes: string | null
          objectif: string | null
          objective: string | null
          status: string
          story_sequence_detail: Json | null
          theme: string
          updated_at: string
          user_id: string
        }
        Insert: {
          accroche?: string | null
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
          id?: string
          launch_id?: string | null
          notes?: string | null
          objectif?: string | null
          objective?: string | null
          status?: string
          story_sequence_detail?: Json | null
          theme: string
          updated_at?: string
          user_id: string
        }
        Update: {
          accroche?: string | null
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
          id?: string
          launch_id?: string | null
          notes?: string | null
          objectif?: string | null
          objective?: string | null
          status?: string
          story_sequence_detail?: Json | null
          theme?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_posts_launch_id_fkey"
            columns: ["launch_id"]
            isOneToOne: false
            referencedRelation: "launches"
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
      engagement_checklist_logs: {
        Row: {
          created_at: string | null
          id: string
          items_checked: Json | null
          items_total: number | null
          log_date: string
          streak_maintained: boolean | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          items_checked?: Json | null
          items_total?: number | null
          log_date: string
          streak_maintained?: boolean | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          items_checked?: Json | null
          items_total?: number | null
          log_date?: string
          streak_maintained?: boolean | null
          user_id?: string
        }
        Relationships: []
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
        }
        Relationships: []
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
        }
        Relationships: []
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
        }
        Insert: {
          best_streak?: number | null
          created_at?: string | null
          current_streak?: number | null
          id?: string
          last_check_date?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          best_streak?: number | null
          created_at?: string | null
          current_streak?: number | null
          id?: string
          last_check_date?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
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
        }
        Relationships: []
      }
      engagement_weekly_linkedin: {
        Row: {
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
        }
        Insert: {
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
        }
        Update: {
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
        }
        Relationships: []
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
      instagram_audit: {
        Row: {
          best_content: string | null
          combo_gagnant: string | null
          content_analysis: Json | null
          content_dna: Json | null
          created_at: string
          current_rhythm: string | null
          details: Json | null
          editorial_recommendations: Json | null
          id: string
          main_objective: string | null
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
          worst_content: string | null
        }
        Insert: {
          best_content?: string | null
          combo_gagnant?: string | null
          content_analysis?: Json | null
          content_dna?: Json | null
          created_at?: string
          current_rhythm?: string | null
          details?: Json | null
          editorial_recommendations?: Json | null
          id?: string
          main_objective?: string | null
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
          worst_content?: string | null
        }
        Update: {
          best_content?: string | null
          combo_gagnant?: string | null
          content_analysis?: Json | null
          content_dna?: Json | null
          created_at?: string
          current_rhythm?: string | null
          details?: Json | null
          editorial_recommendations?: Json | null
          id?: string
          main_objective?: string | null
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
          worst_content?: string | null
        }
        Relationships: []
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
        }
        Relationships: []
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
        }
        Relationships: []
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
        }
        Relationships: []
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
        }
        Relationships: []
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
        }
        Relationships: [
          {
            foreignKeyName: "launch_plan_contents_launch_id_fkey"
            columns: ["launch_id"]
            isOneToOne: false
            referencedRelation: "launches"
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
        }
        Relationships: []
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
        }
        Relationships: []
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
        }
        Relationships: []
      }
      linkedin_profile: {
        Row: {
          banner_done: boolean | null
          created_at: string | null
          custom_url: string | null
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
        }
        Insert: {
          banner_done?: boolean | null
          created_at?: string | null
          custom_url?: string | null
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
        }
        Update: {
          banner_done?: boolean | null
          created_at?: string | null
          custom_url?: string | null
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
        }
        Relationships: []
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
        }
        Insert: {
          created_at?: string | null
          id?: string
          person_name?: string | null
          person_type?: string | null
          reco_received?: boolean | null
          request_sent?: boolean | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          person_name?: string | null
          person_type?: string | null
          reco_received?: boolean | null
          request_sent?: boolean | null
          user_id?: string
        }
        Relationships: []
      }
      persona: {
        Row: {
          completed: boolean | null
          created_at: string
          current_step: number | null
          id: string
          pitch_long: string | null
          pitch_medium: string | null
          pitch_short: string | null
          portrait: Json | null
          portrait_prenom: string | null
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
        }
        Insert: {
          completed?: boolean | null
          created_at?: string
          current_step?: number | null
          id?: string
          pitch_long?: string | null
          pitch_medium?: string | null
          pitch_short?: string | null
          portrait?: Json | null
          portrait_prenom?: string | null
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
        }
        Update: {
          completed?: boolean | null
          created_at?: string
          current_step?: number | null
          id?: string
          pitch_long?: string | null
          pitch_medium?: string | null
          pitch_short?: string | null
          portrait?: Json | null
          portrait_prenom?: string | null
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
        }
        Relationships: []
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
        }
        Insert: {
          board_type?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          sort_order?: number | null
          user_id: string
        }
        Update: {
          board_type?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          sort_order?: number | null
          user_id?: string
        }
        Relationships: []
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
        }
        Relationships: []
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
        }
        Relationships: [
          {
            foreignKeyName: "pinterest_pins_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "pinterest_boards"
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
        }
        Relationships: []
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
          time_distribution: Json | null
          tons: string[]
          type_activite: string
          updated_at: string
          user_id: string
          verbatims: string
          weekly_time_available: number | null
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
          time_distribution?: Json | null
          tons?: string[]
          type_activite?: string
          updated_at?: string
          user_id: string
          verbatims?: string
          weekly_time_available?: number | null
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
          time_distribution?: Json | null
          tons?: string[]
          type_activite?: string
          updated_at?: string
          user_id?: string
          verbatims?: string
          weekly_time_available?: number | null
        }
        Relationships: []
      }
      routine_completions: {
        Row: {
          completed_at: string
          created_at: string
          id: string
          period_start: string
          task_id: string
          user_id: string
        }
        Insert: {
          completed_at?: string
          created_at?: string
          id?: string
          period_start: string
          task_id: string
          user_id: string
        }
        Update: {
          completed_at?: string
          created_at?: string
          id?: string
          period_start?: string
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "routine_completions_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
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
          content_draft: string | null
          created_at: string
          format: string
          format_technique: string | null
          id: string
          notes: string | null
          objectif: string | null
          planned_date: string | null
          status: string | null
          titre: string
          type: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          accroche_long?: string | null
          accroche_short?: string | null
          angle: string
          calendar_post_id?: string | null
          canal?: string
          content_draft?: string | null
          created_at?: string
          format: string
          format_technique?: string | null
          id?: string
          notes?: string | null
          objectif?: string | null
          planned_date?: string | null
          status?: string | null
          titre: string
          type?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          accroche_long?: string | null
          accroche_short?: string | null
          angle?: string
          calendar_post_id?: string | null
          canal?: string
          content_draft?: string | null
          created_at?: string
          format?: string
          format_technique?: string | null
          id?: string
          notes?: string | null
          objectif?: string | null
          planned_date?: string | null
          status?: string | null
          titre?: string
          type?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_ideas_calendar_post_id_fkey"
            columns: ["calendar_post_id"]
            isOneToOne: false
            referencedRelation: "calendar_posts"
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
        }
        Relationships: []
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
        }
        Relationships: []
      }
      website_homepage: {
        Row: {
          benefits_block: string | null
          completed: boolean | null
          created_at: string | null
          cta_objective: string | null
          cta_primary: string | null
          cta_secondary: string | null
          current_step: number | null
          faq: Json | null
          hook_image_done: boolean | null
          hook_subtitle: string | null
          hook_title: string | null
          id: string
          layout_done: boolean | null
          layout_notes: string | null
          offer_block: string | null
          presentation_block: string | null
          problem_block: string | null
          social_proof_done: boolean | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          benefits_block?: string | null
          completed?: boolean | null
          created_at?: string | null
          cta_objective?: string | null
          cta_primary?: string | null
          cta_secondary?: string | null
          current_step?: number | null
          faq?: Json | null
          hook_image_done?: boolean | null
          hook_subtitle?: string | null
          hook_title?: string | null
          id?: string
          layout_done?: boolean | null
          layout_notes?: string | null
          offer_block?: string | null
          presentation_block?: string | null
          problem_block?: string | null
          social_proof_done?: boolean | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          benefits_block?: string | null
          completed?: boolean | null
          created_at?: string | null
          cta_objective?: string | null
          cta_primary?: string | null
          cta_secondary?: string | null
          current_step?: number | null
          faq?: Json | null
          hook_image_done?: boolean | null
          hook_subtitle?: string | null
          hook_title?: string | null
          id?: string
          layout_done?: boolean | null
          layout_notes?: string | null
          offer_block?: string | null
          presentation_block?: string | null
          problem_block?: string | null
          social_proof_done?: boolean | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      website_profile: {
        Row: {
          cms: string | null
          created_at: string | null
          id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          cms?: string | null
          created_at?: string | null
          id?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          cms?: string | null
          created_at?: string | null
          id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
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
