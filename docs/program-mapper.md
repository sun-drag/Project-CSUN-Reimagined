# Program mapper — installation and handoff

This update revises the program mapper in the supplied CSUN Reimagined site. It reuses the header, six navigation destinations, shared stylesheet and footer from index.html, with the white / black / red palette.
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

Replace those files at their existing paths. The ZIP is based on the supplied project snapshot: merge only the mapper changes into your branch so newer work by teammates is preserved. Do not replace unrelated repository files.
Keep the repository's current `amplify.yml` and other site files. The build that
copies `pages`, `css`, `js`, `data` and `images` into `dist` already includes all
mapper assets. No npm install, build framework, browser API key or environment
variable is needed for this implementation.

Commit to the branch you connected to Amplify, or connect a preview branch first. Once that deployment
finishes, open `/pages/program-mapper.html` at the site's existing domain. The custom
domain and DNS records continue to serve the same Amplify app.

The `docs/program-mapper.md` and `tests/program-mapper` files are related handoff and
test files; publishing them is optional. They are not needed in `dist`.

## Credit and roadmap fixes in this revision

Four-year plans use each selected official roadmap’s actual semester budget,
usually 15 units. The review parsed 1,262 explicit semester totals across 157 maps;
one additional summer session is conditional and has no fixed unit total. Heavier
semesters are allowed when the guide explicitly lists them. Shorter timelines
calculate their needed load. A higher custom maximum requires selecting the custom
load mode. If a program has multiple guide variants, select the appropriate one.

Marking GE/campus areas complete reduces remaining credits. The default prior
credit figure is a conservative estimate of the GE space removed from this specific
curriculum after subtracting major overlap and waivers. It is labeled as estimated.
Select **Use my transcript credit total** to replace that estimate with actual other
earned units. Include prior GE in that total and exclude credits already recorded
as completed components/cards on the board. Overlays such as ES, IC and WI do not
create additional earned units.

For CIT with all GE/campus areas checked and the initial minimum-unit math and
programming choices, the estimate is 37 prior units and 3 genuine degree-elective
units. MATH 150A reduces that elective balance by 2 units. The actual transcript,
programming sequence, chosen minor/domain and completed major courses can change
these figures. Required CIT domain-emphasis coursework remains necessary even when
GE is finished. A completed-GE plan can have lighter semesters; courses are not
added merely to bring every semester up to 15 units.

Each multi-course requirement can be filled from its individual boxes. A selected
course appears as its own card. Open it and use **Replace this course selection**
to change that selection while retaining the other courses. Shared eligible
major/minor/preparation courses receive GE coverage automatically. Lecture/bundle
aliases represent one physical enrollment, and only uncompleted components count
in future semester loads. Optional additions that would exceed remaining degree
credits are rejected by the course picker.

Some source blocks had a stated credit total but a nested selector with no credit
target. The source group’s target is inherited by that selector. Remaining
unreconciled program credits above a guide’s free-elective allowance appear as
**PROGRAM REVIEW** reservations. They require program-specific confirmation and
are not offered as unrestricted elective selections. They cannot be marked as
completed courses. This is especially relevant to incomplete category rules,
course-family variants and integrated credential routes. Twenty-five major/option
entries have such review reservations in their initial unselected state.

The Computer Engineering guide’s program association was corrected. Geography and
Environmental Studies uses its guide from the central 2026 index. The separate
Honors guide is not substituted for the ordinary major. Mapper assets are versioned
to avoid combining an older cached script with the new model/data.

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
  "catalogUrl": "./catalog.json?v=2026.11.19.3"
}
```

The database is reserved for the later account and saved-progress feature. That feature
will need server-side authentication and an API that reads/writes each student's plan
under their own account. This update keeps catalog data public and browser plans local.
It adds no account flow, database connection or AWS resources.

## Academic and design review — November 19, 2026

All 158 major/option requirement pages and 157 degree roadmaps from program pages and the central index were
retrieved again. The mapped guides cover 141 entries; 17 entries have no mapped
four-year degree-roadmap reference. Many of those are double-major-only, transfer,
accelerated or blended routes. This does not establish that no other advising
material exists. The 107 minors and earlier individual-course page captures were
retained from the previous snapshot.

An independent scan compared 317 explicit selection pools in 109 majors/options.
Required-credit overcount checks and option-specific footnotes found additional
cases. Fourteen targeted curriculum corrections cover numbered CHS/Deaf Studies
alternative lists, Kinesiology biology pathways and approved Dance electives,
English extended-study emphases, CTVA management restrictions, Environmental
Science category minimums, and repeated-course overlap. These checks supplement
review of source conditions; they do not constitute an official degree audit.

The global choice behavior is corrected:

- CIT mathematics starts as a 3–5 unit choice between MATH 103, MATH 150A and
  MATH 255A. No math course is selected automatically. Programming is likewise
  an explicit choice. Selected courses are labeled as selected options and can
  be changed from Program choices or the course details.
- The same explicit-choice behavior applies to every program. Unresolved
  prerequisite alternatives request a route instead of enrolling the first
  course in the list. Mandatory, unambiguous preparation is still included.
- Guaranteed GE coverage from a pending choice reserves GE space without
  claiming that the GE area is completed. This prevents a second math GE block
  alongside CIT's pending math choice. Unit estimates use the minimum until a
  course/path is selected; higher-unit selections can change the plan.
- CIT offers the eligible upper-division CIT/COMP domain route or a separately
  approved package. Eligible selected minors can cover its proposed minor route.
  The approved package enforces its lower-division limit and prevents GE reuse.
- Official semester references guide placement, subject to prerequisites, the
  chosen timeline and course loads. Summer/winter sessions stay distinct.
  References that include summer or a fifth year produce timeline warnings.
- CIT's sample roadmap puts COMP 110/L and the math alternative together, while
  the individual COMP 110/L page requires prior qualifying math. The generated
  plan follows that prerequisite and flags the discrepancy. Prior credit or an
  approved exception must be confirmed with CSUN.
- The same catalog-family entry can represent different variants or repeated
  enrollments. Required variants and overlap are flagged explicitly; one card
  must not be treated as proof of every required enrollment.

Read `data/program-mapper/academic-audit.json` for the 158-program source inventory,
linked roadmaps, reviewed comparison flags, corrections and the 360 course records
whose individual page requirements remain unconfirmed. The major-page academic
sections and linked roadmap sections have no missing captured lines. Source
completeness is not the same as academic certification. Placement, grades,
admissions, approved repeats/substitutions, residency and actual semester offerings
still require confirmation.

The review uses the current 2026–2027 catalog and Plan J. The supplied CIT roadmap
is a 2025-present reference and explicitly includes the 2026 catalog year.

## Student data and degree-credit estimates

Student plans are saved under `csun-reimagined:program-mapper:v3` in localStorage.
Version 2 saves are migrated with their explicit selections intact. Version 1 saves are also read as a fallback; their selections move to a review list because that version could preselect alternatives. Completed courses, notes and other progress are retained; users explicitly choose their paths again. The old storage key is not deleted. The site sends no student plans to a server. Clearing browser storage removes the
local save; an exported JSON file can restore it on another browser. Imports are
limited to 2 MB, validated, and treated as data. Course content is escaped before
rendering. CSV output protects user-supplied cells from spreadsheet formulas.

GE completion is self-reported. It updates a labeled planning-credit estimate; it does not award official university credit. A supplied transcript total replaces the estimate. Do not include completed card/component credits again in that number. Remaining degree-elective
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
node --test tests/program-mapper/*.test.mjs
```

The current revision passes 94 automated tests. A static HTTP check serves all seven versioned mapper assets successfully. The generated-plan review covers 687 major/minor/progress/roadmap scenarios. Header, navigation destinations and footer are compared with index.html.

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
2. Choose CIT + Real Estate; select the math/programming alternatives and required minor electives.
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
