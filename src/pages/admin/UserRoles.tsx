import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Plus, KeyRound, Shield, Lock } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdmin } from "@/hooks/useAdmin";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <span className="text-[10px] uppercase tracking-[0.06em] font-semibold text-muted-foreground">
    {children}
  </span>
);

const Field = ({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) => (
  <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-1 sm:gap-3 sm:items-center">
    <label className="text-[12px] text-muted-foreground/90">
      {label}{required && <span className="text-destructive ml-0.5">*</span>}
    </label>
    <div className="min-w-0">
      {children}
      {hint && <p className="text-[11px] text-muted-foreground/70 mt-1">{hint}</p>}
    </div>
  </div>
);

const UserRoles = () => {
  const { isAdmin, loading: roleLoading } = useAdmin();
  const [roles, setRoles] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<Record<string, any>>({});
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<"admin" | "staff">("staff");
  const [loading, setLoading] = useState(true);
  const [changingPassword, setChangingPassword] = useState<string | null>(null);
  const [pendingRemoveId, setPendingRemoveId] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const { toast } = useToast();

  const fetchRoles = async () => {
    const { data, error } = await supabase.from("user_roles").select("*");
    if (error) {
      toast({ title: "Failed to load roles", description: error.message, variant: "destructive" });
      setLoading(false);
      return;
    }
    setRoles(data ?? []);
    if (data && data.length > 0) {
      const userIds = data.map((r) => r.user_id);
      const { data: profs } = await supabase.from("profiles").select("user_id, email, full_name").in("user_id", userIds);
      const map: Record<string, any> = {};
      (profs ?? []).forEach((p) => { map[p.user_id] = p; });
      setProfiles(map);
    }
    setLoading(false);
  };

  useEffect(() => { if (isAdmin) fetchRoles(); else if (!roleLoading) setLoading(false); /* eslint-disable-next-line */ }, [isAdmin, roleLoading]);

  const addUserWithRole = async () => {
    if (!email.trim() || !password.trim()) {
      toast({ title: "Email and password are required", variant: "destructive" });
      return;
    }
    if (password.length < 6) {
      toast({ title: "Password must be at least 6 characters", variant: "destructive" });
      return;
    }

    const { data: existingProf } = await supabase
      .from("profiles")
      .select("user_id")
      .eq("email", email.trim().toLowerCase())
      .maybeSingle();

    if (existingProf) {
      // Check if this role already exists for the user
      const { data: existingRole } = await supabase
        .from("user_roles")
        .select("id")
        .eq("user_id", existingProf.user_id)
        .eq("role", role)
        .maybeSingle();
      if (existingRole) {
        toast({
          title: "Role already assigned",
          description: `This user already has the ${role} role. Password was not changed.`,
          variant: "destructive",
        });
        return;
      }
      const { error } = await supabase.from("user_roles").insert({ user_id: existingProf.user_id, role });
      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      } else {
        toast({
          title: "Role assigned to existing user",
          description: "Existing user found — only the role was assigned. Password was not changed.",
        });
        setEmail(""); setPassword(""); setFullName("");
        fetchRoles();
      }
      return;
    }

    // New user: call admin edge function so the current admin's session isn't replaced.
    const { data, error } = await supabase.functions.invoke("admin-create-user", {
      body: {
        email: email.trim().toLowerCase(),
        password,
        full_name: fullName,
        role,
      },
    });

    if (error || !data?.ok) {
      toast({
        title: "Error creating user",
        description: (data as any)?.message || error?.message || "Failed to create user",
        variant: "destructive",
      });
      return;
    }
    if ((data as any)?.warning) {
      toast({ title: "User created", description: (data as any).warning, variant: "destructive" });
    } else {
      toast({ title: "User created & role assigned" });
    }
    setEmail(""); setPassword(""); setFullName("");
    fetchRoles();
  };

  const confirmRemoveRole = async () => {
    if (!pendingRemoveId) return;
    setRemoving(true);
    const { error } = await supabase.from("user_roles").delete().eq("id", pendingRemoveId);
    setRemoving(false);
    if (error) {
      toast({ title: "Failed to remove role", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Role removed" });
      fetchRoles();
    }
    setPendingRemoveId(null);
  };

  if (roleLoading || loading) {
    return (
      <div className="max-w-3xl pb-10 space-y-3">
        <Skeleton className="h-5 w-40 rounded-[3px]" />
        <Skeleton className="h-44 w-full rounded-[4px]" />
        <Skeleton className="h-20 w-full rounded-[4px]" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="max-w-3xl pb-10 space-y-3">
        <div className="space-y-1">
          <h1 className="text-[18px] sm:text-[20px] font-semibold text-foreground leading-tight">User roles</h1>
          <p className="text-[12.5px] text-muted-foreground">Manage admin and staff access.</p>
        </div>
        <div className="bg-background border border-border/60 rounded-[4px] p-8 flex flex-col items-center gap-2 text-center">
          <Lock size={18} className="text-muted-foreground/60" />
          <p className="text-[13px] font-medium text-foreground">Admin only</p>
          <p className="text-[12px] text-muted-foreground">Only admins can manage team roles.</p>
        </div>
      </div>
    );
  }

  const adminCount = roles.filter(r => r.role === "admin").length;
  const staffCount = roles.filter(r => r.role === "staff").length;

  return (
    <div className="max-w-3xl pb-10 space-y-3">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-[18px] sm:text-[20px] font-semibold text-foreground leading-tight">User roles</h1>
        <div className="text-[12.5px] text-muted-foreground flex flex-wrap items-center gap-x-1.5">
          <span className="tabular-nums text-foreground">{roles.length}</span>
          <span>members</span>
          <span className="text-muted-foreground/50">•</span>
          <span className="tabular-nums text-foreground">{adminCount}</span>
          <span>admin</span>
          <span className="text-muted-foreground/50">•</span>
          <span className="tabular-nums text-foreground">{staffCount}</span>
          <span>staff</span>
        </div>
      </div>

      {/* Add user card */}
      <div className="bg-background border border-border/60 rounded-[4px] p-3 sm:p-4 space-y-3">
        <SectionLabel>Add team member</SectionLabel>
        <div className="space-y-2.5">
          <Field label="Full name">
            <Input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Optional"
              className="h-9 rounded-[4px] text-[12.5px]"
            />
          </Field>
          <Field label="Email" required>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              className="h-9 rounded-[4px] text-[12.5px]"
            />
          </Field>
          <Field label="Password" required hint="Minimum 6 characters">
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-9 rounded-[4px] text-[12.5px]"
            />
          </Field>
          <Field label="Role">
            <div className="flex gap-2">
              <Select value={role} onValueChange={(v) => setRole(v as "admin" | "staff")}>
                <SelectTrigger className="w-[140px] h-9 rounded-[4px] text-[12.5px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="staff">Staff</SelectItem>
                </SelectContent>
              </Select>
              <Button size="sm" className="h-9 px-3 rounded-[4px] text-[12px] flex-1" onClick={addUserWithRole}>
                <Plus size={13} className="mr-1.5" /> Add user
              </Button>
            </div>
          </Field>
        </div>
      </div>

      {/* Members list */}
      <div className="bg-background border border-border/60 rounded-[4px] p-3 sm:p-4 space-y-2.5">
        <SectionLabel>Members</SectionLabel>

        {roles.length === 0 ? (
          <div className="border border-dashed border-border/60 rounded-[4px] py-8 flex flex-col items-center gap-2 text-center">
            <Shield size={18} className="text-muted-foreground/60" />
            <p className="text-[12.5px] text-muted-foreground">No team members yet.</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {roles.map((r) => {
              const prof = profiles[r.user_id];
              return (
                <div key={r.id} className="bg-background border border-border/60 rounded-[4px] p-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[12.5px] font-medium text-foreground truncate">
                        {prof?.full_name || prof?.email || r.user_id}
                      </p>
                      <p className="text-[11px] text-muted-foreground/70 truncate">
                        {prof?.email}
                        <span className="text-muted-foreground/50"> · </span>
                        <span className="capitalize">{r.role}</span>
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 rounded-[4px]"
                        onClick={() => setChangingPassword(changingPassword === r.user_id ? null : r.user_id)}
                        aria-label={`Change password for ${prof?.email ?? "user"}`}
                      >
                        <KeyRound size={13} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 rounded-[4px] text-destructive hover:text-destructive"
                        onClick={() => setPendingRemoveId(r.id)}
                        aria-label={`Remove role from ${prof?.email ?? "user"}`}
                      >
                        <Trash2 size={13} />
                      </Button>
                    </div>
                  </div>
                  {changingPassword === r.user_id && (
                    <p className="mt-2.5 pt-2.5 border-t border-border/40 text-[11px] text-muted-foreground/70">
                      Password changes require admin API access. For now, users can reset their password via the login page.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <AlertDialog open={!!pendingRemoveId} onOpenChange={(o) => !o && setPendingRemoveId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this role?</AlertDialogTitle>
            <AlertDialogDescription>
              The user will lose access to the admin panel immediately. You can re-assign the role at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRemoveRole} disabled={removing} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {removing ? "Removing…" : "Remove role"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default UserRoles;
