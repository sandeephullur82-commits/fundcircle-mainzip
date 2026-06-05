import React, { useMemo } from "react";
import {
  Bell, BellOff, Check, CheckCheck, PiggyBank, CreditCard,
  AlertTriangle, Clock, Info, Megaphone,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { doc, updateDoc, writeBatch, collection, query, where, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { toast } from "sonner";
import { format, isToday, isYesterday } from "date-fns";
import type { Notification, NotificationType } from "@/types";

function toDate(ts: any): Date {
  if (!ts) return new Date(0);
  if (ts?.toDate) return ts.toDate();
  if (ts instanceof Date) return ts;
  return new Date(ts);
}

function getNotifIcon(type?: NotificationType) {
  switch (type) {
    case "DEPOSIT_COLLECTED": return <PiggyBank className="w-4 h-4 text-emerald-500" />;
    case "EMI_DUE": return <Clock className="w-4 h-4 text-amber-500" />;
    case "EMI_OVERDUE": return <AlertTriangle className="w-4 h-4 text-red-500" />;
    case "LOAN_APPROVED": return <CreditCard className="w-4 h-4 text-blue-500" />;
    case "LOAN_REJECTED": return <CreditCard className="w-4 h-4 text-red-500" />;
    case "LOAN_DISBURSED": return <CreditCard className="w-4 h-4 text-emerald-500" />;
    case "ACCOUNT_UPDATE": return <Info className="w-4 h-4 text-slate-500" />;
    default: return <Megaphone className="w-4 h-4 text-indigo-500" />;
  }
}

function getNotifBg(type?: NotificationType) {
  switch (type) {
    case "DEPOSIT_COLLECTED": return "bg-emerald-50 dark:bg-emerald-950/30";
    case "EMI_DUE": return "bg-amber-50 dark:bg-amber-950/30";
    case "EMI_OVERDUE": return "bg-red-50 dark:bg-red-950/30";
    case "LOAN_APPROVED": return "bg-blue-50 dark:bg-blue-950/30";
    case "LOAN_REJECTED": return "bg-red-50 dark:bg-red-950/30";
    case "LOAN_DISBURSED": return "bg-emerald-50 dark:bg-emerald-950/30";
    default: return "bg-indigo-50 dark:bg-indigo-950/30";
  }
}

function formatTime(ts: any): string {
  const d = toDate(ts);
  if (d.getTime() === 0) return "—";
  if (isToday(d)) return format(d, "h:mm a");
  if (isYesterday(d)) return "Yesterday";
  return format(d, "MMM d");
}

interface Props {
  notifications: Notification[];
  clerkUserId: string;
}

export default function NotificationsTab({ notifications, clerkUserId }: Props) {
  const sorted = useMemo(() => {
    return [...notifications].sort(
      (a, b) => toDate(b.timestamp ?? b.createdAt).getTime() - toDate(a.timestamp ?? a.createdAt).getTime()
    );
  }, [notifications]);

  const unread = sorted.filter((n) => !n.read);
  const read = sorted.filter((n) => n.read);

  const markRead = async (notif: Notification) => {
    if (notif.read) return;
    try {
      await updateDoc(doc(db, "notifications", notif.id), { read: true });
    } catch (err) {
      toast.error("Failed to mark as read");
    }
  };

  const markAllRead = async () => {
    if (unread.length === 0) return;
    try {
      const batch = writeBatch(db);
      unread.forEach((n) => {
        batch.update(doc(db, "notifications", n.id), { read: true });
      });
      await batch.commit();
      toast.success("All notifications marked as read");
    } catch (err) {
      toast.error("Failed to mark all as read");
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Bell className="w-5 h-5 text-indigo-600" />
            Notifications
          </h2>
          {unread.length > 0 && (
            <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-0.5 font-medium">
              {unread.length} unread
            </p>
          )}
        </div>
        {unread.length > 0 && (
          <button
            onClick={markAllRead}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-400 text-xs font-semibold hover:bg-indigo-100 transition-colors"
          >
            <CheckCheck className="w-3.5 h-3.5" /> Mark all read
          </button>
        )}
      </div>

      {/* Unread */}
      {unread.length > 0 && (
        <div>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 px-1">Unread</p>
          <div className="space-y-2">
            {unread.map((n) => (
              <button
                key={n.id}
                onClick={() => markRead(n)}
                className="w-full flex items-start gap-3 p-3.5 rounded-2xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/30 text-left hover:bg-indigo-100 dark:hover:bg-indigo-950/50 transition-colors group"
              >
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${getNotifBg(n.type as NotificationType)}`}>
                  {getNotifIcon(n.type as NotificationType)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white leading-tight">{n.title}</p>
                    <span className="text-[10px] text-slate-400 shrink-0 mt-0.5">{formatTime(n.timestamp ?? n.createdAt)}</span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5 line-clamp-2">{n.message}</p>
                </div>
                <div className="w-2 h-2 bg-indigo-500 rounded-full shrink-0 mt-1.5" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Read */}
      {read.length > 0 && (
        <div>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 px-1">
            {unread.length > 0 ? "Earlier" : "All Notifications"}
          </p>
          <Card>
            <CardContent className="p-0">
              <div className="divide-y divide-slate-50 dark:divide-slate-800">
                {read.map((n) => (
                  <div key={n.id} className="flex items-start gap-3 px-4 py-3.5 opacity-70">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${getNotifBg(n.type as NotificationType)}`}>
                      {getNotifIcon(n.type as NotificationType)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 leading-tight">{n.title}</p>
                        <span className="text-[10px] text-slate-400 shrink-0 mt-0.5">{formatTime(n.timestamp ?? n.createdAt)}</span>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">{n.message}</p>
                    </div>
                    <Check className="w-3.5 h-3.5 text-slate-300 shrink-0 mt-1" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Empty */}
      {sorted.length === 0 && (
        <Card>
          <CardContent className="py-16 text-center">
            <BellOff className="w-10 h-10 mx-auto mb-3 text-slate-200" />
            <p className="font-semibold text-slate-700 dark:text-slate-300">No notifications yet</p>
            <p className="text-sm text-slate-400 mt-1">
              You'll be notified about deposits, EMIs, loan updates, and more.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
