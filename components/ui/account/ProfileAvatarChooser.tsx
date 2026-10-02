"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CameraIcon, UploadIcon, XIcon } from "lucide-react";
import { saveProfileAvatarAction } from "@/app/(app)/profile/actions";
import { Button } from "@/components/shadcn/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/shadcn/dialog";
import { ProfileAvatar } from "@/components/ui/ProfileAvatar";
import { AVATAR_COLORS } from "@/lib/profile-avatar";
import type { AvatarColor, UserProfile } from "@/types/index";
import styles from "./profile.module.css";

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

export function ProfileAvatarChooser({ profile, disabled, onBusyChange }: { profile: UserProfile; disabled: boolean; onBusyChange: (busy: boolean) => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [savedAvatar, setSavedAvatar] = useState({ color: profile.avatarColor, url: profile.avatarUrl });
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [pending, startTransition] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  useEffect(() => { onBusyChange(pending); }, [pending, onBusyChange]);

  function clearFile() {
    setFile(null);
    setPreview(undefined);
    if (fileInput.current) fileInput.current.value = "";
  }

  function chooseFile(nextFile: File | undefined) {
    setError(null);
    setStatus("");
    if (!nextFile) return;
    if (!IMAGE_TYPES.includes(nextFile.type)) {
      clearFile();
      setError("Choose a JPEG, PNG or WebP image.");
      return;
    }
    if (nextFile.size > MAX_IMAGE_BYTES || nextFile.size === 0) {
      clearFile();
      setError("Choose an image up to 2 MB.");
      return;
    }
    setFile(nextFile);
    setPreview(URL.createObjectURL(nextFile));
  }

  function savePreset(color: AvatarColor) {
    setError(null);
    setStatus("");
    startTransition(async () => {
      try {
        const result = await saveProfileAvatarAction(color);
        if (result.error || !result.avatarColor) {
          setError(result.error || "Your picture could not be saved. Choose the colour again to retry.");
          return;
        }
        setSavedAvatar({ color: result.avatarColor, url: undefined });
        clearFile();
        setStatus("Profile picture saved.");
        window.dispatchEvent(new Event("pokenotes:profile-avatar-updated"));
        router.refresh();
      } catch {
        setError("Your picture could not be saved. Choose the colour again to retry.");
      }
    });
  }

  function saveUpload() {
    if (!file) return;
    setError(null);
    setStatus("");
    startTransition(async () => {
      try {
        const body = new FormData();
        body.set("file", file);
        const response = await fetch("/api/profile/avatar", { method: "POST", body });
        const result = await response.json() as { avatarUrl?: string; error?: string };
        if (!response.ok || !result.avatarUrl) {
          setError(result.error || "Your image could not be saved. Try saving it again.");
          return;
        }
        setSavedAvatar({ color: savedAvatar.color, url: result.avatarUrl });
        clearFile();
        setStatus("Profile picture saved.");
        window.dispatchEvent(new Event("pokenotes:profile-avatar-updated"));
        router.refresh();
      } catch {
        setError("Your image could not be saved. Check your connection and try again.");
      }
    });
  }

  return (
    <Dialog onOpenChange={(nextOpen) => {
      if (pending) return;
      setOpen(nextOpen);
      if (!nextOpen) { clearFile(); setError(null); setStatus(""); }
    }} open={open}>
      <DialogTrigger asChild>
        <button aria-label="Change profile picture" className={styles.avatarTrigger} disabled={disabled} type="button">
          <ProfileAvatar avatarColor={savedAvatar.color} avatarUrl={savedAvatar.url} className={styles.heroAvatar} fallback={profile.displayName.slice(0, 2).toUpperCase()} />
          <span className={styles.camera}><CameraIcon aria-hidden="true" size={18} /></span>
        </button>
      </DialogTrigger>
      <DialogContent className={styles.avatarDialog} onEscapeKeyDown={(event) => { if (pending) event.preventDefault(); }} onPointerDownOutside={(event) => { if (pending) event.preventDefault(); }} showCloseButton={false}>
        <DialogClose asChild><Button aria-label="Close picture chooser" className={styles.dialogClose} disabled={pending} size="icon-sm" type="button" variant="ghost"><XIcon aria-hidden="true" /></Button></DialogClose>
        <DialogHeader><DialogTitle>Profile picture</DialogTitle><DialogDescription>Choose a Poké Ball or upload your own image.</DialogDescription></DialogHeader>
        <div aria-busy={pending} className={styles.picturePreview}>
          <ProfileAvatar avatarColor={savedAvatar.color} avatarUrl={preview || savedAvatar.url} className={styles.previewAvatar} fallback={profile.displayName.slice(0, 2).toUpperCase()} />
          <div><p>{file ? "New picture" : "Current picture"}</p><p className={styles.previewHint}>{file ? file.name : savedAvatar.url ? "Custom image" : `${savedAvatar.color.charAt(0).toUpperCase()}${savedAvatar.color.slice(1)} Poké Ball`}</p></div>
        </div>
        <fieldset className={styles.presetSection} disabled={pending}>
          <legend>Poké Balls</legend>
          <p className={styles.presetHelp}>Selecting a colour saves it immediately.</p>
          <div className={styles.avatarChoices}>
            {AVATAR_COLORS.map((color) => <label className={styles.avatarChoice} key={color}>
              <input checked={!file && !savedAvatar.url && savedAvatar.color === color} className="sr-only" name="avatar-preset" onChange={() => savePreset(color)} type="radio" value={color} />
              <span className={styles.avatarRing}><ProfileAvatar avatarColor={color} className="size-11" fallback="" /></span>
              <span>{color}</span>
            </label>)}
          </div>
        </fieldset>
        <section aria-labelledby="upload-picture-title" className={styles.uploadSection}>
          <h3 id="upload-picture-title">Your own image</h3>
          <p className={styles.presetHelp} id="upload-picture-help">JPEG, PNG or WebP, up to 2 MB. Your image is cropped to a circle.</p>
          <input accept="image/jpeg,image/png,image/webp" aria-describedby="upload-picture-help" aria-label="Upload profile image" className="sr-only" disabled={pending} onChange={(event) => chooseFile(event.target.files?.[0])} ref={fileInput} tabIndex={-1} type="file" />
          <div className={styles.uploadActions}>
            <Button disabled={pending} onClick={() => fileInput.current?.click()} type="button" variant="outline"><UploadIcon aria-hidden="true" />{file ? "Choose another image" : "Choose image"}</Button>
            {file ? <Button disabled={pending} onClick={saveUpload} type="button">{pending ? "Saving…" : "Save picture"}</Button> : null}
          </div>
        </section>
        <div className={styles.dialogStatus}>{error ? <p className={styles.error} role="alert">{error}</p> : null}<p role="status">{pending ? "Saving picture…" : status}</p></div>
      </DialogContent>
    </Dialog>
  );
}
