# Privacy Policy — Review Notes

_Created 2026-06-10. Contains editorial decisions deferred from the live policy._

---

## Meta Pixel disclosure — two locations

The live policy (Variant A) ships with autoConfig **enabled** — the Pixel collects full interaction data. If autoConfig is later disabled (call below), both locations should be updated to Variant B.

### Location 1 — "What Data We Collect" analytics paragraph

**Variant A (live — autoConfig enabled):**
> The Meta Pixel collects page views and interaction data, including button clicks, form interactions, and page metadata.

**Variant B — if autoConfig disabled:**
> The Meta Pixel collects page views only.

### Location 2 — "Who We Share Data With" Meta list item

**Variant A (live — autoConfig enabled):**
> when you consent to tracking, page views and interaction data (button clicks, form interactions, page metadata) are sent to Meta via the Meta Pixel.

**Variant B — if autoConfig disabled:**
> when you consent to tracking, page views only are sent to Meta via the Meta Pixel.

### To disable autoConfig

Add the following call **before** `fbq('init', ...)` in `src/lib/consent.ts`:

```js
w.fbq('set', 'autoConfig', false, '3290406697805340');
```

Reference: [Meta Pixel autoConfig documentation](https://developers.facebook.com/docs/meta-pixel/advanced/advanced-matching)

---

## Reviewer notes removed from the live page

### [REVIEWER note 1] — Profile visibility

**Original annotation (removed from "What Data We Collect" → Profile information):**
> [REVIEWER: confirm intended public visibility of username and bio before launch]

**Context:** `username` and `bio` columns exist in the `profiles` table. `display_name` is publicly exposed via the `public_profiles` view and appears on comments. `username` and `bio` are stored but not rendered publicly anywhere in the codebase (verified by grep as of 2026-06-10). The live policy states they "are not currently displayed publicly on the Site." Confirm this remains accurate before launch, or update the sentence if public display is introduced.

---

### [REVIEWER note 2] — Meta Pixel variant selection (What Data We Collect)

**Original annotation (removed from variant block):**
> [REVIEWER: select one variant based on the autoConfig decision]

**Context:** See "Meta Pixel disclosure" section above. Variant A is live.

---

### [REVIEWER note 3] — Meta Pixel variant selection (Who We Share Data With)

**Original annotation (removed from variant block):**
> [REVIEWER: select one variant based on the autoConfig decision]

**Context:** See "Meta Pixel disclosure" section above. Variant A is live.

---

## Data Retention section — intentionally minimal

The live Data Retention section contains only the demographic data deletion sentence:

> Demographic data (date of birth, gender, location) is deleted immediately when you withdraw consent via the Edit Profile page.

No broader retention periods are defined or enforced in the current codebase. The placeholder `[REVIEWER: advise retention periods — no policy currently defined]` was removed from the live page to avoid surfacing an unresolved advisory to users. A legal adviser should define retention periods for: account data (email, name, profile photo), activity data (comments, ratings, saves), and bakery submissions before a formal privacy review.

### [REVIEWER question] — Submission IP address retention

The `submissions.ip_address` column records the submitter's IP for per-IP rate limiting (max 3 per hour). The rate-limit window only needs the IP for ~1 hour, but it is currently kept **indefinitely**. A reviewer should advise a retention period — e.g. purge IP addresses older than the rate-limit window, or set a defined maximum retention.
