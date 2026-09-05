"use strict";

const DATA_PATH = "data/2022M1L05R.csv";
const LESSON_NUMBER = 5;

document.addEventListener("DOMContentLoaded", init);

async function init() {
  const app = getAppContainer();

  try {
    showLoading(app);

    const rows = await loadCSV(DATA_PATH);
    validateCSV(rows);

    const lesson = buildLessonData(rows);

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
    console.log("Reading Practice selected");
    console.log(
      `${lesson.sentences.length} sentence rows available`
    );

    // 다음 단계에서 구현
    alert("Reading Practice — coming next!");
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
