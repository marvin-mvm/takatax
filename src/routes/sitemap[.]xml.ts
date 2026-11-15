/**
 * /sitemap.xml for search engines: the public pages, every public community question and every
 * verified professional's profile. Members-only questions are never listed (they are also
 * `noindex` on their own page). Sample data is left out, so the sitemap stays empty of
 * questions until the community tables exist (see docs/MISSING_PIECES.md).
 */

import { createFileRoute } from "@tanstack/react-router";

import { listPartners, listPosts } from "@/lib/data/repository";

const STATIC_PATHS = ["/", "/pricing", "/community", "/bookkeepers", "/deck"];

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function livePaths(): Promise<{ path: string; lastModified?: string }[]> {
  const paths: { path: string; lastModified?: string }[] = [];
  try {
    const posts = await listPosts(false);
    if (posts.source === "live") {
      for (const post of posts.data) {
        if (post.visibility !== "public") continue;
        paths.push({ path: `/community/${post.id}`, lastModified: post.createdAt.slice(0, 10) });
      }
    }
  } catch {
    // The database is unreachable: list the static pages only.
  }
  try {
    const partners = await listPartners();
    if (partners.source === "live") {
      for (const partner of partners.data) paths.push({ path: `/bookkeepers/${partner.id}` });
    }
  } catch {
    // Same as above.
  }
  return paths;
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const origin = new URL(request.url).origin;
        const entries = [...STATIC_PATHS.map((path) => ({ path })), ...(await livePaths())];
        const urls = entries
          .map(({ path, lastModified }: { path: string; lastModified?: string }) => {
            const lastmod = lastModified ? `<lastmod>${escapeXml(lastModified)}</lastmod>` : "";
            return `  <url><loc>${escapeXml(origin + path)}</loc>${lastmod}</url>`;
          })
          .join("\n");
        const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
        return new Response(xml, {
          headers: {
            "content-type": "application/xml; charset=utf-8",
            "cache-control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
