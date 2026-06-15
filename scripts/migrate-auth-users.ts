/**
 * Migra auth.users do projeto antigo para o novo preservando hashes de senha (bcrypt).
 *
 * Uso (Deno):
 *   deno run --allow-net --allow-env scripts/migrate-auth-users.ts
 *
 * Variáveis de ambiente necessárias:
 *   OLD_SUPABASE_URL              ex: https://qoemkofkeleuhjifvauh.supabase.co
 *   OLD_SUPABASE_SERVICE_ROLE_KEY (precisa ser obtido com o suporte do Lovable — não é exposto no Cloud)
 *   NEW_SUPABASE_URL              URL do novo projeto
 *   NEW_SUPABASE_SERVICE_ROLE_KEY service role do novo projeto
 *
 * O que faz:
 *   1. Lista todos os users do projeto antigo via Admin API (paginado).
 *   2. Para cada user, chama POST /auth/v1/admin/users no novo projeto com:
 *      - id, email, phone, email_confirmed_at, phone_confirmed_at
 *      - user_metadata, app_metadata
 *      - password_hash (o hash bcrypt original, preservando a senha do usuário)
 *   3. Loga sucessos e erros (já-existentes são pulados).
 *
 * Importante: sem OLD_SUPABASE_SERVICE_ROLE_KEY não tem como ler password_hash.
 * No Lovable Cloud a service role não é exposta — abra ticket de suporte.
 */

const OLD_URL = Deno.env.get("OLD_SUPABASE_URL")!;
const OLD_KEY = Deno.env.get("OLD_SUPABASE_SERVICE_ROLE_KEY")!;
const NEW_URL = Deno.env.get("NEW_SUPABASE_URL")!;
const NEW_KEY = Deno.env.get("NEW_SUPABASE_SERVICE_ROLE_KEY")!;

if (!OLD_URL || !OLD_KEY || !NEW_URL || !NEW_KEY) {
  console.error("Faltam variáveis de ambiente. Veja o cabeçalho do arquivo.");
  Deno.exit(1);
}

type AdminUser = {
  id: string;
  email?: string | null;
  phone?: string | null;
  email_confirmed_at?: string | null;
  phone_confirmed_at?: string | null;
  user_metadata?: Record<string, unknown>;
  app_metadata?: Record<string, unknown>;
  encrypted_password?: string | null; // bcrypt hash (exposto só com service role)
  created_at?: string;
};

async function listOldUsers(): Promise<AdminUser[]> {
  const all: AdminUser[] = [];
  let page = 1;
  const perPage = 1000;
  while (true) {
    const url = `${OLD_URL}/auth/v1/admin/users?page=${page}&per_page=${perPage}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${OLD_KEY}`,
        apikey: OLD_KEY,
      },
    });
    if (!res.ok) throw new Error(`list users falhou: ${res.status} ${await res.text()}`);
    const body = await res.json();
    const users: AdminUser[] = body.users ?? [];
    all.push(...users);
    if (users.length < perPage) break;
    page++;
  }
  return all;
}

async function createInNew(u: AdminUser): Promise<{ ok: boolean; status: number; error?: string }> {
  const payload: Record<string, unknown> = {
    id: u.id,
    email: u.email ?? undefined,
    phone: u.phone ?? undefined,
    email_confirm: !!u.email_confirmed_at,
    phone_confirm: !!u.phone_confirmed_at,
    user_metadata: u.user_metadata ?? {},
    app_metadata: u.app_metadata ?? {},
  };
  if (u.encrypted_password) {
    // Admin API aceita "password_hash" para preservar a senha (bcrypt).
    payload.password_hash = u.encrypted_password;
  }

  const res = await fetch(`${NEW_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${NEW_KEY}`,
      apikey: NEW_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (res.ok) return { ok: true, status: res.status };
  const text = await res.text();
  return { ok: false, status: res.status, error: text };
}

const users = await listOldUsers();
console.log(`Encontrados ${users.length} usuários no projeto antigo.`);

let ok = 0, skip = 0, fail = 0;
for (const u of users) {
  const r = await createInNew(u);
  if (r.ok) {
    ok++;
    console.log(`✓ ${u.email ?? u.id}`);
  } else if (r.status === 422 || (r.error ?? "").includes("already")) {
    skip++;
    console.log(`↷ já existe: ${u.email ?? u.id}`);
  } else {
    fail++;
    console.error(`✗ ${u.email ?? u.id}: ${r.status} ${r.error}`);
  }
}
console.log(`\nResumo: ok=${ok} skip=${skip} fail=${fail}`);