/**
 * /robots.txt: search engines may index the public site and public community questions, but not
 * the signed-in app or the auth pages. Served from a route (not public/robots.txt) so the
 * sitemap line carries this deployment's own address.
 */

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/robots.txt")({
  server: {
    handlers: {
      GET: ({ request }) => {
        const origin = new URL(request.url).origin;
        const body = [
          "User-agent: *",
          "Allow: /",
          "Disallow: /app",
          "Disallow: /login",
          "Disallow: /signup",
          "Disallow: /community/new",
          "",
          `Sitemap: ${origin}/sitemap.xml`,
          "",
        ].join("\n");
        return new Response(body, {
          headers: {
            "content-type": "text/plain; charset=utf-8",
            "cache-control": "public, max-age=86400",
          },
        });
      },
    },
  },
});
