export interface EventRow {
  id: string;
  organizer_id: string;
  title: string;
  category: string;
  description: string;
  location: string;
  start_at: string;
  end_at: string;
  image_url: string | null;
  is_chat_opened: boolean;
}
