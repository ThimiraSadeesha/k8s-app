"""Parsers for the fixed collection script's output. Pure functions: no I/O, no shell."""

import json
import re
from datetime import UTC, datetime, timedelta

from app.core.logging import redact
from app.schemas.infra import ContainerMetricsIn, ContainerReport, HostFacts, HostMetrics, ReportIn

# One round trip per collection. Fixed text: nothing user-supplied is ever interpolated into it.
COLLECT_SCRIPT = r"""
export LC_ALL=C
echo '##CPU1'; head -n1 /proc/stat
echo '##NET1'; cat /proc/net/dev
sleep 1
echo '##CPU2'; head -n1 /proc/stat
echo '##NET2'; cat /proc/net/dev
echo '##MEM'; cat /proc/meminfo
echo '##NPROC'; nproc 2>/dev/null
echo '##DISK'; df -kP / | tail -n1
echo '##UPTIME'; cat /proc/uptime
echo '##OS'; (. /etc/os-release 2>/dev/null; echo "$PRETTY_NAME"); uname -r; uname -m; hostname
echo '##DOCKERV'; docker version --format '{{.Server.Version}}' 2>/dev/null
echo '##INSPECT'; ids=$(docker ps -aq --no-trunc 2>/dev/null); if [ -n "$ids" ]; then docker inspect $ids 2>/dev/null; fi
echo '##STATS'; docker stats --no-stream --no-trunc --format '{{json .}}' 2>/dev/null
echo '##END'
"""

_UNITS = {"b": 1, "kb": 1000, "mb": 1000**2, "gb": 1000**3, "tb": 1000**4,
          "kib": 1024, "mib": 1024**2, "gib": 1024**3, "tib": 1024**4}
_STATES = {"created", "running", "paused", "restarting", "exited", "dead", "removing"}


def sections(output: str) -> dict[str, str]:
    out: dict[str, list[str]] = {}
    cur = None
    for line in output.splitlines():
        if line.startswith("##") and line[2:].isupper():
            cur = line[2:]
            out[cur] = []
        elif cur is not None:
            out[cur].append(line)
    return {k: "\n".join(v).strip() for k, v in out.items()}


def parse_size(text: str) -> int | None:
    m = re.fullmatch(r"\s*([0-9.]+)\s*([A-Za-z]+)\s*", text or "")
    if not m or m.group(2).lower() not in _UNITS:
        return None
    return int(float(m.group(1)) * _UNITS[m.group(2).lower()])


def _cpu_times(line: str) -> tuple[int, int] | None:
    parts = line.split()
    if len(parts) < 6 or parts[0] != "cpu":
        return None
    v = [int(x) for x in parts[1:9] if x.isdigit()]
    return (sum(v), v[3] + (v[4] if len(v) > 4 else 0)) if len(v) >= 4 else None  # total, idle+iowait


def _net_totals(text: str) -> tuple[int, int]:
    rx = tx = 0
    for line in text.splitlines():
        if ":" not in line:
            continue
        name, data = line.split(":", 1)
        f = data.split()
        if name.strip() == "lo" or len(f) < 9 or not f[0].isdigit():
            continue
        rx, tx = rx + int(f[0]), tx + int(f[8])
    return rx, tx


def _meminfo(text: str) -> dict[str, int]:
    out = {}
    for line in text.splitlines():
        m = re.match(r"(\w+):\s+(\d+)", line)
        if m:
            out[m.group(1)] = int(m.group(2)) * 1024
    return out


def host_metrics(s: dict[str, str]) -> HostMetrics:
    cpu = None
    a, b = _cpu_times(s.get("CPU1", "")), _cpu_times(s.get("CPU2", ""))
    if a and b and b[0] > a[0]:
        cpu = round(max(0.0, min(100.0, (1 - (b[1] - a[1]) / (b[0] - a[0])) * 100)), 2)
    mem = _meminfo(s.get("MEM", ""))
    total = mem.get("MemTotal")
    used = total - mem["MemAvailable"] if total and "MemAvailable" in mem else None
    disk_used = disk_total = None
    f = s.get("DISK", "").split()
    if len(f) >= 3 and f[1].isdigit() and f[2].isdigit():
        disk_total, disk_used = int(f[1]) * 1024, int(f[2]) * 1024
    rx1, tx1 = _net_totals(s.get("NET1", ""))
    rx2, tx2 = _net_totals(s.get("NET2", ""))
    # The two samples are ~1 s apart (the script sleeps 1 s between them).
    return HostMetrics(
        cpu_pct=cpu, mem_used=used, mem_total=total, disk_used=disk_used, disk_total=disk_total,
        net_rx_bps=float(max(0, rx2 - rx1)), net_tx_bps=float(max(0, tx2 - tx1)))


def _int(text: str) -> int | None:
    return int(text) if text.strip().isdigit() and 0 < int(text) < 100_000 else None


def host_facts(s: dict[str, str], now: datetime) -> HostFacts:
    lines = (s.get("OS", "").splitlines() + [""] * 4)[:4]
    boot = None
    try:
        boot = now - timedelta(seconds=float(s.get("UPTIME", "").split()[0]))
    except (IndexError, ValueError):
        pass
    return HostFacts(
        os_name=lines[0][:120] or None, kernel=lines[1][:120] or None, arch=lines[2][:32] or None,
        hostname=lines[3][:255] or None, cpu_count=_int(s.get("NPROC", "")), docker_version=(s.get("DOCKERV", "")[:32] or None),
        boot_time=boot, agent_version="ssh")


def _ts(value: str | None) -> datetime | None:
    if not value or value.startswith("0001-"):
        return None
    m = re.fullmatch(r"(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.(\d+))?(Z|[+-]\d\d:\d\d)", value)
    if not m:
        return None
    frac = (m.group(2) or "0")[:6].ljust(6, "0")
    tz = "+00:00" if m.group(3) == "Z" else m.group(3)
    try:
        return datetime.fromisoformat(f"{m.group(1)}.{frac}{tz}").astimezone(UTC)
    except ValueError:
        return None


def _ports(raw: dict | None) -> list:
    out = []
    for spec, binds in (raw or {}).items():
        port, _, proto = spec.partition("/")
        for b in binds or [None]:
            out.append({"container_port": port, "protocol": proto or "tcp",
                        "host_ip": (b or {}).get("HostIp"), "host_port": (b or {}).get("HostPort")})
    return out[:100]


def _stats(text: str) -> dict[str, ContainerMetricsIn]:
    out = {}
    for line in text.splitlines():
        try:
            d = json.loads(line)
        except ValueError:
            continue
        used, _, limit = (d.get("MemUsage") or "").partition("/")
        rx, _, tx = (d.get("NetIO") or "").partition("/")
        try:
            cpu = float((d.get("CPUPerc") or "").strip().rstrip("%"))
        except ValueError:
            cpu = None
        out[d.get("ID", "")] = ContainerMetricsIn(
            cpu_pct=cpu, mem_used=parse_size(used), mem_limit=parse_size(limit),
            net_rx_bytes=parse_size(rx), net_tx_bytes=parse_size(tx))
    return out


def containers(s: dict[str, str]) -> list[ContainerReport]:
    try:
        inspected = json.loads(s.get("INSPECT") or "[]")
    except ValueError:
        return []
    stats = _stats(s.get("STATS", ""))
    reports = []
    for c in inspected[:500]:
        state = c.get("State") or {}
        status = state.get("Status") if state.get("Status") in _STATES else "unknown"
        health = (state.get("Health") or {}).get("Status")
        cid = c.get("Id", "")
        reports.append(ContainerReport(
            docker_id=cid[:64], name=(c.get("Name") or cid).lstrip("/")[:255] or cid[:12],
            image=((c.get("Config") or {}).get("Image") or "")[:512],
            image_id=(c.get("Image") or None) and c["Image"][:80],
            state=status, health_status=health if health in ("starting", "healthy", "unhealthy") else "none",
            restart_count=int(c.get("RestartCount") or 0),
            restart_policy=((c.get("HostConfig") or {}).get("RestartPolicy") or {}).get("Name") or None,
            ports=_ports((c.get("NetworkSettings") or {}).get("Ports")),
            labels=redact((c.get("Config") or {}).get("Labels") or None),
            docker_created_at=_ts(c.get("Created")), started_at=_ts(state.get("StartedAt")),
            metrics=stats.get(cid)))
    return reports


def build_report(output: str, now: datetime) -> ReportIn:
    s = sections(output)
    if "END" not in s:
        raise ValueError("incomplete collection output")
    docker_ok = bool(s.get("DOCKERV"))
    return ReportIn(
        facts=host_facts(s, now), metrics=host_metrics(s), containers=containers(s),
        # No Docker access (not installed / user not in the docker group): say nothing about
        # containers rather than marking every known one "unknown".
        containers_complete=docker_ok)
