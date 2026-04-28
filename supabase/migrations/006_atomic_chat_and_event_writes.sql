-- Unify chat open/close under one locked RPC.
create or replace function public.toggle_event_chat(target_event_id uuid, should_open boolean)
returns void
language plpgsql
as $function$
declare
  current_welcome_sent boolean;
  org_id uuid;
begin
  select welcome_sent, organizer_id
    into current_welcome_sent, org_id
  from public.events
  where id = target_event_id
  for update;

  if org_id is null then
    raise exception 'event_not_found';
  end if;

  if auth.uid() <> org_id then
    raise exception 'Only the organizer can toggle the chat.';
  end if;

  if should_open and current_welcome_sent = false then
    insert into public.messages (event_id, content, user_id, is_system)
    values (
      target_event_id,
      'Welcome to the event! 🚀' || chr(10) ||
      'The session has officially started.' || chr(10) ||
      'Feel free to share your thoughts here!',
      org_id,
      true
    );
  end if;

  update public.events
    set welcome_sent = case when should_open then true else welcome_sent end,
        is_chat_opened = should_open
  where id = target_event_id;
end;
$function$;

-- Backward compatibility for existing callers.
create or replace function public.open_event_chat(target_event_id uuid)
returns void
language sql
as $function$
  select public.toggle_event_chat(target_event_id, true);
$function$;

-- Atomic message creation: membership check + insert in one DB operation.
create or replace function public.create_chat_message(
  target_event_id uuid,
  message_content text,
  message_media_url text
)
returns uuid
language plpgsql
as $function$
declare
  inserted_id uuid;
begin
  insert into public.messages (event_id, user_id, content, media_url)
  select target_event_id, auth.uid(), message_content, message_media_url
  from public.event_participants ep
  where ep.event_id = target_event_id
    and ep.user_id = auth.uid()
  returning id into inserted_id;

  if inserted_id is null then
    raise exception 'forbidden';
  end if;

  return inserted_id;
end;
$function$;

-- Atomic event creation: event row + organizer participation in one transaction.
create or replace function public.create_event_with_organizer_participation(
  p_title text,
  p_category text,
  p_description text,
  p_location text,
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_image_url text default null
)
returns uuid
language plpgsql
as $function$
declare
  created_event_id uuid;
  current_user_id uuid;
begin
  current_user_id := auth.uid();
  if current_user_id is null then
    raise exception 'unauthorized';
  end if;

  insert into public.events (
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
  values (
    current_user_id,
    p_title,
    p_category,
    p_description,
    p_location,
    p_start_at,
    p_end_at,
    p_image_url,
    false
  )
  returning id into created_event_id;

  insert into public.event_participants (event_id, user_id)
  values (created_event_id, current_user_id);

  return created_event_id;
end;
$function$;
