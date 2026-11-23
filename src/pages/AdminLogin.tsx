import "@/styles/admin.css";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import BrandMark from "@/components/brand/BrandMark";
import { getAdminRole } from "@/lib/admin-role";
import { Eye, EyeOff, Loader2, Lock, Mail } from "lucide-react";



const AdminLogin = () => {
  useEffect(() => {
    const el = document.createElement("meta");
    el.setAttribute("name", "robots");
    el.setAttribute("content", "noindex,nofollow");
    document.head.appendChild(el);
    return () => { el.remove(); };
  }, []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  const navigate = useNavigate();
  const { toast } = useToast();

  // Check if already logged in with admin/staff role
  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!mounted) return;
      if (session?.user) {
        try {
          const role = await getAdminRole(session.user.id);
          if (mounted && role) {
            navigate("/admin", { replace: true });
            return;
          }
        } catch {
          await supabase.auth.signOut();
        }
        if (mounted) setChecking(false);
        return;
      }
      if (mounted) setChecking(false);
    });
    return () => { mounted = false; };
  }, [navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No user found");

      const role = await getAdminRole(user.id);
      if (!role) {
        await supabase.auth.signOut();
        throw new Error("You don't have admin access.");
      }

      toast({ title: "Welcome back!" });
      navigate("/admin");
    } catch (err: any) {
      if (err?.message?.includes("permission denied for function has_role")) {
        toast({
          title: "Sign in failed",
          description: "Admin role verification is unavailable right now. Please try again.",
          variant: "destructive",
        });
      } else {
        toast({ title: "Sign in failed", description: err.message, variant: "destructive" });
      }
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="admin-shell min-h-screen bg-[#F4F5F7] flex items-center justify-center font-sans">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 size={14} className="animate-spin" />
          Verifying session…
        </div>
      </div>
    );
  }

  return (
    <div className="admin-shell min-h-screen bg-[#F4F5F7] flex items-center justify-center px-4 py-10 font-sans text-[hsl(var(--a-ink))]">
      <div className="w-full max-w-[400px]">

        {/* Brand header */}
        <div className="flex flex-col items-center mb-6">
          <BrandMark size="lg" />
          <div className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white border border-black/10 text-[10px] font-semibold tracking-[0.18em] uppercase text-foreground/70">
            <Lock size={10} /> Admin Panel
          </div>
        </div>

        {/* Card */}
        <div className="bg-white border border-black/10 rounded-[10px] shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.04)] overflow-hidden">
          <div className="px-6 pt-6 pb-2">
            <h1 className="text-[17px] font-semibold tracking-tight text-foreground">Sign in</h1>
            <p className="text-[13px] text-muted-foreground mt-1">Enter your admin credentials to continue.</p>
          </div>

          <form onSubmit={handleLogin} className="px-6 pt-4 pb-6 space-y-4">
            <div>
              <label htmlFor="admin-email" className="text-[12px] font-medium text-foreground/80 mb-1.5 block">Email</label>
              <div className="relative">
                <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <Input
                  id="admin-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@example.com"
                  className="h-10 pl-9 rounded-md"
                  required
                />
              </div>
            </div>

            <div>
              <label htmlFor="admin-password" className="text-[12px] font-medium text-foreground/80 mb-1.5 block">Password</label>
              <div className="relative">
                <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <Input
                  id="admin-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="h-10 pl-9 pr-10 rounded-md"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                  tabIndex={-1}
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-black/5 transition-colors"
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <Button type="submit" className="w-full h-10 rounded-md font-medium" disabled={loading}>
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin" /> Signing in…
                </span>
              ) : (
                "Sign in"
              )}
            </Button>
          </form>
        </div>

        <p className="text-[11px] text-center text-muted-foreground mt-5">
          Protected area · authorized administrators only
        </p>
      </div>
    </div>
  );
};

export default AdminLogin;

