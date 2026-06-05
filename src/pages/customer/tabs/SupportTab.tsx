import React, { useState } from "react";
import {
  HelpCircle, Plus, Clock, CheckCircle, MessageCircle,
  XCircle, ChevronDown, ChevronUp, Send,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { addDoc, collection as fsCol, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { toast } from "sonner";
import { format } from "date-fns";
import type { SupportTicket } from "@/types";

function toDate(ts: any): Date {
  if (!ts) return new Date(0);
  if (ts?.toDate) return ts.toDate();
  if (ts instanceof Date) return ts;
  return new Date(ts);
}

const CATEGORIES = [
  { value: "SAVINGS", label: "Savings Account" },
  { value: "LOAN", label: "Loan" },
  { value: "EMI", label: "EMI / Payment" },
  { value: "ACCOUNT", label: "Account" },
  { value: "TECHNICAL", label: "Technical Issue" },
  { value: "COMPLAINT", label: "Complaint" },
  { value: "GENERAL", label: "General Query" },
];

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  OPEN: { label: "Open", color: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400", icon: <Clock className="w-3 h-3" /> },
  IN_PROGRESS: { label: "In Progress", color: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400", icon: <MessageCircle className="w-3 h-3" /> },
  RESOLVED: { label: "Resolved", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400", icon: <CheckCircle className="w-3 h-3" /> },
  CLOSED: { label: "Closed", color: "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400", icon: <XCircle className="w-3 h-3" /> },
};

interface Props {
  tickets: SupportTicket[];
  orgId: string;
  membershipId: string | null;
  user: any;
}

export default function SupportTab({ tickets, orgId, membershipId, user }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [expandedTicket, setExpandedTicket] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [priority, setPriority] = useState("MEDIUM");
  const [submitting, setSubmitting] = useState(false);

  const sorted = [...tickets].sort(
    (a, b) => toDate(b.createdAt).getTime() - toDate(a.createdAt).getTime()
  );
  const openTickets = sorted.filter((t) => t.status === "OPEN" || t.status === "IN_PROGRESS");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgId || !membershipId || !user) return toast.error("Not authenticated.");
    if (!subject.trim()) return toast.error("Please enter a subject.");
    if (!description.trim()) return toast.error("Please describe your issue.");
    if (!category) return toast.error("Please select a category.");

    setSubmitting(true);
    try {
      await addDoc(fsCol(db, "supportTickets"), {
        organizationId: orgId,
        customerId: membershipId,
        customerName: user?.fullName || user?.firstName || "Customer",
        customerEmail: user?.primaryEmailAddress?.emailAddress || "",
        subject: subject.trim(),
        description: description.trim(),
        category,
        priority,
        status: "OPEN",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      toast.success("Support ticket raised! We'll get back to you shortly.");
      setSubject(""); setDescription(""); setCategory(""); setPriority("MEDIUM");
      setShowForm(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to raise ticket");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <HelpCircle className="w-5 h-5 text-blue-600" />
            Support Center
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">Raise and track support tickets</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          {showForm ? "Cancel" : "New Ticket"}
        </button>
      </div>

      {/* Open tickets alert */}
      {openTickets.length > 0 && (
        <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-2xl p-3 flex items-center gap-3">
          <MessageCircle className="w-5 h-5 text-blue-500 shrink-0" />
          <p className="text-sm text-blue-700 dark:text-blue-300">
            <span className="font-bold">{openTickets.length} ticket{openTickets.length > 1 ? "s" : ""}</span> currently being reviewed
          </p>
        </div>
      )}

      {/* New ticket form */}
      {showForm && (
        <Card>
          <CardHeader className="pb-0">
            <CardTitle className="text-sm flex items-center gap-2">
              <Send className="w-4 h-4 text-blue-600" />
              Raise a Support Ticket
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <form onSubmit={handleSubmit} className="space-y-4">
              <Field label="Category *">
                <select required value={category} onChange={(e) => setCategory(e.target.value)} className="fc-input">
                  <option value="">Select category…</option>
                  {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </Field>

              <Field label="Priority">
                <div className="flex gap-2">
                  {["LOW", "MEDIUM", "HIGH"].map((p) => (
                    <button
                      key={p} type="button"
                      onClick={() => setPriority(p)}
                      className={`flex-1 py-1.5 rounded-xl text-xs font-bold border transition-colors ${
                        priority === p
                          ? p === "HIGH" ? "bg-red-500 text-white border-red-500"
                            : p === "MEDIUM" ? "bg-amber-500 text-white border-amber-500"
                            : "bg-slate-500 text-white border-slate-500"
                          : "bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700"
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </Field>

              <Field label="Subject *">
                <input
                  type="text" required value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Brief description of your issue"
                  className="fc-input"
                />
              </Field>

              <Field label="Description *">
                <textarea
                  required value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Please describe your issue in detail…"
                  rows={4}
                  className="fc-input resize-none"
                />
              </Field>

              <button
                type="submit" disabled={submitting}
                className="w-full h-11 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Submitting…</>
                ) : (
                  <><Send className="w-4 h-4" /> Submit Ticket</>
                )}
              </button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Tickets list */}
      {sorted.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <HelpCircle className="w-10 h-10 mx-auto mb-3 text-slate-200" />
            <p className="font-semibold text-slate-700 dark:text-slate-300">No support tickets yet</p>
            <p className="text-sm text-slate-400 mt-1">Raise a ticket if you need help with your account.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {sorted.map((ticket) => {
            const status = STATUS_CONFIG[ticket.status] ?? STATUS_CONFIG.OPEN;
            const isExpanded = expandedTicket === ticket.id;
            const cat = CATEGORIES.find((c) => c.value === ticket.category);
            return (
              <Card key={ticket.id}>
                <CardContent className="p-4">
                  <button
                    onClick={() => setExpandedTicket(isExpanded ? null : ticket.id)}
                    className="w-full text-left"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                          {ticket.subject}
                        </p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${status.color}`}>
                            {status.icon} {status.label}
                          </span>
                          {cat && (
                            <span className="text-[10px] text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">
                              {cat.label}
                            </span>
                          )}
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                            ticket.priority === "HIGH" ? "bg-red-100 text-red-600"
                            : ticket.priority === "MEDIUM" ? "bg-amber-100 text-amber-600"
                            : "bg-slate-100 text-slate-500"
                          }`}>{ticket.priority}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[10px] text-slate-400">
                          {toDate(ticket.createdAt).getTime() > 0
                            ? format(toDate(ticket.createdAt), "MMM d")
                            : "—"}
                        </span>
                        {isExpanded
                          ? <ChevronUp className="w-4 h-4 text-slate-400" />
                          : <ChevronDown className="w-4 h-4 text-slate-400" />}
                      </div>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="mt-3 border-t border-slate-100 dark:border-slate-800 pt-3 space-y-2">
                      <p className="text-xs text-slate-600 dark:text-slate-300">{ticket.description}</p>
                      {ticket.agentResponse && (
                        <div className="bg-emerald-50 dark:bg-emerald-950/30 rounded-xl p-3">
                          <p className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 uppercase mb-1">Response from team</p>
                          <p className="text-xs text-emerald-800 dark:text-emerald-200">{ticket.agentResponse}</p>
                        </div>
                      )}
                      {ticket.resolvedAt && (
                        <p className="text-[10px] text-slate-400">
                          Resolved: {format(toDate(ticket.resolvedAt), "MMM d, yyyy")}
                        </p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Info */}
      <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-4 space-y-3">
        <p className="text-xs font-bold text-slate-700 dark:text-slate-300">Need urgent help?</p>
        <div className="space-y-2">
          <div className="flex items-center gap-3 p-2.5 bg-white dark:bg-slate-800 rounded-xl">
            <div className="w-7 h-7 bg-emerald-50 dark:bg-emerald-950/40 rounded-lg flex items-center justify-center">
              <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">Contact your Collector</p>
              <p className="text-[10px] text-slate-400">Reach out to your assigned field agent</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-2.5 bg-white dark:bg-slate-800 rounded-xl">
            <div className="w-7 h-7 bg-blue-50 dark:bg-blue-950/40 rounded-lg flex items-center justify-center">
              <HelpCircle className="w-3.5 h-3.5 text-blue-600" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">Branch Support</p>
              <p className="text-[10px] text-slate-400">Visit or call the organization branch</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">{label}</label>
      {children}
    </div>
  );
}
