# Local S3 storage with Garage

Garage runs separately from NestJS. The backend has the AWS S3 client and URL
presigner installed. This step supplies storage infrastructure and smoke checks;
resume export/download endpoints now use this storage, while real AI history
is saved separately in PostgreSQL. No AWS or Garage
registration is required. These checks make no OpenAI calls.

## Start and test (repository root)

Start Docker Desktop with its Linux engine, then:

~~~powershell
npm run storage:up
npm run storage:test
~~~

storage:up creates .env.storage with random local credentials, then starts only
Garage using the storage Compose profile. Existing credentials are validated and
preserved. PostgreSQL-only npm run db:up does not start Garage. The S3 endpoint
is http://127.0.0.1:3900 and the region is garage. The private resume-documents
bucket and its access key are created on first start by Garage's --single-node
--default-bucket flags. The Garage image is pinned to v2.5.0.

The smoke check uploads fictional text, reads it through the SDK and a temporary
signed URL, checks download headers, rejects anonymous/tampered/expired requests,
and deletes its test object. It prints neither secrets nor signed URLs.
It needs neither PostgreSQL nor a running NestJS API.

## Persistence across container replacement

~~~powershell
npm run storage:test -- --write-persistence
docker compose --profile storage up -d --wait --force-recreate garage
npm run storage:test -- --read-persistence
~~~

The final command checks the saved fixture and deletes it. Both Garage data and
metadata directories have named Docker volumes; keep both. docker compose down
preserves volumes; docker compose down -v deletes them and stored documents.
Stop only Garage with npm run storage:stop. Keep .env.storage between restarts;
changing credentials does not automatically revoke old keys already in Garage.
Back up credentials and both volumes if the files matter. One node provides no
replication and is intended for local development.

## Image Compose

The optional Garage service in compose.images.yaml has separate project-scoped
volumes and host port 3904 so it can coexist with development storage:

~~~powershell
npm run storage:setup
docker compose -f compose.images.yaml --profile storage up -d --wait garage
npm run storage:test -- --images
~~~

For persistence checks here, add --images to each storage:test invocation and use
-f compose.images.yaml in the recreate command. The API image includes the SDK
through its existing npm ci step. No Dockerfile changes are needed. The image API reads .env.storage-client from storage:setup and connects over the
Compose network. Start image Compose with --profile storage to generate files.

## Files and credentials

- compose.yaml / compose.images.yaml: image, optional profile, ports, read-only
  configuration mount, persistent volumes and health check.
- garage.toml: data paths, single-node layout, SQLite metadata and S3 listener.
- .env.example (this directory): reference names without credentials.
- ../../.env.storage: generated secrets, ignored by Git and excluded from images.
- ../../backend/scripts/storage-setup.cjs: generates credentials without overwrites.
- ../../backend/scripts/storage-smoke.cjs: real SDK and signed-link checks.

GARAGE_RPC_SECRET authenticates Garage's internal node communication.
GARAGE_DEFAULT_ACCESS_KEY and GARAGE_DEFAULT_SECRET_KEY authenticate S3 requests;
NestJS will use them when its storage service is connected. Do not send them to
the frontend. GARAGE_DEFAULT_BUCKET names the initial bucket. No public website
endpoint is configured. Only the S3 port is published, bound to loopback; RPC is
not published and no administrative HTTP listener is enabled.

For a host-run backend the endpoint is http://127.0.0.1:3900. For a backend in the
same Compose network it is http://garage:3900. Browser download signatures must
use a browser-reachable endpoint (3900 locally, 3904 for image Compose), not the
internal garage hostname. Do not rewrite URL hosts after signing: the host is part
of the signature. Use path-style S3 requests.

Temporary signed links grant access to anyone holding the link until expiration.
Before public multi-user deployment, application download routes must authorize
users before issuing links. The current app has no authentication and is intended
for a shared personal installation.

## Reading order

1. compose.yaml, garage service and volumes: how Docker runs storage.
2. garage.toml: how the storage server uses those directories.
3. backend/package.json and root package-lock.json: SDK packages and exact versions.
4. backend/scripts/storage-setup.cjs: generated local credentials.
5. backend/scripts/storage-smoke.cjs: S3Client, upload/download and getSignedUrl.

Official references:
- https://garagehq.deuxfleurs.fr/documentation/quick-start/
- https://garagehq.deuxfleurs.fr/documentation/reference-manual/configuration/
- https://garagehq.deuxfleurs.fr/documentation/reference-manual/s3-compatibility/
- https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-s3-request-presigner/

## Files changed in this storage step

- compose.yaml
- compose.images.yaml
- backend/package.json
- package-lock.json
- package.json
- backend/scripts/storage-setup.cjs (new)
- backend/scripts/storage-smoke.cjs (new)
- infra/garage/garage.toml (new)
- infra/garage/.env.example (new)
- infra/garage/README.md (new)
- README.md

.env.storage was generated locally and is ignored; existing backend/.env was not changed.

## Verification

Both Compose files validate, including optional profiles, private credentials,
loopback port bindings and persistent mounts. Backend build and script lint pass.
All 35 existing AI/extraction checks pass when run sequentially (no paid AI calls).
The real Garage smoke check passes upload/download, signed attachment links,
rejection of unsigned/tampered/expired links, and test-object deletion.
Garage reports expired links as HTTP 400 InvalidRequest with Date is too old;
the check signs an already-expired URL to avoid a wall-clock timing race.
Container replacement persistence verification passed: the fixture survived
Garage container recreation and was then deleted.

## Application exports

The [export module](../../backend/src/exports/README.md) connects saved History
records to Word/PDF generation, signed downloads and coordinated deletion.
storage:setup now also creates ignored .env.storage-client with client credentials
only, for the API container. The original .env.storage still configures Garage.
