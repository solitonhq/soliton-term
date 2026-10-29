import { beforeEach, describe, expect, it } from "vitest";
import { useAppStore, type HostEntry, type HostGroup } from "./useAppStore";

const group = (id: string, parentId: string | null = null): HostGroup => ({
  id,
  name: id,
  parentId,
});

const host = (id: string, groupId: string): HostEntry => ({
  id,
  name: id,
  hostname: "10.0.0.1",
  port: 22,
  groupId,
  credentialId: "",
  tags: ["prod"],
  injectAliases: false,
});

const reset = (patch: Partial<ReturnType<typeof useAppStore.getState>> = {}) =>
  useAppStore.setState({
    groups: [],
    hosts: [],
    credentials: [],
    snippets: [],
    aliases: [],
    tabs: [],
    activeTabId: null,
    broadcastTargetTabIds: [],
    notice: null,
    ...patch,
  });

describe("folder tree", () => {
  beforeEach(() => reset());

  it("refuses to move a folder into its own descendant", async () => {
    reset({ groups: [group("a"), group("b", "a"), group("c", "b")] });
    await useAppStore.getState().moveGroupToParent("a", "c");
    expect(useAppStore.getState().groups.find((g) => g.id === "a")?.parentId).toBeNull();
  });

  it("moves a folder to a valid new parent", async () => {
    reset({ groups: [group("a"), group("b")] });
    await useAppStore.getState().moveGroupToParent("b", "a");
    expect(useAppStore.getState().groups.find((g) => g.id === "b")?.parentId).toBe("a");
  });

  it("re-parents children and rehomes hosts when a folder is deleted", async () => {
    reset({
      groups: [group("root"), group("mid", "root"), group("leaf", "mid")],
      hosts: [host("h1", "mid")],
    });
    await useAppStore.getState().deleteGroup("mid");
    const s = useAppStore.getState();
    expect(s.groups.find((g) => g.id === "leaf")?.parentId).toBe("root");
    expect(s.hosts[0].groupId).toBe("root");
  });
});

describe("hosts", () => {
  beforeEach(() => reset());

  it("gives the first host in an empty vault a default folder", async () => {
    await useAppStore.getState().upsertHost(host("h1", ""));
    const s = useAppStore.getState();
    expect(s.groups).toHaveLength(1);
    expect(s.hosts[0].groupId).toBe(s.groups[0].id);
  });

  it("duplicates a host with a distinct id and a copy of its tags", async () => {
    reset({ groups: [group("g")], hosts: [host("h1", "g")] });
    await useAppStore.getState().duplicateHost("h1");
    const [orig, copy] = useAppStore.getState().hosts;
    expect(copy.id).not.toBe(orig.id);
    expect(copy.tags).toEqual(orig.tags);
    expect(copy.tags).not.toBe(orig.tags);
  });
});

describe("sessions", () => {
  beforeEach(() => reset());

  it("opens SSH tabs as connecting and tracks status changes", () => {
    const h = host("h1", "g");
    useAppStore.getState().openHostSession(h);
    const tab = useAppStore.getState().tabs[0];
    expect(tab.status).toBe("connecting");
    useAppStore.getState().setTabStatus(tab.id, "connected");
    expect(useAppStore.getState().tabs[0].status).toBe("connected");
  });

  it("closing the active tab activates the previous one and drops it from broadcast", () => {
    const s = useAppStore.getState();
    s.openHostSession(host("h1", "g"));
    s.openHostSession(host("h2", "g"));
    const [first, second] = useAppStore.getState().tabs;
    useAppStore.getState().closeTab(second.id);
    const after = useAppStore.getState();
    expect(after.activeTabId).toBe(first.id);
    expect(after.broadcastTargetTabIds).not.toContain(second.id);
  });
});

describe("export & snippets", () => {
  beforeEach(() => reset());

  it("omits secrets from exports unless asked", () => {
    reset({
      credentials: [
        { id: "c1", name: "c", username: "u", secretType: "password", secretValue: "hunter2" },
      ],
    });
    const without = JSON.parse(useAppStore.getState().exportVaultBundle(false));
    const withSecrets = JSON.parse(useAppStore.getState().exportVaultBundle(true));
    expect(without.credentials[0].secretValue).toBe("");
    expect(JSON.stringify(without)).not.toContain("hunter2");
    expect(withSecrets.credentials[0].secretValue).toBe("hunter2");
  });

  it("asks for variables only when a snippet has {{placeholders}}", () => {
    const snip = { id: "s", name: "s", category: "", description: "" };
    useAppStore.getState().triggerSnippetExecution({ ...snip, command: "uptime" });
    expect(useAppStore.getState().pendingSnippetToRun).toBeNull();
    expect(useAppStore.getState().lastDispatchedCommand?.command).toBe("uptime");

    useAppStore.getState().triggerSnippetExecution({ ...snip, command: "ss | grep :{{port}}" });
    expect(useAppStore.getState().pendingSnippetToRun?.command).toContain("{{port}}");
  });
});
