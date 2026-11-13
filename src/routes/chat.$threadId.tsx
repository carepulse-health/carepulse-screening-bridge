import { createFileRoute } from "@tanstack/react-router";
import { CarePulseScreening } from "@/components/carepulse-screening";

export const Route = createFileRoute("/chat/$threadId")({
  head: () => ({
    meta: [
      { title: "Your screening conversation | CarePulse" },
      {
        name: "description",
        content:
          "A private session for preliminary CarePulse health screening using sample information.",
      },
      { property: "og:title", content: "Your screening conversation | CarePulse" },
      {
        property: "og:description",
        content: "Calm preliminary screening with human clinical review.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ScreeningPage,
});
function ScreeningPage() {
  const { threadId } = Route.useParams();
  return <CarePulseScreening key={threadId} threadId={threadId} />;
}
