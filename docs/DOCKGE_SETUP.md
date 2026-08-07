# Dockge setup

## 1. Prepare Immich

In Immich user settings, create the API key under a user who is a member of the shared album. Grant only `asset.read`, `asset.view`, and `asset.download`. Open the shared album in Immich and copy its UUID from the browser URL into `IMMICH_ALBUM_ID`. The slideshow selects only images and videos that are both favourites and members of that album.

Find the Docker network used by the Immich server in its Dockge stack; the usual name resembles `immich_default`.

## 2. Configure the stack

Copy `.env.example` to `.env`. Generate the two passwords interactively so plaintext does not enter shell history:

```bash
npm run hash-password
```

Run it once for the family password and once for the separate admin password. Keep each generated hash inside single quotes in `.env` so Docker Compose treats its `$` characters literally. Generate `SESSION_SECRET` with at least 32 random characters. Set the shared album UUID, baby birth date, public HTTPS origin, Immich network, and internal Immich service URL. Never commit `.env`.

Put a user-owned or properly licensed MP3 at `music/soundtrack.mp3`. When no GA4 ID is supplied, Google Analytics and its consent prompt remain disabled.

If cloudflared runs on the Docker host, route the hostname to `http://127.0.0.1:3080`. If cloudflared is a container, attach it to this stack's generated `slideshow_edge` network and route to `http://baby-slideshow:3000`. Set `TRUSTED_PROXY_CIDRS` only to the immediate cloudflared container IP/CIDR; never use `0.0.0.0/0` or `::/0`.

## 3. Deploy in Dockge

Create/import this directory as a stack, inspect `compose.yaml`, and deploy. The slideshow joins the existing Immich network but does not own or restart Immich. Confirm the container becomes healthy, then verify:

- the public hostname shows the family password page;
- the public hostname cannot route to Immich;
- a newly favourited image/video from the configured shared album appears after pressing Begin again;
- `/admin` accepts only the separate admin password;
- declining analytics creates no Google network requests.

## 4. Operate and back up

Rebuild/redeploy from Dockge for updates. Back up the `slideshow_data` volume (anonymous display counts) and the local `music/` folder. Immich remains the source of truth for media. Logs rotate at three 10 MB files and must never contain passwords, API keys, filenames, or private media URLs.
