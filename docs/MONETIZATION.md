# Grid Rivals — Monetisation Plan

**Status:** Proposal; no monetisation provider or payment flow is enabled  
**Guiding principle:** Monetise optional value, never competitive advantage.

## 1. Objectives

- Keep the core game playable without payment.
- Protect fair competition and leaderboard credibility.
- Validate repeat engagement before adding revenue features.
- Start with low fixed costs and avoid provider commitments until needed.
- Keep purchase and entitlement decisions server-authoritative.

## 2. Recommended order

| Stage | Revenue stream | When to introduce |
|---|---|---|
| 0 | No monetisation; measure engagement | Now |
| 1 | Optional rewarded ads | After stable retention and enough traffic |
| 2 | Cosmetic purchases | Once players show interest in personalisation |
| 3 | One-time ad-free upgrade | Alongside a tested ad experience |
| 4 | Premium membership | Only when recurring benefits are compelling |
| 5 | Sponsored challenges | Once audience size and brand safety justify it |

Do not launch every revenue stream at once. Test one change at a time and compare retention, complaints and revenue.

## 3. Ads

### Rewarded ads — preferred first format

Offer an ad only after the player chooses to watch it. Appropriate rewards include:
- a hint in a non-ranked practice mode;
- a cosmetic token or temporary visual reward;
- access to an additional practice activity.

Do not grant extra moves, score multipliers or competitive advantages in ranked/verified games.

### Interstitial ads

If introduced, show only between completed games or when navigating between major screens. Apply conservative frequency caps and never interrupt an active game, a result animation or a score submission.

### Avoid

- Banner ads over or beside the game board on small screens.
- Forced ads before a player can start.
- Ads that imitate game controls.
- Rewarded ads that affect verified scores or leaderboard rank.

Select an ad provider only after reviewing geography coverage, minimum traffic/payment thresholds, consent tooling, policy requirements and actual expected revenue. Do not assume ad revenue will be meaningful at low traffic.

## 4. Direct purchases

### Cosmetics

Potential items:
- tile and board themes;
- backgrounds;
- profile frames and avatar treatments;
- celebration effects;
- sound packs.

Cosmetics must remain visual/audio-only and must not change game rules, tile values, move limits or score calculation.

### Ad-free upgrade

A one-time purchase may remove eligible ads while leaving the core game free. Clearly state what is included and whether the purchase applies across devices after account linking.

### Premium membership

Do not introduce a subscription until there is recurring value to deliver. Possible benefits:
- advanced personal statistics and history;
- expanded challenge archive;
- exclusive cosmetic drops;
- profile customisation;
- optional seasonal content.

Avoid making basic gameplay, core progression or fair leaderboard participation subscription-only.

## 5. Sponsored challenges

A sponsor may fund a clearly labelled daily/weekly challenge or cosmetic event. Keep sponsorship separate from score verification and disclose sponsored content. Sponsors must not be able to alter scores, rankings or game outcomes.

## 6. Platform strategy and billing

- **Web:** use a supported web payment provider if/when direct purchases are justified. Confirm supported countries, fees, tax handling, refunds and recurring-payment rules before choosing one.
- **Android/iOS native apps:** digital goods and subscriptions are subject to the relevant store billing and program rules. Review current Apple App Store and Google Play policies before implementation; do not assume web checkout can simply be embedded in a native app.
- **Shared entitlement model:** regardless of storefront, verify transactions on a trusted server and store the resulting entitlement in the application's database. The client must never grant premium access based only on a local flag or an unverified callback.

Keep provider-specific code behind a small interface so the game UI does not depend directly on one payment or ad vendor.

## 7. Backend and data requirements

No monetisation schema or integration is required in the current phase.

Before paid features launch, design and review:
- an entitlement record keyed to the authenticated player;
- purchase/transaction records with provider, transaction reference, status and timestamps;
- server-side receipt/token verification;
- idempotent handling of duplicate callbacks;
- refund, cancellation, expiry and chargeback handling;
- audit history for grants and revocations.

Never store payment card details. Use the payment provider's hosted/tokenised flow. Keep secret keys in server-side secrets only.

## 8. Measurement and decision gates

Track only what is needed, with appropriate consent and privacy controls.

**Engagement gate before ads:** confirm that players return and complete games consistently. Monitor daily/weekly active players, games per player, D1/D7 retention, session length and daily challenge participation.

**Ad gate:** measure opt-in rate, completion rate, revenue per active player, retention impact and ad-related complaints. Stop or reduce placements if they materially harm the experience.

**Purchase gate:** measure product views, conversion, refunds, repeat purchases and support issues. Validate willingness to pay before building a subscription.

Do not set prices or revenue forecasts until we know the target markets, traffic, retention and provider fees. Test prices and offers transparently rather than treating estimates as guaranteed revenue.

## 9. Rollout checklist

1. Validate core gameplay and server-authoritative progression.
2. Add privacy-conscious analytics and establish a retention baseline.
3. Confirm responsive mobile web experience and PWA readiness.
4. Choose one monetisation experiment based on audience and geography.
5. Review legal, privacy, consent, tax, store and provider requirements.
6. Implement server-side verification and entitlement tests before accepting payment.
7. Roll out gradually, monitor retention and revenue, and retain a kill switch.

## 10. Non-negotiable product rules

- No selling leaderboard rank, score boosts or competitive power.
- No ads during active gameplay.
- No client-authoritative purchases, XP or premium status.
- No subscription until there is ongoing value.
- No native app solely for monetisation; prove mobile demand on the web/PWA first.
