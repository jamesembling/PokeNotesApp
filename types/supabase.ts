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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      archetype_catalog: {
        Row: {
          canonical_id: string | null
          detection_sprites: Json
          id: string
          is_excluded: boolean
          label: string
          last_synced_at: string
          learned_match_count: number
          required_match_groups: Json
          source: string
          sprites: Json
          user_id: string | null
        }
        Insert: {
          canonical_id?: string | null
          detection_sprites?: Json
          id: string
          is_excluded?: boolean
          label: string
          last_synced_at?: string
          learned_match_count?: number
          required_match_groups?: Json
          source?: string
          sprites?: Json
          user_id?: string | null
        }
        Update: {
          canonical_id?: string | null
          detection_sprites?: Json
          id?: string
          is_excluded?: boolean
          label?: string
          last_synced_at?: string
          learned_match_count?: number
          required_match_groups?: Json
          source?: string
          sprites?: Json
          user_id?: string | null
        }
        Relationships: []
      }
      card_effect_catalog: {
        Row: {
          card_name: string
          effect_kind: string
          effect_name: string | null
          effect_text: string | null
          last_synced_at: string
          normalized_card_name: string
          normalized_effect_name: string
          source_card_id: string
          subtypes: Json
          supertype: string
        }
        Insert: {
          card_name: string
          effect_kind: string
          effect_name?: string | null
          effect_text?: string | null
          last_synced_at?: string
          normalized_card_name: string
          normalized_effect_name?: string
          source_card_id: string
          subtypes?: Json
          supertype?: string
        }
        Update: {
          card_name?: string
          effect_kind?: string
          effect_name?: string | null
          effect_text?: string | null
          last_synced_at?: string
          normalized_card_name?: string
          normalized_effect_name?: string
          source_card_id?: string
          subtypes?: Json
          supertype?: string
        }
        Relationships: []
      }
      deck_lists: {
        Row: {
          created_at: string
          created_by: string
          date: string
          deck_id: string
          format: string
          id: string
          name: string
          notes: string
          parsed_cards: Json
          position: number
          raw_list: string
          sorted_cards: Json
          sorted_cards_version: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          date?: string
          deck_id: string
          format?: string
          id: string
          name?: string
          notes?: string
          parsed_cards?: Json
          position?: number
          raw_list?: string
          sorted_cards?: Json
          sorted_cards_version?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          date?: string
          deck_id?: string
          format?: string
          id?: string
          name?: string
          notes?: string
          parsed_cards?: Json
          position?: number
          raw_list?: string
          sorted_cards?: Json
          sorted_cards_version?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deck_lists_owner_deck_fkey"
            columns: ["user_id", "deck_id"]
            isOneToOne: false
            referencedRelation: "decks"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      deck_log_stats: {
        Row: {
          created_at: string
          deck_id: string
          games_lost: number
          games_played: number
          games_won: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deck_id: string
          games_lost?: number
          games_played?: number
          games_won?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          deck_id?: string
          games_lost?: number
          games_played?: number
          games_won?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deck_log_stats_owner_deck_fkey"
            columns: ["user_id", "deck_id"]
            isOneToOne: true
            referencedRelation: "decks"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      deck_matchups: {
        Row: {
          created_at: string
          deck_id: string
          deck_name: string
          deck_pokemon: Json
          format: string
          go_preference: string
          id: string
          ideal_bench: string
          matchup_favor: string
          matchup_plan: string
          position: number
          techs_needed: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deck_id: string
          deck_name?: string
          deck_pokemon?: Json
          format?: string
          go_preference?: string
          id: string
          ideal_bench?: string
          matchup_favor?: string
          matchup_plan?: string
          position?: number
          techs_needed?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          deck_id?: string
          deck_name?: string
          deck_pokemon?: Json
          format?: string
          go_preference?: string
          id?: string
          ideal_bench?: string
          matchup_favor?: string
          matchup_plan?: string
          position?: number
          techs_needed?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deck_matchups_owner_deck_fkey"
            columns: ["user_id", "deck_id"]
            isOneToOne: false
            referencedRelation: "decks"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      decks: {
        Row: {
          archetype_id: string
          core_strategy: string
          created_at: string
          deck_lists: Json
          deck_name: string
          deck_pokemon: Json
          format: string
          general_notes: string
          go_preference: string
          id: string
          matchups: Json
          resource_plan: string
          setup_goals: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          archetype_id?: string
          core_strategy?: string
          created_at?: string
          deck_lists?: Json
          deck_name?: string
          deck_pokemon?: Json
          format?: string
          general_notes?: string
          go_preference?: string
          id: string
          matchups?: Json
          resource_plan?: string
          setup_goals?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          archetype_id?: string
          core_strategy?: string
          created_at?: string
          deck_lists?: Json
          deck_name?: string
          deck_pokemon?: Json
          format?: string
          general_notes?: string
          go_preference?: string
          id?: string
          matchups?: Json
          resource_plan?: string
          setup_goals?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      log_shares: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          owner_user_id: string
          payload: Json
          source_log_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          id: string
          owner_user_id: string
          payload: Json
          source_log_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          owner_user_id?: string
          payload?: Json
          source_log_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      logs: {
        Row: {
          coin_toss_won: boolean | null
          created_at: string
          date: string
          format: string
          go_order: string
          id: string
          imported_at: string
          linked_deck_id: string | null
          linked_deck_list_id: string | null
          opponent_attack_damage: number
          opponent_deck_name: string
          opponent_deck_slug: string
          opponent_deck_sprites: string
          opponent_mulligans: number
          opponent_player_name: string
          opponent_prizes_taken: number
          raw_log: string
          reason: string
          result: string
          search_vector: unknown
          sections: Json
          self_attack_damage: number
          self_deck_name: string
          self_deck_slug: string
          self_deck_sprites: string
          self_mulligans: number
          self_player_name: string
          self_prizes_taken: number
          total_turns: number
          updated_at: string
          user_id: string
        }
        Insert: {
          coin_toss_won?: boolean | null
          created_at?: string
          date: string
          format?: string
          go_order?: string
          id: string
          imported_at?: string
          linked_deck_id?: string | null
          linked_deck_list_id?: string | null
          opponent_attack_damage?: number
          opponent_deck_name?: string
          opponent_deck_slug?: string
          opponent_deck_sprites?: string
          opponent_mulligans?: number
          opponent_player_name?: string
          opponent_prizes_taken?: number
          raw_log?: string
          reason?: string
          result: string
          search_vector?: unknown
          sections?: Json
          self_attack_damage?: number
          self_deck_name?: string
          self_deck_slug?: string
          self_deck_sprites?: string
          self_mulligans?: number
          self_player_name?: string
          self_prizes_taken?: number
          total_turns?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          coin_toss_won?: boolean | null
          created_at?: string
          date?: string
          format?: string
          go_order?: string
          id?: string
          imported_at?: string
          linked_deck_id?: string | null
          linked_deck_list_id?: string | null
          opponent_attack_damage?: number
          opponent_deck_name?: string
          opponent_deck_slug?: string
          opponent_deck_sprites?: string
          opponent_mulligans?: number
          opponent_player_name?: string
          opponent_prizes_taken?: number
          raw_log?: string
          reason?: string
          result?: string
          search_vector?: unknown
          sections?: Json
          self_attack_damage?: number
          self_deck_name?: string
          self_deck_slug?: string
          self_deck_sprites?: string
          self_mulligans?: number
          self_player_name?: string
          self_prizes_taken?: number
          total_turns?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "logs_owner_linked_deck_fkey"
            columns: ["user_id", "linked_deck_id"]
            isOneToOne: false
            referencedRelation: "decks"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      pokemon_catalog: {
        Row: {
          evolves_from: string | null
          label: string
          last_synced_at: string
          name_de: string | null
          name_es: string | null
          name_fr: string | null
          name_it: string | null
          name_pt_br: string | null
          national_dex: number | null
          slug: string
          sprite_url: string
          stage: string
        }
        Insert: {
          evolves_from?: string | null
          label: string
          last_synced_at?: string
          name_de?: string | null
          name_es?: string | null
          name_fr?: string | null
          name_it?: string | null
          name_pt_br?: string | null
          national_dex?: number | null
          slug: string
          sprite_url?: string
          stage?: string
        }
        Update: {
          evolves_from?: string | null
          label?: string
          last_synced_at?: string
          name_de?: string | null
          name_es?: string | null
          name_fr?: string | null
          name_it?: string | null
          name_pt_br?: string | null
          national_dex?: number | null
          slug?: string
          sprite_url?: string
          stage?: string
        }
        Relationships: [
          {
            foreignKeyName: "pokemon_catalog_evolves_from_fkey"
            columns: ["evolves_from"]
            isOneToOne: false
            referencedRelation: "pokemon_catalog"
            referencedColumns: ["slug"]
          },
        ]
      }
      profiles: {
        Row: {
          auth_account_created_at: string | null
          avatar_color: string
          created_at: string
          display_name: string
          email: string
          first_name: string
          id: string
          last_active_at: string | null
          last_login_at: string | null
          last_name: string
          login_count: number
          ptcgl_username: string
          role: string
          updated_at: string
        }
        Insert: {
          auth_account_created_at?: string | null
          avatar_color?: string
          created_at?: string
          display_name?: string
          email?: string
          first_name?: string
          id: string
          last_active_at?: string | null
          last_login_at?: string | null
          last_name?: string
          login_count?: number
          ptcgl_username?: string
          role?: string
          updated_at?: string
        }
        Update: {
          auth_account_created_at?: string | null
          avatar_color?: string
          created_at?: string
          display_name?: string
          email?: string
          first_name?: string
          id?: string
          last_active_at?: string | null
          last_login_at?: string | null
          last_name?: string
          login_count?: number
          ptcgl_username?: string
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
      role_permissions: {
        Row: {
          created_at: string
          menu_sections: Json
          role: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          menu_sections?: Json
          role: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          menu_sections?: Json
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
      route_performance_events: {
        Row: {
          created_at: string
          deployment_env: string
          device_memory: number | null
          dom_content_loaded_ms: number | null
          downlink: number | null
          duration_ms: number
          effective_type: string | null
          event_type: string
          from_path: string | null
          hardware_concurrency: number | null
          id: string
          load_event_ms: number | null
          loading_ms: number | null
          max_long_task_ms: number | null
          resource_count: number | null
          rtt: number | null
          save_data: boolean
          screen_height: number | null
          screen_width: number | null
          slowest_resource_ms: number | null
          slowest_resource_path: string | null
          source_host: string | null
          source_origin: string | null
          to_path: string
          total_blocking_time_ms: number | null
          transfer_size_bytes: number | null
          ttfb_ms: number | null
          user_agent: string | null
          user_id: string
          viewport_height: number | null
          viewport_width: number | null
        }
        Insert: {
          created_at?: string
          deployment_env?: string
          device_memory?: number | null
          dom_content_loaded_ms?: number | null
          downlink?: number | null
          duration_ms: number
          effective_type?: string | null
          event_type: string
          from_path?: string | null
          hardware_concurrency?: number | null
          id?: string
          load_event_ms?: number | null
          loading_ms?: number | null
          max_long_task_ms?: number | null
          resource_count?: number | null
          rtt?: number | null
          save_data?: boolean
          screen_height?: number | null
          screen_width?: number | null
          slowest_resource_ms?: number | null
          slowest_resource_path?: string | null
          source_host?: string | null
          source_origin?: string | null
          to_path: string
          total_blocking_time_ms?: number | null
          transfer_size_bytes?: number | null
          ttfb_ms?: number | null
          user_agent?: string | null
          user_id: string
          viewport_height?: number | null
          viewport_width?: number | null
        }
        Update: {
          created_at?: string
          deployment_env?: string
          device_memory?: number | null
          dom_content_loaded_ms?: number | null
          downlink?: number | null
          duration_ms?: number
          effective_type?: string | null
          event_type?: string
          from_path?: string | null
          hardware_concurrency?: number | null
          id?: string
          load_event_ms?: number | null
          loading_ms?: number | null
          max_long_task_ms?: number | null
          resource_count?: number | null
          rtt?: number | null
          save_data?: boolean
          screen_height?: number | null
          screen_width?: number | null
          slowest_resource_ms?: number | null
          slowest_resource_path?: string | null
          source_host?: string | null
          source_origin?: string | null
          to_path?: string
          total_blocking_time_ms?: number | null
          transfer_size_bytes?: number | null
          ttfb_ms?: number | null
          user_agent?: string | null
          user_id?: string
          viewport_height?: number | null
          viewport_width?: number | null
        }
        Relationships: []
      }
      tournament_rounds: {
        Row: {
          created_at: string
          id: string
          notes: string
          opponent_deck_name: string
          opponent_deck_sprites: Json
          result: string
          round_number: number
          tournament_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id: string
          notes?: string
          opponent_deck_name?: string
          opponent_deck_sprites?: Json
          result: string
          round_number: number
          tournament_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string
          opponent_deck_name?: string
          opponent_deck_sprites?: Json
          result?: string
          round_number?: number
          tournament_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_rounds_owner_tournament_fkey"
            columns: ["user_id", "tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      tournaments: {
        Row: {
          category: string
          created_at: string
          date_from: string
          date_to: string
          deck_name: string
          deck_sprites: Json
          format: string
          id: string
          linked_deck_id: string | null
          linked_deck_list_id: string | null
          name: string
          notes: string
          placement: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: string
          created_at?: string
          date_from: string
          date_to: string
          deck_name?: string
          deck_sprites?: Json
          format?: string
          id: string
          linked_deck_id?: string | null
          linked_deck_list_id?: string | null
          name?: string
          notes?: string
          placement?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string
          date_from?: string
          date_to?: string
          deck_name?: string
          deck_sprites?: Json
          format?: string
          id?: string
          linked_deck_id?: string | null
          linked_deck_list_id?: string | null
          name?: string
          notes?: string
          placement?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournaments_owner_linked_deck_fkey"
            columns: ["user_id", "linked_deck_id"]
            isOneToOne: false
            referencedRelation: "decks"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      user_archetype_matchup_stats: {
        Row: {
          created_at: string
          games_lost: number
          games_played: number
          games_won: number
          last_played_date: string | null
          matchup_key: string
          opponent_deck_name: string
          opponent_deck_sprites: string
          source_deck_slugs: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          games_lost?: number
          games_played?: number
          games_won?: number
          last_played_date?: string | null
          matchup_key: string
          opponent_deck_name?: string
          opponent_deck_sprites?: string
          source_deck_slugs?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          games_lost?: number
          games_played?: number
          games_won?: number
          last_played_date?: string | null
          matchup_key?: string
          opponent_deck_name?: string
          opponent_deck_sprites?: string
          source_deck_slugs?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_log_stats: {
        Row: {
          attack_damage: number
          coin_flips_won: number
          created_at: string
          games_lost: number
          games_played: number
          games_won: number
          mulligans_taken: number
          opponent_attack_damage: number
          prizes_taken: number
          tracked_damage: number
          tracked_prizes: number
          updated_at: string
          user_id: string
        }
        Insert: {
          attack_damage?: number
          coin_flips_won?: number
          created_at?: string
          games_lost?: number
          games_played?: number
          games_won?: number
          mulligans_taken?: number
          opponent_attack_damage?: number
          prizes_taken?: number
          tracked_damage?: number
          tracked_prizes?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          attack_damage?: number
          coin_flips_won?: number
          created_at?: string
          games_lost?: number
          games_played?: number
          games_won?: number
          mulligans_taken?: number
          opponent_attack_damage?: number
          prizes_taken?: number
          tracked_damage?: number
          tracked_prizes?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      commit_deck_aggregate_child: {
        Args: {
          p_child: Json
          p_deck_id: string
          p_expected_child_updated_at: string
          p_kind: string
          p_operation: string
          p_updated_at: string
        }
        Returns: string
      }
      create_log_share: {
        Args: { p_payload: Json; p_source_log_id: string; p_token: string }
        Returns: {
          created_at: string
          expires_at: string
          id: string
          source_log_id: string
        }[]
      }
      get_active_log_share: {
        Args: { p_token: string }
        Returns: {
          created_at: string
          expires_at: string
          id: string
          payload: Json
          source_log_id: string
        }[]
      }
      get_admin_dashboard_overview: {
        Args: never
        Returns: {
          admin_count: number
          archetype_catalog_count: number
          archetype_last_synced_at: string
          excluded_archetype_count: number
          pokemon_catalog_count: number
          pokemon_last_synced_at: string
          user_count: number
        }[]
      }
      get_admin_users_overview: {
        Args: never
        Returns: {
          auth_account_created_at: string
          created_at: string
          deck_count: number
          deck_list_count: number
          display_name: string
          email: string
          id: string
          last_active_at: string
          last_activity_at: string
          last_login_at: string
          log_count: number
          login_count: number
          ptcgl_username: string
          role: string
          tournament_count: number
        }[]
      }
      get_archetype_matchup_key: {
        Args: {
          target_opponent_deck_name: string
          target_opponent_deck_slug: string
          target_opponent_deck_sprites: string
        }
        Returns: string
      }
      get_deck_index: {
        Args: never
        Returns: {
          archetype_id: string
          created_at: string
          deck_list_count: number
          deck_name: string
          deck_pokemon: Json
          format: string
          go_preference: string
          id: string
          updated_at: string
          user_id: string
        }[]
      }
      get_deck_index_stats: {
        Args: { target_deck_ids: string[] }
        Returns: {
          deck_id: string
          losses: number
          total: number
          wins: number
        }[]
      }
      get_log_stats_overview: {
        Args: never
        Returns: {
          attack_damage: number
          coin_flips_won: number
          games_lost: number
          games_played: number
          games_won: number
          mulligans_taken: number
          opponent_attack_damage: number
          prizes_taken: number
          tracked_damage: number
          tracked_prizes: number
        }[]
      }
      refresh_deck_log_stats: {
        Args: { target_deck_id: string; target_user_id: string }
        Returns: undefined
      }
      refresh_user_archetype_matchup_stats: {
        Args: { target_matchup_key: string; target_user_id: string }
        Returns: undefined
      }
      refresh_user_log_stats: {
        Args: { target_user_id: string }
        Returns: undefined
      }
      set_profile_role: {
        Args: {
          p_actor_user_id: string
          p_role: string
          p_target_user_id: string
        }
        Returns: undefined
      }
      sync_current_profile: {
        Args: never
        Returns: {
          auth_account_created_at: string | null
          avatar_color: string
          created_at: string
          display_name: string
          email: string
          first_name: string
          id: string
          last_active_at: string | null
          last_login_at: string | null
          last_name: string
          login_count: number
          ptcgl_username: string
          role: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      touch_current_profile_activity: { Args: never; Returns: string }
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
