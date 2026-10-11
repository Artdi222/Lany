"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { notify } from "@/lib/store/useNotificationStore";
import { useAuthStore } from "@/lib/store/useAuthStore";
import { apiClient } from "@/lib/api/client";
import type { User as UserType } from "@/types/user";
import { AUTH_FIELD } from "@/components/auth/styles";

interface RegisterModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const HINT = "mt-2 mb-4 font-game-body text-sm leading-snug text-white/85";
const BLUE_BUTTON =
  "block h-14 w-full cursor-pointer rounded-md bg-lf-primary font-game-display text-[19px] font-bold text-white transition-[filter] hover:brightness-110 disabled:opacity-60";

/** Two-step registration modal (intro, then form). Spec: docs/ui-spec/auth.md. */
export default function RegisterModal({ isOpen, onClose }: RegisterModalProps) {
  const login = useAuthStore((s) => s.login);
  const [step, setStep] = useState<"intro" | "form">("intro");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const close = () => {
    setStep("intro");
    onClose();
  };

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await apiClient<{ token: string; user: UserType }>("/auth/register", {
        method: "POST",
        body: { username, email, password },
      });
      login(res.token, res.user);
      notify("Account created successfully!");
      close();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={close} className="absolute inset-0 bg-black/70" />

          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="relative z-10 flex h-[min(632px,calc(100vh-2rem))] w-[min(870px,100%)] overflow-hidden rounded-xl bg-lf-bg-raised shadow-lf-panel"
          >
            {/* Left: steps (spec: 522px of 870) */}
            <div className="flex w-full flex-col px-14 py-12 md:w-[60%]">
              {step === "intro" ? (
                <>
                  <div className="mt-24 flex h-[66px] w-[66px] shrink-0 items-center justify-center self-center rounded-full border-[3px] border-white font-game-display text-sm font-bold text-white">
                    Lany
                  </div>
                  <h2 className="mt-24 text-center font-game-display text-[28px] font-light text-white">New Player Registration</h2>
                  <p className="mt-1 text-center font-game-body text-[13px] text-white/90">let&apos;s get you started</p>
                  <button onClick={() => setStep("form")} className={`${BLUE_BUTTON} mt-auto`}>
                    Let&apos;s create an account!
                  </button>
                </>
              ) : (
                <form onSubmit={handleSubmit} className="flex h-full flex-col">
                  <h2 className="mb-5 text-center font-game-display text-[22px] text-white">Let&apos;s create an account!</h2>
                  <input autoFocus value={username} onChange={(e) => setUsername(e.target.value)} required minLength={3} placeholder="username" autoComplete="username" className={AUTH_FIELD} />
                  <p className={HINT}>This will be your public presence. No profanity, no impersonation. Avoid exposing your own personal details, too!</p>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="email address" autoComplete="email" className={AUTH_FIELD} />
                  <p className={HINT}>
                    Will be used for notifications, account verification and in the case you forget your password. No spam, ever. <b>Make sure to get it right!</b>
                  </p>
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} placeholder="password" autoComplete="new-password" className={AUTH_FIELD} />
                  <p className={HINT}>At least 8 characters long. Choose something long but also something you will remember, like a line from your favourite song.</p>
                  <button type="submit" disabled={loading} className={`${BLUE_BUTTON} mt-auto`}>
                    {loading ? <Loader2 className="mx-auto h-5 w-5 animate-spin" /> : "Register"}
                  </button>
                </form>
              )}
            </div>

            {/* Right: mascot art */}
            <div
              aria-hidden
              className="hidden flex-1 bg-lf-surface bg-cover bg-center md:block"
              style={{ backgroundImage: "url(/background/Register.webp)" }}
            />
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
