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

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Omit<Profile, 'created_at' | 'updated_at'>;
        Update: Partial<Profile>;
      };
      applications: {
        Row: Application;
        Insert: Partial<Application> & { user_id: string };
        Update: Partial<Application>;
      };
      admin_notes: {
        Row: AdminNote;
        Insert: Omit<AdminNote, 'id' | 'created_at' | 'author_name'>;
        Update: Partial<AdminNote>;
      };
      activity_log: {
        Row: ActivityLogEntry;
        Insert: Omit<ActivityLogEntry, 'id' | 'created_at' | 'actor_name'>;
        Update: never;
      };
    };
  };
}
