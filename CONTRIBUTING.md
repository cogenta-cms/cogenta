# Contributing to Cogenta

Thanks for looking. A few things to know before you spend your time.

## Status

Cogenta is **pre-alpha**. The design is complete and public; the contracts are still
being implemented. Feature contributions are premature right now — a PR against an
interface that moves next week helps nobody.

What is genuinely useful today:

- **Critiques of the design.** Read `docs/`, tell us where it breaks. This is the most
  valuable contribution the project can receive at this stage.
- **Security reports.** See [SECURITY.md](SECURITY.md). Never a public issue.
- **Bug reports** on what already exists.
- **RFCs** for the contracts, following `docs/rfc/README.md`.

## Read this first

The design lives in [`docs/`](docs/) and is written in French. Code, comments, commit
messages and issues are in **English**.

| Before you touch | Read |
|---|---|
| anything | [`AGENTS.md`](AGENTS.md) — the development rules, they override habits |
| architecture | [`docs/02-architecture.md`](docs/02-architecture.md) |
| a settled choice | [`docs/03-decisions.md`](docs/03-decisions.md) — decisions are not relitigated |
| content, themes, agents | [`docs/04-contrats.md`](docs/04-contrats.md) |
| auth, plugins, agents | [`docs/05-securite.md`](docs/05-securite.md) |

## Setup

```bash
git clone https://github.com/cogenta-cms/cogenta.git
cd cogenta
pnpm install          # installs git hooks too

pnpm lint             # Biome — lint and format
pnpm typecheck
pnpm test             # unit tests, no services needed

pnpm services:up      # ephemeral Postgres, MySQL, MariaDB, Redis, MinIO
pnpm test:integration
pnpm services:down
```

Node 22.11+ and pnpm 10+. Docker is needed for integration tests **only** — never to
run Cogenta itself. That is rule R1, and it is load-bearing.

## The ten rules

They are in [`AGENTS.md`](AGENTS.md) and they are not stylistic preferences. The four
that most often surprise newcomers:

- **R1** — no hard dependency on infrastructure. Every infrastructure need exposes an
  interface with at least two implementations, one of which needs no external service.
- **R2** — the CMS works without AI. No content, admin or rendering feature may depend
  on an API key.
- **R3** — a block never stores HTML or CSS. Semantic data only.
- **R9** — no new dependency without justification. Prefer zero dependencies to a small
  one. Declare every new direct dependency in the PR with its size, licence and
  maintenance status.

## Definition of done

A PR is not finished until every box in the pull request template is ticked or
explicitly marked N/A with a reason. In particular: **the degraded driver is tested,
not just the optimal one**, and integration tests run against all three databases.

## Commits

[Conventional Commits](https://www.conventionalcommits.org/), one subject per PR, and a
`Signed-off-by` trailer:

```bash
git commit -s -m "feat(cache): add tag-based invalidation to the file driver"
git config format.signOff true   # sign every commit in this repo from now on
```

Scopes are enforced by commitlint — see `commitlint.config.js`.

A changeset is required whenever a published package changes:

```bash
pnpm changeset
```

See [`docs/versionnement.md`](docs/versionnement.md) for how a change maps to
patch/minor/major, and how that differs from a contract's own version (A/B/C/D,
`docs/04-contrats.md`) when your change touches one of the four frozen contracts.

## Contributor Licence Agreement

Contributions are accepted under a lightweight CLA (ADR-0012). It preserves the
project's ability to relicense later, which a DCO would close permanently. The bot will
ask you to sign on your first PR.

> The CLA text and the signing flow are not live yet. Until they are, contributions are
> limited to issues, discussions and security reports.

## Code of conduct

By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).
