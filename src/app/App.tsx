import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@supabase/supabase-js";
import { projectId, publicAnonKey } from "../../utils/supabase/info";
import {
  Bell, BookOpen, CheckCircle, Clock, FileText, Home, LogOut,
  Plus, Upload, Users, X, AlertCircle, Download, ArrowRight,
  GraduationCap, Shield, UserCheck, BarChart2, Menu, BookMarked,
  TrendingUp, Inbox, MessageSquare, File, RefreshCw,
} from "lucide-react";

// ─── Supabase client (singleton — avoids duplicate instances on HMR) ─────────
const SUPA_URL = `https://${projectId}.supabase.co`;
type SB = ReturnType<typeof createClient>;
declare global { interface Window { __supabase?: SB } }
const supabase: SB = window.__supabase ?? (window.__supabase = createClient(SUPA_URL, publicAnonKey));

// ─── Types ───────────────────────────────────────────────────────
type Role = "student" | "supervisor" | "admin";

interface Profile {
  id: string;
  full_name: string;
  role: Role;
  supervisor_id: string | null;
}

interface Project {
  id: string;
  student_id: string;
  supervisor_id: string | null;
  title: string;
  status: "proposed" | "approved" | "rejected";
  created_at: string;
}

interface Submission {
  id: string;
  project_id: string;
  student_id: string;
  supervisor_id: string | null;
  chapter_title: string;
  file_path: string | null;
  status: "pending" | "approved" | "rejected";
  submission_date: string;
  profiles?: { full_name: string };
  projects?: { title: string };
}

interface Feedback {
  id: string;
  submission_id: string;
  supervisor_id: string;
  comments: string;
  feedback_date: string;
  profiles?: { full_name: string };
}

interface Notification {
  id: string;
  user_id: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

interface Guide {
  id: string;
  supervisor_id: string;
  student_id: string | null;
  title: string;
  description: string | null;
  doc_type: "guide" | "demo" | "template" | "other";
  file_path: string | null;
  url: string | null;
  created_at: string;
}

// ─── Shared helpers ───────────────────────────────────────────────
async function notify(userId: string, message: string) {
  await supabase.from("notifications").insert({ user_id: userId, message });
}

function initials(name: string) {
  return name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
  });
}

// ─── Shared components ───────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const isRole = ["student", "supervisor", "admin"].includes(status);
  const cfg: Record<string, string> = {
    pending:    "bg-amber-50  text-amber-700  ring-amber-200",
    proposed:   "bg-amber-50  text-amber-700  ring-amber-200",
    approved:   "bg-emerald-50 text-emerald-700 ring-emerald-200",
    rejected:   "bg-rose-50   text-rose-700   ring-rose-200",
    student:    "bg-indigo-50 text-indigo-700 ring-indigo-200",
    supervisor: "bg-violet-50 text-violet-700 ring-violet-200",
    admin:      "bg-slate-100 text-slate-600  ring-slate-200",
  };
  const dot: Record<string, string> = {
    pending: "bg-amber-400", proposed: "bg-amber-400",
    approved: "bg-emerald-500", rejected: "bg-rose-500",
  };
  const cls = cfg[status] ?? "bg-gray-50 text-gray-600 ring-gray-200";
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ring-1 ${cls}`}>
      {!isRole && dot[status] && (
        <span className={`w-1.5 h-1.5 rounded-full ${dot[status]}`} />
      )}
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function Spinner({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const s = { sm: "w-4 h-4 border", md: "w-6 h-6 border-2", lg: "w-10 h-10 border-2" }[size];
  return <div className={`${s} border-indigo-200 border-t-indigo-600 rounded-full animate-spin`} />;
}

function EmptyState({ icon: Icon, title, description, action }: {
  icon: React.ElementType;
  title: string;
  description: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-14 h-14 bg-indigo-50 rounded-2xl ring-1 ring-indigo-100 flex items-center justify-center mb-4">
        <Icon className="w-7 h-7 text-indigo-400" strokeWidth={1.5} />
      </div>
      <p className="text-sm font-semibold text-gray-700 mb-1">{title}</p>
      <p className="text-xs text-gray-400 max-w-48">{description}</p>
      {action && (
        <button
          onClick={action.onClick}
          className="mt-5 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

function NotificationBell({ userId }: { userId: string }) {
  const [notes, setNotes] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(15);
    if (data) setNotes(data);
  }, [userId]);

  useEffect(() => {
    load();
    const ch = supabase
      .channel(`notif-${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId, load]);

  const unread = notes.filter((n) => !n.is_read).length;

  const markAll = async () => {
    await supabase.from("notifications").update({ is_read: true }).eq("user_id", userId).eq("is_read", false);
    setNotes((prev) => prev.map((n) => ({ ...n, is_read: true })));
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative w-9 h-9 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
      >
        <Bell className="w-4.5 h-4.5 w-[18px] h-[18px]" />
        {unread > 0 && (
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-rose-500 rounded-full" />
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-11 w-80 bg-white rounded-xl shadow-xl ring-1 ring-black/5 z-50 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <p className="text-sm font-semibold text-gray-800">
                Notifications {unread > 0 && <span className="ml-1 text-xs text-white bg-indigo-600 px-1.5 py-0.5 rounded-full">{unread}</span>}
              </p>
              {unread > 0 && (
                <button onClick={markAll} className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">
                  Mark all read
                </button>
              )}
            </div>
            <div className="max-h-72 overflow-y-auto">
              {notes.length === 0 ? (
                <p className="text-center text-gray-400 text-sm py-10">No notifications yet</p>
              ) : (
                notes.map((n) => (
                  <div key={n.id} className={`px-4 py-3 border-b border-gray-50 ${!n.is_read ? "bg-indigo-50/40" : ""}`}>
                    <p className="text-sm text-gray-700 leading-snug">{n.message}</p>
                    <p className="text-[11px] text-gray-400 mt-1">{fmtDate(n.created_at)}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Dashboard shell ──────────────────────────────────────────────
interface NavItem { id: string; label: string; icon: React.ElementType }

function DashboardShell({
  profile, navItems, activeView, setActiveView, children,
}: {
  profile: Profile;
  navItems: NavItem[];
  activeView: string;
  setActiveView: (v: string) => void;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = () => supabase.auth.signOut();

  const roleAccent = {
    student: "from-indigo-950 via-indigo-900 to-indigo-800",
    supervisor: "from-violet-950 via-violet-900 to-violet-800",
    admin: "from-slate-900 via-slate-800 to-slate-700",
  }[profile.role];

  const sidebar = (
    <div className={`h-full flex flex-col bg-gradient-to-b ${roleAccent} text-white select-none`}>
      {/* Brand */}
      <div className="px-5 pt-6 pb-5 border-b border-white/10">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-white/15 rounded-xl flex items-center justify-center">
            <GraduationCap className="w-4.5 h-4.5 w-[18px] h-[18px]" />
          </div>
          <div>
            <p className="font-bold text-sm tracking-tight leading-none">ProjecTrack</p>
            <p className="text-white/45 text-[11px] mt-0.5 capitalize">{profile.role} portal</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {navItems.map(({ id, label, icon: Icon }) => {
          const active = activeView === id;
          return (
            <button
              key={id}
              onClick={() => { setActiveView(id); setMobileOpen(false); }}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all ${
                active ? "bg-white/18 text-white" : "text-white/55 hover:bg-white/10 hover:text-white"
              }`}
            >
              <Icon className="w-4 h-4 flex-shrink-0" strokeWidth={active ? 2 : 1.75} />
              {label}
            </button>
          );
        })}
      </nav>

      {/* User */}
      <div className="px-3 pb-4 border-t border-white/10 pt-3">
        <div className="flex items-center gap-2.5 px-3 py-2 mb-1">
          <div className="w-7 h-7 bg-white/20 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0">
            {initials(profile.full_name)}
          </div>
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-white truncate">{profile.full_name}</p>
            <p className="text-[11px] text-white/45 capitalize">{profile.role}</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] text-white/50 hover:bg-white/10 hover:text-white transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-[#f5f5f9] overflow-hidden font-[Inter,system-ui,sans-serif]">
      {/* Desktop sidebar */}
      <div className="hidden lg:flex w-56 flex-shrink-0 h-screen sticky top-0">{sidebar}</div>

      {/* Mobile sidebar */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="w-56 flex-shrink-0">{sidebar}</div>
          <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Topbar */}
        <header className="h-14 bg-white border-b border-black/[0.06] flex items-center justify-between px-4 lg:px-6 flex-shrink-0">
          <div className="flex items-center gap-2">
            <button className="lg:hidden p-1.5 rounded-lg text-gray-500 hover:bg-gray-100" onClick={() => setMobileOpen(true)}>
              <Menu className="w-5 h-5" />
            </button>
            <p className="text-sm font-semibold text-gray-800">
              {navItems.find((n) => n.id === activeView)?.label}
            </p>
          </div>
          <NotificationBell userId={profile.id} />
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}

// ─── Stat card ────────────────────────────────────────────────────
function StatCard({ label, value, icon: Icon, color }: {
  label: string; value: string | number; icon: React.ElementType; color: string;
}) {
  return (
    <div className="bg-white rounded-xl p-4 border border-black/[0.06] shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-gray-500 font-medium">{label}</p>
        <Icon className={`w-4 h-4 ${color}`} strokeWidth={1.5} />
      </div>
      <p className="text-[22px] font-bold text-gray-900 leading-none">{value}</p>
    </div>
  );
}

// ─── Input / Textarea ─────────────────────────────────────────────
const inputCls = "w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-800 placeholder-gray-400 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-shadow";
const labelCls = "block text-sm font-medium text-gray-700 mb-1.5";

// ═══════════════════════════════════════════════════════════════
// LANDING PAGE
// ═══════════════════════════════════════════════════════════════
function LandingPage({ onLogin }: { onLogin: () => void }) {
  return (
    <div className="min-h-screen bg-slate-950 text-white font-[Inter,system-ui,sans-serif]">
      {/* Nav */}
      <nav className="border-b border-white/5 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-indigo-500 rounded-lg flex items-center justify-center">
              <GraduationCap className="w-4 h-4" />
            </div>
            <span className="font-bold text-sm tracking-tight">ProjecTrack</span>
          </div>
          <button
            onClick={onLogin}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Sign in
          </button>
        </div>
      </nav>

      {/* Hero */}
      <div className="max-w-6xl mx-auto px-6 pt-24 pb-16">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-medium mb-6">
          <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full" />
          Final-Year Project Management System
        </div>
        <h1 className="text-5xl sm:text-6xl font-bold leading-[1.08] tracking-tight mb-6">
          Supervise. Submit.<br />
          <span className="text-indigo-400">Succeed.</span>
        </h1>
        <p className="text-slate-400 text-lg max-w-xl mb-10 leading-relaxed">
          A unified platform for students to submit chapters and receive structured feedback,
          and for supervisors to manage their cohort — end to end.
        </p>
        <button
          onClick={onLogin}
          className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl transition-colors"
        >
          Get started <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      {/* Role cards */}
      <div className="max-w-6xl mx-auto px-6 pb-24">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            {
              icon: BookOpen, role: "Student", badge: "bg-indigo-500/15 text-indigo-300",
              desc: "Submit your project topic, upload chapters for review, and track every supervisor response in one place.",
              features: ["Project topic submission", "Chapter file uploads (PDF/DOCX)", "Real-time status tracking", "Supervisor feedback inbox", "Push notifications"],
            },
            {
              icon: UserCheck, role: "Supervisor", badge: "bg-violet-500/15 text-violet-300",
              desc: "Manage your assigned students, review submitted work, give written feedback, and track each student's progress.",
              features: ["Student cohort overview", "Pending review queue", "Approve / reject submissions", "Written feedback with timestamps", "Per-student progress report"],
            },
            {
              icon: Shield, role: "Administrator", badge: "bg-slate-500/15 text-slate-300",
              desc: "Oversee the entire institution — manage all accounts, assign supervisors, and view system-wide analytics.",
              features: ["Full user management", "Supervisor assignment tool", "System-wide submission stats", "Workload distribution view"],
            },
          ].map(({ icon: Icon, role, badge, desc, features }) => (
            <div key={role} className="bg-white/5 border border-white/10 rounded-2xl p-6 hover:bg-white/[0.07] transition-colors">
              <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${badge} mb-4`}>
                <Icon className="w-3.5 h-3.5" />
                {role}
              </div>
              <p className="text-slate-300 text-sm leading-relaxed mb-4">{desc}</p>
              <ul className="space-y-1.5">
                {features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-xs text-slate-400">
                    <CheckCircle className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// AUTH PAGE
// ═══════════════════════════════════════════════════════════════
function AuthPage() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<Role>("student");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const reset = (m: "login" | "signup") => { setMode(m); setError(""); setSuccess(""); };

  const fmtErr = (err: any): string => {
    if (!err) return "An unknown error occurred.";
    if (typeof err === "string") return err;
    if (err.message && err.message !== "{}") return err.message;
    if (err.error_description) return err.error_description;
    if (err.msg) return err.msg;
    const s = JSON.stringify(err);
    return s === "{}" ? "An error occurred. Check your email/password and try again." : s;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError("");
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err) setError(fmtErr(err));
    setLoading(false);
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError("");

    const { data, error: signupErr } = await supabase.auth.signUp({
      email, password,
      options: { data: { full_name: fullName, role } },
    });

    if (signupErr) { setError(fmtErr(signupErr)); setLoading(false); return; }

    if (!data.user && !data.session) {
      // Email confirmation is enabled — user must confirm before signing in
      setSuccess("Check your email for a confirmation link, then sign in.");
      reset("login");
      setLoading(false);
      return;
    }

    if (data.user) {
      // Profile is created automatically by the handle_new_user trigger.
      // Poll briefly to confirm it exists before redirecting.
      let found = false;
      for (let i = 0; i < 8; i++) {
        await new Promise((r) => setTimeout(r, 600));
        const { data: p } = await supabase.from("profiles").select("id").eq("id", data.user.id).maybeSingle();
        if (p) { found = true; break; }
      }
      if (found) {
        setSuccess("Account created! Signing you in…");
        // onAuthStateChange fires and handles the redirect
      } else {
        setError("Account was created but the profile could not be set up. Make sure you have run the schema SQL (including the handle_new_user trigger) in your Supabase project.");
      }
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4 font-[Inter,system-ui,sans-serif]">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <GraduationCap className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-xl font-bold text-white">ProjecTrack</h1>
          <p className="text-slate-400 text-sm mt-1">University Project Management</p>
        </div>

        <div className="bg-slate-900 border border-slate-700/60 rounded-2xl p-7">
          {/* Tabs */}
          <div className="flex bg-slate-800/80 rounded-lg p-1 mb-6">
            {(["login", "signup"] as const).map((m) => (
              <button
                key={m}
                onClick={() => reset(m)}
                className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
                  mode === m ? "bg-white text-gray-900 shadow-sm" : "text-slate-400 hover:text-white"
                }`}
              >
                {m === "login" ? "Sign in" : "Create account"}
              </button>
            ))}
          </div>

          {success && (
            <div className="mb-4 p-3 bg-emerald-900/30 border border-emerald-700/40 rounded-lg">
              <p className="text-emerald-300 text-sm">{success}</p>
            </div>
          )}
          {error && (
            <div className="mb-4 p-3 bg-rose-900/30 border border-rose-700/40 rounded-lg flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
              <p className="text-rose-300 text-sm">{error}</p>
            </div>
          )}

          <form onSubmit={mode === "login" ? handleLogin : handleSignup} className="space-y-4">
            {mode === "signup" && (
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Full name</label>
                <input
                  type="text" value={fullName} onChange={(e) => setFullName(e.target.value)}
                  required placeholder="e.g. Amina Oduya"
                  className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2.5 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Email address</label>
              <input
                type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                required placeholder="you@university.edu"
                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2.5 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Password</label>
              <input
                type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                required placeholder="••••••••"
                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2.5 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>

            {mode === "signup" && (
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">I am a</label>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { v: "student" as Role, l: "Student", I: BookOpen },
                    { v: "supervisor" as Role, l: "Supervisor", I: UserCheck },
                    { v: "admin" as Role, l: "Admin", I: Shield },
                  ]).map(({ v, l, I }) => (
                    <button
                      type="button" key={v} onClick={() => setRole(v)}
                      className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border text-xs font-medium transition-all ${
                        role === v
                          ? "border-indigo-500 bg-indigo-500/12 text-indigo-300"
                          : "border-slate-600 text-slate-400 hover:border-slate-500 hover:text-white"
                      }`}
                    >
                      <I className="w-4 h-4" />
                      {l}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <button
              type="submit" disabled={loading}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 mt-1"
            >
              {loading && <Spinner size="sm" />}
              {mode === "login" ? "Sign in" : "Create account"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// STUDENT DASHBOARD
// ═══════════════════════════════════════════════════════════════
function StudentDashboard({ profile }: { profile: Profile }) {
  const [view, setView] = useState("overview");
  const [project, setProject] = useState<Project | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [feedbackMap, setFeedbackMap] = useState<Record<string, Feedback[]>>({});
  const [loading, setLoading] = useState(true);
  const [projectTitle, setProjectTitle] = useState("");
  const [chapterTitle, setChapterTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [formOk, setFormOk] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [studentGuides, setStudentGuides] = useState<Guide[]>([]);

  const navItems: NavItem[] = [
    { id: "overview",    label: "Overview",       icon: Home },
    { id: "project",     label: "My Project",      icon: BookMarked },
    { id: "submissions", label: "Submissions",     icon: FileText },
    { id: "upload",      label: "Upload Chapter",  icon: Upload },
    { id: "feedback",    label: "Feedback",        icon: MessageSquare },
    { id: "materials",   label: "Study Materials", icon: BookOpen },
  ];

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: proj }, { data: subs }, { data: guides }] = await Promise.all([
      supabase.from("projects").select("*").eq("student_id", profile.id).maybeSingle(),
      supabase.from("submissions").select("*").eq("student_id", profile.id).order("submission_date", { ascending: false }),
      supabase.from("guides").select("*").or(`student_id.eq.${profile.id},student_id.is.null`).order("created_at", { ascending: false }),
    ]);
    setProject(proj ?? null);
    const s = subs ?? [];
    setSubmissions(s);
    setStudentGuides(guides ?? []);
    if (s.length > 0) {
      const { data: fb } = await supabase
        .from("feedback").select("*, profiles(full_name)")
        .in("submission_id", s.map((x) => x.id));
      const map: Record<string, Feedback[]> = {};
      (fb ?? []).forEach((f: Feedback) => { (map[f.submission_id] ??= []).push(f); });
      setFeedbackMap(map);
    }
    setLoading(false);
  }, [profile.id]);

  useEffect(() => { load(); }, [load]);

  const submitProject = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true); setFormError("");
    const { error } = await supabase.from("projects").insert({
      student_id: profile.id, supervisor_id: profile.supervisor_id,
      title: projectTitle, status: "proposed",
    });
    if (error) { setFormError(error.message); }
    else {
      if (profile.supervisor_id)
        await notify(profile.supervisor_id, `${profile.full_name} proposed a project topic: "${projectTitle}"`);
      setProjectTitle(""); await load(); setView("project");
    }
    setSubmitting(false);
  };

  const uploadChapter = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(""); setFormOk("");
    if (!project) { setFormError("You need to submit a project topic first."); return; }
    if (project.status === "proposed") { setFormError("Your project topic is still awaiting supervisor approval. You can upload chapters once it is approved."); return; }
    if (project.status === "rejected") { setFormError("Your project topic was rejected. Please resubmit a revised topic and wait for approval before uploading chapters."); return; }
    if (!file) { setFormError("Please select a file."); return; }
    setSubmitting(true);

    const ext = file.name.split(".").pop();
    const path = `${profile.id}/${Date.now()}_${chapterTitle.replace(/\s+/g, "_")}.${ext}`;
    const { error: upErr } = await supabase.storage.from("submissions").upload(path, file);
    if (upErr) { setFormError("Upload failed: " + upErr.message); setSubmitting(false); return; }

    const { error: insErr } = await supabase.from("submissions").insert({
      project_id: project.id, student_id: profile.id,
      supervisor_id: profile.supervisor_id, chapter_title: chapterTitle,
      file_path: path, status: "pending",
    });
    if (insErr) { setFormError(insErr.message); }
    else {
      if (profile.supervisor_id)
        await notify(profile.supervisor_id, `${profile.full_name} uploaded a new chapter: "${chapterTitle}"`);
      setFormOk("Chapter uploaded successfully!");
      setChapterTitle(""); setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      await load();
    }
    setSubmitting(false);
  };

  const pending  = submissions.filter((s) => s.status === "pending").length;
  const approved = submissions.filter((s) => s.status === "approved").length;

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#f5f5f9]">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <DashboardShell profile={profile} navItems={navItems} activeView={view} setActiveView={setView}>
      {/* OVERVIEW */}
      {view === "overview" && (
        <div className="max-w-4xl">
          <p className="text-gray-500 text-sm mb-5">
            Welcome back, <span className="font-semibold text-gray-800">{profile.full_name.split(" ")[0]}</span>
          </p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
            <StatCard label="Project status"    value={project?.status ?? "None"} icon={BookMarked} color="text-indigo-600" />
            <StatCard label="Total submissions" value={submissions.length}         icon={FileText}   color="text-blue-600" />
            <StatCard label="Approved"          value={approved}                   icon={CheckCircle} color="text-emerald-600" />
            <StatCard label="Pending review"    value={pending}                    icon={Clock}      color="text-amber-600" />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-black/[0.06] shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm font-semibold text-gray-800">Recent Submissions</p>
                <button onClick={() => setView("submissions")} className="text-xs text-indigo-600 font-medium hover:text-indigo-800">View all</button>
              </div>
              {submissions.length === 0 ? (
                <EmptyState icon={FileText} title="No submissions yet" description="Upload your first chapter to begin." action={{ label: "Upload chapter", onClick: () => setView("upload") }} />
              ) : (
                <div className="space-y-0.5">
                  {submissions.slice(0, 4).map((s) => (
                    <div key={s.id} className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-7 h-7 bg-indigo-50 rounded-lg flex items-center justify-center flex-shrink-0">
                          <File className="w-3.5 h-3.5 text-indigo-500" />
                        </div>
                        <p className="text-sm text-gray-700 truncate">{s.chapter_title}</p>
                      </div>
                      <StatusBadge status={s.status} />
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="bg-white rounded-xl border border-black/[0.06] shadow-sm p-5">
              <p className="text-sm font-semibold text-gray-800 mb-4">Quick actions</p>
              <div className="space-y-2">
                {!project && (
                  <button onClick={() => setView("project")} className="w-full flex items-center gap-3 p-3 rounded-lg bg-indigo-50 hover:bg-indigo-100 transition-colors text-left">
                    <BookMarked className="w-4 h-4 text-indigo-600" />
                    <div>
                      <p className="text-sm font-medium text-indigo-800">Submit project topic</p>
                      <p className="text-xs text-indigo-500">Get your topic approved</p>
                    </div>
                  </button>
                )}
                <button onClick={() => setView("upload")} className="w-full flex items-center gap-3 p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors text-left">
                  <Upload className="w-4 h-4 text-gray-600" />
                  <div>
                    <p className="text-sm font-medium text-gray-800">Upload chapter</p>
                    <p className="text-xs text-gray-500">Submit work for review</p>
                  </div>
                </button>
                <button onClick={() => setView("feedback")} className="w-full flex items-center gap-3 p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors text-left">
                  <MessageSquare className="w-4 h-4 text-gray-600" />
                  <div>
                    <p className="text-sm font-medium text-gray-800">View feedback</p>
                    <p className="text-xs text-gray-500">{Object.values(feedbackMap).flat().length} item(s) received</p>
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MY PROJECT */}
      {view === "project" && (
        <div className="max-w-lg">
          {project ? (
            <div className="bg-white rounded-xl border border-black/[0.06] shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm font-semibold text-gray-800">Your project topic</p>
                <StatusBadge status={project.status} />
              </div>
              <p className="text-gray-900 font-semibold text-lg leading-snug mb-2">{project.title}</p>
              <p className="text-xs text-gray-400">Submitted {fmtDate(project.created_at)}</p>
              {project.status === "rejected" && (
                <div className="mt-4 space-y-3">
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-sm text-rose-700">
                    Your topic was rejected. Revise your title below and resubmit for approval.
                  </div>
                  {formError && <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-sm text-rose-700">{formError}</div>}
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      setSubmitting(true); setFormError("");
                      const { error } = await supabase.from("projects")
                        .update({ title: projectTitle, status: "proposed" })
                        .eq("id", project.id);
                      if (error) { setFormError(error.message); }
                      else {
                        if (profile.supervisor_id)
                          await notify(profile.supervisor_id, `${profile.full_name} resubmitted their project topic: "${projectTitle}"`);
                        setProjectTitle(""); await load();
                      }
                      setSubmitting(false);
                    }}
                    className="space-y-3"
                  >
                    <div>
                      <label className={labelCls}>Revised project title</label>
                      <input
                        type="text" value={projectTitle}
                        onChange={(e) => setProjectTitle(e.target.value)}
                        required placeholder="Enter your revised topic title…"
                        className={inputCls}
                      />
                    </div>
                    <button type="submit" disabled={submitting}
                      className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50 transition-colors">
                      {submitting && <Spinner size="sm" />} Resubmit for approval
                    </button>
                  </form>
                </div>
              )}
              {project.status === "approved" && (
                <div className="mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700">
                  Your project is approved. You can now upload chapters for review.
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-black/[0.06] shadow-sm p-6">
              <p className="font-semibold text-gray-800 mb-1">Submit Project Topic</p>
              <p className="text-sm text-gray-500 mb-5">Your supervisor will review and approve or suggest revisions.</p>
              {!profile.supervisor_id && (
                <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-amber-700">No supervisor assigned yet. Your topic will be visible once one is assigned by the administrator.</p>
                </div>
              )}
              {formError && <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-lg text-sm text-rose-700">{formError}</div>}
              <form onSubmit={submitProject} className="space-y-4">
                <div>
                  <label className={labelCls}>Project title</label>
                  <input
                    type="text" value={projectTitle} onChange={(e) => setProjectTitle(e.target.value)}
                    required placeholder="e.g. Deep Learning-Based Crop Disease Detection Using CNN"
                    className={inputCls}
                  />
                </div>
                <button type="submit" disabled={submitting} className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50 transition-colors">
                  {submitting && <Spinner size="sm" />} Submit for approval
                </button>
              </form>
            </div>
          )}
        </div>
      )}

      {/* SUBMISSIONS */}
      {view === "submissions" && (
        <div className="max-w-4xl">
          <div className="flex justify-end mb-4">
            <button onClick={() => setView("upload")} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors">
              <Plus className="w-4 h-4" /> Upload chapter
            </button>
          </div>
          {submissions.length === 0 ? (
            <div className="bg-white rounded-xl border border-black/[0.06] shadow-sm">
              <EmptyState icon={FileText} title="No chapters submitted yet" description="Start by uploading your first chapter for supervisor review." action={{ label: "Upload chapter", onClick: () => setView("upload") }} />
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-black/[0.06] shadow-sm overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    {["Chapter", "Submitted", "Status", "Feedback"].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {submissions.map((s) => (
                    <tr key={s.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 bg-indigo-50 rounded-lg flex items-center justify-center flex-shrink-0">
                            <FileText className="w-3.5 h-3.5 text-indigo-500" />
                          </div>
                          <span className="text-sm font-medium text-gray-800">{s.chapter_title}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">{fmtDate(s.submission_date)}</td>
                      <td className="px-4 py-3"><StatusBadge status={s.status} /></td>
                      <td className="px-4 py-3 text-sm text-gray-400">
                        {(feedbackMap[s.id] ?? []).length} comment{(feedbackMap[s.id] ?? []).length !== 1 ? "s" : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* UPLOAD */}
      {view === "upload" && (
        <div className="max-w-lg">
          <div className="bg-white rounded-xl border border-black/[0.06] shadow-sm p-6">
            <p className="font-semibold text-gray-800 mb-1">Upload Chapter</p>
            <p className="text-sm text-gray-500 mb-5">Attach a PDF or DOCX file. Your supervisor is notified automatically.</p>
            {!project && (
              <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-amber-700">You must submit a project topic first before uploading chapters.</p>
              </div>
            )}
            {project?.status === "proposed" && (
              <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
                <Clock className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-amber-700">Your project topic is <strong>pending approval</strong>. Chapter uploads are unlocked once your supervisor approves your topic.</p>
              </div>
            )}
            {project?.status === "rejected" && (
              <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-rose-700">Your project topic was <strong>rejected</strong>. Resubmit a revised topic from the <strong>My Project</strong> page and wait for approval.</p>
              </div>
            )}
            {formError && <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-lg text-sm text-rose-700">{formError}</div>}
            {formOk && <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700">{formOk}</div>}
            <form onSubmit={uploadChapter} className="space-y-4">
              <div>
                <label className={labelCls}>Chapter title</label>
                <input
                  type="text" value={chapterTitle} onChange={(e) => setChapterTitle(e.target.value)}
                  required placeholder="e.g. Chapter 3: Research Methodology"
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>File (PDF or DOCX, max 10 MB)</label>
                <div
                  onClick={() => fileRef.current?.click()}
                  className="border-2 border-dashed border-gray-200 hover:border-indigo-300 rounded-xl p-6 text-center cursor-pointer transition-colors"
                >
                  {file ? (
                    <div className="flex items-center justify-center gap-2">
                      <FileText className="w-5 h-5 text-indigo-500" />
                      <span className="text-sm text-gray-700 font-medium">{file.name}</span>
                      <button type="button" onClick={(ev) => { ev.stopPropagation(); setFile(null); }} className="text-gray-400 hover:text-gray-600 ml-1">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <Upload className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                      <p className="text-sm text-gray-500">Click to choose a file</p>
                      <p className="text-xs text-gray-400 mt-1">PDF or DOCX</p>
                    </>
                  )}
                </div>
                <input ref={fileRef} type="file" accept=".pdf,.docx,.doc" className="hidden"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              </div>
              <button
                type="submit" disabled={submitting || !project || project.status !== "approved"}
                className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {submitting && <Spinner size="sm" />} Upload chapter
              </button>
            </form>
          </div>
        </div>
      )}

      {/* FEEDBACK */}
      {view === "feedback" && (
        <div className="max-w-3xl space-y-4">
          {Object.values(feedbackMap).flat().length === 0 ? (
            <div className="bg-white rounded-xl border border-black/[0.06] shadow-sm">
              <EmptyState icon={MessageSquare} title="No feedback yet" description="Feedback from your supervisor will appear here after they review your submissions." />
            </div>
          ) : (
            submissions.filter((s) => (feedbackMap[s.id] ?? []).length > 0).map((s) => (
              <div key={s.id} className="bg-white rounded-xl border border-black/[0.06] shadow-sm p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-indigo-500" />
                    <p className="font-semibold text-sm text-gray-800">{s.chapter_title}</p>
                  </div>
                  <StatusBadge status={s.status} />
                </div>
                <div className="space-y-2">
                  {(feedbackMap[s.id] ?? []).map((f) => (
                    <div key={f.id} className="bg-gray-50 rounded-lg p-3.5">
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="text-xs font-semibold text-gray-600">{f.profiles?.full_name ?? "Supervisor"}</p>
                        <p className="text-[11px] text-gray-400">{fmtDate(f.feedback_date)}</p>
                      </div>
                      <p className="text-sm text-gray-700 leading-relaxed">{f.comments}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* STUDY MATERIALS */}
      {view === "materials" && (
        <div className="max-w-4xl space-y-5">
          <div className="bg-white rounded-xl border border-black/[0.06] shadow-sm overflow-hidden">
            <p className="px-5 py-4 text-sm font-semibold text-gray-800 border-b border-gray-100">Study Materials ({studentGuides.length})</p>
            {studentGuides.length === 0 ? (
              <EmptyState icon={BookOpen} title="No materials uploaded yet" description="Your supervisor has not shared any study materials." />
            ) : (
              <div className="divide-y divide-gray-50">
                {studentGuides.map((g) => {
                  const typeLabel: Record<string, string> = { guide: "Writing Guide", demo: "Demo Paper", template: "Template", other: "Material" };
                  const typeCls: Record<string, string> = {
                    guide: "bg-indigo-50 text-indigo-700 border-indigo-200",
                    demo: "bg-violet-50 text-violet-700 border-violet-200",
                    template: "bg-emerald-50 text-emerald-700 border-emerald-200",
                    other: "bg-gray-50 text-gray-600 border-gray-200",
                  };
                  return (
                    <div key={g.id} className="px-5 py-4 flex items-center justify-between gap-4">
                      <div className="min-w-0 flex items-start gap-3">
                        <div className="w-9 h-9 bg-indigo-50 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                          <BookOpen className="w-4 h-4 text-indigo-500" strokeWidth={1.5} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap mb-0.5">
                            <p className="text-sm font-semibold text-gray-800">{g.title}</p>
                            <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${typeCls[g.doc_type]}`}>{typeLabel[g.doc_type]}</span>
                          </div>
                          {g.description && <p className="text-xs text-gray-500">{g.description}</p>}
                          <p className="text-[11px] text-gray-400 mt-0.5">{fmtDate(g.created_at)}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          const link = g.url ?? "";
                          if (link) window.open(link, "_blank");
                          else alert("No link available for this material.");
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-medium rounded-lg border border-indigo-200 transition-colors"
                      >
                        <Download className="w-3.5 h-3.5" /> Open
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </DashboardShell>
  );
}

// ═══════════════════════════════════════════════════════════════
// SUPERVISOR DASHBOARD
// ═══════════════════════════════════════════════════════════════
function SupervisorDashboard({ profile }: { profile: Profile }) {
  const [view, setView] = useState("overview");
  const [students, setStudents] = useState<Profile[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [fbText, setFbText] = useState<Record<string, string>>({});
  const [actionId, setActionId] = useState<string | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<Profile | null>(null);
  const [studentSubs, setStudentSubs] = useState<Submission[]>([]);

  const navItems: NavItem[] = [
    { id: "overview",  label: "Overview",         icon: Home },
    { id: "topics",    label: "Project Topics",   icon: BookMarked },
    { id: "students",  label: "My Students",      icon: Users },
    { id: "review",    label: "Review Queue",     icon: Inbox },
    { id: "progress",  label: "Progress",         icon: TrendingUp },
    { id: "materials", label: "Study Materials", icon: BookOpen },
  ];

  const load = useCallback(async () => {
    setLoading(true);
    const { data: studs } = await supabase.from("profiles").select("*").eq("supervisor_id", profile.id).eq("role", "student");
    const ids = (studs ?? []).map((s) => s.id);
    const [{ data: subs }, { data: projs }] = await Promise.all([
      supabase.from("submissions").select("*").in("student_id", ids.length > 0 ? ids : ["-"]).order("submission_date", { ascending: false }),
      supabase.from("projects").select("*").in("student_id", ids.length > 0 ? ids : ["-"]).order("created_at", { ascending: false }),
    ]);
    setStudents(studs ?? []);
    setSubmissions(subs ?? []);
    setProjects(projs ?? []);
    setLoading(false);
  }, [profile.id]);

  useEffect(() => { load(); }, [load]);

  const studentName = (id: string) => students.find((s) => s.id === id)?.full_name ?? "Student";
  const projectTitle = (projId: string) => projects.find((p: any) => p.id === projId)?.title ?? "";

  const [guides, setGuides] = useState<Guide[]>([]);
  const [gUrl, setGUrl] = useState("");
  const [gSaving, setGSaving] = useState(false);
  const [gMsg, setGMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [gTitle, setGTitle] = useState("");
  const [gDesc, setGDesc] = useState("");
  const [gType, setGType] = useState<Guide["doc_type"]>("guide");
  const [gStudent, setGStudent] = useState<string>("");

  const loadGuides = useCallback(async () => {
    const { data } = await supabase
      .from("guides")
      .select("*", { count: "exact" })
      .eq("supervisor_id", profile.id)
      .order("created_at", { ascending: false });
    setGuides(data ?? []);
  }, [profile.id]);

  const saveGuide = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gUrl.trim()) { setGMsg({ ok: false, text: "Please paste a shareable link." }); return; }
    setGSaving(true); setGMsg(null);
    const { error } = await supabase.from("guides").insert({
      supervisor_id: profile.id,
      student_id: gStudent || null,
      title: gTitle,
      description: gDesc || null,
      doc_type: gType,
      url: gUrl.trim(),
      file_path: null,
    });
    if (error) {
      setGMsg({ ok: false, text: error.message });
    } else {
      const targets = gStudent ? [gStudent] : students.map((s) => s.id);
      const typeLabel = { guide: "Writing Guide", demo: "Demo Paper", template: "Template", other: "Material" }[gType];
      await Promise.all(targets.map((uid) =>
        notify(uid, `${profile.full_name} shared a ${typeLabel}: "${gTitle}" — check Study Materials.`)
      ));
      setGMsg({ ok: true, text: "Material shared successfully!" });
      setGTitle(""); setGDesc(""); setGType("guide"); setGStudent(""); setGUrl("");
      await load();
      await loadGuides();
    }
    setGSaving(false);
  };

  const deleteGuide = async (g: Guide) => {
    if (!confirm(`Delete "${g.title}"?`)) return;
    if (g.file_path) await supabase.storage.from("guides").remove([g.file_path]);
    await supabase.from("guides").delete().eq("id", g.id);
    await load();
    await loadGuides();
  };

  useEffect(() => {
    loadGuides();
  }, [loadGuides]);

  const reviewProject = async (proj: Project & { profiles?: { full_name: string } }, status: "approved" | "rejected") => {
    setActionId(proj.id);
    await supabase.from("projects").update({ status }).eq("id", proj.id);
    const msg = status === "approved"
      ? `Your project topic "${proj.title}" has been approved by ${profile.full_name}. You can now upload chapters.`
      : `Your project topic "${proj.title}" was rejected by ${profile.full_name}. Please revise and resubmit.`;
    await notify(proj.student_id, msg);
    await load();
    setActionId(null);
  };

  const review = async (sub: Submission, status: "approved" | "rejected") => {
    const comment = fbText[sub.id]?.trim();
    if (!comment) { alert("Please add feedback before submitting a decision."); return; }
    setActionId(sub.id);
    await supabase.from("submissions").update({ status }).eq("id", sub.id);
    await supabase.from("feedback").insert({ submission_id: sub.id, supervisor_id: profile.id, comments: comment });
    await notify(sub.student_id, `Your chapter "${sub.chapter_title}" was ${status} by ${profile.full_name}. Feedback: ${comment.slice(0, 120)}${comment.length > 120 ? "…" : ""}`);
    setFbText((p) => { const n = { ...p }; delete n[sub.id]; return n; });
    await load();
    setActionId(null);
  };

  const openProgress = async (student: Profile) => {
    setSelectedStudent(student);
    const { data } = await supabase.from("submissions").select("*").eq("student_id", student.id).order("submission_date", { ascending: false });
    setStudentSubs(data ?? []);
    setView("progress");
  };

  const pendingSubs     = submissions.filter((s) => s.status === "pending");
  const reviewed        = submissions.filter((s) => s.status !== "pending");
  const pendingTopics   = projects.filter((p) => p.status === "proposed");

  if (loading) return <div className="h-screen flex items-center justify-center bg-[#f5f5f9]"><Spinner size="lg" /></div>;

  return (
    <DashboardShell profile={profile} navItems={navItems} activeView={view} setActiveView={(v) => { if (v !== "progress") setSelectedStudent(null); setView(v); }}>
      {/* OVERVIEW */}
      {view === "overview" && (
        <div className="max-w-4xl">
          <p className="text-gray-500 text-sm mb-5">Welcome, <span className="font-semibold text-gray-800">{profile.full_name.split(" ")[0]}</span></p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
            <StatCard label="Assigned students"   value={students.length}       icon={Users}       color="text-indigo-600" />
            <StatCard label="Topics pending"      value={pendingTopics.length}  icon={BookMarked}  color="text-violet-600" />
            <StatCard label="Chapters pending"    value={pendingSubs.length}    icon={Clock}       color="text-amber-600" />
            <StatCard label="Reviewed"            value={reviewed.length}       icon={CheckCircle} color="text-emerald-600" />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-black/[0.06] shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm font-semibold text-gray-800">Pending project topics</p>
                <button onClick={() => setView("topics")} className="text-xs text-indigo-600 font-medium hover:text-indigo-800">View all</button>
              </div>
              {pendingTopics.length === 0 ? (
                <EmptyState icon={BookMarked} title="No topics awaiting approval" description="All submitted project topics have been reviewed." />
              ) : (
                <div className="space-y-0.5">
                  {pendingTopics.slice(0, 3).map((p) => (
                    <div key={p.id} className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{p.title}</p>
                        <p className="text-xs text-gray-400">{(p as any).profiles?.full_name} · {fmtDate(p.created_at)}</p>
                      </div>
                      <StatusBadge status={p.status} />
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="bg-white rounded-xl border border-black/[0.06] shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm font-semibold text-gray-800">Pending chapter reviews</p>
                <button onClick={() => setView("review")} className="text-xs text-indigo-600 font-medium hover:text-indigo-800">View queue</button>
              </div>
              {pendingSubs.length === 0 ? (
                <EmptyState icon={CheckCircle} title="All caught up!" description="No chapter submissions pending review." />
              ) : (
                <div className="space-y-0.5">
                  {pendingSubs.slice(0, 3).map((s) => (
                    <div key={s.id} className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{s.chapter_title}</p>
                        <p className="text-xs text-gray-400">{s.profiles?.full_name} · {fmtDate(s.submission_date)}</p>
                      </div>
                      <StatusBadge status={s.status} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* PROJECT TOPICS */}
      {view === "topics" && (
        <div className="max-w-3xl space-y-4">
          {projects.length === 0 ? (
            <div className="bg-white rounded-xl border border-black/[0.06] shadow-sm">
              <EmptyState icon={BookMarked} title="No project topics yet" description="Students assigned to you will appear here once they submit a project topic." />
            </div>
          ) : (
            <>
              {pendingTopics.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Awaiting your decision</p>
                  {pendingTopics.map((proj) => (
                    <div key={proj.id} className="bg-white rounded-xl border border-black/[0.06] shadow-sm p-5 mb-3">
                      <div className="flex items-start justify-between gap-3 mb-1">
                        <div className="min-w-0">
                          <p className="font-semibold text-gray-800">{proj.title}</p>
                          <p className="text-sm text-gray-500 mt-0.5">
                            by <span className="font-medium">{(proj as any).profiles?.full_name}</span> · submitted {fmtDate(proj.created_at)}
                          </p>
                        </div>
                        <StatusBadge status={proj.status} />
                      </div>
                      <div className="flex gap-2 mt-4">
                        <button
                          onClick={() => reviewProject(proj as any, "approved")}
                          disabled={actionId === proj.id}
                          className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                        >
                          {actionId === proj.id ? <Spinner size="sm" /> : <CheckCircle className="w-4 h-4" />}
                          Approve topic
                        </button>
                        <button
                          onClick={() => reviewProject(proj as any, "rejected")}
                          disabled={actionId === proj.id}
                          className="flex items-center gap-1.5 px-4 py-2 bg-rose-600 text-white text-sm font-semibold rounded-lg hover:bg-rose-700 disabled:opacity-50 transition-colors"
                        >
                          <X className="w-4 h-4" /> Reject topic
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {projects.filter((p) => p.status !== "proposed").length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Previously reviewed</p>
                  <div className="bg-white rounded-xl border border-black/[0.06] shadow-sm overflow-hidden">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-100">
                          {["Project Title", "Student", "Submitted", "Status"].map((h) => (
                            <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {projects.filter((p) => p.status !== "proposed").map((proj) => (
                          <tr key={proj.id} className="hover:bg-gray-50/50">
                            <td className="px-4 py-3 text-sm font-medium text-gray-800">{proj.title}</td>
                            <td className="px-4 py-3 text-sm text-gray-500">{(proj as any).profiles?.full_name}</td>
                            <td className="px-4 py-3 text-sm text-gray-500">{fmtDate(proj.created_at)}</td>
                            <td className="px-4 py-3"><StatusBadge status={proj.status} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* MY STUDENTS */}
      {view === "students" && (
        <div className="max-w-4xl">
          {students.length === 0 ? (
            <div className="bg-white rounded-xl border border-black/[0.06] shadow-sm">
              <EmptyState icon={Users} title="No students assigned" description="Ask your administrator to assign students to your supervision." />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {students.map((st) => {
                const stSubs = submissions.filter((s) => s.student_id === st.id);
                const pend   = stSubs.filter((s) => s.status === "pending").length;
                const appr   = stSubs.filter((s) => s.status === "approved").length;
                return (
                  <div key={st.id} className="bg-white rounded-xl border border-black/[0.06] shadow-sm p-5">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center text-sm font-bold text-indigo-700">
                        {initials(st.full_name)}
                      </div>
                      <div>
                        <p className="font-semibold text-sm text-gray-800">{st.full_name}</p>
                        <p className="text-xs text-gray-400">{stSubs.length} submissions</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mb-4">
                      <div className="bg-amber-50 rounded-lg p-2.5 text-center">
                        <p className="text-xl font-bold text-amber-700">{pend}</p>
                        <p className="text-[11px] text-amber-600">Pending</p>
                      </div>
                      <div className="bg-emerald-50 rounded-lg p-2.5 text-center">
                        <p className="text-xl font-bold text-emerald-700">{appr}</p>
                        <p className="text-[11px] text-emerald-600">Approved</p>
                      </div>
                    </div>
                    <button
                      onClick={() => openProgress(st)}
                      className="w-full py-2 text-sm text-indigo-600 font-medium border border-indigo-200 rounded-lg hover:bg-indigo-50 transition-colors"
                    >
                      View progress
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* REVIEW QUEUE */}
      {view === "review" && (
        <div className="max-w-3xl space-y-4">
          {pendingSubs.length === 0 && (
            <div className="bg-white rounded-xl border border-black/[0.06] shadow-sm">
              <EmptyState icon={CheckCircle} title="Queue is empty" description="All chapter submissions have been reviewed. Great work!" />
            </div>
          )}
          {pendingSubs.map((s) => (
            <div key={s.id} className="bg-white rounded-xl border border-black/[0.06] shadow-sm p-5">
              <div className="flex items-start justify-between gap-3 mb-1">
                <div>
                  <p className="font-semibold text-gray-800">{s.chapter_title}</p>
                  <p className="text-sm text-gray-500 mt-0.5">
                    by <span className="font-medium">{s.profiles?.full_name}</span>
                    {s.projects?.title && <> · from "<span className="italic">{s.projects.title}</span>"</>}
                    {" "}· {fmtDate(s.submission_date)}
                  </p>
                </div>
                <StatusBadge status={s.status} />
              </div>
              {s.file_path && (
                <button
                  onClick={async () => {
                    const { data } = await supabase.storage.from("submissions").createSignedUrl(s.file_path!, 3600);
                    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
                  }}
                  className="inline-flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-800 font-medium mt-3 mb-4"
                >
                  <Download className="w-4 h-4" /> Open / Download file
                </button>
              )}
              <div className="mt-2">
                <label className={labelCls}>Feedback</label>
                <textarea
                  rows={3}
                  value={fbText[s.id] ?? ""}
                  onChange={(e) => setFbText((p) => ({ ...p, [s.id]: e.target.value }))}
                  placeholder="Write your feedback for the student…"
                  className={`${inputCls} resize-none`}
                />
              </div>
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => review(s, "approved")} disabled={actionId === s.id}
                  className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                >
                  {actionId === s.id ? <Spinner size="sm" /> : <CheckCircle className="w-4 h-4" />} Approve
                </button>
                <button
                  onClick={() => review(s, "rejected")} disabled={actionId === s.id}
                  className="flex items-center gap-1.5 px-4 py-2 bg-rose-600 text-white text-sm font-semibold rounded-lg hover:bg-rose-700 disabled:opacity-50 transition-colors"
                >
                  <X className="w-4 h-4" /> Reject
                </button>
              </div>
            </div>
          ))}

          {reviewed.length > 0 && (
            <div className="bg-white rounded-xl border border-black/[0.06] shadow-sm overflow-hidden">
              <p className="px-5 py-3.5 text-sm font-semibold text-gray-800 border-b border-gray-100">Recently reviewed</p>
              <div className="divide-y divide-gray-50">
                {reviewed.slice(0, 6).map((s) => (
                  <div key={s.id} className="px-5 py-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-800">{s.chapter_title}</p>
                      <p className="text-xs text-gray-400">{s.profiles?.full_name}</p>
                    </div>
                    <StatusBadge status={s.status} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* STUDY MATERIALS */}
      {view === "materials" && (
        <div className="max-w-4xl space-y-5">
          <div className="bg-white rounded-xl border border-black/[0.06] shadow-sm p-6">
            <p className="font-semibold text-gray-800 mb-1">Share Study Material</p>
            <p className="text-sm text-gray-500 mb-2">
              Paste a shareable link from Google Drive, OneDrive, Dropbox, or any other platform. No file storage used.
            </p>
            <div className="flex items-center gap-2 mb-5 p-3 bg-indigo-50 border border-indigo-100 rounded-lg">
              <AlertCircle className="w-4 h-4 text-indigo-500 flex-shrink-0" />
              <p className="text-xs text-indigo-700">Make sure the link is set to <strong>"Anyone with the link can view"</strong> before sharing.</p>
            </div>
            {gMsg && (
              <div className={`mb-4 p-3 rounded-lg text-sm border ${gMsg.ok ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-rose-50 text-rose-700 border-rose-200"}`}>
                {gMsg.text}
              </div>
            )}
            <form onSubmit={saveGuide} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Title</label>
                  <input type="text" value={gTitle} onChange={(e) => setGTitle(e.target.value)} required
                    placeholder="e.g. How to Write Chapter 2" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Document type</label>
                  <select value={gType} onChange={(e) => setGType(e.target.value as Guide["doc_type"])} className={inputCls}>
                    <option value="guide">Writing Guide</option>
                    <option value="demo">Demo / Sample Paper</option>
                    <option value="template">Template</option>
                    <option value="other">Other Material</option>
                  </select>
                </div>
              </div>
              <div>
                <label className={labelCls}>Description <span className="text-gray-400 font-normal">(optional)</span></label>
                <input type="text" value={gDesc} onChange={(e) => setGDesc(e.target.value)}
                  placeholder="Brief note on what this document covers" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Send to</label>
                <select value={gStudent} onChange={(e) => setGStudent(e.target.value)} className={inputCls}>
                  <option value="">All my students</option>
                  {students.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Shareable link</label>
                <input type="url" value={gUrl} onChange={(e) => setGUrl(e.target.value)} required
                  placeholder="https://drive.google.com/file/d/... or OneDrive/Dropbox link"
                  className={inputCls} />
              </div>
              <button type="submit" disabled={gSaving}
                className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50 transition-colors">
                {gSaving && <Spinner size="sm" />} Share material
              </button>
            </form>
          </div>
          <div className="bg-white rounded-xl border border-black/[0.06] shadow-sm overflow-hidden">
            <p className="px-5 py-4 text-sm font-semibold text-gray-800 border-b border-gray-100">Uploaded Materials ({guides.length})</p>
            {guides.length === 0 ? (
              <EmptyState icon={BookOpen} title="No materials uploaded yet" description="Upload your first document above." />
            ) : (
              <div className="divide-y divide-gray-50">
                {guides.map((g) => {
                  const typeLabel: Record<string, string> = { guide: "Writing Guide", demo: "Demo Paper", template: "Template", other: "Material" };
                  const typeCls: Record<string, string> = {
                    guide: "bg-indigo-50 text-indigo-700 border-indigo-200",
                    demo: "bg-violet-50 text-violet-700 border-violet-200",
                    template: "bg-emerald-50 text-emerald-700 border-emerald-200",
                    other: "bg-gray-50 text-gray-600 border-gray-200",
                  };
                  return (
                    <div key={g.id} className="px-5 py-4 flex items-center justify-between gap-4">
                      <div className="min-w-0 flex items-start gap-3">
                        <div className="w-9 h-9 bg-indigo-50 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                          <BookOpen className="w-4 h-4 text-indigo-500" strokeWidth={1.5} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap mb-0.5">
                            <p className="text-sm font-semibold text-gray-800">{g.title}</p>
                            <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${typeCls[g.doc_type]}`}>{typeLabel[g.doc_type]}</span>
                            <span className="text-[11px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{g.student_id ? studentName(g.student_id) : "All students"}</span>
                          </div>
                          {g.description && <p className="text-xs text-gray-500">{g.description}</p>}
                          <p className="text-[11px] text-gray-400 mt-0.5">{fmtDate(g.created_at)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={() => {
                            const link = g.url ?? "";
                            if (link) window.open(link, "_blank");
                            else alert("No link available for this material.");
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-medium rounded-lg border border-indigo-200 transition-colors"
                        >
                          <Download className="w-3.5 h-3.5" /> Open
                        </button>
                        <button onClick={() => deleteGuide(g)} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs font-medium rounded-lg border border-rose-200 transition-colors">
                          <X className="w-3.5 h-3.5" /> Delete
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* PROGRESS */}
      {view === "progress" && selectedStudent && (
        <div className="max-w-3xl">
          <button
            onClick={() => { setView("students"); setSelectedStudent(null); }}
            className="inline-flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-800 font-medium mb-5"
          >
            ← Back to students
          </button>
          <div className="bg-white rounded-xl border border-black/[0.06] shadow-sm p-5 mb-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center font-bold text-indigo-700">
                {initials(selectedStudent.full_name)}
              </div>
              <div>
                <p className="font-semibold text-gray-800">{selectedStudent.full_name}</p>
                <p className="text-sm text-gray-400">{studentSubs.length} total submission{studentSubs.length !== 1 ? "s" : ""}</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Pending",  count: studentSubs.filter((s) => s.status === "pending").length,  cls: "bg-amber-50 text-amber-700" },
                { label: "Approved", count: studentSubs.filter((s) => s.status === "approved").length, cls: "bg-emerald-50 text-emerald-700" },
                { label: "Rejected", count: studentSubs.filter((s) => s.status === "rejected").length, cls: "bg-rose-50 text-rose-700" },
              ].map(({ label, count, cls }) => (
                <div key={label} className={`rounded-xl p-3 text-center ${cls}`}>
                  <p className="text-2xl font-bold">{count}</p>
                  <p className="text-xs mt-0.5">{label}</p>
                </div>
              ))}
            </div>
          </div>
          {studentSubs.length === 0 ? (
            <div className="bg-white rounded-xl border border-black/[0.06] shadow-sm">
              <EmptyState icon={FileText} title="No submissions yet" description="This student has not uploaded any chapters." />
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-black/[0.06] shadow-sm overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    {["Chapter", "Submitted", "Status", "File"].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {studentSubs.map((s) => (
                    <tr key={s.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-3 text-sm font-medium text-gray-800">{s.chapter_title}</td>
                      <td className="px-4 py-3 text-sm text-gray-500">{fmtDate(s.submission_date)}</td>
                      <td className="px-4 py-3"><StatusBadge status={s.status} /></td>
                      <td className="px-4 py-3">
                        {s.file_path ? (
                          <button
                            onClick={async () => {
                              const { data, error } = await supabase.storage.from("submissions").createSignedUrl(s.file_path!, 3600);
                              if (error) alert("Could not open file: " + error.message);
                              else if (data?.signedUrl) window.open(data.signedUrl, "_blank");
                            }}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-medium rounded-lg border border-indigo-200 transition-colors"
                          >
                            <Download className="w-3.5 h-3.5" /> Open
                          </button>
                        ) : (
                          <span className="text-xs text-gray-400">No file</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {view === "progress" && !selectedStudent && (
        <EmptyState icon={TrendingUp} title="Select a student" description='Go to "My Students" and click "View progress".' action={{ label: "Go to students", onClick: () => setView("students") }} />
      )}
    </DashboardShell>
  );
}

// ═══════════════════════════════════════════════════════════════
// ADMIN DASHBOARD
// ═══════════════════════════════════════════════════════════════
function AdminDashboard({ profile }: { profile: Profile }) {
  const [view, setView] = useState("overview");
  const [users, setUsers] = useState<Profile[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [selStudent, setSelStudent] = useState("");
  const [selSupervisor, setSelSupervisor] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [assignMsg, setAssignMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const navItems: NavItem[] = [
    { id: "overview", label: "Overview",          icon: Home },
    { id: "users",    label: "User Management",   icon: Users },
    { id: "assign",   label: "Assign Supervisors", icon: UserCheck },
    { id: "reports",  label: "Reports",           icon: BarChart2 },
  ];

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: u }, { data: s }] = await Promise.all([
      supabase.from("profiles").select("*").order("role").order("full_name"),
      supabase.from("submissions").select("*"),
    ]);
    setUsers(u ?? []);
    setSubmissions(s ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const supervisors = users.filter((u) => u.role === "supervisor");
  const students    = users.filter((u) => u.role === "student");
  const unassigned  = students.filter((s) => !s.supervisor_id).length;
  const totalPend   = submissions.filter((s) => s.status === "pending").length;
  const totalAppr   = submissions.filter((s) => s.status === "approved").length;
  const totalRej    = submissions.filter((s) => s.status === "rejected").length;

  const assign = async (e: React.FormEvent) => {
    e.preventDefault();
    setAssigning(true); setAssignMsg(null);
    const student    = students.find((s) => s.id === selStudent);
    const supervisor = supervisors.find((s) => s.id === selSupervisor);

    const { error } = await supabase.from("profiles").update({ supervisor_id: selSupervisor }).eq("id", selStudent);
    if (!error) {
      await Promise.all([
        supabase.from("projects").update({ supervisor_id: selSupervisor }).eq("student_id", selStudent),
        supabase.from("submissions").update({ supervisor_id: selSupervisor }).eq("student_id", selStudent),
        notify(selStudent, `You have been assigned to supervisor ${supervisor?.full_name}.`),
        notify(selSupervisor, `${student?.full_name} has been assigned to you as a student.`),
      ]);
      setAssignMsg({ ok: true, text: `${student?.full_name} assigned to ${supervisor?.full_name}.` });
      await load();
    } else {
      setAssignMsg({ ok: false, text: error.message });
    }
    setAssigning(false);
  };

  if (loading) return <div className="h-screen flex items-center justify-center bg-[#f5f5f9]"><Spinner size="lg" /></div>;

  return (
    <DashboardShell profile={profile} navItems={navItems} activeView={view} setActiveView={setView}>
      {/* OVERVIEW */}
      {view === "overview" && (
        <div className="max-w-4xl">
          <p className="text-gray-500 text-sm mb-5">System overview</p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
            <StatCard label="Students"         value={students.length}    icon={GraduationCap} color="text-indigo-600" />
            <StatCard label="Supervisors"      value={supervisors.length} icon={UserCheck}     color="text-violet-600" />
            <StatCard label="Pending reviews"  value={totalPend}          icon={Clock}         color="text-amber-600" />
            <StatCard label="Unassigned"       value={unassigned}         icon={AlertCircle}   color="text-rose-600" />
          </div>
          <div className="bg-white rounded-xl border border-black/[0.06] shadow-sm p-5">
            <p className="text-sm font-semibold text-gray-800 mb-4">Supervisor workload</p>
            {supervisors.length === 0 ? (
              <EmptyState icon={UserCheck} title="No supervisors yet" description="Create supervisor accounts and assign them to students." />
            ) : (
              <div className="space-y-4">
                {supervisors.map((sup) => {
                  const cnt = students.filter((s) => s.supervisor_id === sup.id).length;
                  const pct = students.length === 0 ? 0 : Math.min(100, Math.round((cnt / students.length) * 100 * supervisors.length));
                  return (
                    <div key={sup.id} className="flex items-center gap-4">
                      <div className="w-8 h-8 bg-violet-100 rounded-full flex items-center justify-center text-[11px] font-bold text-violet-700 flex-shrink-0">
                        {initials(sup.full_name)}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1.5">
                          <p className="text-sm font-medium text-gray-800">{sup.full_name}</p>
                          <p className="text-xs text-gray-400">{cnt} student{cnt !== 1 ? "s" : ""}</p>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-1.5">
                          <div className="bg-violet-500 h-1.5 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* USER MANAGEMENT */}
      {view === "users" && (
        <div className="max-w-5xl">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-gray-500">{users.length} accounts</p>
            <button onClick={load} className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 font-medium">
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
          </div>
          <div className="bg-white rounded-xl border border-black/[0.06] shadow-sm overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {["User", "Role", "Supervisor", "User ID"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {users.map((u) => {
                  const sup = u.supervisor_id ? users.find((x) => x.id === u.supervisor_id) : null;
                  const avatarCls = { student: "bg-indigo-100 text-indigo-700", supervisor: "bg-violet-100 text-violet-700", admin: "bg-slate-100 text-slate-600" }[u.role];
                  return (
                    <tr key={u.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${avatarCls}`}>
                            {initials(u.full_name)}
                          </div>
                          <p className="text-sm font-medium text-gray-800">{u.full_name}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={u.role} /></td>
                      <td className="px-4 py-3 text-sm text-gray-500">{sup?.full_name ?? "—"}</td>
                      <td className="px-4 py-3 font-mono text-[11px] text-gray-400">{u.id.slice(0, 12)}…</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ASSIGN */}
      {view === "assign" && (
        <div className="max-w-lg space-y-4">
          <div className="bg-white rounded-xl border border-black/[0.06] shadow-sm p-6">
            <p className="font-semibold text-gray-800 mb-1">Assign Supervisor to Student</p>
            <p className="text-sm text-gray-500 mb-5">Both parties receive a notification immediately.</p>
            {assignMsg && (
              <div className={`mb-4 p-3 rounded-lg text-sm border ${assignMsg.ok ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-rose-50 text-rose-700 border-rose-200"}`}>
                {assignMsg.text}
              </div>
            )}
            <form onSubmit={assign} className="space-y-4">
              <div>
                <label className={labelCls}>Student</label>
                <select value={selStudent} onChange={(e) => setSelStudent(e.target.value)} required className={inputCls}>
                  <option value="">Select student…</option>
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.full_name}{s.supervisor_id ? " (assigned)" : " (unassigned)"}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Supervisor</label>
                <select value={selSupervisor} onChange={(e) => setSelSupervisor(e.target.value)} required className={inputCls}>
                  <option value="">Select supervisor…</option>
                  {supervisors.map((s) => {
                    const load_ = students.filter((st) => st.supervisor_id === s.id).length;
                    return <option key={s.id} value={s.id}>{s.full_name} ({load_} students)</option>;
                  })}
                </select>
              </div>
              <button type="submit" disabled={assigning} className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50 transition-colors">
                {assigning && <Spinner size="sm" />} Assign supervisor
              </button>
            </form>
          </div>

          {unassigned > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle className="w-4 h-4 text-amber-600" />
                <p className="text-sm font-semibold text-amber-800">{unassigned} unassigned student{unassigned !== 1 ? "s" : ""}</p>
              </div>
              <div className="space-y-0.5">
                {students.filter((s) => !s.supervisor_id).map((s) => (
                  <p key={s.id} className="text-xs text-amber-700">· {s.full_name}</p>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* REPORTS */}
      {view === "reports" && (
        <div className="max-w-4xl space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              {
                label: "Approval Rate",
                value: submissions.length > 0 ? `${Math.round((totalAppr / submissions.length) * 100)}%` : "N/A",
                sub: `${totalAppr} of ${submissions.length} approved`,
                icon: TrendingUp, iconBg: "bg-emerald-50", iconCls: "text-emerald-600",
              },
              {
                label: "Pending Submissions",
                value: totalPend,
                sub: "Awaiting supervisor review",
                icon: Clock, iconBg: "bg-amber-50", iconCls: "text-amber-600",
              },
              {
                label: "Rejection Rate",
                value: submissions.length > 0 ? `${Math.round((totalRej / submissions.length) * 100)}%` : "N/A",
                sub: `${totalRej} rejected`,
                icon: AlertCircle, iconBg: "bg-rose-50", iconCls: "text-rose-600",
              },
            ].map(({ label, value, sub, icon: Icon, iconBg, iconCls }) => (
              <div key={label} className="bg-white rounded-xl border border-black/[0.06] shadow-sm p-5">
                <div className={`w-10 h-10 ${iconBg} rounded-xl flex items-center justify-center mb-3`}>
                  <Icon className={`w-5 h-5 ${iconCls}`} strokeWidth={1.5} />
                </div>
                <p className="text-2xl font-bold text-gray-900 mb-0.5">{value}</p>
                <p className="text-sm font-semibold text-gray-700 mb-0.5">{label}</p>
                <p className="text-xs text-gray-400">{sub}</p>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-xl border border-black/[0.06] shadow-sm overflow-hidden">
            <p className="px-5 py-4 text-sm font-semibold text-gray-800 border-b border-gray-100">Per-Supervisor Breakdown</p>
            {supervisors.length === 0 ? (
              <EmptyState icon={UserCheck} title="No supervisors yet" description="Add supervisor accounts to see this breakdown." />
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    {["Supervisor", "Students", "Submissions", "Pending", "Approved", "Rejected"].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {supervisors.map((sup) => {
                    const supStudents = students.filter((s) => s.supervisor_id === sup.id).length;
                    const supSubs     = submissions.filter((s) => s.supervisor_id === sup.id);
                    const sP = supSubs.filter((s) => s.status === "pending").length;
                    const sA = supSubs.filter((s) => s.status === "approved").length;
                    const sR = supSubs.filter((s) => s.status === "rejected").length;
                    return (
                      <tr key={sup.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 bg-violet-100 rounded-full flex items-center justify-center text-[11px] font-bold text-violet-700">
                              {initials(sup.full_name)}
                            </div>
                            <p className="text-sm font-medium text-gray-800">{sup.full_name}</p>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">{supStudents}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{supSubs.length}</td>
                        <td className="px-4 py-3"><span className="text-xs font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full ring-1 ring-amber-200">{sP}</span></td>
                        <td className="px-4 py-3"><span className="text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full ring-1 ring-emerald-200">{sA}</span></td>
                        <td className="px-4 py-3"><span className="text-xs font-medium text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full ring-1 ring-rose-200">{sR}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </DashboardShell>
  );
}

// ═══════════════════════════════════════════════════════════════
// SETUP PROFILE (fallback when trigger didn't create the profile)
// ═══════════════════════════════════════════════════════════════
function SetupProfile({ onDone }: { onDone: (p: Profile) => void }) {
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<Role>("student");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError("");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError("Session expired. Please sign in again."); setLoading(false); return; }

    const { data, error: err } = await supabase
      .from("profiles")
      .upsert({ id: user.id, full_name: fullName, role, supervisor_id: null })
      .select()
      .maybeSingle();

    if (err || !data) {
      setError(err?.message ?? "Could not save profile. Please try again.");
    } else {
      onDone(data as Profile);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4 font-[Inter,system-ui,sans-serif]">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <GraduationCap className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-xl font-bold text-white">Complete your profile</h1>
          <p className="text-slate-400 text-sm mt-1">One more step before you get started</p>
        </div>
        <div className="bg-slate-900 border border-slate-700/60 rounded-2xl p-7">
          {error && (
            <div className="mb-4 p-3 bg-rose-900/30 border border-rose-700/40 rounded-lg flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
              <p className="text-rose-300 text-sm">{error}</p>
            </div>
          )}
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Full name</label>
              <input
                type="text" value={fullName} onChange={(e) => setFullName(e.target.value)}
                required placeholder="e.g. Amina Oduya"
                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2.5 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">I am a</label>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { v: "student" as Role, l: "Student", I: BookOpen },
                  { v: "supervisor" as Role, l: "Supervisor", I: UserCheck },
                  { v: "admin" as Role, l: "Admin", I: Shield },
                ]).map(({ v, l, I }) => (
                  <button type="button" key={v} onClick={() => setRole(v)}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border text-xs font-medium transition-all ${
                      role === v ? "border-indigo-500 bg-indigo-500/12 text-indigo-300" : "border-slate-600 text-slate-400 hover:border-slate-500 hover:text-white"
                    }`}
                  >
                    <I className="w-4 h-4" />{l}
                  </button>
                ))}
              </div>
            </div>
            <button type="submit" disabled={loading}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {loading && <Spinner size="sm" />} Save and continue
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// APP ROOT
// ═══════════════════════════════════════════════════════════════
export default function App() {
  const [page, setPage] = useState<"loading" | "landing" | "auth" | "setup" | "dashboard">("loading");
  const [profile, setProfile] = useState<Profile | null>(null);

  const loadProfile = useCallback(async (uid: string) => {
    let { data } = await supabase.from("profiles").select("*").eq("id", uid).maybeSingle();

    if (!data) {
      // Profile missing — create it from auth metadata
      const { data: { user } } = await supabase.auth.getUser();
      const meta = user?.user_metadata ?? {};
      const validRoles: Role[] = ["student", "supervisor", "admin"];
      const role: Role = validRoles.includes(meta.role) ? meta.role : "student";
      const fullName: string = meta.full_name || user?.email?.split("@")[0] || "User";

      const { data: created, error } = await supabase
        .from("profiles")
        .insert({ id: uid, full_name: fullName, role, supervisor_id: null })
        .select()
        .maybeSingle();

      if (error) {
        console.error("Profile creation failed:", error);
        // If insert failed due to RLS, try upsert instead
        const { data: upserted } = await supabase
          .from("profiles")
          .upsert({ id: uid, full_name: fullName, role, supervisor_id: null })
          .select()
          .maybeSingle();
        data = upserted;
      } else {
        data = created;
      }
    }

    if (data) { setProfile(data); setPage("dashboard"); }
    else { setPage("setup"); }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) loadProfile(session.user.id);
      else setPage("landing");
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) loadProfile(session.user.id);
      else { setProfile(null); setPage("landing"); }
    });
    return () => subscription.unsubscribe();
  }, [loadProfile]);

  if (page === "loading") {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-950">
        <Spinner size="lg" />
      </div>
    );
  }
  if (page === "landing") return <LandingPage onLogin={() => setPage("auth")} />;
  if (page === "auth")    return <AuthPage />;
  if (page === "setup")   return <SetupProfile onDone={(p) => { setProfile(p); setPage("dashboard"); }} />;

  if (page === "dashboard" && profile) {
    if (profile.role === "student")    return <StudentDashboard    profile={profile} />;
    if (profile.role === "supervisor") return <SupervisorDashboard profile={profile} />;
    if (profile.role === "admin")      return <AdminDashboard      profile={profile} />;
  }

  return <LandingPage onLogin={() => setPage("auth")} />;
}
