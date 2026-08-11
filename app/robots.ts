import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/organiser", "/login", "/auth"],
    },
    sitemap: "https://www.southwestkidscycling.uk/sitemap.xml",
  };
}
