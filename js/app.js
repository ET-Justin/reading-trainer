"use strict";


/* =========================================================
   CONFIG
   ========================================================= */

const DATA_PATH = "data/2022M1L05R.csv";
const LESSON_NUMBER = 5;

const MAX_PRACTICE_ROUNDS = 3;

const CORRECT_FEEDBACK_MS = 900;
const WRONG_FEEDBACK_MS = 2500;

const SOUND_PATHS = {
  correct: "sound/correct.mp3",
  wrong: "sound/wrong.mp3",
  victory: "sound/victory.mp3"
};


/* =========================================================
   GLOBAL STATE
   ========================================================= */

let currentLesson = null;
let practiceState = null;

let practiceFeedbackTimer = null;
let roundIntroTimer = null;


/* =========================================================
   SOUND
   ========================================================= */

const sounds = {
  correct: new Audio(SOUND_PATHS.correct),
  wrong: new Audio(SOUND_PATHS.wrong),
  victory: new Audio(SOUND_PATHS.victory)
};

Object.values(sounds).forEach(audio => {
  audio.preload = "auto";
});


function playSound(name) {
  const audio = sounds[name];

  if (!audio) return;

  try {
    audio.pause();
    audio.currentTime = 0;

    const promise = audio.play();

    if (promise !== undefined) {
      promise.catch(() => {
        // 브라우저 자동 재생 제한 등은 무시
      });
    }
  } catch (error) {
    console.warn(`Sound error: ${name}`, error);
  }
}


/*
  Practice와 Test가 모두 이 함수를 사용합니다.

  playSound("correct");
  playSound("wrong");
  playSound("victory");
*/


/* =========================================================
   INITIALIZATION
   ========================================================= */

document.addEventListener("DOMContentLoaded", init);


async function init() {
  const app = getAppContainer();

  try {
    showLoading(app);

    const rows = await loadCSV(DATA_PATH);

    validateCSV(rows);

    currentLesson = buildLessonData(rows);

    /*
      현재 URL을 browser history의 첫 상태로 등록.
      예:
        /reading-trainer/
        /reading-trainer/#practice
        /reading-trainer/#test
    */
    history.replaceState(
      {
        readingTrainer: true,
        route: getCurrentRoute()
      },
      "",
      window.location.href
    );

    window.addEventListener("popstate", () => {
      renderCurrentRoute(app);
    });

    renderCurrentRoute(app);

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

  if (!app) {
    app = document.createElement("main");
    app.id = "app";

    document.body.appendChild(app);
  }

  return app;
}


/* =========================================================
   ROUTING
   ========================================================= */

/*
  URL:

  Lesson Menu
  /reading-trainer/

  Reading Practice
  /reading-trainer/#practice

  Reading Test
  /reading-trainer/#test
*/


function getCurrentRoute() {
  return window.location.hash
    .replace(/^#/, "")
    .trim()
    .toLowerCase();
}


function navigateTo(route) {
  clearPracticeTimers();

  const hash = route
    ? `#${route}`
    : window.location.pathname;

  history.pushState(
    {
      readingTrainer: true,
      route
    },
    "",
    hash
  );

  renderCurrentRoute(
    document.getElementById("app")
  );
}


function renderCurrentRoute(app) {
  clearPracticeTimers();

  const route = getCurrentRoute();

  if (route === "practice") {
    startReadingPractice(
      app,
      currentLesson
    );

    return;
  }

  if (route === "test") {
    /*
      Reading Test는 다음 단계에서 구현.
      URL 구조는 지금부터 분리해 둠.
    */
    renderTestPlaceholder(
      app,
      currentLesson
    );

    return;
  }

  practiceState = null;

  renderLessonMenu(
    app,
    currentLesson
  );
}


function goBackToLessonMenu() {
  /*
    Lesson Menu에서 Practice/Test를 눌러 들어온 경우
    browser history의 바로 이전 항목이 Lesson Menu.
  */
  history.back();
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


/* =========================================================
   CSV PARSER
   ========================================================= */

/*
  RFC 스타일 CSV의 핵심 기능 처리:

  - 쉼표
  - 큰따옴표
  - "" 이스케이프
  - 셀 내부 줄바꿈
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
        field += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }

      continue;
    }


    if (char === "," && !inQuotes) {

      row.push(field);
      field = "";

      continue;
    }


    if (
      (char === "\n" || char === "\r") &&
      !inQuotes
    ) {

      if (
        char === "\r" &&
        next === "\n"
      ) {
        i++;
      }

      row.push(field);
      field = "";

      if (
        row.some(cell => cell !== "")
      ) {
        table.push(row);
      }

      row = [];

      continue;
    }


    field += char;
  }


  if (
    field !== "" ||
    row.length > 0
  ) {

    row.push(field);

    if (
      row.some(cell => cell !== "")
    ) {
      table.push(row);
    }
  }


  if (table.length < 2) {
    throw new Error(
      "CSV에 데이터가 없습니다."
    );
  }


  const headers =
    table[0].map(header =>
      header.trim()
    );


  return table
    .slice(1)
    .map(values => {

      const object = {};

      headers.forEach(
        (header, index) => {

          object[header] =
            values[index] ?? "";
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


  const firstRow = rows[0];

  for (
    const column
    of requiredColumns
  ) {

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
      throw new Error(
        "ID가 없는 행이 있습니다."
      );
    }


    if (ids.has(id)) {
      throw new Error(
        `중복된 ID가 있습니다: ${id}`
      );
    }


    ids.add(id);
  }


  console.log(
    `CSV loaded: ${rows.length} rows`
  );
}


/* =========================================================
   LESSON DATA
   ========================================================= */

function buildLessonData(rows) {

  const titleRow =
    rows.find(row =>
      row.id.endsWith("0000")
    );


  const title = titleRow
    ? cleanEnglish(titleRow.english)
    : "Reading";


  const sentences =
    rows.filter(row =>
      isSentenceRow(row)
    );


  return {
    lessonNumber: LESSON_NUMBER,
    title,
    rows,
    sentences
  };
}


/* =========================================================
   SENTENCE ROW
   ========================================================= */

function isSentenceRow(row) {

  const id = row.id.trim();


  if (!/^\d{7}$/.test(id)) {
    return false;
  }


  const sentenceNumber =
    id.slice(-2);


  /*
    00:
    제목 / 날짜 / 소제목
  */

  return sentenceNumber !== "00";
}


/* =========================================================
   ANNOTATION CLEANING
   ========================================================= */

/*
  CSV english 내부 메타데이터

  " / "     chunk
  {...}     Find the Error
  **...**   Random Blank 제외

  학생 화면에서는 제거
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


  const section =
    document.createElement("section");

  section.className =
    "lesson-menu";


  const heading =
    document.createElement("h1");

  heading.className =
    "lesson-heading";

  heading.textContent =
    `Lesson ${lesson.lessonNumber}. Reading`;


  const title =
    document.createElement("div");

  title.className =
    "reading-title";

  title.textContent =
    `<${lesson.title}>`;


  const buttons =
    document.createElement("div");

  buttons.className =
    "lesson-buttons";


  const practiceButton =
    createButton(
      "📖 Reading Practice",
      "practice-button"
    );


  const testButton =
    createButton(
      "Reading Test",
      "test-button"
    );


  practiceButton.addEventListener(
    "click",
    () => {
      navigateTo("practice");
    }
  );


  testButton.addEventListener(
    "click",
    () => {
      navigateTo("test");
    }
  );


  buttons.append(
    practiceButton,
    testButton
  );


  const info =
    document.createElement("p");

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


  app.appendChild(section);
}


/* =========================================================
   BUTTON FACTORY
   ========================================================= */

function createButton(
  label,
  className
) {

  const button =
    document.createElement("button");


  button.type = "button";

  button.className =
    className;

  button.textContent =
    label;


  return button;
}


/* =========================================================
   READING PRACTICE — START
   ========================================================= */

function startReadingPractice(
  app,
  lesson
) {

  clearPracticeTimers();


  /*
    Practice 사용 가능 문장:

    - 영어 문장 존재
    - 한국어 뜻 존재
  */

  const eligible =
    lesson.sentences.filter(row =>
      cleanEnglish(row.english) &&
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

    round: 1,

    /*
      Round 1:
      모든 문장
    */

    queue:
      shuffleArray([
        ...eligible
      ]),

    /*
      이번 round에서 틀린 문장
    */

    retryQueue: [],

    /*
      전체 Passage의 문장.
      Korean → English 오답 생성에 사용.
    */

    allSentences: [
      ...eligible
    ],

    totalSentences:
      eligible.length,

    roundTotal:
      eligible.length,

    roundAnswered: 0,

    currentRow: null,

    currentType: null,

    correctCount: 0,

    wrongCount: 0,

    locked: false
  };


  showPracticeRoundIntro(app);
}


/* =========================================================
   PRACTICE ROUND INTRO
   ========================================================= */

/*
  Round 1

  Total 33 sentences to learn.

  1
  2
  3
  Start!

  각각 1초
*/


function showPracticeRoundIntro(app) {

  if (!practiceState) return;


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
          1
        </div>

      </div>

    </section>
  `;


  const countdown =
    document.getElementById(
      "roundCountdown"
    );


  const sequence = [
    "1",
    "2",
    "3",
    "Start!"
  ];


  let index = 0;


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

            renderPracticeScreen(app);

            showNextPracticeQuestion(app);

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


        <div class="practice-progress-wrap">

          <div
            class="practice-progress-text"
            id="practiceProgressText"
          ></div>

          <div
            class="practice-progress-bar"
          >

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
      () => {

        goBackToLessonMenu();

      }
    );


  updatePracticeProgress();
}


/* =========================================================
   PRACTICE QUESTION SELECTION
   ========================================================= */

function showNextPracticeQuestion(app) {

  if (!practiceState) {
    return;
  }


  if (
    practiceState.queue.length === 0
  ) {

    handlePracticeRoundEnd(app);

    return;
  }


  const row =
    practiceState.queue.shift();


  practiceState.currentRow =
    row;

  practiceState.locked =
    false;


  /*
    매 문장마다 문제 유형을 새로 랜덤 결정.

    따라서:
    - 유형별 개수도 매번 다름
    - 유형 순서도 매번 다름
    - Round 2/3에서 같은 문장이
      다른 유형으로 나올 수 있음
  */

  const type =
    choosePracticeQuestionType(row);


  practiceState.currentType =
    type;


  if (
    type === "ENGLISH_TO_KOREAN"
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
   PRACTICE TYPE RANDOMIZER
   ========================================================= */

function choosePracticeQuestionType(row) {

  const koreanDistractors =
    row.korean_distractors
      .split(";")
      .map(item => item.trim())
      .filter(Boolean);


  /*
    Korean distractor가 충분하면
    50:50 랜덤.
  */

  if (
    koreanDistractors.length >= 3
  ) {

    return Math.random() < 0.5
      ? "ENGLISH_TO_KOREAN"
      : "KOREAN_TO_ENGLISH";
  }


  /*
    한국어 오답 데이터가 부족하면
    Korean → English만 사용.
  */

  return "KOREAN_TO_ENGLISH";
}


/* =========================================================
   TYPE 1
   ENGLISH → KOREAN
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
    cleanEnglish(row.english);


  const distractors =
    row.korean_distractors
      .split(";")
      .map(item => item.trim())
      .filter(Boolean);


  const selectedDistractors =
    shuffleArray([
      ...distractors
    ]).slice(0, 3);


  const options =
    shuffleArray([
      {
        text: row.korean.trim(),
        correct: true
      },

      ...selectedDistractors.map(
        text => ({
          text,
          correct: false
        })
      )
    ]);


  renderPracticeOptions(
    app,
    options
  );
}


/* =========================================================
   TYPE 2
   KOREAN → ENGLISH
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
          cleanEnglish(row.english),

        correct: true
      },

      ...distractorRows.map(
        distractorRow => ({

          text:
            cleanEnglish(
              distractorRow.english
            ),

          correct: false
        })
      )
    ]);


  renderPracticeOptions(
    app,
    options
  );
}


/* =========================================================
   KOREAN → ENGLISH DISTRACTORS
   ========================================================= */

/*
  해당 지문 전체에서 오답 문장 3개를 선택.

  1차 후보:
  정답과 단어 수 차이 ±5

  후보가 3개 미만이면:
  나머지 전체 문장 중에서 보충.
*/


function getEnglishDistractorRows(
  correctRow,
  allRows,
  count
) {

  const correctText =
    cleanEnglish(
      correctRow.english
    );


  const correctWordCount =
    countWords(correctText);


  const otherRows =
    allRows.filter(
      row =>
        row.id !== correctRow.id
    );


  const closeRows =
    otherRows.filter(row => {

      const candidateText =
        cleanEnglish(
          row.english
        );


      const candidateCount =
        countWords(
          candidateText
        );


      return (
        Math.abs(
          candidateCount -
          correctWordCount
        ) <= 5
      );
    });


  const selected =
    shuffleArray([
      ...closeRows
    ]).slice(0, count);


  /*
    ±5 후보가 부족하면
    제한 없이 나머지 문장에서 보충
  */

  if (
    selected.length < count
  ) {

    const selectedIds =
      new Set(
        selected.map(row => row.id)
      );


    const remaining =
      otherRows.filter(
        row =>
          !selectedIds.has(row.id)
      );


    const extra =
      shuffleArray([
        ...remaining
      ]).slice(
        0,
        count - selected.length
      );


    selected.push(...extra);
  }


  return selected;
}


/* =========================================================
   WORD COUNT
   ========================================================= */

function countWords(text) {

  const cleaned =
    text.trim();


  if (!cleaned) {
    return 0;
  }


  return cleaned
    .split(/\s+/)
    .filter(Boolean)
    .length;
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


  container.innerHTML = "";

  feedback.textContent = "";


  options.forEach(option => {

    const button =
      document.createElement(
        "button"
      );


    button.type = "button";

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
  });
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


  practiceState.locked = true;

  practiceState.roundAnswered++;


  const buttons = [
    ...document.querySelectorAll(
      ".practice-option"
    )
  ];


  /*
    Correct
  */

  if (selectedOption.correct) {

    practiceState.correctCount++;

    clickedButton.classList.add(
      "correct"
    );

    showPracticeFeedback(
      "Correct!"
    );

    playSound("correct");


    disablePracticeOptions(
      buttons
    );


    /*
      모바일 sticky hover/focus 방지
    */

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


  /*
    Wrong
  */

  practiceState.wrongCount++;


  clickedButton.classList.add(
    "wrong"
  );


  /*
    정답 찾기
  */

  const correctButton =
    buttons.find(button => {

      if (
        practiceState.currentType ===
        "ENGLISH_TO_KOREAN"
      ) {

        return (
          button.textContent.trim() ===
          practiceState.currentRow
            .korean.trim()
        );
      }


      return (
        button.textContent.trim() ===
        cleanEnglish(
          practiceState
            .currentRow
            .english
        )
      );
    });


  if (correctButton) {

    correctButton.classList.add(
      "correct"
    );
  }


  /*
    다음 round에는
    이번 round에서 틀린 문장만 재출제
  */

  practiceState.retryQueue.push(
    practiceState.currentRow
  );


  showPracticeFeedback(
    "Not quite. You'll see this sentence again."
  );


  playSound("wrong");


  disablePracticeOptions(
    buttons
  );


  clickedButton.blur();


  updatePracticeProgress();


  /*
    오답일 경우 정답을 2.5초간 보여줌
  */

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
   DISABLE OPTIONS
   ========================================================= */

function disablePracticeOptions(
  buttons
) {

  buttons.forEach(button => {

    button.disabled = true;

  });
}


/* =========================================================
   PRACTICE FEEDBACK
   ========================================================= */

function showPracticeFeedback(
  message
) {

  const feedback =
    document.getElementById(
      "practiceFeedback"
    );


  if (!feedback) {
    return;
  }


  feedback.textContent =
    message;
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


  /*
    모두 맞음
  */

  if (
    missedRows.length === 0
  ) {

    renderPracticeResult(app);

    return;
  }


  /*
    Round 3까지 완료
  */

  if (
    practiceState.round >=
    MAX_PRACTICE_ROUNDS
  ) {

    renderPracticeResult(app);

    return;
  }


  /*
    다음 Round:

    직전 Round의 오답 문장만
  */

  practiceState.round++;


  practiceState.queue =
    shuffleArray([
      ...missedRows
    ]);


  practiceState.roundTotal =
    practiceState.queue.length;


  practiceState.roundAnswered =
    0;


  practiceState.retryQueue = [];


  showPracticeRoundIntro(app);
}


/* =========================================================
   PRACTICE PROGRESS
   ========================================================= */

function updatePracticeProgress() {

  if (!practiceState) {
    return;
  }


  const text =
    document.getElementById(
      "practiceProgressText"
    );


  const fill =
    document.getElementById(
      "practiceProgressFill"
    );


  if (!text || !fill) {
    return;
  }


  const completed =
    practiceState.roundAnswered;


  const total =
    practiceState.roundTotal;


  const percent =
    total > 0
      ? Math.min(
          (completed / total) * 100,
          100
        )
      : 0;


  text.textContent =
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
      ? practiceState.retryQueue.length
      : 0;


  const allMastered =
    unresolved === 0;


  /*
    Round 3 이전에 전부 맞았거나
    Round 3 종료 후 완료 화면
  */

  playSound("victory");


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
      () => {

        goBackToLessonMenu();

      }
    );
}


/* =========================================================
   PRACTICE TIMER CLEANUP
   ========================================================= */

function clearPracticeTimers() {

  if (practiceFeedbackTimer) {

    clearTimeout(
      practiceFeedbackTimer
    );

    practiceFeedbackTimer = null;
  }


  if (roundIntroTimer) {

    clearTimeout(
      roundIntroTimer
    );

    roundIntroTimer = null;
  }
}


/* =========================================================
   TEST PLACEHOLDER
   ========================================================= */

/*
  Test는 아직 구현 전.

  다만:
  - #test URL 분리
  - browser back
  - 공용 sound system

  은 이미 준비되어 있음.
*/


function renderTestPlaceholder(
  app,
  lesson
) {

  practiceState = null;


  app.innerHTML = `
    <section class="lesson-menu">

      <h1 class="lesson-heading">
        Lesson ${lesson.lessonNumber}. Reading Test
      </h1>

      <div class="reading-title">
        &lt;${lesson.title}&gt;
      </div>

      <p>
        Reading Test is coming next.
      </p>

      <div class="lesson-buttons">

        <button
          type="button"
          class="practice-button"
          id="testBackButton"
        >
          ← Lesson Menu
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
      () => {

        goBackToLessonMenu();

      }
    );
}


/* =========================================================
   STATUS
   ========================================================= */

function showLoading(app) {

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

  app.innerHTML = "";


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


  app.appendChild(box);
}


/* =========================================================
   SHUFFLE
   ========================================================= */

function shuffleArray(array) {

  for (
    let i = array.length - 1;
    i > 0;
    i--
  ) {

    const j =
      Math.floor(
        Math.random() * (i + 1)
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
