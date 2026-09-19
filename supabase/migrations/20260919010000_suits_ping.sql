-- Who the Discord bot pings for a task or meeting. Entries look like
-- everyone, owner, none, role:<proposal role>, user:<user id>,
-- duser:<discord user id>, drole:<discord role id>.
ALTER TABLE public.suits_tasks ADD COLUMN IF NOT EXISTS ping TEXT[];
ALTER TABLE public.suits_meetings ADD COLUMN IF NOT EXISTS ping TEXT[];
