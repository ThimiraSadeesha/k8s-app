"""A real SSH server (asyncssh) that pretends to be a Docker host. For tests and the Postman suite."""

import asyncio
import json
import re

import asyncssh

CID = {"web": "a" * 64, "worker": "b" * 64}


class FakeSsh:
    def __init__(self, user="deploy", password="s3cret-pass", docker=True):
        self.user, self.password, self.docker = user, password, docker
        self.key = asyncssh.generate_private_key("ssh-ed25519")
        self.states = {"web": "running", "worker": "exited"}
        self.commands: list[str] = []
        self.auth_attempts: list[tuple[str, str]] = []
        self.fail_docker = False
        self._server = None
        self.port = 0

    @property
    def fingerprint(self) -> str:
        return self.key.convert_to_public().get_fingerprint("sha256")

    async def start(self, port: int = 0, host: str = "127.0.0.1") -> int:
        outer = self

        class Auth(asyncssh.SSHServer):
            def password_auth_supported(self):
                return True

            def validate_password(self, username, password):
                outer.auth_attempts.append((username, password))
                return (username, password) == (outer.user, outer.password)

        self._server = await asyncssh.listen(
            host, port, server_factory=Auth, server_host_keys=[self.key],
            process_factory=self._handle, encoding="utf-8")
        self.port = self._server.sockets[0].getsockname()[1]
        return self.port

    async def stop(self):
        if self._server:
            self._server.close()
            await self._server.wait_closed()

    # -- command emulation ---------------------------------------------------------------

    def _inspect(self):
        out = []
        for name, st in self.states.items():
            out.append({
                "Id": CID[name], "Name": f"/{name}", "Created": "2026-10-01T08:00:00.123456789Z",
                "Image": "sha256:" + "c" * 64, "RestartCount": 2 if name == "worker" else 0,
                "State": {"Status": st, "StartedAt": "2026-10-17T09:00:00.5Z" if st == "running"
                          else "0001-01-01T00:00:00Z",
                          **({"Health": {"Status": "healthy"}} if name == "web" else {})},
                "Config": {"Image": "nginx:1.27" if name == "web" else "app:2",
                           "Labels": {"app": name, "db_password": "hunter2"}},
                "HostConfig": {"RestartPolicy": {"Name": "always"}},
                "NetworkSettings": {"Ports": {"80/tcp": [{"HostIp": "0.0.0.0", "HostPort": "8080"}]}
                                    if name == "web" else {}}})
        return out

    def _collect(self) -> str:
        stats = "\n".join(json.dumps({"ID": CID[n], "CPUPerc": "1.50%", "MemUsage": "10MiB / 100MiB",
                                      "NetIO": "1kB / 2kB"}) for n in self.states if self.states[n] == "running")
        return "\n".join([
            "##CPU1", "cpu  100 0 100 800 0 0 0 0",
            "##NET1", "Inter-|   Receive", " face |bytes packets", "    lo: 99999 1 0 0 0 0 0 0 99999 1 0 0 0 0 0 0",
            "  eth0: 1000 10 0 0 0 0 0 0 500 5 0 0 0 0 0 0",
            "##CPU2", "cpu  150 0 150 900 0 0 0 0",
            "##NET2", "Inter-|   Receive", " face |bytes packets", "    lo: 199999 1 0 0 0 0 0 0 199999 1 0 0 0 0 0 0",
            "  eth0: 3000 10 0 0 0 0 0 0 1500 5 0 0 0 0 0 0",
            "##MEM", "MemTotal:        1000000 kB", "MemAvailable:     400000 kB",
            "##NPROC", "2",
            "##DISK", "/dev/sda1 1000 250 750 25% /",
            "##UPTIME", "3600.50 100.00",
            "##OS", "Debian GNU/Linux 12 (bookworm)", "6.1.0-18-amd64", "x86_64", "fake-host",
            "##DOCKERV", "27.0.3" if self.docker else "",
            "##INSPECT", json.dumps(self._inspect()) if self.docker else "",
            "##STATS", stats if self.docker else "", "##END", ""])

    async def _handle(self, process):
        cmd = process.command or ""
        self.commands.append(cmd)
        code, out = 0, ""
        if "##CPU1" in cmd:
            await asyncio.sleep(0.05)
            out = self._collect()
        elif cmd.startswith("echo zent-ok"):
            out = "zent-ok\n" + ("27.0.3\n" if self.docker else "")
        elif m := re.fullmatch(r"docker (start|stop|restart|pause|unpause) ([a-f0-9]+) 2>&1", cmd):
            name = next((n for n, i in CID.items() if i == m.group(2)), None)
            if self.fail_docker or name is None:
                code, out = 1, "Error response from daemon: No such container (token=abc123secret)\n"
            else:
                self.states[name] = {"start": "running", "restart": "running", "stop": "exited",
                                     "pause": "paused", "unpause": "running"}[m.group(1)]
        elif m := re.fullmatch(r"docker inspect --format '\{\{\.State\.Status\}\}' ([a-f0-9]+) 2>/dev/null", cmd):
            name = next((n for n, i in CID.items() if i == m.group(1)), None)
            out = (self.states.get(name, "") + "\n") if name else ""
        elif m := re.fullmatch(r"docker rm (-f )?([a-f0-9]+) 2>&1", cmd):
            name = next((n for n, i in CID.items() if i == m.group(2)), None)
            if name and (m.group(1) or self.states[name] != "running"):
                del self.states[name]
            else:
                code, out = 1, "Error: cannot remove a running container\n"
        elif m := re.fullmatch(r"docker logs --tail (\d+) ([a-f0-9]+) 2>&1", cmd):
            out = "server started\nconnecting with password=hunter2 ok\n"
        else:
            code, out = 127, f"unexpected command: {cmd}\n"
        process.stdout.write(out)
        process.exit(code)


async def main(port: int = 2222):  # `python -m tests.fakessh` for manual / Postman runs
    s = FakeSsh()
    await s.start(port)
    print(f"fake ssh on 127.0.0.1:{s.port} user={s.user} password={s.password} fp={s.fingerprint}", flush=True)
    await asyncio.Event().wait()


if __name__ == "__main__":
    import sys
    asyncio.run(main(int(sys.argv[1]) if len(sys.argv) > 1 else 2222))
