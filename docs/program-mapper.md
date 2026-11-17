# Program mapper — installation and handoff

This update implements the program mapper in the supplied CSUN Reimagined site.
The other existing pages, shared styles, shared scripts and images are unchanged.

## Publish to the existing Amplify site

Merge these **seven runtime files** into the same paths in the GitHub repository:

```text
pages/program-mapper.html
css/pages/program-mapper.css
js/pages/program-mapper.js
js/pages/program-mapper-core.mjs
js/pages/program-mapper-catalog.mjs
data/program-mapper/config.json
data/program-mapper/catalog.json
```

The first three replace existing mapper placeholders. The other four are new.
Keep the repository's current `amplify.yml` and other site files. The build that
copies `pages`, `css`, `js`, `data` and `images` into `dist` already includes all
mapper assets. No npm install, build framework, browser API key or environment
variable is needed for this implementation.

Commit to the branch connected to Amplify (currently `main`). Once that deployment
finishes, open `/pages/program-mapper.html` at the site's existing domain. The custom
domain and DNS records continue to serve the same Amplify app.

The `docs/program-mapper.md` and `tests/program-mapper` files are related handoff and
test files; publishing them is optional. They are not needed in `dist`.

## Included functionality

- All 158 indexed major/option entries and 107 minors, with editable program paths,
  elective pools and approval acknowledgments from the existing catalog snapshot.
- A dated, year-by-year board. Fall 2026 is followed by Spring 2027. Start in Fall
  or Spring and choose a 2–8 year plan. Add Summer/Winter globally or insert one
  specific summer, winter or extension term.
- Prerequisite-aware automatic arrangement, prerequisite preparation, unit-load
  estimates and explicit unscheduled cards when the timeline cannot accommodate a
  course. Unresolved academic conditions are retained in Plan check.
- Drag/drop between semesters; a keyboard/touch-accessible Move control in each
  course's details; locked semesters; downstream prerequisite adjustments; rejected
  moves leave the original layout intact.
- Course links: select real course cards, create a named sequence or a same-semester
  corequisite group, and move a group by moving one member. Sequence offsets are
  preserved. Standard prerequisite/corequisite relationships are also drawn with
  SVG lines. Focus a course to highlight its connected courses.
- Descriptions and official source links for 4,459 course records. Short catalog
  excerpts are normalized by source page. Unconfirmed records link to their
  available official source and request review instead of inventing descriptions.
- Current GE Plan J and campus-area checklist. Mark prior areas complete, uncheck
  a missing area such as 5B (the former B2 label), and choose an eligible catalog
  course for its placeholder. Base-area assignments avoid counting the same
  course units twice. Science lecture/lab bundles retain their component split.
- ES, IC, upper-division GE and WI are overlapping designations, not automatically
  added duplicate course blocks. Their eligible courses and remaining checks are
  visible. Upper-division GE scheduling checks junior standing and basic GE
  preparation; it does not certify all distribution/residency rules.
- Double-click or check a course to mark it complete. Add catalog courses or a
  custom course; remove and restore required courses; enter notes and preferred
  seasons; choose planned units for variable-unit, single-component courses.
- Autosave in this browser, 40-step session undo/redo, editable-plan JSON
  export/import, spreadsheet CSV, print/save-as-PDF styling and a quick tour.

## Catalog data and the existing RDS database

**The working mapper uses a bundled public catalog snapshot. It is not connected
to the live RDS instance.** The functionality works on the existing static Amplify
hosting and does not depend on a database connection from the student's browser.

The snapshot is based on the 2026–27 mapper data previously imported into RDS:
4,819 records, 265 programs, their requirement trees, and 20 GE/campus/overlay rules.
It adds short descriptions and rebuilds conservative prerequisite expressions
from individual course-page captures. Some earlier imported records had combined
references from department directories; those expressions are not blindly
enforced here. Calculus III now points to Calculus II, and Calculus II retains
the placement-table qualifications for Calculus I / AP credit and supplemental
labs. The current RDS records were **not** modified by this update.

There are 360 records for which a matching individual page was not confirmed in
the snapshot. Their prerequisites require review. A catalog alternative that
cannot be interpreted safely is not treated as permission or as an instruction to
take every referenced course. Program-specific exceptions, minimum grades,
approved substitutions, residency, placement and admissions remain review states.
The generated plan is a planning draft, not an official degree audit.

`data/program-mapper/config.json` contains the public catalog URL:

```json
{
  "schemaVersion": 1,
  "catalogUrl": "./catalog.json"
}
```

To use RDS later, add a server-side read endpoint that returns the same normalized
JSON shape as `catalog.json`, including merged `details`, and point `catalogUrl`
at that endpoint. Keep connection strings and database credentials on the server.
The endpoint can return cached public catalog data without student authentication.
If hosted on a different origin, it must permit the site's origin through CORS.
First reconcile the data corrections and descriptions from this snapshot with
RDS; simply returning the older imported expressions would reintroduce the
directory-reference problem. No server, AWS resource or credential was created
or changed by this update.

## Student data and degree-credit estimates

Student plans are saved under `csun-reimagined:program-mapper:v1` in localStorage.
The site sends no student plans to a server. Clearing browser storage removes the
local save; an exported JSON file can restore it on another browser. Imports are
limited to 2 MB, validated, and treated as data. Course content is escaped before
rendering. CSV output protects user-supplied cells from spreadsheet formulas.

Marking a GE area complete is a self-report, not an automatic grant of transfer
units. Enter transfer / other earned units explicitly and do not include the
completed cards already in this plan in that number. Remaining degree-elective
cards reserve the difference to the program's recorded minimum (usually 120).

Lecture/lab bundles use one card. Special repeated-enrollment requirements and
advisor-designed paths remain academic review conditions: use additional custom
cards and advisor-approved selections when the ordinary catalog card cannot
represent a repeated enrollment. A custom course alone does not waive a required
course. Removing a required course is visible in Plan check and reversible.

## Run locally and verify

Use a static web server; do not open the HTML directly as a `file://` URL:

```sh
python3 -m http.server 8000
```

Then open `http://localhost:8000/pages/program-mapper.html`.

The tests require a current Node.js runtime, with no package installation:

```sh
node --test tests/program-mapper/core.test.mjs tests/program-mapper/interface.test.mjs
```

Core tests exercise real catalog data and a small independent dependency fixture.
They include every indexed major/minor, sequencing, alternate prerequisites,
corequisites, locks, calendar dates, GE replacement, unit selection, and import
boundaries. Interface tests execute the real page script with a small DOM contract
harness and exercise event handlers, dialogs, drag/drop dispatch, completion,
links, GE, custom courses, restore, downloads and print invocation.

The DOM harness is **not** a substitute for a real browser. Automated Chromium
launch was blocked by an AF_UNIX socket restriction in the execution environment.
Native drag hit-testing, touch interaction, actual PDF pagination and responsive
visual layout need a browser review after deployment. Do not interpret these tests
as certification of academic requirements or semester offerings.

Recommended browser check after deployment:

1. Open the mapper at desktop and phone widths; check scrolling and dialogs.
2. Choose CIT + Real Estate; review the suggested paths and required minor electives.
3. Drag a course to another semester; try a prerequisite move that cannot fit.
4. Select two independent courses, create a corequisite link, and move the group.
5. Check all GE areas, uncheck 5B/B2, and choose BIOL 101 or another eligible course.
6. Double-click a real course, reload to confirm saving, then export and import it.
7. Try the Move control on a phone and the print/save-as-PDF view.

## Official sources

- [Current General Education](https://catalog.csun.edu/general-education/)
- [GE rules](https://catalog.csun.edu/general-education/rules/)
- [Major/GE pattern modifications](https://catalog.csun.edu/general-education/pattern-modifications/)
- [Archived B2 Life Science](https://catalog.csun.edu/archive/2024/general_education/b2/)
- [Calculus II](https://catalog.csun.edu/academics/math/courses/math-150b/)
- [Calculus III](https://catalog.csun.edu/academics/math/courses/math-250/)
- [Mathematics placement table](https://catalog.csun.edu/policies/mathematics-diagnostic-test-mdt/)

Each program and catalog course also retains its individual official source URL.
