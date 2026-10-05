-- Tightens what a funding-page submission may contain. The first migration let anyone insert any row; this one keeps
-- the review columns (status, notes, timestamps) out of a submitter's hands, pins the JSON columns to lists of
-- objects, requires a known team, and bounds every text column, so the dashboard always has rows it can draw.

-- True for a JSON list of between min_items and max_items objects (the shape the form sends).
CREATE OR REPLACE FUNCTION public.apply_object_list(items JSONB, min_items INTEGER, max_items INTEGER) RETURNS BOOLEAN
  LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE WHEN jsonb_typeof(items) = 'array'
      THEN jsonb_array_length(items) BETWEEN min_items AND max_items
        AND COALESCE((SELECT bool_and(jsonb_typeof(item) = 'object') FROM jsonb_array_elements(items) AS item), true)
      ELSE false END
  $$;

ALTER TABLE public.funding_pitches
  ADD CONSTRAINT funding_pitches_members_shape CHECK (public.apply_object_list(members, 1, 20)),
  ADD CONSTRAINT funding_pitches_budget_shape CHECK (public.apply_object_list(budget_items, 0, 40)),
  ADD CONSTRAINT funding_pitches_total_range CHECK (requested_total BETWEEN 0 AND 1000000),
  ADD CONSTRAINT funding_pitches_rules_agreed CHECK (agreed_to_rules),
  ADD CONSTRAINT funding_pitches_text_lengths CHECK (
    char_length(project_title) BETWEEN 1 AND 200 AND char_length(idea) BETWEEN 1 AND 2000 AND COALESCE(char_length(topic), 0) <= 200
    AND char_length(lead_name) BETWEEN 1 AND 200 AND char_length(lead_email) BETWEEN 3 AND 320 AND char_length(lead_discord) BETWEEN 1 AND 100
    AND char_length(outline) BETWEEN 1 AND 20000 AND char_length(zero_dollar_plan) BETWEEN 1 AND 20000
    AND char_length(timeline) BETWEEN 1 AND 20000 AND char_length(deliverable) BETWEEN 1 AND 20000
    AND COALESCE(char_length(lab_equipment), 0) <= 1000
  );

ALTER TABLE public.team_applications
  ADD CONSTRAINT team_applications_team_known CHECK (team IN ('immersive-installations', 'niantic-spatial', 'spatial-reality-display')),
  ADD CONSTRAINT team_applications_tools_count CHECK (cardinality(tools) <= 20),
  ADD CONSTRAINT team_applications_text_lengths CHECK (
    char_length(full_name) BETWEEN 1 AND 200 AND char_length(email) BETWEEN 3 AND 320 AND char_length(discord_username) BETWEEN 1 AND 100
    AND char_length(year) BETWEEN 1 AND 40 AND char_length(major) BETWEEN 1 AND 200 AND char_length(pitch) BETWEEN 1 AND 5000
    AND COALESCE(char_length(link), 0) <= 1000 AND char_length(availability) BETWEEN 1 AND 40 AND COALESCE(char_length(anything_else), 0) <= 2000
  );

-- A submission arrives new and unreviewed, stamped by the database: the defaults satisfy these checks, a client that
-- sets status, reviewer_notes or the timestamps itself is refused. (now() is the same instant in a default and a policy.)
DROP POLICY "Anyone can submit a funding pitch" ON public.funding_pitches;
CREATE POLICY "Anyone can submit a funding pitch" ON public.funding_pitches
  FOR INSERT TO anon, authenticated
  WITH CHECK (status = 'new' AND reviewer_notes IS NULL AND created_at = now() AND updated_at = now());

DROP POLICY "Anyone can apply to a team" ON public.team_applications;
CREATE POLICY "Anyone can apply to a team" ON public.team_applications
  FOR INSERT TO anon, authenticated
  WITH CHECK (status = 'new' AND reviewer_notes IS NULL AND created_at = now() AND updated_at = now());
