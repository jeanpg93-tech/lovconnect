CREATE OR REPLACE FUNCTION public.unaccent_safe(_s text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT translate(_s,
    'áàâãäåÁÀÂÃÄÅéèêëÉÈÊËíìîïÍÌÎÏóòôõöÓÒÔÕÖúùûüÚÙÛÜçÇñÑ',
    'aaaaaaAAAAAAeeeeEEEEiiiiIIIIoooooOOOOOuuuuUUUUcCnN'
  );
$$;

CREATE OR REPLACE FUNCTION public._slugify_simple(_s text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT trim(both '-' from
    regexp_replace(
      lower(public.unaccent_safe(_s)),
      '[^a-z0-9]+', '-', 'g'
    )
  );
$$;