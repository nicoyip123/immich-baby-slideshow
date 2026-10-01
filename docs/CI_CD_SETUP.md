# GitHub Actions deployment

`.github/workflows/deploy.yml` deploys on every push to `main` (or manually via
**Actions → Deploy → Run workflow**). It runs on a **self-hosted runner you
install on your own server**, since the server is only reachable over
Tailscale. The workflow checks out the repo, type-checks, runs unit tests,
builds, syncs the result into your Dockge stack directory, and runs
`docker compose up -d --build`.

## 1. Install the runner on your server

On the server (not this machine), follow GitHub's instructions under
**Settings → Actions → Runners → New self-hosted runner** for your repo. In
short:

```bash
mkdir -p ~/actions-runner && cd ~/actions-runner
# Download/extract the package GitHub's UI shows you, then:
./config.sh --url https://github.com/<you>/immich-baby-slideshow --token <token-from-github-ui>
sudo ./svc.sh install
sudo ./svc.sh start
```

Add the label `immich-baby-slideshow` when prompted (or add it afterwards in
**Settings → Actions → Runners**), since the workflow targets that label.

Make sure Docker and Node.js 22.13+ are available to whichever user the
runner service runs as.

## 2. Allow the runner to deploy without a password

The workflow's deploy steps use `sudo` for `rsync` into the stack directory
and for `docker compose`. Grant the runner's service user passwordless sudo
for exactly those commands, e.g. in `/etc/sudoers.d/github-runner-deploy`:

```
runner-user ALL=(root) NOPASSWD: /usr/bin/rsync, /usr/bin/docker
```

Replace `runner-user` with the actual account, and scope this file to just
the commands above — do not grant blanket `NOPASSWD: ALL`.

## 3. Set the stack directory (optional)

The workflow defaults to `/opt/stacks/immich-baby-slideshow`, matching
`scripts/deploy.sh`. If your Dockge stack lives elsewhere, set a repository
variable in **Settings → Secrets and variables → Actions → Variables**:

| Name | Value |
| --- | --- |
| `DEPLOY_STACK_DIR` | Absolute path to the stack directory on the server |

## 4. How this relates to `scripts/deploy.sh`

`scripts/deploy.sh` remains available for an ad hoc deploy from your own
machine over SSH. The GitHub Actions workflow does the same two-phase
sync-then-rebuild, but runs on the server itself after a push to `main`, so
no SSH credentials need to leave the server.

## Notes

- The workflow never touches `.env` or `music/` in the stack directory — both
  are excluded from the sync, matching the manual deploy script.
- Unit tests run in CI; browser tests (`npm run test:browser`) are not run
  here since they require installing Chromium. Run `npm run verify` locally
  before pushing if you want full coverage.
- Treat the runner machine as part of your deployment's trust boundary: it
  will execute code checked out from your `main` branch with `sudo` rights
  over the stack directory.
