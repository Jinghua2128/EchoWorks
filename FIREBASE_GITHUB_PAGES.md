# Firebase and GitHub Pages Setup

Chinese guide: [FIREBASE_GITHUB_PAGES.zh-CN.md](FIREBASE_GITHUB_PAGES.zh-CN.md)

This project uses GitHub Pages for the website and Firebase Authentication plus Cloud Firestore for user data. Scenario content remains in local JSON files.

## What Is Ready

- GitHub Pages workflow: .github/workflows/pages.yml
- Firebase project: echoworks-e3b4d
- Firestore rules: firestore.rules
- Firestore indexes: firestore.indexes.json
- Public web configuration: firebase-config.js
- Synthetic data preview: sample-data/firestore-dashboard-sample.json
- Guarded data writer: scripts/seed-firestore.mjs

The preview contains 12 synthetic learners, completed and incomplete paths, A/B/C choices, CARE and REAL scores, replays, reflections, and improvement data. The addresses use the reserved echoworks.invalid domain and are not real Firebase Authentication users.

## Important Security Rule

firebase-config.js is safe to publish because it is the public web-app configuration protected by Authentication, Firestore rules, API restrictions, and allowed domains.

A service-account JSON file is different: it is a private administrator credential that bypasses Firestore rules. Never commit it, upload it to GitHub, place it in public, or send it through chat. Matching key filenames are ignored by .gitignore, but the safest location is outside this repository.

## 1. Prepare Firebase

In the Firebase console for echoworks-e3b4d:

1. Open Authentication > Sign-in method.
2. Enable Email/Password.
3. Create or sign in with the owner account liuguangxuan1230@gmail.com.
4. Open Project settings > Service accounts.
5. Choose Generate new private key.
6. Store the downloaded file outside the repository, for example D:\FirebaseSecrets\echoworks-admin.json.

The private key is only needed for trusted local administration. Revoke it from Google Cloud IAM when it is no longer needed.

## 2. Install and Review

Open PowerShell:

~~~powershell
Set-Location 'D:\Program Files\EchoWorks\echowrks_vn'
npm ci
npm run verify
npm run test:rules
npm run sample:export
npm run sample:seed
~~~

sample:seed is a dry run by default. It prints the planned record counts and does not connect to Firestore.

Review sample-data/firestore-dashboard-sample.json before writing anything.

## 3. Seed the Sample Dashboard Data

Set the credential only for the current PowerShell window:

~~~powershell
$env:GOOGLE_APPLICATION_CREDENTIALS='D:\FirebaseSecrets\echoworks-admin.json'
npm run sample:seed -- --write --project=echoworks-e3b4d --confirm-project=echoworks-e3b4d
~~~

This writes:

- dashboardAdminEmails/liuguangxuan1230@gmail.com as the protected owner
- 12 users documents
- 61 scenarioResults documents
- 41 scenarioReflections documents
- 53 users/{uid}/scenarioProgress documents

Every synthetic learner/result/reflection has seedNamespace = echoworks-dashboard-demo-v1 and isSampleData = true. Running the seed again replaces the same deterministic documents instead of creating duplicates.

The owner profile is real access configuration, so cleanup intentionally keeps it.

To remove only the synthetic learner data:

~~~powershell
npm run sample:cleanup -- --write --project=echoworks-e3b4d --confirm-project=echoworks-e3b4d
~~~

## 4. Deploy Firestore Rules and Indexes Without Firebase Login

The Firebase CLI can use the same Application Default Credential, so the broken browser login is not required:

~~~powershell
$env:GOOGLE_APPLICATION_CREDENTIALS='D:\FirebaseSecrets\echoworks-admin.json'
firebase deploy --only firestore --project echoworks-e3b4d
~~~

If Firebase reports insufficient IAM permission, use a project-owner credential or grant the service account permission to deploy Firestore rules and indexes.

Console fallback:

1. Open Firestore Database > Rules.
2. Replace the editor with the complete local firestore.rules file and publish it.
3. Open Firestore Database > Indexes.
4. Create the four collection indexes from firestore.indexes.json:
   - frameworkId ascending, updatedAt descending
   - frameworkId ascending, scenarioId ascending, updatedAt descending
   - frameworkId ascending, selectedRole ascending, updatedAt descending
   - frameworkId ascending, scenarioId ascending, selectedRole ascending, updatedAt descending
5. Wait until every index shows Enabled.

Keep the local rules and indexes as the source of truth. A later CLI deployment overwrites console rules.

## 5. Publish to GitHub Pages

1. Push this repository to GitHub and merge or push the release to main.
2. Open the repository Settings > Pages.
3. Under Build and deployment, choose GitHub Actions as the source.
4. Open Actions and wait for Deploy GitHub Pages to finish successfully.
5. Use the deployed URL shown by the workflow.

The workflow verifies the code and rules, builds the runtime-only public folder, and deploys that folder. It does not publish scripts, sample-data, service credentials, or development tests.

## 6. Authorize the GitHub Pages Domain

In Firebase console, open Authentication > Settings > Authorized domains and add only the host, for example:

~~~text
your-github-name.github.io
~~~

Do not include https:// or the repository path. Add a custom domain there too if one is configured later.

## 7. Confirm the Dashboard

1. Open the deployed website over HTTPS.
2. Sign in as liuguangxuan1230@gmail.com.
3. Sign out and back in once after rules/profile changes so Firebase refreshes the session.
4. The Dashboard item should appear in the main navigation.
5. Open admin.html and confirm the metrics, scenario distributions, drop-off, learner detail, and reflections render.
6. In Firestore, confirm the owner document ID is exactly the lowercase email address.

If access remains locked, check these in order:

- The signed-in email exactly matches liuguangxuan1230@gmail.com.
- dashboardAdminEmails/liuguangxuan1230@gmail.com exists with role owner.
- The latest firestore.rules are published to echoworks-e3b4d.
- The GitHub Pages host is in Authentication authorized domains.
- The page is opened from HTTPS, not file://.
- Sign out, hard refresh, then sign in again.

## Release Checklist

~~~powershell
npm run verify
npm run test:rules
npm run build
~~~

Then verify one disposable normal-user account can only see its own data, the owner can read the dashboard, a viewer added by the owner can read but cannot manage viewers, and the synthetic cleanup command removes only demo learners.
