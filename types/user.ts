import { User } from '@supabase/supabase-js';

export type AuthUser = User;

export interface DatabaseUser {
  id: number;
  username: string;
  designation: string;
  password: string;
  user_id: string;
  role_id: number;
  division_id: number;
  created_at: string;
   /** Resolved from the divisions table on sign-in */
  division_name: string | null;
  /** Resolved from the roles table on sign-in */
  role_name: string | null;
}
