"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { credentialsSchema, type Credentials } from "@/lib/auth-schema";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface AuthFormProps {
  mode: "login" | "signup";
}

export function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Credentials>({
    resolver: zodResolver(credentialsSchema),
    mode: "onTouched",
  });

  const onSubmit = async (values: Credentials) => {
    setFormError(null);
    try {
      await api(mode === "login" ? "/auth/login" : "/auth/signup", {
        method: "POST",
        body: values,
      });
      router.push("/");
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 422 && err.fields) {
          for (const [field, message] of Object.entries(err.fields)) {
            setError(field as keyof Credentials, { message });
          }
          return;
        }
        if (err.status === 401 || err.status === 409) {
          setFormError(err.message);
          return;
        }
      }
      setFormError("Something went wrong. Try again.");
    }
  };

  const isLogin = mode === "login";

  return (
    <div className="w-full max-w-sm">
      {/* Wordmark */}
      <div className="flex items-center justify-center gap-2 mb-8">
        <span
          className="flex items-center justify-center w-7 h-7 rounded-md bg-accent text-accent-fg text-sm font-bold leading-none"
          aria-hidden="true"
        >
          ✓
        </span>
        <span className="text-lg font-semibold tracking-tight text-text">
          TaskFlow
        </span>
      </div>

      {/* Card */}
      <div className="bg-surface border border-border rounded-xl px-8 py-8 shadow-sm">
        {/* Heading */}
        <div className="mb-6 text-center">
          <h1 className="text-xl font-semibold text-text mb-1.5">
            {isLogin ? "Welcome back" : "Create your account"}
          </h1>
          <p className="text-sm text-text-secondary">
            {isLogin
              ? "Sign in to continue to TaskFlow"
              : "Start managing tasks with your team"}
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
          {/* Form-level error banner */}
          {formError && (
            <div
              role="alert"
              className="px-3 py-2.5 rounded-md bg-danger-subtle border border-danger/20 text-danger text-sm"
            >
              {formError}
            </div>
          )}

          <Input
            label="Email"
            type="email"
            autoComplete="email"
            placeholder="you@company.com"
            error={errors.email?.message}
            {...register("email")}
          />

          <Input
            label="Password"
            type="password"
            autoComplete={isLogin ? "current-password" : "new-password"}
            placeholder={isLogin ? "Your password" : "At least 8 characters"}
            error={errors.password?.message}
            {...register("password")}
          />

          <Button
            type="submit"
            variant="primary"
            loading={isSubmitting}
            className="w-full h-9 text-sm mt-1"
          >
            {isLogin ? "Sign in" : "Create account"}
          </Button>
        </form>

        {/* Footer link */}
        <p className="mt-5 text-center text-sm text-text-secondary">
          {isLogin ? (
            <>
              Don&apos;t have an account?{" "}
              <Link
                href="/signup"
                className="text-accent hover:text-accent-hover font-medium underline underline-offset-2 transition-colors"
              >
                Sign up
              </Link>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <Link
                href="/login"
                className="text-accent hover:text-accent-hover font-medium underline underline-offset-2 transition-colors"
              >
                Log in
              </Link>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
