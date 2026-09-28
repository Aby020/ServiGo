"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Eye, EyeOff, Lock, Wrench } from "lucide-react";

import { MotionFadeIn } from "@/components/motion";
import { Container } from "@/components/ui/Container";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { login, me, type TokenPair, type UserProfile } from "@/lib/api";
import { setTokens } from "@/lib/auth";
import { resolveRedirect, signupHref, useAuthMutation } from "@/lib/session";

const schema = z.object({
  identifier: z.string().min(1, "Email or username is required"),
  password: z.string().min(1, "Password is required"),
});

type FormValues = z.infer<typeof schema>;

/**
 * `useSearchParams` opts a client component out of static prerendering, so
 * Next.js requires a `<Suspense>` boundary above it or the build fails with
 * "missing suspense boundary with useSearchParams". The wrapper exists for
 * exactly that reason — the form itself is unchanged.
 */
export default function LoginPage() {
  return (
    <Suspense fallback={<AuthPageFallback />}>
      <LoginForm />
    </Suspense>
  );
}

/**
 * Matches the form's own outer box so the transition from fallback to form
 * is a swap of contents, not a jump in page height.
 */
function AuthPageFallback() {
  return (
    <div className="flex min-h-[calc(100dvh-var(--header-h))] items-center justify-center">
      <Container className="py-14 sm:py-20">
        <div
          role="status"
          aria-label="Loading sign in"
          className="mx-auto h-[26rem] w-full max-w-md animate-pulse rounded-lg bg-surface-3"
        />
      </Container>
    </div>
  );
}

function LoginForm() {
  const [show, setShow] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  /**
   * Where to send the user once they are authenticated.
   *
   * Written by `loginHref` when a guest hits a gated action. Validated here
   * rather than trusted: it is a user-supplied query param, and an
   * unvalidated value would let `/login?redirect=https://evil.example` turn
   * this page into an open redirect. `resolveRedirect` runs it again inside
   * `useAuthMutation`, so there are two independent checks before it is
   * ever passed to `router.push`.
   */
  const searchParams = useSearchParams();
  const redirect = resolveRedirect(searchParams.get("redirect"));

  /**
   * `/auth/login/` returns tokens only, so this wraps it into the same
   * `{ user, tokens }` shape `useAuthMutation` expects: persist the tokens,
   * resolve the profile, then hand both to the shared success path (cache
   * seed + redirect-or-dashboard). Keeping the redirect in one place is what
   * stops login and signup from disagreeing about where to land.
   */
  const auth = useAuthMutation<FormValues>(
    async (values) => {
      const tokens: TokenPair = await login(values.identifier, values.password);
      setTokens(tokens);
      const user: UserProfile = await me(tokens.access);
      return { user, tokens };
    },
    redirect,
  );

  async function onSubmit(values: FormValues) {
    setServerError(null);
    try {
      await auth.mutateAsync(values);
    } catch (err) {
      setServerError(
        err instanceof Error ? err.message : "Login failed. Please try again."
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
                Welcome back
              </h1>
              <p className="mt-1 text-sm text-text-soft">
                Sign in to manage your bookings
              </p>
            </div>

            {/* Server error */}
            {serverError && (
              <div
                className="mb-5 flex items-start gap-2.5 rounded-md border border-danger/30 bg-danger-soft px-4 py-3 text-sm font-medium text-danger"
                role="alert"
              >
                <Lock size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
                <span>{serverError}</span>
              </div>
            )}

            <form className="flex flex-col gap-5" onSubmit={handleSubmit(onSubmit)} noValidate>
              <Input
                id="identifier"
                type="text"
                label="Email or username"
                placeholder="you@example.com"
                autoComplete="username"
                aria-invalid={!!errors.identifier}
                error={errors.identifier?.message}
                leadingIcon={<Wrench size={15} aria-hidden="true" />}
                {...register("identifier")}
              />

              <div>
                <div className="mb-1.5 flex items-baseline justify-between">
                  <label htmlFor="password" className="text-sm font-medium text-ink">
                    Password
                  </label>
                  <button
                    type="button"
                    className="cursor-pointer text-xs font-medium text-primary transition-colors duration-base ease-out hover:text-primary-strong"
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <input
                    id="password"
                    type={show ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    aria-invalid={!!errors.password}
                    className="h-11 w-full rounded-md border border-line bg-surface py-2 pl-3.5 pr-20 text-sm text-ink outline-none transition-colors duration-base ease-out placeholder:text-muted focus:border-primary focus:ring-4 focus:ring-primary/25"
                    {...register("password")}
                  />
                  <button
                    type="button"
                    onClick={() => setShow(!show)}
                    className="absolute right-1 top-1/2 flex -translate-y-1/2 cursor-pointer items-center gap-1 rounded-sm px-2 py-1 text-xs font-medium text-muted transition-colors duration-base ease-out hover:text-ink"
                    aria-label={show ? "Hide password" : "Show password"}
                  >
                    {show ? <EyeOff size={14} aria-hidden="true" /> : <Eye size={14} aria-hidden="true" />}
                    {show ? "Hide" : "Show"}
                  </button>
                </div>
                {errors.password && (
                  <p className="mt-1.5 text-xs text-danger">{errors.password.message}</p>
                )}
              </div>

              <Button
                type="submit"
                variant="accent"
                size="lg"
                fullWidth
                loading={isSubmitting}
                className="mt-1"
              >
                {isSubmitting ? "Signing in…" : "Sign in"}
              </Button>
            </form>

            <p className="mt-6 text-center text-sm text-text-soft">
              Don&apos;t have an account?{" "}
              {/*
                Carries the same `?redirect=` across to signup, so a guest
                who arrived here from a gated action can create an account
                and still land where they meant to go. With no redirect in
                play this is a plain `/signup`.
              */}
              <Link
                href={redirect ? signupHref(redirect) : "/signup"}
                className="font-semibold text-primary transition-colors duration-base ease-out hover:text-primary-strong"
              >
                Sign up free
              </Link>
            </p>
          </Card>
        </MotionFadeIn>
      </Container>
    </div>
  );
}
