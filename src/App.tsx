import React, { useEffect } from "react";
import { TopBar } from "./components/TopBar";
import { Sidebar } from "./components/Sidebar";
import { TerminalWorkspace } from "./components/TerminalWorkspace";
import { VaultModalManager } from "./components/VaultModalManager";
import { ParametricSnippetRunnerModal } from "./components/ParametricSnippetRunnerModal";
import { CommandPaletteModal } from "./components/CommandPaletteModal";
import { ImportExportModal } from "./components/ImportExportModal";
import { useAppStore } from "./store/useAppStore";

export const App: React.FC = () => {
  const { appTheme, initFromBackend, sidebarCollapsed, setSidebarCollapsed } = useAppStore();

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", appTheme);
  }, [appTheme]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "b") {
        e.preventDefault();
        setSidebarCollapsed(!sidebarCollapsed);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [sidebarCollapsed, setSidebarCollapsed]);

  useEffect(() => {
    initFromBackend();
  }, [initFromBackend]);

  return (
    <div className="h-screen w-screen flex flex-col bg-app-bg text-app-text overflow-hidden select-none">
      {/* Clean Top Bar with Explicit Username & Password Copy + Export/Import + Appearance */}
      <TopBar />

      {/* Main Hybrid RDM Sidebar + Termius Multi-Tab Workspace */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        <Sidebar />
        <TerminalWorkspace />
      </div>

      {/* Vault / Host / Group / Snippet / Alias CRUD Modals */}
      <VaultModalManager />

      {/* Dynamic Parametric Snippet Runner Modal */}
      <ParametricSnippetRunnerModal />

      {/* Global Cmd+K Command Palette */}
      <CommandPaletteModal />

      {/* Full Export / Import Sharing Modal */}
      <ImportExportModal />
    </div>
  );
};

export default App;
