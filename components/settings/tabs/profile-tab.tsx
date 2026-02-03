"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { User } from "@supabase/supabase-js";
import type { UserSettings } from "@/lib/types/settings";
import {
  profileSchema,
  type ProfileFormData,
} from "@/lib/validations/settings";
import {
  useUpdateSettings,
  useUploadAvatar,
  useRemoveAvatar,
} from "@/lib/queries/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldLabel, FieldError } from "@/components/ui/field";
import { ImageUpload } from "@/components/settings/image-upload";
import { Loader2, CheckCircle } from "lucide-react";
import { useState } from "react";

interface ProfileTabProps {
  user: User;
  settings: UserSettings;
}

export function ProfileTab({ user, settings }: ProfileTabProps) {
  const updateSettings = useUpdateSettings();
  const uploadAvatar = useUploadAvatar();
  const removeAvatar = useRemoveAvatar();
  const [saved, setSaved] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      first_name: settings.first_name ?? "",
      last_name: settings.last_name ?? "",
      phone: settings.phone ?? "",
    },
  });

  const onSubmit = async (data: ProfileFormData) => {
    await updateSettings.mutateAsync(data);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
        <CardDescription>Manage your personal information</CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit(onSubmit)}>
        <CardContent className="flex flex-col gap-6">
          {/* Avatar */}
          <div>
            <label className="mb-2 block text-sm font-medium">
              Profile Photo
            </label>
            <ImageUpload
              currentUrl={settings.avatar_url}
              onUpload={(file) => uploadAvatar.mutate(file)}
              onRemove={() => removeAvatar.mutate()}
              shape="circle"
              label="Profile Photo"
              hint="JPG, PNG. Max 2MB."
              isUploading={uploadAvatar.isPending}
            />
          </div>

          {/* Name fields */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel>First Name</FieldLabel>
              <Input {...register("first_name")} placeholder="First name" />
              <FieldError
                errors={errors.first_name ? [errors.first_name] : undefined}
              />
            </Field>
            <Field>
              <FieldLabel>Last Name</FieldLabel>
              <Input {...register("last_name")} placeholder="Last name" />
              <FieldError
                errors={errors.last_name ? [errors.last_name] : undefined}
              />
            </Field>
          </div>

          {/* Email (read-only) */}
          <Field>
            <FieldLabel>Email Address</FieldLabel>
            <Input value={user.email ?? ""} disabled />
            <p className="text-xs text-muted-foreground">
              To change your email, go to the Security tab.
            </p>
          </Field>

          {/* Phone */}
          <Field>
            <FieldLabel>Phone Number (optional)</FieldLabel>
            <Input
              {...register("phone")}
              placeholder="(555) 123-4567"
              type="tel"
            />
            <FieldError
              errors={errors.phone ? [errors.phone] : undefined}
            />
          </Field>
        </CardContent>

        <CardFooter className="justify-end gap-2">
          {saved && (
            <span className="flex items-center gap-1 text-sm text-green-500">
              <CheckCircle className="size-4" /> Saved
            </span>
          )}
          <Button type="submit" disabled={updateSettings.isPending}>
            {updateSettings.isPending && (
              <Loader2 className="size-4 animate-spin" />
            )}
            Save Changes
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
