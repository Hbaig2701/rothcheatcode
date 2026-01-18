"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import {
  clientCreateSchema,
  type ClientCreateInput,
} from "@/lib/validations/client";
import { useCreateClient, useUpdateClient } from "@/lib/queries/clients";
import type { Client } from "@/lib/types/client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

interface ClientFormProps {
  client?: Client; // If provided, form is in edit mode
  onCancel?: () => void;
}

export function ClientForm({ client, onCancel }: ClientFormProps) {
  const router = useRouter();
  const isEditing = !!client;

  const createClient = useCreateClient();
  const updateClient = useUpdateClient();

  const form = useForm<ClientCreateInput>({
    resolver: zodResolver(clientCreateSchema),
    defaultValues: {
      name: client?.name ?? "",
      date_of_birth: client?.date_of_birth ?? "",
      state: client?.state ?? "",
      filing_status: client?.filing_status ?? "single",
    },
  });

  const isPending = createClient.isPending || updateClient.isPending;

  const onSubmit = async (data: ClientCreateInput) => {
    try {
      if (isEditing && client) {
        await updateClient.mutateAsync({ id: client.id, data });
        router.push(`/clients/${client.id}`);
      } else {
        await createClient.mutateAsync(data);
        router.push("/clients");
      }
    } catch (error) {
      // Error is displayed via mutation state
      console.error("Form submission error:", error);
    }
  };

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    } else if (isEditing && client) {
      router.push(`/clients/${client.id}`);
    } else {
      router.push("/clients");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{isEditing ? "Edit Client" : "New Client"}</CardTitle>
      </CardHeader>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <CardContent className="space-y-4">
          {/* Name field */}
          <div className="space-y-2">
            <Label htmlFor="name">Full Name</Label>
            <Input
              id="name"
              placeholder="John Doe"
              {...form.register("name")}
              aria-invalid={!!form.formState.errors.name}
            />
            {form.formState.errors.name && (
              <p className="text-sm text-red-500">
                {form.formState.errors.name.message}
              </p>
            )}
          </div>

          {/* Date of Birth field */}
          <div className="space-y-2">
            <Label htmlFor="date_of_birth">Date of Birth</Label>
            <Input
              id="date_of_birth"
              type="date"
              {...form.register("date_of_birth")}
              aria-invalid={!!form.formState.errors.date_of_birth}
            />
            {form.formState.errors.date_of_birth && (
              <p className="text-sm text-red-500">
                {form.formState.errors.date_of_birth.message}
              </p>
            )}
          </div>

          {/* State field */}
          <div className="space-y-2">
            <Label htmlFor="state">State</Label>
            <Input
              id="state"
              placeholder="CA"
              maxLength={2}
              {...form.register("state")}
              className="uppercase"
              aria-invalid={!!form.formState.errors.state}
            />
            {form.formState.errors.state && (
              <p className="text-sm text-red-500">
                {form.formState.errors.state.message}
              </p>
            )}
          </div>

          {/* Filing Status field */}
          <div className="space-y-2">
            <Label htmlFor="filing_status">Filing Status</Label>
            <Select
              value={form.watch("filing_status")}
              onValueChange={(value) =>
                form.setValue("filing_status", value as ClientCreateInput["filing_status"], {
                  shouldValidate: true,
                })
              }
            >
              <SelectTrigger id="filing_status">
                <SelectValue placeholder="Select filing status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="single">Single</SelectItem>
                <SelectItem value="married_filing_jointly">
                  Married Filing Jointly
                </SelectItem>
                <SelectItem value="married_filing_separately">
                  Married Filing Separately
                </SelectItem>
                <SelectItem value="head_of_household">
                  Head of Household
                </SelectItem>
              </SelectContent>
            </Select>
            {form.formState.errors.filing_status && (
              <p className="text-sm text-red-500">
                {form.formState.errors.filing_status.message}
              </p>
            )}
          </div>

          {/* API error display */}
          {(createClient.isError || updateClient.isError) && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">
              {createClient.error?.message || updateClient.error?.message}
            </div>
          )}
        </CardContent>

        <CardFooter className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEditing ? "Save Changes" : "Create Client"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
