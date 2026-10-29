import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";

export type AppTheme = "dark-blue" | "dark-black" | "light";
export type ActiveNavSection = "hosts" | "vault" | "snippets" | "aliases" | "broadcast";

export interface CredentialItem {
  id: string;
  name: string;
  username: string;
  secretType: "password" | "ssh_key";
  secretValue: string;
  description?: string;
}

export interface HostGroup {
  id: string;
  name: string;
  parentId: string | null;
  icon?: string;
}

export interface HostEntry {
  id: string;
  name: string;
  hostname: string;
  port: number;
  groupId: string;
  credentialId: string;
  tags: string[];
  os?: "linux" | "macos" | "ubuntu" | "kubernetes";
  injectAliases: boolean;
  notes?: string;
}

export interface SnippetItem {
  id: string;
  name: string;
  command: string;
  category: string;
  description: string;
}

export interface AliasItem {
  id: string;
  alias: string;
  command: string;
  description: string;
  enabled: boolean;
}

export interface SessionTab {
  id: string;
  hostId: string;
  title: string;
  hostname: string;
  mode?: "local" | "ssh";
  status: "connected" | "connecting" | "disconnected";
  aliasesInjected: boolean;
}

export type ModalType =
  | null
  | { type: "host"; item?: HostEntry; defaultGroupId?: string }
  | { type: "group"; item?: HostGroup; defaultParentId?: string }
  | { type: "credential"; item?: CredentialItem }
  | { type: "snippet"; item?: SnippetItem }
  | { type: "alias"; item?: AliasItem };

export type ConfirmModalType =
  | null
  | { type: "delete-host"; host: HostEntry }
  | { type: "delete-group"; group: HostGroup }
  | { type: "duplicate-host"; host: HostEntry };

export interface Notice {
  id: number;
  kind: "error" | "info";
  message: string;
}

interface AppState {
  notice: Notice | null;
  dismissNotice: () => void;
  appTheme: AppTheme;
  terminalThemeId: string;
  terminalFontSize: number;
  activeNav: ActiveNavSection;
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  selectedGroupId: string | null;
  selectedTag: string | null;
  selectedHostId: string | null;
  recentHostIds: string[];
  searchQuery: string;
  broadcastMode: boolean;
  broadcastTargetTabIds: string[];
  activeModal: ModalType;
  confirmModal: ConfirmModalType;
  commandPaletteOpen: boolean;
  importExportModalOpen: boolean;
  pendingSnippetToRun: SnippetItem | null;
  lastDispatchedCommand: { id: number; command: string; targetTabIds?: string[] } | null;

  groups: HostGroup[];
  credentials: CredentialItem[];
  hosts: HostEntry[];
  snippets: SnippetItem[];
  aliases: AliasItem[];
  tabs: SessionTab[];
  activeTabId: string | null;

  initFromBackend: () => Promise<void>;
  setAppTheme: (theme: AppTheme) => void;
  setTerminalThemeId: (id: string) => void;
  setTerminalFontSize: (size: number) => void;
  setActiveNav: (nav: ActiveNavSection) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setSidebarWidth: (width: number) => void;
  setSelectedGroupId: (id: string | null) => void;
  setSelectedTag: (tag: string | null) => void;
  setSelectedHostId: (id: string | null) => void;
  setSearchQuery: (q: string) => void;
  setBroadcastMode: (enabled: boolean) => void;
  toggleBroadcastTargetTab: (tabId: string) => void;
  selectAllBroadcastTabs: () => void;
  setActiveModal: (modal: ModalType) => void;
  setConfirmModal: (modal: ConfirmModalType) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setImportExportModalOpen: (open: boolean) => void;
  exportVaultBundle: (includeSecrets: boolean) => string;
  importVaultBundle: (jsonText: string, replaceExisting: boolean) => Promise<void>;
  triggerSnippetExecution: (snippet: SnippetItem) => void;
  clearPendingSnippet: () => void;
  dispatchCommandToTerminals: (command: string, targetTabIds?: string[]) => void;

  upsertGroup: (item: HostGroup) => Promise<void>;
  moveGroupToParent: (groupId: string, targetParentId: string | null) => Promise<void>;
  deleteGroup: (id: string) => Promise<void>;

  upsertCredential: (item: CredentialItem) => Promise<void>;
  deleteCredential: (id: string) => Promise<void>;

  upsertHost: (item: HostEntry) => Promise<void>;
  duplicateHost: (hostId: string) => Promise<void>;
  moveHostToGroup: (hostId: string, targetGroupId: string) => Promise<void>;
  deleteHost: (id: string) => Promise<void>;

  upsertSnippet: (item: SnippetItem) => Promise<void>;
  deleteSnippet: (id: string) => Promise<void>;

  upsertAlias: (item: AliasItem) => Promise<void>;
  deleteAlias: (id: string) => Promise<void>;

  openHostSession: (host: HostEntry) => void;
  openGroupSessions: (groupId: string) => void;
  openTagSessions: (tag: string) => void;
  openLocalTerminal: () => void;
  closeTab: (tabId: string) => void;
  setActiveTabId: (tabId: string) => void;
}

const inTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** Fire-and-forget IPC for non-critical calls; never throws. */
const safeInvoke = async <T>(cmd: string, args?: Record<string, unknown>): Promise<T | null> => {
  try {
    if (inTauri()) return await invoke<T>(cmd, args);
  } catch (err) {
    console.warn(`Tauri IPC [${cmd}] failed:`, err);
  }
  return null;
};

/** Strict IPC: rejects with the backend's message so callers can surface it. */
const strictInvoke = async <T>(cmd: string, args?: Record<string, unknown>): Promise<T | null> => {
  if (!inTauri()) return null;
  try {
    return await invoke<T>(cmd, args);
  } catch (err) {
    throw new Error(typeof err === "string" ? err : (err as Error)?.message ?? String(err));
  }
};

export const useAppStore = create<AppState>((set, get) => {
  /** Persists to the vault; on failure shows the reason and tells the caller to abort. */
  const persist = async (cmd: string, args: Record<string, unknown>): Promise<boolean> => {
    try {
      await strictInvoke(cmd, args);
      return true;
    } catch (err) {
      set({ notice: { id: Date.now(), kind: "error", message: (err as Error).message } });
      return false;
    }
  };

  return {
  notice: null,
  dismissNotice: () => set({ notice: null }),
  appTheme: "dark-black",
  terminalThemeId: "oled-pitch",
  terminalFontSize: 13,
  activeNav: "hosts",
  sidebarCollapsed: false,
  sidebarWidth: 260,
  selectedGroupId: null,
  selectedTag: null,
  selectedHostId: "host-1",
  recentHostIds: ["host-1", "host-2", "host-3"],
  searchQuery: "",
  broadcastMode: false,
  broadcastTargetTabIds: ["tab-init-1"],
  activeModal: null,
  confirmModal: null,
  commandPaletteOpen: false,
  importExportModalOpen: false,
  pendingSnippetToRun: null,
  lastDispatchedCommand: null,

  groups: [
    { id: "grp-prod", name: "Production Cluster", parentId: null },
    { id: "grp-prod-k8s", name: "Kubernetes Nodes", parentId: "grp-prod" },
    { id: "grp-prod-db", name: "Database Replicas", parentId: "grp-prod" },
    { id: "grp-stage", name: "Staging & QA", parentId: null },
    { id: "grp-dmz", name: "DMZ / Edge Gateways", parentId: null },
  ],

  credentials: [
    {
      id: "cred-root-prod",
      name: "Prod Root Vault Key",
      username: "root",
      secretType: "password",
      secretValue: "<DEMO_ROOT_PASSWORD_CHANGE_ME>",
      description: "Primary production root access credential (Demo placeholder)",
    },
    {
      id: "cred-devops",
      name: "DevOps Automation User",
      username: "soliton_ops",
      secretType: "password",
      secretValue: "<DEMO_OPS_PASSWORD_CHANGE_ME>",
      description: "Standard SRE & Kubernetes operator account (Demo placeholder)",
    },
    {
      id: "cred-db-admin",
      name: "PostgreSQL Cluster Admin",
      username: "pgadmin",
      secretType: "ssh_key",
      secretValue: "<SSH_ED25519_PRIVATE_KEY_PLACEHOLDER>",
      description: "SSH key for DB replica servers (Demo placeholder)",
    },
  ],

  hosts: [
    {
      id: "host-1",
      name: "k8s-master-01",
      hostname: "10.240.10.11",
      port: 22,
      groupId: "grp-prod-k8s",
      credentialId: "cred-devops",
      tags: ["prod", "k8s", "control-plane"],
      os: "kubernetes",
      injectAliases: true,
      notes: "Primary Kubernetes API server",
    },
    {
      id: "host-2",
      name: "k8s-worker-gpu-01",
      hostname: "10.240.10.21",
      port: 22,
      groupId: "grp-prod-k8s",
      credentialId: "cred-devops",
      tags: ["prod", "k8s", "worker", "gpu"],
      os: "linux",
      injectAliases: true,
      notes: "High-memory worker node",
    },
    {
      id: "host-3",
      name: "pg-primary-db01",
      hostname: "10.240.20.5",
      port: 2222,
      groupId: "grp-prod-db",
      credentialId: "cred-db-admin",
      tags: ["prod", "database", "postgres"],
      os: "ubuntu",
      injectAliases: true,
    },
    {
      id: "host-4",
      name: "edge-envoy-gw01",
      hostname: "172.16.0.10",
      port: 22,
      groupId: "grp-dmz",
      credentialId: "cred-root-prod",
      tags: ["dmz", "gateway", "nginx"],
      os: "linux",
      injectAliases: false,
    },
    {
      id: "host-5",
      name: "stage-app-runner",
      hostname: "192.168.50.14",
      port: 22,
      groupId: "grp-stage",
      credentialId: "cred-devops",
      tags: ["staging", "docker"],
      os: "ubuntu",
      injectAliases: true,
    },
  ],

  snippets: [
    {
      id: "snip-1",
      name: "System Health & Resource Check",
      command: "uptime && free -h && df -hT | grep -v tmpfs",
      category: "Diagnostics",
      description: "Quick overview of CPU load, RAM, and disk usage",
    },
    {
      id: "snip-2",
      name: "K8s Pod Logs by Namespace (Parametric)",
      command: "kubectl logs -n {{namespace}} -l app={{service_name}} --tail={{lines}}",
      category: "Kubernetes",
      description: "Stream recent logs for a specific K8s service with dynamic variables",
    },
    {
      id: "snip-3",
      name: "Check Specific Port Listener (Parametric)",
      command: "ss -tulpn | grep :{{port}}",
      category: "Network",
      description: "Find which process is bound to a specific TCP/UDP port",
    },
    {
      id: "snip-4",
      name: "Docker Container Live Stats",
      command: "docker stats --no-stream",
      category: "Containers",
      description: "Snapshot of container CPU and memory consumption",
    },
  ],

  aliases: [
    {
      id: "al-1",
      alias: "ll",
      command: "ls -lah --color=auto",
      description: "Detailed human-readable directory listing",
      enabled: true,
    },
    {
      id: "al-2",
      alias: "k",
      command: "kubectl",
      description: "Shorthand for kubectl CLI",
      enabled: true,
    },
    {
      id: "al-3",
      alias: "dcu",
      command: "docker compose up -d",
      description: "Start docker compose stack in detached mode",
      enabled: true,
    },
    {
      id: "al-4",
      alias: "ports",
      command: "netstat -tulanp",
      description: "Show active listening ports",
      enabled: true,
    },
  ],

  tabs: [],
  activeTabId: null,

  initFromBackend: async () => {
    const snap = await safeInvoke<{
      groups: HostGroup[];
      credentials: CredentialItem[];
      hosts: HostEntry[];
      snippets: SnippetItem[];
      aliases: AliasItem[];
    }>("load_vault_snapshot");
    if (snap && snap.hosts.length > 0) {
      set({
        groups: snap.groups,
        credentials: snap.credentials,
        hosts: snap.hosts,
        snippets: snap.snippets,
        aliases: snap.aliases,
        selectedHostId: snap.hosts[0]?.id || null,
        recentHostIds: snap.hosts.slice(0, 5).map((h) => h.id),
      });
    }
  },

  setAppTheme: (theme) => {
    document.documentElement.setAttribute("data-theme", theme);
    set({ appTheme: theme });
  },
  setTerminalThemeId: (id) => set({ terminalThemeId: id }),
  setTerminalFontSize: (size) => set({ terminalFontSize: size }),
  setActiveNav: (nav) => set({ activeNav: nav }),
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
  setSidebarWidth: (width) =>
    set({ sidebarWidth: Math.min(480, Math.max(220, width)) }),
  setSelectedGroupId: (id) => set({ selectedGroupId: id }),
  setSelectedTag: (tag) => set({ selectedTag: tag }),
  setSelectedHostId: (id) => set({ selectedHostId: id }),
  setSearchQuery: (q) => set({ searchQuery: q }),
  setBroadcastMode: (enabled) =>
    set((state) => ({
      broadcastMode: enabled,
      broadcastTargetTabIds:
        state.broadcastTargetTabIds.length > 0
          ? state.broadcastTargetTabIds
          : state.tabs.map((t) => t.id),
    })),

  toggleBroadcastTargetTab: (tabId) =>
    set((state) => {
      const exists = state.broadcastTargetTabIds.includes(tabId);
      return {
        broadcastTargetTabIds: exists
          ? state.broadcastTargetTabIds.filter((id) => id !== tabId)
          : [...state.broadcastTargetTabIds, tabId],
      };
    }),

  selectAllBroadcastTabs: () =>
    set((state) => ({
      broadcastTargetTabIds: state.tabs.map((t) => t.id),
    })),

  setActiveModal: (modal) => set({ activeModal: modal }),
  setConfirmModal: (modal) => set({ confirmModal: modal }),
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
  setImportExportModalOpen: (open) => set({ importExportModalOpen: open }),

  exportVaultBundle: (includeSecrets) => {
    const state = get();
    const bundle = {
      schema: "soliton-term-bundle-v1",
      exportedAt: new Date().toISOString(),
      groups: state.groups,
      credentials: state.credentials.map((c) => ({
        ...c,
        secretValue: includeSecrets ? c.secretValue : "",
      })),
      hosts: state.hosts,
      snippets: state.snippets,
      aliases: state.aliases,
    };
    return JSON.stringify(bundle, null, 2);
  },

  importVaultBundle: async (jsonText, replaceExisting) => {
    const parsed = JSON.parse(jsonText);
    const snapshot = {
      groups: Array.isArray(parsed.groups) ? parsed.groups : [],
      credentials: Array.isArray(parsed.credentials) ? parsed.credentials : [],
      hosts: Array.isArray(parsed.hosts) ? parsed.hosts : [],
      snippets: Array.isArray(parsed.snippets) ? parsed.snippets : [],
      aliases: Array.isArray(parsed.aliases) ? parsed.aliases : [],
    };

    const backendResult = await strictInvoke<{
      groups: HostGroup[];
      credentials: CredentialItem[];
      hosts: HostEntry[];
      snippets: SnippetItem[];
      aliases: AliasItem[];
    }>("import_vault_snapshot", { snapshot, replaceExisting });

    if (backendResult) {
      set({
        groups: backendResult.groups,
        credentials: backendResult.credentials,
        hosts: backendResult.hosts,
        snippets: backendResult.snippets,
        aliases: backendResult.aliases,
        importExportModalOpen: false,
      });
    } else {
      set((state) => {
        const mergeById = <T extends { id: string }>(oldList: T[], newList: T[]) => {
          if (replaceExisting) return newList;
          const map = new Map<string, T>();
          oldList.forEach((item) => map.set(item.id, item));
          newList.forEach((item) => map.set(item.id, item));
          return Array.from(map.values());
        };
        return {
          groups: mergeById(state.groups, snapshot.groups),
          credentials: mergeById(state.credentials, snapshot.credentials),
          hosts: mergeById(state.hosts, snapshot.hosts),
          snippets: mergeById(state.snippets, snapshot.snippets),
          aliases: mergeById(state.aliases, snapshot.aliases),
          importExportModalOpen: false,
        };
      });
    }
  },

  triggerSnippetExecution: (snippet) => {
    const hasVariables = /\{\{\s*[\w-]+\s*\}\}/.test(snippet.command);
    if (hasVariables) {
      set({ pendingSnippetToRun: snippet });
    } else {
      set({
        lastDispatchedCommand: {
          id: Date.now(),
          command: snippet.command,
        },
      });
    }
  },

  clearPendingSnippet: () => set({ pendingSnippetToRun: null }),

  dispatchCommandToTerminals: (command, targetTabIds) =>
    set({
      lastDispatchedCommand: {
        id: Date.now(),
        command,
        targetTabIds,
      },
      pendingSnippetToRun: null,
    }),

  upsertGroup: async (item) => {
    if (!(await persist("save_group", { item }))) return;
    set((state) => {
      const exists = state.groups.some((g) => g.id === item.id);
      return {
        groups: exists
          ? state.groups.map((g) => (g.id === item.id ? item : g))
          : [...state.groups, item],
        activeModal: null,
      };
    });
  },

  moveGroupToParent: async (groupId, targetParentId) => {
    if (groupId === targetParentId) return;
    const { groups } = get();
    const group = groups.find((g) => g.id === groupId);
    if (!group || group.parentId === targetParentId) return;

    // Prevent circular hierarchy (cannot move a folder into its own descendant)
    let cursorId: string | null = targetParentId;
    while (cursorId) {
      if (cursorId === groupId) return;
      const parentObj = groups.find((g) => g.id === cursorId);
      cursorId = parentObj ? parentObj.parentId : null;
    }

    const updated: HostGroup = { ...group, parentId: targetParentId };
    if (!(await persist("save_group", { item: updated }))) return;
    set((state) => ({
      groups: state.groups.map((g) => (g.id === groupId ? updated : g)),
    }));
  },

  deleteGroup: async (id) => {
    if (!(await persist("remove_group", { id }))) return;
    set((state) => {
      const deletedGroup = state.groups.find((g) => g.id === id);
      const remainingGroups = state.groups
        .filter((g) => g.id !== id)
        .map((g) =>
          g.parentId === id ? { ...g, parentId: deletedGroup?.parentId || null } : g
        );
      const fallbackGroupId =
        deletedGroup?.parentId || remainingGroups[0]?.id || "grp-prod";
      return {
        groups: remainingGroups,
        hosts: state.hosts.map((h) =>
          h.groupId === id ? { ...h, groupId: fallbackGroupId } : h
        ),
        selectedGroupId: state.selectedGroupId === id ? null : state.selectedGroupId,
      };
    });
  },

  upsertCredential: async (item) => {
    if (!(await persist("save_credential", { item }))) return;
    set((state) => {
      const exists = state.credentials.some((c) => c.id === item.id);
      return {
        credentials: exists
          ? state.credentials.map((c) => (c.id === item.id ? item : c))
          : [...state.credentials, item],
        activeModal: null,
      };
    });
  },

  deleteCredential: async (id) => {
    if (!(await persist("remove_credential", { id }))) return;
    set((state) => ({
      credentials: state.credentials.filter((c) => c.id !== id),
    }));
  },

  upsertHost: async (item) => {
    if (!(await persist("save_host", { item }))) return;
    set((state) => {
      const exists = state.hosts.some((h) => h.id === item.id);
      return {
        hosts: exists
          ? state.hosts.map((h) => (h.id === item.id ? item : h))
          : [...state.hosts, item],
        selectedHostId: item.id,
        activeModal: null,
      };
    });
  },

  duplicateHost: async (hostId) => {
    const { hosts } = get();
    const original = hosts.find((h) => h.id === hostId);
    if (!original) return;

    const duplicated: HostEntry = {
      ...original,
      id: `host-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      name: `${original.name} (copy)`,
      tags: [...original.tags],
    };

    if (!(await persist("save_host", { item: duplicated }))) return;
    set((state) => {
      const idx = state.hosts.findIndex((h) => h.id === hostId);
      const nextHosts = [...state.hosts];
      if (idx !== -1) {
        nextHosts.splice(idx + 1, 0, duplicated);
      } else {
        nextHosts.push(duplicated);
      }
      return {
        hosts: nextHosts,
        selectedHostId: duplicated.id,
      };
    });
  },

  moveHostToGroup: async (hostId, targetGroupId) => {
    const host = get().hosts.find((h) => h.id === hostId);
    if (!host || host.groupId === targetGroupId) return;
    const updated: HostEntry = { ...host, groupId: targetGroupId };
    if (!(await persist("save_host", { item: updated }))) return;
    set((state) => ({
      hosts: state.hosts.map((h) => (h.id === hostId ? updated : h)),
    }));
  },

  deleteHost: async (id) => {
    if (!(await persist("remove_host", { id }))) return;
    set((state) => {
      const remaining = state.hosts.filter((h) => h.id !== id);
      return {
        hosts: remaining,
        recentHostIds: state.recentHostIds.filter((rid) => rid !== id),
        selectedHostId:
          state.selectedHostId === id ? remaining[0]?.id || null : state.selectedHostId,
      };
    });
  },

  upsertSnippet: async (item) => {
    if (!(await persist("save_snippet", { item }))) return;
    set((state) => {
      const exists = state.snippets.some((s) => s.id === item.id);
      return {
        snippets: exists
          ? state.snippets.map((s) => (s.id === item.id ? item : s))
          : [...state.snippets, item],
        activeModal: null,
      };
    });
  },

  deleteSnippet: async (id) => {
    if (!(await persist("remove_snippet", { id }))) return;
    set((state) => ({
      snippets: state.snippets.filter((s) => s.id !== id),
    }));
  },

  upsertAlias: async (item) => {
    if (!(await persist("save_alias", { item }))) return;
    set((state) => {
      const exists = state.aliases.some((a) => a.id === item.id);
      return {
        aliases: exists
          ? state.aliases.map((a) => (a.id === item.id ? item : a))
          : [...state.aliases, item],
        activeModal: null,
      };
    });
  },

  deleteAlias: async (id) => {
    if (!(await persist("remove_alias", { id }))) return;
    set((state) => ({
      aliases: state.aliases.filter((a) => a.id !== id),
    }));
  },

  openHostSession: (host) => {
    if (!host) return;
    const newTabId = `tab-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
    const newTab: SessionTab = {
      id: newTabId,
      hostId: host.id,
      title: host.name,
      hostname: host.hostname,
      mode: "ssh",
      status: "connected",
      aliasesInjected: !!host.injectAliases,
    };
    set((state) => {
      const nextRecent = [
        host.id,
        ...state.recentHostIds.filter((id) => id !== host.id),
      ].slice(0, 5);
      return {
        tabs: [...state.tabs, newTab],
        broadcastTargetTabIds: [...state.broadcastTargetTabIds, newTabId],
        recentHostIds: nextRecent,
        activeTabId: newTabId,
        selectedHostId: host.id,
      };
    });
  },

  openGroupSessions: (groupId) => {
    const { hosts, tabs, broadcastTargetTabIds } = get();
    const groupHosts = hosts.filter((h) => h.groupId === groupId);
    if (groupHosts.length === 0) return;

    const newTabs: SessionTab[] = groupHosts.map((host, idx) => ({
      id: `tab-grp-${Date.now()}-${idx}`,
      hostId: host.id,
      title: host.name,
      hostname: host.hostname,
      mode: "ssh",
      status: "connected",
      aliasesInjected: !!host.injectAliases,
    }));

    set({
      tabs: [...tabs, ...newTabs],
      broadcastTargetTabIds: [
        ...broadcastTargetTabIds,
        ...newTabs.map((t) => t.id),
      ],
      activeTabId: newTabs[0].id,
      broadcastMode: true,
    });
  },

  openTagSessions: (tag) => {
    const { hosts, tabs, broadcastTargetTabIds } = get();
    const tagHosts = hosts.filter((h) => h.tags.includes(tag));
    if (tagHosts.length === 0) return;

    const newTabs: SessionTab[] = tagHosts.map((host, idx) => ({
      id: `tab-tag-${Date.now()}-${idx}`,
      hostId: host.id,
      title: host.name,
      hostname: host.hostname,
      mode: "ssh",
      status: "connected",
      aliasesInjected: !!host.injectAliases,
    }));

    set({
      tabs: [...tabs, ...newTabs],
      broadcastTargetTabIds: [
        ...broadcastTargetTabIds,
        ...newTabs.map((t) => t.id),
      ],
      activeTabId: newTabs[0].id,
      broadcastMode: true,
    });
  },

  openLocalTerminal: () => {
    const newTabId = `tab-local-${Date.now()}`;
    const newTab: SessionTab = {
      id: newTabId,
      hostId: "local",
      title: "macOS Local Shell",
      hostname: "localhost",
      mode: "local",
      status: "connected",
      aliasesInjected: true,
    };
    set((state) => ({
      tabs: [...state.tabs, newTab],
      broadcastTargetTabIds: [...state.broadcastTargetTabIds, newTabId],
      activeTabId: newTabId,
    }));
  },

  closeTab: (tabId) => {
    safeInvoke("close_pty_session", { tabId });
    const { tabs, activeTabId, broadcastTargetTabIds } = get();
    const filtered = tabs.filter((t) => t.id !== tabId);
    let nextActive = activeTabId;
    if (activeTabId === tabId) {
      nextActive = filtered.length > 0 ? filtered[filtered.length - 1].id : null;
    }
    set({
      tabs: filtered,
      broadcastTargetTabIds: broadcastTargetTabIds.filter((id) => id !== tabId),
      activeTabId: nextActive,
    });
  },

  setActiveTabId: (tabId) => {
    const tab = get().tabs.find((t) => t.id === tabId);
    set({
      activeTabId: tabId,
      selectedHostId: tab ? tab.hostId : get().selectedHostId,
    });
  },
  };
});
