import { z } from 'zod';

// Schemas are factories taking a translator scoped to the `validation.auth`
// messages namespace (`useTranslations('validation.auth')` client-side,
// `getTranslations({locale, namespace: 'validation.auth'})` in Server
// Actions) so field-level error messages are localized (I18N-01) rather than
// hardcoded Spanish strings baked into the schema at module scope.
type Translator = (key: string) => string;

export function signupSchema(t: Translator) {
  return z.object({
    email: z.string().email(t('invalidEmail')),
    password: z.string().min(8, t('passwordMin')),
  });
}
export type SignupInput = z.infer<ReturnType<typeof signupSchema>>;

export function loginSchema(t: Translator) {
  return z.object({
    email: z.string().email(t('invalidEmail')),
    password: z.string().min(1, t('passwordRequired')),
  });
}
export type LoginInput = z.infer<ReturnType<typeof loginSchema>>;

export function forgotPasswordSchema(t: Translator) {
  return z.object({
    email: z.string().email(t('invalidEmail')),
  });
}
export type ForgotPasswordInput = z.infer<ReturnType<typeof forgotPasswordSchema>>;

export function resetPasswordSchema(t: Translator) {
  return z
    .object({
      password: z.string().min(8, t('passwordMin')),
      confirmPassword: z.string(),
    })
    .refine((d) => d.password === d.confirmPassword, {
      message: t('passwordMismatch'),
      path: ['confirmPassword'],
    });
}
export type ResetPasswordInput = z.infer<ReturnType<typeof resetPasswordSchema>>;
