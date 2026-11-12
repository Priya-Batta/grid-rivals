# Launch readiness checklist

Branch: `feat/launch-compliance-basics`

The privacy, terms and support pages on this branch are working drafts, not legal sign-off. Confirm their accuracy against the live service before publication.

## Required before public launch

- [ ] Confirm the legal operator identity and the contact details that should be published.
- [ ] Check which Indian online-game requirements apply to Grid Rivals, including whether it is an online social game and whether a designated grievance contact, response timelines, notice format or escalation route are required.
- [ ] Confirm any age-related safeguards required by the game's final classification and target markets. The game currently has no mandatory age self-declaration or age-verification step; do not assume that a Terms clause replaces a safeguard if one is legally required.
- [ ] Confirm age and parental-consent requirements before intentionally targeting children or collecting children's personal data.
- [ ] Check whether CERT-In directions apply and, if so, configure the required point of contact, incident reporting and log retention.
- [ ] Verify the live Supabase project's RLS, function JWT settings, secrets, logs, backups and retention configuration.
- [ ] Confirm the privacy notice accurately describes live data collection, retention, hosting, support handling and provider-side logs.
- [ ] Add accessible in-game links to the privacy, terms and support pages; test the pages on mobile.
- [ ] Run the full test suite and production build. Manually test new and returning accounts, refresh, direct routes, game start and score submission; confirm existing progress remains intact.
- [ ] Correct draft placeholders and legal statements before publication.

## Known product limitations

- Supabase anonymous account identity is browser-session dependent; clearing browser storage can make it inaccessible.
- Account linking and account recovery are not currently available.
- The application code reviewed for this draft did not show a third-party advertising or analytics integration. Recheck if code changes.

## Security observations

- The main player tables have RLS enabled; direct table privileges are revoked from public/anon/authenticated and selected reads are scoped to the signed-in user.
- Game runs are created and finalized through service-role Edge Function paths after validating the user's Supabase access token.
- These are code-level observations, not a complete production security audit. Verify live configuration, function deployment settings, logs, secrets and provider-side controls separately.

No production deployment or merge is authorised by this branch.
