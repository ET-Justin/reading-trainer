"use strict";


/* =========================================================
   CONFIG
   ========================================================= */

const URL_PARAMS =
  new URLSearchParams(
    window.location.search
  );

const GRADE_NUMBER =
  Number(
    URL_PARAMS.get("grade")
  ) || 1;

const LESSON_NUMBER =
  Number(
    URL_PARAMS.get("lesson")
  ) || 5;

const DATA_PATH =
  `data/2022M${GRADE_NUMBER}` +
  `L${String(LESSON_NUMBER).padStart(2, "0")}R.csv`;

const MAX_PRACTICE_ROUNDS = 3;


/*
  Practice:
  correct → 1 sec
  wrong   → 3 sec
*/

const CORRECT_FEEDBACK_MS = 1000;
const WRONG_FEEDBACK_MS = 3000;


/*
  Reading Test:
  20 questions
  20 seconds per question
*/

const TEST_QUESTION_COUNT = 20;
const TEST_TIME_LIMIT_MS = 20000;


const FEEDBACK_COLORS = {
  correct: "#237a45",
  wrong: "#8b2f2f"
};


const SOUND_PATHS = {
  correct: "sound/correct.mp3",
  wrong: "sound/wrong.mp3",
  victory: "sound/victory.mp3"
};


/* =========================================================
   GLOBAL STATE
   ========================================================= */

let currentLesson = null;


/* Practice */

let practiceState = null;

let practiceFeedbackTimer = null;
let roundIntroTimer = null;


/* Test */

let testState = null;

let testTimeoutTimer = null;
let testAnimationFrame = null;


/* =========================================================
   SOUND
   ========================================================= */

const sounds = {

  correct:
    new Audio(
      SOUND_PATHS.correct
    ),

  wrong:
    new Audio(
      SOUND_PATHS.wrong
    ),

  victory:
    new Audio(
      SOUND_PATHS.victory
    )
};


Object
  .values(sounds)
  .forEach(audio => {

    audio.preload =
      "auto";
  });


function playSound(name) {

  const audio =
    sounds[name];


  if (!audio) {
    return;
  }


  try {

    audio.pause();

    audio.currentTime =
      0;


    const promise =
      audio.play();


    if (
      promise !== undefined
    ) {

      promise.catch(
        () => {}
      );
    }

  } catch (error) {

    console.warn(
      `Sound error: ${name}`,
      error
    );
  }
}


/* =========================================================
   INITIALIZATION
   ========================================================= */

initializeReadingTrainer();


function initializeReadingTrainer() {

  const grade =
    Number(
      URL_PARAMS.get("grade")
    );

  const lesson =
    Number(
      URL_PARAMS.get("lesson")
    );


  /*
    Grade / Lesson 선택 전에는
    Reading Trainer 본체 실행 안 함
  */

  if (
    !grade ||
    !lesson
  ) {

    console.log(
      "Reading Trainer: waiting for grade and lesson selection."
    );

    return;
  }


  const app =
    document.getElementById(
      "app"
    );


  if (!app) {

    console.error(
      "Reading Trainer: #app element not found."
    );

    return;
  }


  app.classList.remove(
    "hidden"
  );


  init();
}


async function init() {

  const app =
    getAppContainer();


  try {

    showLoading(app);


    console.log(
      "Reading Trainer starting:",
      {
        grade:
          GRADE_NUMBER,

        lesson:
          LESSON_NUMBER,

        dataPath:
          DATA_PATH
      }
    );


    const rows =
      await loadCSV(
        DATA_PATH
      );


    validateCSV(
      rows
    );


    currentLesson =
      buildLessonData(
        rows
      );


    history.replaceState(
      {
        readingTrainer: true,
        route:
          getCurrentRoute()
      },
      "",
      window.location.href
    );


    window.addEventListener(
      "popstate",
      () => {

        renderCurrentRoute(
          app
        );
      }
    );


    renderCurrentRoute(
      app
    );

  } catch (error) {

    console.error(
      "Reading Trainer initialization failed:",
      error
    );


    renderError(
      app,
      error
    );
  }
}


/* =========================================================
   APP CONTAINER
   ========================================================= */

function getAppContainer() {

  let app =
    document.getElementById(
      "app"
    );


  if (!app) {

    app =
      document.createElement(
        "main"
      );

    app.id =
      "app";


    document.body.appendChild(
      app
    );
  }


  return app;
}


/* =========================================================
   ROUTING
   ========================================================= */

function getCurrentRoute() {

  return window
    .location
    .hash
    .replace(
      /^#/,
      ""
    )
    .trim()
    .toLowerCase();
}


function navigateTo(route) {

  clearPracticeTimers();
  clearTestTimers();


  const url =
    route
      ? `#${route}`
      : (
          window.location.pathname +
          window.location.search
        );


  history.pushState(
    {
      readingTrainer: true,
      route
    },
    "",
    url
  );


  renderCurrentRoute(
    document.getElementById(
      "app"
    )
  );
}


function renderCurrentRoute(app) {

  clearPracticeTimers();
  clearTestTimers();


  const route =
    getCurrentRoute();


  if (
    route === "practice"
  ) {

    startReadingPractice(
      app,
      currentLesson
    );

    return;
  }


  if (
    route === "test"
  ) {

    practiceState =
      null;


    renderTestStart(
      app,
      currentLesson
    );

    return;
  }


  practiceState =
    null;

  testState =
    null;


  renderLessonMenu(
    app,
    currentLesson
  );
}


function goBackToLessonMenu() {

  history.back();
}


/* =========================================================
   CSV LOADING
   ========================================================= */

async function loadCSV(path) {

  const response =
    await fetch(
      path,
      {
        cache:
          "no-store"
      }
    );


  if (!response.ok) {

    throw new Error(
      `CSV 파일을 불러오지 못했습니다. (${response.status})`
    );
  }


  let text =
    await response.text();


  text =
    text.replace(
      /^\uFEFF/,
      ""
    );


  return parseCSV(text);
}


/* =========================================================
   CSV PARSER
   ========================================================= */

function parseCSV(text) {

  const table =
    [];


  let row =
    [];

  let field =
    "";

  let inQuotes =
    false;


  for (
    let i = 0;
    i < text.length;
    i++
  ) {

    const char =
      text[i];

    const next =
      text[i + 1];


    if (
      char === '"'
    ) {

      if (
        inQuotes &&
        next === '"'
      ) {

        field +=
          '"';

        i++;

      } else {

        inQuotes =
          !inQuotes;
      }


      continue;
    }


    if (
      char === "," &&
      !inQuotes
    ) {

      row.push(
        field
      );

      field =
        "";

      continue;
    }


    if (
      (
        char === "\n" ||
        char === "\r"
      ) &&
      !inQuotes
    ) {

      if (
        char === "\r" &&
        next === "\n"
      ) {

        i++;
      }


      row.push(
        field
      );

      field =
        "";


      if (
        row.some(
          cell =>
            cell !== ""
        )
      ) {

        table.push(
          row
        );
      }


      row =
        [];

      continue;
    }


    field +=
      char;
  }


  if (
    field !== "" ||
    row.length > 0
  ) {

    row.push(
      field
    );


    if (
      row.some(
        cell =>
          cell !== ""
      )
    ) {

      table.push(
        row
      );
    }
  }


  if (
    table.length < 2
  ) {

    throw new Error(
      "CSV에 데이터가 없습니다."
    );
  }


  const headers =
    table[0].map(
      header =>
        header.trim()
    );


  return table
    .slice(1)
    .map(values => {

      const object =
        {};


      headers.forEach(
        (
          header,
          index
        ) => {

          object[header] =
            values[index] ??
            "";
        }
      );


      return object;
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

    throw new Error(
      "CSV에 읽을 데이터가 없습니다."
    );
  }


  const firstRow =
    rows[0];


  for (
    const column
    of requiredColumns
  ) {

    if (
      !(column in firstRow)
    ) {

      throw new Error(
        `필수 열이 없습니다: ${column}`
      );
    }
  }


  const ids =
    new Set();


  for (
    const row
    of rows
  ) {

    const id =
      row.id.trim();


    if (!id) {

      throw new Error(
        "ID가 없는 행이 있습니다."
      );
    }


    if (
      ids.has(id)
    ) {

      throw new Error(
        `중복된 ID가 있습니다: ${id}`
      );
    }


    ids.add(id);
  }
}


/* =========================================================
   LESSON DATA
   ========================================================= */

function buildLessonData(rows) {

  const titleRow =
    rows.find(
      row =>
        row.id.endsWith(
          "0000"
        )
    );


  const title =
    titleRow
      ? cleanEnglish(
          titleRow.english
        )
      : "Reading";


  const sentences =
    rows.filter(
      row =>
        isSentenceRow(
          row
        )
    );


  return {

    lessonNumber:
      LESSON_NUMBER,

    title,

    rows,

    sentences
  };
}


/* =========================================================
   SENTENCE ROW
   ========================================================= */

function isSentenceRow(row) {

  const id =
    row.id.trim();


  if (
    !/^\d{7}$/.test(id)
  ) {

    return false;
  }


  return (
    id.slice(-2) !==
    "00"
  );
}


/* =========================================================
   ANNOTATION CLEANING
   ========================================================= */

function cleanEnglish(text) {

  return String(text)
    .replace(
      /\*\*(.*?)\*\*/g,
      "$1"
    )
    .replace(
      /\{(.*?)\}/g,
      "$1"
    )
    .replace(
      / \/ /g,
      " "
    )
    .trim();
}


function cleanInlineMetadata(text) {

  return String(text)
    .replace(
      /\*\*(.*?)\*\*/g,
      "$1"
    )
    .replace(
      / \/ /g,
      " "
    );
}


/* =========================================================
   LESSON MENU
   ========================================================= */

function renderLessonMenu(
  app,
  lesson
) {

  app.innerHTML =
    "";


  const section =
    document.createElement(
      "section"
    );


  section.className =
    "lesson-menu";


  const heading =
    document.createElement(
      "h1"
    );


  heading.className =
    "lesson-heading";

  heading.textContent =
    `Lesson ${lesson.lessonNumber}. Reading`;


  const title =
    document.createElement(
      "div"
    );


  title.className =
    "reading-title";

  title.textContent =
    `<${lesson.title}>`;


  const buttons =
    document.createElement(
      "div"
    );


  buttons.className =
    "lesson-buttons";


  const practiceButton =
    createButton(
      "📖 Reading Practice",
      "practice-button"
    );


  const testButton =
    createButton(
      "📝 Reading Test",
      "test-button"
    );


  practiceButton.addEventListener(
    "click",
    () => {

      navigateTo(
        "practice"
      );
    }
  );


  testButton.addEventListener(
    "click",
    () => {

      navigateTo(
        "test"
      );
    }
  );


  buttons.append(
    practiceButton,
    testButton
  );


  const info =
    document.createElement(
      "p"
    );


  info.className =
    "data-status";

  info.textContent =
    `${lesson.sentences.length} sentences loaded`;


  section.append(
    heading,
    title,
    buttons,
    info
  );


  app.appendChild(
    section
  );
}


/* =========================================================
   BUTTON FACTORY
   ========================================================= */

function createButton(
  label,
  className
) {

  const button =
    document.createElement(
      "button"
    );


  button.type =
    "button";

  button.className =
    className;

  button.textContent =
    label;


  return button;
}


/* =========================================================
   COMMON FEEDBACK
   ========================================================= */

function showFeedback(
  element,
  message,
  type
) {

  if (!element) {
    return;
  }


  element.textContent =
    message;


  element.classList.remove(
    "feedback-correct",
    "feedback-wrong"
  );


  if (
    type === "correct"
  ) {

    element.classList.add(
      "feedback-correct"
    );

    element.style.color =
      FEEDBACK_COLORS.correct;

  } else {

    element.classList.add(
      "feedback-wrong"
    );

    element.style.color =
      FEEDBACK_COLORS.wrong;
  }
}


/* =========================================================
   =========================================================
   READING PRACTICE
   =========================================================
   ========================================================= */


/* =========================================================
   PRACTICE START
   ========================================================= */

function startReadingPractice(
  app,
  lesson
) {

  clearPracticeTimers();


  const eligible =
    lesson.sentences.filter(
      row =>
        cleanEnglish(
          row.english
        ) &&
        row.korean.trim()
    );


  if (!eligible.length) {

    renderError(
      app,
      new Error(
        "Reading Practice에 사용할 문장이 없습니다."
      )
    );

    return;
  }


  practiceState = {

    round:
      1,

    queue:
      shuffleArray([
        ...eligible
      ]),

    retryQueue:
      [],

    allSentences:
      [...eligible],

    totalSentences:
      eligible.length,

    roundTotal:
      eligible.length,

    roundAnswered:
      0,

    currentRow:
      null,

    currentType:
      null,

    correctCount:
      0,

    wrongCount:
      0,

    locked:
      false
  };


  showPracticeRoundIntro(
    app
  );
}


/* =========================================================
   PRACTICE ROUND INTRO
   ========================================================= */

function showPracticeRoundIntro(
  app
) {

  if (!practiceState) {
    return;
  }


  clearPracticeTimers();


  const round =
    practiceState.round;


  const total =
    practiceState.roundTotal;


  const purpose =
    round === 1
      ? "to learn"
      : "to review";


  app.innerHTML = `
    <section class="practice-round-intro">

      <div class="practice-card round-intro-card">

        <h1>
          Round ${round}
        </h1>

        <p class="round-total">
          Total ${total}
          sentence${total === 1 ? "" : "s"}
          ${purpose}.
        </p>

        <div
          class="round-countdown"
          id="roundCountdown"
        >
          3
        </div>

      </div>

    </section>
  `;


  const countdown =
    document.getElementById(
      "roundCountdown"
    );


  const sequence = [
    "3",
    "2",
    "1",
    "Start!"
  ];


  let index =
    0;


  function nextCount() {

    if (!practiceState) {
      return;
    }


    countdown.textContent =
      sequence[index];


    index++;


    if (
      index <
      sequence.length
    ) {

      roundIntroTimer =
        setTimeout(
          nextCount,
          1000
        );

    } else {

      roundIntroTimer =
        setTimeout(
          () => {

            if (!practiceState) {
              return;
            }


            renderPracticeScreen(
              app
            );


            showNextPracticeQuestion(
              app
            );

          },
          1000
        );
    }
  }


  nextCount();
}


/* =========================================================
   PRACTICE SCREEN
   ========================================================= */

function renderPracticeScreen(
  app
) {

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

        <div class="practice-progress-wrap">

          <div class="practice-progress-text">
            <span id="practiceRoundText"></span>
            <span id="practiceCountText"></span>
          </div>

          <div class="practice-progress-bar">

            <div
              class="practice-progress-fill"
              id="practiceProgressFill"
            ></div>

          </div>

        </div>

      </div>

      <div class="practice-card">

        <div
          class="practice-label"
          id="practiceLabel"
        ></div>

        <div
          class="practice-question"
          id="practiceQuestion"
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
    .getElementById(
      "practiceBackButton"
    )
    .addEventListener(
      "click",
      goBackToLessonMenu
    );


  updatePracticeProgress();
}


/* =========================================================
   PRACTICE NEXT QUESTION
   ========================================================= */

function showNextPracticeQuestion(
  app
) {

  if (!practiceState) {
    return;
  }


  if (
    practiceState.queue.length ===
    0
  ) {

    handlePracticeRoundEnd(
      app
    );

    return;
  }


  const row =
    practiceState.queue.shift();


  practiceState.currentRow =
    row;

  practiceState.locked =
    false;


  const type =
    choosePracticeQuestionType(
      row
    );


  practiceState.currentType =
    type;


  if (
    type ===
    "ENGLISH_TO_KOREAN"
  ) {

    renderEnglishToKoreanQuestion(
      app,
      row
    );

  } else {

    renderKoreanToEnglishQuestion(
      app,
      row
    );
  }


  updatePracticeProgress();
}


/* =========================================================
   PRACTICE TYPE
   ========================================================= */

function choosePracticeQuestionType(
  row
) {

  const koreanDistractors =
    splitSemicolon(
      row.korean_distractors
    );


  if (
    koreanDistractors.length >=
    3
  ) {

    return (
      Math.random() < 0.5
        ? "ENGLISH_TO_KOREAN"
        : "KOREAN_TO_ENGLISH"
    );
  }


  return "KOREAN_TO_ENGLISH";
}


/* =========================================================
   PRACTICE: ENGLISH → KOREAN
   ========================================================= */

function renderEnglishToKoreanQuestion(
  app,
  row
) {

  const label =
    document.getElementById(
      "practiceLabel"
    );


  const question =
    document.getElementById(
      "practiceQuestion"
    );


  label.textContent =
    "Choose the correct meaning.";


  question.textContent =
    cleanEnglish(
      row.english
    );


  const distractors =
    shuffleArray(
      splitSemicolon(
        row.korean_distractors
      )
    ).slice(
      0,
      3
    );


  const options =
    shuffleArray([
      {
        text:
          row.korean.trim(),

        correct:
          true
      },

      ...distractors.map(
        text => ({
          text,
          correct:
            false
        })
      )
    ]);


  renderPracticeOptions(
    app,
    options
  );
}


/* =========================================================
   PRACTICE: KOREAN → ENGLISH
   ========================================================= */

function renderKoreanToEnglishQuestion(
  app,
  row
) {

  const label =
    document.getElementById(
      "practiceLabel"
    );


  const question =
    document.getElementById(
      "practiceQuestion"
    );


  label.textContent =
    "Choose the correct English sentence.";


  question.textContent =
    row.korean.trim();


  const distractorRows =
    getEnglishDistractorRows(
      row,
      practiceState.allSentences,
      3
    );


  const options =
    shuffleArray([
      {
        text:
          cleanEnglish(
            row.english
          ),

        correct:
          true
      },

      ...distractorRows.map(
        distractorRow => ({
          text:
            cleanEnglish(
              distractorRow.english
            ),

          correct:
            false
        })
      )
    ]);


  renderPracticeOptions(
    app,
    options
  );
}


/* =========================================================
   PRACTICE ENGLISH DISTRACTORS
   ========================================================= */

function getEnglishDistractorRows(
  correctRow,
  allRows,
  count
) {

  const correctWordCount =
    countWords(
      cleanEnglish(
        correctRow.english
      )
    );


  const otherRows =
    allRows.filter(
      row =>
        row.id !==
        correctRow.id
    );


  const closeRows =
    otherRows.filter(
      row => {

        const candidateCount =
          countWords(
            cleanEnglish(
              row.english
            )
          );


        return (
          Math.abs(
            candidateCount -
            correctWordCount
          ) <= 5
        );
      }
    );


  const selected =
    shuffleArray([
      ...closeRows
    ]).slice(
      0,
      count
    );


  if (
    selected.length <
    count
  ) {

    const selectedIds =
      new Set(
        selected.map(
          row =>
            row.id
        )
      );


    const remaining =
      otherRows.filter(
        row =>
          !selectedIds.has(
            row.id
          )
      );


    selected.push(
      ...shuffleArray([
        ...remaining
      ]).slice(
        0,
        count -
        selected.length
      )
    );
  }


  return selected;
}


/* =========================================================
   PRACTICE OPTIONS
   ========================================================= */

function renderPracticeOptions(
  app,
  options
) {

  const container =
    document.getElementById(
      "practiceOptions"
    );


  const feedback =
    document.getElementById(
      "practiceFeedback"
    );


  container.innerHTML =
    "";

  feedback.textContent =
    "";


  options.forEach(
    option => {

      const button =
        document.createElement(
          "button"
        );


      button.type =
        "button";


      button.className =
        "practice-option";


      button.textContent =
        option.text;


      button.addEventListener(
        "click",
        () => {

          handlePracticeAnswer(
            app,
            button,
            option
          );
        }
      );


      container.appendChild(
        button
      );
    }
  );
}


/* =========================================================
   PRACTICE ANSWER
   ========================================================= */

function handlePracticeAnswer(
  app,
  clickedButton,
  selectedOption
) {

  if (
    !practiceState ||
    practiceState.locked
  ) {

    return;
  }


  practiceState.locked =
    true;


  practiceState.roundAnswered++;


  const buttons = [
    ...document.querySelectorAll(
      ".practice-option"
    )
  ];


  const feedback =
    document.getElementById(
      "practiceFeedback"
    );


  if (
    selectedOption.correct
  ) {

    practiceState.correctCount++;


    clickedButton.classList.add(
      "correct"
    );


    showFeedback(
      feedback,
      "Correct!",
      "correct"
    );


    playSound(
      "correct"
    );


    disableButtons(
      buttons
    );


    clickedButton.blur();


    updatePracticeProgress();


    practiceFeedbackTimer =
      setTimeout(
        () => {

          showNextPracticeQuestion(
            app
          );
        },
        CORRECT_FEEDBACK_MS
      );


    return;
  }


  practiceState.wrongCount++;


  clickedButton.classList.add(
    "wrong"
  );


  const correctText =
    practiceState.currentType ===
    "ENGLISH_TO_KOREAN"

      ? practiceState
          .currentRow
          .korean
          .trim()

      : cleanEnglish(
          practiceState
            .currentRow
            .english
        );


  const correctButton =
    buttons.find(
      button =>
        button
          .textContent
          .trim() ===
        correctText
    );


  if (correctButton) {

    correctButton.classList.add(
      "correct"
    );
  }


  practiceState.retryQueue.push(
    practiceState.currentRow
  );


  showFeedback(
    feedback,
    "Not quite.",
    "wrong"
  );


  playSound(
    "wrong"
  );


  disableButtons(
    buttons
  );


  clickedButton.blur();


  updatePracticeProgress();


  practiceFeedbackTimer =
    setTimeout(
      () => {

        showNextPracticeQuestion(
          app
        );
      },
      WRONG_FEEDBACK_MS
    );
}


/* =========================================================
   PRACTICE ROUND END
   ========================================================= */

function handlePracticeRoundEnd(
  app
) {

  if (!practiceState) {
    return;
  }


  const missedRows =
    practiceState.retryQueue;


  if (
    missedRows.length ===
    0
  ) {

    renderPracticeResult(
      app
    );

    return;
  }


  if (
    practiceState.round >=
    MAX_PRACTICE_ROUNDS
  ) {

    renderPracticeResult(
      app
    );

    return;
  }


  practiceState.round++;


  practiceState.queue =
    shuffleArray([
      ...missedRows
    ]);


  practiceState.roundTotal =
    practiceState.queue.length;


  practiceState.roundAnswered =
    0;


  practiceState.retryQueue =
    [];


  showPracticeRoundIntro(
    app
  );
}


/* =========================================================
   PRACTICE PROGRESS
   ========================================================= */

function updatePracticeProgress() {

  if (!practiceState) {
    return;
  }


  const roundText =
    document.getElementById(
      "practiceRoundText"
    );


  const countText =
    document.getElementById(
      "practiceCountText"
    );


  const fill =
    document.getElementById(
      "practiceProgressFill"
    );


  if (
    !roundText ||
    !countText ||
    !fill
  ) {

    return;
  }


  const completed =
    practiceState.roundAnswered;


  const total =
    practiceState.roundTotal;


  const percent =
    total > 0

      ? Math.min(
          (
            completed /
            total
          ) * 100,
          100
        )

      : 0;


  roundText.textContent =
    `Round ${practiceState.round}`;


  countText.textContent =
    `${completed} / ${total}`;


  fill.style.width =
    `${percent}%`;
}


/* =========================================================
   PRACTICE RESULT
   ========================================================= */

function renderPracticeResult(
  app
) {

  clearPracticeTimers();


  const unresolved =
    practiceState
      ? practiceState
          .retryQueue
          .length
      : 0;


  const allMastered =
    unresolved === 0;


  playSound(
    "victory"
  );


  app.innerHTML = `
    <section class="practice-result">

      <div class="result-card">

        <h1>
          ${
            allMastered
              ? "Practice Complete!"
              : "Practice Finished"
          }
        </h1>

        <p class="result-message">

          ${
            allMastered

              ? "You got all the sentences right."

              : `Review ${unresolved}
                 sentence${
                   unresolved === 1
                     ? ""
                     : "s"
                 }
                 and try again.`
          }

        </p>

        <div class="result-stats">

          <div>

            <strong>
              ${practiceState.correctCount}
            </strong>

            <span>
              Correct
            </span>

          </div>

          <div>

            <strong>
              ${practiceState.wrongCount}
            </strong>

            <span>
              Wrong
            </span>

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
    .getElementById(
      "practiceAgainButton"
    )
    .addEventListener(
      "click",
      () => {

        startReadingPractice(
          app,
          currentLesson
        );
      }
    );


  document
    .getElementById(
      "practiceMenuButton"
    )
    .addEventListener(
      "click",
      goBackToLessonMenu
    );
}


/* =========================================================
   PRACTICE TIMER CLEANUP
   ========================================================= */

function clearPracticeTimers() {

  if (
    practiceFeedbackTimer
  ) {

    clearTimeout(
      practiceFeedbackTimer
    );

    practiceFeedbackTimer =
      null;
  }


  if (
    roundIntroTimer
  ) {

    clearTimeout(
      roundIntroTimer
    );

    roundIntroTimer =
      null;
  }
}


/* =========================================================
   =========================================================
   READING TEST
   =========================================================
   ========================================================= */


/* =========================================================
   TEST START SCREEN
   ========================================================= */

function renderTestStart(
  app,
  lesson
) {

  testState =
    null;


  app.innerHTML = `
    <section class="test-start">

      <div class="test-start-card">

        <button
          type="button"
          class="back-button"
          id="testStartBackButton"
        >
          ← Lesson Menu
        </button>

        <h1>
          📝 Reading Test
        </h1>

        <div class="reading-title">
          &lt;${escapeHTML(lesson.title)}&gt;
        </div>

        <div class="test-instructions">

          <strong>
            20 Questions
          </strong>

          <p>
            20 seconds per question
          </p>

          <p>
            Answer as quickly and accurately as you can.
          </p>

        </div>

        <button
          type="button"
          class="test-start-button"
          id="testStartButton"
        >
          Start Test
        </button>

      </div>

    </section>
  `;


  document
    .getElementById(
      "testStartBackButton"
    )
    .addEventListener(
      "click",
      goBackToLessonMenu
    );


  document
    .getElementById(
      "testStartButton"
    )
    .addEventListener(
      "click",
      () => {

        startReadingTest(
          app,
          lesson
        );
      }
    );
}


/* =========================================================
   TEST START
   ========================================================= */

function startReadingTest(
  app,
  lesson
) {

  clearTestTimers();


  const questions =
    buildTestQuestions(
      lesson
    );


  if (
    questions.length <
    TEST_QUESTION_COUNT
  ) {

    renderError(
      app,
      new Error(
        `Reading Test 문항을 ${TEST_QUESTION_COUNT}개 만들 수 없습니다. 현재 ${questions.length}개입니다.`
      )
    );

    return;
  }


  testState = {

    questions,

    currentIndex:
      0,

    score:
      0,

    locked:
      false,

    reviewSentences:
      [],

    currentReveal:
      null
  };


  renderTestScreen(
    app
  );


  showNextTestQuestion(
    app
  );
}


/* =========================================================
   TEST QUESTION BANK
   ========================================================= */

function buildTestQuestions(
  lesson
) {

  const banks = {

    RANDOM_BLANK:
      buildRandomBlankBank(
        lesson
      ),

    SENTENCE_ORDERING:
      buildSentenceOrderingBank(
        lesson
      ),

    FIND_ERROR:
      buildFindErrorBank(
        lesson
      ),

    TEXT_SEQUENCE:
      buildTextSequenceBank(
        lesson
      ),

    MISSING_PHRASE:
      buildMissingPhraseBank(
        lesson
      )
  };


  const targetPerType =
    4;


  const selected =
    [];


  const usedIds =
    new Set();


  const usedQuestionKeys =
    new Set();


  const typeOrder = [
    "FIND_ERROR",
    "TEXT_SEQUENCE",
    "MISSING_PHRASE",
    "SENTENCE_ORDERING",
    "RANDOM_BLANK"
  ];


  /*
    우선 5유형 × 4문항
  */

  for (
    const type
    of typeOrder
  ) {

    for (
      let i = 0;
      i < targetPerType;
      i++
    ) {

      const candidate =
        chooseTestCandidate(
          banks[type],
          usedIds,
          usedQuestionKeys
        );


      if (!candidate) {
        break;
      }


      selected.push(
        candidate
      );


      usedQuestionKeys.add(
        candidate.key
      );


      candidate.ids.forEach(
        id =>
          usedIds.add(id)
      );
    }
  }


  /*
    부족한 유형이 있으면
    다른 유형에서 보충
  */

  while (
    selected.length <
    TEST_QUESTION_COUNT
  ) {

    let added =
      false;


    for (
      const type
      of typeOrder
    ) {

      const candidate =
        chooseTestCandidate(
          banks[type],
          usedIds,
          usedQuestionKeys
        );


      if (!candidate) {
        continue;
      }


      selected.push(
        candidate
      );


      usedQuestionKeys.add(
        candidate.key
      );


      candidate.ids.forEach(
        id =>
          usedIds.add(id)
      );


      added =
        true;


      if (
        selected.length >=
        TEST_QUESTION_COUNT
      ) {

        break;
      }
    }


    if (!added) {

      for (
        const type
        of typeOrder
      ) {

        const remaining =
          banks[type].filter(
            item =>
              !usedQuestionKeys.has(
                item.key
              )
          );


        if (!remaining.length) {
          continue;
        }


        const candidate =
          randomChoice(
            remaining
          );


        selected.push(
          candidate
        );


        usedQuestionKeys.add(
          candidate.key
        );


        added =
          true;


        if (
          selected.length >=
          TEST_QUESTION_COUNT
        ) {

          break;
        }
      }
    }


    if (!added) {
      break;
    }
  }


  return shuffleArray(
    selected.slice(
      0,
      TEST_QUESTION_COUNT
    )
  );
}


/* =========================================================
   TEST CANDIDATE SELECTION
   ========================================================= */

function chooseTestCandidate(
  bank,
  usedIds,
  usedKeys
) {

  const available =
    bank.filter(
      item =>
        !usedKeys.has(
          item.key
        )
    );


  if (!available.length) {

    return null;
  }


  const fresh =
    available.filter(
      item =>
        item.ids.every(
          id =>
            !usedIds.has(id)
        )
    );


  if (fresh.length) {

    return randomChoice(
      fresh
    );
  }


  return randomChoice(
    available
  );
}


/* =========================================================
   RANDOM BLANK BANK
   ========================================================= */

function buildRandomBlankBank(
  lesson
) {

  return lesson.sentences

    .filter(
      row =>
        getBlankCandidates(
          row.english
        ).length > 0 &&
        row.korean.trim()
    )

    .map(
      row => ({
        type:
          "RANDOM_BLANK",

        key:
          `blank-${row.id}`,

        ids:
          [row.id],

        row
      })
    );
}


/* =========================================================
   SENTENCE ORDERING BANK
   ========================================================= */

function buildSentenceOrderingBank(
  lesson
) {

  return lesson.sentences

    .filter(
      row => {

        const chunks =
          getChunks(
            row.english
          );


        return (
          chunks.length >= 2 &&
          row.korean.trim()
        );
      }
    )

    .map(
      row => ({
        type:
          "SENTENCE_ORDERING",

        key:
          `ordering-${row.id}`,

        ids:
          [row.id],

        row
      })
    );
}


/* =========================================================
   FIND ERROR BANK
   ========================================================= */

function buildFindErrorBank(
  lesson
) {

  return lesson.sentences

    .filter(
      row => {

        const spans =
          extractErrorSpans(
            row.english
          );


        const choices =
          splitSemicolon(
            row.error_choices
          );


        return (
          spans.length === 4 &&
          choices.length === 4
        );
      }
    )

    .map(
      row => ({
        type:
          "FIND_ERROR",

        key:
          `error-${row.id}`,

        ids:
          [row.id],

        row
      })
    );
}


/* =========================================================
   MISSING PHRASE BANK
   ========================================================= */

function buildMissingPhraseBank(
  lesson
) {

  return lesson.sentences

    .filter(
      row =>
        Boolean(
          parsePhraseData(
            row
          )
        )
    )

    .map(
      row => ({
        type:
          "MISSING_PHRASE",

        key:
          `phrase-${row.id}`,

        ids:
          [row.id],

        row
      })
    );
}


/* =========================================================
   TEXT SEQUENCE BANK
   ========================================================= */

function buildTextSequenceBank(
  lesson
) {

  const groups =
    new Map();


  lesson.sentences.forEach(
    row => {

      const paragraphKey =
        row.id.slice(
          0,
          5
        );


      if (
        !groups.has(
          paragraphKey
        )
      ) {

        groups.set(
          paragraphKey,
          []
        );
      }


      groups
        .get(
          paragraphKey
        )
        .push(
          row
        );
    }
  );


  const windows =
    [];


  groups.forEach(
    (
      rows,
      paragraphKey
    ) => {

      const sorted =
        [...rows].sort(
          (
            a,
            b
          ) =>
            Number(
              a.id.slice(-2)
            ) -
            Number(
              b.id.slice(-2)
            )
        );


      for (
        let i = 0;
        i <=
        sorted.length - 4;
        i++
      ) {

        const group =
          sorted.slice(
            i,
            i + 4
          );


        const numbers =
          group.map(
            row =>
              Number(
                row.id.slice(-2)
              )
          );


        const consecutive =
          numbers.every(
            (
              number,
              index
            ) => {

              if (
                index === 0
              ) {

                return true;
              }


              return (
                number ===
                numbers[0] +
                index
              );
            }
          );


        if (!consecutive) {

          continue;
        }


        windows.push({

          type:
            "TEXT_SEQUENCE",

          key:
            `sequence-${
              group
                .map(
                  row => row.id
                )
                .join("-")
            }`,

          ids:
            group.map(
              row => row.id
            ),

          rows:
            group,

          paragraphKey
        });
      }
    }
  );


  return windows;
}


/* =========================================================
   TEST SCREEN
   ========================================================= */

function renderTestScreen(
  app
) {

  app.innerHTML = `
    <section class="test-screen">

      <div class="test-topbar">

        <button
          type="button"
          class="back-button"
          id="testBackButton"
        >
          ← Lesson Menu
        </button>

        <div class="test-progress-wrap">

          <div class="test-progress-text">

            <span>
              Reading Test
            </span>

            <span
              id="testQuestionNumber"
            ></span>

          </div>

          <div class="test-time-bar">

            <div
              class="test-time-fill"
              id="testTimeFill"
            ></div>

          </div>

        </div>

      </div>

      <div class="test-card">

        <div
          class="test-type-label"
          id="testTypeLabel"
        ></div>

        <div
          class="test-korean"
          id="testKorean"
        ></div>

        <div
          class="test-question"
          id="testQuestion"
        ></div>

        <div
          class="test-answer-area"
          id="testAnswerArea"
        ></div>

        <div
          class="test-feedback"
          id="testFeedback"
        ></div>

        <button
          type="button"
          class="test-next-button hidden"
          id="testNextButton"
        >
          Next →
        </button>

      </div>

    </section>
  `;


  document
    .getElementById(
      "testBackButton"
    )
    .addEventListener(
      "click",
      goBackToLessonMenu
    );


  document
    .getElementById(
      "testNextButton"
    )
    .addEventListener(
      "click",
      () => {

        advanceTestQuestion(
          app
        );
      }
    );
}


/* =========================================================
   NEXT TEST QUESTION
   ========================================================= */

function showNextTestQuestion(
  app
) {

  if (!testState) {
    return;
  }


  clearTestTimers();


  if (
    testState.currentIndex >=
    testState.questions.length
  ) {

    renderTestResult(
      app
    );

    return;
  }


  testState.locked =
    false;


  testState.currentReveal =
    null;


  const item =
    testState.questions[
      testState.currentIndex
    ];


  updateTestQuestionNumber();


  clearTestQuestionArea();


  switch (
    item.type
  ) {

    case "RANDOM_BLANK":

      renderRandomBlankTest(
        app,
        item
      );

      break;


    case "SENTENCE_ORDERING":

      renderSentenceOrderingTest(
        app,
        item
      );

      break;


    case "FIND_ERROR":

      renderFindErrorTest(
        app,
        item
      );

      break;


    case "TEXT_SEQUENCE":

      renderTextSequenceTest(
        app,
        item
      );

      break;


    case "MISSING_PHRASE":

      renderMissingPhraseTest(
        app,
        item
      );

      break;
  }


  startTestTimer(
    app
  );
}


/* =========================================================
   TEST HEADER
   ========================================================= */

function updateTestQuestionNumber() {

  const element =
    document.getElementById(
      "testQuestionNumber"
    );


  if (!element) {
    return;
  }


  element.textContent =
    `${testState.currentIndex + 1} / ${testState.questions.length}`;
}


/* =========================================================
   CLEAR TEST QUESTION
   ========================================================= */

function clearTestQuestionArea() {

  const label =
    document.getElementById(
      "testTypeLabel"
    );


  const korean =
    document.getElementById(
      "testKorean"
    );


  const question =
    document.getElementById(
      "testQuestion"
    );


  const answer =
    document.getElementById(
      "testAnswerArea"
    );


  const feedback =
    document.getElementById(
      "testFeedback"
    );


  const nextButton =
    document.getElementById(
      "testNextButton"
    );


  label.textContent =
    "";

  korean.textContent =
    "";

  question.innerHTML =
    "";

  answer.innerHTML =
    "";

  feedback.textContent =
    "";

  feedback.style.color =
    "";


  feedback.classList.remove(
    "feedback-correct",
    "feedback-wrong",
    "try-again"
  );


  if (nextButton) {

    nextButton.classList.add(
      "hidden"
    );
  }
}


/* =========================================================
   TEST TIMER
   ========================================================= */

function startTestTimer(
  app
) {

  const fill =
    document.getElementById(
      "testTimeFill"
    );


  if (!fill) {
    return;
  }


  fill.style.width =
    "100%";


  const start =
    performance.now();


  function animate(now) {

    if (
      !testState ||
      testState.locked
    ) {

      return;
    }


    const elapsed =
      now - start;


    const remaining =
      Math.max(
        0,
        1 -
        (
          elapsed /
          TEST_TIME_LIMIT_MS
        )
      );


    fill.style.width =
      `${remaining * 100}%`;


    if (
      remaining > 0
    ) {

      testAnimationFrame =
        requestAnimationFrame(
          animate
        );
    }
  }


  testAnimationFrame =
    requestAnimationFrame(
      animate
    );


  testTimeoutTimer =
    setTimeout(
      () => {

        handleTestTimeout(
          app
        );
      },
      TEST_TIME_LIMIT_MS
    );
}


/* =========================================================
   CLEAR TEST TIMERS
   ========================================================= */

function clearTestTimers() {

  if (
    testTimeoutTimer
  ) {

    clearTimeout(
      testTimeoutTimer
    );

    testTimeoutTimer =
      null;
  }


  if (
    testAnimationFrame
  ) {

    cancelAnimationFrame(
      testAnimationFrame
    );

    testAnimationFrame =
      null;
  }
}


/* =========================================================
   TEST FINAL ANSWER
   ========================================================= */

/*
  Test에서는 자동으로 다음 문제로 가지 않는다.

  정답 / 오답 확정
  →
  timer stop
  →
  정답 공개
  →
  Next 버튼
*/

function submitTestAnswer(
  app,
  isCorrect,
  reveal
) {

  if (
    !testState ||
    testState.locked
  ) {

    return;
  }


  testState.locked =
    true;


  clearTestTimers();


  if (
    typeof reveal ===
    "function"
  ) {

    reveal(
      isCorrect
        ? "correct"
        : "wrong"
    );
  }


  const feedback =
    document.getElementById(
      "testFeedback"
    );


  if (
    isCorrect
  ) {

    testState.score++;


    showFeedback(
      feedback,
      "Correct!",
      "correct"
    );


    playSound(
      "correct"
    );

  } else {

    addCurrentQuestionToReview();


    showFeedback(
      feedback,
      "Not quite.",
      "wrong"
    );


    playSound(
      "wrong"
    );
  }


  showTestNextButton();
}


/* =========================================================
   TEST TIMEOUT
   ========================================================= */

function handleTestTimeout(
  app
) {

  if (
    !testState ||
    testState.locked
  ) {

    return;
  }


  testState.locked =
    true;


  clearTestTimers();


  if (
    typeof
      testState.currentReveal ===
      "function"
  ) {

    testState.currentReveal(
      "timeout"
    );
  }


  addCurrentQuestionToReview();


  const feedback =
    document.getElementById(
      "testFeedback"
    );


  showFeedback(
    feedback,
    "Time's up!",
    "wrong"
  );


  playSound(
    "wrong"
  );


  showTestNextButton();
}


/* =========================================================
   TEST NEXT BUTTON
   ========================================================= */

function showTestNextButton() {

  const button =
    document.getElementById(
      "testNextButton"
    );


  if (!button) {
    return;
  }


  button.classList.remove(
    "hidden"
  );


  /*
    마지막 문제에서는
    버튼 문구를 Result로
  */

  if (
    testState &&
    testState.currentIndex ===
    testState.questions.length - 1
  ) {

    button.textContent =
      "See Result →";

  } else {

    button.textContent =
      "Next →";
  }
}


/* =========================================================
   ADVANCE TEST
   ========================================================= */

function advanceTestQuestion(
  app
) {

  if (!testState) {
    return;
  }


  testState.currentIndex++;


  showNextTestQuestion(
    app
  );
}


/* =========================================================
   REVIEW SENTENCES
   ========================================================= */

function addCurrentQuestionToReview() {

  if (!testState) {
    return;
  }


  const item =
    testState.questions[
      testState.currentIndex
    ];


  if (!item) {
    return;
  }


  /*
    Text Sequence는 한 문제에
    4개 문장이 포함됨
  */

  if (
    item.type ===
    "TEXT_SEQUENCE"
  ) {

    item.rows.forEach(
      row => {

        addReviewSentence(
          cleanEnglish(
            row.english
          )
        );
      }
    );


    return;
  }


  if (item.row) {

    addReviewSentence(
      cleanEnglish(
        item.row.english
      )
    );
  }
}


function addReviewSentence(
  sentence
) {

  if (!sentence) {
    return;
  }


  if (
    testState
      .reviewSentences
      .includes(
        sentence
      )
  ) {

    return;
  }


  testState
    .reviewSentences
    .push(
      sentence
    );
}


/* =========================================================
   =========================================================
   TEST TYPE 1
   RANDOM BLANK
   =========================================================
   ========================================================= */

function getBlankCandidates(
  raw
) {

  const excludedRanges =
    [];


  const exclusionRegex =
    /\*\*(.*?)\*\*/g;


  let exclusionMatch;


  while (
    (
      exclusionMatch =
        exclusionRegex.exec(
          raw
        )
    ) !== null
  ) {

    excludedRanges.push({

      start:
        exclusionMatch.index,

      end:
        exclusionMatch.index +
        exclusionMatch[0].length
    });
  }


  const candidates =
    [];


  const wordRegex =
    /[A-Za-z]{4,}/g;


  let match;


  while (
    (
      match =
        wordRegex.exec(
          raw
        )
    ) !== null
  ) {

    const start =
      match.index;


    const insideExcluded =
      excludedRanges.some(
        range =>
          start >=
            range.start &&
          start <
            range.end
      );


    if (
      insideExcluded
    ) {

      continue;
    }


    candidates.push({

      word:
        match[0],

      start:
        match.index,

      end:
        match.index +
        match[0].length
    });
  }


  return candidates;
}


function renderRandomBlankTest(
  app,
  item
) {

  const row =
    item.row;


  const candidates =
    getBlankCandidates(
      row.english
    );


  const target =
    randomChoice(
      candidates
    );


  const rawWithBlank =
    row.english.slice(
      0,
      target.start
    ) +
    "_____" +
    row.english.slice(
      target.end
    );


  document
    .getElementById(
      "testTypeLabel"
    )
    .textContent =
      "Random Blank";


  /*
    한국어 뜻 표시
  */

  document
    .getElementById(
      "testKorean"
    )
    .textContent =
      row.korean.trim();


  document
    .getElementById(
      "testQuestion"
    )
    .textContent =
      cleanEnglish(
        rawWithBlank
      );


  const area =
    document.getElementById(
      "testAnswerArea"
    );


  area.innerHTML = `
    <form
      class="blank-form"
      id="blankForm"
    >

      <input
        type="text"
        class="blank-input"
        id="blankInput"
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
        placeholder="Type the missing word"
      >

      <button
        type="submit"
        class="test-submit-button"
        id="blankAnswerButton"
      >
        Answer
      </button>

    </form>

    <div
      class="test-correct-answer"
      id="blankCorrectAnswer"
    ></div>
  `;


  const input =
    document.getElementById(
      "blankInput"
    );


  const form =
    document.getElementById(
      "blankForm"
    );


  const answerButton =
    document.getElementById(
      "blankAnswerButton"
    );


  const correctAnswer =
    document.getElementById(
      "blankCorrectAnswer"
    );


  function reveal() {

    input.disabled =
      true;


    answerButton.disabled =
      true;


    correctAnswer.innerHTML = `
      <div>
        Answer:
        <strong>
          ${escapeHTML(target.word)}
        </strong>
      </div>
    `;
  }


  testState.currentReveal =
    reveal;


  form.addEventListener(
    "submit",
    event => {

      event.preventDefault();


      if (
        testState.locked
      ) {

        return;
      }


      const answer =
        input.value
          .trim()
          .toLowerCase();


      if (!answer) {
        return;
      }


      const isCorrect =
        answer ===
        target.word.toLowerCase();


      submitTestAnswer(
        app,
        isCorrect,
        reveal
      );
    }
  );


  setTimeout(
    () => {

      if (
        !testState.locked
      ) {

        input.focus();
      }
    },
    0
  );
}


/* =========================================================
   =========================================================
   TEST TYPE 2
   SENTENCE ORDERING
   =========================================================
   ========================================================= */

function getChunks(
  raw
) {

  return String(raw)
    .split(
      " / "
    )
    .map(
      chunk =>
        cleanEnglish(
          chunk
        )
    )
    .filter(
      Boolean
    );
}


/* =========================================================
   SENTENCE ORDERING
   ========================================================= */

/*
  위:
  [ 1 ] [ 2 ] [ 3 ] [ 4 ]

  아래:
  shuffled chunks

  - drag & drop 가능
  - 모바일에서는 tap으로
    다음 빈칸에 자동 배치
  - slot의 chunk를 다시 누르면
    아래 선택지로 돌아감
*/

function renderSentenceOrderingTest(
  app,
  item
) {

  const row =
    item.row;


  const chunks =
    getChunks(
      row.english
    );


  const chunkItems =
    chunks.map(
      (
        text,
        index
      ) => ({

        id:
          `chunk-${index}`,

        text,

        originalIndex:
          index
      })
    );


  const shuffled =
    shuffleArray([
      ...chunkItems
    ]);


  /*
    각 slot에는 chunk object 또는 null
  */

  let slots =
    Array(
      chunks.length
    ).fill(
      null
    );


  document
    .getElementById(
      "testTypeLabel"
    )
    .textContent =
      "Sentence Ordering";


  document
    .getElementById(
      "testKorean"
    )
    .textContent =
      row.korean.trim();


  document
    .getElementById(
      "testQuestion"
    )
    .textContent =
      "Put the chunks in the correct order.";


  const area =
    document.getElementById(
      "testAnswerArea"
    );


  area.innerHTML = `
    <div
      class="ordering-slots"
      id="orderingSlots"
    ></div>

    <div
      class="ordering-options"
      id="orderingOptions"
    ></div>

    <div
      class="test-correct-answer"
      id="orderingCorrectAnswer"
    ></div>
  `;


  const slotsArea =
    document.getElementById(
      "orderingSlots"
    );


  const optionsArea =
    document.getElementById(
      "orderingOptions"
    );


  const correctAnswer =
    document.getElementById(
      "orderingCorrectAnswer"
    );


  function getPlacedIds() {

    return new Set(
      slots
        .filter(Boolean)
        .map(
          chunk =>
            chunk.id
        )
    );
  }


  function placeChunk(
    chunk,
    slotIndex
  ) {

    if (
      testState.locked
    ) {

      return;
    }


    /*
      같은 chunk가 다른 slot에 있으면 제거
    */

    slots =
      slots.map(
        existing =>
          existing &&
          existing.id ===
            chunk.id

            ? null
            : existing
      );


    /*
      target slot에 있던 chunk는
      자동으로 아래 pool로 돌아감
    */

    slots[
      slotIndex
    ] =
      chunk;


    renderOrdering();


    checkOrderingComplete();
  }


  function placeInNextEmptySlot(
    chunk
  ) {

    const emptyIndex =
      slots.findIndex(
        slot =>
          slot === null
      );


    if (
      emptyIndex === -1
    ) {

      return;
    }


    placeChunk(
      chunk,
      emptyIndex
    );
  }


  function removeFromSlot(
    index
  ) {

    if (
      testState.locked
    ) {

      return;
    }


    slots[index] =
      null;


    renderOrdering();
  }


  function renderOrdering() {

    slotsArea.innerHTML =
      "";

    optionsArea.innerHTML =
      "";


    /*
      SLOT
    */

    slots.forEach(
      (
        chunk,
        index
      ) => {

        const slot =
          document.createElement(
            "div"
          );


        slot.className =
          "ordering-slot";


        slot.dataset.index =
          String(index);


        slot.addEventListener(
          "dragover",
          event => {

            if (
              testState.locked
            ) {

              return;
            }


            event.preventDefault();


            slot.classList.add(
              "drag-over"
            );
          }
        );


        slot.addEventListener(
          "dragleave",
          () => {

            slot.classList.remove(
              "drag-over"
            );
          }
        );


        slot.addEventListener(
          "drop",
          event => {

            if (
              testState.locked
            ) {

              return;
            }


            event.preventDefault();


            slot.classList.remove(
              "drag-over"
            );


            const chunkId =
              event
                .dataTransfer
                .getData(
                  "text/plain"
                );


            const dragged =
              chunkItems.find(
                item =>
                  item.id ===
                  chunkId
              );


            if (dragged) {

              placeChunk(
                dragged,
                index
              );
            }
          }
        );


        if (!chunk) {

          const number =
            document.createElement(
              "span"
            );


          number.className =
            "ordering-slot-number";


          number.textContent =
            String(
              index + 1
            );


          slot.appendChild(
            number
          );

        } else {

          slot.classList.add(
            "filled"
          );


          const button =
            document.createElement(
              "button"
            );


          button.type =
            "button";


          button.className =
            "ordering-slot-chunk";


          button.textContent =
            chunk.text;


          button.draggable =
            true;


          button.addEventListener(
            "dragstart",
            event => {

              event
                .dataTransfer
                .setData(
                  "text/plain",
                  chunk.id
                );
            }
          );


          /*
            누르면 slot에서 제거
          */

          button.addEventListener(
            "click",
            () => {

              removeFromSlot(
                index
              );
            }
          );


          slot.appendChild(
            button
          );
        }


        slotsArea.appendChild(
          slot
        );
      }
    );


    /*
      아직 사용하지 않은 chunk만
      아래 선택지에 표시
    */

    const placedIds =
      getPlacedIds();


    shuffled.forEach(
      chunk => {

        if (
          placedIds.has(
            chunk.id
          )
        ) {

          return;
        }


        const button =
          document.createElement(
            "button"
          );


        button.type =
          "button";


        button.className =
          "test-option ordering-chunk";


        button.textContent =
          chunk.text;


        button.draggable =
          true;


        button.addEventListener(
          "dragstart",
          event => {

            event
              .dataTransfer
              .setData(
                "text/plain",
                chunk.id
              );
          }
        );


        /*
          모바일 / 태블릿:
          누르면 다음 빈 slot으로
        */

        button.addEventListener(
          "click",
          () => {

            placeInNextEmptySlot(
              chunk
            );
          }
        );


        optionsArea.appendChild(
          button
        );
      }
    );
  }


  function checkOrderingComplete() {

    const complete =
      slots.every(
        Boolean
      );


    if (!complete) {
      return;
    }


    const isCorrect =
      slots.every(
        (
          chunk,
          index
        ) =>
          chunk.originalIndex ===
          index
      );


    submitTestAnswer(
      app,
      isCorrect,
      reveal
    );
  }


  function reveal() {

    /*
      정답 순서로 slot 재배치
    */

    slots =
      [...chunkItems];


    renderOrdering();


    correctAnswer.textContent =
      `Answer: ${chunks.join(" ")}`;


    disableElements(
      slotsArea.querySelectorAll(
        "button"
      )
    );


    disableElements(
      optionsArea.querySelectorAll(
        "button"
      )
    );
  }


  testState.currentReveal =
    reveal;


  renderOrdering();
}


/* =========================================================
   =========================================================
   TEST TYPE 3
   FIND THE ERROR
   =========================================================
   ========================================================= */

function extractErrorSpans(
  raw
) {

  const matches =
    [];


  const regex =
    /\{([^{}]+)\}/g;


  let match;


  while (
    (
      match =
        regex.exec(
          raw
        )
    ) !== null
  ) {

    matches.push(
      match[1]
    );
  }


  return matches;
}


function renderFindErrorTest(
  app,
  item
) {

  const row =
    item.row;


  const correctSpans =
    extractErrorSpans(
      row.english
    );


  const wrongChoices =
    splitSemicolon(
      row.error_choices
    );


  const wrongIndex =
    Math.floor(
      Math.random() * 4
    );


  document
    .getElementById(
      "testTypeLabel"
    )
    .textContent =
      "Find the Error";


  /*
    이 유형은 한국어 뜻을
    문제에서 이미 제공
  */

  document
    .getElementById(
      "testKorean"
    )
    .textContent =
      row.korean.trim();


  const questionArea =
    document.getElementById(
      "testQuestion"
    );


  document
    .getElementById(
      "testAnswerArea"
    )
    .innerHTML = `
      <div
        class="test-correct-answer"
        id="errorCorrectAnswer"
      ></div>
    `;


  const correctAnswer =
    document.getElementById(
      "errorCorrectAnswer"
    );


  const buttons =
    [];


  let candidateIndex =
    0;


  let lastIndex =
    0;


  const regex =
    /\{([^{}]+)\}/g;


  let match;


  while (
    (
      match =
        regex.exec(
          row.english
        )
    ) !== null
  ) {

    const before =
      row.english.slice(
        lastIndex,
        match.index
      );


    questionArea.appendChild(
      document.createTextNode(
        cleanInlineMetadata(
          before
        )
      )
    );


    const button =
      document.createElement(
        "button"
      );


    button.type =
      "button";


    button.className =
      "error-choice";


    const correctText =
      cleanEnglish(
        match[1]
      );


    const displayText =
      candidateIndex ===
      wrongIndex

        ? wrongChoices[
            candidateIndex
          ]

        : correctText;


    button.textContent =
      displayText;


    const thisIndex =
      candidateIndex;


    button.addEventListener(
      "click",
      () => {

        if (
          testState.locked
        ) {

          return;
        }


        const isCorrect =
          thisIndex ===
          wrongIndex;


        submitTestAnswer(
          app,
          isCorrect,
          mode => {

            revealError(
              mode,
              button,
              thisIndex
            );
          }
        );
      }
    );


    buttons.push(
      button
    );


    questionArea.appendChild(
      button
    );


    candidateIndex++;


    lastIndex =
      regex.lastIndex;
  }


  questionArea.appendChild(
    document.createTextNode(
      cleanInlineMetadata(
        row.english.slice(
          lastIndex
        )
      )
    )
  );


  function revealError(
    mode,
    selectedButton = null,
    selectedIndex = -1
  ) {

    buttons.forEach(
      (
        button,
        index
      ) => {

        button.disabled =
          true;


        /*
          실제로 틀리게 만들어진 표현
        */

        if (
          index ===
          wrongIndex
        ) {

          button.classList.add(
            "wrong"
          );
        }


        /*
          학생이 다른 부분을 눌렀다면
          그 부분도 selected-wrong 표시
        */

        if (
          selectedButton &&
          selectedIndex !==
            wrongIndex &&
          index ===
            selectedIndex
        ) {

          button.classList.add(
            "selected-wrong"
          );
        }
      }
    );


    correctAnswer.innerHTML = `
      <div>
        Correct:
        <strong>
          ${escapeHTML(
            correctSpans[
              wrongIndex
            ]
          )}
        </strong>
      </div>
    `;
  }


  testState.currentReveal =
    mode => {

      revealError(
        mode
      );
    };
}


/* =========================================================
   =========================================================
   TEST TYPE 4
   TEXT SEQUENCE
   =========================================================
   ========================================================= */

/*
  - 문장 앞 둥근 사각형 번호칸
  - 문장 전체를 눌러도 선택 가능
  - 선택 순서대로 1,2,3,4
  - 이미 선택한 문장을 다시 누르면
    해당 번호와 그 뒤 선택 모두 삭제

  4개를 모두 선택했는데 오답:
  - 채점 확정 X
  - timer 계속
  - 모든 블록 shake
  - Try again!
  - 선택 초기화

  정답 또는 timeout:
  - 문장을 정답 순서대로 1~4 재정렬
*/

function renderTextSequenceTest(
  app,
  item
) {

  const rows =
    item.rows;


  const correctItems =
    rows.map(
      (
        row,
        index
      ) => ({

        row,

        id:
          row.id,

        text:
          cleanEnglish(
            row.english
          ),

        korean:
          row.korean.trim(),

        originalIndex:
          index
      })
    );


  const choices =
    shuffleArray([
      ...correctItems
    ]);


  let selected =
    [];


  document
    .getElementById(
      "testTypeLabel"
    )
    .textContent =
      "Text Sequence";


  /*
    문제를 푸는 동안에는
    한국어 뜻 표시 안 함
  */

  document
    .getElementById(
      "testKorean"
    )
    .textContent =
      "";


  document
    .getElementById(
      "testQuestion"
    )
    .textContent =
      "Put the sentences in the correct order.";


  const area =
    document.getElementById(
      "testAnswerArea"
    );


  area.innerHTML = `
    <div
      class="sequence-options"
      id="sequenceOptions"
    ></div>

    <div
      class="sequence-try-again"
      id="sequenceTryAgain"
    ></div>

    <div
      class="test-correct-answer"
      id="sequenceCorrectAnswer"
    ></div>
  `;


  const optionsArea =
    document.getElementById(
      "sequenceOptions"
    );


  const tryAgain =
    document.getElementById(
      "sequenceTryAgain"
    );


  const correctAnswer =
    document.getElementById(
      "sequenceCorrectAnswer"
    );


  let retryResetTimer =
    null;


  function renderSequence(
    displayChoices = choices
  ) {

    optionsArea.innerHTML =
      "";


    displayChoices.forEach(
      choice => {

        const selectedIndex =
          selected.indexOf(
            choice
          );


        const button =
          document.createElement(
            "button"
          );


        button.type =
          "button";


        button.className =
          "sequence-option";


        const numberBox =
          document.createElement(
            "span"
          );


        numberBox.className =
          "sequence-number-box";


        numberBox.textContent =
          selectedIndex !== -1

            ? String(
                selectedIndex + 1
              )

            : "";


        const sentenceText =
          document.createElement(
            "span"
          );


        sentenceText.className =
          "sequence-sentence-text";


        sentenceText.textContent =
          choice.text;


        button.append(
          numberBox,
          sentenceText
        );


        if (
          selectedIndex !== -1
        ) {

          button.classList.add(
            "selected"
          );
        }


        button.disabled =
          testState.locked;


        button.addEventListener(
          "click",
          () => {

            if (
              testState.locked
            ) {

              return;
            }


            const existingIndex =
              selected.indexOf(
                choice
              );


            if (
              existingIndex !== -1
            ) {

              /*
                해당 번호 및
                이후 번호 모두 삭제
              */

              selected =
                selected.slice(
                  0,
                  existingIndex
                );

            } else {

              selected.push(
                choice
              );
            }


            tryAgain.textContent =
              "";


            renderSequence();


            if (
              selected.length ===
              correctItems.length
            ) {

              checkSequenceAnswer();
            }
          }
        );


        optionsArea.appendChild(
          button
        );
      }
    );
  }


  function checkSequenceAnswer() {

    const isCorrect =
      selected.every(
        (
          choice,
          index
        ) =>
          choice.originalIndex ===
          index
      );


    if (
      isCorrect
    ) {

      submitTestAnswer(
        app,
        true,
        revealSequence
      );


      return;
    }


    /*
      오답 배열은 최종 오답으로
      처리하지 않고 재시도
    */

    playSound(
      "wrong"
    );


    tryAgain.textContent =
      "Try again!";


    tryAgain.style.color =
      FEEDBACK_COLORS.wrong;


    tryAgain.classList.add(
      "show"
    );


    const blocks =
      optionsArea.querySelectorAll(
        ".sequence-option"
      );


    blocks.forEach(
      block => {

        block.classList.add(
          "shake"
        );
      }
    );


    /*
      진동 후 번호 초기화
      timer는 계속 진행
    */

    retryResetTimer =
      setTimeout(
        () => {

          if (
            !testState ||
            testState.locked
          ) {

            return;
          }


          selected =
            [];


          renderSequence();


          tryAgain.textContent =
            "Try again!";

        },
        600
      );
  }


  function revealSequence(
    mode
  ) {

    if (
      retryResetTimer
    ) {

      clearTimeout(
        retryResetTimer
      );
    }


    /*
      정답 순서로 실제 재정렬
    */

    selected =
      [...correctItems];


    optionsArea.innerHTML =
      "";


    correctItems.forEach(
      (
        choice,
        index
      ) => {

        const block =
          document.createElement(
            "div"
          );


        block.className =
          "sequence-option sequence-correct-order";


        const numberBox =
          document.createElement(
            "span"
          );


        numberBox.className =
          "sequence-number-box";


        numberBox.textContent =
          String(
            index + 1
          );


        const content =
          document.createElement(
            "div"
          );


        content.className =
          "sequence-answer-content";


        const english =
          document.createElement(
            "div"
          );


        english.className =
          "sequence-sentence-text";


        english.textContent =
          choice.text;


        content.appendChild(
          english
        );


        /*
          한국어 뜻은 timeout/오답일 때
          함께 보여줌
        */

        if (
          mode !== "correct"
        ) {

          const korean =
            document.createElement(
              "div"
            );


          korean.className =
            "sequence-korean-answer";


          korean.textContent =
            choice.korean;


          content.appendChild(
            korean
          );
        }


        block.append(
          numberBox,
          content
        );


        optionsArea.appendChild(
          block
        );
      }
    );


    tryAgain.textContent =
      "";


    if (
      mode === "correct"
    ) {

      correctAnswer.textContent =
        "Correct order shown above.";

    } else {

      correctAnswer.textContent =
        "Correct order and meanings are shown above.";
    }
  }


  testState.currentReveal =
    revealSequence;


  renderSequence();
}


/* =========================================================
   =========================================================
   TEST TYPE 5
   MISSING PHRASE
   =========================================================
   ========================================================= */

function parsePhraseData(
  row
) {

  const raw =
    row
      .phrase_distractors
      .trim();


  if (!raw) {

    return null;
  }


  const leadingMatch =
    raw.match(
      /^\/+/
    );


  const trailingMatch =
    raw.match(
      /\/+$/
    );


  const leading =
    leadingMatch
      ? leadingMatch[0].length
      : 0;


  const trailing =
    trailingMatch
      ? trailingMatch[0].length
      : 0;


  const inner =
    raw
      .replace(
        /^\/+/,
        ""
      )
      .replace(
        /\/+$/,
        ""
      );


  const distractors =
    splitSemicolon(
      inner
    );


  const chunks =
    getChunks(
      row.english
    );


  if (
    distractors.length <
    3
  ) {

    return null;
  }


  if (
    leading +
    trailing +
    1 !==
    chunks.length
  ) {

    return null;
  }


  const targetIndex =
    leading;


  if (
    targetIndex < 0 ||
    targetIndex >=
      chunks.length
  ) {

    return null;
  }


  return {

    chunks,

    targetIndex,

    target:
      chunks[
        targetIndex
      ],

    distractors
  };
}


function renderMissingPhraseTest(
  app,
  item
) {

  const row =
    item.row;


  const data =
    parsePhraseData(
      row
    );


  const displayChunks =
    [...data.chunks];


  displayChunks[
    data.targetIndex
  ] =
    "_____";


  document
    .getElementById(
      "testTypeLabel"
    )
    .textContent =
      "Missing Phrase";


  /*
    이 유형은 문제를 풀 때
    한국어 뜻을 보여주지 않음
  */

  document
    .getElementById(
      "testKorean"
    )
    .textContent =
      "";


  document
    .getElementById(
      "testQuestion"
    )
    .textContent =
      displayChunks.join(
        " "
      );


  const area =
    document.getElementById(
      "testAnswerArea"
    );


  area.innerHTML = `
    <div
      class="test-options"
      id="phraseOptions"
    ></div>

    <div
      class="test-correct-answer"
      id="phraseCorrectAnswer"
    ></div>
  `;


  const optionsArea =
    document.getElementById(
      "phraseOptions"
    );


  const correctAnswer =
    document.getElementById(
      "phraseCorrectAnswer"
    );


  const distractors =
    shuffleArray([
      ...data.distractors
    ]).slice(
      0,
      3
    );


  const options =
    shuffleArray([
      {
        text:
          data.target,

        correct:
          true
      },

      ...distractors.map(
        text => ({
          text,

          correct:
            false
        })
      )
    ]);


  const buttons =
    [];


  options.forEach(
    option => {

      const button =
        document.createElement(
          "button"
        );


      button.type =
        "button";


      button.className =
        "test-option";


      button.textContent =
        option.text;


      button.addEventListener(
        "click",
        () => {

          if (
            testState.locked
          ) {

            return;
          }


          submitTestAnswer(
            app,
            option.correct,
            mode => {

              revealPhrase(
                mode,
                button,
                option
              );
            }
          );
        }
      );


      buttons.push({
        button,
        option
      });


      optionsArea.appendChild(
        button
      );
    }
  );


  function revealPhrase(
    mode,
    selectedButton = null,
    selectedOption = null
  ) {

    buttons.forEach(
      ({
        button,
        option
      }) => {

        button.disabled =
          true;


        if (
          option.correct
        ) {

          button.classList.add(
            "correct"
          );
        }
      }
    );


    if (
      mode !== "correct" &&
      selectedButton &&
      selectedOption &&
      !selectedOption.correct
    ) {

      selectedButton.classList.add(
        "wrong"
      );
    }


    if (
      mode === "correct"
    ) {

      correctAnswer.innerHTML = `
        <div>
          Answer:
          <strong>
            ${escapeHTML(
              data.target
            )}
          </strong>
        </div>
      `;

    } else {

      /*
        우리말 뜻을 처음에 보여주지 않은 유형이므로
        오답 / timeout 때
        정답 + 전체 문장 + 문장 뜻
      */

      correctAnswer.innerHTML = `
        <div class="answer-line">
          Answer:
          <strong>
            ${escapeHTML(
              data.target
            )}
          </strong>
        </div>

        <div class="answer-full-sentence">
          ${escapeHTML(
            cleanEnglish(
              row.english
            )
          )}
        </div>

        <div class="answer-korean">
          ${escapeHTML(
            row.korean.trim()
          )}
        </div>
      `;
    }
  }


  testState.currentReveal =
    mode => {

      revealPhrase(
        mode
      );
    };
}


/* =========================================================
   TEST RESULT MESSAGE
   ========================================================= */

function getTestAchievement(
  accuracy
) {

  if (
    accuracy === 100
  ) {

    return {

      emoji:
        "👑",

      text:
        "Excellent Reader!"
    };
  }


  if (
    accuracy >= 90
  ) {

    return {

      emoji:
        "🌟",

      text:
        "Great Reader!"
    };
  }


  if (
    accuracy >= 80
  ) {

    return {

      emoji:
        "👏",

      text:
        "Good Reader!"
    };
  }


  if (
    accuracy >= 70
  ) {

    return {

      emoji:
        "📖",

      text:
        "Keep Reading!"
    };
  }


  if (
    accuracy >= 50
  ) {

    return {

      emoji:
        "💪",

      text:
        "Keep Practicing!"
    };
  }


  return {

    emoji:
      "🔄",

    text:
      "Review and Try Again!"
  };
}


/* =========================================================
   TEST RESULT SCREEN
   ========================================================= */

function renderTestResult(
  app
) {

  clearTestTimers();


  const total =
    testState.questions.length;


  const score =
    testState.score;


  const accuracy =
    Math.round(
      (
        score /
        total
      ) * 100
    );


  const achievement =
    getTestAchievement(
      accuracy
    );


  const review =
    testState.reviewSentences;


  const visibleReview =
    review.slice(
      0,
      5
    );


  const hasMore =
    review.length >
    5;


  playSound(
    "victory"
  );


  let reviewHTML =
    "";


  if (
    review.length ===
    0
  ) {

    reviewHTML = `
      <div class="review-none">
        None 🎉
      </div>
    `;

  } else {

    reviewHTML =
      visibleReview
        .map(
          (
            sentence,
            index
          ) => `
            <div class="review-sentence">
              ${index + 1}.
              ${escapeHTML(sentence)}
            </div>
          `
        )
        .join("");


    if (hasMore) {

      reviewHTML += `
        <div class="review-more">
          and more...
        </div>
      `;
    }
  }


  const adviceHTML =
    hasMore

      ? `
        <p class="test-result-advice">
          📖 Try Reading Practice again before taking the test.
        </p>
      `

      : "";


  app.innerHTML = `
    <section class="test-result">

      <div class="result-card test-result-card">

        <h1 class="test-achievement">
          ${achievement.emoji}
          ${achievement.text}
        </h1>

        <div class="test-result-summary">

          <div>
            📚 Grade ${GRADE_NUMBER}
            ·
            Lesson ${currentLesson.lessonNumber}
          </div>

          <div>
            ⭐ Score:
            <strong>
              ${score}/${total}
            </strong>
            (🎯 ${accuracy}%)
          </div>

        </div>

        <div class="test-review">

          <h2>
            📝 Sentences to Review:
          </h2>

          <div class="review-list">
            ${reviewHTML}
          </div>

        </div>

        ${adviceHTML}

        <div class="result-buttons">

          <button
            type="button"
            class="copy-result-button"
            id="copyResultButton"
          >
            📋 Copy Result
          </button>

          <button
            type="button"
            id="testAgainButton"
          >
            🔄 Try Again
          </button>

          <button
            type="button"
            id="testMenuButton"
          >
            ← Lesson Menu
          </button>

        </div>

      </div>

    </section>
  `;


  document
    .getElementById(
      "copyResultButton"
    )
    .addEventListener(
      "click",
      copyTestResult
    );


  document
    .getElementById(
      "testAgainButton"
    )
    .addEventListener(
      "click",
      () => {

        startReadingTest(
          app,
          currentLesson
        );
      }
    );


  document
    .getElementById(
      "testMenuButton"
    )
    .addEventListener(
      "click",
      goBackToLessonMenu
    );
}


/* =========================================================
   COPY TEST RESULT
   ========================================================= */

async function copyTestResult() {

  if (!testState) {
    return;
  }


  const total =
    testState.questions.length;


  const score =
    testState.score;


  const accuracy =
    Math.round(
      (
        score /
        total
      ) * 100
    );


  const achievement =
    getTestAchievement(
      accuracy
    );


  const review =
    testState.reviewSentences;


  const visibleReview =
    review.slice(
      0,
      5
    );


  const lines = [

    `${achievement.emoji} ${achievement.text}`,

    `📚 Grade ${GRADE_NUMBER} · Lesson ${currentLesson.lessonNumber}`,

    `⭐ Score: ${score}/${total} (🎯 ${accuracy}%)`,

    "",

    "📝 Sentences to Review:"
  ];


  if (
    review.length ===
    0
  ) {

    lines.push(
      "None 🎉"
    );

  } else {

    visibleReview.forEach(
      (
        sentence,
        index
      ) => {

        lines.push(
          `${index + 1}. ${sentence}`
        );
      }
    );


    if (
      review.length >
      5
    ) {

      lines.push(
        "and more..."
      );


      lines.push(
        ""
      );


      lines.push(
        "📖 Try Reading Practice again before taking the test."
      );
    }
  }


  const text =
    lines.join(
      "\n"
    );


  const button =
    document.getElementById(
      "copyResultButton"
    );


  try {

    await navigator
      .clipboard
      .writeText(
        text
      );


    showCopiedButton(
      button
    );

  } catch (error) {

    fallbackCopyText(
      text
    );


    showCopiedButton(
      button
    );
  }
}


function fallbackCopyText(
  text
) {

  const textarea =
    document.createElement(
      "textarea"
    );


  textarea.value =
    text;


  textarea.style.position =
    "fixed";


  textarea.style.opacity =
    "0";


  document.body.appendChild(
    textarea
  );


  textarea.select();


  document.execCommand(
    "copy"
  );


  document.body.removeChild(
    textarea
  );
}


function showCopiedButton(
  button
) {

  if (!button) {
    return;
  }


  const original =
    button.textContent;


  button.textContent =
    "✅ Copied!";


  setTimeout(
    () => {

      button.textContent =
        original;
    },
    1500
  );
}


/* =========================================================
   UTILITY: SPLIT SEMICOLON
   ========================================================= */

function splitSemicolon(
  text
) {

  return String(text)
    .split(
      ";"
    )
    .map(
      item =>
        item.trim()
    )
    .filter(
      Boolean
    );
}


/* =========================================================
   UTILITY: WORD COUNT
   ========================================================= */

function countWords(
  text
) {

  const cleaned =
    String(text)
      .trim();


  if (!cleaned) {

    return 0;
  }


  return cleaned
    .split(
      /\s+/
    )
    .filter(
      Boolean
    )
    .length;
}


/* =========================================================
   UTILITY: DISABLE BUTTONS
   ========================================================= */

function disableButtons(
  buttons
) {

  buttons.forEach(
    button => {

      button.disabled =
        true;
    }
  );
}


function disableElements(
  elements
) {

  [...elements].forEach(
    element => {

      if (
        "disabled" in element
      ) {

        element.disabled =
          true;
      }
    }
  );
}


/* =========================================================
   UTILITY: RANDOM CHOICE
   ========================================================= */

function randomChoice(
  array
) {

  if (!array.length) {

    return null;
  }


  return array[
    Math.floor(
      Math.random() *
      array.length
    )
  ];
}


/* =========================================================
   UTILITY: SHUFFLE
   ========================================================= */

function shuffleArray(
  array
) {

  for (
    let i =
      array.length - 1;

    i > 0;

    i--
  ) {

    const j =
      Math.floor(
        Math.random() *
        (i + 1)
      );


    [
      array[i],
      array[j]
    ] = [
      array[j],
      array[i]
    ];
  }


  return array;
}


/* =========================================================
   UTILITY: ESCAPE HTML
   ========================================================= */

function escapeHTML(
  text
) {

  return String(text)

    .replace(
      /&/g,
      "&amp;"
    )

    .replace(
      /</g,
      "&lt;"
    )

    .replace(
      />/g,
      "&gt;"
    )

    .replace(
      /"/g,
      "&quot;"
    )

    .replace(
      /'/g,
      "&#039;"
    );
}


/* =========================================================
   LOADING
   ========================================================= */

function showLoading(
  app
) {

  app.innerHTML = `
    <p class="loading">
      Loading reading data...
    </p>
  `;
}


/* =========================================================
   ERROR
   ========================================================= */

function renderError(
  app,
  error
) {

  clearPracticeTimers();
  clearTestTimers();


  app.innerHTML =
    "";


  const box =
    document.createElement(
      "div"
    );


  box.className =
    "error-message";


  const title =
    document.createElement(
      "h2"
    );


  title.textContent =
    "Unable to load Reading Trainer";


  const message =
    document.createElement(
      "p"
    );


  message.textContent =
    error.message;


  box.append(
    title,
    message
  );


  app.appendChild(
    box
  );
}
