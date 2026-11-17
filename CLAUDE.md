# JT-Code frontend: rules for agents

The plan and the guardrails live in the backend repository:

* plan: `../jt-code-backend/docs/EXECUTION_BACKLOG.md`;
* guardrails G1–G12: `../jt-code-backend/CLAUDE.md`;
* audit: `../jt-code-backend/docs/SYSTEM_AUDIT_2026-11.md`.

Follow them here too. The parts that matter most in this repository:

* Commit to the local branch `Working_256` per backlog phase, and never push.
* Keep both data modes working (`VITE_DATA_MODE=api|mock`). API calls go through
  `src/lib/data/api/repositories.ts`, and every API repository has a mock counterpart.
* After changing an API call, regenerate the backend's contract snapshot
  (`python scripts/contracts/extract_frontend_contract.py ../jt-code-frontend`, run in the backend repo).
* Never edit `.env.local`; tell the user which keys to set.
* The gate is `npm run typecheck && npm run lint && npm run test`, plus `npm run build` when config or
  bundling changed.
