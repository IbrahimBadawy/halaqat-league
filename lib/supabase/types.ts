// أنواع قاعدة البيانات — مولدة آليًا من مخطط Supabase (لا تعدّلها يدويًا).
// أعد التوليد بعد أي migration: أداة MCP generate_typescript_types
// أو: npx supabase gen types typescript --project-id mgepypcbactyxiqokloi

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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          actor_role: string | null
          after: Json | null
          before: Json | null
          created_at: string
          detail: string | null
          entity: string
          entity_id: string | null
          id: string
          league_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_role?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          detail?: string | null
          entity: string
          entity_id?: string | null
          id?: string
          league_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_role?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          detail?: string | null
          entity?: string
          entity_id?: string | null
          id?: string
          league_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      card_usages: {
        Row: {
          applied_at: string | null
          created_at: string
          effect_snapshot: Json
          id: string
          match_id: string
          minute: number | null
          requested_by: string | null
          status: string
          team_card_id: string
        }
        Insert: {
          applied_at?: string | null
          created_at?: string
          effect_snapshot?: Json
          id?: string
          match_id: string
          minute?: number | null
          requested_by?: string | null
          status?: string
          team_card_id: string
        }
        Update: {
          applied_at?: string | null
          created_at?: string
          effect_snapshot?: Json
          id?: string
          match_id?: string
          minute?: number | null
          requested_by?: string | null
          status?: string
          team_card_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "card_usages_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_usages_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_usages_team_card_id_fkey"
            columns: ["team_card_id"]
            isOneToOne: false
            referencedRelation: "team_cards"
            referencedColumns: ["id"]
          },
        ]
      }
      group_teams: {
        Row: {
          group_id: string
          seed_no: number | null
          team_id: string
        }
        Insert: {
          group_id: string
          seed_no?: number | null
          team_id: string
        }
        Update: {
          group_id?: string
          seed_no?: number | null
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_teams_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_teams_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      groups: {
        Row: {
          id: string
          name: string
          stage_id: string
        }
        Insert: {
          id?: string
          name: string
          stage_id: string
        }
        Update: {
          id?: string
          name?: string
          stage_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "groups_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "stages"
            referencedColumns: ["id"]
          },
        ]
      }
      league_members: {
        Row: {
          created_at: string
          league_id: string
          roles: string[]
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          league_id: string
          roles?: string[]
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          league_id?: string
          roles?: string[]
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_members_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      leagues: {
        Row: {
          created_at: string
          ends_at: string | null
          id: string
          name: string
          rules_text: string | null
          season: string | null
          settings: Json
          slogan: string | null
          slug: string
          starts_at: string | null
          status: string
        }
        Insert: {
          created_at?: string
          ends_at?: string | null
          id?: string
          name: string
          rules_text?: string | null
          season?: string | null
          settings?: Json
          slogan?: string | null
          slug: string
          starts_at?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          ends_at?: string | null
          id?: string
          name?: string
          rules_text?: string | null
          season?: string | null
          settings?: Json
          slogan?: string | null
          slug?: string
          starts_at?: string | null
          status?: string
        }
        Relationships: []
      }
      match_events: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_reason: string | null
          edited_reason: string | null
          id: string
          linked_to: string | null
          match_id: string
          meta: Json
          minute: number
          note: string | null
          period: string
          player_id: string | null
          power_card: string | null
          secondary_player_id: string | null
          subtype: string | null
          team_id: string
          type: string
          value: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_reason?: string | null
          edited_reason?: string | null
          id?: string
          linked_to?: string | null
          match_id: string
          meta?: Json
          minute?: number
          note?: string | null
          period?: string
          player_id?: string | null
          power_card?: string | null
          secondary_player_id?: string | null
          subtype?: string | null
          team_id: string
          type: string
          value?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_reason?: string | null
          edited_reason?: string | null
          id?: string
          linked_to?: string | null
          match_id?: string
          meta?: Json
          minute?: number
          note?: string | null
          period?: string
          player_id?: string | null
          power_card?: string | null
          secondary_player_id?: string | null
          subtype?: string | null
          team_id?: string
          type?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "match_events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_events_linked_to_fkey"
            columns: ["linked_to"]
            isOneToOne: false
            referencedRelation: "match_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_events_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_events_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_events_secondary_player_id_fkey"
            columns: ["secondary_player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_events_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      match_lineups: {
        Row: {
          is_starter: boolean
          match_id: string
          player_id: string
          team_id: string
        }
        Insert: {
          is_starter?: boolean
          match_id: string
          player_id: string
          team_id: string
        }
        Update: {
          is_starter?: boolean
          match_id?: string
          player_id?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_lineups_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_lineups_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_lineups_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      match_officials: {
        Row: {
          match_id: string
          role: string
          status: string
          user_id: string
        }
        Insert: {
          match_id: string
          role: string
          status?: string
          user_id: string
        }
        Update: {
          match_id?: string
          role?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_officials_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_officials_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      match_reports: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          match_id: string
          motm_player_id: string | null
          recorder_signed_at: string | null
          referee_notes: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          match_id: string
          motm_player_id?: string | null
          recorder_signed_at?: string | null
          referee_notes?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          match_id?: string
          motm_player_id?: string | null
          recorder_signed_at?: string | null
          referee_notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "match_reports_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_reports_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: true
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_reports_motm_player_id_fkey"
            columns: ["motm_player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      matches: {
        Row: {
          away_pens: number | null
          away_score: number | null
          away_side: string
          away_team_id: string | null
          clock: Json | null
          code: string
          created_at: string
          duration_override_minutes: number | null
          group_id: string | null
          home_pens: number | null
          home_score: number | null
          home_side: string
          home_team_id: string | null
          id: string
          league_id: string
          locked: boolean
          match_day: string
          notes: string | null
          round_no: number
          slot: string
          stage_id: string
          stage_kind: string
          status: string
          venue_id: string
          winner_team_id: string | null
        }
        Insert: {
          away_pens?: number | null
          away_score?: number | null
          away_side: string
          away_team_id?: string | null
          clock?: Json | null
          code: string
          created_at?: string
          duration_override_minutes?: number | null
          group_id?: string | null
          home_pens?: number | null
          home_score?: number | null
          home_side: string
          home_team_id?: string | null
          id?: string
          league_id: string
          locked?: boolean
          match_day: string
          notes?: string | null
          round_no?: number
          slot: string
          stage_id: string
          stage_kind?: string
          status?: string
          venue_id: string
          winner_team_id?: string | null
        }
        Update: {
          away_pens?: number | null
          away_score?: number | null
          away_side?: string
          away_team_id?: string | null
          clock?: Json | null
          code?: string
          created_at?: string
          duration_override_minutes?: number | null
          group_id?: string | null
          home_pens?: number | null
          home_score?: number | null
          home_side?: string
          home_team_id?: string | null
          id?: string
          league_id?: string
          locked?: boolean
          match_day?: string
          notes?: string | null
          round_no?: number
          slot?: string
          stage_id?: string
          stage_kind?: string
          status?: string
          venue_id?: string
          winner_team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "matches_away_team_id_fkey"
            columns: ["away_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_home_team_id_fkey"
            columns: ["home_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_winner_team_id_fkey"
            columns: ["winner_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      players: {
        Row: {
          code: string
          created_at: string
          id: string
          name: string
          position: string
          shirt_number: number
          team_id: string
          user_id: string | null
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          name: string
          position?: string
          shirt_number: number
          team_id: string
          user_id?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          name?: string
          position?: string
          shirt_number?: number
          team_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "players_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "players_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          author_name: string
          created_at: string
          id: string
          league_id: string
          likes: number
          text: string
        }
        Insert: {
          author_name: string
          created_at?: string
          id?: string
          league_id: string
          likes?: number
          text: string
        }
        Update: {
          author_name?: string
          created_at?: string
          id?: string
          league_id?: string
          likes?: number
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "posts_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      power_card_templates: {
        Row: {
          description: string | null
          effect_type: string
          icon: string | null
          id: string
          league_id: string
          max_per_match: number
          name: string
          params: Json
          rarity: string | null
          usage_window: string
        }
        Insert: {
          description?: string | null
          effect_type: string
          icon?: string | null
          id?: string
          league_id: string
          max_per_match?: number
          name: string
          params?: Json
          rarity?: string | null
          usage_window?: string
        }
        Update: {
          description?: string | null
          effect_type?: string
          icon?: string | null
          id?: string
          league_id?: string
          max_per_match?: number
          name?: string
          params?: Json
          rarity?: string | null
          usage_window?: string
        }
        Relationships: [
          {
            foreignKeyName: "power_card_templates_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      predictions: {
        Row: {
          away: number
          created_at: string
          device_key: string | null
          home: number
          id: string
          league_id: string
          match_id: string
          points_awarded: number | null
          user_id: string | null
        }
        Insert: {
          away: number
          created_at?: string
          device_key?: string | null
          home: number
          id?: string
          league_id: string
          match_id: string
          points_awarded?: number | null
          user_id?: string | null
        }
        Update: {
          away?: number
          created_at?: string
          device_key?: string | null
          home?: number
          id?: string
          league_id?: string
          match_id?: string
          points_awarded?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "predictions_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "predictions_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "predictions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string
          id: string
          is_platform_admin: boolean
          position: string | null
          username: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name: string
          id: string
          is_platform_admin?: boolean
          position?: string | null
          username: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          id?: string
          is_platform_admin?: boolean
          position?: string | null
          username?: string
        }
        Relationships: []
      }
      stages: {
        Row: {
          config: Json
          id: string
          league_id: string
          legs: number
          order_no: number
          type: string
        }
        Insert: {
          config?: Json
          id?: string
          league_id: string
          legs?: number
          order_no: number
          type: string
        }
        Update: {
          config?: Json
          id?: string
          league_id?: string
          legs?: number
          order_no?: number
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "stages_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      standing_adjustments: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          league_id: string
          points: number
          reason: string
          source: string
          team_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          league_id: string
          points: number
          reason: string
          source?: string
          team_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          league_id?: string
          points?: number
          reason?: string
          source?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "standing_adjustments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "standing_adjustments_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "standing_adjustments_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_cards: {
        Row: {
          acquired_from: string
          id: string
          quantity: number
          team_id: string
          template_id: string
        }
        Insert: {
          acquired_from?: string
          id?: string
          quantity?: number
          team_id: string
          template_id: string
        }
        Update: {
          acquired_from?: string
          id?: string
          quantity?: number
          team_id?: string
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_cards_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_cards_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "power_card_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          captain_id: string | null
          created_at: string
          group_code: string | null
          id: string
          league_id: string
          name: string
          short_code: string
          status: string
        }
        Insert: {
          captain_id?: string | null
          created_at?: string
          group_code?: string | null
          id?: string
          league_id: string
          name: string
          short_code: string
          status?: string
        }
        Update: {
          captain_id?: string | null
          created_at?: string
          group_code?: string | null
          id?: string
          league_id?: string
          name?: string
          short_code?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "teams_captain_id_fkey"
            columns: ["captain_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teams_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_availability: {
        Row: {
          date: string
          id: string
          slot: string
          venue_id: string
        }
        Insert: {
          date: string
          id?: string
          slot: string
          venue_id: string
        }
        Update: {
          date?: string
          id?: string
          slot?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_availability_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venues: {
        Row: {
          all_slots: boolean
          id: string
          league_id: string
          name: string
          notes: string | null
        }
        Insert: {
          all_slots?: boolean
          id?: string
          league_id: string
          name: string
          notes?: string | null
        }
        Update: {
          all_slots?: boolean
          id?: string
          league_id?: string
          name?: string
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "venues_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      bump_post_likes: {
        Args: { p_post: string }
        Returns: undefined
      }
      has_league_role: {
        Args: { p_league: string; p_roles: string[] }
        Returns: boolean
      }
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
