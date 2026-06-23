import { useCollectionRealtime } from "@/lib/firestore-hooks";
import { Bell, CheckCheck, Loader2, MessageSquare, IndianRupee, Users, AlertCircle } from "lucide-react";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface Notification {
  id: string;
  title: string;
  message: string;
  read: boolean;
  timestamp: any;
  userId: string;
  organizationId: string;
  type?: "collection" | "invite" | "alert" | "system";
}

const typeIcon = (type?: string) => {
  switch (type) {
    case "collection": return <IndianRupee className="h-4 w-4 text-emerald-600" />;
    case "invite": return <Users className="h-4 w-4 text-blue-600" />;
    case "alert": return <AlertCircle className="h-4 w-4 text-orange-500" />;
    default: return <Bell className="h-4 w-4 text-slate-500" />;
  }
};

const typeBg = (type?: string) => {
  switch (type) {
    case "collection": return "bg-emerald-50 border-emerald-100";
    case "invite": return "bg-blue-50 border-blue-100";
    case "alert": return "bg-orange-50 border-orange-100";
    default: return "bg-slate-50 border-slate-100";
  }
};

export default function OrgNotifications() {
  const { data: notifications, loading } = useCollectionRealtime<Notification>("notifications");

  const sorted = [...notifications].sort((a, b) => {
    const dA = (a.timestamp as any)?.toDate?.() || new Date(a.timestamp);
    const dB = (b.timestamp as any)?.toDate?.() || new Date(b.timestamp);
    return dB.valueOf() - dA.valueOf();
  });

  const unreadCount = sorted.filter((n) => !n.read).length;

  const markRead = async (notifId: string) => {
    try {
      await updateDoc(doc(db, "notifications", notifId), {
        read: true,
        updatedAt: serverTimestamp(),
      });
    } catch {
      toast.error("Failed to mark notification as read.");
    }
  };

  const markAllRead = async () => {
    const unread = sorted.filter((n) => !n.read);
    if (!unread.length) return;
    try {
      await Promise.all(
        unread.map((n) =>
          updateDoc(doc(db, "notifications", n.id), { read: true, updatedAt: serverTimestamp() })
        )
      );
      toast.success("All notifications marked as read.");
    } catch {
      toast.error("Failed to update notifications.");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Bell className="h-6 w-6 text-slate-500" />
            Notifications
            {unreadCount > 0 && (
              <span className="inline-flex items-center justify-center h-6 min-w-6 rounded-full bg-red-500 text-white text-xs font-bold px-1.5">
                {unreadCount}
              </span>
            )}
          </h2>
          <p className="text-slate-500 text-sm mt-0.5">
            Real-time alerts for collections, new members, and system events.
          </p>
        </div>
        {unreadCount > 0 && (
          <Button
            variant="outline"
            onClick={markAllRead}
            className="shrink-0 flex items-center gap-2 text-sm"
          >
            <CheckCheck className="h-4 w-4" />
            Mark all as read
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 text-slate-400 animate-spin" />
        </div>
      ) : sorted.length === 0 ? (
        <Card className="border-slate-200 shadow-sm">
          <CardContent className="py-16 text-center">
            <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 mb-4">
              <Bell className="h-8 w-8 text-slate-400" />
            </div>
            <h3 className="text-lg font-semibold text-slate-700 mb-2">No notifications yet</h3>
            <p className="text-sm text-slate-500 max-w-xs mx-auto">
              Notifications will appear here when collections are recorded, agents are invited, or system events occur.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {sorted.map((notif) => {
            const ts = (notif.timestamp as any)?.toDate?.() || new Date(notif.timestamp);
            return (
              <div
                key={notif.id}
                onClick={() => !notif.read && markRead(notif.id)}
                className={`relative flex items-start gap-4 rounded-2xl border p-4 transition cursor-pointer hover:shadow-md ${
                  notif.read
                    ? "bg-white border-slate-100 opacity-70"
                    : `${typeBg(notif.type)} shadow-sm`
                }`}
              >
                {!notif.read && (
                  <div className="absolute top-4 right-4 h-2.5 w-2.5 rounded-full bg-sky-500 shadow-sm" />
                )}
                <div className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border ${typeBg(notif.type)}`}>
                  {typeIcon(notif.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className={`text-sm font-semibold ${notif.read ? "text-slate-600" : "text-slate-900"}`}>
                      {notif.title}
                    </p>
                    <p className="text-xs text-slate-400 shrink-0">
                      {ts ? formatDistanceToNow(ts, { addSuffix: true }) : ""}
                    </p>
                  </div>
                  <p className={`mt-1 text-sm leading-5 ${notif.read ? "text-slate-400" : "text-slate-600"}`}>
                    {notif.message}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
