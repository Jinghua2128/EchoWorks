# EchoWorks Project Handoff

Updated: 2026-07-28 (Asia/Singapore)

Chinese handoff: [HANDOFF.zh-CN.md](HANDOFF.zh-CN.md)

## Read This First

- This is a static HTML, CSS, and JavaScript application intended for GitHub Pages and optional Firebase Hosting.
- Always read this file before changing the project.
- If the user says `handoff`, update this file before ending the task.
- When user-visible website work is complete, run the release checks, build, commit and push the intended files to `main`, wait for GitHub Pages to deploy, and provide the live URL unless the user explicitly requests local-only work.
- Preserve unrelated working-tree changes. Do not reset or overwrite the user's work.
- Scenario, survey, scoring, and AR content stays in local JSON files. Firebase stores only accounts, authorization profiles, progress, attempts, scores, reflections, and timestamps.
- Never flip visual-novel character images. Keep the intended 5px visual edge spacing.
- Manager routes use REAL. Employee routes use CARE.
- Response time is engagement data only and never part of the competency score.
- The first attempt is the formal evaluation; later attempts show learning progress.
- Keep the manual AR fallback even when camera recognition works.
- Do not claim Firebase deployment, live email/account behavior, Firefox/Safari verification, or physical camera recognition unless actually tested.

## Current State

The confirmed production audit is implemented locally.

### Learner UI release (2026-07-28)

- The home page now uses Your progress as the progress heading, removes the duplicate learning-path/next-action/quick-tools copy, shows 5 min / scenario, and reports scenario status as Not Done until all eight scenarios are complete.
- Continue learning opens the pre-pulse when the learner has no pre-pulse answer. After any pre-pulse attempt, it resumes the existing scenario route.
- The responsive header keeps the home cross icon, adds a red AR icon shortcut, labels the menu Quick Access, includes a Scenario entry, and remains sticky across the full mobile/tablet breakpoint.
- First-time guests and first-time signed-in accounts receive a two-step, keyboard-accessible tutorial. Completion is stored per guest/profile under feedbackPlaybook.tutorialSeen.v1.*.
- The AR page keeps camera and manual selection, removes the redundant changing learning-detail panel, uses an icon-only retry control, and presents facilitator flow and scannable card materials as collapsed native disclosures.
- Settings uses a clearly red-tinted danger panel.
- Cache-busting for this release is 20260728-guided-home on app.css and app.js.

The deployable output is generated in ignored `public/` by `npm run build`.

Principal routes:

- `index.html`: learner app, authentication, surveys, AR, settings, progress, and privacy links.
- `scenario.html`: production visual-novel route.
- `test3.html`: noindex legacy redirect that preserves query and hash values.
- `admin.html`: protected dashboard; never place this link in Settings.
- `privacy.html`: data-handling and support notice.

Local production preview:

- `http://127.0.0.1:4176/`
- `http://127.0.0.1:4176/scenario.html`
- `http://127.0.0.1:4176/admin.html`

Use port 4176 for the current production preview when running locally. Stop that server before running another clean build on Windows because its working directory can lock `public/`.

## Audit Architecture

Shared data/client modules:

- `assets/js/firebase-client.js`: Firebase config, Auth, lazy Firestore, normalized emails, owner/viewer roles.
- `assets/js/progress-store.js`: deterministic local/cloud merge, attempts, completion, saves, pending sync, retries.
- `assets/js/scenario-engine.js`: option scoring and scenario validation.
- `assets/css/tokens.css`: shared palette, typography, radii, focus, and motion tokens.

Deployment and tests:

- `scripts/build-public.mjs`: whitelist-only runtime build.
- `.github/workflows/pages.yml`: GitHub Pages test/build/deploy workflow.
- `firebase.json`: Firebase Hosting headers, predeploy build, indexes, emulator config.
- `firestore.rules`: least-privilege learner/viewer/owner rules.
- `firestore.indexes.json`: dashboard query indexes.
- `tests/browser-qa.mjs`: Chrome/Edge release flow, axe, responsive, keyboard, and performance checks.
- `AUDIT_REPORT.md`: full implementation/file/test report.
- `DEPLOYMENT.md`: external release steps.
- `BROWSER_SUPPORT.md`: browser minimums and fallbacks.

## Progress and Saving

- Guest progress is local only.
- Signed-in scenario history is loaded from Firestore and merged with local history by user, attempt, scenario, attempt number, and timestamp.
- Offline/unsynced local attempts are preserved.
- Training-record success copy appears only after confirmed cloud success.
- Failed cloud saves remain local with a retry state.
- Home progress, latest score, unseen scenario selection, attempt numbering, replay status, and other-role status use merged history.
- Reflections are stored separately in `scenarioReflections`; dashboard lists show only reflection status and fetch text when learner detail opens.
- New writes remove legacy embedded `reflectionAnswers` where possible.

Signed-in progress deletion:

- Uses an accessible confirmation dialog.
- Discovers and deletes all owned `scenarioProgress`, `scenarioResults`, and `scenarioReflections` records.
- Removes survey/role/anonymous progress fields from the learner profile.
- Clears local progress only after intended cloud deletion succeeds.
- Partial cloud failures retain local data and show retry guidance.

## Dashboard Authorization

Authoritative owner email:

`liuguangxuan1230@gmail.com`

Authorization collection:

`dashboardAdminEmails/{normalized-email}`

Roles:

- `owner`: read dashboard data and add/remove read-only viewers.
- `viewer`: read dashboard data only; cannot modify learner data or viewer profiles.
- learner: read/write only owned data allowed by rules.

The Dashboard link appears in the main sidebar only after a signed-in email has a valid dashboard profile. The owner may bootstrap its protected owner profile under the included rules. The owner profile cannot be deleted or demoted.

Dashboard behavior now includes bounded 75-record pages, server filters for framework/path, cohort, scenario and dates, aggregate counts, pagination/end states, lazy reflection text, account identity/sign-out, learner detail focus, and owner-only viewer management.

## Firestore Sample Data and Deployment

Full setup instructions:

- [FIREBASE_GITHUB_PAGES.md](FIREBASE_GITHUB_PAGES.md)
- [FIREBASE_GITHUB_PAGES.zh-CN.md](FIREBASE_GITHUB_PAGES.zh-CN.md)

The deterministic sample pack was written to the live `echoworks-e3b4d` project on 2026-07-24. It contains 12 synthetic learners, 61 scenario result records, 4 drop-offs, 8 replay attempts, 41 reflections, 53 latest-progress records, and both-path completions. All sample addresses use the non-deliverable `echoworks.invalid` domain.

Important files:

- scripts/dashboard-sample-data.mjs: source-of-truth sample generator.
- scripts/seed-firestore.mjs: dry-run-first Firestore writer and cleanup tool.
- sample-data/firestore-dashboard-sample.json: reviewable generated preview.
- tests/dashboard-sample-data.test.mjs: scoring, identity, state, and replay verification.

The Firebase Admin SDK writer requires both the expected project and an explicit confirmation before it can write. Every synthetic document is marked with seedNamespace = echoworks-dashboard-demo-v1 and isSampleData = true. Cleanup removes only the deterministic sample learner documents and intentionally keeps the protected owner profile.

A Firebase browser login is not required. The Firebase CLI and Admin SDK can use Application Default Credentials from a service-account file stored outside this repository:

~~~powershell
$env:GOOGLE_APPLICATION_CREDENTIALS='D:\FirebaseSecrets\echoworks-admin.json'
firebase deploy --only firestore --project echoworks-e3b4d
npm run sample:seed -- --write --project=echoworks-e3b4d --confirm-project=echoworks-e3b4d
~~~

Never commit, publish, or share the service-account file. The public firebase-config.js is not a private credential.

GitHub Pages is live at `https://jinghua2128.github.io/EchoWorks/`; both the app and `admin.html` returned HTTP 200 on 2026-07-24. Deployment remains defined in `.github/workflows/pages.yml`.

Firestore rules and indexes were deployed successfully to `echoworks-e3b4d` on 2026-07-24. Firebase Authentication has email/password enabled and authorizes `jinghua2128.github.io`. The active Authentication account `liuguangxuan1230@gmail.com` has a matching `dashboardAdminEmails` owner profile. A REST batch read verified all 168 expected records: 1 owner profile plus 167 deterministic sample documents.

## Authoritative Scenario Content

Authoritative Drive document:

- Document: `MDC`
- Document ID: `1oGnbsktUpmwYl7eKtUz7RdCh4wBEwORAPmTJfrYEJw0`
- FULL GAME SCRIPT tab: `t.48hlwn1nvtld`

Local content:

- `assets/data/scenarios/full-game-script.json`
- `assets/data/scenarios/scenario-library.json`
- `assets/data/pulse-surveys.json`: exactly two pre-pulse and two post-pulse questions.
- `assets/data/ar-cards.json`

Do not move these content definitions into Firestore.

## Exact Scoring

`2 = strong`, `1 = partial/risky`, `0 = missed`.

| Path | Scenario / dimension | A | B | C |
| --- | --- | ---: | ---: | ---: |
| Manager REAL | Recognise - The Late Arrival | 2 | 0 | 1 |
| Manager REAL | Evaluate - The Uneven Scale | 0 | 2 | 0 |
| Manager REAL | Advise - The Quiet One | 0 | 2 | 2 |
| Manager REAL | Link - The Star Who Stopped Caring | 0 | 2 | 0 |
| Employee CARE | Compose - The Ambush | 0 | 2 | 1 |
| Employee CARE | Analyze - The Rating That Stings | 2 | 0 | 0 |
| Employee CARE | Resolve - What Did That Mean? | 0 | 2 | 1 |
| Employee CARE | Execute - Three Weeks. One Goal. | 0 | 2 | 0 |

The Quiet One intentionally has two strong answers. Standardize the manager dimension as `Advise`, never `Advice`.

Path score:

`total points earned / 8 * 100`

The pulse survey and game competency dimensions are reported separately; do not compare them without an approved alignment model.

## Dialogue and AR Invariants

- The dialogue panel and existing button share the same guarded progression path. Preserve panel click/tap, Enter/Space, text-selection protection, nested-control protection, and the 260ms cooldown.

- Dialogue has a subtle line cue plus quiet typing blips after user interaction.
- The sound toggle persists under `feedbackPlaybook.dialogueSound` and must respect autoplay restrictions.
- Screen-reader output announces each complete line once with the speaker; do not restore character-by-character live announcements.
- Keep the existing screen-swipe transition and reduced-motion fallback.
- Do not flip character images.
- Scenario characters use 12 lightweight pre-rendered low-poly frames: three synchronized idle/talk pose pairs per character. Paths are centralized in `assets/characters/character-models.js`; speaker, mood, tone, and turn-based pose selection live in `assets/js/novel.js`. This is not a real-time Three.js character runtime.
- Each scenario has a location background from `assets/scenes` (meeting room, review office, corridor, or planning workspace). Coach feedback may switch to the existing success/tense/mentor backdrop while preserving the screen-swipe transition.
- Current AR is web-based card recognition/manual learning, not a Unity package or world-anchored AR. One local MindAR bundle at `assets/ar-targets/echoworks-cards.mind` recognizes all eight physical CARE/REAL artworks.
- Physical card sources are in `assets/ar-cards`; matching transparent AR poses are in `assets/ar-models`. The eight overlays use the same soft low-poly 3D character design as the scenario models: cream Alex for REAL and brown-mask Sarah/Jamie for CARE. Filenames share the exact card IDs. Target indexes are fixed as REAL_R, REAL_E, REAL_A, REAL_L, CARE_C, CARE_A, CARE_R, CARE_E (0 through 7).
- Camera code remains lazy and requires HTTPS or localhost.
- Always retain manual card selection when camera/MindAR/BarcodeDetector is unavailable.

## Verification Completed

- `npm run check`: passed.
- `npm test`: 13/13 passed.
- `npm run test:rules`: 5/5 Firestore emulator suites passed.
- `npm run test:browser`: passed in Chrome 150.0.7871.184 and Edge 150.0.4078.83.
- Browser coverage includes auth errors/reset/signup verification/logout, first-time tutorial, pre-pulse prerequisite routing, guest mode, optional survey/AR retry, AR disclosures, sticky mobile header, four pulse answers, progress deletion dialog, both roles, reflection/replay, dialogue panel click/tap, text-selection protection, input cooldown, dashboard denial/owner access/filters/detail/viewer management, keyboard flow, and reduced motion.
- Axe serious/critical violations: 0 on app, scenario, and dashboard.
- Responsive checks passed at 320px, 390px, short landscape, 768px, 1024px, 1440px, and 200%/400% equivalent reflow widths with 44px controls and no horizontal overflow.
- Dashboard fixture: 75 learners and 300 result records rendered in about 40-50ms.
- Firestore sample pack: 12 synthetic learners, 61 attempts, 4 drop-offs, 8 replays, 41 reflections, and 53 latest-progress records; dry run and all 168 live-document checks passed.
- `npm audit --omit=dev --audit-level=moderate`: 0 vulnerabilities after `protobufjs` 7.6.5 patch.
- Final build: 93 runtime files, including 12 scenario character frames, four location backgrounds, eight supplied physical card artworks, eight card-specific AR poses, and one locally compiled 2.44 MB MindAR version-2 bundle.

## Known Limits

- Live Firebase email, cross-device, cloud deletion, and dashboard account flows need disposable production-project tests.
- Firefox is not installed here; Safari is unavailable on Windows.
- Automated zoom checks use equivalent CSS viewport widths; actual browser zoom still needs a manual pass.
- Physical Android/iOS camera tests of all eight printed cards over HTTPS remain required; automated checks verify target structure and manual previews, not real-world camera recognition.
- Legacy Firestore attempts never rewritten may still contain embedded reflection text and may need an owner migration.

## Working Tree

The reviewed release is published on GitHub Pages. Firestore rules, indexes, owner access, authorized production domain, and sample data are live. At the time of this handoff, `.firebaserc` and `firebase.json` contain existing uncommitted Firebase CLI changes; preserve and review them rather than resetting them.

## Next Steps

1. Sign in at the live site as `liuguangxuan1230@gmail.com`, refresh once if the session predates the permission update, and verify the Dashboard link, metrics, reflection detail, and viewer management.
2. Use disposable accounts to test verification/reset email, cross-device merge, cloud deletion, and owner/viewer access end to end.
3. Run Firefox/Safari keyboard and zoom checks, then test all eight printed AR cards on physical Android and iOS devices over HTTPS.
4. Review the existing `.firebaserc`, `firebase.json`, and handoff changes before the next intentional commit.
