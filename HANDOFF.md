# EchoWorks Project Handoff

Updated: 2026-07-24 (Asia/Singapore)

Chinese handoff: [HANDOFF.zh-CN.md](HANDOFF.zh-CN.md)

## Read This First

- This is a static HTML, CSS, and JavaScript application intended for GitHub Pages and optional Firebase Hosting.
- Always read this file before changing the project.
- If the user says `handoff`, update this file before ending the task.
- Preserve unrelated working-tree changes. Do not reset or overwrite the user's work.
- Scenario, survey, scoring, and AR content stays in local JSON files. Firebase stores only accounts, authorization profiles, progress, attempts, scores, reflections, and timestamps.
- Never flip visual-novel character images. Keep the intended 5px visual edge spacing.
- Manager routes use REAL. Employee routes use CARE.
- Response time is engagement data only and never part of the competency score.
- The first attempt is the formal evaluation; later attempts show learning progress.
- Keep the manual AR fallback even when camera recognition works.
- Do not claim Firebase deployment, live email/account behavior, Firefox/Safari verification, or physical camera recognition unless actually tested.

## Current State

The confirmed production audit is implemented locally. The deployable output is generated in ignored `public/` by `npm run build`.

Principal routes:

- `index.html`: learner app, authentication, surveys, AR, settings, progress, and privacy links.
- `scenario.html`: production visual-novel route.
- `test3.html`: noindex legacy redirect that preserves query and hash values.
- `admin.html`: protected dashboard; never place this link in Settings.
- `privacy.html`: data-handling and support notice.

Final production preview:

- `http://127.0.0.1:4177/`
- `http://127.0.0.1:4177/scenario.html`
- `http://127.0.0.1:4177/admin.html`

The source preview on port 4176 was stopped. Port 4177 serves the final `public/` build. Stop that server before running another clean build on Windows because its working directory can lock `public/`.

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

The deterministic sample pack is implemented but has not been written to the live project. It contains 12 synthetic learners, 61 scenario result records, 4 drop-offs, 8 replay attempts, 41 reflections, and both-path completions. All sample addresses use the non-deliverable echoworks.invalid domain.

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

GitHub Pages deployment is already defined in .github/workflows/pages.yml. Set repository Settings > Pages > Source to GitHub Actions, then push the release to main. Add the GitHub Pages host to Firebase Authentication > Settings > Authorized domains.

The updated rules and indexes passed local tests but are not deployed. The synthetic data has not been uploaded from this task. After deployment, use disposable accounts to verify live reset/verification emails, cross-device merge, cloud deletion, owner access, viewer access, and viewer management.

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

- Dialogue has a subtle line cue plus quiet typing blips after user interaction.
- The sound toggle persists under `feedbackPlaybook.dialogueSound` and must respect autoplay restrictions.
- Screen-reader output announces each complete line once with the speaker; do not restore character-by-character live announcements.
- Keep the existing screen-swipe transition and reduced-motion fallback.
- Do not flip character images.
- Current AR is web-based card recognition/manual learning, not a Unity package or world-anchored AR.
- Camera code remains lazy and requires HTTPS or localhost.
- Always retain manual card selection when camera/MindAR/BarcodeDetector is unavailable.

## Verification Completed

- `npm run check`: passed.
- `npm test`: 11/11 passed.
- `npm run test:rules`: 5/5 Firestore emulator suites passed.
- `npm run test:browser`: passed in Chrome 150.0.7871.184 and Edge 150.0.4078.83.
- Browser coverage includes auth errors/reset/signup verification/logout, guest mode, optional survey/AR retry, four pulse answers, progress deletion dialog, both roles, reflection/replay, dashboard denial/owner access/filters/detail/viewer management, keyboard flow, and reduced motion.
- Axe serious/critical violations: 0 on app, scenario, and dashboard.
- Responsive checks passed at 320px, 390px, short landscape, 768px, 1024px, 1440px, and 200%/400% equivalent reflow widths with 44px controls and no horizontal overflow.
- Dashboard fixture: 75 learners and 300 result records rendered in about 40-50ms.
- Firestore sample pack: 12 synthetic learners, 61 attempts, 4 drop-offs, 8 replays, 41 reflections, and 53 latest-progress records; dry run passed.
- `npm audit --omit=dev --audit-level=moderate`: 0 vulnerabilities after `protobufjs` 7.6.5 patch.
- Final build: 55 runtime files, all public routes returned HTTP 200.

## Known Limits

- Firestore rules and indexes are local only until an authorized owner deploys them.
- The deterministic sample pack is generated locally but has not been written to the live Firestore project.
- Live Firebase email, cross-device, cloud deletion, and dashboard account flows need disposable production-project tests.
- Firefox is not installed here; Safari is unavailable on Windows.
- Automated zoom checks use equivalent CSS viewport widths; actual browser zoom still needs a manual pass.
- A physical Android/iOS printed-card camera test over HTTPS remains required.
- Legacy Firestore attempts never rewritten may still contain embedded reflection text and may need an owner migration.

## Working Tree

The audit intentionally changed application, rules, tests, deployment, and documentation files listed in `AUDIT_REPORT.md`. `public/`, `node_modules/`, test artifacts, and logs are ignored. No git commit or deployment was created.

## Next Steps

1. Read FIREBASE_GITHUB_PAGES.md or FIREBASE_GITHUB_PAGES.zh-CN.md.
2. Store a newly generated service-account key outside the repository on D: and set GOOGLE_APPLICATION_CREDENTIALS only in the trusted PowerShell session.
3. Deploy Firestore rules and indexes with Application Default Credentials.
4. Run the sample seed write command, sign in as the owner, and verify dashboard metrics and reflection detail.
5. Push the reviewed release to main and set GitHub Pages source to GitHub Actions.
6. Add the GitHub Pages host to Firebase Authentication authorized domains and run disposable-account live checks.
7. Run Firefox/Safari keyboard and zoom checks, then test the printed AR card on physical Android and iOS devices over HTTPS.
8. Review the working tree and commit the release as one intentional change.
