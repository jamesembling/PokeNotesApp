import { Avatar, AvatarFallback, AvatarImage } from "@/components/shadcn/avatar";
import { getAvatarIconSrc, normalizeAvatarColor } from "@/lib/profile-avatar";
import { cn } from "@/lib/utils";
import type { AvatarColor } from "@/types/index";

type ProfileAvatarProps = {
  avatarColor: AvatarColor | string | null | undefined;
  className?: string;
  fallback: string;
};

export function ProfileAvatar({ avatarColor, className, fallback }: ProfileAvatarProps) {
  const normalizedAvatarColor = normalizeAvatarColor(avatarColor);

  return (
    <Avatar className={cn("rounded-full bg-background", className)}>
      <AvatarImage
        alt=""
        className="rounded-full"
        src={getAvatarIconSrc(normalizedAvatarColor)}
      />
      <AvatarFallback className="rounded-full text-xs font-semibold">{fallback}</AvatarFallback>
    </Avatar>
  );
}
