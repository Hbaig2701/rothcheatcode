"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, UserPlus, Trash2, Copy, CheckCircle, Lock } from "lucide-react";
import { hasFeature, type PlanId } from "@/lib/config/plans";

interface TeamMember {
  id: string;
  email: string;
  role: string;
  status: string;
  invited_at: string;
  accepted_at: string | null;
}

interface TeamTabProps {
  plan: string;
  isTeamAdmin?: boolean;
}

export function TeamTab({ plan, isTeamAdmin = false }: TeamTabProps) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("user");
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [copiedLink, setCopiedLink] = useState<string | null>(null);

  const fetchMembers = useCallback(() => {
    fetch("/api/team/members")
      .then((r) => r.json())
      .then((data) => {
        setMembers(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setInviting(true);

    try {
      const res = await fetch("/api/team/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error);
      } else {
        setSuccess(`Invite sent to ${inviteEmail}`);
        setInviteEmail("");
        fetchMembers();
      }
    } catch {
      setError("Failed to send invite");
    } finally {
      setInviting(false);
    }
  };

  const handleRemove = async (memberId: string) => {
    try {
      const res = await fetch("/api/team/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId }),
      });

      if (res.ok) {
        fetchMembers();
      }
    } catch {
      // ignore
    }
  };

  const handleRoleChange = async (memberId: string, role: string) => {
    try {
      await fetch("/api/team/role", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId, role }),
      });
      fetchMembers();
    } catch {
      // ignore
    }
  };

  const copyInviteLink = (memberId: string) => {
    const url = `${window.location.origin}/invite/${memberId}`;
    navigator.clipboard.writeText(url);
    setCopiedLink(memberId);
    setTimeout(() => setCopiedLink(null), 2000);
  };

  const activeCount = members.filter(
    (m) => m.status !== "removed"
  ).length;

  // Show upgrade gate only for plan owners without team access (not admin team members)
  const hasTeamAccess = hasFeature(plan as PlanId, 'teamMembers');
  if (!hasTeamAccess && !isTeamAdmin) {
    return (
      <div className="space-y-6">
        <Card>
          <CardContent className="py-12 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[rgba(255,255,255,0.05)]">
              <Lock className="h-6 w-6 text-[rgba(255,255,255,0.65)]" />
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">
              Team Members
            </h3>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto mb-6">
              Adding additional seats and team members is only available on the
              Premium plan. Upgrade to invite your team and collaborate.
            </p>
            <Button
              onClick={async () => {
                const res = await fetch("/api/billing/portal", {
                  method: "POST",
                });
                const data = await res.json();
                if (data.url) window.location.href = data.url;
              }}
            >
              Upgrade to Premium
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Invite Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="size-5" />
            Invite Team Member
          </CardTitle>
          <CardDescription>
            {activeCount} active {activeCount === 1 ? 'member' : 'members'}.
            {isTeamAdmin
              ? " You're managing this team as an admin."
              : " Invite team members to share your clients and workspace."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <p className="mb-3 text-sm text-red-500">{error}</p>
          )}
          {success && (
            <p className="mb-3 flex items-center gap-1 text-sm text-green-500">
              <CheckCircle className="size-4" /> {success}
            </p>
          )}

          <form onSubmit={handleInvite} className="flex gap-3">
            <Input
              type="email"
              placeholder="teammate@example.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              required
              className="flex-1"
            />
            <Select value={inviteRole} onValueChange={(val) => val && setInviteRole(val)}>
              <SelectTrigger className="w-[120px]">
                <SelectValue className="capitalize" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="user">User</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
            <Button type="submit" disabled={inviting}>
              {inviting && <Loader2 className="mr-2 size-4 animate-spin" />}
              Invite
            </Button>
          </form>

          <p className="mt-3 text-xs text-muted-foreground">
            <strong>User</strong> — can view and manage clients. <strong>Admin</strong> — can also manage team members and account settings.
          </p>
        </CardContent>
      </Card>

      {/* Members List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Team Members</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : members.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No team members yet. Invite someone to get started.
            </p>
          ) : (
            <div className="space-y-3">
              {members.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center justify-between rounded-lg border border-[rgba(255,255,255,0.07)] p-3"
                >
                  <div className="flex-1">
                    <p className="text-sm text-white">{member.email}</p>
                    <div className="mt-1 flex items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          member.status === "active"
                            ? "bg-[rgba(74,222,128,0.15)] text-[#4ade80]"
                            : "bg-[rgba(255,255,255,0.08)] text-[rgba(255,255,255,0.55)]"
                        }`}
                      >
                        {member.status.charAt(0).toUpperCase() + member.status.slice(1)}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Select
                      value={member.role}
                      onValueChange={(val) =>
                        val && handleRoleChange(member.id, val)
                      }
                    >
                      <SelectTrigger className="h-8 w-[90px] text-xs">
                        <SelectValue className="capitalize" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="user">User</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                      </SelectContent>
                    </Select>

                    {member.status === "pending" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        onClick={() => copyInviteLink(member.id)}
                        title="Copy invite link"
                      >
                        {copiedLink === member.id ? (
                          <CheckCircle className="size-3.5 text-green-500" />
                        ) : (
                          <Copy className="size-3.5" />
                        )}
                      </Button>
                    )}

                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-red-400 hover:text-red-300"
                      onClick={() => handleRemove(member.id)}
                      title="Remove member"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
