<!-- One PR = one subject. Conventional Commits title. -->

## What and why

<!-- What changes, and the problem it solves. Link the issue. -->

Closes #

## Work package

<!-- L0…L9, and the contracts this touches (A schema, B blocks, C tools, D theme). -->

- Lot:
- Contracts touched: none

## Definition of done (AGENTS.md)

- [ ] Types compile in strict mode, no `any`, no `@ts-ignore`
- [ ] Unit tests on the business logic
- [ ] Integration tests on all three databases (if the code touches data)
- [ ] e2e test (if the code touches a user journey)
- [ ] The **degraded** driver is tested, not just the optimal one
- [ ] Permissions tested per role (if the code exposes a route or a tool)
- [ ] Docs updated — a contract change means the contract doc changes
- [ ] Changeset written (if a published package is touched)
- [ ] No Lighthouse regression (if the code touches rendering)

## New direct dependencies (rule R9)

<!-- One line each: name, why, unpacked size, last publish, licence.
     Write "none" if there are none — do not delete the section. -->

none

## Reviewer notes

<!-- What deserves a second pair of eyes. Trade-offs you made. What you are unsure about. -->
