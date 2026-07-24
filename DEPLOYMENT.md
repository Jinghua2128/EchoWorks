# Deployment

Detailed setup: [FIREBASE_GITHUB_PAGES.md](FIREBASE_GITHUB_PAGES.md) | [中文指南](FIREBASE_GITHUB_PAGES.zh-CN.md)

## Local verification

1. Run `npm ci`.
2. Run `npm run check` and `npm test`.
3. Run `npm run test:rules` to start the demo Firestore emulator and verify permissions without production data.
4. Start a local static server and run `npm run test:browser` on Windows with Chrome installed.
5. Run `npm run build`. The generated `public/` folder contains runtime files only.

## GitHub Pages

The workflow at `.github/workflows/pages.yml` tests the project, builds `public/`, and publishes that folder. In the GitHub repository, set Pages source to **GitHub Actions**. The Firebase API configuration is intentionally public client configuration; never commit service-account files, passwords, refresh tokens, or Firebase CLI login tokens.

GitHub Pages does not support custom response headers. The HTML CSP and referrer policy still apply there, but deploy to Firebase Hosting when `X-Frame-Options`, `Permissions-Policy`, and the other response headers are required.

## Firebase

The CLI is configured for project `echoworks-e3b4d`. Open a normal Windows PowerShell window and run the login from the project folder:

```powershell
Set-Location 'D:\Program Files\EchoWorks\echowrks_vn'
firebase login
firebase login:list
firebase projects:list
firebase use echoworks-e3b4d
```

If the browser cannot return to the CLI, run `firebase login --no-localhost` instead. Complete the new flow in the same terminal session and do not reuse an old authorisation code. Never share passwords or authorisation codes.

Run the verification suite before deployment:

```powershell
npm run verify
npm run test:rules
npm run build
```

For GitHub Pages, deploy only Firestore rules and indexes because the Pages workflow publishes the website:

```powershell
firebase deploy --only firestore
```

To publish the same build with Firebase Hosting as well, run:

```powershell
firebase deploy --only firestore,hosting
```

Firebase Hosting runs `npm run build` again before deployment. This repository has not deployed these changes yet. If CLI authentication remains unavailable, publish `firestore.rules` in **Firestore Database > Rules** and create the indexes listed in `firestore.indexes.json` under **Firestore Database > Indexes** in the Firebase console. An authorised project owner must perform either deployment method.

External console checks:

- Enable Email/Password in Firebase Authentication.
- Add the deployed Firebase and GitHub Pages hosts to Authentication authorised domains.
- Confirm `liuguangxuan1230@gmail.com` owns the bootstrap dashboard profile by signing in and opening `admin.html` once after the new rules are deployed.
- Use the owner dashboard to add read-only viewer emails.
- Review Firestore retention requirements and remove old records if the school project defines an expiry date.
- Restrict the public Firebase API key to the intended web origins and Firebase APIs where practical.

## Release-only checks

A project owner still needs to verify live sign-up, verification email delivery, password reset delivery, cloud merge, reflection save, dashboard owner/viewer access, and signed-in deletion against the deployed Firebase project. Test printed-card recognition on physical iOS and Android devices over HTTPS.