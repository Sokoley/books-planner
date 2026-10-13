import {
  SEED,
  activeForecast,
  addDays,
  currentRemaining,
  currentStop,
  dateSpan,
  dayRow,
  daysBetween,
  eachDate,
  formatLong,
  formatLongYear,
  formatMonth,
  formatPages,
  lastLoggedRow,
  originalEndDate,
  paceNote,
  plural,
  previewLog,
  previousStop,
  relativeDay,
  todayISO,
  validateStop,
} from "./logic.js";

const STORAGE_KEY = "reading-planner-v1";

const state = load();
let tab = "today";
let logDate = null;

const view = document.querySelector("#view");
const greeting = document.querySelector("#greeting");
const dialog = document.querySelector("#log-dialog");
const logForm = document.querySelector("#log-form");
const logPage = document.querySelector("#log-page");
const logError = document.querySelector("#log-error");
const logPreview = document.querySelector("#log-preview");
const logDelete = document.querySelector("#log-delete");

document.querySelectorAll(".nav button").forEach((button) => {
  button.addEventListener("click", () => {
    tab = button.dataset.tab;
    render();
  });
});

logPage.addEventListener("input", updateLogPreview);
logForm.addEventListener("submit", (event) => {
  event.preventDefault();
  saveLog();
});
dialog.addEventListener("click", (event) => {
  if (event.target === dialog) dialog.close();
});

logDelete.addEventListener("click", () => {
  const book = activeBook();
  if (!book || !logDate) return;
  delete book.entries[logDate];
  persist();
  dialog.close();
  render();
});

render();

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(SEED);
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.books)) return structuredClone(SEED);
    return data;
  } catch {
    return structuredClone(SEED);
  }
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function activeBook() {
  return state.books.find((book) => book.id === state.activeId) || state.books[0] || null;
}

function render() {
  const hour = new Date().getHours();
  greeting.textContent = hour < 12 ? "Доброе утро" : hour < 18 ? "Добрый день" : "Добрый вечер";
  document.querySelectorAll(".nav button").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.tab === tab);
  });
  const book = activeBook();
  view.replaceChildren();
  if (!book) {
    view.append(emptyState());
    return;
  }
  if (tab === "today") view.append(todayView(book));
  if (tab === "diary") view.append(diaryView(book));
  if (tab === "book") view.append(bookView(book));
  if (tab === "diary") {
    const todayRow = view.querySelector(".day.is-today");
    todayRow?.scrollIntoView({ block: "center" });
  }
}

function todayView(book) {
  const today = todayISO();
  const row = dayRow(book, today);
  const stop = currentStop(book);
  const remaining = currentRemaining(book);
  const total = book.totalPages;
  const read = Math.min(total, Math.max(0, stop));
  const ratio = total > 0 ? Math.min(1, read / total) : 0;
  const note = paceNote(book, today);
  const forecast = activeForecast(book, today);
  const original = originalEndDate(book);
  const last = lastLoggedRow(book);
  const radius = 38;
  const circ = 2 * Math.PI * radius;
  const offset = circ * (1 - ratio);

  const wrap = el("section", {});
  const hero = el("article", { class: "hero" }, [
    el("span", { class: "ribbon", "aria-hidden": "true" }),
    el("p", { class: "hero-kicker" }, [formatLong(today)]),
    el("h1", {}, [book.title || "Без названия"]),
  ]);

  const progress = el("div", { class: "progress-row" }, [
    ring(radius, circ, offset, `${Math.round(ratio * 100)}%`),
    el("p", { class: "progress-copy" }, [
      el("strong", {}, [`${formatPages(read)} из ${formatPages(total)}`]),
      remaining <= 0
        ? "Последняя страница уже позади."
        : `Закладка на ${formatPages(stop)}-й странице, впереди ещё ${formatPages(remaining)} ${plural(remaining, "страница", "страницы", "страниц")}.`,
    ]),
  ]);
  hero.append(progress);

  const stats = el("div", { class: "stats" }, [
    stat(formatPages(remaining), "Остаток"),
    stat(formatPages(book.pagesPerDay), "План в день"),
    stat(shortDate(original), "Изначальный финиш"),
    stat(shortDate(forecast), "Новая дата финиша"),
  ]);
  hero.append(stats);
  wrap.append(hero);

  wrap.append(el("p", { class: `note ${note.tone}` }, [note.text]));

  if (row.logged) {
    wrap.append(
      el("p", { class: "hint" }, [
        `Сегодня: страница остановки ${formatPages(row.stopPage)}, прочитано фактически ${formatPages(row.read)} ${plural(row.read, "страница", "страницы", "страниц")}.`,
      ]),
    );
  } else if (today < book.startDate) {
    const wait = daysBetween(today, book.startDate);
    wrap.append(
      el("p", { class: "hint" }, [
        `Старт ${formatLong(book.startDate)}, через ${wait} ${plural(wait, "день", "дня", "дней")}.`,
      ]),
    );
  } else if (last) {
    wrap.append(
      el("p", { class: "hint" }, [
        `Последняя запись — ${formatLong(last.date)}: факт ${formatPages(last.read)} ${plural(last.read, "страница", "страницы", "страниц")}.`,
      ]),
    );
  }

  const button = el("button", { class: "btn", type: "button" }, [
    remaining <= 0 && last ? "Открыть запись" : row.logged ? "Изменить сегодня" : "Записать чтение",
  ]);
  const openDate = remaining <= 0 && last ? last.date : today < book.startDate ? book.startDate : today;
  button.addEventListener("click", () => openLog(openDate));
  wrap.append(button);
  return wrap;
}

function diaryView(book) {
  const today = todayISO();
  const span = dateSpan(book, today);
  const dates = eachDate(span.start, span.end);
  const wrap = el("section", {});
  wrap.append(
    el("div", { class: "section-head" }, [
      el("h2", {}, ["Дневник"]),
      el("p", {}, [`${formatPages(currentStop(book))} стр.`]),
    ]),
  );
  const list = el("div", {});
  let month = "";
  for (const date of dates) {
    const label = formatMonth(date);
    if (label !== month) {
      month = label;
      list.append(el("p", { class: "month" }, [label]));
    }
    list.append(dayButton(book, date, today));
  }
  wrap.append(list);
  return wrap;
}

function dayButton(book, date, today) {
  const row = dayRow(book, date);
  const future = date > today;
  const button = el("button", {
    type: "button",
    class: `day${date === today ? " is-today" : ""}${future ? " is-future" : ""}${row.logged ? " is-logged" : ""}`,
  });
  button.append(
    el("div", { class: "day-date" }, [
      String(Number(date.slice(8))),
      el("small", {}, [relativeDay(date, today)]),
    ]),
  );
  if (row.logged) {
    button.append(
      el("div", { class: "day-main" }, [
        el("strong", {}, [`Остановка ${formatPages(row.stopPage)}`]),
        el("span", {}, [
          `Факт ${formatPages(row.read)} · остаток ${formatPages(row.remaining)} · финиш ${compactDate(row.newEnd)}`,
        ]),
      ]),
      el("span", { class: "pill" }, [`+${formatPages(row.read)}`]),
    );
  } else if (future) {
    button.append(
      el("div", { class: "day-main" }, [el("strong", {}, ["Без записи"])]),
      el("span", { class: "pill quiet" }, ["план"]),
    );
  } else {
    button.append(
      el("div", { class: "day-main" }, [
        el("strong", {}, ["Нет записи"]),
        el("span", {}, [
          `На начало дня ${formatPages(row.planStart)} ${plural(row.planStart, "страница", "страницы", "страниц")}`,
        ]),
      ]),
      el("span", { class: "pill" }, ["пусто"]),
    );
  }
  button.addEventListener("click", () => openLog(date));
  return button;
}

function bookView(book) {
  const wrap = el("section", {});
  wrap.append(el("div", { class: "section-head" }, [el("h2", {}, ["Книга"])]));

  if (state.books.length > 1) {
    const books = el("div", { class: "books" });
    for (const item of state.books) {
      const chip = el("button", { type: "button", class: `chip${item.id === book.id ? " is-active" : ""}` }, [
        item.title || "Без названия",
      ]);
      chip.addEventListener("click", () => {
        state.activeId = item.id;
        persist();
        render();
      });
      books.append(chip);
    }
    wrap.append(books);
  }

  const card = el("form", { class: "card" });
  card.addEventListener("submit", (event) => event.preventDefault());
  card.append(el("h3", {}, ["Настройки"]));
  card.append(field("Название книги", "text", book.title, (value) => {
    book.title = value;
    persist();
  }));
  card.append(field("Всего страниц", "number", book.totalPages, (value) => {
    const next = clampInt(value, 1, 20000);
    const maxStop = Math.max(0, ...Object.values(book.entries).map(Number));
    book.totalPages = Math.max(next, maxStop || 1);
    persist();
    updateOriginal(book);
  }));
  card.append(field("Дата начала", "date", book.startDate, (value) => {
    if (!value) return;
    book.startDate = value;
    persist();
    updateOriginal(book);
  }));
  card.append(field("План в день", "number", book.pagesPerDay, (value) => {
    book.pagesPerDay = clampInt(value, 1, 2000);
    persist();
    updateOriginal(book);
  }));

  const computed = el("div", { class: "computed" }, [
    el("span", {}, ["Изначальная план. дата"]),
    el("b", { id: "original-date" }, [formatLongYear(originalEndDate(book))]),
  ]);
  card.append(computed);
  card.append(
    el("p", { class: "hint" }, [
      "Считается из даты начала, объёма и плана в день. В дневнике у каждой записи своя новая дата окончания.",
    ]),
  );
  wrap.append(card);

  const add = el("button", { class: "btn", type: "button" }, ["Новая книга"]);
  add.addEventListener("click", () => {
    const id = crypto.randomUUID ? crypto.randomUUID() : `book-${Date.now()}`;
    state.books.push({
      id,
      title: "",
      totalPages: 320,
      startDate: todayISO(),
      pagesPerDay: 25,
      entries: {},
    });
    state.activeId = id;
    persist();
    render();
    view.querySelector("input")?.focus();
  });
  wrap.append(add);

  if (state.books.length > 1) {
    const remove = el("button", { class: "btn ghost danger", type: "button" }, ["Убрать эту книгу"]);
    remove.addEventListener("click", () => {
      state.books = state.books.filter((item) => item.id !== book.id);
      state.activeId = state.books[0]?.id || null;
      persist();
      render();
    });
    wrap.append(remove);
  }
  return wrap;
}

function emptyState() {
  const wrap = el("section", { class: "empty" }, [
    el("h2", {}, ["Полка пустая"]),
    el("p", {}, ["Добавь книгу — и дневник посчитает, когда ты дочитаешь."]),
  ]);
  const add = el("button", { class: "btn", type: "button" }, ["Добавить книгу"]);
  add.addEventListener("click", () => {
    tab = "book";
    const id = crypto.randomUUID ? crypto.randomUUID() : `book-${Date.now()}`;
    state.books.push({
      id,
      title: "",
      totalPages: 320,
      startDate: todayISO(),
      pagesPerDay: 25,
      entries: {},
    });
    state.activeId = id;
    persist();
    render();
  });
  wrap.append(add);
  return wrap;
}

function openLog(date) {
  const book = activeBook();
  if (!book) return;
  logDate = date;
  const row = dayRow(book, date);
  const prev = previousStop(book, date);
  document.querySelector("#log-kicker").textContent = relativeDay(date, todayISO());
  document.querySelector("#log-title").textContent = formatLong(date);
  document.querySelector("#log-lead").textContent = prev
    ? `Прошлая закладка — страница ${formatPages(prev)}. На начало дня оставалось ${formatPages(row.planStart)} ${plural(row.planStart, "страница", "страницы", "страниц")}.`
    : `Это первая запись. На начало дня — все ${formatPages(row.planStart)} ${plural(row.planStart, "страница", "страницы", "страниц")}.`;
  logPage.value = row.logged ? String(row.stopPage) : "";
  logPage.placeholder = String(Math.min(book.totalPages, prev + book.pagesPerDay));
  logDelete.hidden = !row.logged;
  logError.hidden = true;
  updateLogPreview();
  dialog.showModal();
  logPage.focus();
}

function updateLogPreview() {
  const book = activeBook();
  if (!book || !logDate) return;
  const raw = logPage.value.trim();
  logPreview.replaceChildren();
  if (!raw) {
    logError.hidden = true;
    return;
  }
  const stopPage = readStop(raw);
  const error = stopPage === null ? "Введи целый номер страницы" : validateStop(book, logDate, stopPage);
  if (error) {
    logError.hidden = false;
    logError.textContent = error;
    return;
  }
  logError.hidden = true;
  const preview = previewLog(book, logDate, stopPage);
  logPreview.append(
    previewItem("План страниц (начало)", formatPages(preview.planStart)),
    previewItem("Прочитано фактически", formatPages(preview.read)),
    previewItem("Остаток", formatPages(preview.remaining)),
    previewItem("Новая дата окончания", formatLong(preview.newEnd)),
  );
}

function saveLog() {
  const book = activeBook();
  if (!book || !logDate) return;
  const stopPage = readStop(logPage.value);
  const error = stopPage === null ? "Введи целый номер страницы" : validateStop(book, logDate, stopPage);
  if (error) {
    logError.hidden = false;
    logError.textContent = error;
    return;
  }
  book.entries[logDate] = stopPage;
  persist();
  dialog.close();
  render();
}

function field(label, type, value, onChange) {
  const input = el("input", { type, value: value ?? "" });
  if (type === "number") {
    input.inputMode = "numeric";
    input.min = "1";
  }
  input.addEventListener("change", () => onChange(input.value));
  if (type === "text") input.addEventListener("input", () => onChange(input.value));
  return el("label", { class: "field" }, [el("span", {}, [label]), input]);
}

function updateOriginal(book) {
  const node = document.querySelector("#original-date");
  if (node) node.textContent = formatLongYear(originalEndDate(book));
}

function stat(value, label) {
  return el("div", { class: "stat" }, [el("b", {}, [value]), el("span", {}, [label])]);
}

function ring(radius, circ, offset, label) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 92 92");
  svg.setAttribute("aria-hidden", "true");
  for (const [name, dash] of [
    ["track", ""],
    ["value", `${circ} ${circ}`],
  ]) {
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("class", name);
    circle.setAttribute("cx", "46");
    circle.setAttribute("cy", "46");
    circle.setAttribute("r", String(radius));
    if (dash) {
      circle.setAttribute("stroke-dasharray", dash);
      circle.setAttribute("stroke-dashoffset", String(offset));
    }
    svg.append(circle);
  }
  return el("div", { class: "ring" }, [svg, el("div", { class: "ring-label" }, [label])]);
}

function readStop(raw) {
  const text = raw.trim();
  if (!/^\d+$/.test(text)) return null;
  return Number(text);
}

function previewItem(label, value) {
  return el("div", {}, [el("span", {}, [label]), el("b", {}, [value])]);
}

function shortDate(iso) {
  return formatLong(iso).replace(" ", "\n");
}

function compactDate(iso) {
  const [, month, day] = iso.split("-");
  return `${Number(day)}.${month}`;
}

function clampInt(value, min, max) {
  const number = Math.round(Number(value));
  if (!Number.isFinite(number)) return min;
  return Math.min(max, Math.max(min, number));
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null) continue;
    if (key === "class") node.className = value;
    else node.setAttribute(key, value);
  }
  for (const child of children) node.append(child);
  return node;
}
