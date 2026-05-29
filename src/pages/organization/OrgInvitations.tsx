import React, { useState } from "react";
import { useCollectionRealtime } from "@/lib/firestore-hooks";
import { useOrganization, useUser } from "@clerk/clerk-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { resendInvitation, revokeInvitation } from "@/lib/services";
import {
  Users, UserCheck, Clock, RefreshCw, XCircle, CheckCircle2,
  AlertTriangle, Loader2, SendHorizonal, Mail,
} from "lucide-react";
import { toast } from "sonner";
import { format, formatDistanceToNow, addDays, isPast } from "date-fns";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

type InvStatus = "pending" | "accepted" | "expired" | "revoked";
type RoleFilter = "all" | "agents" | "customers";
type StatusFilter = "all" | "pending" | "accepted" | "expired" | "revoked";

function classifyInvitation(inv: any): InvStatus {
  if ((inv.status || "").toUpperCase() === "REVOKED") return "revoked";
  if (
    inv.profileCompleted === true ||
    (inv.status || "").toUpperCase() === "ACCEPTED" ||
    (inv.status || "").toUpperCase() === "ACTIVE"
  ) {
    return "accepted";
  }
  const createdMs =
    inv.createdAt?.toDate?.()?.getTime() ||
    (inv.createdAt?.seconds != null ? inv.createdAt.seconds * 1000 : 0);
  if (createdMs && Date.now() - createdMs > SEVEN_DAYS_MS) return "expired";
  return "pending";
}

function expiryDate(inv: any): Date | null {
  const createdMs =
    inv.createdAt?.toDate?.()?.getTime() ||
    (inv.createdAt?.seconds != null ? inv.createdAt.seconds * 1000 : 0);
  if (!createdMs) return null;
  return addDays(new Date(createdMs), 7);
}

function invitedDate(inv: any): string {
  const d =
    inv.createdAt?.toDate?.() ||
    (inv.createdAt?.seconds != null ? new Date(inv.createdAt.seconds * 1000) : null);
  if (!d) return "—";
  return format(d, "MMM d, yyyy");
}

const STATUS_CONFIG: Record<
  InvStatus,
  { label: string; className: string; icon: React.ElementType }
> = {
  pending:  { label: "Pending",  className: "bg-amber-50 text-amber-700 border-amber-200",   icon: Clock },
  accepted: { label: "Accepted", className: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: CheckCircle2 },
  expired:  { label: "Expired",  className: "bg-slate-50 text-slate-500 border-slate-200",   icon: AlertTriangle },
  revoked:  { label: "Revoked",  className: "bg-red-50 text-red-600 border-red-200",          icon: XCircle },
};

export default function OrgInvitations() {
  const { organization } = useOrganization();
  const { user } = useUser();

  const { data: allInvitations, loading } = useCollectionRealtime<any>("pendingInvites");

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  // Classify all invitations
  const classified = allInvitations.map((inv) => ({
    ...inv,
    _status: classifyInvitation(inv),
  }));

  // Summary counts
  const pendingCount  = classified.filter((i) => i._status === "pending").length;
  const acceptedCount = classified.filter((i) => i._status === "accepted").length;
  const expiredCount  = classified.filter((i) => i._status === "expired").length;
  const revokedCount  = classified.filter((i) => i._status === "revoked").length;

  // Apply filters
  const filtered = classified.filter((inv) => {
    const sMatch = statusFilter === "all" || inv._status === statusFilter;
    const rMatch =
      roleFilter === "all" ||
      (roleFilter === "agents" && inv.role === "pigmy_collector") ||
      (roleFilter === "customers" && inv.role === "customer");
    return sMatch && rMatch;
  });

  // Sort: most recent first
  const sorted = [...filtered].sort((a, b) => {
    const aMs = a.createdAt?.toDate?.()?.getTime() || a.createdAt?.seconds * 1000 || 0;
    const bMs = b.createdAt?.toDate?.()?.getTime() || b.createdAt?.seconds * 1000 || 0;
    return bMs - aMs;
  });

  const handleResend = async (inv: any) => {
    if (!organization) { toast.error("No active organization."); return; }
    setResendingId(inv.id);
    try {
      await resendInvitation({
        pendingInviteId: inv.id,
        organization,
        email: inv.email,
        clerkRole: inv.clerkRole || (inv.role === "pigmy_collector" ? "org:pigmy_collector" : "org:customer"),
      });
      toast.success(`Invitation resent to ${inv.email}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to resend invitation");
    } finally {
      setResendingId(null);
    }
  };

  const handleRevoke = async (inv: any) => {
    setRevokingId(inv.id);
    try {
      await revokeInvitation({
        pendingInviteId: inv.id,
        organizationMemberId: inv.organizationMemberId,
      });
      toast.success(`Invitation revoked for ${inv.email}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to revoke invitation");
    } finally {
      setRevokingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Invitation Manager</h2>
        <p className="text-slate-500 text-sm mt-0.5">
          Track, resend, and revoke invitations for agents and customers.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Pending",  count: pendingCount,  color: "bg-amber-50 border-amber-200 text-amber-700",   icon: Clock },
          { label: "Accepted", count: acceptedCount, color: "bg-emerald-50 border-emerald-200 text-emerald-700", icon: CheckCircle2 },
          { label: "Expired",  count: expiredCount,  color: "bg-slate-50 border-slate-200 text-slate-600",   icon: AlertTriangle },
          { label: "Revoked",  count: revokedCount,  color: "bg-red-50 border-red-200 text-red-600",          icon: XCircle },
        ].map(({ label, count, color, icon: Icon }) => (
          <div
            key={label}
            onClick={() => setStatusFilter(label.toLowerCase() as StatusFilter)}
            className={`rounded-2xl border p-4 cursor-pointer transition-all hover:shadow-sm ${color} ${
              statusFilter === label.toLowerCase() ? "ring-2 ring-offset-1 ring-current" : ""
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold uppercase tracking-wide opacity-70">{label}</span>
              <Icon className="w-4 h-4 opacity-60" />
            </div>
            <p className="text-2xl font-bold">{count}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="flex rounded-xl border border-slate-200 bg-slate-50 p-0.5 gap-0.5">
          {(["all", "pending", "accepted", "expired", "revoked"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition-all ${
                statusFilter === s
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="flex rounded-xl border border-slate-200 bg-slate-50 p-0.5 gap-0.5">
          {([["all", "All"], ["agents", "Agents"], ["customers", "Customers"]] as const).map(([val, label]) => (
            <button
              key={val}
              onClick={() => setRoleFilter(val)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition-all ${
                roleFilter === val
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {/* Desktop */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Email</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Role</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Invited</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Expires</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {loading ? (
                  [...Array(4)].map((_, i) => (
                    <tr key={i}>
                      {[...Array(6)].map((_, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 bg-slate-100 rounded animate-pulse w-24" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : sorted.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-16">
                      <div className="flex flex-col items-center gap-2">
                        <SendHorizonal className="w-8 h-8 text-slate-300" />
                        <p className="text-slate-500 text-sm font-medium">No invitations found.</p>
                        <p className="text-slate-400 text-xs">Invite agents and customers from their respective tabs.</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  sorted.map((inv) => {
                    const cfg = STATUS_CONFIG[inv._status as InvStatus];
                    const StatusIcon = cfg.icon;
                    const expiry = expiryDate(inv);
                    const isExpiredOrRevoked = inv._status === "expired" || inv._status === "revoked" || inv._status === "accepted";
                    const isResending = resendingId === inv.id;
                    const isRevoking  = revokingId  === inv.id;
                    return (
                      <tr key={inv.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Mail className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                            <span className="font-medium text-slate-800">{inv.email}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {inv.role === "pigmy_collector" ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 border border-blue-200 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
                              <UserCheck className="w-3 h-3" /> Agent
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-purple-50 border border-purple-200 px-2.5 py-0.5 text-xs font-semibold text-purple-700">
                              <Users className="w-3 h-3" /> Customer
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-500 text-xs">{invitedDate(inv)}</td>
                        <td className="px-4 py-3 text-xs">
                          {inv._status === "accepted" || inv._status === "revoked" ? (
                            <span className="text-slate-400">—</span>
                          ) : expiry ? (
                            <span className={isPast(expiry) ? "text-red-500 font-medium" : "text-slate-500"}>
                              {isPast(expiry)
                                ? "Expired " + formatDistanceToNow(expiry, { addSuffix: true })
                                : "Expires " + formatDistanceToNow(expiry, { addSuffix: true })}
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold ${cfg.className}`}>
                            <StatusIcon className="w-3 h-3" />
                            {cfg.label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            {(inv._status === "pending" || inv._status === "expired") && (
                              <button
                                onClick={() => handleResend(inv)}
                                disabled={isResending}
                                className="inline-flex items-center gap-1 text-xs font-semibold text-sky-600 hover:text-sky-700 disabled:opacity-50 transition-colors"
                              >
                                {isResending ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <RefreshCw className="w-3 h-3" />
                                )}
                                Resend
                              </button>
                            )}
                            {inv._status === "pending" && (
                              <button
                                onClick={() => handleRevoke(inv)}
                                disabled={isRevoking}
                                className="inline-flex items-center gap-1 text-xs font-semibold text-red-500 hover:text-red-600 disabled:opacity-50 transition-colors"
                              >
                                {isRevoking ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <XCircle className="w-3 h-3" />
                                )}
                                Revoke
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile */}
          <div className="md:hidden">
            {loading ? (
              <div className="p-4 space-y-3">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-20 bg-slate-100 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : sorted.length === 0 ? (
              <div className="py-14 text-center">
                <SendHorizonal className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-slate-500 text-sm font-medium">No invitations found.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {sorted.map((inv) => {
                  const cfg = STATUS_CONFIG[inv._status as InvStatus];
                  const StatusIcon = cfg.icon;
                  const expiry = expiryDate(inv);
                  const isResending = resendingId === inv.id;
                  const isRevoking  = revokingId  === inv.id;
                  return (
                    <div key={inv.id} className="px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-slate-800 truncate">{inv.email}</p>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-semibold ${cfg.className}`}>
                              <StatusIcon className="w-2.5 h-2.5" />
                              {cfg.label}
                            </span>
                            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
                              inv.role === "pigmy_collector"
                                ? "bg-blue-50 text-blue-700"
                                : "bg-purple-50 text-purple-700"
                            }`}>
                              {inv.role === "pigmy_collector" ? "Agent" : "Customer"}
                            </span>
                          </div>
                          <p className="text-xs text-slate-400 mt-1">
                            Invited {invitedDate(inv)}
                            {expiry && inv._status !== "accepted" && inv._status !== "revoked" && (
                              <> · {isPast(expiry) ? "Expired" : "Expires"} {formatDistanceToNow(expiry, { addSuffix: true })}</>
                            )}
                          </p>
                        </div>
                        <div className="flex flex-col gap-1.5 items-end shrink-0">
                          {(inv._status === "pending" || inv._status === "expired") && (
                            <button
                              onClick={() => handleResend(inv)}
                              disabled={isResending}
                              className="inline-flex items-center gap-1 text-xs font-semibold text-sky-600 disabled:opacity-50"
                            >
                              {isResending ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                              Resend
                            </button>
                          )}
                          {inv._status === "pending" && (
                            <button
                              onClick={() => handleRevoke(inv)}
                              disabled={isRevoking}
                              className="inline-flex items-center gap-1 text-xs font-semibold text-red-500 disabled:opacity-50"
                            >
                              {isRevoking ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3 h-3" />}
                              Revoke
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
