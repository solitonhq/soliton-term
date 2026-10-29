import React, { useState, useEffect, useRef } from "react";
import {
  Folder,
  FolderOpen,
  FolderPlus,
  Server,
  KeyRound,
  Code2,
  Terminal,
  ChevronRight,
  ChevronDown,
  Play,
  Plus,
  Pencil,
  Trash2,
  Copy,
  Check,
  Search,
  Layers,
  Clock,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { useAppStore, ActiveNavSection, HostEntry, HostGroup } from "../store/useAppStore";

interface DragState {
  type: "host" | "group";
  id: string;
  name: string;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  active: boolean;
}

export const Sidebar: React.FC = () => {
  const {
    activeNav,
    setActiveNav,
    sidebarCollapsed,
    setSidebarCollapsed,
    sidebarWidth,
    setSidebarWidth,
    groups,
    hosts,
    credentials,
    snippets,
    aliases,
    recentHostIds,
    selectedTag,
    setSelectedTag,
    selectedHostId,
    setSelectedHostId,
    openHostSession,
    searchQuery,
    setSearchQuery,
    setActiveModal,
    setConfirmModal,
    deleteCredential,
    deleteSnippet,
    deleteAlias,
    upsertAlias,
    moveHostToGroup,
    moveGroupToParent,
    triggerSnippetExecution,
  } = useAppStore();

  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [addMenuGroupId, setAddMenuGroupId] = useState<string | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dragOverGroupId, setDragOverGroupId] = useState<string | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const suppressClickRef = useRef(false);

  useEffect(() => {
    if (!addMenuGroupId) return;
    const handleOutsideClick = () => setAddMenuGroupId(null);
    window.addEventListener("click", handleOutsideClick);
    return () => window.removeEventListener("click", handleOutsideClick);
  }, [addMenuGroupId]);

  const isInvalidGroupDrop = (draggedGroupId: string, targetGroupId: string | null) => {
    if (draggedGroupId === targetGroupId) return true;
    let cursor: string | null = targetGroupId;
    while (cursor) {
      if (cursor === draggedGroupId) return true;
      const found = groups.find((g) => g.id === cursor);
      cursor = found ? found.parentId : null;
    }
    return false;
  };

  useEffect(() => {
    if (!dragState) return;

    const handleMouseMove = (e: MouseEvent) => {
      const dist = Math.hypot(e.clientX - dragState.startX, e.clientY - dragState.startY);
      const isActive = dragState.active || dist > 5;

      if (isActive) {
        setDragState((prev) =>
          prev
            ? {
                ...prev,
                active: true,
                currentX: e.clientX,
                currentY: e.clientY,
              }
            : null
        );

        const el = document.elementFromPoint(e.clientX, e.clientY);
        const dropEl = el?.closest("[data-drop-group-id]") as HTMLElement | null;
        const candidateId = dropEl?.getAttribute("data-drop-group-id") || null;

        if (!candidateId) {
          setDragOverGroupId(null);
        } else if (dragState.type === "host") {
          // Hosts can be dropped onto any specific folder (not ROOT)
          setDragOverGroupId(candidateId !== "ROOT" ? candidateId : null);
        } else {
          // Folders can be dropped onto another folder or ROOT (to make top-level)
          const targetParent = candidateId === "ROOT" ? null : candidateId;
          if (!isInvalidGroupDrop(dragState.id, targetParent)) {
            setDragOverGroupId(candidateId);
          } else {
            setDragOverGroupId(null);
          }
        }
      }
    };

    const handleMouseUp = () => {
      if (dragState.active) {
        suppressClickRef.current = true;
        setTimeout(() => {
          suppressClickRef.current = false;
        }, 80);

        if (dragOverGroupId) {
          if (dragState.type === "host" && dragOverGroupId !== "ROOT") {
            moveHostToGroup(dragState.id, dragOverGroupId);
            setExpandedGroups((prev) => ({ ...prev, [dragOverGroupId]: true }));
          } else if (dragState.type === "group") {
            const targetParentId = dragOverGroupId === "ROOT" ? null : dragOverGroupId;
            if (!isInvalidGroupDrop(dragState.id, targetParentId)) {
              moveGroupToParent(dragState.id, targetParentId);
              if (targetParentId) {
                setExpandedGroups((prev) => ({ ...prev, [targetParentId]: true }));
              }
            }
          }
        }
      }

      setDragState(null);
      setDragOverGroupId(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragState, dragOverGroupId, groups, moveHostToGroup, moveGroupToParent]);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      setSidebarWidth(e.clientX);
    };
    const handleMouseUp = () => {
      setIsResizing(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing, setSidebarWidth]);

  if (sidebarCollapsed) {
    return (
      <aside className="w-11 bg-app-sidebar border-r border-app-border flex flex-col items-center py-2.5 shrink-0 select-none">
        <button
          type="button"
          onClick={() => setSidebarCollapsed(false)}
          className="p-1.5 rounded-lg text-app-muted hover:text-app-text hover:bg-app-hover transition-colors"
          title="Show Sidebar (⌘B)"
        >
          <PanelLeftOpen className="w-4 h-4" />
        </button>
      </aside>
    );
  }

  const toggleGroup = (id: string) => {
    setExpandedGroups((prev) => ({ ...prev, [id]: prev[id] === false }));
  };

  const handleCopyText = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(key);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      // ignore
    }
  };

  const allTags = Array.from(new Set(hosts.flatMap((h) => h.tags)));

  const railItems: { id: ActiveNavSection; label: string; icon: React.ReactNode }[] = [
    { id: "hosts", label: "Hosts", icon: <Layers className="w-3.5 h-3.5" /> },
    { id: "vault", label: "Vault", icon: <KeyRound className="w-3.5 h-3.5" /> },
    { id: "snippets", label: "Snippets", icon: <Code2 className="w-3.5 h-3.5" /> },
    { id: "aliases", label: "Aliases", icon: <Terminal className="w-3.5 h-3.5" /> },
  ];

  const matchesFilter = (h: HostEntry) => {
    const matchesTag = !selectedTag || h.tags.includes(selectedTag);
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !q ||
      h.name.toLowerCase().includes(q) ||
      h.hostname.toLowerCase().includes(q) ||
      h.tags.some((t) => t.toLowerCase().includes(q.replace("#", "")));
    return matchesTag && matchesSearch;
  };

  const recentHosts = recentHostIds
    .map((id) => hosts.find((h) => h.id === id))
    .filter((h): h is HostEntry => !!h)
    .slice(0, 5);

  const startPointerDrag = (
    e: React.MouseEvent,
    type: "host" | "group",
    id: string,
    name: string
  ) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("button")) return;
    setDragState({
      type,
      id,
      name,
      startX: e.clientX,
      startY: e.clientY,
      currentX: e.clientX,
      currentY: e.clientY,
      active: false,
    });
  };

  const renderHostNode = (host: HostEntry, depth: number) => {
    const isSelected = selectedHostId === host.id;
    const isBeingDragged = dragState?.active && dragState.type === "host" && dragState.id === host.id;

    return (
      <div
        key={host.id}
        data-drop-group-id={host.groupId}
        onMouseDown={(e) => startPointerDrag(e, "host", host.id, host.name)}
        onClick={() => {
          if (suppressClickRef.current) return;
          setSelectedHostId(host.id);
          const existingTab = useAppStore
            .getState()
            .tabs.find((t) => t.hostId === host.id);
          if (existingTab) {
            useAppStore.getState().setActiveTabId(existingTab.id);
          } else {
            openHostSession(host);
          }
        }}
        onDoubleClick={() => {
          if (suppressClickRef.current) return;
          openHostSession(host);
        }}
        style={{ paddingLeft: `${depth * 12 + 12}px` }}
        title={`${host.hostname}:${host.port} (Click to connect, drag to move)`}
        className={`group pr-2 py-1.5 my-0.5 rounded-lg transition-colors cursor-grab active:cursor-grabbing flex items-center justify-between gap-2 text-xs ${
          isBeingDragged
            ? "opacity-40 bg-app-hover"
            : isSelected
            ? "bg-app-hover text-app-text font-medium"
            : "text-app-muted hover:bg-app-hover/60 hover:text-app-text"
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`w-1.5 h-1.5 rounded-full shrink-0 ${
              isSelected ? "bg-app-accent" : "bg-app-success/70"
            }`}
          />
          <span className="truncate">{host.name}</span>
        </div>

        <div className="flex items-center shrink-0">
          <span className="group-hover:hidden text-[10px] font-mono text-app-muted/60 truncate max-w-[100px]">
            {host.hostname}
          </span>

          <div className="hidden group-hover:flex items-center gap-0.5">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setConfirmModal({ type: "duplicate-host", host });
              }}
              className="p-1 rounded hover:bg-app-active text-app-muted hover:text-app-text"
              title="Duplicate Host"
            >
              <Copy className="w-3 h-3" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setActiveModal({ type: "host", item: host });
              }}
              className="p-1 rounded hover:bg-app-active text-app-muted hover:text-app-text"
              title="Edit"
            >
              <Pencil className="w-3 h-3" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setConfirmModal({ type: "delete-host", host });
              }}
              className="p-1 rounded hover:bg-app-active text-app-muted hover:text-app-danger"
              title="Delete"
            >
              <Trash2 className="w-3 h-3" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                openHostSession(host);
              }}
              className="p-1 rounded hover:bg-app-active text-app-muted hover:text-app-accent"
              title="Connect"
            >
              <Play className="w-3 h-3 fill-current" />
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderGroupTree = (parentId: string | null = null, depth = 0) => {
    return groups
      .filter((g) => g.parentId === parentId)
      .map((group: HostGroup) => {
        const isExpanded = expandedGroups[group.id] !== false;
        const childGroups = groups.filter((g) => g.parentId === group.id);
        const groupHosts = hosts.filter(
          (h) => h.groupId === group.id && matchesFilter(h)
        );
        const isDragOver = dragOverGroupId === group.id;
        const isBeingDragged =
          dragState?.active && dragState.type === "group" && dragState.id === group.id;
        const isAddMenuOpen = addMenuGroupId === group.id;

        return (
          <div key={group.id}>
            <div
              data-drop-group-id={group.id}
              onMouseDown={(e) => startPointerDrag(e, "group", group.id, group.name)}
              onClick={() => {
                if (suppressClickRef.current) return;
                toggleGroup(group.id);
              }}
              style={{ paddingLeft: `${depth * 12 + 4}px` }}
              title="Click to expand/collapse, drag to move folder"
              className={`group relative flex items-center justify-between pr-2 py-1.5 rounded-lg cursor-grab active:cursor-grabbing text-xs transition-all border ${
                isBeingDragged
                  ? "opacity-40 border-transparent"
                  : isDragOver
                  ? "bg-app-accent/20 border-app-accent text-app-text"
                  : "border-transparent text-app-muted hover:bg-app-hover/60 hover:text-app-text"
              }`}
            >
              <div className="flex items-center gap-1.5 truncate pointer-events-none">
                {isExpanded ? (
                  <ChevronDown className="w-3.5 h-3.5 opacity-70 shrink-0" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 opacity-70 shrink-0" />
                )}
                {isExpanded ? (
                  <FolderOpen className="w-3.5 h-3.5 text-app-muted shrink-0" />
                ) : (
                  <Folder className="w-3.5 h-3.5 text-app-muted shrink-0" />
                )}
                <span className="font-medium text-app-text truncate">
                  {group.name}
                </span>
              </div>

              <div className="flex items-center gap-0.5">
                <div
                  className={`flex items-center gap-0.5 transition-opacity ${
                    isAddMenuOpen
                      ? "opacity-100"
                      : "opacity-0 group-hover:opacity-100"
                  }`}
                >
                  <div className="relative">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setAddMenuGroupId((prev) =>
                          prev === group.id ? null : group.id
                        );
                      }}
                      className={`p-1 rounded hover:bg-app-active transition-colors ${
                        isAddMenuOpen
                          ? "bg-app-active text-app-accent"
                          : "text-app-muted hover:text-app-text"
                      }`}
                      title="Add Host or Subfolder"
                    >
                      <Plus className="w-3 h-3" />
                    </button>

                    {isAddMenuOpen && (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="absolute right-0 top-full mt-1 w-36 py-1 rounded-lg bg-app-panel border border-app-border shadow-xl z-50 flex flex-col"
                      >
                        <button
                          onClick={() => {
                            setAddMenuGroupId(null);
                            setExpandedGroups((prev) => ({
                              ...prev,
                              [group.id]: true,
                            }));
                            setActiveModal({
                              type: "host",
                              defaultGroupId: group.id,
                            });
                          }}
                          className="px-2.5 py-1.5 text-left text-xs text-app-text hover:bg-app-hover flex items-center gap-2 transition-colors"
                        >
                          <Server className="w-3.5 h-3.5 text-app-accent shrink-0" />
                          <span>New Host</span>
                        </button>
                        <button
                          onClick={() => {
                            setAddMenuGroupId(null);
                            setExpandedGroups((prev) => ({
                              ...prev,
                              [group.id]: true,
                            }));
                            setActiveModal({
                              type: "group",
                              defaultParentId: group.id,
                            });
                          }}
                          className="px-2.5 py-1.5 text-left text-xs text-app-text hover:bg-app-hover flex items-center gap-2 transition-colors"
                        >
                          <FolderPlus className="w-3.5 h-3.5 text-app-accent shrink-0" />
                          <span>New Folder</span>
                        </button>
                      </div>
                    )}
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveModal({ type: "group", item: group });
                    }}
                    className="p-1 rounded hover:bg-app-active text-app-muted hover:text-app-text"
                    title="Rename"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmModal({ type: "delete-group", group });
                    }}
                    className="p-1 rounded hover:bg-app-active text-app-muted hover:text-app-danger"
                    title="Delete"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
                {groupHosts.length > 0 && (
                  <span className="text-[10px] text-app-muted/70 pl-1">
                    {groupHosts.length}
                  </span>
                )}
              </div>
            </div>

            {isExpanded && (
              <div>
                {childGroups.length > 0 && renderGroupTree(group.id, depth + 1)}
                {groupHosts.map((host) => renderHostNode(host, depth + 1))}
              </div>
            )}
          </div>
        );
      });
  };

  return (
    <aside
      style={{ width: `${sidebarWidth}px` }}
      className="bg-app-sidebar border-r border-app-border flex flex-col shrink-0 relative select-none"
    >
      {/* Floating Drag Preview Badge */}
      {dragState?.active && (
        <div
          style={{
            left: `${dragState.currentX + 12}px`,
            top: `${dragState.currentY + 12}px`,
          }}
          className="fixed z-50 pointer-events-none px-2.5 py-1 rounded-md bg-app-panel border border-app-accent shadow-lg text-xs text-app-text flex items-center gap-1.5"
        >
          {dragState.type === "group" ? (
            <Folder className="w-3.5 h-3.5 text-app-accent shrink-0" />
          ) : (
            <span className="w-2 h-2 rounded-full bg-app-accent shrink-0" />
          )}
          <span className="font-medium truncate max-w-[160px]">{dragState.name}</span>
        </div>
      )}

      {/* Minimalist Navigation Tabs */}
      <div className="px-2.5 pt-2.5 pb-2 border-b border-app-border flex items-center gap-1.5">
        <div className="flex-1 min-w-0 flex gap-1 bg-app-bg p-1 rounded-lg border border-app-border">
          {railItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveNav(item.id)}
              className={`flex items-center justify-center gap-1.5 py-1 rounded-md text-[11px] transition-colors ${
                activeNav === item.id
                  ? "flex-[2] min-w-0 bg-app-panel text-app-text font-medium shadow-sm"
                  : "flex-1 text-app-muted hover:text-app-text"
              }`}
              title={item.label}
            >
              {item.icon}
              {activeNav === item.id && <span className="truncate">{item.label}</span>}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setSidebarCollapsed(true)}
          className="p-1.5 rounded-lg text-app-muted hover:text-app-text hover:bg-app-hover transition-colors shrink-0"
          title="Hide Sidebar (⌘B)"
        >
          <PanelLeftClose className="w-4 h-4" />
        </button>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-2.5 space-y-4">
        {activeNav === "hosts" && (
          <>
            {/* Minimal Filter Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-app-muted absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search"
                className="w-full bg-app-bg border border-app-border rounded-lg pl-8 pr-2.5 py-1 text-xs text-app-text placeholder:text-app-muted focus:outline-none focus:border-app-accent/60"
              />
            </div>

            {/* Subtle Tag Pills */}
            {allTags.length > 0 && (
              <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
                {allTags.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
                    className={`text-[10px] px-2 py-0.5 rounded-md shrink-0 transition-colors ${
                      selectedTag === tag
                        ? "bg-app-hover text-app-text border border-app-accent/50"
                        : "text-app-muted hover:text-app-text hover:bg-app-hover/50"
                    }`}
                  >
                    #{tag}
                  </button>
                ))}
              </div>
            )}

            {/* Folders & Servers Tree */}
            <div className="space-y-1">
              <div
                data-drop-group-id="ROOT"
                className={`flex items-center justify-between px-1.5 py-1 rounded-md transition-colors border ${
                  dragOverGroupId === "ROOT"
                    ? "bg-app-accent/20 border-app-accent text-app-text"
                    : "border-transparent"
                }`}
              >
                <span className="text-[11px] font-medium text-app-muted">
                  {dragState?.active && dragState.type === "group"
                    ? "Folders (Drop here for Root)"
                    : "Folders"}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setActiveModal({ type: "group" })}
                    className="px-1.5 py-0.5 rounded text-[11px] text-app-muted hover:text-app-text hover:bg-app-hover flex items-center gap-1 transition-colors"
                    title="New Folder"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Folder</span>
                  </button>
                  <button
                    onClick={() => setActiveModal({ type: "host" })}
                    className="px-1.5 py-0.5 rounded text-[11px] text-app-muted hover:text-app-text hover:bg-app-hover flex items-center gap-1 transition-colors"
                    title="New Host"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Host</span>
                  </button>
                </div>
              </div>
              <div className="space-y-0.5">{renderGroupTree(null, 0)}</div>
            </div>

            {/* Recent Sessions (5) */}
            <div className="space-y-1 pt-3 border-t border-app-border">
              <div className="flex items-center gap-1.5 px-1.5 pb-1 text-[11px] font-medium text-app-muted">
                <Clock className="w-3 h-3" />
                <span>Recent</span>
              </div>

              <div className="space-y-0.5">
                {recentHosts.length === 0 ? (
                  <p className="text-[11px] text-app-muted px-1.5">
                    No recent sessions
                  </p>
                ) : (
                  recentHosts.map((host) => {
                    const isSelected = selectedHostId === host.id;
                    return (
                      <div
                        key={`recent-${host.id}`}
                        onClick={() => {
                          setSelectedHostId(host.id);
                          const existingTab = useAppStore
                            .getState()
                            .tabs.find((t) => t.hostId === host.id);
                          if (existingTab) {
                            useAppStore.getState().setActiveTabId(existingTab.id);
                          } else {
                            openHostSession(host);
                          }
                        }}
                        onDoubleClick={() => openHostSession(host)}
                        className={`group px-2 py-1.5 rounded-lg transition-colors cursor-pointer flex items-center justify-between gap-2 text-xs ${
                          isSelected
                            ? "bg-app-hover text-app-text font-medium"
                            : "text-app-muted hover:bg-app-hover/60 hover:text-app-text"
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-1.5 h-1.5 rounded-full bg-app-success/70 shrink-0" />
                          <span className="truncate">{host.name}</span>
                        </div>

                        <div className="flex items-center shrink-0">
                          <span className="group-hover:hidden text-[10px] font-mono text-app-muted/60 truncate max-w-[100px]">
                            {host.hostname}
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openHostSession(host);
                            }}
                            className="hidden group-hover:flex p-1 rounded hover:bg-app-active text-app-muted hover:text-app-accent transition-colors shrink-0"
                            title="Connect"
                          >
                            <Play className="w-3 h-3 fill-current" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </>
        )}

        {activeNav === "vault" && (
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <span className="text-[11px] font-medium text-app-muted">
                Credentials
              </span>
              <button
                onClick={() => setActiveModal({ type: "credential" })}
                className="px-2 py-1 rounded-md bg-app-hover hover:bg-app-active text-app-text text-[11px] font-medium flex items-center gap-1 transition-colors"
              >
                <Plus className="w-3 h-3" /> New
              </button>
            </div>
            {credentials.map((cred) => (
              <div
                key={cred.id}
                className="p-2.5 rounded-lg bg-app-panel border border-app-border space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-app-text truncate">
                    {cred.name}
                  </span>
                  <div className="flex items-center gap-0.5">
                    <button
                      onClick={() => setActiveModal({ type: "credential", item: cred })}
                      className="p-1 rounded hover:bg-app-hover text-app-muted hover:text-app-text"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => deleteCredential(cred.id)}
                      className="p-1 rounded hover:bg-app-hover text-app-muted hover:text-app-danger"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    onClick={() => handleCopyText(`u-${cred.id}`, cred.username)}
                    className="px-2 py-1 rounded-md bg-app-bg hover:bg-app-hover border border-app-border text-[11px] text-app-text flex items-center justify-between"
                  >
                    <span>Username</span>
                    {copiedId === `u-${cred.id}` ? (
                      <Check className="w-3 h-3 text-app-success shrink-0" />
                    ) : (
                      <Copy className="w-3 h-3 text-app-muted shrink-0" />
                    )}
                  </button>
                  <button
                    onClick={() => handleCopyText(`p-${cred.id}`, cred.secretValue)}
                    className="px-2 py-1 rounded-md bg-app-bg hover:bg-app-hover border border-app-border text-[11px] text-app-text flex items-center justify-between"
                  >
                    <span>Password</span>
                    {copiedId === `p-${cred.id}` ? (
                      <Check className="w-3 h-3 text-app-success shrink-0" />
                    ) : (
                      <Copy className="w-3 h-3 text-app-muted shrink-0" />
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeNav === "snippets" && (
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <span className="text-[11px] font-medium text-app-muted">
                Snippets
              </span>
              <button
                onClick={() => setActiveModal({ type: "snippet" })}
                className="px-2 py-1 rounded-md bg-app-hover hover:bg-app-active text-app-text text-[11px] font-medium flex items-center gap-1 transition-colors"
              >
                <Plus className="w-3 h-3" /> New
              </button>
            </div>
            {snippets.map((snip) => (
              <div
                key={snip.id}
                className="p-2.5 rounded-lg bg-app-panel border border-app-border space-y-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-app-text truncate">
                    {snip.name}
                  </span>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      onClick={() => triggerSnippetExecution(snip)}
                      className="p-1 rounded hover:bg-app-hover text-app-muted hover:text-app-accent"
                      title="Run"
                    >
                      <Play className="w-3 h-3 fill-current" />
                    </button>
                    <button
                      onClick={() => setActiveModal({ type: "snippet", item: snip })}
                      className="p-1 rounded hover:bg-app-hover text-app-muted hover:text-app-text"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => deleteSnippet(snip.id)}
                      className="p-1 rounded hover:bg-app-hover text-app-muted hover:text-app-danger"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
                <pre className="text-[11px] font-mono p-1.5 rounded bg-app-bg text-app-muted overflow-x-auto">
                  {snip.command}
                </pre>
              </div>
            ))}
          </div>
        )}

        {activeNav === "aliases" && (
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <span className="text-[11px] font-medium text-app-muted">
                Aliases
              </span>
              <button
                onClick={() => setActiveModal({ type: "alias" })}
                className="px-2 py-1 rounded-md bg-app-hover hover:bg-app-active text-app-text text-[11px] font-medium flex items-center gap-1 transition-colors"
              >
                <Plus className="w-3 h-3" /> New
              </button>
            </div>

            <button
              onClick={() => {
                const enabled = aliases.filter(
                  (a) => a.enabled && /^[a-zA-Z0-9_-]+$/.test(a.alias)
                );
                if (enabled.length === 0) return;
                const cmd = ` export HISTCONTROL=ignorespace; ${enabled
                  .map((a) => `alias ${a.alias}='${a.command.replace(/'/g, "'\\''")}'`)
                  .join("; ")}`;
                useAppStore.getState().dispatchCommandToTerminals(cmd);
              }}
              className="w-full py-1.5 px-3 rounded-lg bg-app-panel hover:bg-app-hover border border-app-border text-app-text text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
            >
              <Terminal className="w-3.5 h-3.5 text-app-accent" />
              <span>Inject to Session</span>
            </button>

            {aliases.map((al) => (
              <div
                key={al.id}
                className="p-2.5 rounded-lg bg-app-panel border border-app-border flex items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <div className="text-xs font-mono truncate">
                    <span className="text-app-accent font-medium">{al.alias}</span>
                    <span className="text-app-muted"> = {al.command}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <input
                    type="checkbox"
                    checked={al.enabled}
                    onChange={(e) => upsertAlias({ ...al, enabled: e.target.checked })}
                    className="w-3.5 h-3.5 accent-cyan-500 cursor-pointer"
                  />
                  <button
                    onClick={() => setActiveModal({ type: "alias", item: al })}
                    className="p-1 rounded hover:bg-app-hover text-app-muted hover:text-app-text"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => deleteAlias(al.id)}
                    className="p-1 rounded hover:bg-app-hover text-app-muted hover:text-app-danger"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Interactive Right Border Resize Handle */}
      <div
        onMouseDown={(e) => {
          e.preventDefault();
          setIsResizing(true);
        }}
        className={`absolute top-0 right-0 w-1 h-full cursor-col-resize transition-colors z-40 ${
          isResizing
            ? "bg-app-accent"
            : "hover:bg-app-accent/50 bg-transparent"
        }`}
      />
    </aside>
  );
};
