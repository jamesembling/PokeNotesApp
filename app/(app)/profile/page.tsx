import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/shadcn/card";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageWidth } from "@/components/ui/PageWidth";
import { ProfileForm } from "@/components/ui/ProfileForm";
import { getCurrentProfile } from "@/lib/db/profile";

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short"
});

function formatDateTime(value: string | undefined) {
  if (!value) {
    return "Not available yet";
  }

  try {
    return DATE_TIME_FORMATTER.format(new Date(value));
  } catch {
    return value;
  }
}

export default async function ProfilePage() {
  const profile = await getCurrentProfile();

  return (
    <PageWidth size="narrow">
      <PageHeader
        breadcrumb={[{ label: "Poke Notes", href: "/" }, { label: "Profile" }]}
        title="Profile"
      />

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <p className="ui-eyebrow">Trainer Profile</p>
            <CardTitle>Account Details</CardTitle>
            <CardDescription>
              Your PTCGL username is used to identify your side when importing battle
              logs.
            </CardDescription>
          </CardHeader>

          <CardContent>
            <ProfileForm profile={profile} />
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <p className="ui-eyebrow">Signed In</p>
              <CardTitle>Account Snapshot</CardTitle>
            </CardHeader>

            <CardContent>
              <dl className="grid gap-3 text-sm">
                <div className="flex items-start justify-between gap-4">
                  <dt className="text-muted-foreground">Email</dt>
                  <dd className="text-right text-card-foreground">{profile.email || "Unknown"}</dd>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <dt className="text-muted-foreground">Role</dt>
                  <dd className="text-right text-card-foreground">{profile.role}</dd>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <dt className="text-muted-foreground">Avatar Color</dt>
                  <dd className="text-right capitalize text-card-foreground">
                    {profile.avatarColor}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <p className="ui-eyebrow">Activity</p>
              <CardTitle>Profile Metadata</CardTitle>
            </CardHeader>

            <CardContent>
              <dl className="grid gap-3 text-sm">
                <div className="flex items-start justify-between gap-4">
                  <dt className="text-muted-foreground">Account Created</dt>
                  <dd className="text-right text-card-foreground">
                    {formatDateTime(profile.authAccountCreatedAt || profile.createdAt)}
                  </dd>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <dt className="text-muted-foreground">Last Login</dt>
                  <dd className="text-right text-card-foreground">
                    {formatDateTime(profile.lastLoginAt)}
                  </dd>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <dt className="text-muted-foreground">Last Active</dt>
                  <dd className="text-right text-card-foreground">
                    {formatDateTime(profile.lastActiveAt)}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        </div>
      </div>
    </PageWidth>
  );
}
