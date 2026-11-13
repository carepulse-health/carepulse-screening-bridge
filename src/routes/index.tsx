import { createFileRoute } from "@tanstack/react-router";
import { CarePulseScreening } from "@/components/carepulse-screening";

// The home route ships no og:image, so serve-time hosting can inject the
// project's social preview (explicit og:image or latest screenshot).
export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CarePulse | Your health assistant" },
      {
        name: "description",
        content:
          "CarePulse preliminary health screening: share your concerns and find your next step with human clinical oversight.",
      },
      { property: "og:title", content: "CarePulse | Your health assistant" },
      {
        property: "og:description",
        content: "A calm conversation and a clearer next step for your health.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CarePulseScreening,
});
