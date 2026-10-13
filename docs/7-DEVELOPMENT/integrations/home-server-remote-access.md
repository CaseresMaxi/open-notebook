# Home server remote access: progress log

Operator record for the personal installation. Generic setup lives in
[home-server.md](../../5-CONFIGURATION/home-server.md) and
[running-nextnootbook.md](../../5-CONFIGURATION/running-nextnootbook.md).

## Done (2026-10-13)

- Server runs in `remote` mode (`./nextnootbook remote`): Firebase accounts, SurrealDB and files on this computer, UI published on the LAN at `http://192.168.2.7:8502` / `http://cachyos-x8664.local:8502`.
- Firebase Auth authorized domains include `192.168.2.7` and `cachyos-x8664.local`.
- Owner `maxycaseres5@gmail.com` is pinned to the original installation (`NEXTNOOTBOOK_OWNER_EMAIL`).
- Tailscale runs rootless as the `tailscale` Compose service (`docker-compose.tailscale.yml`, image `tailscale/tailscale:v1.102.4`, hostname `nextnootbook`, state in the `tailscale_state` Docker volume). After sign-in the service runs `tailscale serve --https=443 http://127.0.0.1:8502` inside the tailnet. Installing natively was not possible without the operator's sudo password.
- The application already accepts HTTPS origins next to LAN HTTP and issues `Secure` cookies to HTTPS visitors.
- The UI is an installable web app; browsers offer installation over the Tailscale HTTPS address.

## Pending

1. **Sign the node in.** The container is in `NeedsLogin`. Get the link with `./nextnootbook status` and approve it with the Tailscale account; it stays valid while the container runs.
2. **Enable HTTPS certificates** in the Tailscale admin console (DNS → MagicDNS and HTTPS Certificates) if `serve` reports they are disabled.
3. **Register the address.** `./nextnootbook status` prints `https://nextnootbook.<tailnet>.ts.net`. Add it to `NEXTNOOTBOOK_ALLOWED_ORIGINS` and `CORS_ORIGINS` in `.firebase/home-runtime.env`, add the hostname to Firebase authorized domains, then run `./nextnootbook remote`.
4. **Client devices:** install Tailscale on the phone/laptop with the same account, open the address and install the web app.

## Notes

- Root cause of the expired links (fixed 2026-10-13): the image's default `containerboot` gives `tailscale up` 60 seconds, exits and restarts (106 restarts observed), generating a new sign-in link every minute. The service now runs `tailscaled` and an unbounded `tailscale up` itself.
- Phone access failure (fixed 2026-10-13): the app container had been recreated by a plain `docker compose up`, which loads only `docker-compose.yml` + override (local mode, loopback only). The launcher now writes `COMPOSE_FILE` to `.env`, so plain Compose commands keep the last mode.

- A bind-mounted `./tailscale_state` became root-owned and broke Docker builds; state now lives in a named volume.
- `docker compose down -v` would delete the Tailscale identity volume and require signing in again.
