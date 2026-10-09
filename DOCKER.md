# Building the production images

Run these commands from the repository root with Docker Desktop using Linux containers:

```powershell
docker build --platform linux/amd64 -f Dockerfile.web -t resume-optimizer-web:local .
docker build --platform linux/amd64 -f Dockerfile.api -t resume-optimizer-api:local .
docker build --platform linux/amd64 -f Dockerfile.api --target migrate -t resume-optimizer-migrate:local .
```

These commands build images only; they do not deploy to AWS or start containers.
The migration target retains the Prisma CLI for a separate migration job. The API
runtime image installs production backend dependencies only.

The frontend build sets `API_BASE_URL=http://api:3001`. The future Compose backend
service must be named `api`, or rebuild with `--build-arg API_BASE_URL=http://YOUR_HOST:3001`.
Changing this variable only at runtime does not change the built Next.js rewrite.

Supply `DATABASE_URL` when running the API or migration image. Never pass database
credentials as build arguments. The API image listens on `0.0.0.0:3001` inside its
container; local development still defaults to loopback. Publish only the web entry
point when deployment networking is configured.

## Test the built images locally

Stop any existing web server using port 3000, then run:

```powershell
docker compose -f compose.images.yaml config --quiet
docker compose -f compose.images.yaml up -d
docker compose -f compose.images.yaml ps -a
```

This uses the three local images, a separate Compose project and database volume,
and database port `127.0.0.1:5433` for local database viewers. PostgreSQL becomes healthy first, then migrations must
exit successfully before the API starts. The web starts after the API is healthy.
The migration container showing `Exited (0)` is expected.

Open http://localhost:3000. History starts empty because production mode disables
demo seeding and error simulations. Submit a fictional PDF/DOCX filename with a job
description such as `Company: Example Company` and `Role: Developer` on separate
lines. Confirm the mock record appears in History (no actual document parsing or AI).

Check persistence by running `docker compose -f compose.images.yaml down`, then
`docker compose -f compose.images.yaml up -d` and checking History again. Do not add
`-v` to `down` unless you intend to delete the test database volume.

If startup fails, inspect `docker compose -f compose.images.yaml logs --tail=80`.
This file uses local-only demo credentials and is not the AWS deployment configuration.

## GitHub Actions publishing

The CI workflow runs lint, type checks, database integration tests, and the production
build, then builds all three Linux amd64 images. Pull requests and branch pushes
validate the images without publishing. Only successful pushes to `main` publish
to GHCR using the automatically provided `GITHUB_TOKEN`; no personal token is needed
in repository secrets. The images job requests `packages: write` permission.

Published image names use the lowercase GitHub repository name:

```text
ghcr.io/jj-devl/ai-resume-optimizer-web:sha-FULL_COMMIT_SHA
ghcr.io/jj-devl/ai-resume-optimizer-api:sha-FULL_COMMIT_SHA
ghcr.io/jj-devl/ai-resume-optimizer-migrate:sha-FULL_COMMIT_SHA
```

Use the same commit tag for all three images. There is no mutable `latest` tag.
All builds must pass before uploads start, but registry uploads are not atomic:
verify the whole workflow succeeded before deploying the set.

Find runs under the repository's Actions tab and published images under Packages.
New packages may be private even for a public repository. EC2 will need registry
authentication unless you explicitly make the packages public. To block broken PRs,
configure branch rules requiring `check` and `Build Docker images` to pass.

Production Compose and AWS deployment are subsequent steps. CI does not run
production migrations or connect to EC2; its tests use a disposable PostgreSQL service.
The existing `compose.yaml` remains the local development database setup.
