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

## CarePulse architecture

- Keep unsaved conversation data in the root session provider and conversation IDs in TanStack page URLs; no browser storage is used because chats must not persist.
- Define session context and its consumer hook in a non-component module, separate from the refreshable provider, so hot updates cannot split provider and consumer context identities.
- Use AI Elements for transcript, markdown messages, and the composer so the future streaming integration can share the same UI.
- Until an existing data connection and clinician-approved protocol are verified, use a deterministic sample screening sequence, explicit emergency guidance, and human-review outcomes; do not infer medical priorities or send real notifications.
- Reuse the connected project's generated data clients and existing schema when available; never provision a replacement project for the existing CarePulse data.
- Never write unvalidated screening completions using legacy clinical priority values; if the database cannot accept an unclassified result, show a failed-submission state and keep local samples distinct from received clinic records.
