# Template project for bun-based React web application

To create a new project based on this one:
```shell
cd <your project folder, e.g. ~/dev/my-new-project>
git init
git remote add upstream https://github.com/bjoernwuest/bun-starter.git
git fetch upstream
git merge upstream/master --allow-unrelated-histories -m "Initialize project from bun-starter template"
git remote add origin https://github.com/<your github login name>/<your repo name>.git
git push -u origin master
```

## Updating from template

```shell
cd <your project folder, e.g. ~/dev/my-new-project>
git checkout master
git fetch upstream
git merge upstream/master -m "Update from bun-starter template"
git push origin master
```

# Needed configuration
Create a PostgresSQL database with user and password. Enter this information in a file `.env` in your project root:
DATABASE_URL=postgresql://<username>:<password>@<postgresql-host>:<postgresql-port, usually 5432>/<name of database>
ADVISORY_LOCK=<optional: a 64bit integer number (positive or negative); when unset, the application default -7482650123549836421 is used>

# Trusted proxy configuration
The application honors `X-Forwarded-Proto`/`X-Forwarded-Host` request headers **only** when the environment variable `TRUST_PROXY=1` is set. By default (unset), forwarded headers are ignored entirely and the public URL is derived from the incoming request itself.

- Enable `TRUST_PROXY=1` **only** when the application runs behind a reverse proxy that terminates TLS and *sets/overwrites* `X-Forwarded-Proto` and `X-Forwarded-Host` on every request.
- The proxy **must strip** any client-supplied `X-Forwarded-Proto`/`X-Forwarded-Host` headers before setting its own.
- Enabling `TRUST_PROXY` without such a proxy exposes the deployment to host-header spoofing (OIDC `redirect_uri` would be built from attacker-controlled headers).

Example nginx configuration:
```nginx
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header X-Forwarded-Host $host;
```

# First start
1. run `bun run drizzle` to generate the database schema and migration.
2. run `DEV_MODE=1 bun run dev` to start the application in development mode. Somewhere along the way the setup key is output which you need to configure the application.

# IDE configuration
Drizzle-ORM schema files in `/src/schema/` are automatically translated into TypeScript types and Typebox schemas. This is done by `/scripts/generate_types.ts`. Run this script everytime you modify a file in `/src/schema/`.

## Auto-Generation in IntelliJ IDEA
1. Open the project in IntelliJ IDEA.
2. Go to `File` > `Settings` > `Tools` > `Startup Tasks`.
3. Click `+` and select `Add new configuration`.
4. Select `Bun` from the list.
5. In the dialog popping up enter `/scripts/generate_types.ts` for File and set `--watch` for Bun Parameters. Click `OK`.
