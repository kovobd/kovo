ALTER TABLE public.tags ALTER COLUMN type DROP NOT NULL;
ALTER TABLE public.tags ALTER COLUMN type SET DEFAULT 'feature'::tag_type;