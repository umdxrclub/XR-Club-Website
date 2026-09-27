BEGIN;
ALTER TABLE public.suits_team ADD COLUMN workspace_layout text
 CHECK (workspace_layout IN ('scenic','top','dock','right','rail','wide'));

-- A null layout means the member has not finished workspace setup yet.
CREATE FUNCTION public.suits_save_layout(layout text) RETURNS public.suits_team
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result public.suits_team;
BEGIN
 IF auth.uid() IS NULL OR NOT public.suits_is_approved() THEN
  RAISE EXCEPTION 'Team approval is required to save your layout';
 END IF;
 IF layout IS NULL OR layout NOT IN ('scenic','top','dock','right','rail','wide') THEN
  RAISE EXCEPTION 'Choose a valid layout';
 END IF;
 UPDATE public.suits_team SET workspace_layout=layout WHERE user_id=auth.uid() RETURNING * INTO result;
 IF result.user_id IS NULL THEN RAISE EXCEPTION 'Join the team first'; END IF;
 RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.suits_save_layout(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.suits_save_layout(text) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
