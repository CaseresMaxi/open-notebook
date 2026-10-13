# Home server remote access: progress log

Operator record for the personal installation. Generic setup lives in
[home-server.md](../../5-CONFIGURATION/home-server.md) and
[running-nextnootbook.md](../../5-CONFIGURATION/running-nextnootbook.md).

## Done (2026-10-13)

- Server runs in `remote` mode (`./nextnootbook remote`): Firebase accounts, SurrealDB and files on this computer, UI published on the LAN at `http://192.168.2.7:8502` / `http://cachyos-x8664.local:8502`.
- Firebase Auth authorized domains include `192.168.2.7` and `cachyos-x8664.local`.
- Owner `maxycaseres5@gmail.com` is pinned to the original installation (`NEXTNOOTBOOK_OWNER_EMAIL`).
- Tailscale runs rootless as the `tailscale` Compose service (`docker-compose.tailscale.yml`, image `tailscale/tailscale:v1.102.4`, hostname `nextnootbook`, state in the `tailscale_state` Docker volume). `firebase/tailscale-serve.json` proxies HTTPS 443 inside the tailnet to `127.0.0.1:8502`. Installing natively was not possible without the operator's sudo password.
- The application already accepts HTTPS origins next to LAN HTTP and issues `Secure` cookies to HTTPS visitors.
- The UI is an installable web app; browsers offer installation over the Tailscale HTTPS address.

## Pending

1. **Sign the node in.** The container is in `NeedsLogin`. Get the current link with `./nextnootbook status` (links expire after a few minutes; restarting the container prints a new one) and approve it with the Tailscale account. Earlier links (`…/a/60c7401131d`, `…/a/100991900102d4`, `…/a/77cf15c019f4b`, `…/a/64b88d3012690`) expired unapproved.
2. **Enable HTTPS certificates** in the Tailscale admin console (DNS → MagicDNS and HTTPS Certificates) if `serve` reports they are disabled.
3. **Register the address.** `./nextnootbook status` prints `https://nextnootbook.<tailnet>.ts.net`. Add it to `NEXTNOOTBOOK_ALLOWED_ORIGINS` and `CORS_ORIGINS` in `.firebase/home-runtime.env`, add the hostname to Firebase authorized domains, then run `./nextnootbook remote`.
4. **Client devices:** install Tailscale on the phone/laptop with the same account, open the address and install the web app.

## Notes

- A bind-mounted `./tailscale_state` became root-owned and broke Docker builds; state now lives in a named volume.
- `docker compose down -v` would delete the Tailscale identity volume and require signing in again.
