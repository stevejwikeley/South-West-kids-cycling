# SEO & AI/LLM discoverability review

Goal: rank first for youth cycling/MTB/cyclocross searches in Devon, Exeter, Plymouth, Cornwall, and be the source AI assistants reach for when parents ask about kids' cycling events in the South West.

## Research findings

- **The site doesn't surface yet for its own core terms.** A plain web search for `southwestkidscycling.uk` returns nothing about the site at all — no snippet, no indexed pages, nothing. A search for `"kids cyclocross" OR "youth mountain biking" Devon Cornwall Exeter Plymouth events` returns British Cycling's club-profile page, the league's own site (`swcx.org`), individual club sites (Exeter Wheelers, North Devon Velo), and generic tourism content (Visit Devon, Visit Plymouth, a Komoot trail guide, a "Bike Club" blog post) — SWKC isn't in the results. This points to a **new-site/low-authority problem, not (only) a content problem**: the site may not be properly indexed yet, and likely has few or no backlinks pointing at it. On-page fixes below matter, but won't move the needle on their own until this is addressed — see priority 0.
- **The competitive gap is real and winnable.** None of the sites currently ranking for these terms is a comprehensive, youth-specific, multi-club aggregator — British Cycling's page is generic, the league site only covers its own series, individual club sites only cover their own events, and the tourism sites aren't event-specific at all. SWKC's actual content (a filterable calendar across every discipline and club in the region) is a better answer to "kids cycling events Devon" than anything currently ranking for it. The problem is authority/indexation, not differentiation.
- **Plymouth is already covered in the data but invisible in the copy.** The SWCX League already runs rounds at Newnham Top Field and Newnham Bottom, both in Plymouth — real, existing content — but the word "Plymouth" appears nowhere in any page's static copy (headings, intros, metadata), only inside individual event rows. Google and AI assistants weight title tags, headings, and body copy far more heavily than data buried in a list — a page that never says "Plymouth" is a weak answer to "kids cycling Plymouth" even when a Plymouth event is three scrolls down.

## Technical audit

**Fix now — cheap, high-impact:**

1. **`/clubs` and `/getting-started` have no page-specific metadata at all.** Neither file exports `metadata`, so both silently inherit the homepage's title and description from `app/layout.tsx`. That means three of the site's most important pages currently show Google the *identical* title tag ("South West Kids Cycling") and meta description — a textbook duplicate-content signal that actively suppresses ranking for any of them. This is the single highest-value fix here: give each page its own keyword-specific `metadata` export, e.g. `/clubs` → "Youth Cycling Clubs in Devon & Cornwall — Go-Ride, Junior Academies & Youth Sections", `/getting-started` → "New to Kids' Cycle Racing? A Parent's Guide — Devon & Cornwall".
2. **The sitemap is thin.** `app/sitemap.ts` lists only 3 URLs (`/`, `/clubs`, `/getting-started`) — missing `/subscribe`, `/about`, `/submit-event`, `/contact`. Add them (excluding intentionally non-indexed routes like `/admin`, `/organiser`, `/embed`, which `robots.ts` already disallows correctly).
3. **`/clubs`' `<h1>` is "Find a club." — brand voice, but zero keywords.** The intro paragraph below it is actually well-optimized ("road, cross country mountain biking, cyclocross and triathlon"), but the h1 itself carries the most SEO weight on the page and currently carries none of that. Something like "Youth cycling clubs in Devon & Cornwall." keeps the same tone while actually saying what the page is about.
4. **Mention Exeter and Plymouth by name in static copy**, not just as venue names inside dynamic event rows — a sentence on the homepage or `/clubs` intro along the lines of "covering clubs and events from Exeter and Plymouth to Truro and Falmouth" costs nothing and directly targets the exact city-level searches in the brief.

**Already strong — don't rebuild, just extend:**

5. **Schema.org `SportsEvent` JSON-LD is already implemented** (`lib/structured-data.ts`, wired into `app/page.tsx`) and covers name, date, status, sport, location, and booking offers for every event. This is genuinely ahead of every competitor found in research — none of the sites that outrank SWKC for these terms appear to use event structured data at this level. Two small gaps worth closing: the `PostalAddress` only sets `addressRegion`/`addressCountry` even though `address` and `postcode` are already on every event row and just not being passed through; and there's no `image` property, which Google's own Event rich-result docs list as recommended.
6. **`public/llms.txt` already exists and is well-written** — scope, page list, and explicit "check the live calendar, don't rely on prior knowledge" guidance for AI assistants. This is a genuinely rare thing to already have right. It's gone slightly stale though: it doesn't mention `/subscribe` or the new `/embed` widget. Worth a quick pass to keep it current whenever pages are added — the same "keep it updated" discipline this review is also asking for on the README.
7. **The Open Graph image is a real branded image** (`app/opengraph-image.tsx`, generated via `next/og`), not a placeholder — good for social/AI-preview quality. It's currently one static image reused for every page; page-specific OG images (e.g. `/clubs` gets a "clubs" variant) would be a nice-to-have, not urgent.

## Priority 0: fix indexation before anything else

Before any of the on-page work above will show measurable results, confirm the basics that a brand-new site commonly gets wrong:

- Submit the sitemap in Google Search Console (and Bing Webmaster Tools) if that hasn't already happened — this is usually the actual reason a real site returns zero results for its own domain name.
- Check Search Console's coverage report for crawl errors or a "not indexed" status on key pages.
- Get at least a handful of backlinks from the clubs and organisers already listed on the site — a link from Exeter Wheelers' or Mid Devon CC's own site back to their SWKC listing is exactly the kind of relevant, easy-to-get link that materially helps a new site's authority, and every club listed has an obvious reason to link back (it's free promotion for them too).

## Suggested order of work

1. Priority 0 (indexation/backlinks) — without this, nothing below moves rankings on its own.
2. Per-page `metadata` for `/clubs` and `/getting-started` (fix #1) — highest-leverage on-page change, ~30 minutes of work.
3. Sitemap completeness (#2) and the `/clubs` h1 (#3) — small, mechanical.
4. Exeter/Plymouth mentions in static copy (#4) and the `llms.txt` refresh (#6) — content pass, no code risk.
5. Structured-data address/image enrichment (#5) — small code change, extends something already working well.
