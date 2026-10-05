export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: 'member' | 'board' | 'admin';
  created_at: string;
  updated_at: string;
}

export interface Application {
  id: string;
  user_id: string;
  status: 'draft' | 'submitted' | 'under_review' | 'accepted' | 'rejected';
  full_name: string | null;
  uid: string | null;
  major_minor: string | null;
  current_year: string | null;
  graduation_year: string | null;
  student_status: string | null;
  relevant_experience: string | null;
  current_commitments: string | null;
  your_story: string | null;
  your_dream: string | null;
  proud_of_building: string | null;
  natural_skills: string | null;
  uncertainty_failures: string | null;
  leadership_experiences: string | null;
  interest_in_xr: string | null;
  linkedin_url: string | null;
  github_url: string | null;
  portfolio_url: string | null;
  resume_path: string | null;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdminNote {
  id: string;
  application_id: string;
  author_id: string;
  author_name?: string;
  content: string;
  created_at: string;
}

export interface ActivityLogEntry {
  id: string;
  actor_id: string;
  actor_name?: string;
  action: string;
  target_application_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

export interface Project {
  id: string;
  name: string;
  blurb: string;
  website: string | null;
  labels: string[];
  contact_name: string;
  contact_email: string;
  tier: 'Gateway' | 'Intermediate' | 'Advanced';
  equipment: string;
  estimated_completion: string;
  people: string[];
  demo_videos: string[] | null;
  open_positions: string | null;
  prompt_question: string;
  display_order: number;
  is_active: boolean;
  hide_from_applications: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProjectSelection {
  id: string;
  application_id: string;
  project_id: string;
  rank: number;
  prompt_answer: string;
  created_at: string;
}

export interface DemoDayPlayer {
  id: string;
  name: string;
  email: string;
  current_step: number;
  started_at: string;
  completed_at: string | null;
}

export interface DemoDayScan {
  id: string;
  player_id: string;
  station_slug: string;
  scanned_at: string;
}

export type SuitsStatus = 'new' | 'interview' | 'accepted' | 'rejected';

export interface SuitsApplication {
  id: string;
  created_at: string;
  updated_at: string;
  status: SuitsStatus;
  full_name: string;
  email: string;
  discord_username: string;
  year: string;
  majors: string;
  minors: string | null;
  organizations: string;
  resume_path: string | null;
  portfolio_url: string | null;
  bring_to_table: string;
  why_join: string;
  teamwork_story: string;
  team_environment: string;
  interest_areas: string[];
  interest_other: string | null;
  hours_per_week: string;
  availability_changes: string;
  required_dates: string;
  us_citizen_or_pr: string;
  interview_slots: string[];
  anything_else: string | null;
  reviewer_notes: string | null;
}

export type FundingPitchStatus = 'new' | 'reviewing' | 'chosen' | 'waitlisted' | 'declined';
export interface FundingPitch {
  id: string;
  created_at: string;
  updated_at: string;
  status: FundingPitchStatus;
  project_title: string;
  idea: string;
  topic: string | null;
  lead_name: string;
  lead_email: string;
  lead_discord: string;
  members: { name: string; detail: string }[];
  outline: string;
  zero_dollar_plan: string;
  timeline: string;
  deliverable: string;
  lab_equipment: string | null;
  budget_items: { name: string; cost: number; priority: 'must' | 'nice'; link: string }[];
  requested_total: number;
  agreed_to_rules: boolean;
  reviewer_notes: string | null;
}

export type TeamApplicationStatus = 'new' | 'contacted' | 'joined' | 'declined';
export interface TeamApplication {
  id: string;
  created_at: string;
  updated_at: string;
  status: TeamApplicationStatus;
  team: string;
  full_name: string;
  email: string;
  discord_username: string;
  year: string;
  major: string;
  pitch: string;
  tools: string[];
  link: string | null;
  availability: string;
  anything_else: string | null;
  reviewer_notes: string | null;
}

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: { [K in keyof Profile]: Profile[K] };
        Insert: Omit<Profile, 'created_at' | 'updated_at'>;
        Update: Partial<Profile>;
        Relationships: [];
      };
      applications: {
        Row: { [K in keyof Application]: Application[K] };
        Insert: Partial<Application> & { user_id: string };
        Update: Partial<Application>;
        Relationships: [{ foreignKeyName: 'applications_user_id_fkey'; columns: ['user_id']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] }];
      };
      admin_notes: {
        Row: { [K in keyof AdminNote]: AdminNote[K] };
        Insert: Omit<AdminNote, 'id' | 'created_at' | 'author_name'>;
        Update: Partial<AdminNote>;
        Relationships: [];
      };
      activity_log: {
        Row: { [K in keyof ActivityLogEntry]: ActivityLogEntry[K] };
        Insert: Omit<ActivityLogEntry, 'id' | 'created_at' | 'actor_name'>;
        Update: never;
        Relationships: [];
      };
      projects: {
        Row: { [K in keyof Project]: Project[K] };
        Insert: Partial<Project> & { name: string };
        Update: Partial<Project>;
        Relationships: [];
      };
      project_selections: {
        Row: { [K in keyof ProjectSelection]: ProjectSelection[K] };
        Insert: Omit<ProjectSelection, 'id' | 'created_at'>;
        Update: Partial<ProjectSelection>;
        Relationships: [];
      };
      demoday_players: {
        Row: { [K in keyof DemoDayPlayer]: DemoDayPlayer[K] };
        Insert: { name: string; email: string };
        Update: Partial<DemoDayPlayer>;
        Relationships: [];
      };
      demoday_scans: {
        Row: { [K in keyof DemoDayScan]: DemoDayScan[K] };
        Insert: Omit<DemoDayScan, 'id' | 'scanned_at'>;
        Update: never;
        Relationships: [];
      };
      suits_applications: {
        Row: { [K in keyof SuitsApplication]: SuitsApplication[K] };
        Insert: Omit<SuitsApplication, 'created_at' | 'updated_at' | 'status' | 'reviewer_notes'> & { status?: SuitsStatus };
        Update: Partial<SuitsApplication>;
        Relationships: [];
      };
      funding_pitches: {
        Row: { [K in keyof FundingPitch]: FundingPitch[K] };
        Insert: Omit<FundingPitch, 'id' | 'created_at' | 'updated_at' | 'status' | 'reviewer_notes'>;
        Update: Partial<FundingPitch>;
        Relationships: [];
      };
      team_applications: {
        Row: { [K in keyof TeamApplication]: TeamApplication[K] };
        Insert: Omit<TeamApplication, 'id' | 'created_at' | 'updated_at' | 'status' | 'reviewer_notes'>;
        Update: Partial<TeamApplication>;
        Relationships: [];
      };
    };
    Views: { [K in never]: never };
    Enums: { [K in never]: never };
    CompositeTypes: { [K in never]: never };
    Functions: {
      demoday_record_scan: {
        Args: { p_player_id: string; p_station_slug: string };
        Returns: { ok: boolean; reason: string; new_step: number; finished: boolean };
      };
    };
  };
}
