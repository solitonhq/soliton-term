import React, { useState, useEffect, useMemo } from "react";
import { X, Play, Code2, Radio, Terminal } from "lucide-react";
import { useAppStore } from "../store/useAppStore";

export const ParametricSnippetRunnerModal: React.FC = () => {
  const {
    pendingSnippetToRun,
    clearPendingSnippet,
    dispatchCommandToTerminals,
    tabs,
    activeTabId,
    broadcastMode,
    broadcastTargetTabIds,
  } = useAppStore();

  const [values, setValues] = useState<Record<string, string>>({});
  const [runScope, setRunScope] = useState<"active" | "broadcast">("active");

  const variables = useMemo(() => {
    if (!pendingSnippetToRun) return [];
    const matches = Array.from(
      pendingSnippetToRun.command.matchAll(/\{\{\s*([\w-]+)\s*\}\}/g)
    );
    return Array.from(new Set(matches.map((m) => m[1])));
  }, [pendingSnippetToRun]);

  useEffect(() => {
    if (pendingSnippetToRun) {
      const defaults: Record<string, string> = {};
      variables.forEach((v) => {
        if (v === "namespace") defaults[v] = "default";
        else if (v === "lines") defaults[v] = "100";
        else if (v === "port") defaults[v] = "8080";
        else defaults[v] = "";
      });
      setValues(defaults);
      setRunScope(broadcastMode ? "broadcast" : "active");
    }
  }, [pendingSnippetToRun, variables, broadcastMode]);

  if (!pendingSnippetToRun) return null;

  const resolvedCommand = variables.reduce((cmd, varName) => {
    const val = values[varName] || `<${varName}>`;
    return cmd.replace(new RegExp(`\\{\\{\\s*${varName}\\s*\\}\\}`, "g"), val);
  }, pendingSnippetToRun.command);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const targetIds =
      runScope === "broadcast"
        ? broadcastTargetTabIds.length > 0
          ? broadcastTargetTabIds
          : tabs.map((t) => t.id)
        : activeTabId
        ? [activeTabId]
        : [];
    dispatchCommandToTerminals(resolvedCommand, targetIds);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-app-panel border border-app-border rounded-2xl shadow-2xl overflow-hidden">
        <div className="px-5 py-3.5 bg-app-sidebar border-b border-app-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Code2 className="w-4 h-4 text-app-accent" />
            <h2 className="text-sm font-bold text-app-text">
              Parametric Snippet Runner — {pendingSnippetToRun.name}
            </h2>
          </div>
          <button
            onClick={clearPendingSnippet}
            className="p-1 rounded-lg text-app-muted hover:text-app-text"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          <p className="text-app-muted">{pendingSnippetToRun.description}</p>

          <div className="space-y-3">
            {variables.map((v) => (
              <div key={v} className="space-y-1">
                <label className="font-mono font-semibold text-app-accent">
                  Value for {`{{${v}}}`}:
                </label>
                <input
                  type="text"
                  required
                  value={values[v] || ""}
                  onChange={(e) =>
                    setValues((prev) => ({ ...prev, [v]: e.target.value }))
                  }
                  placeholder={`Enter ${v}...`}
                  className="w-full bg-app-bg border border-app-border rounded-lg px-3 py-2 font-mono text-app-text focus:outline-none focus:border-app-accent"
                />
              </div>
            ))}
          </div>

          <div className="space-y-1">
            <label className="font-semibold text-app-muted">
              Resolved Command Preview:
            </label>
            <pre className="p-2.5 rounded-xl bg-app-bg border border-app-border font-mono text-[11px] text-emerald-400 overflow-x-auto">
              $ {resolvedCommand}
            </pre>
          </div>

          {/* Target Scope Selection */}
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              type="button"
              onClick={() => setRunScope("active")}
              className={`p-2.5 rounded-xl border flex items-center gap-2 text-left transition-all ${
                runScope === "active"
                  ? "bg-app-accent/15 border-app-accent text-app-text"
                  : "bg-app-bg border-app-border text-app-muted"
              }`}
            >
              <Terminal className="w-4 h-4 text-app-accent shrink-0" />
              <div>
                <div className="font-semibold">Active Tab Only</div>
                <div className="text-[10px] opacity-80">Run on current session</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setRunScope("broadcast")}
              className={`p-2.5 rounded-xl border flex items-center gap-2 text-left transition-all ${
                runScope === "broadcast"
                  ? "bg-amber-500/15 border-amber-500 text-amber-300"
                  : "bg-app-bg border-app-border text-app-muted"
              }`}
            >
              <Radio className="w-4 h-4 text-amber-400 shrink-0" />
              <div>
                <div className="font-semibold">Selected Servers</div>
                <div className="text-[10px] opacity-80">
                  Run across {broadcastTargetTabIds.length || tabs.length} sessions
                </div>
              </div>
            </button>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={clearPendingSnippet}
              className="px-4 py-2 rounded-lg border border-app-border text-app-muted hover:text-app-text"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-app-accent hover:bg-app-accent-hover text-white font-semibold flex items-center gap-1.5"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Execute Command</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
