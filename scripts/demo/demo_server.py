#!/usr/bin/env python3
"""A scripted SSH server for Soliton Term screenshots and demos.

It listens on loopback only, accepts one demo key, and answers a handful of well-known
commands with canned output. **It never executes anything**: every reply is a string in this
file, so it is safe to run and shows no data from the machine it runs on.

    pip install asyncssh==2.21.1
    python3 scripts/demo/demo_server.py --dir /tmp/soliton-demo      # writes keys, serves on 2201-2205

See scripts/demo/README.md for how the screenshots are made.
"""
import argparse
import asyncio
import os
import re
import subprocess
import sys

import asyncssh

HOSTS = {
    2201: "k8s-master-01",
    2202: "k8s-worker-gpu-01",
    2203: "pg-primary-db01",
    2204: "edge-envoy-gw01",
    2205: "stage-app-runner",
}
USER = "ops"

NODES = """NAME                STATUS   ROLES           AGE    VERSION
k8s-master-01       Ready    control-plane   214d   v1.31.4
k8s-worker-01       Ready    <none>          214d   v1.31.4
k8s-worker-02       Ready    <none>          214d   v1.31.4
k8s-worker-gpu-01   Ready    <none>          97d    v1.31.4"""

PODS = """NAMESPACE     NAME                                READY   STATUS    RESTARTS   AGE
payments      payments-api-7d9c6b8f5-4xk2p        1/1     Running   0          3d4h
payments      payments-api-7d9c6b8f5-9mw7q        1/1     Running   0          3d4h
payments      ledger-worker-5c7f9d6b4-2hn8t       1/1     Running   2          9d
checkout      checkout-web-6b8d7c9f4-lq5vz        1/1     Running   0          12h
checkout      checkout-web-6b8d7c9f4-tr6s8        1/1     Running   0          12h
monitoring    prometheus-0                        2/2     Running   0          41d
monitoring    grafana-84f6c7d9b8-xj4nk            1/1     Running   0          41d
kube-system   coredns-7db6d8ff4d-bz9qc            1/1     Running   0          214d"""

DOCKER_STATS = """CONTAINER ID   NAME              CPU %     MEM USAGE / LIMIT     MEM %     NET I/O          PIDS
3f9a1c2d7e44   stage-app         3.12%     412.6MiB / 1.953GiB   20.63%    1.84GB / 920MB   38
a81b5e60c9d2   stage-postgres    1.07%     238.1MiB / 1.953GiB   11.90%    612MB / 540MB    21
c47d0e1fb3a8   stage-redis       0.31%     9.9MiB / 1.953GiB     0.49%     88MB / 71MB      5"""


def uptime(host):
    return " 14:02:11 up 41 days,  6:12,  2 users,  load average: 0.42, 0.37, 0.35"


def free(host):
    return """               total        used        free      shared  buff/cache   available
Mem:            31Gi        11Gi       4.2Gi       412Mi        15Gi        19Gi
Swap:          2.0Gi          0B       2.0Gi"""


def df(host):
    return """Filesystem     Type      Size  Used Avail Use% Mounted on
/dev/nvme0n1p2 ext4      468G  187G  258G  43% /
/dev/nvme0n1p1 vfat      511M  6.1M  505M   2% /boot/efi
/dev/nvme1n1   xfs       1.8T  1.1T  738G  60% /var/lib/data"""


def ls(host):
    return """total 36K
drwxr-x--- 5 ops ops 4.0K Oct 30 09:12 .
drwxr-xr-x 3 root root 4.0K Jan 14  2026 ..
-rw------- 1 ops ops 2.1K Oct 30 09:11 .bash_history
drwx------ 2 ops ops 4.0K Jan 14  2026 .ssh
drwxr-xr-x 2 ops ops 4.0K Oct 12 16:40 backups
-rwxr-xr-x 1 ops ops 1.3K Sep 28 11:03 deploy.sh
drwxr-xr-x 3 ops ops 4.0K Oct 21 14:22 manifests"""


def ss(host, arg):
    m = re.search(r":(\d+)", arg or "")
    port = m.group(1) if m else "443"
    return f"tcp   LISTEN 0      4096         0.0.0.0:{port}       0.0.0.0:*    users:((\"envoy\",pid=1184,fd=18))"


def run(host, command):
    """Return the canned output for one simple command (no pipes)."""
    parts = command.split()
    if not parts:
        return ""
    name, args = parts[0], " ".join(parts[1:])
    if name == "uptime":
        return uptime(host)
    if name == "free":
        return free(host)
    if name == "df":
        return df(host)
    if name in ("ls", "ll"):
        return ls(host)
    if name == "hostname":
        return host
    if name == "whoami":
        return USER
    if name == "pwd":
        return f"/home/{USER}"
    if name == "date":
        return "Sun Nov  1 14:02:44 UTC 2026"
    if name in ("kubectl", "k"):
        if args.startswith("get nodes"):
            return NODES
        if args.startswith("get pods"):
            return PODS
        if args.startswith("logs"):
            return ("2026-11-01T14:01:58Z INFO  request id=9f3c method=POST path=/v1/charge status=200 dur=41ms\n"
                    "2026-11-01T14:02:03Z INFO  request id=9f3d method=GET path=/healthz status=200 dur=1ms\n"
                    "2026-11-01T14:02:09Z WARN  retrying upstream ledger-worker attempt=2\n"
                    "2026-11-01T14:02:09Z INFO  request id=9f3e method=POST path=/v1/charge status=200 dur=88ms")
        return "error: unknown command for this demo"
    if name == "docker":
        if args.startswith("stats"):
            return DOCKER_STATS
        if args.startswith("ps"):
            return DOCKER_STATS.replace("CPU %     MEM USAGE / LIMIT     MEM %     NET I/O          PIDS",
                                        "IMAGE            STATUS        PORTS")
        return ""
    if name == "ss":
        return ss(host, args)
    if name in ("export", "alias", "set", "unset", "history"):
        return ""
    return f"bash: {name}: command not found"


def filter_grep(text, spec):
    """Apply `grep [-v] pattern` from a pipeline."""
    tokens = spec.split()[1:]
    invert = False
    if tokens and tokens[0] == "-v":
        invert, tokens = True, tokens[1:]
    pattern = (tokens[0] if tokens else "").strip("'\"")
    keep = [line for line in text.split("\n") if (pattern in line) != invert]
    return "\n".join(keep)


def evaluate(host, line):
    out = []
    for segment in re.split(r"\s*&&\s*|;", line.strip()):
        if not segment.strip():
            continue
        stages = [s.strip() for s in segment.split("|")]
        text = run(host, stages[0])
        for stage in stages[1:]:
            if stage.startswith("grep"):
                text = filter_grep(text, stage)
        if text:
            out.append(text)
    return "\n".join(out)


async def shell(process):
    host = HOSTS.get(process.channel.get_extra_info("sockname")[1], "demo")
    write = lambda s: process.stdout.write(s.replace("\n", "\r\n"))
    prompt = f"\x1b[1;32m{USER}@{host}\x1b[0m:\x1b[1;34m~\x1b[0m$ "
    write(f"Welcome to Ubuntu 24.04.1 LTS (GNU/Linux 6.8.0-48-generic x86_64)\n\nLast login: Sat Oct 31 22:47:09 2026 from 10.8.0.14\n")
    while True:
        write(prompt)
        try:
            line = await process.stdin.readline()
        except asyncssh.TerminalSizeChanged:
            continue
        except (asyncssh.BreakReceived, asyncssh.SignalReceived):
            continue
        if not line:
            break
        cmd = line.strip()
        if cmd in ("exit", "logout"):
            write("logout\n")
            break
        if cmd == "clear" or "HISTCONTROL" in cmd:
            write("\x1b[H\x1b[2J\x1b[3J")
            continue
        out = evaluate(host, cmd)
        if out:
            write(out + "\n")
    process.exit(0)


def ensure_keys(directory):
    os.makedirs(directory, exist_ok=True)
    host_key = os.path.join(directory, "host_key")
    client_key = os.path.join(directory, "demo_key")
    if not os.path.exists(host_key):
        asyncssh.generate_private_key("ssh-ed25519").write_private_key(host_key)
    if not os.path.exists(client_key):
        subprocess.run(["ssh-keygen", "-q", "-t", "ed25519", "-N", "", "-C", "soliton-demo", "-f", client_key], check=True)
    os.chmod(host_key, 0o600)
    return host_key, client_key + ".pub", client_key


async def main(directory):
    host_key, authorized, client_key = ensure_keys(directory)
    for port in HOSTS:
        await asyncssh.create_server(
            lambda: asyncssh.SSHServer(), "127.0.0.1", port,
            server_host_keys=[host_key], authorized_client_keys=authorized,
            process_factory=shell, line_editor=True, encoding="utf-8",
            password_auth=False, kbdint_auth=False,
        )
    print(f"demo SSH servers on 127.0.0.1:{min(HOSTS)}-{max(HOSTS)} as user '{USER}'")
    print(f"client key: {client_key}")
    sys.stdout.flush()
    await asyncio.Event().wait()


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--dir", default="/tmp/soliton-demo", help="where the demo host and client keys are kept")
    args = ap.parse_args()
    try:
        asyncio.run(main(args.dir))
    except KeyboardInterrupt:
        pass
