-- Function to open event chat (RPC)
set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.open_event_chat(target_event_id uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
    is_sent BOOLEAN;
    org_id UUID;
BEGIN
    SELECT welcome_sent, organizer_id INTO is_sent, org_id
    FROM events
    WHERE id = target_event_id
    FOR UPDATE;

    IF auth.uid() <> org_id THEN
        RAISE EXCEPTION 'Only the organizer can open the chat.';
    END IF;

    IF is_sent = FALSE THEN
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
$function$;