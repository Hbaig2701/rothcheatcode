"use client";

import { use } from "react";
import { useClient } from "@/lib/queries/clients";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Pencil, ArrowLeft, BarChart3 } from "lucide-react";

interface ClientDetailPageProps {
  params: Promise<{ id: string }>;
}

// Helper to format filing status for display
const formatFilingStatus = (status: string): string => {
  const map: Record<string, string> = {
    single: "Single",
    married_filing_jointly: "Married Filing Jointly",
    married_filing_separately: "Married Filing Separately",
    head_of_household: "Head of Household",
  };
  return map[status] || status;
};

// Helper to format date for display
const formatDate = (dateString: string | null): string => {
  if (!dateString) return "N/A";
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};

// Calculate age from date of birth or use direct age field
const calculateAge = (dateOfBirth: string | null, directAge?: number): number => {
  if (directAge !== undefined && directAge > 0) {
    return directAge;
  }
  if (!dateOfBirth) return 62; // Default
  const today = new Date();
  const birthDate = new Date(dateOfBirth);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
};

export default function ClientDetailPage({ params }: ClientDetailPageProps) {
  const { id } = use(params);
  const { data: client, isLoading, isError, error } = useClient(id);

  if (isLoading) {
    return (
      <div className="container py-8">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (isError || !client) {
    return (
      <div className="container py-8">
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <h2 className="text-lg font-semibold text-red-600 mb-2">
            Failed to load client
          </h2>
          <p className="text-muted-foreground mb-4">
            {error?.message || "Client not found"}
          </p>
          <Button variant="outline" render={<a href="/clients"  />}>
            Back to clients
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container py-8">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <Button variant="ghost" size="icon" render={<a href="/clients"  />}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-3xl font-bold tracking-tight">{client.name}</h1>
          <p className="text-muted-foreground">
            Client since {formatDate(client.created_at)}
          </p>
        </div>
        <div className="flex gap-2">
          <Button render={<a href={`/clients/${client.id}/results`}  />}>
            <BarChart3 className="mr-2 h-4 w-4" />
            View Results
          </Button>
          <Button variant="outline" render={<a href={`/clients/${client.id}/edit`}  />}>
            <Pencil className="mr-2 h-4 w-4" />
            Edit
          </Button>
        </div>
      </div>

      {/* Client info */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Basic Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground">Age</p>
              <p className="font-medium">
                {calculateAge(client.date_of_birth, client.age)} years old
                {client.date_of_birth && ` (Born: ${formatDate(client.date_of_birth)})`}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">State</p>
              <p className="font-medium">{client.state}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Filing Status</p>
              <Badge variant="secondary">
                {formatFilingStatus(client.filing_status)}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Roth Conversion Projections card */}
        <Card>
          <CardHeader>
            <CardTitle>Roth Conversion Projections</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <p className="text-muted-foreground mb-4">
                Compare 4 Roth conversion strategies and find the optimal approach for this client.
              </p>
              <Button render={<a href={`/clients/${client.id}/results`}  />}>
                <BarChart3 className="mr-2 h-4 w-4" />
                View Results
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
