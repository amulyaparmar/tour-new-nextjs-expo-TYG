-- Rubric mutations are authorized by server API routes using the authenticated
-- workspace email. Keep public read compatibility, but prevent PostgREST clients
-- from bypassing that authorization with the anon or authenticated roles.
revoke insert, update, delete, truncate, references, trigger
on table public.rubrics
from anon, authenticated;
