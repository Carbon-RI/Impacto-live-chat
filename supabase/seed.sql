INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, recovery_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
VALUES
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'test1@example.com', crypt('password123', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'test2@example.com', crypt('password123', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');

-- 1. Create test profile
INSERT INTO public.profiles (id, display_name)
VALUES 
  ('00000000-0000-0000-0000-000000000001', 'Test Organizer'),
  ('00000000-0000-0000-0000-000000000002', 'Test Participant');

-- 2. Create test event
INSERT INTO public.events (id, title, organizer_id, is_chat_opened, category, description)
VALUES 
  ('11111111-1111-1111-1111-111111111111', 'Impacto Launch Party', '00000000-0000-0000-0000-000000000001', true, 'Party', 'Testing local development environment');

-- 3. Link event participants
INSERT INTO public.event_participants (event_id, user_id)
VALUES 
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000001'),
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000002');

-- 4. Sample messages
INSERT INTO public.messages (event_id, user_id, content, is_system)
VALUES 
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000001', 'Hello! Local DB is working!', false);