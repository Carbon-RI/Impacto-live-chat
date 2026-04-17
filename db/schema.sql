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

CREATE OR REPLACE FUNCTION public.open_event_chat(target_event_id uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
    is_sent BOOLEAN;
    org_id UUID;
BEGIN
    -- 行ロック
    SELECT welcome_sent, organizer_id INTO is_sent, org_id
    FROM events
    WHERE id = target_event_id
    FOR UPDATE;

    -- 主催者チェック
    IF auth.uid() <> org_id THEN
        RAISE EXCEPTION 'Only the organizer can open the chat.';
    END IF;

    IF is_sent = FALSE THEN
        -- ★修正ポイント：3つのメッセージを1つに統合（改行コード含む）
        INSERT INTO messages (event_id, content, user_id, is_system) 
        VALUES 
            (target_event_id, 
             'Welcome to the event! 🚀' || chr(10) || 
             'The session has officially started.' || chr(10) || 
             'Feel free to share your thoughts here!', 
             org_id, TRUE);

        UPDATE events 
        SET welcome_sent = TRUE, is_chat_opened = TRUE 
        WHERE id = target_event_id;
    ELSE
        UPDATE events 
        SET is_chat_opened = TRUE 
        WHERE id = target_event_id;
    END IF;
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



