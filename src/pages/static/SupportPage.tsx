import { motion } from "framer-motion";
import { MessageCircle, Mail, Book, Video, ChevronDown, ChevronUp, Zap, Shield, Users } from "lucide-react";
import { Link } from "react-router-dom";
import PublicLayout from "@/components/PublicLayout";
import { useState } from "react";

const faqs = [
  {
    q: "How do I add a new Pigmy Collector to my organization?",
    a: "Go to your Owner Dashboard → Agents tab → click 'Add Agent'. Fill in their details and a Clerk account will be created instantly. Share the generated credentials with them to log in.",
  },
  {
    q: "Can I use FundCircle on mobile?",
    a: "Yes! FundCircle is fully responsive and optimized for mobile browsers. Agents can record collections and view their route from any smartphone without installing an app.",
  },
  {
    q: "How does billing work?",
    a: "FundCircle uses a simple monthly or yearly subscription billed to your organization. You can change plans or cancel at any time from the Billing section in your Owner Dashboard.",
  },
  {
    q: "What happens to my data if I cancel?",
    a: "Your data remains accessible for 30 days after cancellation. During this period you can export all collections, customer records, and reports in CSV or Excel format.",
  },
  {
    q: "How do I export my collection data?",
    a: "From the Owner Dashboard, go to Reports → select a date range and report type → click Export. Reports are available in CSV and Excel formats.",
  },
  {
    q: "Is there a limit on the number of collections per month?",
    a: "No. All plans include unlimited collections and transactions. Plan limits apply only to the number of agents and customers in your organization.",
  },
  {
    q: "How do I reset a collector's PIN or password?",
    a: "Password resets are handled by Clerk's secure authentication system. Your collector can click 'Forgot password' on the sign-in page to reset via their registered email.",
  },
  {
    q: "Can multiple agents be assigned to the same customer?",
    a: "Currently each customer is assigned to one primary agent. Owners can reassign customers from the Customers tab in the Owner Dashboard.",
  },
];

const channels = [
  { icon: Mail, title: "Email Support", desc: "Send us a message and expect a reply within 24 hours on business days.", action: "support@fundcircle.in", href: "mailto:support@fundcircle.in", color: "sky" },
  { icon: MessageCircle, title: "Live Chat", desc: "Chat with our support team directly from your dashboard. Available 9am–6pm IST.", action: "Open live chat", href: "#", color: "violet" },
  { icon: Book, title: "Documentation", desc: "Browse our step-by-step guides for setup, configuration, and best practices.", action: "Read the docs", href: "#", color: "emerald" },
  { icon: Video, title: "Video Tutorials", desc: "Watch short walkthroughs for every major feature in FundCircle.", action: "Watch tutorials", href: "#", color: "amber" },
];

const colorMap: Record<string, string> = {
  sky: "bg-sky-50 text-sky-600",
  violet: "bg-violet-50 text-violet-600",
  emerald: "bg-emerald-50 text-emerald-600",
  amber: "bg-amber-50 text-amber-600",
};

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-4 text-left"
      >
        <span className="text-sm font-semibold text-slate-900 pr-4">{q}</span>
        {open ? <ChevronUp className="h-4 w-4 text-slate-400 shrink-0" /> : <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />}
      </button>
      {open && (
        <div className="border-t border-slate-100 px-5 py-4">
          <p className="text-sm text-slate-500 leading-relaxed">{a}</p>
        </div>
      )}
    </div>
  );
}

export default function SupportPage() {
  return (
    <PublicLayout>
      <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[400px]">
          <div className="absolute left-1/3 top-0 h-72 w-72 rounded-full bg-sky-100/50 blur-[100px]" />
          <div className="absolute right-1/4 top-10 h-64 w-64 rounded-full bg-emerald-100/40 blur-[90px]" />
        </div>
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">

          <section className="py-20 text-center">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-sky-500 mb-4">Support Center</p>
              <h1 className="text-4xl font-extrabold text-slate-900 sm:text-5xl mb-4">We're here to help</h1>
              <p className="mx-auto max-w-xl text-lg text-slate-500">
                Get answers to common questions or reach our support team directly.
              </p>
            </motion.div>
          </section>

          <section className="mb-16">
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {channels.map((c, i) => (
                <motion.div
                  key={c.title}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.07 }}
                  className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm text-center"
                >
                  <div className={`mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl ${colorMap[c.color]}`}>
                    <c.icon className="h-6 w-6" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-900 mb-2">{c.title}</h3>
                  <p className="text-xs text-slate-500 leading-5 mb-4">{c.desc}</p>
                  <a href={c.href} className="text-xs font-bold text-sky-600 hover:underline">{c.action} →</a>
                </motion.div>
              ))}
            </div>
          </section>

          <section className="mb-24">
            <div className="mb-8 text-center">
              <h2 className="text-2xl font-bold text-slate-900 mb-2">Frequently asked questions</h2>
              <p className="text-slate-500 text-sm">Quick answers to the most common questions.</p>
            </div>
            <div className="mx-auto max-w-3xl space-y-3">
              {faqs.map((faq, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.04 }}
                >
                  <FAQItem q={faq.q} a={faq.a} />
                </motion.div>
              ))}
            </div>

            <div className="mt-12 mx-auto max-w-3xl rounded-3xl border border-slate-200 bg-gradient-to-br from-sky-50 to-violet-50 p-8 text-center">
              <h3 className="text-lg font-bold text-slate-900 mb-2">Still have questions?</h3>
              <p className="text-sm text-slate-500 mb-5">Our team responds to every email within 24 hours.</p>
              <a href="mailto:support@fundcircle.in" className="inline-flex items-center gap-2 rounded-xl bg-sky-500 px-6 py-3 text-sm font-bold text-white hover:bg-sky-600 transition">
                <Mail className="h-4 w-4" /> Email support
              </a>
            </div>
          </section>
        </div>
      </div>
    </PublicLayout>
  );
}
