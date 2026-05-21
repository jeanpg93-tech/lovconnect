import { supabase } from "@/integrations/supabase/client";

type InvokeOptions = {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  headers?: Record<string, string>;
};

export const getValidAccessToken = async () => {
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  const token = session?.access_token;

  if (!token) return null;
  if (session?.expires_at && session.expires_at * 1000 <= Date.now() + 15_000) return null;

  const { data: userData, error } = await supabase.auth.getUser(token);
  if (error || !userData.user) return null;

  return token;
};

export const invokeAuthenticatedFunction = async <T = any>(
  functionName: string,
  options: InvokeOptions = {},
): Promise<{ data: T | null; error: any; skipped: boolean }> => {
  const token = await getValidAccessToken();
  if (!token) return { data: null, error: null, skipped: true };

  try {
    const { data, error } = await supabase.functions.invoke<T>(functionName, {
      method: options.method,
      body: options.body,
      headers: {
        ...(options.headers ?? {}),
        Authorization: `Bearer ${token}`,
      },
    });

    // When the edge function returns a non-2xx, supabase-js puts a Response
    // object on error.context. Extract the JSON body so callers can show
    // the real server error instead of "non-2xx status code".
    if (error && (error as any)?.context instanceof Response) {
      try {
        const ctx = (error as any).context as Response;
        const body = await ctx.clone().text();
        let parsed: any = null;
        try { parsed = JSON.parse(body); } catch { parsed = { error: body }; }
        return { data: (parsed ?? null) as T | null, error, skipped: false };
      } catch {
        // ignore and fall through
      }
    }

    return { data: data ?? null, error, skipped: false };
  } catch (error) {
    return { data: null, error, skipped: false };
  }
};