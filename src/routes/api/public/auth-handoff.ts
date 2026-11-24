import { createFileRoute } from "@tanstack/react-router";

async function handle(request: Request) {
  const { issueHandoff } = await import("@/lib/carepulse-handoff.server");
  return issueHandoff(request, {
    origins: process.env["CAREPULSE_PARENT_ORIGINS"] ?? "",
    secret: process.env["CAREPULSE_HANDOFF_SECRET"] ?? "",
    url: process.env["SUPABASE_URL"] ?? "",
    publicKey: process.env["SUPABASE_PUBLISHABLE_KEY"] ?? "",
  });
}
export const Route = createFileRoute("/api/public/auth-handoff")({
  server: { handlers: { OPTIONS: ({ request }) => handle(request), POST: ({ request }) => handle(request) } },
});