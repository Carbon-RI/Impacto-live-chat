-- Create tables
create table "public"."profiles" (
    "id" uuid not null primary key references auth.users(id) on delete cascade,
    "display_name" text,
    "updated_at" timestamp with time zone default now()
);

create table "public"."events" (
    "id" uuid not null default gen_random_uuid() primary key,
    "title" text not null,
    "organizer_id" uuid references auth.users(id),
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

create table "public"."event_participants" (
    "id" uuid not null default gen_random_uuid() primary key,
    "event_id" uuid references public.events(id) on delete cascade,
    "user_id" uuid references auth.users(id) on delete cascade
);

create table "public"."messages" (
    "id" uuid not null default gen_random_uuid() primary key,
    "event_id" uuid references public.events(id) on delete cascade,
    "user_id" uuid references auth.users(id),
    "content" text,
    "media_url" text,
    "created_at" timestamp with time zone default now(),
    "is_system" boolean default false
);