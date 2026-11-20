# Cybersecurity Center and Campus Resource Finder

This revision fills the existing Cybersecurity, Campus Resources, Phishing
Simulator and Scam Awareness pages. It uses the home page’s header, six navigation
destinations, footer, typography and white / black / red palette. Shared styles,
the home page, registration, login and the complete program mapper are unchanged.

## Publish through the existing Amplify branch

Merge these ten runtime files at their existing paths, including the new files:

```text
pages/cybersecurity.html
pages/resources.html
pages/phishing-simulator.html
pages/scam-awareness.html
css/pages/student-centers.css
js/pages/cybersecurity.js
js/pages/resource-finder.js
js/pages/phishing-simulator.js
js/pages/student-tools-core.mjs
js/pages/student-tools-data.mjs
```

The current Amplify process that copies `pages`, `css`, `js`, `data` and `images`
also includes these files. No additional backend, database connection, npm install
or website login is needed. Retain the repository’s current Amplify configuration
and merge only the relevant changes, so newer work by teammates is preserved.
The ZIP includes the prior completed mapper; do not replace newer unrelated files
with an older project snapshot. This update has not been pushed or deployed.

The new UI assets use cache version `2026.11.19.1`. Keep shared module imports and
page references consistent when publishing. Importable `.mjs` files need a
JavaScript content type. Serve the project over HTTP/HTTPS, not by opening an HTML
file through `file://`.

## Cybersecurity functionality

- Account, Duo, device-update and backup guidance with official CSUN sources.
- Six self-reported security habits; checked items stay in the current browser.
- Eight original, fictional practice messages: six suspicious messages and two
  independently verified routine-message scenarios. Every answer has an
  explanation, warning signs and a safer next action. Sender domains alone are
  explicitly not treated as proof of legitimacy.
- Computed scoring, progress restore, review, restart and missed-message practice.
  The first submitted answer stays locked for that attempt. Progress is shared
  between the hub’s embedded exercise and the standalone simulator.
- Six expandable scam guides covering fake-check jobs, professor impersonation,
  account/MFA attacks, aid/refund pressure, rentals and QR/text scams.
- A situation selector for suspicious messages, shared credentials/unexpected Duo,
  payments and possible device compromise, with official help links.
- An embedded Campus Resource Finder preview that searches the real directory and
  links to resource details on the Campus Resources page.

Practice messages have no active links or downloads, and the simulator asks for
no credentials. It does not send emails, inspect real inboxes or scan devices.
The page provides official reporting instructions; a mail link opens the user’s
email application and does not submit a report. No personal incident narrative is
collected. The four training/support pages are accessible without an account.

## Campus Resource Finder functionality

The directory contains 32 official resource records across eight categories:
academic support, food/basic needs, health/wellness, technology, money/career,
access/accommodations, community/belonging and getting around. Food assistance and housing share one category.

Search matches names, descriptions, locations and everyday-language tags such as
“hungry,” “gym,” “laptop,” “resume,” “tutoring” and “mental health.” Category,
on-campus-building, remote-option and saved-resource filters combine. The page
supports quick searches, a useful no-results state, filter reset and filtered URLs.
Details provide the next step, location, available contact information and an
official service link. The current Food Pantry location is the Valera NEST in the
University Student Union; the obsolete Sagebrush location is not used.

Resource saves use browser-local storage and do not require an account. If storage
is unavailable, the finder and exercise still work for the current visit. These
features do not connect to the RDS database or provide cloud synchronization.

## Map behavior

Selecting a mapped resource updates an embedded Google Maps building search and
an official Google Maps directions link. Directions are requested through the
provider; this site does not calculate routes or request the student’s location.
Buildings are searched by official names, not fabricated coordinates. The map
identifies the building, not a particular room, service desk or accessible entrance.
Resources without a confirmed building keep their written location/referral
instructions and are not assigned a guessed map pin.

The official CSUN map link is always available. If the external embedded map is
blocked or unavailable, users can use that link or open directions in a separate
window. The embedded map requires network access to Google. A custom Content
Security Policy, if added later, must allow the appropriate Google frame origins
(`maps.google.com` and `www.google.com`) or the embed should be omitted. The finder,
contact details and official links work independently of the map.

## Sources and maintenance

Records were reviewed against official CSUN pages and current catalog listings on
November 19, 2026. Financial/scam response guidance links to the FTC. Every resource
stores its official URL and review date. The source inventory is in
`docs/student-centers-sources.json`; the data is in `student-tools-data.mjs`.

Hours, fees, benefits eligibility, grants and device inventory are not represented
as live availability. Students are directed to the official page for current
hours, eligibility, costs and appointment instructions. Some university pages
blocked direct automated retrieval with HTTP 403; current indexed primary-source
content was used for research. A 403 in this environment is not claimed as a
working live-browser link check. The Google map embed likewise needs a browser
check after deployment. Recheck locations and official contact details when
updating the directory, especially services in the USU.

## Validation

Run the checks from the site root:

```sh
node --test tests/student-centers/*.test.mjs tests/program-mapper/*.test.mjs
```

143 automated tests pass: 22 support-page/model tests plus the existing 121 mapper
tests. The support-page tests run the actual page scripts and event handlers in a
small DOM harness. They cover search/filter/reset, saved resources, details,
map selection, deep links, blocked storage, the cybersecurity finder, scam and
response filters, checklist saves, scoring, locked answers, resume, review/retry,
corrupt progress, module exports and local assets. Static checks cover unique IDs,
section anchors, navigation and correct JavaScript/CSS/HTML content types.

Native Chromium could not start because the execution environment blocks AF_UNIX
sockets. The DOM harness does not establish responsive visual layout, focus-trap
behavior, real touch interaction, external map rendering or print pagination.
Those remain manual browser checks. Automated checks are not a certification of
campus-service availability or of a student’s account security.
