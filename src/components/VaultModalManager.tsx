import React, { useState, useEffect } from "react";
import {
  X,
  Server,
  FolderPlus,
  KeyRound,
  Code2,
  Wand2,
  Eye,
  EyeOff,
  Save,
  Copy,
  Trash2,
  AlertTriangle,
  ShieldCheck,
} from "lucide-react";
import { useAppStore } from "../store/useAppStore";

export const VaultModalManager: React.FC = () => {
  const {
    activeModal,
    setActiveModal,
    confirmModal,
    setConfirmModal,
    groups,
    credentials,
    upsertHost,
    duplicateHost,
    deleteHost,
    upsertGroup,
    deleteGroup,
    upsertCredential,
    upsertSnippet,
    upsertAlias,
  } = useAppStore();

  // Host form state
  const [hostName, setHostName] = useState("");
  const [hostname, setHostname] = useState("");
  const [port, setPort] = useState(22);
  const [groupId, setGroupId] = useState("");
  const [credentialId, setCredentialId] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [injectAliases, setInjectAliases] = useState(true);
  const [notes, setNotes] = useState("");

  // Group form state
  const [groupName, setGroupName] = useState("");
  const [parentGroupId, setParentGroupId] = useState<string>("");

  // Credential form state
  const [credName, setCredName] = useState("");
  const [credUsername, setCredUsername] = useState("");
  const [credType, setCredType] = useState<"password" | "ssh_key">("password");
  const [credSecret, setCredSecret] = useState("");
  const [credDesc, setCredDesc] = useState("");
  const [showSecret, setShowSecret] = useState(false);

  // Snippet form state
  const [snipName, setSnipName] = useState("");
  const [snipCategory, setSnipCategory] = useState("Diagnostics");
  const [snipCommand, setSnipCommand] = useState("");
  const [snipDesc, setSnipDesc] = useState("");

  // Alias form state
  const [aliasKey, setAliasKey] = useState("");
  const [aliasCmd, setAliasCmd] = useState("");
  const [aliasDesc, setAliasDesc] = useState("");
  const [aliasEnabled, setAliasEnabled] = useState(true);

  useEffect(() => {
    if (!activeModal) return;

    if (activeModal.type === "host") {
      const h = activeModal.item;
      setHostName(h?.name || "");
      setHostname(h?.hostname || "");
      setPort(h?.port || 22);
      setGroupId(
        h?.groupId || activeModal.defaultGroupId || groups[0]?.id || ""
      );
      setCredentialId(h?.credentialId || credentials[0]?.id || "");
      setTagsInput(h ? h.tags.join(", ") : "prod, linux");
      setInjectAliases(h ? h.injectAliases : true);
      setNotes(h?.notes || "");
    } else if (activeModal.type === "group") {
      const g = activeModal.item;
      setGroupName(g?.name || "");
      setParentGroupId(g?.parentId || activeModal.defaultParentId || "");
    } else if (activeModal.type === "credential") {
      const c = activeModal.item;
      setCredName(c?.name || "");
      setCredUsername(c?.username || "root");
      setCredType(c?.secretType || "password");
      setCredSecret(c?.secretValue || "");
      setCredDesc(c?.description || "");
      setShowSecret(false);
    } else if (activeModal.type === "snippet") {
      const s = activeModal.item;
      setSnipName(s?.name || "");
      setSnipCategory(s?.category || "Diagnostics");
      setSnipCommand(s?.command || "");
      setSnipDesc(s?.description || "");
    } else if (activeModal.type === "alias") {
      const a = activeModal.item;
      setAliasKey(a?.alias || "");
      setAliasCmd(a?.command || "");
      setAliasDesc(a?.description || "");
      setAliasEnabled(a ? a.enabled : true);
    }
  }, [activeModal, groups, credentials]);

  if (!activeModal && !confirmModal) return null;

  const handleHostSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hostName.trim() || !hostname.trim()) return;
    const tags = tagsInput
      .split(",")
      .map((t) => t.trim().replace(/^#/, ""))
      .filter(Boolean);

    await upsertHost({
      id:
        activeModal && activeModal.type === "host" && activeModal.item
          ? activeModal.item.id
          : `host-${Date.now()}`,
      name: hostName.trim(),
      hostname: hostname.trim(),
      port: Number(port) || 22,
      groupId: groupId || groups[0]?.id || "grp-prod",
      credentialId: credentialId || credentials[0]?.id || "cred-root-prod",
      tags,
      os: "linux",
      injectAliases,
      notes: notes.trim() || undefined,
    });
  };

  const handleGroupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupName.trim()) return;
    await upsertGroup({
      id:
        activeModal && activeModal.type === "group" && activeModal.item
          ? activeModal.item.id
          : `grp-${Date.now()}`,
      name: groupName.trim(),
      parentId: parentGroupId || null,
    });
  };

  const handleCredSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!credName.trim() || !credUsername.trim()) return;
    await upsertCredential({
      id:
        activeModal && activeModal.type === "credential" && activeModal.item
          ? activeModal.item.id
          : `cred-${Date.now()}`,
      name: credName.trim(),
      username: credUsername.trim(),
      secretType: credType,
      secretValue: credSecret,
      description: credDesc.trim() || undefined,
    });
  };

  const handleSnippetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!snipName.trim() || !snipCommand.trim()) return;
    await upsertSnippet({
      id:
        activeModal && activeModal.type === "snippet" && activeModal.item
          ? activeModal.item.id
          : `snip-${Date.now()}`,
      name: snipName.trim(),
      category: snipCategory.trim() || "General",
      command: snipCommand.trim(),
      description: snipDesc.trim(),
    });
  };

  const handleAliasSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aliasKey.trim() || !aliasCmd.trim()) return;
    await upsertAlias({
      id:
        activeModal && activeModal.type === "alias" && activeModal.item
          ? activeModal.item.id
          : `al-${Date.now()}`,
      alias: aliasKey.trim(),
      command: aliasCmd.trim(),
      description: aliasDesc.trim(),
      enabled: aliasEnabled,
    });
  };

  return (
    <>
      {/* CONFIRMATION POPUP MODAL */}
      {confirmModal && (
        <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-app-panel border border-app-border rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-5 py-3.5 bg-app-sidebar border-b border-app-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                {confirmModal.type === "duplicate-host" ? (
                  <Copy className="w-4 h-4 text-app-accent" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-app-danger" />
                )}
                <h2 className="text-sm font-bold text-app-text">
                  {confirmModal.type === "duplicate-host" && "Duplicate Server"}
                  {confirmModal.type === "delete-host" && "Delete Server"}
                  {confirmModal.type === "delete-group" && "Delete Folder"}
                </h2>
              </div>
              <button
                onClick={() => setConfirmModal(null)}
                className="p-1 rounded-lg text-app-muted hover:text-app-text hover:bg-app-hover transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              {confirmModal.type === "duplicate-host" && (
                <p className="text-app-muted leading-relaxed">
                  Are you sure you want to clone{" "}
                  <span className="font-semibold text-app-text">
                    {confirmModal.host.name}
                  </span>{" "}
                  (<span className="font-mono">{confirmModal.host.hostname}</span>) as{" "}
                  <span className="font-semibold text-app-accent">
                    {confirmModal.host.name} (copy)
                  </span>
                  ?
                </p>
              )}

              {confirmModal.type === "delete-host" && (
                <p className="text-app-muted leading-relaxed">
                  Are you sure you want to permanently delete server{" "}
                  <span className="font-semibold text-app-text">
                    {confirmModal.host.name}
                  </span>{" "}
                  (<span className="font-mono">{confirmModal.host.hostname}</span>)? This
                  action cannot be undone.
                </p>
              )}

              {confirmModal.type === "delete-group" && (
                <p className="text-app-muted leading-relaxed">
                  Are you sure you want to delete folder{" "}
                  <span className="font-semibold text-app-text">
                    {confirmModal.group.name}
                  </span>
                  ? Any servers inside will be moved to the parent or default folder.
                </p>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setConfirmModal(null)}
                  className="px-3.5 py-1.5 rounded-lg border border-app-border text-app-muted hover:text-app-text transition-colors"
                >
                  Cancel
                </button>

                {confirmModal.type === "duplicate-host" && (
                  <button
                    type="button"
                    onClick={async () => {
                      await duplicateHost(confirmModal.host.id);
                      setConfirmModal(null);
                      setActiveModal(null);
                    }}
                    className="px-3.5 py-1.5 rounded-lg bg-app-accent hover:bg-app-accent-hover text-white font-semibold flex items-center gap-1.5 transition-colors"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>Duplicate</span>
                  </button>
                )}

                {confirmModal.type === "delete-host" && (
                  <button
                    type="button"
                    onClick={async () => {
                      await deleteHost(confirmModal.host.id);
                      setConfirmModal(null);
                    }}
                    className="px-3.5 py-1.5 rounded-lg bg-app-danger hover:opacity-90 text-white font-semibold flex items-center gap-1.5 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Server</span>
                  </button>
                )}

                {confirmModal.type === "delete-group" && (
                  <button
                    type="button"
                    onClick={async () => {
                      await deleteGroup(confirmModal.group.id);
                      setConfirmModal(null);
                    }}
                    className="px-3.5 py-1.5 rounded-lg bg-app-danger hover:opacity-90 text-white font-semibold flex items-center gap-1.5 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Folder</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeModal && (
        <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-app-panel border border-app-border rounded-2xl shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="px-5 py-3.5 bg-app-sidebar border-b border-app-border flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                {activeModal.type === "host" && <Server className="w-4 h-4 text-app-accent" />}
                {activeModal.type === "group" && <FolderPlus className="w-4 h-4 text-app-accent" />}
                {activeModal.type === "credential" && <KeyRound className="w-4 h-4 text-app-accent" />}
                {activeModal.type === "snippet" && <Code2 className="w-4 h-4 text-app-accent" />}
                {activeModal.type === "alias" && <Wand2 className="w-4 h-4 text-purple-400" />}
                <h2 className="text-sm font-bold text-app-text">
                  {activeModal.type === "host" &&
                    (activeModal.item ? "Edit SSH Server" : "Add New SSH Server")}
                  {activeModal.type === "group" &&
                    (activeModal.item ? "Edit Folder / Group" : "Create New Folder / Group")}
                  {activeModal.type === "credential" &&
                    (activeModal.item ? "Edit Vault Credential" : "Add Credential to Vault")}
                  {activeModal.type === "snippet" &&
                    (activeModal.item ? "Edit Script Snippet" : "Add New Script Snippet")}
                  {activeModal.type === "alias" &&
                    (activeModal.item ? "Edit Temporary Alias" : "Add Temporary Session Alias")}
                </h2>
              </div>
              <button
                onClick={() => setActiveModal(null)}
                className="p-1 rounded-lg text-app-muted hover:text-app-text hover:bg-app-hover transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* HOST FORM */}
            {activeModal.type === "host" && (
              <form onSubmit={handleHostSubmit} className="p-5 space-y-3.5 text-xs">
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2 space-y-1">
                <label className="font-semibold text-app-muted">Server Label / Name</label>
                <input
                  type="text"
                  required
                  value={hostName}
                  onChange={(e) => setHostName(e.target.value)}
                  placeholder="e.g. prod-k8s-worker-03"
                  className="w-full bg-app-bg border border-app-border rounded-lg px-3 py-2 text-app-text focus:outline-none focus:border-app-accent"
                />
              </div>
              <div className="space-y-1">
                <label className="font-semibold text-app-muted">SSH Port</label>
                <input
                  type="number"
                  required
                  value={port}
                  onChange={(e) => setPort(Number(e.target.value))}
                  className="w-full bg-app-bg border border-app-border rounded-lg px-3 py-2 font-mono text-app-text focus:outline-none focus:border-app-accent"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-app-muted">IP Address or Hostname</label>
              <input
                type="text"
                required
                value={hostname}
                onChange={(e) => setHostname(e.target.value)}
                placeholder="e.g. 10.240.10.55 or srv01.soliton.local"
                className="w-full bg-app-bg border border-app-border rounded-lg px-3 py-2 font-mono text-app-text focus:outline-none focus:border-app-accent"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="font-semibold text-app-muted">Folder / Group</label>
                <select
                  value={groupId}
                  onChange={(e) => setGroupId(e.target.value)}
                  className="w-full bg-app-bg border border-app-border rounded-lg px-3 py-2 text-app-text focus:outline-none focus:border-app-accent"
                >
                  {groups.map((g) => (
                    <option key={g.id} value={g.id} className="bg-slate-900 text-white">
                      📁 {g.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="font-semibold text-app-muted">Vault Credential</label>
                <select
                  value={credentialId}
                  onChange={(e) => setCredentialId(e.target.value)}
                  className="w-full bg-app-bg border border-app-border rounded-lg px-3 py-2 text-app-text focus:outline-none focus:border-app-accent"
                >
                  {credentials.map((c) => (
                    <option key={c.id} value={c.id} className="bg-slate-900 text-white">
                      🔑 {c.name} ({c.username})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-app-muted">
                Tags (Comma separated)
              </label>
              <input
                type="text"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="prod, k8s, database, dmz"
                className="w-full bg-app-bg border border-app-border rounded-lg px-3 py-2 font-mono text-app-text focus:outline-none focus:border-app-accent"
              />
            </div>

            <label className="flex items-center justify-between p-3 rounded-xl bg-app-bg border border-app-border cursor-pointer">
              <div>
                <div className="font-semibold text-app-text flex items-center gap-1.5">
                  <Wand2 className="w-3.5 h-3.5 text-purple-400" />
                  Auto-Inject Temporary Aliases on Connect
                </div>
                <p className="text-[11px] text-app-muted">
                  Loads your personal aliases in-memory without modifying ~/.bashrc.
                </p>
              </div>
              <input
                type="checkbox"
                checked={injectAliases}
                onChange={(e) => setInjectAliases(e.target.checked)}
                className="w-4 h-4 accent-cyan-500"
              />
            </label>

            <div className="flex items-center justify-between gap-2 pt-2">
              <div>
                {activeModal.item && (
                  <button
                    type="button"
                    onClick={() => {
                      if (activeModal.item) {
                        setConfirmModal({
                          type: "duplicate-host",
                          host: activeModal.item,
                        });
                      }
                    }}
                    className="px-3 py-2 rounded-lg border border-app-border bg-app-bg hover:bg-app-hover text-app-text font-medium flex items-center gap-1.5 transition-colors"
                    title="Create a duplicate of this server with (copy)"
                  >
                    <Copy className="w-3.5 h-3.5 text-app-accent" />
                    <span>Duplicate</span>
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  className="px-4 py-2 rounded-lg border border-app-border text-app-muted hover:text-app-text"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-app-accent hover:bg-app-accent-hover text-white font-semibold flex items-center gap-1.5"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Save Server</span>
                </button>
              </div>
            </div>
          </form>
        )}

        {/* GROUP FORM */}
        {activeModal.type === "group" && (
          <form onSubmit={handleGroupSubmit} className="p-5 space-y-4 text-xs">
            <div className="space-y-1">
              <label className="font-semibold text-app-muted">Folder / Group Name</label>
              <input
                type="text"
                required
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="e.g. AWS Frankfurt Region"
                className="w-full bg-app-bg border border-app-border rounded-lg px-3 py-2 text-app-text focus:outline-none focus:border-app-accent"
              />
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-app-muted">Parent Folder (Optional)</label>
              <select
                value={parentGroupId}
                onChange={(e) => setParentGroupId(e.target.value)}
                className="w-full bg-app-bg border border-app-border rounded-lg px-3 py-2 text-app-text focus:outline-none focus:border-app-accent"
              >
                <option value="" className="bg-slate-900 text-white">
                  -- Root Level --
                </option>
                {groups
                  .filter(
                    (g) =>
                      !(
                        activeModal.type === "group" &&
                        activeModal.item &&
                        (g.id === activeModal.item.id ||
                          g.parentId === activeModal.item.id)
                      )
                  )
                  .map((g) => (
                    <option key={g.id} value={g.id} className="bg-slate-900 text-white">
                      📁 {g.name}
                    </option>
                  ))}
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="px-4 py-2 rounded-lg border border-app-border text-app-muted hover:text-app-text"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-app-accent hover:bg-app-accent-hover text-white font-semibold flex items-center gap-1.5"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save Folder</span>
              </button>
            </div>
          </form>
        )}

        {/* CREDENTIAL VAULT FORM */}
        {activeModal.type === "credential" && (
          <form onSubmit={handleCredSubmit} className="p-5 space-y-3.5 text-xs">
            <div className="p-2.5 rounded-xl bg-app-accent/10 border border-app-accent/30 flex items-center gap-2 text-app-accent">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span className="text-[11px]">
                Credentials are encrypted at rest with <strong>AES-256-GCM</strong> in your local SQLite Vault.
              </span>
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-app-muted">Credential Label</label>
              <input
                type="text"
                required
                value={credName}
                onChange={(e) => setCredName(e.target.value)}
                placeholder="e.g. Prod Root SSH Key"
                className="w-full bg-app-bg border border-app-border rounded-lg px-3 py-2 text-app-text focus:outline-none focus:border-app-accent"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="font-semibold text-app-muted">SSH Username</label>
                <input
                  type="text"
                  required
                  value={credUsername}
                  onChange={(e) => setCredUsername(e.target.value)}
                  placeholder="root / ubuntu / admin"
                  className="w-full bg-app-bg border border-app-border rounded-lg px-3 py-2 font-mono text-app-text focus:outline-none focus:border-app-accent"
                />
              </div>
              <div className="space-y-1">
                <label className="font-semibold text-app-muted">Auth Type</label>
                <select
                  value={credType}
                  onChange={(e) => setCredType(e.target.value as "password" | "ssh_key")}
                  className="w-full bg-app-bg border border-app-border rounded-lg px-3 py-2 text-app-text focus:outline-none focus:border-app-accent"
                >
                  <option value="password" className="bg-slate-900 text-white">
                    Password
                  </option>
                  <option value="ssh_key" className="bg-slate-900 text-white">
                    SSH Private Key (Ed25519 / RSA)
                  </option>
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-app-muted">
                {credType === "password" ? "Password" : "SSH Private Key Content"}
              </label>
              <div className="relative">
                <input
                  type={showSecret ? "text" : "password"}
                  required
                  value={credSecret}
                  onChange={(e) => setCredSecret(e.target.value)}
                  placeholder="••••••••••••••••"
                  className="w-full bg-app-bg border border-app-border rounded-lg pl-3 pr-9 py-2 font-mono text-app-text focus:outline-none focus:border-app-accent"
                />
                <button
                  type="button"
                  onClick={() => setShowSecret(!showSecret)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-app-muted hover:text-app-text"
                >
                  {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-app-muted">Description (Optional)</label>
              <input
                type="text"
                value={credDesc}
                onChange={(e) => setCredDesc(e.target.value)}
                placeholder="Notes on which cluster uses this credential..."
                className="w-full bg-app-bg border border-app-border rounded-lg px-3 py-2 text-app-text focus:outline-none focus:border-app-accent"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="px-4 py-2 rounded-lg border border-app-border text-app-muted hover:text-app-text"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-app-accent hover:bg-app-accent-hover text-white font-semibold flex items-center gap-1.5"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Encrypt & Save</span>
              </button>
            </div>
          </form>
        )}

        {/* SNIPPET FORM */}
        {activeModal.type === "snippet" && (
          <form onSubmit={handleSnippetSubmit} className="p-5 space-y-3.5 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="font-semibold text-app-muted">Snippet Name</label>
                <input
                  type="text"
                  required
                  value={snipName}
                  onChange={(e) => setSnipName(e.target.value)}
                  placeholder="e.g. Nginx Reload & Check"
                  className="w-full bg-app-bg border border-app-border rounded-lg px-3 py-2 text-app-text focus:outline-none focus:border-app-accent"
                />
              </div>
              <div className="space-y-1">
                <label className="font-semibold text-app-muted">Category</label>
                <input
                  type="text"
                  value={snipCategory}
                  onChange={(e) => setSnipCategory(e.target.value)}
                  placeholder="Diagnostics / Kubernetes / Docker"
                  className="w-full bg-app-bg border border-app-border rounded-lg px-3 py-2 text-app-text focus:outline-none focus:border-app-accent"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-app-muted">
                Shell Command (Supports {"{{variable}}"} placeholders)
              </label>
              <textarea
                rows={3}
                required
                value={snipCommand}
                onChange={(e) => setSnipCommand(e.target.value)}
                placeholder="kubectl logs -n {{namespace}} -l app={{service}}"
                className="w-full bg-app-bg border border-app-border rounded-lg px-3 py-2 font-mono text-app-text focus:outline-none focus:border-app-accent"
              />
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-app-muted">Description</label>
              <input
                type="text"
                value={snipDesc}
                onChange={(e) => setSnipDesc(e.target.value)}
                placeholder="What does this script do?"
                className="w-full bg-app-bg border border-app-border rounded-lg px-3 py-2 text-app-text focus:outline-none focus:border-app-accent"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="px-4 py-2 rounded-lg border border-app-border text-app-muted hover:text-app-text"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-app-accent hover:bg-app-accent-hover text-white font-semibold flex items-center gap-1.5"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save Snippet</span>
              </button>
            </div>
          </form>
        )}

        {/* ALIAS FORM */}
        {activeModal.type === "alias" && (
          <form onSubmit={handleAliasSubmit} className="p-5 space-y-3.5 text-xs">
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="font-semibold text-app-muted">Alias Shortcut</label>
                <input
                  type="text"
                  required
                  value={aliasKey}
                  onChange={(e) => setAliasKey(e.target.value)}
                  placeholder="e.g. k"
                  className="w-full bg-app-bg border border-app-border rounded-lg px-3 py-2 font-mono text-purple-400 font-bold focus:outline-none focus:border-app-accent"
                />
              </div>
              <div className="col-span-2 space-y-1">
                <label className="font-semibold text-app-muted">Target Command</label>
                <input
                  type="text"
                  required
                  value={aliasCmd}
                  onChange={(e) => setAliasCmd(e.target.value)}
                  placeholder="e.g. kubectl"
                  className="w-full bg-app-bg border border-app-border rounded-lg px-3 py-2 font-mono text-app-text focus:outline-none focus:border-app-accent"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-app-muted">Description</label>
              <input
                type="text"
                value={aliasDesc}
                onChange={(e) => setAliasDesc(e.target.value)}
                placeholder="e.g. Quick kubectl shorthand"
                className="w-full bg-app-bg border border-app-border rounded-lg px-3 py-2 text-app-text focus:outline-none focus:border-app-accent"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="px-4 py-2 rounded-lg border border-app-border text-app-muted hover:text-app-text"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-app-accent hover:bg-app-accent-hover text-white font-semibold flex items-center gap-1.5"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save Alias</span>
              </button>
            </div>
          </form>
        )}
          </div>
        </div>
      )}
    </>
  );
};
