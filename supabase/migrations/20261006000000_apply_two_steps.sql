-- Short applications retain the original submissions and board review permissions.
-- A null funding_mode identifies legacy rows; only new submissions require the new fields.
ALTER TABLE public.funding_pitches
  ADD COLUMN funding_mode TEXT,
  ADD COLUMN motivation TEXT,
  ADD COLUMN lead_major TEXT,
  ADD COLUMN lead_year TEXT,
  ALTER COLUMN outline DROP NOT NULL,
  ALTER COLUMN zero_dollar_plan DROP NOT NULL,
  ALTER COLUMN timeline DROP NOT NULL,
  ALTER COLUMN deliverable DROP NOT NULL,
  DROP CONSTRAINT funding_pitches_members_shape,
  ADD CONSTRAINT funding_pitches_members_shape CHECK (public.apply_object_list(members, 0, 20));

-- Validate product links, item costs, and their sum in the database as well as in the form.
CREATE FUNCTION public.apply_budget_valid(items JSONB, total NUMERIC, cap NUMERIC)
RETURNS BOOLEAN LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE item JSONB; cost NUMERIC; amount NUMERIC := 0;
BEGIN
  IF items IS NULL OR total IS NULL OR cap IS NULL OR jsonb_typeof(items) <> 'array' THEN RETURN false; END IF;
  IF jsonb_array_length(items) NOT BETWEEN 1 AND 40 THEN RETURN false; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(items) LOOP
    IF jsonb_typeof(item) <> 'object' OR jsonb_typeof(item->'name') IS DISTINCT FROM 'string'
      OR char_length(btrim(item->>'name')) NOT BETWEEN 1 AND 200
      OR jsonb_typeof(item->'cost') IS DISTINCT FROM 'number'
      OR jsonb_typeof(item->'link') IS DISTINCT FROM 'string'
      OR char_length(item->>'link') NOT BETWEEN 1 AND 1000
      OR item->>'link' !~* '^https?://[[:alnum:]]([[:alnum:]-]*[[:alnum:]])?([.][[:alnum:]]([[:alnum:]-]*[[:alnum:]])?)+(:[0-9]{1,5})?([/?#][^[:space:]]*)?$'
      THEN RETURN false; END IF;
    cost := (item->>'cost')::numeric;
    IF cost <= 0 OR cost > cap OR trunc(cost, 2) <> cost THEN RETURN false; END IF;
    amount := amount + cost;
  END LOOP;
  RETURN amount = total AND total > 0 AND total <= cap;
END;
$$;

CREATE FUNCTION public.apply_members_valid(items JSONB, mode TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE item JSONB;
BEGIN
  IF items IS NULL OR jsonb_typeof(items) <> 'array' THEN RETURN false; END IF;
  IF mode = 'solo' THEN RETURN jsonb_array_length(items) = 0; END IF;
  IF mode IS DISTINCT FROM 'team' OR jsonb_array_length(items) NOT BETWEEN 1 AND 20 THEN RETURN false; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(items) LOOP
    IF jsonb_typeof(item) <> 'object' OR jsonb_typeof(item->'name') IS DISTINCT FROM 'string'
      OR char_length(btrim(item->>'name')) NOT BETWEEN 1 AND 200
      OR item->>'name' !~ '[^[:space:]]'
      OR jsonb_typeof(item->'detail') IS DISTINCT FROM 'string'
      OR char_length(item->>'detail') NOT BETWEEN 1 AND 320
      OR item->>'detail' !~* '^[^[:space:]@]+@(terpmail[.])?umd[.]edu$'
      THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
END;
$$;

ALTER TABLE public.funding_pitches ADD CONSTRAINT funding_pitches_short_application CHECK (
  funding_mode IS NULL OR (
    funding_mode IN ('solo', 'team')
    AND motivation IS NOT NULL AND char_length(btrim(motivation)) BETWEEN 1 AND 1200
    AND motivation ~ '[^[:space:]]'
    AND lead_major IS NOT NULL AND char_length(btrim(lead_major)) BETWEEN 1 AND 200
    AND lead_year IS NOT NULL AND lead_year IN ('Freshman', 'Sophomore', 'Junior', 'Senior', 'Graduate', 'Other')
    AND lead_email ~* '^[^[:space:]@]+@(terpmail[.])?umd[.]edu$'
    AND char_length(btrim(project_title)) > 0 AND char_length(btrim(idea)) > 0
    AND char_length(btrim(lead_name)) > 0 AND char_length(btrim(lead_discord)) > 0
    AND public.apply_members_valid(members, funding_mode)
    AND public.apply_budget_valid(budget_items, requested_total, CASE WHEN funding_mode = 'solo' THEN 400 ELSE 1000 END)
  )
);

DROP POLICY "Anyone can submit a funding pitch" ON public.funding_pitches;
CREATE POLICY "Anyone can submit a funding pitch" ON public.funding_pitches
  FOR INSERT TO anon, authenticated WITH CHECK (
    status = 'new' AND reviewer_notes IS NULL AND created_at = now() AND updated_at = now()
    AND funding_mode IS NOT NULL
  );

NOTIFY pgrst, 'reload schema';
