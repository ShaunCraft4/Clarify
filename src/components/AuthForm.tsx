"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import ThemeToggle from "@/components/ThemeToggle";
import { BrainCircuit, Loader2 } from "lucide-react";

export default function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const params = useSearchParams();
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const isSignup = mode === "signup";

  async function onForgotPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) {
      setError("Enter your email address first.");
      return;
    }

    setResetLoading(true);
    setError(null);
    setInfo(null);

    try {
      const redirectTo = `${window.location.origin}/auth/callback?next=/auth/reset-password`;
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo,
      });
      if (error) throw error;
      setInfo(
        "If an account exists for that email, we sent a password reset link. Check your inbox (and spam folder)."
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send reset email");
    } finally {
      setResetLoading(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);

    try {
      if (isSignup) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
        });
        if (error) throw error;
        if (data.session) {
          router.push("/dashboard");
          router.refresh();
        } else {
          setInfo(
            "Account created. Check your email to confirm, then log in."
          );
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        router.push(params.get("redirect") || "/dashboard");
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2 relative animate-page-in">
      <ThemeToggle className="absolute top-4 right-4 z-10" />
      <div className="hidden lg:flex flex-col justify-between bg-gradient-to-br from-brand-700 to-brand-900 p-12 text-white">
        <div className="flex items-center gap-2 text-xl font-semibold">
          <BrainCircuit className="h-7 w-7" />
          Clarify
        </div>
        <div className="space-y-4 max-w-md">
          <h1 className="text-4xl font-bold leading-tight">
            Your personal learning coach.
          </h1>
          <p className="text-brand-100 text-lg">
            Upload your lectures, slides, and notes. Clarify tracks what you
            know, finds what you don&apos;t, and tells you what to study next.
          </p>
        </div>
        <p className="text-brand-200 text-sm">
          Adaptive quizzes · Knowledge-gap detection · Personalized study plans
        </p>
      </div>

      <div className="flex items-center justify-center p-6">
        {showForgot && !isSignup ? (
          <form onSubmit={onForgotPassword} className="w-full max-w-sm space-y-5">
            <div className="lg:hidden flex items-center gap-2 text-xl font-semibold text-brand-700">
              <BrainCircuit className="h-7 w-7" />
              Clarify
            </div>
            <div>
              <h2 className="text-2xl font-bold">Forgot password?</h2>
              <p className="text-slate-500 text-sm mt-1">
                Enter your email and we&apos;ll send you a reset link.
              </p>
            </div>

            <input
              type="email"
              required
              autoFocus
              placeholder="you@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                {error}
              </p>
            )}
            {info && (
              <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
                {info}
              </p>
            )}

            <button
              type="submit"
              disabled={resetLoading}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 font-medium text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {resetLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              Send reset link
            </button>

            <p className="text-sm text-slate-500 text-center">
              <button
                type="button"
                onClick={() => {
                  setShowForgot(false);
                  setError(null);
                  setInfo(null);
                }}
                className="text-brand-600 font-medium hover:underline"
              >
                Back to log in
              </button>
            </p>
          </form>
        ) : (
        <form onSubmit={onSubmit} className="w-full max-w-sm space-y-5">
          <div className="lg:hidden flex items-center gap-2 text-xl font-semibold text-brand-700">
            <BrainCircuit className="h-7 w-7" />
            Clarify
          </div>
          <div>
            <h2 className="text-2xl font-bold">
              {isSignup ? "Create your account" : "Welcome back"}
            </h2>
            <p className="text-slate-500 text-sm mt-1">
              {isSignup
                ? "Start studying smarter today."
                : "Log in to your study dashboard."}
            </p>
          </div>

          <div className="space-y-3">
            <input
              type="email"
              required
              placeholder="you@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
            <input
              type="password"
              required
              minLength={6}
              placeholder="Password (min 6 characters)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
            {!isSignup && (
              <div className="flex justify-end -mt-1">
                <button
                  type="button"
                  onClick={() => {
                    setShowForgot(true);
                    setError(null);
                    setInfo(null);
                  }}
                  className="text-sm text-brand-600 font-medium hover:underline"
                >
                  Forgot password?
                </button>
              </div>
            )}
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
          {info && (
            <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
              {info}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 font-medium text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {isSignup ? "Sign up" : "Log in"}
          </button>

          <p className="text-sm text-slate-500 text-center">
            {isSignup ? (
              <>
                Already have an account?{" "}
                <Link href="/login" className="text-brand-600 font-medium">
                  Log in
                </Link>
              </>
            ) : (
              <>
                New to Clarify?{" "}
                <Link href="/signup" className="text-brand-600 font-medium">
                  Create an account
                </Link>
              </>
            )}
          </p>
        </form>
        )}
      </div>
    </div>
  );
}
