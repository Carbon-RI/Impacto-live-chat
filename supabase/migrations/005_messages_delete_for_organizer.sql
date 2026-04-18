-- Allow event organizers to delete chat messages (UI exposes delete to organizers only).
-- Without a DELETE policy, RLS denies all deletes; PostgREST often returns success with 0 rows
-- removed, which breaks optimistic UI and lets messages reappear after reload.

create policy "delete_messages_as_event_organizer"
on "public"."messages"
for delete
to authenticated
using (
  exists (
    select 1
    from public.events e
    where e.id = messages.event_id
      and e.organizer_id = auth.uid()
  )
);
