import { useCollectionRealtime } from "@/lib/firestore-hooks";
import { useUser, useOrganization } from "@clerk/clerk-react";
import { Membership, Collection } from "@/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { IndianRupee, MapPin, User, Clock } from "lucide-react";
import { toast } from "sonner";
import { recordCollection } from "@/lib/services";
import { useState } from "react";
import { startOfDay } from "date-fns";

export default function AgentPending() {
  const { user } = useUser();
  const { organization } = useOrganization();
  const agentId = user?.id || "";

  const { data: allMembers, loading: membersLoading } = useCollectionRealtime<Membership>("organizationMembers");
  const { data: collections, loading: collLoading } = useCollectionRealtime<Collection>("collections");

  const [selectedCustomer, setSelectedCustomer] = useState<Membership | null>(null);
  const [amount, setAmount] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const today = startOfDay(new Date());

  const todayCustomerIds = collections
    .filter((c) => {
      const d = (c.timestamp as any)?.toDate?.() || new Date(c.timestamp);
      return d >= today && c.agentId === agentId;
    })
    .map((c) => c.customerId);

  const myCustomers = allMembers.filter(
    (m) =>
      (m.role === "customer" || (m.role as string) === "CUSTOMER") &&
      (m.agentId === agentId || (m as any).assignedAgentId === agentId)
  );
  const pendingCustomers = myCustomers.filter((c) => !todayCustomerIds.includes(c.id));
  const visitedCustomers = myCustomers.filter((c) => todayCustomerIds.includes(c.id));

  const handleCollect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organization?.id || !selectedCustomer) return;
    if (Number(amount) <= 0) return toast.error("Enter a valid amount");
    setIsSubmitting(true);
    try {
      await recordCollection(organization.id, {
        customerId: selectedCustomer.id,
        agentId,
        amount: Number(amount),
        status: "completed",
        collectedByRole: "AGENT",
        collectedByUserId: agentId,
        collectedByName: user?.fullName || "Agent",
      });
      toast.success("Collection recorded successfully");
      setSelectedCustomer(null);
      setAmount("");
    } catch {
      toast.error("Failed to record collection");
    } finally {
      setIsSubmitting(false);
    }
  };

  const loading = membersLoading || collLoading;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Pending Collections</h2>
        <p className="text-slate-500 text-sm">Customers who haven't been visited today.</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
        </div>
      ) : (
        <>
          {/* Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="border-slate-200 shadow-sm">
              <CardContent className="p-5">
                <p className="text-xs text-slate-500 font-medium">Total Assigned</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">{myCustomers.length}</p>
              </CardContent>
            </Card>
            <Card className="bg-orange-50 border-orange-100 shadow-sm">
              <CardContent className="p-5">
                <p className="text-xs text-orange-600 font-medium">Pending Today</p>
                <p className="text-2xl font-bold text-orange-700 mt-1">{pendingCustomers.length}</p>
              </CardContent>
            </Card>
            <Card className="bg-emerald-50 border-emerald-100 shadow-sm">
              <CardContent className="p-5">
                <p className="text-xs text-emerald-600 font-medium">Visited Today</p>
                <p className="text-2xl font-bold text-emerald-700 mt-1">{visitedCustomers.length}</p>
              </CardContent>
            </Card>
          </div>

          {/* Pending customers */}
          {pendingCustomers.length === 0 ? (
            <Card className="border-slate-200 shadow-sm">
              <CardContent className="py-16 text-center">
                <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 mb-4">
                  <IndianRupee className="h-8 w-8 text-emerald-600" />
                </div>
                <h3 className="text-lg font-semibold text-slate-700 mb-1">All done for today!</h3>
                <p className="text-sm text-slate-500">You've visited all assigned customers.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-slate-700 uppercase tracking-[0.2em]">
                Pending Visits ({pendingCustomers.length})
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {pendingCustomers.map((customer) => (
                  <Card key={customer.id} className="border-orange-100 bg-orange-50/60 shadow-sm hover:shadow-md transition">
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <p className="font-bold text-slate-900">{customer.name || "Unknown"}</p>
                          <p className="text-xs text-slate-500 mt-0.5">{customer.phone || "No phone"}</p>
                        </div>
                        <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 border border-orange-200 px-2 py-0.5 text-xs font-semibold text-orange-700">
                          <Clock className="h-3 w-3" />
                          Pending
                        </span>
                      </div>
                      {customer.assignedArea && (
                        <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-3">
                          <MapPin className="h-3.5 w-3.5" />
                          {customer.assignedArea}
                        </div>
                      )}
                      <Button
                        onClick={() => setSelectedCustomer(customer)}
                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-sm"
                        size="sm"
                      >
                        <IndianRupee className="h-3.5 w-3.5 mr-1.5" />
                        Collect Now
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Visited customers */}
          {visitedCustomers.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-emerald-700 uppercase tracking-[0.2em]">
                Visited Today ({visitedCustomers.length})
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {visitedCustomers.map((customer) => (
                  <div key={customer.id} className="flex items-center gap-3 rounded-xl border border-emerald-100 bg-emerald-50 p-3">
                    <div className="h-8 w-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600">
                      <User className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{customer.name || "Unknown"}</p>
                      <p className="text-xs text-emerald-600 font-medium">✓ Collected today</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Collect Dialog */}
      <Dialog open={!!selectedCustomer} onOpenChange={(open) => !open && setSelectedCustomer(null)}>
        <DialogContent className="rounded-2xl max-w-sm">
          <DialogHeader>
            <DialogTitle>Record Collection</DialogTitle>
          </DialogHeader>
          {selectedCustomer && (
            <form onSubmit={handleCollect} className="space-y-4">
              <div className="rounded-xl bg-slate-50 p-4 border border-slate-100">
                <p className="text-xs text-slate-500">Customer</p>
                <p className="font-bold text-lg text-slate-900 mt-0.5">{selectedCustomer.name}</p>
              </div>
              <div className="space-y-2">
                <Label>Amount (₹)</Label>
                <Input
                  type="number"
                  placeholder="e.g. 500"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                  className="text-lg rounded-xl h-12"
                  autoFocus
                />
              </div>
              <Button
                type="submit"
                className="w-full h-12 bg-emerald-600 hover:bg-emerald-700 text-base"
                disabled={isSubmitting}
              >
                {isSubmitting ? "Processing…" : "Confirm Collection"}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
