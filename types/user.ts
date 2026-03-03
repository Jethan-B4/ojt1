import { User } from '@supabase/supabase-js';

export type AuthUser = User;

export interface DatabaseUser {
  id: number;
  username: string;
  email: string;
  password: string;
  role_id: number;
  division_id: number;
  created_at: string;
}
