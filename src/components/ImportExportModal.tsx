import React, { useState, useRef } from "react";
import {
  X,
  Download,
  Upload,
  Copy,
  Check,
  FileJson,
  ShieldAlert,
  FolderSync,
} from "lucide-react";
import { useAppStore } from "../store/useAppStore";

export const ImportExportModal: React.FC = () => {
  const {
    importExportModalOpen,
    setImportExportModalOpen,
    exportVaultBundle,
    importVaultBundle,
    hosts,
    groups,
    credentials,
    snippets,
    aliases,
  } = useAppStore();

  const [tab, setTab] = useState<"export" | "import">("export");
  const [includeSecrets, setIncludeSecrets] = useState(true);
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [importText, setImportText] = useState("");
  const [copied, setCopied] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!importExportModalOpen) return null;

  const exportedJson = exportVaultBundle(includeSecrets);

  const handleDownloadFile = () => {
    const blob = new Blob([exportedJson], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `soliton-term-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyJson = async () => {
    try {
      await navigator.clipboard.writeText(exportedJson);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      if (typeof ev.target?.result === "string") {
        setImportText(ev.target.result);
        setErrorMsg(null);
      }
    };
    reader.readAsText(file);
  };

  const handleImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    try {
      await importVaultBundle(importText, replaceExisting);
      setImportText("");
    } catch (err) {
      setErrorMsg(
        err instanceof SyntaxError
          ? "Invalid JSON format. Please check the Soliton Term export bundle."
          : err instanceof Error
            ? err.message
            : "Import failed."
      );
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-xl bg-app-panel border border-app-border rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 bg-app-sidebar border-b border-app-border flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <FolderSync className="w-5 h-5 text-app-accent" />
            <div>
              <h2 className="text-sm font-bold text-app-text">
                Workspace Sharing — Export & Import
              </h2>
              <p className="text-[11px] text-app-muted">
                Export your servers, folders, credentials, snippets, and aliases or import a shared bundle
              </p>
            </div>
          </div>
          <button
            onClick={() => setImportExportModalOpen(false)}
            className="p-1.5 rounded-lg text-app-muted hover:text-app-text hover:bg-app-hover"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mode Switcher */}
        <div className="px-5 pt-4 flex gap-2">
          <button
            type="button"
            onClick={() => setTab("export")}
            className={`flex-1 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 border transition-all ${
              tab === "export"
                ? "bg-app-accent text-white border-app-accent shadow-sm"
                : "bg-app-bg text-app-muted border-app-border hover:text-app-text"
            }`}
          >
            <Download className="w-4 h-4" />
            <span>Export Bundle</span>
          </button>
          <button
            type="button"
            onClick={() => setTab("import")}
            className={`flex-1 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 border transition-all ${
              tab === "import"
                ? "bg-app-accent text-white border-app-accent shadow-sm"
                : "bg-app-bg text-app-muted border-app-border hover:text-app-text"
            }`}
          >
            <Upload className="w-4 h-4" />
            <span>Import Bundle</span>
          </button>
        </div>

        {tab === "export" ? (
          <div className="p-5 space-y-4 text-xs">
            {/* Summary badges */}
            <div className="grid grid-cols-5 gap-2 text-center">
              <div className="p-2 rounded-xl bg-app-bg border border-app-border">
                <div className="text-sm font-bold text-app-text">{hosts.length}</div>
                <div className="text-[10px] text-app-muted">Servers</div>
              </div>
              <div className="p-2 rounded-xl bg-app-bg border border-app-border">
                <div className="text-sm font-bold text-app-text">{groups.length}</div>
                <div className="text-[10px] text-app-muted">Folders</div>
              </div>
              <div className="p-2 rounded-xl bg-app-bg border border-app-border">
                <div className="text-sm font-bold text-app-text">{credentials.length}</div>
                <div className="text-[10px] text-app-muted">Credentials</div>
              </div>
              <div className="p-2 rounded-xl bg-app-bg border border-app-border">
                <div className="text-sm font-bold text-app-text">{snippets.length}</div>
                <div className="text-[10px] text-app-muted">Snippets</div>
              </div>
              <div className="p-2 rounded-xl bg-app-bg border border-app-border">
                <div className="text-sm font-bold text-app-text">{aliases.length}</div>
                <div className="text-[10px] text-app-muted">Aliases</div>
              </div>
            </div>

            <label className="flex items-center justify-between p-3 rounded-xl bg-app-bg border border-app-border cursor-pointer">
              <div className="flex items-center gap-2.5">
                <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
                <div>
                  <div className="font-semibold text-app-text">
                    Include Vault Passwords & SSH Private Keys
                  </div>
                  <div className="text-[11px] text-app-muted">
                    Uncheck this when sharing your server & snippet structure publicly with teammates.
                  </div>
                </div>
              </div>
              <input
                type="checkbox"
                checked={includeSecrets}
                onChange={(e) => setIncludeSecrets(e.target.checked)}
                className="w-4 h-4 accent-cyan-500"
              />
            </label>

            <textarea
              readOnly
              rows={7}
              value={exportedJson}
              className="w-full bg-app-bg border border-app-border rounded-xl p-3 font-mono text-[11px] text-app-muted focus:outline-none"
            />

            <div className="flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={handleCopyJson}
                className="px-4 py-2 rounded-xl bg-app-elevated hover:bg-app-hover border border-app-border text-app-text font-semibold flex items-center gap-1.5"
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4 text-app-success" />
                    <span className="text-app-success">Copied to Clipboard</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>Copy JSON</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={handleDownloadFile}
                className="px-4 py-2 rounded-xl bg-app-accent hover:bg-app-accent-hover text-white font-semibold flex items-center gap-1.5"
              >
                <Download className="w-4 h-4" />
                <span>Download .json File</span>
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleImportSubmit} className="p-5 space-y-4 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-app-muted">
                Select or Paste a Shared Soliton Term JSON Bundle
              </span>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                onChange={handleFileUpload}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-3 py-1.5 rounded-lg bg-app-elevated hover:bg-app-hover border border-app-border text-app-accent font-semibold flex items-center gap-1.5"
              >
                <FileJson className="w-3.5 h-3.5" />
                <span>Choose File (.json)</span>
              </button>
            </div>

            <textarea
              rows={7}
              required
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder='{"schema": "soliton-term-bundle-v1", "hosts": [...], ...}'
              className="w-full bg-app-bg border border-app-border rounded-xl p-3 font-mono text-[11px] text-app-text focus:outline-none focus:border-app-accent"
            />

            <label className="flex items-center justify-between p-3 rounded-xl bg-app-bg border border-app-border cursor-pointer">
              <div>
                <div className="font-semibold text-app-text">
                  Replace Existing Workspace (Overwrite All)
                </div>
                <div className="text-[11px] text-app-muted">
                  If unchecked, imported items will be merged into your existing folders and servers.
                </div>
              </div>
              <input
                type="checkbox"
                checked={replaceExisting}
                onChange={(e) => setReplaceExisting(e.target.checked)}
                className="w-4 h-4 accent-cyan-500"
              />
            </label>

            {errorMsg && (
              <div className="p-2.5 rounded-lg bg-red-500/15 border border-red-500/30 text-red-400">
                {errorMsg}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setImportExportModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-app-border text-app-muted hover:text-app-text"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-app-accent hover:bg-app-accent-hover text-white font-semibold flex items-center gap-1.5"
              >
                <Upload className="w-4 h-4" />
                <span>Import Bundle</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
