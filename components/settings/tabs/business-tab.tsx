"use client";

import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { UserSettings } from "@/lib/types/settings";
import {
  businessSchema,
  type BusinessFormData,
} from "@/lib/validations/settings";
import {
  useUpdateSettings,
  useUploadLogo,
  useRemoveLogo,
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
import { Field, FieldLabel, FieldError, FieldDescription } from "@/components/ui/field";
import { ImageUpload } from "@/components/settings/image-upload";
import { ColorPicker } from "@/components/settings/color-picker";
import { Loader2, CheckCircle } from "lucide-react";

interface BusinessTabProps {
  settings: UserSettings;
}

export function BusinessTab({ settings }: BusinessTabProps) {
  const updateSettings = useUpdateSettings();
  const uploadLogo = useUploadLogo();
  const removeLogo = useRemoveLogo();
  const [saved, setSaved] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<BusinessFormData>({
    resolver: zodResolver(businessSchema),
    defaultValues: {
      company_name: settings.company_name ?? "",
      tagline: settings.tagline ?? "",
      company_phone: settings.company_phone ?? "",
      company_email: settings.company_email ?? "",
      company_website: settings.company_website ?? "",
      address: settings.address ?? "",
      primary_color: settings.primary_color ?? "#1a3a5c",
      secondary_color: settings.secondary_color ?? "#14b8a6",
    },
  });

  const onSubmit = async (data: BusinessFormData) => {
    await updateSettings.mutateAsync(data);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Business & Logo</CardTitle>
        <CardDescription>
          Customize your branding on exported PDFs
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit(onSubmit)}>
        <CardContent className="flex flex-col gap-8">
          {/* Logo Upload */}
          <div>
            <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Company Logo
            </h3>
            <p className="mb-3 text-sm text-muted-foreground">
              This logo will appear on the cover page and footer of your PDF
              reports.
            </p>
            <ImageUpload
              currentUrl={settings.logo_url}
              onUpload={(file) => uploadLogo.mutate(file)}
              onRemove={() => removeLogo.mutate()}
              shape="rectangle"
              label="Company Logo"
              hint="Recommended: PNG with transparent background, 400x100px. Max 2MB."
              isUploading={uploadLogo.isPending}
            />
          </div>

          {/* Business Information */}
          <div>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Business Information
            </h3>
            <div className="flex flex-col gap-4">
              <Field>
                <FieldLabel>Company / Business Name</FieldLabel>
                <Input
                  {...register("company_name")}
                  placeholder="Acme Financial Group"
                />
                <FieldError
                  errors={
                    errors.company_name ? [errors.company_name] : undefined
                  }
                />
              </Field>

              <Field>
                <FieldLabel>Tagline (optional)</FieldLabel>
                <Input
                  {...register("tagline")}
                  placeholder="Retirement Planning Specialists"
                />
              </Field>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel>Business Phone</FieldLabel>
                  <Input
                    {...register("company_phone")}
                    placeholder="(555) 987-6543"
                    type="tel"
                  />
                </Field>
                <Field>
                  <FieldLabel>Business Email</FieldLabel>
                  <Input
                    {...register("company_email")}
                    placeholder="info@company.com"
                    type="email"
                  />
                  <FieldError
                    errors={
                      errors.company_email ? [errors.company_email] : undefined
                    }
                  />
                </Field>
              </div>

              <Field>
                <FieldLabel>Website (optional)</FieldLabel>
                <Input
                  {...register("company_website")}
                  placeholder="https://www.company.com"
                />
                <FieldError
                  errors={
                    errors.company_website
                      ? [errors.company_website]
                      : undefined
                  }
                />
              </Field>

              <Field>
                <FieldLabel>Address (optional)</FieldLabel>
                <textarea
                  {...register("address")}
                  rows={2}
                  placeholder="123 Financial Plaza, Suite 400&#10;Los Angeles, CA 90001"
                  className="dark:bg-input/30 border-input focus-visible:border-ring focus-visible:ring-ring/50 w-full rounded-md border bg-transparent px-2.5 py-2 text-sm shadow-xs transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:ring-[3px] focus-visible:outline-none"
                />
              </Field>
            </div>
          </div>

          {/* Brand Colors */}
          <div>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Brand Colors
            </h3>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <Controller
                name="primary_color"
                control={control}
                render={({ field }) => (
                  <ColorPicker
                    value={field.value}
                    onChange={field.onChange}
                    label="Primary Color"
                    description="Used for headers and titles"
                  />
                )}
              />
              <Controller
                name="secondary_color"
                control={control}
                render={({ field }) => (
                  <ColorPicker
                    value={field.value}
                    onChange={field.onChange}
                    label="Secondary Color"
                    description="Used for accents and highlights"
                  />
                )}
              />
            </div>
          </div>
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
