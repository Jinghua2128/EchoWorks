# EchoWorks Project Handoff

Updated: 2026-08-01 (Asia/Singapore)

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
- Continue learning now requires one fully completed role-specific pre-pulse before opening scenario role selection; a partial pre-pulse remains a prerequisite and resumes at its first unanswered question.
- The responsive header keeps the home cross icon, adds a red AR icon shortcut, labels the menu Quick Access, includes a Scenario entry, and remains sticky across the full mobile/tablet breakpoint.
- First-time guests and first-time signed-in accounts receive a two-step, keyboard-accessible tutorial. Completion is stored per guest/profile under feedbackPlaybook.tutorialSeen.v1.*.
- The AR page keeps camera and manual selection, removes the redundant changing learning-detail panel, uses an icon-only retry control, and presents facilitator flow and scannable card materials as collapsed native disclosures.
- Settings uses a clearly red-tinted danger panel.
- Cache-busting for the current learner app release is `20260801-learning-gates` on app.css and app.js.

### Dashboard and role-specific pulse release (2026-07-30)

- The dashboard begins with a scan-first Feedback culture overview that preserves the existing red, white, teal, and neutral palette. It shows strongest and lowest Employee, Manager, and scenario areas plus Employee CARE, Manager REAL, scenario application, and participation summary cards.
- Employee and Manager pulse cards open an accessible pre/post dimension comparison. Learner progress and CARE / REAL result records are collapsed native disclosures by default so the overview remains readable on desktop and mobile.
- `assets/data/pulse-surveys.json` now contains four role/stage surveys: Employee pre, Employee post, Manager pre, and Manager post. Each survey has six 1-5 questions, for 24 saved responses in total.
- Employee pulse dimensions are Calm (two questions), Clarity, Reflection, Execution, and Overall satisfaction. Manager pulse dimensions are Recognise, Evaluate, Advise, Link, Confidence, and Overall satisfaction.
- Home progress reports 12 pre-pulse and 12 post-pulse responses. Scenario practice starts only after at least one complete Employee or Manager pre-pulse.
- The deterministic sample generator and reviewable JSON preview use the new 24-answer schema. The live Firestore sample records from 2026-07-24 still use the previous pulse schema until the owner intentionally reruns the sample seed command.
- Dashboard cache-busting is `20260730-culture-overview`; learner pulse data cache-busting is `20260730-role-pulse`.
### Role-gated learning flow (2026-08-01)

- Employee and Manager are independent learning tracks. Employee Pre-Pulse unlocks only the Employee CARE role; Manager Pre-Pulse unlocks only the Manager REAL role.
- Locked role cards remain actionable and open the exact matching pre-pulse. Finishing that survey runs the existing completion transition, returns to `scenario.html`, confirms the unlock, and leaves role selection to the learner.
- Employee Post-Pulse unlocks after at least one completed Employee scenario. Manager Post-Pulse unlocks after at least one completed Manager scenario. Completing one role never unlocks the other role's post-pulse.
- `assets/js/app.js` enforces post-pulse access, direct survey links, and Continue learning. `assets/js/novel.js` enforces direct scenario access and restores signed-in pulse answers from the learner's Firestore profile before finalizing a role gate.
- Guests use the same sequence with local progress. Partial pre-pulse answers do not unlock a role; they resume at the first unanswered question.
- Release verification passes 16 automated tests plus the full Playwright browser suite across eight responsive/zoom viewports, with no serious or critical axe findings and no browser console errors.
### Asset cleanup and consistent AR models (2026-07-29)

- The earlier cleanup removed 40 superseded files (13.96 MB), including duplicate character frames, legacy AR prototypes, lossless office sources, obsolete scenario data, and unused design references.
- AR now has one audited, card-specific pose per framework letter in `assets/ar-models`: `real-r`, `real-e`, `real-a`, `real-l`, `care-c`, `care-a`, `care-r`, and `care-e`.
- The four REAL renders are derived directly from `assets/characters/manager-lowpoly-idle.webp`; the four CARE renders are derived directly from `assets/characters/sarah-lowpoly-idle.webp`. Their original face geometry, closed-eye bars, proportions, clothing, color, polygon facets, lighting, front camera, and canvas remain locked while only body posture changes for each card action.
- All eight AR models are transparent `1024x1536` WebP cutouts (about 59-70 KB each). The physical card artwork and the MindAR target bundle are unchanged.
- Scenario characters use the four approved manager/Sarah idle/talk WebP files plus one transparent four-frame speaking GIF per character. The GIFs keep the approved low-poly identities and add a brief open-palm hand gesture; semantic pose states still reuse the same identity-locked assets.
- `assets/data/ar-cards.json` maps every card directly to `assets/ar-models/<card-id>-lowpoly.webp`. The AR cache key is `20260729-base-locked-ar-poses`.
- `scripts/build-public.mjs` copies an exact 67-file runtime manifest. The production package is 20.24 MB and excludes source/reference documents and rejected generated poses by construction.
### Scenario voice-over release (2026-07-29)

- Scenario narration and character dialogue now use the browser Web Speech API after the learner's first pointer or keyboard interaction.
- Narrator, manager, employee, and coach lines use separate rate, pitch, volume, and preferred English voice profiles; the browser falls back to its available English/default voice when a preferred voice is unavailable.
- The existing sound button now controls all scenario audio, persists under `feedbackPlaybook.dialogueSound`, stops active speech immediately when muted, and reads the current line when re-enabled.
- Every scene transition, restart, tab hide, and page exit cancels active speech before another line can start. Full stage-direction lines remain hidden; square-bracket markers and all parenthetical acting cues are removed from both displayed and spoken dialogue.
- No generated audio files or external speech service are required. If speech synthesis is unavailable, the existing line cue and typing clicks continue to work where Web Audio is supported.
- Typing now produces a consistent, clearly audible click on the first and every third visible character; whitespace no longer creates irregular silent cadence. Muting scenario audio stops new clicks immediately.
- The previous timer, CSS-keyframe, `requestAnimationFrame`, and Web Animations speaking implementations were removed. One controller in `assets/js/novel.js` swaps the active character to its transparent four-frame GIF for the full browser-speech duration, then restores idle on end, error, mute, scene change, replay, or page hide. Each GIF loops talk, open-palm hand gesture, talk, and idle frames. Reduced-motion users receive the static talk WebP.
- Above 920px, both characters move inward with a responsive 72-140px inset so laptop and desktop conversations feel connected. Tablet and phone positioning is unchanged.
- The scenario script and visual CSS cache version is `20260801-learning-gates`. All semantic pose states resolve to the approved idle, talk, and speaking assets for that character.

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

Dashboard behavior now includes the feedback-culture overview, pre/post pulse dimension details, collapsed learner/result disclosures, bounded 75-record pages, server filters for framework/path, cohort, scenario and dates, aggregate counts, pagination/end states, lazy reflection text, account identity/sign-out, learner detail focus, and owner-only viewer management.

## Firestore Sample Data and Deployment

Full setup instructions:

- [FIREBASE_GITHUB_PAGES.md](FIREBASE_GITHUB_PAGES.md)
- [FIREBASE_GITHUB_PAGES.zh-CN.md](FIREBASE_GITHUB_PAGES.zh-CN.md)

The deterministic sample pack was written to the live `echoworks-e3b4d` project on 2026-07-24. It contains 12 synthetic learners, 61 scenario result records, 4 drop-offs, 8 replay attempts, 41 reflections, 53 latest-progress records, and both-path completions. All sample addresses use the non-deliverable `echoworks.invalid` domain. The local generator and preview now contain 24-answer role-specific pulse data; rerun the confirmed seed command to replace the older live pulse shape.

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
- `assets/data/pulse-surveys.json`: four role/stage surveys with six questions each (24 answers total).
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

- Dialogue has a subtle line cue plus restrained, audible typing clicks after user interaction.
- Browser voice-over speaks visible scenario lines after user interaction, uses speaker-specific voice profiles where available, and must cancel before the next scene starts.
- Visible and spoken scenario dialogue must not contain square or round bracket markers. Full bracketed stage lines stay hidden; inline square-bracket wording is preserved without brackets, while parenthetical acting cues are removed.
- The sound toggle persists under `feedbackPlaybook.dialogueSound`, controls speech and dialogue tones together, and must respect autoplay restrictions.
- Do not commit generated voice files for this implementation. Browser speech synthesis is the deployment-friendly source, with the existing tones as its fallback.
- Screen-reader output announces each complete line once with the speaker; do not restore character-by-character live announcements.
- Keep the existing screen-swipe transition and reduced-motion fallback.
- Do not flip character images.
- Scenario characters use six approved low-poly assets: an idle/talk WebP pair and a transparent four-frame speaking GIF per character. Manager always uses the cream long-pointed-ear model; Sarah always uses the tan rounded-ear model with white inner-ear tufts. The GIFs add mouth movement and an open-palm hand gesture without changing identity. Paths are centralized in `assets/characters/character-models.js`, and speaking playback remains voice-duration-driven in `assets/js/novel.js`.
- Each scenario has a location background from `assets/scenes` (meeting room, review office, corridor, or planning workspace). Coach feedback may switch to the existing success/tense/mentor backdrop while preserving the screen-swipe transition.
- Current AR is web-based card recognition/manual learning, not a Unity package or world-anchored AR. One local MindAR bundle at `assets/ar-targets/echoworks-cards.mind` recognizes all eight physical CARE/REAL artworks.
- Physical card sources remain in `assets/ar-cards`. AR overlays use the dedicated, identity-locked card poses in `assets/ar-models`; keep the scenario pose system in `assets/characters` separate and unchanged. Target indexes remain fixed as REAL_R, REAL_E, REAL_A, REAL_L, CARE_C, CARE_A, CARE_R, CARE_E (0 through 7).
- Camera code remains lazy and requires HTTPS or localhost.
- Always retain manual card selection when camera/MindAR/BarcodeDetector is unavailable.

## Verification Completed

- `npm run check`: passed.
- `npm test`: 15/15 passed.
- `npm run test:rules`: 5/5 Firestore emulator suites passed.
- `npm run test:browser`: passed in Chrome 150.0.7871.184 and Edge 150.0.4078.83.
- Browser coverage includes auth errors/reset/signup verification/logout, first-time tutorial, pre-pulse prerequisite routing, all four role-specific surveys and 24 answers, guest mode, optional survey/AR retry, AR disclosures, exact card-specific AR pose loading, sticky mobile header, progress deletion dialog, both roles, reflection/replay, dialogue panel click/tap, text-selection protection, input cooldown, deterministic voice-over/mute/cancellation/speaker-profile checks, real-motion typing-audio cadence and mute checks, voice-driven speaking-GIF source switching, GIF signature validation, laptop inset, typing lifetime, idle restoration after audio, bracket-free visible/spoken dialogue, dashboard denial/owner access/overview/pulse details/collapsed records/filters/detail/viewer management, keyboard flow, and reduced motion.
- Axe serious/critical violations: 0 on app, scenario, and dashboard.
- Responsive checks passed at 320px, 390px, short landscape, 768px, 1024px, 1440px, and 200%/400% equivalent reflow widths with 44px controls and no horizontal overflow.
- Dashboard fixture: 75 learners and 300 result records rendered in about 40-50ms.
- Firestore sample pack: 12 synthetic learners, 61 attempts, 4 drop-offs, 8 replays, 41 reflections, and 53 latest-progress records; dry run and all 168 live-document checks passed.
- `npm audit --omit=dev --audit-level=moderate`: 0 vulnerabilities after `protobufjs` 7.6.5 patch.
- Final build: 67 explicit runtime files (20.24 MB), including four approved static scenario character frames, two transparent four-frame speaking GIFs with hand gestures, eight dedicated transparent AR model poses, four location backgrounds, eight supplied physical card artworks, and one locally compiled 2.44 MB MindAR version-2 bundle.

## Known Limits

- Live Firebase email, cross-device, cloud deletion, and dashboard account flows need disposable production-project tests.
- Firefox is not installed here; Safari is unavailable on Windows.
- Voice timbre and available accents depend on the browser and operating-system speech voices. Automated QA verifies speech routing, profiles, muting, and cancellation with a deterministic speech engine, but cannot judge real-device voice quality or loudness.
- Automated zoom checks use equivalent CSS viewport widths; actual browser zoom still needs a manual pass.
- Physical Android/iOS camera tests of all eight printed cards over HTTPS remain required; automated checks verify target structure and manual previews, not real-world camera recognition.
- Legacy Firestore attempts never rewritten may still contain embedded reflection text and may need an owner migration.

## Working Tree

The reviewed release is published on GitHub Pages. Firestore rules, indexes, owner access, authorized production domain, and sample data are live. At the time of this handoff, `.firebaserc` and `firebase.json` contain existing uncommitted Firebase CLI changes; preserve and review them rather than resetting them.

## Next Steps

1. Sign in at the live site as `liuguangxuan1230@gmail.com` and verify the Dashboard overview, Employee/Manager pulse breakdowns, collapsed learner/result records, reflection detail, and viewer management.
2. Rerun the confirmed sample seed command when the live Firestore demo should use the new 24-answer role-specific pulse schema.
3. Use disposable accounts to test verification/reset email, cross-device merge, cloud deletion, and owner/viewer access end to end.
4. Run Firefox/Safari keyboard and zoom checks, then test all eight printed AR cards on physical Android and iOS devices over HTTPS.
5. Review the existing `.firebaserc` and `firebase.json` changes before the next intentional commit.
