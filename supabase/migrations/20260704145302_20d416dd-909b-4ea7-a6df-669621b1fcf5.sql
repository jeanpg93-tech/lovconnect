REVOKE ALL ON FUNCTION public.manager_list_claude_manual_orders(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.manager_list_claude_manual_orders(integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.manager_list_claude_manual_orders(integer) TO authenticated;