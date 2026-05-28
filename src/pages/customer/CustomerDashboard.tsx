import { useUser, SignOutButton } from "@clerk/clerk-react";
import { LogOut, Wallet, CreditCard, History } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCollectionRealtimeRaw } from "@/lib/firestore-hooks";
import { Collection, Loan, User } from "@/types";
import { format } from "date-fns";
import React, { useState } from "react";
import { applyForLoan } from "@/lib/services";
import { toast } from "sonner";
import { where } from "firebase/firestore";
import { useLanguage } from "@/lib/languageContext";
import { Navigate } from "react-router-dom";

export default function CustomerDashboard() {
  const { isLoaded, isSignedIn, user } = useUser();
  const { language, setLanguage, t } = useLanguage();
  const customerEmail = user?.primaryEmailAddress?.emailAddress || "";

  const { data: users, loading: usersLoading } = useCollectionRealtimeRaw<User>("users", [where("email", "==", customerEmail)]);
  const profile = users?.[0] || null;
  const customerId = profile?.id || "";

  const { data: collections } = useCollectionRealtimeRaw<Collection>("collections", customerId ? [where("customerId", "==", customerId)] : []);
  const { data: loans } = useCollectionRealtimeRaw<Loan>("loans", customerId ? [where("customerId", "==", customerId)] : []);

  const [isLoanOpen, setIsLoanOpen] = useState(false);
  const [loanPrincipal, setLoanPrincipal] = useState("");
  const [loanDuration, setLoanDuration] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const activeLoan = loans.find(l => l.status === "active");
  const pendingLoan = loans.find(l => l.status === "pending");

  const handleApplyLoan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.organizationId || !customerId) return toast.error("Organization or Profile not found");
    setIsSubmitting(true);
    try {
      await applyForLoan(profile.organizationId, {
        customerId,
        principal: Number(loanPrincipal),
        durationMonths: Number(loanDuration)
      });
      toast.success(t("loanPending") || "Loan application submitted successfully!");
      setIsLoanOpen(false);
    } catch {
      toast.error("Failed to apply for loan");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Minimal inline check — don't block the whole page for Clerk session
  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col pb-16">
        <header className="bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm">
          <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-8 w-24" />
          </div>
        </header>
        <main className="flex-1 p-4 md:p-8 max-w-5xl mx-auto w-full space-y-6">
          <Skeleton className="h-44 rounded-3xl" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Skeleton className="h-48 rounded-2xl" />
            <Skeleton className="h-48 rounded-2xl" />
          </div>
        </main>
      </div>
    );
  }

  if (!isSignedIn || !user) {
    return <Navigate to="/customer/signin" replace />;
  }

  if (!profile && !usersLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 text-center">
        <div className="max-w-md w-full bg-white p-8 rounded-2xl shadow-xl border border-slate-200">
          <div className="flex justify-center gap-2 mb-6 bg-slate-100 p-1 rounded-full w-fit mx-auto">
            <Button variant={language === "en" ? "default" : "ghost"} size="sm" onClick={() => setLanguage("en")} className="rounded-full text-xs h-8 px-3">English</Button>
            <Button variant={language === "kn" ? "default" : "ghost"} size="sm" onClick={() => setLanguage("kn")} className="rounded-full text-xs h-8 px-3">ಕನ್ನಡ</Button>
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">{t("profileNotFound")}</h2>
          <p className="text-slate-500 mb-6 leading-relaxed">{t("profileNotFoundDesc")} ({customerEmail})</p>
          <SignOutButton>
            <Button variant="outline" className="w-full h-12 rounded-xl border-slate-200 font-semibold text-slate-700 hover:bg-slate-50">
              {t("logout")}
            </Button>
          </SignOutButton>
        </div>
      </div>
    );
  }

  // While profile is loading from Firestore, show skeleton inline (not full-page)
  if (usersLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col pb-16">
        <header className="bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm">
          <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wallet className="w-6 h-6 text-purple-600" />
              <span className="font-extrabold text-slate-900 tracking-tight text-lg">{t("myPigmy")}</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex gap-1 bg-slate-100 p-1 rounded-full text-xs">
                <button className={`px-2.5 py-1 rounded-full font-medium transition-colors ${language === 'en' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`} onClick={() => setLanguage('en')}>EN</button>
                <button className={`px-2.5 py-1 rounded-full font-medium transition-colors ${language === 'kn' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`} onClick={() => setLanguage('kn')}>ಕನ್ನಡ</button>
              </div>
            </div>
          </div>
        </header>
        <main className="flex-1 p-4 md:p-8 max-w-5xl mx-auto w-full space-y-6">
          <Skeleton className="h-44 rounded-3xl" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Skeleton className="h-48 rounded-2xl" />
            <Skeleton className="h-48 rounded-2xl" />
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col pb-16">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wallet className="w-6 h-6 text-purple-600" />
            <span className="font-extrabold text-slate-900 tracking-tight text-lg">{t("myPigmy")}</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex gap-1 bg-slate-100 p-1 rounded-full text-xs">
              <button className={`px-2.5 py-1 rounded-full font-medium transition-colors ${language === 'en' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`} onClick={() => setLanguage('en')}>EN</button>
              <button className={`px-2.5 py-1 rounded-full font-medium transition-colors ${language === 'kn' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`} onClick={() => setLanguage('kn')}>ಕನ್ನಡ</button>
            </div>
            <SignOutButton>
              <Button variant="ghost" size="sm" className="text-slate-500 hover:text-slate-800 hover:bg-slate-100/60 transition-colors">
                <LogOut className="w-4 h-4 mr-2" /> {t("logout")}
              </Button>
            </SignOutButton>
          </div>
        </div>
      </header>

      <main className="flex-1 p-4 md:p-8 max-w-5xl mx-auto w-full space-y-6">
        <Card className="bg-gradient-to-br from-purple-600 via-purple-700 to-indigo-800 text-white shadow-xl overflow-hidden relative border-none rounded-3xl">
          <div className="absolute -right-10 -top-10 w-44 h-44 bg-white/10 rounded-full blur-3xl" />
          <div className="absolute -left-10 -bottom-10 w-44 h-44 bg-white/10 rounded-full blur-3xl" />
          <CardContent className="p-8 relative z-10">
            <p className="text-purple-100/90 font-semibold tracking-wide uppercase text-xs mb-2">{t("totalSavingsBalance")}</p>
            <h1 className="text-4xl md:text-5xl font-extrabold mb-6 tracking-tight">
              ₹{(profile?.balance || 0).toLocaleString()}
            </h1>
            <div className="flex flex-wrap gap-4">
              <Dialog open={isLoanOpen} onOpenChange={setIsLoanOpen}>
                <DialogTrigger render={
                  <Button className="bg-white text-purple-700 hover:bg-slate-50 border-none shadow-md font-bold px-6 py-2.5 h-12 rounded-xl transition-all duration-200" disabled={!!pendingLoan || !!activeLoan}>
                    {pendingLoan ? t("loanPending") : t("applyForLoan")}
                  </Button>
                } />
                <DialogContent className="rounded-2xl max-w-md w-[94%]">
                  <DialogHeader>
                    <DialogTitle className="text-xl font-bold text-slate-850">{t("applyForLoan")}</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleApplyLoan} className="space-y-4 pt-4">
                    <div className="space-y-2">
                      <Label className="text-slate-700 font-medium">{t("principal")}</Label>
                      <Input type="number" required min="1000" placeholder="e.g. 50000" value={loanPrincipal} onChange={e => setLoanPrincipal(e.target.value)} className="h-12 text-md rounded-xl" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-slate-700 font-medium">{t("duration")}</Label>
                      <Input type="number" required min="1" max="60" placeholder="e.g. 12" value={loanDuration} onChange={e => setLoanDuration(e.target.value)} className="h-12 text-md rounded-xl" />
                    </div>
                    <div className="bg-slate-50 p-4 rounded-xl text-sm text-slate-600 border border-slate-100 leading-relaxed">{t("loanDetails")}</div>
                    <Button type="submit" className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold h-12 text-md rounded-xl transition-all duration-200" disabled={isSubmitting}>
                      {isSubmitting ? "..." : t("submitApplication")}
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="border-slate-200/80 rounded-2xl bg-white shadow-sm hover:shadow-md transition-shadow duration-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-orange-650" />
                {t("loansEmi")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {activeLoan ? (
                <div className="space-y-4">
                  <div className="flex justify-between items-center p-4 bg-orange-50/70 border border-orange-100 rounded-2xl">
                    <div>
                      <p className="text-xs text-slate-500 font-medium tracking-wide uppercase">Remaining Balance</p>
                      <p className="font-extrabold text-2xl text-slate-900 mt-1">₹{activeLoan.balanceRemaining.toLocaleString()}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-slate-500 font-medium tracking-wide uppercase">{t("calculatedEmi")}</p>
                      <p className="font-extrabold text-2xl text-orange-600 mt-1">₹{activeLoan.emiAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                    </div>
                  </div>
                  <div className="text-xs text-slate-400 bg-slate-50 p-3 rounded-xl">
                    Pay standard daily EMI or standard weekly EMI installments when your local collection agent visits you.
                  </div>
                </div>
              ) : pendingLoan ? (
                <div className="text-center py-10 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200 text-slate-500">
                  <p className="font-semibold text-orange-653 text-md">{t("loanPending")}</p>
                  <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">Requested: ₹{pendingLoan.principal.toLocaleString()} for {pendingLoan.durationMonths} months.</p>
                </div>
              ) : (
                <div className="text-center py-10 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200 text-slate-400">
                  No active/pending loans found.
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-slate-200/80 rounded-2xl bg-white shadow-sm hover:shadow-md transition-shadow duration-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <History className="w-5 h-5 text-slate-500" />
                {t("collectionHistory")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {collections.length === 0 ? (
                <div className="text-center py-10 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200 text-slate-400">
                  No recent collections recorded.
                </div>
              ) : (
                <div className="space-y-3.5">
                  {collections.sort((a, b) => {
                    const dA = (a.timestamp as any)?.toDate?.() || new Date(a.timestamp);
                    const dB = (b.timestamp as any)?.toDate?.() || new Date(b.timestamp);
                    return dB.valueOf() - dA.valueOf();
                  }).slice(0, 5).map(col => {
                    const d = (col.timestamp as any)?.toDate?.() || new Date(col.timestamp);
                    return (
                      <div key={col.id} className="flex justify-between items-center bg-slate-50 p-3 rounded-xl hover:bg-slate-100/50 transition-colors">
                        <div>
                          <p className="font-bold text-slate-800 text-sm">Daily Deposit</p>
                          <p className="text-xs text-slate-400 mt-0.5">{d ? format(d, 'MMM d • h:mm a') : 'N/A'}</p>
                        </div>
                        <div className="font-extrabold text-emerald-600 text-md bg-emerald-50 px-3 py-1 rounded-full">+₹{col.amount}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
