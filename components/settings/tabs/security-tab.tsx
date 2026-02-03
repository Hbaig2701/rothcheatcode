"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { User } from "@supabase/supabase-js";
import {
  changePasswordSchema,
  changeEmailSchema,
  type ChangePasswordFormData,
  type ChangeEmailFormData,
} from "@/lib/validations/settings";
import {
  useChangePassword,
  useChangeEmail,
  useDeleteAccount,
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
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Loader2, CheckCircle, Eye, EyeOff, AlertTriangle } from "lucide-react";

interface SecurityTabProps {
  user: User;
}

export function SecurityTab({ user }: SecurityTabProps) {
  return (
    <div className="flex flex-col gap-6">
      <ChangePasswordCard />
      <ChangeEmailCard user={user} />
      <DeleteAccountCard />
    </div>
  );
}

// ============================================================================
// Change Password
// ============================================================================

function ChangePasswordCard() {
  const changePassword = useChangePassword();
  const [saved, setSaved] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ChangePasswordFormData>({
    resolver: zodResolver(changePasswordSchema),
  });

  const onSubmit = async (data: ChangePasswordFormData) => {
    setApiError(null);
    try {
      await changePassword.mutateAsync(data);
      setSaved(true);
      reset();
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setApiError(err instanceof Error ? err.message : "Failed to change password");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Change Password</CardTitle>
        <CardDescription>
          Update your password to keep your account secure
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit(onSubmit)}>
        <CardContent className="flex flex-col gap-4">
          {apiError && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {apiError}
            </div>
          )}

          <Field>
            <FieldLabel>Current Password</FieldLabel>
            <div className="relative">
              <Input
                {...register("current_password")}
                type={showCurrent ? "text" : "password"}
                placeholder="Enter current password"
              />
              <button
                type="button"
                onClick={() => setShowCurrent(!showCurrent)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showCurrent ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            <FieldError
              errors={errors.current_password ? [errors.current_password] : undefined}
            />
          </Field>

          <Field>
            <FieldLabel>New Password</FieldLabel>
            <div className="relative">
              <Input
                {...register("new_password")}
                type={showNew ? "text" : "password"}
                placeholder="Enter new password"
              />
              <button
                type="button"
                onClick={() => setShowNew(!showNew)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showNew ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            <FieldDescription>
              At least 8 characters with 1 number and 1 special character
            </FieldDescription>
            <FieldError
              errors={errors.new_password ? [errors.new_password] : undefined}
            />
          </Field>

          <Field>
            <FieldLabel>Confirm New Password</FieldLabel>
            <div className="relative">
              <Input
                {...register("confirm_password")}
                type={showConfirm ? "text" : "password"}
                placeholder="Confirm new password"
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showConfirm ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            <FieldError
              errors={errors.confirm_password ? [errors.confirm_password] : undefined}
            />
          </Field>
        </CardContent>

        <CardFooter className="justify-end gap-2">
          {saved && (
            <span className="flex items-center gap-1 text-sm text-green-500">
              <CheckCircle className="size-4" /> Password updated
            </span>
          )}
          <Button type="submit" disabled={changePassword.isPending}>
            {changePassword.isPending && (
              <Loader2 className="size-4 animate-spin" />
            )}
            Update Password
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

// ============================================================================
// Change Email
// ============================================================================

function ChangeEmailCard({ user }: { user: User }) {
  const changeEmail = useChangeEmail();
  const [saved, setSaved] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ChangeEmailFormData>({
    resolver: zodResolver(changeEmailSchema),
  });

  const onSubmit = async (data: ChangeEmailFormData) => {
    setApiError(null);
    try {
      await changeEmail.mutateAsync(data);
      setSaved(true);
      reset();
      setTimeout(() => setSaved(false), 5000);
    } catch (err) {
      setApiError(err instanceof Error ? err.message : "Failed to change email");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Change Email</CardTitle>
        <CardDescription>
          Update the email address associated with your account
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit(onSubmit)}>
        <CardContent className="flex flex-col gap-4">
          {apiError && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {apiError}
            </div>
          )}

          <p className="text-sm text-muted-foreground">
            Current email: <strong>{user.email}</strong>
          </p>

          <Field>
            <FieldLabel>New Email Address</FieldLabel>
            <Input
              {...register("new_email")}
              type="email"
              placeholder="Enter new email address"
            />
            <FieldError
              errors={errors.new_email ? [errors.new_email] : undefined}
            />
          </Field>

          <p className="text-xs text-muted-foreground">
            A verification email will be sent to your new address.
          </p>
        </CardContent>

        <CardFooter className="justify-end gap-2">
          {saved && (
            <span className="flex items-center gap-1 text-sm text-green-500">
              <CheckCircle className="size-4" /> Verification email sent
            </span>
          )}
          <Button type="submit" disabled={changeEmail.isPending}>
            {changeEmail.isPending && (
              <Loader2 className="size-4 animate-spin" />
            )}
            Update Email
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

// ============================================================================
// Delete Account
// ============================================================================

function DeleteAccountCard() {
  const deleteAccount = useDeleteAccount();
  const router = useRouter();
  const [confirmText, setConfirmText] = useState("");
  const [open, setOpen] = useState(false);

  const handleDelete = async () => {
    if (confirmText !== "DELETE") return;
    try {
      await deleteAccount.mutateAsync();
      router.push("/login");
    } catch {
      // Error handled by mutation
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-destructive">Danger Zone</CardTitle>
        <CardDescription>
          Irreversible actions that affect your account
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" />
            <div className="flex-1">
              <h4 className="font-medium text-destructive">Delete Account</h4>
              <p className="mt-1 text-sm text-muted-foreground">
                Permanently delete your account and all associated data. This
                action cannot be undone.
              </p>
              <AlertDialog open={open} onOpenChange={setOpen}>
                <AlertDialogTrigger
                  render={
                    <Button
                      variant="destructive"
                      size="sm"
                      className="mt-3"
                    />
                  }
                >
                  Delete Account
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete your account, all your
                      formulas, and all associated data. This action cannot be
                      undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <div className="px-0">
                    <label className="mb-2 block text-sm font-medium">
                      Type <strong>DELETE</strong> to confirm:
                    </label>
                    <Input
                      value={confirmText}
                      onChange={(e) => setConfirmText(e.target.value)}
                      placeholder="DELETE"
                    />
                  </div>
                  <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => setConfirmText("")}>
                      Cancel
                    </AlertDialogCancel>
                    <AlertDialogAction
                      variant="destructive"
                      onClick={handleDelete}
                      disabled={confirmText !== "DELETE" || deleteAccount.isPending}
                    >
                      {deleteAccount.isPending && (
                        <Loader2 className="size-4 animate-spin" />
                      )}
                      Delete Account
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
