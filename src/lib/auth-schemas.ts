import { z } from "zod";

export const emailSchema = z
  .string()
  .trim()
  .email({ message: "Email inválido" })
  .max(255, { message: "Email muito longo" });

export const passwordSchema = z
  .string()
  .min(8, { message: "A senha deve ter no mínimo 8 caracteres" })
  .max(72, { message: "A senha deve ter no máximo 72 caracteres" })
  .regex(/[A-Z]/, { message: "Inclua ao menos uma letra maiúscula" })
  .regex(/[a-z]/, { message: "Inclua ao menos uma letra minúscula" })
  .regex(/[0-9]/, { message: "Inclua ao menos um número" });

export const displayNameSchema = z
  .string()
  .trim()
  .min(2, { message: "Nome muito curto" })
  .max(50, { message: "Nome muito longo" });

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, { message: "Senha obrigatória" }).max(72),
});

export const affiliateCodeSchema = z
  .string()
  .trim()
  .min(4, { message: "Código de afiliado obrigatório" })
  .max(32, { message: "Código muito longo" });

export const whatsappSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/\D/g, ""))
  .pipe(
    z
      .string()
      .min(10, { message: "WhatsApp inválido (DDD + número)" })
      .max(15, { message: "WhatsApp inválido" })
  );

export const signUpSchema = z.object({
  displayName: displayNameSchema,
  email: emailSchema,
  password: passwordSchema,
  affiliateCode: affiliateCodeSchema,
  whatsapp: whatsappSchema,
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z.object({
  password: passwordSchema,
});
