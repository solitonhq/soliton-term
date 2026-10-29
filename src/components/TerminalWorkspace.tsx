import React, { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import "@xterm/xterm/css/xterm.css";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  X,
  Plus,
  Terminal as TerminalIcon,
  Wand2,
  Send,
  Radio,
  Code2,
  Laptop,
  Search,
} from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import { TERMINAL_THEMES } from "../themes/terminalThemes";

const isTauriRuntime = () =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

const isLightHex = (hex?: string) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex ?? "");
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const lum = 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return lum > 150;
};

export const TerminalWorkspace: React.FC = () => {
  const {
    tabs,
    activeTabId,
    setActiveTabId,
    closeTab,
    hosts,
    credentials,
    aliases,
    snippets,
    terminalThemeId,
    terminalFontSize,
    sidebarCollapsed,
    sidebarWidth,
    broadcastMode,
    broadcastTargetTabIds,
    toggleBroadcastTargetTab,
    selectAllBroadcastTabs,
    triggerSnippetExecution,
    lastDispatchedCommand,
    openHostSession,
    openLocalTerminal,
  } = useAppStore();

  const [broadcastInput, setBroadcastInput] = useState("");
  const [showFindBar, setShowFindBar] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [showSnippetsMenu, setShowSnippetsMenu] = useState(false);

  const terminalContainersRef = useRef<Record<string, HTMLDivElement | null>>({});
  const terminalsRef = useRef<
    Record<
      string,
      { term: Terminal; fit: FitAddon; search: SearchAddon; isPtyLive: boolean }
    >
  >({});

  const currentThemeObj =
    TERMINAL_THEMES.find((t) => t.id === terminalThemeId) || TERMINAL_THEMES[0];

  useEffect(() => {
    if (!isTauriRuntime()) return;

    let unlistenOut: (() => void) | undefined;
    let unlistenExit: (() => void) | undefined;

    listen<{ tabId: string; data: string }>("pty-output", (event) => {
      const entry = terminalsRef.current[event.payload.tabId];
      if (entry) {
        entry.term.write(event.payload.data);
      }
    }).then((fn) => {
      unlistenOut = fn;
    });

    listen<{ tabId: string; reason: string }>("pty-exit", (event) => {
      const entry = terminalsRef.current[event.payload.tabId];
      if (entry) {
        entry.term.writeln(
          `\r\n\x1b[1;31m[Disconnected: ${event.payload.reason}]\x1b[0m`
        );
      }
    }).then((fn) => {
      unlistenExit = fn;
    });

    return () => {
      if (unlistenOut) unlistenOut();
      if (unlistenExit) unlistenExit();
    };
  }, []);

  useEffect(() => {
    tabs.forEach((tab) => {
      const container = terminalContainersRef.current[tab.id];
      if (container && !terminalsRef.current[tab.id]) {
        const host = hosts.find((h) => h.id === tab.hostId);
        const cred = credentials.find((c) => c.id === host?.credentialId);
        const username = cred?.username || "root";
        const port = host?.port || 22;

        const secretType = cred?.secretType || "password";
        const secretValue = cred?.secretValue || "";

        const term = new Terminal({
          cursorBlink: true,
          fontSize: terminalFontSize,
          fontFamily: '"JetBrains Mono", "SF Mono", Menlo, Monaco, monospace',
          theme: currentThemeObj.theme,
          allowProposedApi: true,
          scrollback: 5000,
        });

        const fitAddon = new FitAddon();
        const searchAddon = new SearchAddon();
        term.loadAddon(fitAddon);
        term.loadAddon(searchAddon);
        term.open(container);
        setTimeout(() => {
          fitAddon.fit();
          term.focus();
        }, 40);

        const enabledAliases = aliases
          .filter((a) => a.enabled && /^[a-zA-Z0-9_-]+$/.test(a.alias))
          .map((a) => [a.alias, a.command] as [string, string]);

        const instanceRecord = {
          term,
          fit: fitAddon,
          search: searchAddon,
          isPtyLive: true,
        };
        terminalsRef.current[tab.id] = instanceRecord;

        if (tab.mode === "local") {
          term.writeln(`\x1b[90mLaunching local shell (${tab.hostname})...\x1b[0m`);
        } else {
          term.writeln(
            `\x1b[90mConnecting to ${username}@${tab.hostname}:${port}...\x1b[0m`
          );
        }

        if (isTauriRuntime()) {
          term.onData((data) => {
            if (instanceRecord.isPtyLive) {
              invoke("write_pty_input", { tabId: tab.id, data }).catch(() => {});
            }
          });

          invoke("start_pty_session", {
            tabId: tab.id,
            mode: tab.mode || "ssh",
            hostname: tab.hostname,
            port,
            username,
            secretType,
            secretValue,
            cols: term.cols || 100,
            rows: term.rows || 28,
            initialAliases: tab.aliasesInjected ? enabledAliases : [],
          }).catch((err) => {
            instanceRecord.isPtyLive = false;
            term.writeln(
              `\r\n\x1b[1;31m[SSH Connection Error] ${String(err)}\x1b[0m`
            );
          });
        } else {
          term.writeln(
            `\r\n\x1b[1;33m[Browser Preview Mode — Run inside Tauri Desktop App for live SSH PTY]\x1b[0m`
          );
        }
      }
    });

    Object.keys(terminalsRef.current).forEach((id) => {
      if (!tabs.some((t) => t.id === id)) {
        terminalsRef.current[id].term.dispose();
        delete terminalsRef.current[id];
      }
    });
  }, [tabs]);

  useEffect(() => {
    Object.entries(terminalsRef.current).forEach(([tabId, { term, fit }]) => {
      term.options.theme = currentThemeObj.theme;
      term.options.fontSize = terminalFontSize;
      try {
        fit.fit();
        if (isTauriRuntime()) {
          invoke("resize_pty_session", {
            tabId,
            cols: term.cols,
            rows: term.rows,
          }).catch(() => {});
        }
      } catch {
        // ignore
      }
    });
  }, [terminalThemeId, currentThemeObj, terminalFontSize]);

  useEffect(() => {
    const handleResize = () => {
      Object.entries(terminalsRef.current).forEach(([tabId, { term, fit }]) => {
        try {
          fit.fit();
          if (isTauriRuntime()) {
            invoke("resize_pty_session", {
              tabId,
              cols: term.cols,
              rows: term.rows,
            }).catch(() => {});
          }
        } catch {
          // ignore
        }
      });
    };
    setTimeout(handleResize, 30);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [activeTabId, broadcastMode, sidebarCollapsed, sidebarWidth]);

  const sendCommandToTargets = (cmd: string, customTargetIds?: string[]) => {
    if (!cmd.trim()) return;
    const targetIds =
      customTargetIds && customTargetIds.length > 0
        ? customTargetIds
        : broadcastMode
        ? broadcastTargetTabIds.length > 0
          ? broadcastTargetTabIds
          : tabs.map((t) => t.id)
        : activeTabId
        ? [activeTabId]
        : [];

    targetIds.forEach((id) => {
      const entry = terminalsRef.current[id];
      const tab = tabs.find((t) => t.id === id);
      if (entry && tab) {
        if (entry.isPtyLive && isTauriRuntime()) {
          invoke("write_pty_input", {
            tabId: id,
            data: `${cmd}\n`,
          }).catch(() => {});
        } else {
          entry.term.writeln(`\r\n$ ${cmd}`);
          entry.term.writeln(`\x1b[32m✔ ${tab.title}: OK\x1b[0m`);
          entry.term.write(
            `\x1b[1;36mroot@${tab.title}\x1b[0m:\x1b[1;34m~\x1b[0m$ `
          );
        }
      }
    });
  };

  useEffect(() => {
    if (lastDispatchedCommand) {
      sendCommandToTargets(
        lastDispatchedCommand.command,
        lastDispatchedCommand.targetTabIds
      );
    }
  }, [lastDispatchedCommand]);

  const handleBroadcastSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!broadcastInput.trim()) return;
    sendCommandToTargets(broadcastInput);
    setBroadcastInput("");
  };

  const handleInjectAliasesNow = () => {
    if (!activeTabId) return;
    const entry = terminalsRef.current[activeTabId];
    const tab = tabs.find((t) => t.id === activeTabId);
    if (entry && tab) {
      const safeAliases = aliases.filter(
        (a) => a.enabled && /^[a-zA-Z0-9_-]+$/.test(a.alias)
      );
      if (safeAliases.length === 0) return;
      const aliasCmd = safeAliases
        .map((a) => `alias ${a.alias}='${a.command.replace(/'/g, "'\\''")}'`)
        .join("; ");
      const fullPayload = ` export HISTCONTROL=ignorespace; ${aliasCmd}\n`;

      if (entry.isPtyLive && isTauriRuntime()) {
        invoke("write_pty_input", {
          tabId: activeTabId,
          data: fullPayload,
        }).catch(() => {});
      } else {
        entry.term.writeln(`\r\n\x1b[90m[Aliases injected: ${safeAliases.map((a) => a.alias).join(", ")}]\x1b[0m`);
        entry.term.write(
          `\x1b[1;36mroot@${tab.title}\x1b[0m:\x1b[1;34m~\x1b[0m$ `
        );
      }
    }
  };

  const handleFindNext = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTabId || !findQuery) return;
    const entry = terminalsRef.current[activeTabId];
    if (entry) {
      entry.search.findNext(findQuery);
    }
  };

  return (
    <main className="flex-1 flex flex-col bg-app-bg min-w-0 overflow-hidden">
      {/* Minimalist Session Tab Bar */}
      <div className="h-9 bg-app-sidebar border-b border-app-border flex items-center justify-between px-2 shrink-0 gap-2">
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
          {tabs.map((tab) => {
            const isActive = tab.id === activeTabId;
            return (
              <div
                key={tab.id}
                onClick={() => setActiveTabId(tab.id)}
                className={`group flex items-center gap-2 px-2.5 py-1 rounded-md text-xs cursor-pointer transition-colors ${
                  isActive
                    ? "bg-app-panel text-app-text font-medium"
                    : "text-app-muted hover:bg-app-hover/60 hover:text-app-text"
                }`}
              >
                {tab.mode === "local" ? (
                  <Laptop className="w-3.5 h-3.5 text-app-muted" />
                ) : (
                  <TerminalIcon className="w-3.5 h-3.5 text-app-muted" />
                )}
                <span className="truncate max-w-[140px]">{tab.title}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(tab.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 hover:text-app-danger p-0.5 rounded transition-opacity"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            );
          })}

          <button
            onClick={() => {
              const targetHost =
                hosts.find((h) => h.id === useAppStore.getState().selectedHostId) ||
                hosts[0];
              if (targetHost) {
                openHostSession(targetHost);
              } else {
                useAppStore.getState().setActiveModal({ type: "host" });
              }
            }}
            className="p-1 rounded-md text-app-muted hover:text-app-text hover:bg-app-hover transition-colors"
            title="New SSH Session"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={openLocalTerminal}
            className="p-1 rounded-md text-app-muted hover:text-app-text hover:bg-app-hover transition-colors"
            title="New Local Terminal"
          >
            <Laptop className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Right Minimalist Icon Actions */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => setShowFindBar(!showFindBar)}
            className={`p-1 rounded-md transition-colors ${
              showFindBar
                ? "text-app-accent bg-app-hover"
                : "text-app-muted hover:text-app-text hover:bg-app-hover"
            }`}
            title="Find in Terminal"
          >
            <Search className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={handleInjectAliasesNow}
            className="p-1 rounded-md text-app-muted hover:text-app-text hover:bg-app-hover transition-colors"
            title="Inject Aliases"
          >
            <Wand2 className="w-3.5 h-3.5" />
          </button>

          {/* Minimal Snippet Popover */}
          <div className="relative">
            <button
              onClick={() => setShowSnippetsMenu(!showSnippetsMenu)}
              className="p-1 rounded-md text-app-muted hover:text-app-text hover:bg-app-hover transition-colors"
              title="Run Snippet"
            >
              <Code2 className="w-3.5 h-3.5" />
            </button>

            {showSnippetsMenu && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowSnippetsMenu(false)}
                />
                <div className="absolute right-0 mt-1.5 w-56 bg-app-panel border border-app-border rounded-xl shadow-2xl p-1.5 z-50">
                  <div className="px-2 py-1 text-[10px] font-medium text-app-muted">
                    Snippets
                  </div>
                  {snippets.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => {
                        triggerSnippetExecution(s);
                        setShowSnippetsMenu(false);
                      }}
                      className="w-full text-left px-2 py-1.5 rounded-lg text-xs text-app-text hover:bg-app-hover truncate block"
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Terminal In-Buffer Find Bar */}
      {showFindBar && (
        <form
          onSubmit={handleFindNext}
          className="bg-app-sidebar border-b border-app-border px-3 py-1.5 flex items-center justify-end gap-2 shrink-0"
        >
          <Search className="w-3.5 h-3.5 text-app-muted" />
          <input
            type="text"
            value={findQuery}
            onChange={(e) => setFindQuery(e.target.value)}
            placeholder="Find..."
            className="w-56 bg-app-bg border border-app-border rounded-md px-2 py-1 text-xs text-app-text focus:outline-none focus:border-app-accent"
          />
          <button
            type="button"
            onClick={() => setShowFindBar(false)}
            className="p-1 text-app-muted hover:text-app-text"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </form>
      )}

      {/* Multi-Execution (Broadcast) Command Bar */}
      {broadcastMode && (
        <div className="bg-app-sidebar border-b border-app-border px-3 py-2 space-y-2 shrink-0">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 text-amber-400 text-xs font-medium">
              <Radio className="w-3.5 h-3.5" />
              <span>
                Targets ({broadcastTargetTabIds.length}/{tabs.length})
              </span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {tabs.map((tab) => {
                const checked = broadcastTargetTabIds.includes(tab.id);
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => toggleBroadcastTargetTab(tab.id)}
                    className={`px-2 py-0.5 rounded text-[11px] border transition-colors ${
                      checked
                        ? "bg-amber-500/15 border-amber-500/40 text-amber-300"
                        : "bg-app-bg border-app-border text-app-muted"
                    }`}
                  >
                    {tab.title}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={selectAllBroadcastTabs}
                className="text-[11px] text-app-muted hover:text-app-text ml-1"
              >
                All
              </button>
            </div>
          </div>

          <form onSubmit={handleBroadcastSubmit} className="flex items-center gap-2">
            <input
              type="text"
              value={broadcastInput}
              onChange={(e) => setBroadcastInput(e.target.value)}
              placeholder="Broadcast command to selected servers..."
              className="flex-1 bg-app-bg border border-app-border rounded-lg px-3 py-1.5 text-xs font-mono text-app-text focus:outline-none focus:border-amber-400"
            />
            <button
              type="submit"
              className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-zinc-950 font-medium text-xs flex items-center gap-1.5 transition-colors"
            >
              <Send className="w-3 h-3" />
              <span>Send</span>
            </button>
          </form>
        </div>
      )}

      {/* Terminal Viewport */}
      <div
        className="flex-1 relative overflow-hidden p-2"
        style={{ backgroundColor: currentThemeObj.theme.background }}
      >
        {tabs.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6">
            <img
              src={
                isLightHex(currentThemeObj.theme.background)
                  ? "/soliton-mark-light.svg"
                  : "/soliton-mark.svg"
              }
              alt="Soliton Term"
              className="w-20 h-20 object-contain mb-4"
              draggable={false}
            />
            <img
              src={
                isLightHex(currentThemeObj.theme.background)
                  ? "/soliton-font-dark.png"
                  : "/soliton-font-white.png"
              }
              alt="SolitonTerm"
              className="h-4 w-auto object-contain mb-2 opacity-75"
              draggable={false}
            />
            <p className="text-xs text-zinc-500 mt-1">
              Select a server from the sidebar to connect
            </p>
          </div>
        ) : (
          <div
            className={
              broadcastMode && tabs.length > 1
                ? "grid grid-cols-2 gap-2 h-full w-full"
                : "h-full w-full"
            }
          >
            {tabs.map((tab) => {
              const isVisible = broadcastMode || tab.id === activeTabId;
              const isBroadcastTarget = broadcastTargetTabIds.includes(tab.id);
              return (
                <div
                  key={tab.id}
                  className={`${
                    isVisible ? "flex flex-col" : "hidden"
                  } h-full w-full rounded-lg overflow-hidden ${
                    broadcastMode
                      ? isBroadcastTarget
                        ? "border border-amber-500/30 p-1.5"
                        : "border border-app-border opacity-50 p-1.5"
                      : ""
                  }`}
                >
                  {broadcastMode && (
                    <div
                      onClick={() => toggleBroadcastTargetTab(tab.id)}
                      className="flex items-center justify-between px-2 py-1 mb-1 rounded bg-black/40 text-[11px] font-mono text-amber-300 shrink-0 cursor-pointer"
                    >
                      <span>{tab.title}</span>
                      <span>{isBroadcastTarget ? "ACTIVE" : "PAUSED"}</span>
                    </div>
                  )}
                  <div
                    ref={(el) => {
                      terminalContainersRef.current[tab.id] = el;
                    }}
                    className="flex-1 w-full h-full overflow-hidden"
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Minimal Status Footer */}
      <footer className="h-6 bg-app-sidebar border-t border-app-border px-3 flex items-center justify-between text-[11px] text-app-muted shrink-0">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-app-success" />
          <span>{tabs.length} active</span>
        </div>
        <div className="flex items-center gap-3 font-mono text-[10px]">
          <span>{currentThemeObj.name}</span>
          <span>UTF-8</span>
        </div>
      </footer>
    </main>
  );
};
