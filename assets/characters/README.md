# Character Model Assets

The scenario currently uses lightweight pre-rendered 3D character frames. This keeps loading fast on phones while preserving the existing idle/speaking image swap.

## Replace A Model

The four active paths are defined in [character-models.js](character-models.js):

- manager.idle
- manager.talk
- employee.idle
- employee.talk

For the simplest replacement, overwrite the four WebP files with the same names and no code changes are needed. If the filenames change, edit only character-models.js.

Keep each asset as a transparent WebP with one full-body character, consistent framing between idle and talk frames, and no mirrored image. The speaking frame should keep the same identity, scale, lighting, and body placement so the swap does not jump.