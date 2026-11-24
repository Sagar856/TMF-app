# Repository instructions

MINARTH is a React/TypeScript personal-finance app built with Vite and wrapped
for Android with Capacitor. Read the relevant sections of `README.md` and
`.github/skills/minarth-app/SKILL.md` before changing app behavior.

## Change workflow

- Inspect the current implementation, related tests and existing worktree
  changes before editing. Preserve unrelated user changes.
- Keep changes surgical and follow the existing component, service, type,
  storage and error-handling patterns. Avoid introducing dependencies unless
  the request requires them.
- Treat user financial data, authentication and transaction/account balance
  updates as sensitive. Never expose or commit credentials, tokens, private
  keys or local environment files. Preserve Supabase Row Level Security and
  owner checks.
- SQL files are deployment migrations, not automatically applied by builds.
  Update the relevant SQL and deployment instructions when a database contract
  changes; state clearly when a migration must be applied.
- Native Android sources of truth are under `native/`. `android/` is generated
  and ignored; change the native source and, when needed, its copy/patch script,
  not a generated build output.
- Run the smallest relevant tests, then `npm run lint` and `npm run build` when
  TypeScript/build behavior is affected. `npm test` runs the full Node test
  suite. Native changes should also run their focused Android patch/regression
  tests; distinguish those from a real Gradle or device build.
- Update user-facing documentation when a behavior, setup step, permission,
  migration or release process changes.

## Keep agent guidance current

For every feature or bug-fix code change, review and update
`.github/skills/minarth-app/SKILL.md` in the same change to reflect the current
behavior, source-of-truth files and validation path. Keep it as a concise
current guide, not a chronological changelog. Update this file and
`.github/copilot-instructions.md` when repository-wide rules or agent discovery
change.
