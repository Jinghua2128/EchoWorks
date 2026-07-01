const scenes = {
  profile: {
    speaker: "Profile",
    focus: "sarah",
    text: `Name: Sarah Tan
Position: Marketing Executive
Age: 32

Performance:
128% KPI achieved
High-quality work

Strengths:
Proactive, dependable
Handles pressure well
Supports juniors

Development:
Dominates discussions
Dismisses ideas quickly
Peers hesitant to challenge`,
    next: "intro"
  },

  intro: {
    speaker: "Scene",
    text: `The time to give employee feedback has come. Sarah continues to exceed expectations in performance, but recent peer feedback suggests that her communication style may be affecting team collaboration. As a manager, you want Sarah to feel recognized for her achievements while also helping her understand the impact of her behavior on the team. How would you phrase your feedback?`,
    choices: [
      { text: "Balanced recognition and feedback", next: "A" },
      { text: "Praise, ignore issue", next: "B" },
      { text: "Direct criticism", next: "C" }
    ]
  },

  A: {
    speaker: "Manager",
    text: `Sarah, first of all, I want to acknowledge the great work you have done this quarter. Your results have been really strong, and the ownership you have shown across projects has made a big impact on the team. I also wanted to touch on some peer feedback that came up around team discussions. A few teammates shared that they sometimes find it difficult to contribute ideas in fast-paced conversations. I thought it would be useful for us to discuss this together because your impact on the team is really significant.`,
    next: "A_response"
  },

  B: {
    speaker: "Manager",
    text: `Hi Sarah, your performance this quarter has honestly been outstanding, and the results speak for themselves. I know there was some feedback around communication during discussions, but I do not think it takes away from the great work you have been doing.`,
    next: "B_response"
  },

  C: {
    speaker: "Manager",
    text: `Hi Sarah, your performance has been great overall, but I have received feedback that you can come across as intimidating in team discussions and that people sometimes feel uncomfortable sharing ideas around you.`,
    next: "C_response"
  },

  B_response: {
    speaker: "Sarah",
    mood: "happy",
    text: `Thanks, I appreciate that. I know I can be direct sometimes, but at the end of the day we have still been delivering strong results.`,
    next: "B_outcome"
  },

  B_outcome: {
    speaker: "Outcome",
    text: `The conversation ends positively, but the behavioral concern is never properly addressed. Sarah leaves believing the issue is minor because her performance outweighs the impact on the team.`,
    effect: "fail",
    next: "B_learn"
  },

  B_learn: {
    speaker: "Lesson",
    text: `You acknowledged Sarah's achievements but minimized the developmental feedback. Strong performance should not prevent you from objectively evaluating behaviors that affect team collaboration.`,
    next: "hr_fail"
  },

  C_response: {
    speaker: "Sarah",
    mood: "frustrated",
    text: `Intimidating? I am not trying to make anyone uncomfortable. I just expect people to speak up if they have something to say.`,
    next: "C_outcome"
  },

  C_outcome: {
    speaker: "Outcome",
    text: `Sarah becomes defensive and focuses on defending her intentions rather than reflecting on the feedback itself. This makes the conversation emotionally tense and less productive.`,
    effect: "fail",
    next: "C_learn"
  },

  C_learn: {
    speaker: "Lesson",
    text: `The feedback you chose relied on labels and interpretations instead of observable behaviors. Words like intimidating can feel personal and make employees defensive.`,
    next: "hr_fail"
  },

  A_response: {
    speaker: "Sarah",
    mood: "happy",
    text: `Thanks for bringing this up in that way. I was not fully aware the discussions were coming across like that, but I can see how it might affect the team. I would be open to working on it.`,
    next: "A_outcome"
  },

  A_outcome: {
    speaker: "Outcome",
    text: `Sarah feels recognized for her contributions while remaining open to constructive feedback about team collaboration.`,
    effect: "success",
    next: "hr_pass"
  },

  hr_fail: {
    speaker: "HR Mentor",
    text: `Giving feedback to high performers can be challenging. Managers often struggle to balance recognition with constructive evaluation, especially when results are strong.

The REAL framework can help structure more effective feedback conversations. In this scenario, we will focus on the first two pillars: Recognise and Evaluate.`,
    next: "teach_R"
  },

  hr_pass: {
    speaker: "HR Mentor",
    text: `Well done. Your response balanced recognition with objective evaluation, allowing the feedback conversation to remain constructive and productive. Let us take a closer look at the principles behind this approach.`,
    next: "teach_R"
  },

  teach_R: {
    speaker: "HR Mentor",
    text: `When giving feedback, managers should first recognise both strengths and improvement areas clearly.

This means shining a spotlight on observable actions, behaviors, or challenges using specific workplace examples. Instead of giving vague praise like good job, point to clear contributions so employees understand exactly what they are doing well and where they can improve.

Recognition creates trust and helps employees become more open to constructive conversations.`,
    next: "teach_E"
  },

  teach_E: {
    speaker: "HR Mentor",
    text: `After recognising contributions, managers need to objectively evaluate performance and behavior based on the assessment criteria Red Cross has provided.

Strong evaluation balances the scale through observable evidence instead of assumptions or personal interpretations. Managers should weigh contributions, behaviors, and outcomes carefully to distinguish employees who meet expectations from those who truly exceed them.

This helps feedback remain fair, constructive, and focused on growth rather than emotion or personal judgment.`,
    next: "revisit"
  },

  revisit: {
    speaker: "HR Mentor",
    text: `Now that you have learned how to apply Recognise and Evaluate, let us revisit the conversation with Sarah.`,
    next: "revisit1"
  },

  revisit1: {
    speaker: "Sarah",
    text: `I understand the feedback, but I also feel like being direct is part of why I am able to get strong results.`,
    choices: [
      { text: "Balanced feedback", next: "final_A" },
      { text: "Press the issue", next: "final_B" },
      { text: "Ignore the issue", next: "final_C" }
    ]
  },

  final_A: {
    speaker: "Manager",
    text: `I appreciate you sharing that perspective, and your strong results are definitely recognised. At the same time, part of leadership and collaboration is ensuring others also feel comfortable contributing ideas during discussions.`,
    next: "end"
  },

  final_B: {
    speaker: "Manager",
    text: `I understand, but the feedback has come from multiple team members, so this is something you will need to work on.`,
    next: "end"
  },

  final_C: {
    speaker: "Manager",
    text: `I see your point. Maybe the team just needs to adapt to different communication styles.`,
    next: "end"
  },

  end: {
    speaker: "HR Mentor",
    text: `You successfully applied Recognise and Evaluate to maintain both clarity and psychological safety in the conversation.`
  }
};

const sceneOrder = Object.keys(scenes);
const textSpeed = 16;
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const managerEl = document.getElementById("manager");
const sarahEl = document.getElementById("sarah");
const choicesEl = document.getElementById("choices");
const speakerNameEl = document.getElementById("speakerName");
const sceneCountEl = document.getElementById("sceneCount");
const textEl = document.getElementById("dialogueText");
const resultEl = document.getElementById("result");
const advanceButton = document.querySelector('[data-action="advance"]');

let currentSceneId = "profile";
let typingTimer = null;
let talkingTimer = null;
let pendingNext = null;
let fullText = "";
let typedIndex = 0;
let isTyping = false;

function clearTimers() {
  window.clearTimeout(typingTimer);
  window.clearInterval(talkingTimer);
  typingTimer = null;
  talkingTimer = null;
}

function speakerToCharacter(speaker, focus) {
  if (focus) return focus;
  if (speaker === "Sarah") return "sarah";
  if (speaker === "Manager") return "manager";
  return null;
}

function resetCharacter(element) {
  element.classList.remove("active", "inactive", "visible", "happy", "frustrated");
  element.src = element.dataset.idle;
}

function setCharacters(scene) {
  const activeCharacter = speakerToCharacter(scene.speaker, scene.focus);
  resetCharacter(managerEl);
  resetCharacter(sarahEl);

  if (activeCharacter === "manager") {
    managerEl.classList.add("visible", "active");
    sarahEl.classList.add("visible", "inactive");
  } else if (activeCharacter === "sarah") {
    sarahEl.classList.add("visible", "active");
    managerEl.classList.add("visible", "inactive");
  } else {
    managerEl.classList.add("visible", "inactive");
    sarahEl.classList.add("visible", "inactive");
  }

  if (scene.mood === "happy") document.getElementById(activeCharacter)?.classList.add("happy");
  if (scene.mood === "frustrated") document.getElementById(activeCharacter)?.classList.add("frustrated");
}

function getActiveCharacterElement() {
  if (managerEl.classList.contains("active")) return managerEl;
  if (sarahEl.classList.contains("active")) return sarahEl;
  return null;
}

function startTalking() {
  if (reducedMotion) return;
  const activeElement = getActiveCharacterElement();
  if (!activeElement) return;

  let talking = false;
  talkingTimer = window.setInterval(() => {
    talking = !talking;
    activeElement.src = talking ? activeElement.dataset.talk : activeElement.dataset.idle;
  }, 140);
}

function stopTalking() {
  window.clearInterval(talkingTimer);
  talkingTimer = null;
  [managerEl, sarahEl].forEach(element => {
    element.src = element.dataset.idle;
  });
}

function setText(value) {
  textEl.textContent = value;
}

function finishTyping() {
  window.clearTimeout(typingTimer);
  setText(fullText);
  isTyping = false;
  stopTalking();
  advanceButton.textContent = pendingNext ? "Continue" : "Restart";

  const scene = scenes[currentSceneId];
  if (scene.effect) showResult(scene.effect);
  if (scene.choices) renderChoices(scene.choices);
}

function typeText(text) {
  clearTimers();
  fullText = text;
  typedIndex = 0;
  isTyping = true;
  setText("");
  advanceButton.textContent = "Reveal text";
  startTalking();

  if (reducedMotion) {
    finishTyping();
    return;
  }

  function tick() {
    if (!isTyping) return;
    if (typedIndex >= fullText.length) {
      finishTyping();
      return;
    }

    typedIndex += 1;
    setText(fullText.slice(0, typedIndex));
    const previousCharacter = fullText[typedIndex - 1];
    typingTimer = window.setTimeout(tick, previousCharacter === "\n" ? 0 : textSpeed);
  }

  tick();
}

function renderChoices(choices) {
  choicesEl.textContent = "";
  choicesEl.hidden = false;

  choices.forEach(choice => {
    const button = document.createElement("button");
    button.className = "choice-button";
    button.type = "button";
    button.textContent = choice.text;
    button.addEventListener("click", () => renderScene(choice.next));
    choicesEl.append(button);
  });

  choicesEl.querySelector("button")?.focus({ preventScroll: true });
}

function hideChoices() {
  choicesEl.hidden = true;
  choicesEl.textContent = "";
}

function showResult(type) {
  resultEl.className = `result-toast ${type}`;
  resultEl.innerHTML = type === "success"
    ? "<strong>Good choice</strong><span>Sarah stays open to the feedback.</span>"
    : "<strong>Try another approach</strong><span>The conversation loses clarity.</span>";
  resultEl.hidden = false;

  window.setTimeout(() => {
    resultEl.hidden = true;
  }, 1800);
}

function renderScene(id) {
  const scene = scenes[id] || scenes.profile;
  currentSceneId = id;
  pendingNext = scene.next || null;
  hideChoices();
  resultEl.hidden = true;
  speakerNameEl.textContent = scene.speaker;

  const sceneIndex = sceneOrder.indexOf(id) + 1;
  sceneCountEl.textContent = sceneIndex > 0 ? `${sceneIndex} / ${sceneOrder.length}` : "";

  setCharacters(scene);
  typeText(scene.text);
}

function advanceScene() {
  if (isTyping) {
    finishTyping();
    return;
  }

  const scene = scenes[currentSceneId];
  if (scene?.choices) {
    choicesEl.querySelector("button")?.focus({ preventScroll: true });
    return;
  }

  if (pendingNext) {
    renderScene(pendingNext);
    return;
  }

  renderScene("profile");
}

function bindEvents() {
  advanceButton.addEventListener("click", advanceScene);

  document.querySelector('[data-action="restart"]').addEventListener("click", () => {
    renderScene("profile");
  });

  document.addEventListener("keydown", event => {
    const target = event.target;
    const isButton = target instanceof HTMLButtonElement || target instanceof HTMLAnchorElement;
    if (isButton) return;

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      advanceScene();
    }
  });
}

bindEvents();
renderScene(currentSceneId);


