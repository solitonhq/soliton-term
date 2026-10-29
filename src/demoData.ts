// Sample workspace used only in browser preview (`npm run dev` without Tauri),
// for development and screenshots. The desktop app starts with an empty vault.
import type {
  AliasItem,
  CredentialItem,
  HostEntry,
  HostGroup,
  SnippetItem,
} from "./store/useAppStore";

export const DEMO_GROUPS: HostGroup[] = [
  { id: "grp-prod", name: "Production Cluster", parentId: null },
  { id: "grp-prod-k8s", name: "Kubernetes Nodes", parentId: "grp-prod" },
  { id: "grp-prod-db", name: "Database Replicas", parentId: "grp-prod" },
  { id: "grp-stage", name: "Staging & QA", parentId: null },
  { id: "grp-dmz", name: "DMZ / Edge Gateways", parentId: null },
];

export const DEMO_CREDENTIALS: CredentialItem[] = [
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
];

export const DEMO_HOSTS: HostEntry[] = [
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
];

export const DEMO_SNIPPETS: SnippetItem[] = [
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
];

export const DEMO_ALIASES: AliasItem[] = [
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
];
