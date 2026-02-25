import { User } from '@supabase/supabase-js';

export type AuthUser = User;

export interface DatabaseUser {
  id: string;
  username: string;
  email: string;
  password: string;
  created_at: string;
}
