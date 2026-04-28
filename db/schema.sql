drop extension if exists "pg_net";


  create table "public"."event_participants" (
    "id" uuid not null default gen_random_uuid(),
    "event_id" uuid,
    "user_id" uuid
      );


alter table "public"."event_participants" enable row level security;


  create table "public"."events" (
    "id" uuid not null default gen_random_uuid(),
    "title" text not null,
    "organizer_id" uuid,
    "is_chat_opened" boolean default false,
    "created_at" timestamp with time zone default now(),
    "category" text,
    "description" text,
    "location" text,
    "start_at" timestamp with time zone,
    "end_at" timestamp with time zone,
    "image_url" text,
    "welcome_sent" boolean default false
      );


alter table "public"."events" enable row level security;


  create table "public"."messages" (
    "id" uuid not null default gen_random_uuid(),
    "event_id" uuid,
    "user_id" uuid,
    "content" text,
    "media_url" text,
    "created_at" timestamp with time zone default now(),
    "is_system" boolean default false
      );


alter table "public"."messages" enable row level security;


  create table "public"."profiles" (
    "id" uuid not null,
    "display_name" text,
    "updated_at" timestamp with time zone default now()
      );


alter table "public"."profiles" enable row level security;

CREATE UNIQUE INDEX event_participants_event_id_user_id_key ON public.event_participants USING btree (event_id, user_id);

CREATE UNIQUE INDEX event_participants_pkey ON public.event_participants USING btree (id);

CREATE UNIQUE INDEX events_pkey ON public.events USING btree (id);

CREATE UNIQUE INDEX messages_pkey ON public.messages USING btree (id);

CREATE UNIQUE INDEX profiles_pkey ON public.profiles USING btree (id);

alter table "public"."event_participants" add constraint "event_participants_pkey" PRIMARY KEY using index "event_participants_pkey";

alter table "public"."events" add constraint "events_pkey" PRIMARY KEY using index "events_pkey";

alter table "public"."messages" add constraint "messages_pkey" PRIMARY KEY using index "messages_pkey";

alter table "public"."profiles" add constraint "profiles_pkey" PRIMARY KEY using index "profiles_pkey";

alter table "public"."event_participants" add constraint "event_participants_event_id_fkey" FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE not valid;

alter table "public"."event_participants" validate constraint "event_participants_event_id_fkey";

alter table "public"."event_participants" add constraint "event_participants_event_id_user_id_key" UNIQUE using index "event_participants_event_id_user_id_key";

alter table "public"."event_participants" add constraint "event_participants_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."event_participants" validate constraint "event_participants_user_id_fkey";

alter table "public"."events" add constraint "events_organizer_id_fkey" FOREIGN KEY (organizer_id) REFERENCES auth.users(id) not valid;

alter table "public"."events" validate constraint "events_organizer_id_fkey";

alter table "public"."messages" add constraint "messages_event_id_fkey" FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE not valid;

alter table "public"."messages" validate constraint "messages_event_id_fkey";

alter table "public"."messages" add constraint "messages_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) not valid;

alter table "public"."messages" validate constraint "messages_user_id_fkey";

alter table "public"."profiles" add constraint "profiles_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."profiles" validate constraint "profiles_id_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.toggle_event_chat(target_event_id uuid, should_open boolean)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
    current_welcome_sent BOOLEAN;
    org_id UUID;
BEGIN
    SELECT welcome_sent, organizer_id
      INTO current_welcome_sent, org_id
    FROM public.events
    WHERE id = target_event_id
    FOR UPDATE;

    IF org_id IS NULL THEN
        RAISE EXCEPTION 'event_not_found';
    END IF;

    IF auth.uid() <> org_id THEN
        RAISE EXCEPTION 'Only the organizer can toggle the chat.';
    END IF;

    IF should_open AND current_welcome_sent = FALSE THEN
        INSERT INTO public.messages (event_id, content, user_id, is_system)
        VALUES (
            target_event_id,
            'Welcome to the event! 🚀' || chr(10) ||
            'The session has officially started.' || chr(10) ||
            'Feel free to share your thoughts here!',
            org_id,
            TRUE
        );
    END IF;

    UPDATE public.events
    SET welcome_sent = CASE WHEN should_open THEN TRUE ELSE welcome_sent END,
        is_chat_opened = should_open
    WHERE id = target_event_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.open_event_chat(target_event_id uuid)
 RETURNS void
 LANGUAGE sql
AS $function$
  SELECT public.toggle_event_chat(target_event_id, TRUE);
$function$
;

CREATE OR REPLACE FUNCTION public.create_chat_message(target_event_id uuid, message_content text, message_media_url text)
 RETURNS uuid
 LANGUAGE plpgsql
AS $function$
DECLARE
    inserted_id UUID;
BEGIN
    INSERT INTO public.messages (event_id, user_id, content, media_url)
    SELECT target_event_id, auth.uid(), message_content, message_media_url
    FROM public.event_participants ep
    WHERE ep.event_id = target_event_id
      AND ep.user_id = auth.uid()
    RETURNING id INTO inserted_id;

    IF inserted_id IS NULL THEN
        RAISE EXCEPTION 'forbidden';
    END IF;

    RETURN inserted_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_event_with_organizer_participation(p_title text, p_category text, p_description text, p_location text, p_start_at timestamp with time zone, p_end_at timestamp with time zone, p_image_url text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
AS $function$
DECLARE
    created_event_id UUID;
    current_user_id UUID;
BEGIN
    current_user_id := auth.uid();
    IF current_user_id IS NULL THEN
        RAISE EXCEPTION 'unauthorized';
    END IF;

    INSERT INTO public.events (
      organizer_id,
      title,
      category,
      description,
      location,
      start_at,
      end_at,
      image_url,
      is_chat_opened
    )
    VALUES (
      current_user_id,
      p_title,
      p_category,
      p_description,
      p_location,
      p_start_at,
      p_end_at,
      p_image_url,
      FALSE
    )
    RETURNING id INTO created_event_id;

    INSERT INTO public.event_participants (event_id, user_id)
    VALUES (created_event_id, current_user_id);

    RETURN created_event_id;
END;
$function$
;

grant delete on table "public"."event_participants" to "anon";

grant insert on table "public"."event_participants" to "anon";

grant references on table "public"."event_participants" to "anon";

grant select on table "public"."event_participants" to "anon";

grant trigger on table "public"."event_participants" to "anon";

grant truncate on table "public"."event_participants" to "anon";

grant update on table "public"."event_participants" to "anon";

grant delete on table "public"."event_participants" to "authenticated";

grant insert on table "public"."event_participants" to "authenticated";

grant references on table "public"."event_participants" to "authenticated";

grant select on table "public"."event_participants" to "authenticated";

grant trigger on table "public"."event_participants" to "authenticated";

grant truncate on table "public"."event_participants" to "authenticated";

grant update on table "public"."event_participants" to "authenticated";

grant delete on table "public"."event_participants" to "service_role";

grant insert on table "public"."event_participants" to "service_role";

grant references on table "public"."event_participants" to "service_role";

grant select on table "public"."event_participants" to "service_role";

grant trigger on table "public"."event_participants" to "service_role";

grant truncate on table "public"."event_participants" to "service_role";

grant update on table "public"."event_participants" to "service_role";

grant delete on table "public"."events" to "anon";

grant insert on table "public"."events" to "anon";

grant references on table "public"."events" to "anon";

grant select on table "public"."events" to "anon";

grant trigger on table "public"."events" to "anon";

grant truncate on table "public"."events" to "anon";

grant update on table "public"."events" to "anon";

grant delete on table "public"."events" to "authenticated";

grant insert on table "public"."events" to "authenticated";

grant references on table "public"."events" to "authenticated";

grant select on table "public"."events" to "authenticated";

grant trigger on table "public"."events" to "authenticated";

grant truncate on table "public"."events" to "authenticated";

grant update on table "public"."events" to "authenticated";

grant delete on table "public"."events" to "service_role";

grant insert on table "public"."events" to "service_role";

grant references on table "public"."events" to "service_role";

grant select on table "public"."events" to "service_role";

grant trigger on table "public"."events" to "service_role";

grant truncate on table "public"."events" to "service_role";

grant update on table "public"."events" to "service_role";

grant delete on table "public"."messages" to "anon";

grant insert on table "public"."messages" to "anon";

grant references on table "public"."messages" to "anon";

grant select on table "public"."messages" to "anon";

grant trigger on table "public"."messages" to "anon";

grant truncate on table "public"."messages" to "anon";

grant update on table "public"."messages" to "anon";

grant delete on table "public"."messages" to "authenticated";

grant insert on table "public"."messages" to "authenticated";

grant references on table "public"."messages" to "authenticated";

grant select on table "public"."messages" to "authenticated";

grant trigger on table "public"."messages" to "authenticated";

grant truncate on table "public"."messages" to "authenticated";

grant update on table "public"."messages" to "authenticated";

grant delete on table "public"."messages" to "service_role";

grant insert on table "public"."messages" to "service_role";

grant references on table "public"."messages" to "service_role";

grant select on table "public"."messages" to "service_role";

grant trigger on table "public"."messages" to "service_role";

grant truncate on table "public"."messages" to "service_role";

grant update on table "public"."messages" to "service_role";

grant delete on table "public"."profiles" to "anon";

grant insert on table "public"."profiles" to "anon";

grant references on table "public"."profiles" to "anon";

grant select on table "public"."profiles" to "anon";

grant trigger on table "public"."profiles" to "anon";

grant truncate on table "public"."profiles" to "anon";

grant update on table "public"."profiles" to "anon";

grant delete on table "public"."profiles" to "authenticated";

grant insert on table "public"."profiles" to "authenticated";

grant references on table "public"."profiles" to "authenticated";

grant select on table "public"."profiles" to "authenticated";

grant trigger on table "public"."profiles" to "authenticated";

grant truncate on table "public"."profiles" to "authenticated";

grant update on table "public"."profiles" to "authenticated";

grant delete on table "public"."profiles" to "service_role";

grant insert on table "public"."profiles" to "service_role";

grant references on table "public"."profiles" to "service_role";

grant select on table "public"."profiles" to "service_role";

grant trigger on table "public"."profiles" to "service_role";

grant truncate on table "public"."profiles" to "service_role";

grant update on table "public"."profiles" to "service_role";


  create policy "participants_manage_self"
  on "public"."event_participants"
  as permissive
  for all
  to authenticated
using ((auth.uid() = user_id))
with check ((auth.uid() = user_id));



  create policy "participants_select_all"
  on "public"."event_participants"
  as permissive
  for select
  to public
using (true);



  create policy "events_insert_auth"
  on "public"."events"
  as permissive
  for insert
  to authenticated
with check ((auth.uid() = organizer_id));



  create policy "events_select_all"
  on "public"."events"
  as permissive
  for select
  to public
using (true);



  create policy "events_update_organizer"
  on "public"."events"
  as permissive
  for update
  to authenticated
using ((auth.uid() = organizer_id))
with check ((auth.uid() = organizer_id));



  create policy "allow_insert"
  on "public"."messages"
  as permissive
  for insert
  to authenticated
with check ((auth.uid() = user_id));



  create policy "insert_own_message"
  on "public"."messages"
  as permissive
  for insert
  to authenticated
with check ((auth.uid() = user_id));



  create policy "select_event_messages"
  on "public"."messages"
  as permissive
  for select
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.event_participants ep
  WHERE ((ep.event_id = messages.event_id) AND (ep.user_id = auth.uid())))));



  create policy "profiles_manage_self"
  on "public"."profiles"
  as permissive
  for all
  to public
using ((auth.uid() = id))
with check ((auth.uid() = id));



  create policy "profiles_select_all"
  on "public"."profiles"
  as permissive
  for select
  to public
using (true);



