"use strict";

const DATA_PATH = "data/2022M1L05R.csv";
const LESSON_NUMBER = 5;
const MAX_PRACTICE_ROUNDS = 3;

let currentLesson = null;
let practiceState = null;

document.addEventListener("DOMContentLoaded", init);

async function init() {
  const app = getAppContainer();

  try {
    showLoading(app);

    const rows = await loadCSV(DATA_PATH);
    validateCSV(rows);

    const lesson = buildLessonData(rows);
    currentLesson = lesson;
    renderLessonMenu(app, lesson);
  } catch (error) {
    console.error(error);
    renderError(app, error);
  }
}


/* =========================================================
   APP CONTAINER
   ========================================================= */

function getAppContainer() {
  let app = document.getElementById("app");

  // index.html에 #app이 없어도 자동 생성
  if (!app) {
    app = document.createElement("main");
    app.id = "app";
    document.body.appendChild(app);
  }

  return app;
}


/* =========================================================
   CSV LOADING
   ========================================================= */

async function loadCSV(path) {
  const response = await fetch(path, {
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(
      `CSV 파일을 불러오지 못했습니다. (${response.status})`
    );
  }

  let text = await response.text();

  // UTF-8 BOM 제거
  text = text.replace(/^\uFEFF/, "");

  return parseCSV(text);
}


/*
  쉼표, 따옴표, 줄바꿈이 들어 있는 CSV도 처리하는 parser.
  예:
  "Finally, my dad said, “Please stop!”",...
*/
function parseCSV(text) {
  const table = [];

  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        // CSV 내부의 "" → 실제 "
        field += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }

    } else if (char === "," && !inQuotes) {
      row.push(field);
      field = "";

    } else if (
      (char === "\n" || char === "\r") &&
      !inQuotes
    ) {
      if (char === "\r" && next === "\n") {
        i++;
      }

      row.push(field);
      field = "";

      // 완전히 빈 줄은 제외
      if (row.some(cell => cell !== "")) {
        table.push(row);
      }

      row = [];

    } else {
      field += char;
    }
  }

  // 마지막 행
  if (field !== "" || row.length > 0) {
    row.push(field);

    if (row.some(cell => cell !== "")) {
      table.push(row);
    }
  }

  if (table.length < 2) {
    throw new Error("CSV에 데이터가 없습니다.");
  }

  const headers = table[0].map(header => header.trim());

  return table.slice(1).map(values => {
    const obj = {};

    headers.forEach((header, index) => {
      obj[header] = values[index] ?? "";
    });

    return obj;
  });
}


/* =========================================================
   CSV VALIDATION
   ========================================================= */

function validateCSV(rows) {
  const requiredColumns = [
    "id",
    "english",
    "korean",
    "korean_distractors",
    "error_choices",
    "phrase_distractors"
  ];

  if (!rows.length) {
    throw new Error("CSV에 읽을 데이터가 없습니다.");
  }

  const firstRow = rows[0];

  for (const column of requiredColumns) {
    if (!(column in firstRow)) {
      throw new Error(
        `필수 열이 없습니다: ${column}`
      );
    }
  }

  const ids = new Set();

  for (const row of rows) {
    const id = row.id.trim();

    if (!id) {
      throw new Error("ID가 없는 행이 있습니다.");
    }

    if (ids.has(id)) {
      throw new Error(
        `중복된 ID가 있습니다: ${id}`
      );
    }

    ids.add(id);
  }

  console.log(`CSV loaded: ${rows.length} rows`);
}


/* =========================================================
   LESSON DATA
   ========================================================= */

function buildLessonData(rows) {
  const titleRow = rows.find(row =>
    row.id.endsWith("0000")
  );

  const title = titleRow
    ? cleanEnglish(titleRow.english)
    : "Reading";

  const sentences = rows.filter(row =>
    isSentenceRow(row)
  );

  return {
    lessonNumber: LESSON_NUMBER,
    title,
    rows,
    sentences
  };
}


/*
  제목 0000, 날짜/소제목 xx00 등은
  일반 문제용 sentence에서 제외
*/
function isSentenceRow(row) {
  const id = row.id.trim();

  if (!/^\d{7}$/.test(id)) {
    return false;
  }

  const sentenceNumber = id.slice(-2);

  return sentenceNumber !== "00";
}


/* =========================================================
   ANNOTATION CLEANING
   ========================================================= */

/*
  CSV 내부 메타데이터:
    " / "    chunk boundary
    {...}    Find the Error candidate
    **...**  Random Blank exclusion

  학생에게 원문을 보여줄 때는 모두 제거한다.
*/
function cleanEnglish(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\{(.*?)\}/g, "$1")
    .replace(/ \/ /g, " ")
    .trim();
}


/* =========================================================
   LESSON MENU
   ========================================================= */

function renderLessonMenu(app, lesson) {
  app.innerHTML = "";

  const section = document.createElement("section");
  section.className = "lesson-menu";

  const heading = document.createElement("h1");
  heading.className = "lesson-heading";
  heading.textContent =
    `Lesson ${lesson.lessonNumber}. Reading`;

  const title = document.createElement("div");
  title.className = "reading-title";
  title.textContent = `<${lesson.title}>`;

  const buttons = document.createElement("div");
  buttons.className = "lesson-buttons";

  const practiceButton = createButton(
    "📖 Reading Practice",
    "practice-button"
  );

  const testButton = createButton(
    "Reading Test",
    "test-button"
  );

  practiceButton.addEventListener("click", () => {
  startReadingPractice(app, lesson);
});

  testButton.addEventListener("click", () => {
    console.log("Reading Test selected");

    // 다음 단계에서 구현
    alert("Reading Test — coming next!");
  });

  buttons.append(practiceButton, testButton);

  const info = document.createElement("p");
  info.className = "data-status";
  info.textContent =
    `${lesson.sentences.length} sentences loaded`;

  section.append(
    heading,
    title,
    buttons,
    info
  );

  app.appendChild(section);
}


function createButton(label, className) {
  const button = document.createElement("button");

  button.type = "button";
  button.className = className;
  button.textContent = label;

  return button;
}


/* =========================================================
   STATUS / ERROR
   ========================================================= */

function showLoading(app) {
  app.innerHTML = `
    <p class="loading">
      Loading reading data...
    </p>
  `;
}


function renderError(app, error) {
  app.innerHTML = "";

  const box = document.createElement("div");
  box.className = "error-message";

  const title = document.createElement("h2");
  title.textContent = "Unable to load Reading Trainer";

  const message = document.createElement("p");
  message.textContent = error.message;

  box.append(title, message);
  app.appendChild(box);
}
/* =========================================================
   READING PRACTICE
   ========================================================= */

function startReadingPractice(app, lesson) {
  const eligible = lesson.sentences.filter(row =>
    row.korean &&
    row.korean_distractors &&
    row.korean_distractors.split(";").filter(Boolean).length >= 3
  );

  if (!eligible.length) {
    renderError(
      app,
      new Error("Reading Practice에 사용할 문장이 없습니다.")
    );
    return;
  }

  practiceState = {
    round: 1,
    queue: shuffleArray([...eligible]),
    retryQueue: [],
    totalSentences: eligible.length,
    correctCount: 0,
    wrongCount: 0,
    answeredCount: 0,
    currentRow: null,
    locked: false
  };

  renderPracticeScreen(app);
  showNextPracticeQuestion(app);
}


/* =========================================================
   PRACTICE SCREEN
   ========================================================= */

function renderPracticeScreen(app) {
  app.innerHTML = `
    <section class="practice-screen">

      <div class="practice-topbar">
        <button
          type="button"
          class="back-button"
          id="practiceBackButton"
        >
          ← Lesson Menu
        </button>

        <div class="practice-progress" id="practiceProgress">
        </div>
      </div>

      <div class="practice-card">

        <div class="practice-label">
          Choose the correct meaning.
        </div>

        <div
          class="practice-english"
          id="practiceEnglish"
        ></div>

        <div
          class="practice-options"
          id="practiceOptions"
        ></div>

        <div
          class="practice-feedback"
          id="practiceFeedback"
        ></div>

      </div>

    </section>
  `;

  document
    .getElementById("practiceBackButton")
    .addEventListener("click", () => {
      practiceState = null;
      renderLessonMenu(app, currentLesson);
    });
}


/* =========================================================
   NEXT QUESTION
   ========================================================= */

function showNextPracticeQuestion(app) {
  if (!practiceState) return;

  if (practiceState.queue.length === 0) {
    handlePracticeRoundEnd(app);
    return;
  }

  const row = practiceState.queue.shift();

  practiceState.currentRow = row;
  practiceState.locked = false;

  const english = cleanEnglish(row.english);

  const distractors = row.korean_distractors
    .split(";")
    .map(item => item.trim())
    .filter(Boolean);

  const selectedDistractors =
    shuffleArray([...distractors]).slice(0, 3);

  const options = shuffleArray([
    {
      text: row.korean.trim(),
      correct: true
    },
    ...selectedDistractors.map(text => ({
      text,
      correct: false
    }))
  ]);

  document.getElementById("practiceEnglish").textContent =
    english;

  document.getElementById("practiceFeedback").textContent =
    "";

  renderPracticeOptions(app, options);

  updatePracticeProgress();
}


/* =========================================================
   OPTIONS
   ========================================================= */

function renderPracticeOptions(app, options) {
  const container =
    document.getElementById("practiceOptions");

  container.innerHTML = "";

  options.forEach(option => {
    const button = document.createElement("button");

    button.type = "button";
    button.className = "practice-option";
    button.textContent = option.text;

    button.addEventListener("click", () => {
      handlePracticeAnswer(
        app,
        button,
        option,
        options
      );
    });

    container.appendChild(button);
  });
}


/* =========================================================
   ANSWER
   ========================================================= */

function handlePracticeAnswer(
  app,
  clickedButton,
  selectedOption
) {
  if (!practiceState || practiceState.locked) {
    return;
  }

  practiceState.locked = true;
  practiceState.answeredCount++;

  const buttons = [
    ...document.querySelectorAll(".practice-option")
  ];

  if (selectedOption.correct) {
    practiceState.correctCount++;

    clickedButton.classList.add("correct");

    showPracticeFeedback("Correct!");

  } else {
    practiceState.wrongCount++;

    clickedButton.classList.add("wrong");

    const correctButton = buttons.find(
      button =>
        button.textContent.trim() ===
        practiceState.currentRow.korean.trim()
    );

    if (correctButton) {
      correctButton.classList.add("correct");
    }

    practiceState.retryQueue.push(
      practiceState.currentRow
    );

    showPracticeFeedback("Try this sentence again.");
  }

  buttons.forEach(button => {
    button.disabled = true;
  });

  updatePracticeProgress();

  setTimeout(() => {
    showNextPracticeQuestion(app);
  }, 900);
}


/* =========================================================
   FEEDBACK
   ========================================================= */

function showPracticeFeedback(message) {
  const feedback =
    document.getElementById("practiceFeedback");

  feedback.textContent = message;
}


/* =========================================================
   ROUND CONTROL
   ========================================================= */

function handlePracticeRoundEnd(app) {
  if (!practiceState) return;

  const hasRetries =
    practiceState.retryQueue.length > 0;

  const canContinue =
    practiceState.round < MAX_PRACTICE_ROUNDS;

  if (hasRetries && canContinue) {
    practiceState.round++;

    practiceState.queue =
      shuffleArray([
        ...practiceState.retryQueue
      ]);

    practiceState.retryQueue = [];

    showPracticeRoundMessage(app);
    return;
  }

  renderPracticeResult(app);
}


function showPracticeRoundMessage(app) {
  const card = document.querySelector(".practice-card");

  card.innerHTML = `
    <div class="round-message">
      <h2>Round ${practiceState.round}</h2>
      <p>
        Let's review the sentences you missed.
      </p>
    </div>
  `;

  updatePracticeProgress();

  setTimeout(() => {
    renderPracticeScreen(app);
    showNextPracticeQuestion(app);
  }, 1000);
}


/* =========================================================
   PROGRESS
   ========================================================= */

function updatePracticeProgress() {
  const progress =
    document.getElementById("practiceProgress");

  if (!progress || !practiceState) return;

  const remaining =
    practiceState.queue.length;

  progress.textContent =
    `Round ${practiceState.round} · ` +
    `${remaining} left`;
}


/* =========================================================
   RESULT
   ========================================================= */

function renderPracticeResult(app) {
  const unresolved =
    practiceState.retryQueue.length;

  const allMastered =
    unresolved === 0;

  app.innerHTML = `
    <section class="practice-result">

      <div class="result-card">

        <h1>
          ${allMastered
            ? "Practice Complete!"
            : "Practice Finished"}
        </h1>

        <p class="result-message">
          ${
            allMastered
              ? "You understood all the sentences."
              : `${unresolved} sentence${
                  unresolved === 1 ? "" : "s"
                } still need review.`
          }
        </p>

        <div class="result-stats">
          <div>
            <strong>${practiceState.correctCount}</strong>
            <span>Correct</span>
          </div>

          <div>
            <strong>${practiceState.wrongCount}</strong>
            <span>Wrong</span>
          </div>
        </div>

        <div class="result-buttons">
          <button
            type="button"
            id="practiceAgainButton"
          >
            🔄 Practice Again
          </button>

          <button
            type="button"
            id="practiceMenuButton"
          >
            ← Lesson Menu
          </button>
        </div>

      </div>

    </section>
  `;

  document
    .getElementById("practiceAgainButton")
    .addEventListener("click", () => {
      startReadingPractice(
        app,
        currentLesson
      );
    });

  document
    .getElementById("practiceMenuButton")
    .addEventListener("click", () => {
      practiceState = null;
      renderLessonMenu(
        app,
        currentLesson
      );
    });
}


/* =========================================================
   UTILITIES
   ========================================================= */

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j =
      Math.floor(Math.random() * (i + 1));

    [array[i], array[j]] =
      [array[j], array[i]];
  }

  return array;
}
