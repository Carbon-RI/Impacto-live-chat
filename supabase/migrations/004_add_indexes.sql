-- Prevent duplicate registrations for participants
CREATE UNIQUE INDEX event_participants_event_id_user_id_key ON public.event_participants USING btree (event_id, user_id);
alter table "public"."event_participants" add constraint "event_participants_event_id_user_id_key" UNIQUE using index "event_participants_event_id_user_id_key";

-- (Add additional indexes if needed)
CREATE INDEX idx_messages_event_id ON public.messages(event_id);