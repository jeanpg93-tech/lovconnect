import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/painel/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Loader2, Mail, Phone, KeyRound, Save, AlertTriangle,
  User, Camera, Trash2, LogOut, ShieldCheck, Copy, Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { useOnboardingTour } from "@/hooks/useOnboardingTour";
import { useRole } from "@/hooks/useRole";

const emailSchema = z.string().trim().email({ message: "E-mail inválido" }).max(255);
const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[0-9\s().-]{8,20}$/, { message: "Telefone inválido (use DDI/DDD)" })
  .transform((s) => s.replace(/[^\d+]/g, ""));
const passwordSchema = z.string().min(8, { message: "Mínimo 8 caracteres" }).max(72);
const nameSchema = z.string().trim().min(2, { message: "Mínimo 2 caracteres" }).max(60, { message: "Máximo 60 caracteres" });

export default function AjustesConta() {
  const { user, signOut } = useAuth() as any;
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const { primaryRole } = useRole();
  const tour = useOnboardingTour();

  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [savingEmail, setSavingEmail] = useState(false);
  const [savingPhone, setSavingPhone] = useState(false);

  const [pwd, setPwd] = useState("");
  const [pwdConfirm, setPwdConfirm] = useState("");
  const [savingPwd, setSavingPwd] = useState(false);

  const [signingOutAll, setSigningOutAll] = useState(false);

  useEffect(() => {
    if (!user) return;
    setEmail(user.email ?? "");
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("display_name, avatar_url, phone")
        .eq("id", user.id)
        .maybeSingle();
      if (data) {
        setDisplayName(data.display_name ?? "");
        setAvatarUrl(data.avatar_url ?? null);
        setPhone(data.phone ?? "");
      }
    })();
  }, [user]);

  const initial = (displayName?.trim()?.[0] || email?.[0] || "U").toUpperCase();

  const updateProfile = async () => {
    if (!user) return;
    const parsed = nameSchema.safeParse(displayName);
    if (!parsed.success) return toast.error(parsed.error.errors[0].message);
    setSavingProfile(true);
    const { error } = await supabase.from("profiles").update({ display_name: parsed.data }).eq("id", user.id);
    setSavingProfile(false);
    if (error) return toast.error(error.message);
    toast.success("Perfil atualizado.");
  };

  const onPickAvatar = () => fileRef.current?.click();

  const handleAvatarFile = async (file: File) => {
    if (!user) return;
    if (!file.type.startsWith("image/")) return toast.error("Envie uma imagem.");
    if (file.size > 3 * 1024 * 1024) return toast.error("Imagem deve ter no máximo 3MB.");
    setUploadingAvatar(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const path = `${user.id}/avatar-${Date.now()}.${ext}`;
      const up = await supabase.storage.from("avatars").upload(path, file, { upsert: true, cacheControl: "3600" });
      if (up.error) throw up.error;
      const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
      const url = pub.publicUrl;
      const { error } = await supabase.from("profiles").update({ avatar_url: url }).eq("id", user.id);
      if (error) throw error;
      setAvatarUrl(url);
      toast.success("Foto de perfil atualizada.");
    } catch (e: any) {
      toast.error(e.message ?? "Falha ao enviar foto.");
    } finally {
      setUploadingAvatar(false);
    }
  };

  const removeAvatar = async () => {
    if (!user) return;
    setUploadingAvatar(true);
    const { error } = await supabase.from("profiles").update({ avatar_url: null }).eq("id", user.id);
    setUploadingAvatar(false);
    if (error) return toast.error(error.message);
    setAvatarUrl(null);
    toast.success("Foto removida.");
  };

  const updateEmail = async () => {
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) return toast.error(parsed.error.errors[0].message);
    if (parsed.data === user?.email) return toast.info("E-mail já está em uso");
    setSavingEmail(true);
    const { error } = await supabase.auth.updateUser({ email: parsed.data });
    setSavingEmail(false);
    if (error) return toast.error(error.message);
    toast.success("Enviamos um link de confirmação para o novo e-mail.");
  };

  const updatePhone = async () => {
    const parsed = phoneSchema.safeParse(phone);
    if (!parsed.success) return toast.error(parsed.error.errors[0].message);
    setSavingPhone(true);
    const { error } = await supabase
      .from("profiles")
      .update({ phone: parsed.data })
      .eq("id", user!.id);
    setSavingPhone(false);
    if (error) return toast.error(error.message);
    toast.success("Telefone atualizado.");
  };

  const updatePassword = async () => {
    const parsed = passwordSchema.safeParse(pwd);
    if (!parsed.success) return toast.error(parsed.error.errors[0].message);
    if (pwd !== pwdConfirm) return toast.error("As senhas não conferem");
    setSavingPwd(true);
    const { error } = await supabase.auth.updateUser({ password: parsed.data });
    setSavingPwd(false);
    if (error) return toast.error(error.message);
    setPwd(""); setPwdConfirm("");
    toast.success("Senha atualizada com sucesso.");
  };

  const signOutAll = async () => {
    setSigningOutAll(true);
    const { error } = await supabase.auth.signOut({ scope: "global" });
    setSigningOutAll(false);
    if (error) return toast.error(error.message);
    toast.success("Você saiu de todos os dispositivos.");
    navigate("/auth", { replace: true });
  };

  const copyId = () => {
    if (!user?.id) return;
    navigator.clipboard.writeText(user.id);
    toast.success("ID copiado");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ajustes da conta"
        description="Atualize seu perfil, dados de acesso e preferências de segurança."
      />

      {/* PERFIL */}
      <section className="rounded-xl border border-border bg-card/60 p-6">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
            <User className="h-4 w-4" />
          </div>
          <div>
            <h3 className="font-display text-base font-semibold">Perfil</h3>
            <p className="text-xs text-muted-foreground">Nome e foto que aparecem no menu lateral.</p>
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-start">
          <div className="flex flex-col items-center gap-2">
            <div className="relative h-20 w-20 overflow-hidden rounded-full border border-primary/30 bg-primary/15 text-primary">
              {avatarUrl ? (
                <img src={avatarUrl} alt="Foto de perfil" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center font-display text-2xl font-bold">
                  {initial}
                </div>
              )}
              <button
                type="button"
                onClick={onPickAvatar}
                disabled={uploadingAvatar}
                className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-black/60 py-1 text-[10px] text-white transition hover:bg-black/80"
              >
                {uploadingAvatar ? <Loader2 className="h-3 w-3 animate-spin" /> : <Camera className="h-3 w-3" />}
                Trocar
              </button>
            </div>
            {avatarUrl && (
              <button
                type="button"
                onClick={removeAvatar}
                disabled={uploadingAvatar}
                className="text-[11px] text-muted-foreground hover:text-destructive transition flex items-center gap-1"
              >
                <Trash2 className="h-3 w-3" /> Remover
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleAvatarFile(f);
                if (fileRef.current) fileRef.current.value = "";
              }}
            />
          </div>

          <div className="flex-1 space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="display_name">Nome de exibição</Label>
              <Input
                id="display_name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Seu nome"
                maxLength={60}
              />
              <p className="text-[11px] text-muted-foreground">
                {displayName.length}/60 caracteres
              </p>
            </div>
            <div className="flex justify-end">
              <Button onClick={updateProfile} disabled={savingProfile || !displayName.trim()}>
                {savingProfile ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
                Salvar perfil
              </Button>
            </div>
          </div>
        </div>
      </section>

      <div className="flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm">
        <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" />
        <div className="space-y-1">
          <div className="font-medium text-destructive">Zona de risco</div>
          <p className="text-muted-foreground">
            As alterações abaixo afetam o acesso à sua conta. Mudanças de e-mail
            exigem confirmação no novo endereço antes de entrarem em vigor.
          </p>
        </div>
      </div>

      {/* E-MAIL */}
      <section className="rounded-xl border border-border bg-card/60 p-6">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Mail className="h-4 w-4" />
          </div>
          <div>
            <h3 className="font-display text-base font-semibold">E-mail</h3>
            <p className="text-xs text-muted-foreground">
              Você receberá um link de confirmação no novo endereço.
            </p>
          </div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="email">Endereço de e-mail</Label>
            <Input id="email" type="email" autoComplete="email" value={email}
              onChange={(e) => setEmail(e.target.value)} placeholder="voce@exemplo.com" maxLength={255} />
          </div>
          <Button onClick={updateEmail} disabled={savingEmail || !email.trim()}>
            {savingEmail ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
            Atualizar e-mail
          </Button>
        </div>
      </section>

      {/* TELEFONE */}
      <section className="rounded-xl border border-border bg-card/60 p-6">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Phone className="h-4 w-4" />
          </div>
          <div>
            <h3 className="font-display text-base font-semibold">Telefone</h3>
            <p className="text-xs text-muted-foreground">
              Use o formato internacional, ex: +55 11 99999-9999.
            </p>
          </div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="phone">Número de telefone</Label>
            <Input id="phone" type="tel" autoComplete="tel" value={phone}
              onChange={(e) => setPhone(e.target.value)} placeholder="+55 11 99999-9999" maxLength={20} />
          </div>
          <Button onClick={updatePhone} disabled={savingPhone || !phone.trim()}>
            {savingPhone ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
            Atualizar telefone
          </Button>
        </div>
      </section>

      {/* SENHA */}
      <section className="rounded-xl border border-border bg-card/60 p-6">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
            <KeyRound className="h-4 w-4" />
          </div>
          <div>
            <h3 className="font-display text-base font-semibold">Senha</h3>
            <p className="text-xs text-muted-foreground">
              Defina uma nova senha com pelo menos 8 caracteres.
            </p>
          </div>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="pwd">Nova senha</Label>
            <Input id="pwd" type="password" autoComplete="new-password" value={pwd}
              onChange={(e) => setPwd(e.target.value)} placeholder="••••••••" maxLength={72} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pwd2">Confirmar nova senha</Label>
            <Input id="pwd2" type="password" autoComplete="new-password" value={pwdConfirm}
              onChange={(e) => setPwdConfirm(e.target.value)} placeholder="••••••••" maxLength={72} />
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <Button onClick={updatePassword} disabled={savingPwd || !pwd || !pwdConfirm}>
            {savingPwd ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
            Atualizar senha
          </Button>
        </div>
      </section>

      {/* SESSÃO */}
      <section className="rounded-xl border border-border bg-card/60 p-6">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
            <ShieldCheck className="h-4 w-4" />
          </div>
          <div>
            <h3 className="font-display text-base font-semibold">Sessão e segurança</h3>
            <p className="text-xs text-muted-foreground">
              Encerre sessões ativas em outros dispositivos se desconfiar de acesso indevido.
            </p>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button variant="outline" onClick={signOutAll} disabled={signingOutAll}>
            {signingOutAll ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <LogOut className="mr-1.5 h-4 w-4" />}
            Sair de todos os dispositivos
          </Button>
        </div>
      </section>

      {/* INFO DA CONTA */}
      <section className="rounded-xl border border-border bg-card/40 p-6">
        <h3 className="font-display text-base font-semibold">Informações da conta</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 text-sm">
          <div>
            <div className="text-xs text-muted-foreground">ID da conta</div>
            <button onClick={copyId} className="mt-0.5 inline-flex items-center gap-1.5 font-mono text-xs hover:text-primary transition">
              {user?.id?.slice(0, 8)}…{user?.id?.slice(-4)}
              <Copy className="h-3 w-3" />
            </button>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">E-mail confirmado</div>
            <div className="mt-0.5">{user?.email_confirmed_at ? "Sim" : "Não"}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Conta criada em</div>
            <div className="mt-0.5">
              {user?.created_at ? new Date(user.created_at).toLocaleString("pt-BR") : "—"}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Último login</div>
            <div className="mt-0.5">
              {user?.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString("pt-BR") : "—"}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
