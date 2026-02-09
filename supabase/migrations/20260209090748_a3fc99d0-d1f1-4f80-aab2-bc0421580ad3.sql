-- ============================================
-- GESTION DE PERMANENCES V2+ DATABASE SCHEMA
-- ============================================

-- 1. Create app_role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

-- 2. Profiles table
CREATE TABLE public.profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  approved BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. User roles table (separate from profiles for security)
CREATE TABLE public.user_roles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL DEFAULT 'user',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Team members table
CREATE TABLE public.team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  email TEXT,
  title TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create index for case-insensitive name lookup
CREATE INDEX idx_team_members_full_name_lower ON public.team_members (LOWER(full_name));

-- 5. Duty entries table
CREATE TABLE public.duty_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  duty_date DATE NOT NULL,
  duty_type TEXT NOT NULL DEFAULT 'Day',
  team_member_id UUID REFERENCES public.team_members(id) ON DELETE SET NULL,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- CRITICAL: Unique constraint - no person can be assigned twice on same date
CREATE UNIQUE INDEX idx_duty_entries_unique_member_date 
ON public.duty_entries (duty_date, team_member_id) 
WHERE team_member_id IS NOT NULL;

-- Create index for performance
CREATE INDEX idx_duty_entries_duty_date ON public.duty_entries (duty_date);
CREATE INDEX idx_duty_entries_team_member ON public.duty_entries (team_member_id);

-- 6. Holidays table
CREATE TABLE public.holidays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL UNIQUE,
  label TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT 'MA',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_holidays_date ON public.holidays (date);

-- 7. Import batches table
CREATE TABLE public.import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_filename TEXT,
  imported_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  inserted_count INT DEFAULT 0,
  skipped_count INT DEFAULT 0,
  error_count INT DEFAULT 0,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 8. Audit log entries table
CREATE TABLE public.audit_log_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT NOT NULL,
  table_name TEXT NOT NULL,
  record_id UUID,
  actor_user_id UUID,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_audit_log_created_at ON public.audit_log_entries (created_at);
CREATE INDEX idx_audit_log_table_name ON public.audit_log_entries (table_name);
CREATE INDEX idx_audit_log_actor ON public.audit_log_entries (actor_user_id);

-- ============================================
-- HELPER FUNCTIONS (Security Definer)
-- ============================================

-- Check if current user is admin (avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role = 'admin'
  )
$$;

-- Check if current user is approved
CREATE OR REPLACE FUNCTION public.is_approved()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT approved FROM public.profiles WHERE user_id = auth.uid()),
    false
  )
$$;

-- Check if user has specific role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- ============================================
-- ADMIN FUNCTIONS
-- ============================================

-- Approve a user
CREATE OR REPLACE FUNCTION public.admin_approve_user(target_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if caller is admin
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can approve users';
  END IF;
  
  UPDATE public.profiles
  SET approved = true, updated_at = now()
  WHERE user_id = target_user_id;
  
  -- Log the action
  INSERT INTO public.audit_log_entries (action, table_name, record_id, actor_user_id, metadata)
  VALUES ('approve_user', 'profiles', target_user_id, auth.uid(), jsonb_build_object('approved', true));
  
  RETURN true;
END;
$$;

-- Set user role
CREATE OR REPLACE FUNCTION public.admin_set_role(target_user_id UUID, new_role TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  role_enum public.app_role;
BEGIN
  -- Check if caller is admin
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can change roles';
  END IF;
  
  -- Cannot change own role
  IF target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot change your own role';
  END IF;
  
  -- Cast string to enum
  role_enum := new_role::public.app_role;
  
  UPDATE public.user_roles
  SET role = role_enum
  WHERE user_id = target_user_id;
  
  -- Log the action
  INSERT INTO public.audit_log_entries (action, table_name, record_id, actor_user_id, metadata)
  VALUES ('change_role', 'user_roles', target_user_id, auth.uid(), jsonb_build_object('new_role', new_role));
  
  RETURN true;
END;
$$;

-- Purge old audit logs
CREATE OR REPLACE FUNCTION public.purge_audit_log(keep_days INT)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count INT;
BEGIN
  -- Check if caller is admin
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can purge audit logs';
  END IF;
  
  DELETE FROM public.audit_log_entries
  WHERE created_at < now() - (keep_days || ' days')::INTERVAL;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- Seed Morocco holidays for a given year
CREATE OR REPLACE FUNCTION public.seed_morocco_holidays(year INT)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted_count INT := 0;
BEGIN
  -- Check if caller is admin
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can seed holidays';
  END IF;
  
  -- Fixed Moroccan holidays
  INSERT INTO public.holidays (date, label, country)
  VALUES
    (make_date(year, 1, 1), 'Jour de l''An', 'MA'),
    (make_date(year, 1, 11), 'Manifeste de l''Indépendance', 'MA'),
    (make_date(year, 5, 1), 'Fête du Travail', 'MA'),
    (make_date(year, 7, 30), 'Fête du Trône', 'MA'),
    (make_date(year, 8, 14), 'Oued Ed-Dahab', 'MA'),
    (make_date(year, 8, 20), 'Révolution du Roi et du Peuple', 'MA'),
    (make_date(year, 8, 21), 'Fête de la Jeunesse', 'MA'),
    (make_date(year, 11, 6), 'Marche Verte', 'MA'),
    (make_date(year, 11, 18), 'Fête de l''Indépendance', 'MA')
  ON CONFLICT (date) DO NOTHING;
  
  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count;
END;
$$;

-- ============================================
-- TRIGGERS
-- ============================================

-- Auto-create profile and role on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  admin_count INT;
  user_full_name TEXT;
BEGIN
  -- Get full name from metadata or email
  user_full_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    split_part(NEW.email, '@', 1)
  );
  
  -- Count existing admins
  SELECT COUNT(*) INTO admin_count FROM public.user_roles WHERE role = 'admin';
  
  -- Bootstrap: first user becomes admin and is auto-approved
  IF admin_count = 0 THEN
    INSERT INTO public.profiles (user_id, full_name, approved)
    VALUES (NEW.id, user_full_name, true);
    
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.profiles (user_id, full_name, approved)
    VALUES (NEW.id, user_full_name, false);
    
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'user');
  END IF;
  
  RETURN NEW;
END;
$$;

-- Trigger for new user creation
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Apply updated_at triggers
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_team_members_updated_at
  BEFORE UPDATE ON public.team_members
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_duty_entries_updated_at
  BEFORE UPDATE ON public.duty_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Audit logging trigger
CREATE OR REPLACE FUNCTION public.log_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  record_id UUID;
  action_type TEXT;
BEGIN
  action_type := TG_OP;
  
  IF TG_OP = 'DELETE' THEN
    record_id := OLD.id;
  ELSE
    record_id := NEW.id;
  END IF;
  
  INSERT INTO public.audit_log_entries (action, table_name, record_id, actor_user_id)
  VALUES (action_type, TG_TABLE_NAME, record_id, auth.uid());
  
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;

-- Apply audit triggers
CREATE TRIGGER audit_team_members
  AFTER INSERT OR UPDATE OR DELETE ON public.team_members
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();

CREATE TRIGGER audit_duty_entries
  AFTER INSERT OR UPDATE OR DELETE ON public.duty_entries
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();

CREATE TRIGGER audit_holidays
  AFTER INSERT OR UPDATE OR DELETE ON public.holidays
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.duty_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log_entries ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT
  USING (public.is_admin());

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can update all profiles"
  ON public.profiles FOR UPDATE
  USING (public.is_admin());

-- User roles policies (admin only)
CREATE POLICY "Admins can view all roles"
  ON public.user_roles FOR SELECT
  USING (public.is_admin());

CREATE POLICY "Users can view own role"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id);

-- Team members policies (approved users or admins)
CREATE POLICY "Approved users can view team members"
  ON public.team_members FOR SELECT
  USING (public.is_admin() OR public.is_approved());

CREATE POLICY "Approved users can insert team members"
  ON public.team_members FOR INSERT
  WITH CHECK (public.is_admin() OR public.is_approved());

CREATE POLICY "Approved users can update team members"
  ON public.team_members FOR UPDATE
  USING (public.is_admin() OR public.is_approved());

CREATE POLICY "Admins can delete team members"
  ON public.team_members FOR DELETE
  USING (public.is_admin());

-- Duty entries policies
CREATE POLICY "Approved users can view duty entries"
  ON public.duty_entries FOR SELECT
  USING (public.is_admin() OR public.is_approved());

CREATE POLICY "Approved users can insert duty entries"
  ON public.duty_entries FOR INSERT
  WITH CHECK (public.is_admin() OR public.is_approved());

CREATE POLICY "Approved users can update duty entries"
  ON public.duty_entries FOR UPDATE
  USING (public.is_admin() OR public.is_approved());

CREATE POLICY "Approved users can delete duty entries"
  ON public.duty_entries FOR DELETE
  USING (public.is_admin() OR public.is_approved());

-- Holidays policies
CREATE POLICY "Approved users can view holidays"
  ON public.holidays FOR SELECT
  USING (public.is_admin() OR public.is_approved());

CREATE POLICY "Admins can insert holidays"
  ON public.holidays FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins can update holidays"
  ON public.holidays FOR UPDATE
  USING (public.is_admin());

CREATE POLICY "Admins can delete holidays"
  ON public.holidays FOR DELETE
  USING (public.is_admin());

-- Import batches policies
CREATE POLICY "Approved users can view import batches"
  ON public.import_batches FOR SELECT
  USING (public.is_admin() OR public.is_approved());

CREATE POLICY "Approved users can insert import batches"
  ON public.import_batches FOR INSERT
  WITH CHECK (public.is_admin() OR public.is_approved());

-- Audit log policies
CREATE POLICY "Admins can view all audit logs"
  ON public.audit_log_entries FOR SELECT
  USING (public.is_admin());

CREATE POLICY "Users can view own audit logs"
  ON public.audit_log_entries FOR SELECT
  USING (actor_user_id = auth.uid());

-- ============================================
-- SEED DATA
-- ============================================

-- Insert some sample team members
INSERT INTO public.team_members (full_name, email, title, active)
VALUES
  ('Ahmed Bennani', 'ahmed.bennani@example.com', 'Médecin Senior', true),
  ('Fatima Zahra El Idrissi', 'fatima.elidrissi@example.com', 'Médecin', true),
  ('Mohammed Alaoui', 'mohammed.alaoui@example.com', 'Interne', true),
  ('Sara Tazi', 'sara.tazi@example.com', 'Médecin', true),
  ('Youssef Berrada', 'youssef.berrada@example.com', 'Résident', true);