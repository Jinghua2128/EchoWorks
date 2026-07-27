const pose = (idle, talk) => Object.freeze({ idle, talk });

const model = (defaultPose, speakingPoses, poses) => Object.freeze({
  defaultPose,
  speakingPoses: Object.freeze(speakingPoses),
  poses: Object.freeze(poses)
});

// Scenario code selects semantic pose names; file paths stay centralized here.
export const characterModels = Object.freeze({
  manager: model("neutral", ["explain", "reflect", "neutral"], {
    neutral: pose(
      "assets/characters/manager-lowpoly-idle.webp",
      "assets/characters/manager-lowpoly-talk.webp"
    ),
    explain: pose(
      "assets/characters/manager-lowpoly-explain-idle.webp",
      "assets/characters/manager-lowpoly-explain-talk.webp"
    ),
    reflect: pose(
      "assets/characters/manager-lowpoly-reflect-idle.webp",
      "assets/characters/manager-lowpoly-reflect-talk.webp"
    )
  }),
  employee: model("neutral", ["attentive", "confident", "neutral"], {
    neutral: pose(
      "assets/characters/sarah-lowpoly-idle.webp",
      "assets/characters/sarah-lowpoly-talk.webp"
    ),
    attentive: pose(
      "assets/characters/sarah-lowpoly-attentive-idle.webp",
      "assets/characters/sarah-lowpoly-attentive-talk.webp"
    ),
    confident: pose(
      "assets/characters/sarah-lowpoly-confident-idle.webp",
      "assets/characters/sarah-lowpoly-confident-talk.webp"
    )
  })
});
