import { motion } from "framer-motion";
import { Building2, Users, Wallet, ArrowRight, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

const roles = [
  {
    id: "owner",
    title: "Owner",
    subtitle: "Organization Management Portal",
    description:
      "Manage pigmy collectors, customers, savings collections, analytics, and organization operations from the owner dashboard.",
    icon: Building2,
    gradient: "from-sky-500 to-blue-400",
    bg: "bg-sky-50",
    iconColor: "text-sky-600",
    border: "border-sky-200 hover:border-sky-300",
    btnGradient: "from-sky-500 to-blue-500",
  },
  {
    id: "pigmy_collector",
    title: "Pigmy Collector",
    subtitle: "Field Collection Workspace",
    description:
      "Track customer collections, daily visits, pending payments, and assigned collection areas from your agent portal.",
    icon: Users,
    gradient: "from-indigo-500 to-violet-400",
    bg: "bg-indigo-50",
    iconColor: "text-indigo-600",
    border: "border-indigo-200 hover:border-indigo-300",
    btnGradient: "from-indigo-500 to-violet-500",
  },
  {
    id: "customer",
    title: "Customer",
    subtitle: "Customer Savings Portal",
    description:
      "Track your savings history, payment records, daily collection activity, and financial progress in one place.",
    icon: Wallet,
    gradient: "from-violet-500 to-fuchsia-400",
    bg: "bg-violet-50",
    iconColor: "text-violet-600",
    border: "border-violet-200 hover:border-violet-300",
    btnGradient: "from-violet-500 to-fuchsia-500",
  },
];

export default function WorkspaceSelectionPage() {
  const navigate = useNavigate();

  const handleSelectRole = (roleId: string) => {
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem("preferredLoginRole", roleId);
        navigate("/sign-in");
      }
    } catch (error) {
      console.error("Error selecting role:", error);
      navigate("/sign-in");
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 relative overflow-hidden">
      {/* Background blobs */}
      <div className="pointer-events-none absolute inset-0 z-0">
        <div className="absolute left-[-100px] top-[-50px] h-64 w-64 rounded-full bg-sky-200/40 blur-[120px]" />
        <div className="absolute right-[-80px] bottom-[-50px] h-72 w-72 rounded-full bg-violet-200/40 blur-[130px]" />
      </div>

      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-4 py-12 sm:px-6">
        {/* Back to landing */}
        <div className="w-full max-w-4xl mb-8">
          <button
            onClick={() => navigate("/")}
            className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-800 transition"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to FundCircle
          </button>
        </div>

        {/* Header */}
        <div className="w-full max-w-4xl text-center mb-10">
          <div className="inline-flex items-center gap-2.5 mb-6">
            <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-sky-500 to-violet-500 flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-sky-200/50">
              FC
            </div>
            <span className="text-xl font-bold text-slate-900">FundCircle</span>
          </div>
          <h1 className="text-4xl font-bold text-slate-950 mb-3">
            Choose Your Workspace
          </h1>
          <p className="text-lg text-slate-600">
            Select the workspace role you want to sign in to.
          </p>
        </div>

        {/* Role Cards */}
        <div className="w-full max-w-4xl grid gap-5 md:grid-cols-3 mb-8">
          {roles.map((role, index) => (
            <motion.div
              key={role.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1, duration: 0.5 }}
              className={`relative overflow-hidden rounded-[2rem] border bg-white p-6 shadow-lg transition-all cursor-pointer group ${role.border}`}
              onClick={() => handleSelectRole(role.id)}
            >
              <div className={`absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r ${role.gradient}`} />

              <div className="flex flex-col gap-5 h-full">
                <div className={`inline-flex h-14 w-14 items-center justify-center rounded-2xl ${role.bg} ${role.iconColor} shadow-sm`}>
                  <role.icon className="h-7 w-7" />
                </div>

                <div className="flex-1 space-y-2">
                  <h2 className="text-xl font-bold text-slate-900">{role.title}</h2>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                    {role.subtitle}
                  </p>
                  <p className="text-sm leading-6 text-slate-600">{role.description}</p>
                </div>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelectRole(role.id);
                  }}
                  className={`mt-auto inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r ${role.btnGradient} px-4 py-3 text-sm font-semibold text-white shadow-md transition hover:brightness-110`}
                >
                  Continue to Sign In
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Info Box */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="w-full max-w-4xl rounded-2xl border border-slate-200 bg-white p-5 text-center shadow-sm"
        >
          <p className="text-sm text-slate-600">
            New to FundCircle?{" "}
            <button
              onClick={() => navigate("/sign-up")}
              className="font-semibold text-sky-600 hover:text-sky-700 transition"
            >
              Register your organization
            </button>{" "}
            to get started. Only organization owners can register publicly.
          </p>
        </motion.div>
      </div>
    </div>
  );
}
