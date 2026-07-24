# Browser Support

## Minimum supported versions

EchoWorks targets these minimum desktop browser versions:

- Google Chrome 120+
- Microsoft Edge 120+
- Mozilla Firefox 121+
- Apple Safari 17.4+

The core learning flow requires JavaScript, `localStorage`, ES modules, CSS Grid, and modern form APIs. Optional capabilities use feature detection and do not block the core flow.

## Progressive fallbacks

- Firebase failure: account actions report an unavailable state; guest learning and local progress continue.
- Web Audio failure: dialogue remains fully usable without sound.
- Reduced motion: transitions and smooth scrolling are disabled while content remains visible.
- Camera, MindAR, or `BarcodeDetector` failure: learners can choose every CARE or REAL card manually.
- Native `<dialog>` failure: progress deletion uses the browser confirmation fallback.

## AR requirements

Camera scanning requires HTTPS or localhost, camera permission, WebGL, and a compatible media device. Printed-card recognition must be tested on a physical phone because desktop emulation cannot prove camera focus, permission prompts, lighting tolerance, or target recognition.

## Verified in this audit

- Chrome 150.0.7871.184: automated release suite passed.
- Edge 150.0.4078.83: automated release suite passed.
- Firefox: not installed on this workstation; external verification remains required.
- Safari: unavailable on Windows; external macOS/iOS verification remains required.
- Automated reflow checks passed at 320px, 390px, short phone landscape, 768px, 1024px, 1440px, and CSS viewport equivalents of 200% and 400% zoom.

Before public release, run a manual keyboard and actual browser-zoom pass in each supported desktop browser, then test one physical Android device and one physical iOS device over HTTPS.
