"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { UserSettings, UserSettingsUpdate } from "@/lib/types/settings";

// Query key factory
export const settingsKeys = {
  all: ["settings"] as const,
  detail: () => [...settingsKeys.all, "detail"] as const,
};

// Fetch current user's settings
export function useUserSettings() {
  return useQuery({
    queryKey: settingsKeys.detail(),
    queryFn: async (): Promise<UserSettings> => {
      const res = await fetch("/api/settings");
      if (!res.ok) {
        const error = await res
          .json()
          .catch(() => ({ error: "Failed to fetch settings" }));
        throw new Error(error.error || "Failed to fetch settings");
      }
      return res.json();
    },
  });
}

// Update settings (profile, business, defaults)
export function useUpdateSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: UserSettingsUpdate): Promise<UserSettings> => {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res
          .json()
          .catch(() => ({ error: "Failed to update settings" }));
        throw new Error(error.error || "Failed to update settings");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: settingsKeys.detail() });
    },
  });
}

// Change password
export function useChangePassword() {
  return useMutation({
    mutationFn: async (data: {
      current_password: string;
      new_password: string;
      confirm_password: string;
    }) => {
      const res = await fetch("/api/settings/password", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res
          .json()
          .catch(() => ({ error: "Failed to change password" }));
        throw new Error(error.error || "Failed to change password");
      }
      return res.json();
    },
  });
}

// Change email
export function useChangeEmail() {
  return useMutation({
    mutationFn: async (data: { new_email: string }) => {
      const res = await fetch("/api/settings/email", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res
          .json()
          .catch(() => ({ error: "Failed to change email" }));
        throw new Error(error.error || "Failed to change email");
      }
      return res.json();
    },
  });
}

// Delete account
export function useDeleteAccount() {
  return useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/settings/account", {
        method: "DELETE",
      });
      if (!res.ok) {
        const error = await res
          .json()
          .catch(() => ({ error: "Failed to delete account" }));
        throw new Error(error.error || "Failed to delete account");
      }
      return res.json();
    },
  });
}

// Upload avatar
export function useUploadAvatar() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (file: File): Promise<{ url: string }> => {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/settings/avatar", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const error = await res
          .json()
          .catch(() => ({ error: "Failed to upload avatar" }));
        throw new Error(error.error || "Failed to upload avatar");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: settingsKeys.detail() });
    },
  });
}

// Remove avatar
export function useRemoveAvatar() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/settings/avatar", {
        method: "DELETE",
      });
      if (!res.ok) {
        const error = await res
          .json()
          .catch(() => ({ error: "Failed to remove avatar" }));
        throw new Error(error.error || "Failed to remove avatar");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: settingsKeys.detail() });
    },
  });
}

// Upload logo
export function useUploadLogo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (file: File): Promise<{ url: string }> => {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/settings/logo", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const error = await res
          .json()
          .catch(() => ({ error: "Failed to upload logo" }));
        throw new Error(error.error || "Failed to upload logo");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: settingsKeys.detail() });
    },
  });
}

// Remove logo
export function useRemoveLogo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/settings/logo", {
        method: "DELETE",
      });
      if (!res.ok) {
        const error = await res
          .json()
          .catch(() => ({ error: "Failed to remove logo" }));
        throw new Error(error.error || "Failed to remove logo");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: settingsKeys.detail() });
    },
  });
}
