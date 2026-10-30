"""Shapes returned by the monitoring endpoints. Nothing here is persisted."""

from typing import Literal

from pydantic import AwareDatetime, BaseModel, Field, field_validator

ContainerState = Literal[
    "created", "running", "paused", "restarting", "exited", "dead", "removing", "unknown"]


class LoginIn(BaseModel):
    host: str = Field(min_length=1, max_length=255)
    port: int = Field(default=22, ge=1, le=65535)
    username: str = Field(min_length=1, max_length=64, pattern=r"^[A-Za-z0-9_][A-Za-z0-9_.\-]*$")
    password: str = Field(min_length=1, max_length=256, repr=False)
    # SHA256 fingerprint the operator confirmed. Without it, login stops and returns the
    # fingerprint so it can be checked.
    host_key_fingerprint: str | None = Field(default=None, max_length=128)

    @field_validator("host")
    @classmethod
    def _host(cls, v: str) -> str:
        from app.services.ssh import validate_host_syntax

        return validate_host_syntax(v)


class HostFacts(BaseModel):
    hostname: str | None = Field(default=None, max_length=255)
    os_name: str | None = Field(default=None, max_length=120)
    kernel: str | None = Field(default=None, max_length=120)
    arch: str | None = Field(default=None, max_length=32)
    cpu_count: int | None = Field(default=None, ge=1)
    docker_version: str | None = Field(default=None, max_length=32)
    boot_time: AwareDatetime | None = None
    agent_version: str | None = Field(default=None, max_length=32)


class HostMetrics(BaseModel):
    cpu_pct: float | None = Field(default=None, ge=0, le=100)
    mem_used: int | None = Field(default=None, ge=0)
    mem_total: int | None = Field(default=None, ge=0)
    disk_used: int | None = Field(default=None, ge=0)
    disk_total: int | None = Field(default=None, ge=0)
    net_rx_bps: float | None = Field(default=None, ge=0)
    net_tx_bps: float | None = Field(default=None, ge=0)


class ContainerMetricsIn(BaseModel):
    cpu_pct: float | None = Field(default=None, ge=0)
    mem_used: int | None = Field(default=None, ge=0)
    mem_limit: int | None = Field(default=None, ge=0)
    net_rx_bytes: int | None = Field(default=None, ge=0)
    net_tx_bytes: int | None = Field(default=None, ge=0)


class ContainerReport(BaseModel):
    docker_id: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=255)
    image: str = Field(max_length=512)
    image_id: str | None = Field(default=None, max_length=80)
    state: ContainerState = "unknown"
    health_status: Literal["none", "starting", "healthy", "unhealthy"] = "none"
    restart_count: int = Field(default=0, ge=0)
    restart_policy: str | None = Field(default=None, max_length=32)
    ports: list | None = Field(default=None, max_length=100)
    labels: dict | None = None
    docker_created_at: AwareDatetime | None = None
    started_at: AwareDatetime | None = None
    metrics: ContainerMetricsIn | None = None


class ReportIn(BaseModel):
    facts: HostFacts | None = None
    metrics: HostMetrics | None = None
    containers: list[ContainerReport] = Field(default_factory=list, max_length=500)
    # False when Docker could not be queried (not installed / no permission).
    containers_complete: bool = True


class ActionIn(BaseModel):
    action: Literal["start", "stop", "restart", "pause", "unpause"]


class RemoveIn(BaseModel):
    force: bool = False
