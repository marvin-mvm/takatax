<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

# Project rules (marvin-mvm)

These rules are the project owner's and take precedence over the Lovable block above
where they differ.

## Authorship
- Every commit is authored as `marvin-mvm <marvinmata19@gmail.com>`. Set
  `git config user.name "marvin-mvm"` and `git config user.email "marvinmata19@gmail.com"`
  in each checkout before committing.
- No AI attribution anywhere: no `Co-Authored-By` trailers, session links, "generated
  with" footers, or mentions of the AI assistant in commits, PR titles, PR descriptions,
  or comments. All credit goes to marvin-mvm.

## Workflow
1. All frontend and backend (Supabase) work happens on branch `v0.002`.
2. The AI developer opens the PR `v0.002` -> `main` with the title and description filled
   in; the owner reviews and merges it.
3. The owner deploys `main` to Netlify.
4. The owner back-fills Lovable with a PR `main` -> `v0.001`.
- Push to `v0.002` only when the owner asks for it. Never push to `main` or `v0.001`.
- Lovable is a backup editor and is used rarely; the owner will say when it was used.
- Every commit pushed to `v0.002` ends its message with `[skip netlify]` so Netlify does
  not build each push; only merges to `main` deploy. Do not use `[skip ci]`: it also skips
  the GitHub Actions checks.
- Merge PRs with "Create a merge commit" (not squash): a squash commit copies the
  `[skip netlify]` lines into `main` and the production deploy would be skipped.

## Supabase
- Project ref: `thiznrxojzrxkjwqhtjt`. The AI developer reads and edits the database
  (schema, migrations, data) directly; Lovable is not the source of truth for it.
- Never commit secret keys (service role key, access tokens). The anon/publishable key
  is public and may be committed.

## Pull requests
- Title: short and descriptive of the change.
- Description: a summary of changes as a list of items done.
- CI (`.github/workflows/ci.yml`) runs lint, type-check, test, and build on every PR;
  keep it green.

## Reference
- `marvin-mvm/Takatax2` is the reference project (specs in its `docs/`); port its
  features into this TanStack Start app.
