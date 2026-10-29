import React, { useState } from "react";
import {
  Search,
  Copy,
  Check,
  Radio,
  Sun,
  Moon,
  Eclipse,
  ArrowUpDown,
  Palette,
} from "lucide-react";
import { useAppStore, AppTheme } from "../store/useAppStore";
import { TERMINAL_THEMES } from "../themes/terminalThemes";

export const TopBar: React.FC = () => {
  const {
    appTheme,
    setAppTheme,
    terminalThemeId,
    setTerminalThemeId,
    selectedHostId,
    hosts,
    credentials,
    broadcastMode,
    setBroadcastMode,
    setCommandPaletteOpen,
    setImportExportModalOpen,
  } = useAppStore();

  const [copiedType, setCopiedType] = useState<"user" | "pass" | "host" | null>(null);
  const [showAppearanceMenu, setShowAppearanceMenu] = useState(false);

  const activeHost = hosts.find((h) => h.id === selectedHostId) || hosts[0];
  const activeCred = credentials.find((c) => c.id === activeHost?.credentialId);

  const handleCopy = async (text: string, type: "user" | "pass" | "host") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedType(type);
      setTimeout(() => setCopiedType(null), 1500);
    } catch {
      // Fallback
    }
  };

  const themes: { id: AppTheme; label: string; icon: React.ReactNode }[] = [
    { id: "dark-black", label: "Dark Black", icon: <Eclipse className="w-3.5 h-3.5" /> },
    { id: "dark-blue", label: "Dark Blue", icon: <Moon className="w-3.5 h-3.5" /> },
    { id: "light", label: "Light", icon: <Sun className="w-3.5 h-3.5" /> },
  ];

  return (
    <header className="h-12 bg-app-sidebar border-b border-app-border px-3 flex items-center justify-between gap-4 shrink-0 relative z-30">
      {/* Left: Brand & Search */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 select-none pr-1">
          <img
            src={
              appTheme === "light"
                ? "/soliton-mark-light-compact.svg"
                : "/soliton-mark-compact.svg"
            }
            alt="Soliton Term"
            className="w-6 h-6 object-contain"
            draggable={false}
          />
          <img
            src={
              appTheme === "light"
                ? "/soliton-font-dark.png"
                : "/soliton-font-white.png"
            }
            alt="SolitonTerm"
            className="h-3.5 w-auto object-contain opacity-95"
            draggable={false}
          />
        </div>

        {/* Minimal Search Trigger */}
        <button
          type="button"
          onClick={() => setCommandPaletteOpen(true)}
          className="flex items-center justify-between gap-8 px-2.5 py-1 rounded-lg bg-app-bg hover:bg-app-hover border border-app-border text-xs text-app-muted hover:text-app-text transition-colors"
        >
          <span className="flex items-center gap-1.5">
            <Search className="w-3.5 h-3.5" />
            <span>Search</span>
          </span>
          <kbd className="text-[10px] font-mono text-app-muted/80">⌘K</kbd>
        </button>
      </div>

      {/* Center: Minimalist Quick Copy Bar (Active Server + Username + Password) */}
      {activeHost && activeCred && (
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() =>
              handleCopy(`${activeHost.hostname}:${activeHost.port}`, "host")
            }
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg hover:bg-app-hover text-xs text-app-muted hover:text-app-text transition-colors"
            title={`${activeHost.hostname}:${activeHost.port} (Click to copy)`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-app-success" />
            <span className="font-medium text-app-text">{activeHost.name}</span>
            {copiedType === "host" && (
              <Check className="w-3 h-3 text-app-success" />
            )}
          </button>

          {/* Clean Username Copy Button */}
          <button
            type="button"
            onClick={() => handleCopy(activeCred.username, "user")}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-app-bg hover:bg-app-hover border border-app-border text-xs text-app-text transition-all active:scale-95"
            title={`Copy username (${activeCred.username})`}
          >
            <span>Username</span>
            {copiedType === "user" ? (
              <Check className="w-3.5 h-3.5 text-app-success" />
            ) : (
              <Copy className="w-3.5 h-3.5 text-app-muted" />
            )}
          </button>

          {/* Clean Password Copy Button */}
          <button
            type="button"
            onClick={() => handleCopy(activeCred.secretValue, "pass")}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-app-bg hover:bg-app-hover border border-app-border text-xs text-app-text transition-all active:scale-95"
            title="Copy password / key"
          >
            <span>Password</span>
            {copiedType === "pass" ? (
              <Check className="w-3.5 h-3.5 text-app-success" />
            ) : (
              <Copy className="w-3.5 h-3.5 text-app-muted" />
            )}
          </button>
        </div>
      )}

      {/* Right: Clean Minimalist Action Icons */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => setBroadcastMode(!broadcastMode)}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
            broadcastMode
              ? "bg-amber-500/15 text-amber-400"
              : "text-app-muted hover:text-app-text hover:bg-app-hover"
          }`}
          title="Multi-Exec Broadcast"
        >
          <Radio className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Multi-Exec</span>
        </button>

        <button
          type="button"
          onClick={() => setImportExportModalOpen(true)}
          className="p-1.5 rounded-lg text-app-muted hover:text-app-text hover:bg-app-hover transition-colors"
          title="Export / Import Workspace"
        >
          <ArrowUpDown className="w-4 h-4" />
        </button>

        {/* Clean Appearance Popover */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowAppearanceMenu(!showAppearanceMenu)}
            className="p-1.5 rounded-lg text-app-muted hover:text-app-text hover:bg-app-hover transition-colors"
            title="Themes"
          >
            <Palette className="w-4 h-4" />
          </button>

          {showAppearanceMenu && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShowAppearanceMenu(false)}
              />
              <div className="absolute right-0 mt-2 w-64 bg-app-panel border border-app-border rounded-xl shadow-2xl p-3.5 space-y-3.5 z-50">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium text-app-muted">
                    Theme
                  </label>
                  <div className="grid grid-cols-3 gap-1">
                    {themes.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setAppTheme(t.id)}
                        className={`flex flex-col items-center gap-1 py-1.5 px-1 rounded-lg border text-[11px] transition-all ${
                          appTheme === t.id
                            ? "bg-app-hover text-app-text border-app-accent/60 font-medium"
                            : "bg-app-bg border-app-border text-app-muted hover:text-app-text"
                        }`}
                      >
                        {t.icon}
                        <span>{t.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium text-app-muted">
                    Terminal Palette
                  </label>
                  <select
                    value={terminalThemeId}
                    onChange={(e) => setTerminalThemeId(e.target.value)}
                    className="w-full bg-app-bg border border-app-border rounded-lg px-2.5 py-1.5 text-xs text-app-text focus:outline-none focus:border-app-accent"
                  >
                    {TERMINAL_THEMES.map((t) => (
                      <option
                        key={t.id}
                        value={t.id}
                        className="bg-zinc-900 text-white"
                      >
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
};
