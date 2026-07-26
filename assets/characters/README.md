# Character Model Assets

The scenario uses lightweight pre-rendered low-poly 3D frames based directly on the original manager and Sarah artwork. This keeps loading fast on phones while preserving the existing idle/speaking image swap.

## Replace A Model

The four active paths are defined in [character-models.js](character-models.js):

- manager.idle
- manager.talk
- employee.idle
- employee.talk

The current files are:

- manager-lowpoly-idle.webp
- manager-lowpoly-talk.webp
- sarah-lowpoly-idle.webp
- sarah-lowpoly-talk.webp

For the simplest replacement, overwrite those four WebP files with the same names and no code changes are needed. If the filenames change, edit only character-models.js.

Keep each asset as a transparent 1024 by 1536 WebP with one full-body character. Idle and talking frames must keep identical framing, pose, orientation, lighting, and geometry; only the mouth should change. Never mirror either character.
