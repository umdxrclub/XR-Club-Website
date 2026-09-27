-- Each member's proposal role (one of the six roles from the kickoff deck).
-- Members set their own; the lead can set anyone's.
ALTER TABLE public.suits_team ADD COLUMN proposal_role TEXT;
