ALTER TABLE public.announcement_bar
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_announcement_bar_sort ON public.announcement_bar (sort_order);