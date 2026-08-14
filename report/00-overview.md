# 00 — Overview

## Codebase Description

This repository is a Bun/Elysia/React/PostgreSQL/Drizzle template application ("bun-starter"). The frontend is 100% client-side rendered React 19 with PrimeReact, served with per-app client bundles (ui, login, setup) and long-lived caching. Elysia sub-applications in `src/apps/` compose the server; layers follow `ui → api → services → repo → schema`. Authentication is OIDC via EntraID with an additional API-key mechanism; authorization uses functional permissions with a config-defined root user group as the only bypass. Server-sent events and a tag-based PubSub provide live UI updates. Configuration is partially DB-backed with a setup wizard for mandatory values and an admin UI for runtime edits. Mutations from the UI are normally routed through a request-bundling endpoint. Persistence uses Drizzle ORM with Umzug-managed migrations, and optimistic locking is based on `updatedAt`. Tests are `bun test`-based API tests plus Playwright-driven page tests and workflow tests with page objects.

## Methodology

Static, read-only review of all application code under `src/`, all tests under `tests/`, `design/` documentation, `scripts/`, `static/` READMEs, root configuration (`package.json`, `tsconfig.json`), `.env`, `.gitignore`, and every `AGENTS.md`. The application was not executed and no tests were run; no coverage or performance measurements were taken. `node_modules/`, `.kilo/`, `.git/`, and `.idea/` were excluded. Every finding cites file paths and line ranges from the current working tree.

## Findings per Domain

| Domain | File | Findings |
|---|---|---|
| Architecture & Directory Structure | `01-architecture-structure.md` | 11 |
| Naming & Terminology Consistency | `02-naming-consistency.md` | 13 |
| Design Patterns & Cross-Cutting Concepts | `03-patterns-concepts.md` | 12 |
| Complexity & Maintainability Drivers | `04-complexity-maintainability.md` | 10 |
| TypeScript & Bun Practices | `05-typescript-bun.md` | 7 |
| React & Frontend Practices | `06-react-frontend.md` | 6 |
| Drizzle ORM & Data Layer | `07-data-drizzle.md` | 6 |
| Security | `08-security.md` | 10 |
| API & Interface Contracts | `09-api-interfaces.md` | 6 |
| Testing & Coverage Gaps | `10-testing.md` | 10 |
| Configuration, Environment, Secrets & Dependencies | `11-config-deps.md` | 5 |
| Documentation & Coding Style | `12-docs-style.md` | 7 |
| Incomplete/Inconsistent Specs & Edge Cases | `13-incomplete-specs-edge-cases.md` | 7 |
| AI-Guidance Instructions | `14-vibe-coding-guidance.md` | 4 |
| **Total** | | **114** |
