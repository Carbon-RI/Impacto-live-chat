-- Enable RLS
alter table "public"."profiles" enable row level security;
alter table "public"."events" enable row level security;
alter table "public"."event_participants" enable row level security;
alter table "public"."messages" enable row level security;

-- Set policies
create policy "profiles_manage_self" on "public"."profiles" for all using (auth.uid() = id);
create policy "profiles_select_all" on "public"."profiles" for select using (true);

create policy "events_insert_auth" on "public"."events" for insert to authenticated with check (auth.uid() = organizer_id);
create policy "events_select_all" on "public"."events" for select using (true);

create policy "participants_select_all" on "public"."event_participants" for select using (true);
create policy "participants_manage_self" on "public"."event_participants" for all using (auth.uid() = user_id);

create policy "select_event_messages" on "public"."messages" for select to authenticated 
using (exists (select 1 from public.event_participants ep where ep.event_id = messages.event_id and ep.user_id = auth.uid()));

create policy "insert_own_message" on "public"."messages" for insert to authenticated with check (auth.uid() = user_id);