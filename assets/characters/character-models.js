const pose = (idle, talk) => Object.freeze({ idle, talk });

const model = (defaultPose, speakingPoses, poses) => Object.freeze({
  defaultPose,
  speakingPoses: Object.freeze(speakingPoses),
  poses: Object.freeze(poses)
});

const managerPose = pose(
  "assets/characters/manager-lowpoly-idle.webp",
  "assets/characters/manager-lowpoly-talk.webp"
);

const employeePose = pose(
  "assets/characters/sarah-lowpoly-idle.webp",
  "assets/characters/sarah-lowpoly-talk.webp"
);

// Semantic states stay available to scenario logic while the approved base
// pairs prevent generated pose variants from drifting between characters.
export const characterModels = Object.freeze({
  manager: model("neutral", ["explain", "reflect", "neutral"], {
    neutral: managerPose,
    explain: managerPose,
    reflect: managerPose
  }),
  employee: model("neutral", ["attentive", "confident", "neutral"], {
    neutral: employeePose,
    attentive: employeePose,
    confident: employeePose
  })
});
