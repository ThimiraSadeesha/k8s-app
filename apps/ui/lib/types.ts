export interface Me {
  host: string;
  port: number;
  username: string;
  fingerprint: string;
}

export interface HostFacts {
  hostname: string | null;
  os_name: string | null;
  kernel: string | null;
  arch: string | null;
  cpu_count: number | null;
  docker_version: string | null;
  boot_time: string | null;
}

export interface HostMetrics {
  cpu_pct: number | null;
  mem_used: number | null;
  mem_total: number | null;
  disk_used: number | null;
  disk_total: number | null;
  net_rx_bps: number | null;
  net_tx_bps: number | null;
}

export interface ContainerMetrics {
  cpu_pct: number | null;
  mem_used: number | null;
  mem_limit: number | null;
  net_rx_bytes: number | null;
  net_tx_bytes: number | null;
}

export interface ContainerRow {
  docker_id: string;
  name: string;
  image: string;
  state: string;
  health_status: "none" | "starting" | "healthy" | "unhealthy";
  restart_count: number;
  restart_policy: string | null;
  ports: { container_port: string; protocol: string; host_ip: string | null; host_port: string | null }[] | null;
  started_at: string | null;
  metrics: ContainerMetrics | null;
}

export interface Overview {
  host: string;
  facts: HostFacts | null;
  metrics: HostMetrics | null;
  containers: ContainerRow[];
  docker_available: boolean;
}
