"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, User, Pencil, Save, Camera, Loader2 } from "lucide-react";
import { useAuthStore } from "@/lib/store/useAuthStore";
import { updateProfile } from "@/lib/api/user";
import { uploadToSupabase } from "@/lib/api/beatmaps";
import { countryName } from "@/lib/country";
import CountryPicker from "@/components/profile/CountryPicker";
import ScoresSection from "@/components/profile/ScoresSection";
import Flag from "@/components/profile/Flag";
import { invalidateUserProfile, useUserProfile } from "@/components/profile/useUserProfile";
import { toast } from "sonner";

interface ProfilePanelProps {
  isOpen: boolean;
  onClose: () => void;
  /** Player to show; defaults to the signed-in user (the only editable one). */
  userId?: string;
}

const LABEL = "font-game-body text-xs text-white/70";
const FIELD =
  "block h-12 w-full rounded-lf-md border-2 border-transparent bg-black/40 px-4 font-game-body text-base text-white outline-hidden transition-colors hover:border-white/15 focus:border-lf-accent";

/** Click-to-replace overlay shown on the banner/avatar while editing. */
function ChangeImage({ label, onPick }: { label: string; onPick: (e: React.ChangeEvent<HTMLInputElement>) => void }) {
  return (
    <label className="absolute inset-0 flex cursor-pointer flex-col items-center justify-center gap-1.5 bg-black/45 font-game-body text-sm text-white opacity-90 transition-opacity hover:opacity-100">
      <Camera className="h-6 w-6" />
      {label}
      <input type="file" accept="image/*" onChange={onPick} className="hidden" />
    </label>
  );
}

function uploadedUrl(path: string) {
  return `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/beatmaps/bg?path=${encodeURIComponent(path)}`;
}

/**
 * Downscale an image before upload: a raw photo banner was ~1.6 MB and took seconds to load through the
 * /beatmaps/bg proxy. GIFs are left alone (canvas would drop the animation).
 */
async function shrinkImage(file: File, maxWidth: number): Promise<File> {
  if (file.type === "image/gif") return file;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxWidth / bitmap.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/webp", 0.85));
  if (!blob || blob.size >= file.size) return file;
  return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".webp", { type: "image/webp" });
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-8 font-game-body text-sm">
      <span className="text-white/75">{label}</span>
      <span className="text-white">{value}</span>
    </div>
  );
}

/** "player info" sheet. Spec: docs/ui-spec/profile.md. */
export default function ProfilePanel({ isOpen, onClose, userId }: ProfilePanelProps) {
  const { user, token, login } = useAuthStore();
  const viewedId = userId ?? user?.id;
  const isOwn = !!user && viewedId === user.id;
  const profile = useUserProfile(viewedId, isOpen);
  // Own profile renders from the auth store (instant, updated on save); others from the fetched profile.
  const shown = isOwn ? user : profile;
  const [isEditing, setIsEditing] = useState(false);
  const [username, setUsername] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [country, setCountry] = useState("");
  const [savedCountry, setSavedCountry] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const avatarSrc = useMemo(() => (avatarFile ? URL.createObjectURL(avatarFile) : shown?.avatarUrl), [avatarFile, shown?.avatarUrl]);
  const bannerSrc = useMemo(() => (bannerFile ? URL.createObjectURL(bannerFile) : shown?.bannerUrl), [bannerFile, shown?.bannerUrl]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  const startEditing = () => {
    setUsername(user?.username ?? "");
    setCountry(profile?.country ?? "");
    setAvatarFile(null);
    setBannerFile(null);
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setAvatarFile(null);
    setBannerFile(null);
    setIsEditing(false);
  };

  const pickImage = (setFile: (f: File | null) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }
    setFile(file);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !user) return;

    setIsSaving(true);
    try {
      const [avatarUrl, bannerUrl] = await Promise.all([
        avatarFile ? shrinkImage(avatarFile, 512).then(uploadToSupabase).then(uploadedUrl) : user.avatarUrl,
        bannerFile ? shrinkImage(bannerFile, 1600).then(uploadToSupabase).then(uploadedUrl) : user.bannerUrl,
      ]);

      const updatedUser = await updateProfile(token, {
        username: username !== user.username ? username : undefined,
        avatarUrl: avatarUrl || undefined,
        bannerUrl: bannerUrl || undefined,
        country: country && country !== profile?.country ? country : undefined,
      });

      login(token, updatedUser);
      invalidateUserProfile(user.id);
      if (country) setSavedCountry(country);
      toast.success("Profile updated successfully!");
      setIsEditing(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update profile");
    } finally {
      setIsSaving(false);
    }
  };

  const shownCountry = (isOwn ? savedCountry : null) ?? profile?.country;
  const rank = profile && profile.globalRank > 0 ? `#${profile.globalRank.toLocaleString("en-US")}` : "-";
  const pp = profile ? `${Math.round(profile.totalPp ?? 0).toLocaleString("en-US")}pp` : "-";
  const joined = shown?.createdAt ? new Date(shown.createdAt).toLocaleDateString("en-US", { month: "short", year: "numeric" }) : "recently";

  return (
    <AnimatePresence>
      {isOpen && shown && (
        <div className="fixed inset-x-0 bottom-0 top-12 z-40">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-black/60" />

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ duration: 0.18 }}
            className="absolute inset-y-0 left-1/2 flex w-[min(1632px,100%)] -translate-x-1/2 flex-col bg-lf-surface shadow-lf-panel"
          >
            <header className="flex h-[77px] shrink-0 items-center gap-4 bg-lf-bg-raised px-12">
              <User className="h-8 w-8 text-white" aria-hidden />
              <h1 className="font-game-display text-[22px] text-white">player info</h1>
              <button type="button" onClick={onClose} aria-label="Close" className="ml-auto cursor-pointer rounded-full p-2 text-white/70 transition-colors hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </header>
            <div className="shrink-0 bg-lf-bg-raised px-12 pb-0 font-game-body text-sm text-white">
              <span className="inline-block border-b-[3px] border-lf-primary pb-1">info</span>
            </div>

            <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
              <div className="relative h-48 bg-linear-to-r from-lf-primary/50 to-lf-bg lg:h-[350px]">
                {bannerSrc && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={bannerSrc} alt="" className="absolute inset-0 h-full w-full object-cover" />
                )}
                {isEditing && isOwn && <ChangeImage label="Change banner" onPick={pickImage(setBannerFile)} />}
              </div>

              <div className="relative flex h-[120px] items-end bg-lf-bg-raised pb-[30px] pl-[262px] pr-12">
                <span className="absolute bottom-[30px] left-[70px] flex h-40 w-40 items-center justify-center overflow-hidden rounded-xl bg-lf-bg shadow-lf-panel">
                  {avatarSrc ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={avatarSrc} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <User className="h-16 w-16 text-lf-text-muted" />
                  )}
                  {isEditing && isOwn && <ChangeImage label="Change avatar" onPick={pickImage(setAvatarFile)} />}
                </span>
                <div className="min-w-0">
                  <h2 className="truncate font-game-display text-2xl font-bold text-white">{shown.username}</h2>
                  {shownCountry && (
                    <div className="mt-1 flex items-center gap-2 font-game-body text-sm text-white/85">
                      <Flag code={shownCountry} height={20} />
                      {countryName(shownCountry)}
                    </div>
                  )}
                </div>
                {isOwn && (
                  <button
                    type="button"
                    onClick={() => (isEditing ? cancelEditing() : startEditing())}
                    aria-label={isEditing ? "Cancel editing" : "Edit profile"}
                    className="ml-3 cursor-pointer rounded-lf-sm p-1.5 text-white/60 transition-colors hover:text-white"
                  >
                    {isEditing ? <X className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
                  </button>
                )}
              </div>

              {isEditing && isOwn && (
                <form onSubmit={handleSaveProfile} className="mx-[70px] mt-8 max-w-3xl rounded-lf-lg bg-black/20 p-6">
                  <div className="flex items-baseline justify-between">
                    <h3 className="font-game-display text-lg font-bold text-white">Edit profile</h3>
                    <span className="font-game-body text-xs text-white/55">Click the banner or avatar above to replace them.</span>
                  </div>
                  <div className="mt-5 grid gap-5 sm:grid-cols-2">
                    <label className="block">
                      <span className={LABEL}>Username</span>
                      <input value={username} onChange={(e) => setUsername(e.target.value)} minLength={3} maxLength={50} required className={`mt-1.5 ${FIELD}`} />
                      <span className="mt-1 block font-game-body text-xs text-white/45">3 to 50 characters. Shown on leaderboards.</span>
                    </label>
                    <div>
                      <span className={LABEL}>Country</span>
                      <div className="mt-1.5">
                        <CountryPicker value={country} onChange={setCountry} />
                      </div>
                      <span className="mt-1 block font-game-body text-xs text-white/45">Used for your flag and country ranking.</span>
                    </div>
                  </div>
                  {(avatarFile || bannerFile) && (
                    <p className="mt-4 font-game-body text-xs text-lf-accent">
                      New {[avatarFile && "avatar", bannerFile && "banner"].filter(Boolean).join(" and ")} will upload when you save.
                    </p>
                  )}
                  <div className="mt-6 flex justify-end gap-3">
                    <button type="button" onClick={cancelEditing} className="cursor-pointer rounded-lf-md px-5 py-2.5 font-game-display text-sm font-bold text-white/80 transition-colors hover:bg-white/10 hover:text-white">
                      Cancel
                    </button>
                    <button type="submit" disabled={isSaving} className="flex cursor-pointer items-center gap-2 rounded-lf-md bg-lf-primary px-6 py-2.5 font-game-display text-sm font-bold text-white transition-[filter] hover:brightness-110 disabled:opacity-60">
                      {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      {isSaving ? "Saving..." : "Save changes"}
                    </button>
                  </div>
                </form>
              )}

              <div className="flex flex-wrap items-start justify-between gap-8 px-[70px] py-9">
                <div className="flex gap-16">
                  <div>
                    <div className={LABEL}>Global Ranking</div>
                    <div className="font-game-display text-[30px] font-bold leading-9 text-lf-warning">{rank}</div>
                  </div>
                  {(
                    <div>
                      <div className={LABEL}>Country Ranking</div>
                      <div className="font-game-display text-[30px] font-bold leading-9 text-white/80">{profile?.countryRank != null && (!isOwn || savedCountry === null) ? `#${profile.countryRank.toLocaleString("en-US")}` : "-"}</div>
                    </div>
                  )}
                  <div>
                    <div className={LABEL}>Performance</div>
                    <div className="font-game-display text-[30px] font-bold leading-9 text-white">{pp}</div>
                  </div>
                </div>
                <div className="w-72 space-y-1.5">
                  <Stat label="Hit Accuracy" value={profile ? `${profile.stats.avgAccuracy.toFixed(2)}%` : "-"} />
                  <Stat label="Play Count" value={profile ? profile.stats.playCount.toLocaleString("en-US") : "-"} />
                </div>
              </div>

              <p className="px-[70px] pb-8 font-game-body text-[13px] text-white/70">Joined {joined}</p>
              {viewedId && <ScoresSection userId={viewedId} />}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
