import { useEffect, useState, useCallback } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isAdmin: boolean;
  isApproved: boolean;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    session: null,
    loading: true,
    isAdmin: false,
    isApproved: false,
  });

  const checkRoles = useCallback(async (userId: string) => {
    try {
      const [adminResult, approvedResult] = await Promise.all([
        supabase.rpc('is_admin'),
        supabase.rpc('is_approved'),
      ]);

      return {
        isAdmin: adminResult.data ?? false,
        isApproved: approvedResult.data ?? false,
      };
    } catch (error) {
      console.error('Error checking roles:', error);
      return { isAdmin: false, isApproved: false };
    }
  }, []);

  const refresh = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (session?.user) {
      const roles = await checkRoles(session.user.id);
      setState({
        user: session.user,
        session,
        loading: false,
        ...roles,
      });
      return roles;
    } else {
      setState({
        user: null,
        session: null,
        loading: false,
        isAdmin: false,
        isApproved: false,
      });
      return { isAdmin: false, isApproved: false };
    }
  }, [checkRoles]);

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (session?.user) {
          // Defer role check to avoid blocking
          setTimeout(async () => {
            const roles = await checkRoles(session.user.id);
            setState({
              user: session.user,
              session,
              loading: false,
              ...roles,
            });
          }, 0);
        } else {
          setState({
            user: null,
            session: null,
            loading: false,
            isAdmin: false,
            isApproved: false,
          });
        }
      }
    );

    // Then check current session
    refresh();

    return () => {
      subscription.unsubscribe();
    };
  }, [checkRoles, refresh]);

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
    return data;
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
        },
        emailRedirectTo: window.location.origin,
      },
    });
    if (error) throw error;
    return data;
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  return {
    ...state,
    signIn,
    signUp,
    signOut,
    refresh,
  };
}
