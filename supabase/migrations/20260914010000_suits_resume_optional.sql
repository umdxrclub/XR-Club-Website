-- The resume became optional on the NASA SUITS application.
ALTER TABLE public.suits_applications ALTER COLUMN resume_path DROP NOT NULL;
