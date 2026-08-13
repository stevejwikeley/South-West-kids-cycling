import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://www.southwestkidscycling.uk";

  return [
    { url: base, changeFrequency: "daily", priority: 1 },
    { url: `${base}/clubs`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${base}/getting-started`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/subscribe`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/about`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/submit-event`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/contact`, changeFrequency: "yearly", priority: 0.3 },
  ];
}
