import React, { useState, useEffect, useMemo } from "react";
import {
  Search,
  Server,
  KeyRound,
  Code2,
  Wand2,
  Palette,
  Laptop,
  Radio,
  CornerDownLeft,
  X,
} from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import { TERMINAL_THEMES } from "../themes/terminalThemes";

interface PaletteAction {
  id: string;
  title: string;
  subtitle: string;
  category: string;
  icon: React.ReactNode;
  run: () => void;
}

export const CommandPaletteModal: React.FC = () => {
  const {
    commandPaletteOpen,
    setCommandPaletteOpen,
    hosts,
    credentials,
    snippets,
    aliases,
    openHostSession,
    openLocalTerminal,
    triggerSnippetExecution,
    dispatchCommandToTerminals,
    setAppTheme,
    setTerminalThemeId,
    broadcastMode,
    setBroadcastMode,
  } = useAppStore();

  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Global Cmd+K / Ctrl+K shortcut listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandPaletteOpen(!commandPaletteOpen);
      } else if (e.key === "Escape" && commandPaletteOpen) {
        setCommandPaletteOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [commandPaletteOpen, setCommandPaletteOpen]);

  useEffect(() => {
    if (commandPaletteOpen) {
      setQuery("");
      setSelectedIndex(0);
    }
  }, [commandPaletteOpen]);

  const actions = useMemo<PaletteAction[]>(() => {
    const list: PaletteAction[] = [];

    // 1. Hosts
    hosts.forEach((h) => {
      const cred = credentials.find((c) => c.id === h.credentialId);
      list.push({
        id: `host-${h.id}`,
        title: `Connect SSH: ${h.name}`,
        subtitle: `${cred?.username || "root"}@${h.hostname}:${h.port} (${h.tags
          .map((t) => `#${t}`)
          .join(" ")})`,
        category: "SSH Servers",
        icon: <Server className="w-4 h-4 text-app-accent" />,
        run: () => openHostSession(h),
      });
    });

    // 2. Quick Copy Credentials
    credentials.forEach((c) => {
      list.push({
        id: `cred-pass-${c.id}`,
        title: `Copy Vault Secret: ${c.name}`,
        subtitle: `User: ${c.username} (${c.secretType})`,
        category: "Credential Vault",
        icon: <KeyRound className="w-4 h-4 text-emerald-400" />,
        run: () => {
          navigator.clipboard.writeText(c.secretValue).catch(() => {});
        },
      });
    });

    // 3. Snippets
    snippets.forEach((s) => {
      list.push({
        id: `snip-${s.id}`,
        title: `Run Snippet: ${s.name}`,
        subtitle: s.command,
        category: "Snippets",
        icon: <Code2 className="w-4 h-4 text-amber-400" />,
        run: () => triggerSnippetExecution(s),
      });
    });

    // 4. Temporary Alias Injection
    const enabledAliases = aliases.filter(
      (a) => a.enabled && /^[a-zA-Z0-9_-]+$/.test(a.alias)
    );
    if (enabledAliases.length > 0) {
      const payload = ` export HISTCONTROL=ignorespace; ${enabledAliases
        .map((a) => `alias ${a.alias}='${a.command.replace(/'/g, "'\\''")}'`)
        .join("; ")}`;
      list.push({
        id: "action-inject-aliases",
        title: "Inject Temporary Aliases into Active Session",
        subtitle: `Loaded in-memory (${enabledAliases.map((a) => a.alias).join(", ")})`,
        category: "Alias Injector",
        icon: <Wand2 className="w-4 h-4 text-purple-400" />,
        run: () => dispatchCommandToTerminals(payload),
      });
    }

    // 5. Quick System Actions
    list.push({
      id: "action-local-shell",
      title: "Open New macOS Local Shell Tab",
      subtitle: "Launch local zsh/bash terminal",
      category: "System",
      icon: <Laptop className="w-4 h-4 text-emerald-400" />,
      run: () => openLocalTerminal(),
    });

    list.push({
      id: "action-toggle-broadcast",
      title: broadcastMode
        ? "Disable Multi-Execution (Broadcast) Mode"
        : "Enable Multi-Execution (Broadcast) Mode",
      subtitle: "Execute commands across multiple servers in parallel",
      category: "System",
      icon: <Radio className="w-4 h-4 text-amber-400" />,
      run: () => setBroadcastMode(!broadcastMode),
    });

    // 6. App Themes
    list.push(
      {
        id: "theme-dark-blue",
        title: "App Theme: Dark Blue (Termius Default)",
        subtitle: "Deep navy background with neon cyan accents",
        category: "Themes",
        icon: <Palette className="w-4 h-4 text-cyan-400" />,
        run: () => setAppTheme("dark-blue"),
      },
      {
        id: "theme-dark-black",
        title: "App Theme: Dark Black (OLED Pitch Black)",
        subtitle: "Pure black high-contrast interface",
        category: "Themes",
        icon: <Palette className="w-4 h-4 text-zinc-300" />,
        run: () => setAppTheme("dark-black"),
      },
      {
        id: "theme-light",
        title: "App Theme: Light (Clean macOS)",
        subtitle: "Daylight enterprise appearance",
        category: "Themes",
        icon: <Palette className="w-4 h-4 text-sky-500" />,
        run: () => setAppTheme("light"),
      }
    );

    // 7. Terminal Color Schemes
    TERMINAL_THEMES.forEach((t) => {
      list.push({
        id: `term-theme-${t.id}`,
        title: `Terminal Palette: ${t.name}`,
        subtitle: `Category: ${t.category.toUpperCase()}`,
        category: "Terminal Palettes",
        icon: <Palette className="w-4 h-4 text-app-accent" />,
        run: () => setTerminalThemeId(t.id),
      });
    });

    return list;
  }, [
    hosts,
    credentials,
    snippets,
    aliases,
    broadcastMode,
    openHostSession,
    openLocalTerminal,
    triggerSnippetExecution,
    dispatchCommandToTerminals,
    setAppTheme,
    setTerminalThemeId,
    setBroadcastMode,
  ]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return actions.slice(0, 14);
    return actions.filter(
      (a) =>
        a.title.toLowerCase().includes(q) ||
        a.subtitle.toLowerCase().includes(q) ||
        a.category.toLowerCase().includes(q)
    );
  }, [actions, query]);

  if (!commandPaletteOpen) return null;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, filtered.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) =>
        prev - 1 < 0 ? Math.max(0, filtered.length - 1) : prev - 1
      );
    } else if (e.key === "Enter" && filtered[selectedIndex]) {
      e.preventDefault();
      filtered[selectedIndex].run();
      setCommandPaletteOpen(false);
    }
  };

  return (
    <div
      onClick={() => setCommandPaletteOpen(false)}
      className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex items-start justify-center pt-20 p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        className="w-full max-w-xl bg-app-panel border border-app-border rounded-2xl shadow-2xl overflow-hidden"
      >
        {/* Search Input Header */}
        <div className="px-4 py-3 bg-app-sidebar border-b border-app-border flex items-center gap-3">
          <Search className="w-4 h-4 text-app-accent shrink-0" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Search"
            className="flex-1 bg-transparent text-xs text-app-text placeholder:text-app-muted focus:outline-none"
          />
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-app-bg text-app-muted border border-app-border">
            ESC
          </span>
          <button
            onClick={() => setCommandPaletteOpen(false)}
            className="text-app-muted hover:text-app-text"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Results List */}
        <div className="max-h-96 overflow-y-auto p-2 space-y-1">
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-xs text-app-muted">
              No matching servers, commands, or themes found.
            </div>
          ) : (
            filtered.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={item.id}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  onClick={() => {
                    item.run();
                    setCommandPaletteOpen(false);
                  }}
                  className={`px-3 py-2 rounded-xl flex items-center justify-between gap-3 cursor-pointer transition-colors ${
                    isSelected
                      ? "bg-app-accent/15 border border-app-accent/40 text-app-text"
                      : "border border-transparent text-app-muted hover:bg-app-hover"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2 rounded-lg bg-app-bg border border-app-border shrink-0">
                      {item.icon}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-app-text truncate">
                        {item.title}
                      </div>
                      <div className="text-[10px] font-mono text-app-muted truncate">
                        {item.subtitle}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] px-2 py-0.5 rounded bg-app-bg text-app-muted">
                      {item.category}
                    </span>
                    {isSelected && (
                      <CornerDownLeft className="w-3.5 h-3.5 text-app-accent" />
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
