# Shared code

Plain TypeScript used by both the web app (imported as `@shared/...`) and the Supabase Edge
Functions (imported with relative paths). Rules for files in this folder:

- No Node, Deno or browser APIs, and no package imports. Pure functions and types only.
- Import siblings with the `.ts` extension (`./dates.ts`), which both Vite and Deno accept.
- Unit tests sit next to the code (`*.test.ts`) and run with Vitest.
