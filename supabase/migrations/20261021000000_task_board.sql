-- The Tasks view becomes a board: To Do, Doing, Iteration and Done, with Trello-style cards.
-- A card may carry a label, a checklist, several members, a cover image and a place in its column,
-- and a card may be a milestone rather than a task.
ALTER TABLE public.suits_tasks DROP CONSTRAINT IF EXISTS suits_tasks_status_check;
ALTER TABLE public.suits_tasks ADD CONSTRAINT suits_tasks_status_check CHECK (status IN ('todo', 'doing', 'iteration', 'done'));
ALTER TABLE public.suits_tasks
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'task' CHECK (kind IN ('task', 'milestone')),
  ADD COLUMN IF NOT EXISTS label TEXT CHECK (label IS NULL OR label IN ('Interface', 'AI', 'Navigation', 'Hardware', 'HITL Testing', 'All')),
  ADD COLUMN IF NOT EXISTS checklist JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(checklist) = 'array'),
  ADD COLUMN IF NOT EXISTS members UUID[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS cover_url TEXT,
  ADD COLUMN IF NOT EXISTS position INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS suits_tasks_board_idx ON public.suits_tasks (status, position);
