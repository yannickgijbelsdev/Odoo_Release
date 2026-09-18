import React, { useEffect, useState, useCallback } from "react";
import { Loader2, Plus, Pencil, Trash2, Upload, Shield, User as UserIcon } from "lucide-react";
import { api, apiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

function fileToAvatar(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const max = 256;
        const scale = Math.min(max / img.width, max / img.height, 1);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const initials = (u) => (u.name || u.email || "?").trim().slice(0, 2).toUpperCase();

export default function Users() {
  const { user: me, setUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [busy, setBusy] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ email: "", name: "", password: "", role: "user" });

  const [editUser, setEditUser] = useState(null);
  const [editForm, setEditForm] = useState({ name: "", role: "user", password: "", avatar: "" });

  const [deleteTarget, setDeleteTarget] = useState(null);

  const load = useCallback(async () => {
    try {
      const r = await api.get("/users");
      setUsers(r.data.users);
    } catch (e) {
      if (e.response?.status === 403) setForbidden(true);
      else toast.error(apiError(e.response?.data?.detail));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const submitCreate = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post("/users", form);
      toast.success("User created");
      setCreateOpen(false);
      setForm({ email: "", name: "", password: "", role: "user" });
      load();
    } catch (err) { toast.error(apiError(err.response?.data?.detail)); }
    finally { setBusy(false); }
  };

  const openEdit = (u) => {
    setEditUser(u);
    setEditForm({ name: u.name || "", role: u.role, password: "", avatar: u.avatar || "" });
  };

  const onAvatarPick = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) { toast.error("Image too large (max 4MB)"); return; }
    try {
      const dataUrl = await fileToAvatar(file);
      setEditForm((f) => ({ ...f, avatar: dataUrl }));
    } catch { toast.error("Could not read image"); }
  };

  const submitEdit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const payload = { name: editForm.name, role: editForm.role, avatar: editForm.avatar };
      if (editForm.password) payload.password = editForm.password;
      const r = await api.patch(`/users/${editUser.id}`, payload);
      toast.success("User updated");
      // if editing myself, refresh my session data (avatar/name in sidebar)
      if (me?.id === editUser.id) setUser((prev) => ({ ...prev, name: r.data.name, avatar: r.data.avatar, role: r.data.role }));
      setEditUser(null);
      load();
    } catch (err) { toast.error(apiError(err.response?.data?.detail)); }
    finally { setBusy(false); }
  };

  const confirmDelete = async () => {
    try {
      await api.delete(`/users/${deleteTarget.id}`);
      toast.success("User deleted");
      setDeleteTarget(null);
      load();
    } catch (err) { toast.error(apiError(err.response?.data?.detail)); setDeleteTarget(null); }
  };

  if (forbidden) {
    return (
      <div className="p-8 max-w-3xl mx-auto text-center">
        <Shield className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
        <h1 className="text-xl font-bold">Admin access required</h1>
        <p className="text-sm text-muted-foreground mt-1">Only administrators can manage users.</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl lg:text-3xl font-extrabold tracking-tight">User Management</h1>
          <p className="text-sm text-muted-foreground">Create users, set avatars, change passwords and roles</p>
        </div>
        <Button onClick={() => setCreateOpen(true)} data-testid="create-user-button">
          <Plus className="h-4 w-4 mr-2" /> New user
        </Button>
      </div>

      <div className="glass border border-border rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-12 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>
        ) : (
          <div className="divide-y divide-border/50">
            {users.map((u) => (
              <div key={u.id} className="p-4 flex items-center gap-4" data-testid={`user-row-${u.id}`}>
                <Avatar className="h-10 w-10">
                  {u.avatar ? <AvatarImage src={u.avatar} alt={u.name} /> : null}
                  <AvatarFallback className="text-xs bg-primary/15 text-primary">{initials(u)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{u.name} {me?.id === u.id && <span className="text-xs text-muted-foreground">(you)</span>}</p>
                  <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                </div>
                <Badge variant="outline" className={u.role === "admin" ? "bg-primary/15 text-primary border-primary/30" : "bg-slate-500/15 text-slate-400 border-slate-500/30"}>
                  {u.role === "admin" ? <Shield className="h-3 w-3 mr-1" /> : <UserIcon className="h-3 w-3 mr-1" />}{u.role}
                </Badge>
                <Badge variant="outline" className={u.mfa_enabled ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" : "bg-slate-500/15 text-slate-400 border-slate-500/30"}>
                  MFA {u.mfa_enabled ? "on" : "off"}
                </Badge>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(u)} data-testid={`edit-user-${u.id}`}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(u)} disabled={me?.id === u.id} data-testid={`delete-user-${u.id}`}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent data-testid="create-user-dialog">
          <DialogHeader><DialogTitle>New user</DialogTitle><DialogDescription>Create an account with a role and initial password.</DialogDescription></DialogHeader>
          <form onSubmit={submitCreate} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} data-testid="user-email-input" />
            </div>
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="user-name-input" />
            </div>
            <div className="space-y-1.5">
              <Label>Password (min 8 chars)</Label>
              <Input type="password" required minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} data-testid="user-password-input" />
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                <SelectTrigger data-testid="user-role-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">User</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={busy} data-testid="submit-create-user">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create user"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editUser} onOpenChange={(o) => !o && setEditUser(null)}>
        <DialogContent data-testid="edit-user-dialog">
          <DialogHeader><DialogTitle>Edit {editUser?.email}</DialogTitle><DialogDescription>Update the avatar, name, role or password.</DialogDescription></DialogHeader>
          <form onSubmit={submitEdit} className="space-y-4">
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16">
                {editForm.avatar ? <AvatarImage src={editForm.avatar} alt="" /> : null}
                <AvatarFallback className="bg-primary/15 text-primary">{editUser ? initials({ name: editForm.name, email: editUser.email }) : "?"}</AvatarFallback>
              </Avatar>
              <div>
                <input id="avatar-file" type="file" accept="image/*" className="hidden" onChange={onAvatarPick} data-testid="avatar-upload-input" />
                <Button type="button" variant="outline" size="sm" onClick={() => document.getElementById("avatar-file").click()}>
                  <Upload className="h-4 w-4 mr-2" /> Upload avatar
                </Button>
                {editForm.avatar && <Button type="button" variant="ghost" size="sm" onClick={() => setEditForm((f) => ({ ...f, avatar: "" }))}>Remove</Button>}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} data-testid="edit-name-input" />
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select value={editForm.role} onValueChange={(v) => setEditForm({ ...editForm, role: v })}>
                <SelectTrigger data-testid="edit-role-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">User</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>New password (leave blank to keep)</Label>
              <Input type="password" minLength={8} value={editForm.password} onChange={(e) => setEditForm({ ...editForm, password: e.target.value })} data-testid="edit-password-input" placeholder="••••••••" />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={busy} data-testid="submit-edit-user">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete user?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes <strong>{deleteTarget?.email}</strong>. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" data-testid="confirm-delete-user">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
