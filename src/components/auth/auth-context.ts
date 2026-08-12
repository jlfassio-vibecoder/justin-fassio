import { createContext } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import type { Profile } from '@/types/database';

export type AuthState = {
  loading: boolean;
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  configured: boolean;
  reloadProfile: () => Promise<void>;
};

export const AuthContext = createContext<AuthState | null>(null);
