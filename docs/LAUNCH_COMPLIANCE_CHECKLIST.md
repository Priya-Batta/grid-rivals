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
- [ ] Implement and test the chosen India 18+ access restriction. Current app code does not contain an age gate. Do not treat a static policy statement as an implemented control or verified age assurance.
- [ ] Confirm whether a self-declaration is sufficient for the applicable legal requirements; do not assume it is.
- [ ] Confirm the non-India age policy against local age and parental-consent rules before making the service available in those jurisdictions.
- [ ] Check whether the operator is subject to CERT-In directions and, if so, implement the required point of contact, incident reporting and log retention arrangements. Repository inspection alone cannot establish provider-side configuration or legal applicability.
- [ ] Verify the live Supabase project's RLS, function JWT settings, secrets, logs, backups and retention configuration in its dashboard.
- [ ] Confirm the privacy notice accurately describes actual live data collection, retention, hosting, support handling and any provider-side logs.
- [ ] Add accessible in-game navigation to the policy and support pages and test mobile layouts.
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

No production deployment, database migration, or merge is authorised by this branch.
