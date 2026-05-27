import { Link, useNavigate, useLocation } from "react-router-dom";
import { useUser } from "@clerk/clerk-react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Menu, X } from "lucide-react";
import { useState, useEffect } from "react";

const NAV_LINKS = [
  { label: "Features", href: "/features" },
  { label: "Workflow", href: "/#workflow" },
  { label: "Pricing", href: "/pricing" },
  { label: "Contact", href: "/support" },
];

const FOOTER_PRODUCT = [
  { label: "Features", href: "/features" },
  { label: "Pricing", href: "/pricing" },
  { label: "Analytics", href: "/analytics" },
  { label: "Reports", href: "/reports" },
];

const FOOTER_PLATFORM = [
  { label: "Clerk Auth", href: "/platform/clerk-auth" },
  { label: "Firestore", href: "/platform/firestore" },
  { label: "Multi-Tenant", href: "/platform/multi-tenant" },
  { label: "Role Access", href: "/platform/role-access" },
];

const FOOTER_COMPANY = [
  { label: "About", href: "/about" },
  { label: "Blog", href: "/blog" },
  { label: "Careers", href: "/careers" },
  { label: "Support", href: "/support" },
];

function useScrolled(threshold = 20) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > threshold);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, [threshold]);
  return scrolled;
}

function isNavLinkActive(href: string, pathname: string): boolean {
  if (href === "/#workflow") return false;
  if (href === "/support") return pathname === "/support";
  return pathname === href;
}

function NavLinkItem({
  link,
  pathname,
  scrolled,
  onClick,
}: {
  link: { label: string; href: string };
  pathname: string;
  scrolled: boolean;
  onClick?: () => void;
}) {
  const navigate = useNavigate();
  const active = isNavLinkActive(link.href, pathname);

  const handleClick = (e: React.MouseEvent) => {
    if (link.href === "/#workflow") {
      e.preventDefault();
      if (pathname !== "/") {
        navigate("/");
        setTimeout(() => {
          document.getElementById("workflow")?.scrollIntoView({ behavior: "smooth" });
        }, 350);
      } else {
        document.getElementById("workflow")?.scrollIntoView({ behavior: "smooth" });
      }
      onClick?.();
      return;
    }
    onClick?.();
  };

  return (
    <Link
      to={link.href === "/#workflow" ? "/" : link.href}
      onClick={handleClick}
      className={`rounded-lg px-3.5 py-2 text-sm font-medium transition-all duration-200 ${
        active
          ? scrolled
            ? "bg-white/15 text-white"
            : "bg-sky-50 text-sky-600"
          : scrolled
          ? "text-slate-300 hover:bg-white/10 hover:text-white"
          : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
      }`}
    >
      {link.label}
    </Link>
  );
}

export function PublicNavbar() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { isSignedIn } = useUser();
  const [mobileOpen, setMobileOpen] = useState(false);
  const scrolled = useScrolled(20);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 w-full transition-all duration-300 ${
        scrolled
          ? "bg-slate-900/80 backdrop-blur-xl border-b border-white/10 shadow-lg shadow-black/20"
          : "bg-white/90 backdrop-blur-xl border-b border-slate-200/80"
      }`}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
        <Link to="/" className="flex items-center gap-3 focus:outline-none">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-sky-500 to-violet-500 text-white font-bold text-sm shadow-md shadow-sky-300/30 shrink-0">
            FC
          </div>
          <div className="hidden sm:block">
            <p className={`text-[10px] uppercase tracking-[0.3em] transition-colors duration-300 ${scrolled ? "text-slate-400" : "text-slate-400"}`}>
              FundCircle
            </p>
            <p className={`text-sm font-bold leading-tight transition-colors duration-300 ${scrolled ? "text-white" : "text-slate-900"}`}>
              Enterprise Collection Platform
            </p>
          </div>
        </Link>

        <nav className="hidden md:flex items-center gap-1">
          {NAV_LINKS.map((link) => (
            <NavLinkItem
              key={link.href}
              link={link}
              pathname={pathname}
              scrolled={scrolled}
            />
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {isSignedIn ? (
            <button
              onClick={() => navigate("/router")}
              className="rounded-xl bg-gradient-to-r from-sky-500 to-violet-500 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-sky-300/30 transition hover:brightness-110"
            >
              Dashboard →
            </button>
          ) : (
            <>
              <button
                onClick={() => navigate("/workspace-selection")}
                className={`hidden sm:block rounded-xl border px-4 py-2 text-sm font-semibold transition-all duration-200 ${
                  scrolled
                    ? "border-white/20 text-slate-200 hover:bg-white/10"
                    : "border-slate-200 text-slate-700 hover:bg-slate-50"
                }`}
              >
                Sign In
              </button>
              <button
                onClick={() => navigate("/sign-up")}
                className="rounded-xl bg-gradient-to-r from-sky-500 to-violet-500 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-sky-300/30 transition hover:brightness-110 flex items-center gap-1.5"
              >
                Get Started <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </>
          )}
          <button
            onClick={() => setMobileOpen((v) => !v)}
            className={`md:hidden rounded-lg p-2 transition-colors duration-200 ${
              scrolled ? "text-slate-300 hover:bg-white/10" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className={`md:hidden overflow-hidden border-t ${
              scrolled ? "bg-slate-900/95 border-white/10" : "bg-white border-slate-100"
            }`}
          >
            <nav className="flex flex-col gap-1 px-4 pb-4 pt-2">
              {NAV_LINKS.map((link) => (
                <NavLinkItem
                  key={link.href}
                  link={link}
                  pathname={pathname}
                  scrolled={scrolled}
                  onClick={() => setMobileOpen(false)}
                />
              ))}
              {!isSignedIn && (
                <Link
                  to="/workspace-selection"
                  onClick={() => setMobileOpen(false)}
                  className={`mt-2 rounded-lg border px-3.5 py-2.5 text-sm font-semibold text-center transition-colors ${
                    scrolled
                      ? "border-white/20 text-slate-200 hover:bg-white/10"
                      : "border-slate-200 text-slate-700"
                  }`}
                >
                  Sign In
                </Link>
              )}
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer className="border-t border-white/10 bg-slate-900">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid gap-10 sm:grid-cols-2 md:grid-cols-5">
          <div className="sm:col-span-2 md:col-span-1">
            <Link to="/" className="flex items-center gap-2 mb-4">
              <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-sky-500 to-violet-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
                FC
              </div>
              <span className="font-bold text-white">FundCircle</span>
            </Link>
            <p className="text-sm leading-6 text-slate-400">
              Enterprise pigmy collection platform built on Clerk and Firestore.
            </p>
          </div>

          <div>
            <h3 className="text-xs font-bold uppercase tracking-[0.3em] text-slate-300 mb-4">Product</h3>
            <ul className="space-y-3">
              {FOOTER_PRODUCT.map((l) => (
                <li key={l.href}>
                  <Link
                    to={l.href}
                    className="text-sm text-slate-400 hover:text-white transition-colors duration-150"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-xs font-bold uppercase tracking-[0.3em] text-slate-300 mb-4">Platform</h3>
            <ul className="space-y-3">
              {FOOTER_PLATFORM.map((l) => (
                <li key={l.href}>
                  <Link
                    to={l.href}
                    className="text-sm text-slate-400 hover:text-white transition-colors duration-150"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-xs font-bold uppercase tracking-[0.3em] text-slate-300 mb-4">Company</h3>
            <ul className="space-y-3">
              {FOOTER_COMPANY.map((l) => (
                <li key={l.href}>
                  <Link
                    to={l.href}
                    className="text-sm text-slate-400 hover:text-white transition-colors duration-150"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-xs font-bold uppercase tracking-[0.3em] text-slate-300 mb-4">Legal</h3>
            <ul className="space-y-3">
              <li>
                <Link
                  to="/privacy-policy"
                  className="text-sm text-slate-400 hover:text-white transition-colors duration-150"
                >
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link
                  to="/terms-of-service"
                  className="text-sm text-slate-400 hover:text-white transition-colors duration-150"
                >
                  Terms of Service
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 border-t border-white/10 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-slate-500">© 2026 FundCircle. All rights reserved.</p>
          <div className="flex gap-6 text-xs text-slate-500">
            <Link to="/privacy-policy" className="hover:text-slate-300 transition-colors">
              Privacy Policy
            </Link>
            <Link to="/terms-of-service" className="hover:text-slate-300 transition-colors">
              Terms of Service
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

interface PublicLayoutProps {
  children: React.ReactNode;
  className?: string;
}

export default function PublicLayout({ children, className = "" }: PublicLayoutProps) {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <PublicNavbar />
      <motion.main
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className={`flex-1 pt-[73px] ${className}`}
      >
        {children}
      </motion.main>
      <PublicFooter />
    </div>
  );
}
