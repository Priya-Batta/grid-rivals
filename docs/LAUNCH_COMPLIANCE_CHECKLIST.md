# Launch compliance implementation status

Branch: `feat/launch-compliance-basics`

This branch contains initial draft static pages. It is not ready to merge or deploy.

## Added
- `/privacy.html`: working privacy notice draft based on the currently inspected app architecture.
- `/terms.html`: working terms draft.
- `/support.html`: initial support and complaints contact page using gridrivals.support@gmail.com.

## Must complete before public launch
- [ ] Confirm the exact legal operator identity and contact details to publish.
- [ ] Verify current applicability and requirements under the Information Technology Act/Rules and the Promotion and Regulation of Online Gaming Rules, 2026, including whether Grid Rivals is an online social game and the required grievance officer/contact, response timelines, notice format and escalation.
- [x] Add a draft age self-declaration gate: returning and new anonymous accounts must select India or outside India and confirm the applicable age threshold before app access.
- [x] Store the selected region, eligibility response, policy version and timestamp in Supabase Auth app metadata; no date of birth or identity document is collected by this flow.
- [x] Require the recorded eligible status in both verified-game Edge Functions, so direct game-start and score-submission calls are rejected without it.
- [ ] Run build and tests, then manually test new and returning accounts, India and other-region selections, underage/no-confirmation blocking, refresh, direct routes and direct API calls. Confirm existing player progress remains intact.
- [ ] Confirm whether a self-declaration is sufficient for the applicable legal requirements; do not assume it is. The implementation is not verified age assurance.
- [ ] Confirm the non-India age policy against local age and parental-consent rules before making the service available in those jurisdictions.
- [ ] Check whether the operator is subject to CERT-In directions and, if so, implement the required point of contact, incident reporting and log retention arrangements. Repository inspection alone cannot establish provider-side configuration or legal applicability.
- [ ] Verify the live Supabase project's RLS, function JWT settings, secrets, logs, backups and retention configuration in its dashboard.
- [ ] Confirm the privacy notice accurately describes actual live data collection, retention, hosting, support handling and any provider-side logs.
- [ ] Add accessible in-game navigation to the privacy, terms and support pages and test mobile layouts.
- [ ] Run the full test suite and production build; manually test all new pages and the age restriction.
- [ ] Review and correct all draft placeholders and legal statements before publication.

## Known product limitations to disclose
- Supabase anonymous account identity is browser-session dependent; clearing browser storage can make it inaccessible.
- There is no account-linking or account-recovery flow at present.
- The app reviewed for this draft did not show a third-party advertising or analytics integration. Recheck if code changes.

## Security observations from source review
- The main player tables have RLS enabled; direct table privileges are revoked from public/anon/authenticated and selected reads are scoped to the signed-in user.
- Game runs are created and finalized through service-role Edge Function paths after validating the user's Supabase access token.
- These are positive code-level findings, not a complete production security audit. Live configuration, function deployment settings, logs, secrets and provider-side controls still require verification.

The mandatory age self-declaration screen and server-side age-metadata checks have been removed from normal game access. The game does not request a date of birth, identity document or parental-consent record to start playing.

- [ ] Assess whether risk-appropriate age-gating, age verification, parental controls or other safeguards are required for the final game classification and target markets. Do not assume a Terms clause alone satisfies a requirement that applies.
- [ ] Confirm applicable age and parental-consent requirements before intentionally targeting children or collecting their personal data.
- [ ] Run tests and a production build; manually test new and returning accounts, direct routes, game start and score submission. Confirm existing player progress remains intact. No production deployment or merge is authorised by this branch.
