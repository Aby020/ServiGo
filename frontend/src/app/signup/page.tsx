"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AlertTriangle, Mail, ShieldCheck, User as UserIcon, Wrench } from "lucide-react";

import { MotionFadeIn } from "@/components/motion";
import { Container } from "@/components/ui/Container";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { registerCustomer, type RegisterPayload } from "@/lib/api";
import { loginHref, resolveRedirect, useAuthMutation } from "@/lib/session";

/**
 * Client-side mirror of the server's registration rules. Both sides enforce
 * them — Zod here exists to give instant, inline feedback, not to be the only
 * thing standing between a bad request and the database.
 */
const schema = z
  .object({
    username: z
      .string()
      .min(3, "Username must be at least 3 characters")
      .max(30, "Username must be 30 characters or fewer")
      .regex(/^[a-zA-Z0-9_]+$/, "Letters, numbers, and underscores only"),
    email: z.string().min(1, "Email is required").email("Enter a valid email address"),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .regex(/[A-Za-z]/, "Password must contain at least one letter")
      .regex(/[0-9]/, "Password must contain at least one number"),
    confirmPassword: z.string().min(1, "Please confirm your password"),
    first_name: z.string().max(150, "First name is too long").optional(),
    last_name: z.string().max(150, "Last name is too long").optional(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type FormValues = z.infer<typeof schema>;

/**
 * `useSearchParams` opts a client component out of static prerendering, so
 * Next.js requires a `<Suspense>` boundary above it or the build fails with
 * "missing suspense boundary with useSearchParams". The wrapper exists for
 * exactly that reason — the form itself is unchanged.
 */
export default function SignupPage() {
  return (
    <Suspense fallback={<SignupPageFallback />}>
      <SignupForm />
    </Suspense>
  );
}

/**
 * Matches the form's own outer box so the transition from fallback to form
 * is a swap of contents, not a jump in page height.
 */
function SignupPageFallback() {
  return (
    <div className="flex min-h-[calc(100dvh-var(--header-h))] items-center justify-center">
      <Container className="py-14 sm:py-20">
        <div
          role="status"
          aria-label="Loading sign up"
          className="mx-auto h-[38rem] w-full max-w-md animate-pulse rounded-lg bg-surface-3"
        />
      </Container>
    </div>
  );
}

function SignupForm() {
  const [serverError, setServerError] = useState<string | null>(null);

  /**
   * Written by `signupHref`/`loginHref` when a guest hits a gated action.
   * Validated rather than trusted — it is a user-supplied query param, and
   * an unvalidated value would make this page an open redirect. Validated
   * again inside `useAuthMutation` before it reaches `router.push`.
   */
  const searchParams = useSearchParams();
  const redirect = resolveRedirect(searchParams.get("redirect"));

  const auth = useAuthMutation<RegisterPayload>(registerCustomer, redirect);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: "onBlur",     // validate a field once the user leaves it
    defaultValues: {
      username: "",
      email: "",
      password: "",
      confirmPassword: "",
      first_name: "",
      last_name: "",
    },
  });

  async function onSubmit(values: FormValues) {
    setServerError(null);
    try {
      await auth.mutateAsync({
        username: values.username,
        email: values.email,
        password: values.password,
        first_name: values.first_name,
        last_name: values.last_name,
      });
      // On success the mutation's onSuccess has already persisted the tokens,
      // seeded the `["auth","me"]` cache and pushed the dashboard route.
    } catch (err) {
      setServerError(
        err instanceof Error
          ? err.message
          : "Registration failed. Please try again.",
      );
    }
  }

  return (
    <div className="flex min-h-[calc(100dvh-var(--header-h))] items-center justify-center">
      <Container className="py-14 sm:py-20">
        <MotionFadeIn className="mx-auto w-full max-w-md">
          <Card elevation="raised" className="p-8">
            {/* Brand mark */}
            <div className="mb-7 text-center">
              <span
                className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-primary text-on-primary shadow-sm"
                aria-hidden="true"
              >
                <Wrench size={22} />
              </span>
              <h1 className="font-display text-2xl font-bold tracking-tight text-ink">
                Create your account
              </h1>
              <p className="mt-1 text-sm text-text-soft">
                Book technicians and reserve EV slots in minutes
              </p>
            </div>

            {/* Non-field / server error */}
            {serverError && (
              <div
                className="mb-5 flex items-start gap-2.5 rounded-md border border-danger/30 bg-danger-soft px-4 py-3 text-sm font-medium text-danger"
                role="alert"
              >
                <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
                <span>{serverError}</span>
              </div>
            )}

            <form className="flex flex-col gap-5" onSubmit={handleSubmit(onSubmit)} noValidate>
              <Input
                id="username"
                type="text"
                label="Username"
                placeholder="johndoe"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                aria-invalid={!!errors.username}
                error={errors.username?.message}
                hint="Letters, numbers and underscores. You can sign in with this or your email."
                leadingIcon={<UserIcon size={15} aria-hidden="true" />}
                {...register("username")}
              />

              <Input
                id="email"
                type="email"
                label="Email"
                placeholder="you@example.com"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                aria-invalid={!!errors.email}
                error={errors.email?.message}
                leadingIcon={<Mail size={15} aria-hidden="true" />}
                {...register("email")}
              />

              <div className="grid grid-cols-2 gap-3">
                <Input
                  id="first_name"
                  type="text"
                  label="First name"
                  placeholder="John"
                  autoComplete="given-name"
                  aria-invalid={!!errors.first_name}
                  error={errors.first_name?.message}
                  {...register("first_name")}
                />
                <Input
                  id="last_name"
                  type="text"
                  label="Last name"
                  placeholder="Doe"
                  autoComplete="family-name"
                  aria-invalid={!!errors.last_name}
                  error={errors.last_name?.message}
                  {...register("last_name")}
                />
              </div>

              <Input
                id="password"
                type="password"
                label="Password"
                placeholder="••••••••"
                autoComplete="new-password"
                aria-invalid={!!errors.password}
                error={errors.password?.message}
                hint="At least 8 characters, with a letter and a number."
                leadingIcon={<ShieldCheck size={15} aria-hidden="true" />}
                {...register("password")}
              />

              <Input
                id="confirmPassword"
                type="password"
                label="Confirm password"
                placeholder="••••••••"
                autoComplete="new-password"
                aria-invalid={!!errors.confirmPassword}
                error={errors.confirmPassword?.message}
                leadingIcon={<ShieldCheck size={15} aria-hidden="true" />}
                {...register("confirmPassword")}
              />

              <Button
                type="submit"
                variant="accent"
                size="lg"
                fullWidth
                loading={isSubmitting}
                className="mt-1"
              >
                {isSubmitting ? "Creating account…" : "Create account"}
              </Button>
            </form>

            <p className="mt-6 text-center text-sm text-text-soft">
              Already have an account?{" "}
              <Link
                href={redirect ? loginHref(redirect) : "/login"}
                className="font-semibold text-primary transition-colors duration-base ease-out hover:text-primary-strong"
              >
                Sign in
              </Link>
            </p>
          </Card>
        </MotionFadeIn>
      </Container>
    </div>
  );
}
