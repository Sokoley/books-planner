/** Расчёты как в таблице «Планировщик чтения». */

export function todayISO(now = new Date()) {
  return toISO(now);
}

export function toISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function parseISO(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(iso, days) {
  const date = parseISO(iso);
  date.setDate(date.getDate() + days);
  return toISO(date);
}

export function daysBetween(from, to) {
  const ms = parseISO(to) - parseISO(from);
  return Math.round(ms / 86400000);
}

export function plural(n, one, few, many) {
  const abs = Math.abs(n);
  const n10 = abs % 10;
  const n100 = abs % 100;
  if (n10 === 1 && n100 !== 11) return one;
  if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return few;
  return many;
}

export function formatPages(n) {
  return new Intl.NumberFormat("ru-RU").format(n);
}

export function formatLong(iso) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
  }).format(parseISO(iso));
}

export function formatLongYear(iso) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })
    .format(parseISO(iso))
    .replace(/\s*г\.\s*$/, "");
}

export function formatMonth(iso) {
  const name = new Intl.DateTimeFormat("ru-RU", { month: "long" }).format(parseISO(iso));
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export function formatWeekday(iso) {
  const name = new Intl.DateTimeFormat("ru-RU", { weekday: "short" }).format(parseISO(iso));
  return name.replace(".", "");
}

export function relativeDay(iso, today) {
  const diff = daysBetween(today, iso);
  if (diff === 0) return "сегодня";
  if (diff === -1) return "вчера";
  if (diff === 1) return "завтра";
  return formatWeekday(iso);
}

/**
 * Изначальная план. дата:
 * старт + ceil(всего / план в день) − 1
 * (день старта уже входит в чтение).
 */
export function originalEndDate(book) {
  const pace = Math.max(1, book.pagesPerDay);
  const extra = Math.max(0, Math.ceil(book.totalPages / pace) - 1);
  return addDays(book.startDate, extra);
}

export function sortedEntries(book) {
  return Object.entries(book.entries || {})
    .map(([date, stopPage]) => ({ date, stopPage: Number(stopPage) }))
    .filter((entry) => entry.date && Number.isFinite(entry.stopPage))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function previousStop(book, date) {
  const earlier = sortedEntries(book).filter((entry) => entry.date < date);
  return earlier.length ? earlier[earlier.length - 1].stopPage : 0;
}

export function nextStop(book, date) {
  return sortedEntries(book).find((entry) => entry.date > date) || null;
}

/**
 * Новая дата окончания на строке дневника:
 * дата строки + ceil(остаток / план в день).
 * Остаток уже после чтения в этот день, поэтому отсчёт идёт вперёд от даты строки.
 */
export function forecastFrom(date, remaining, pagesPerDay) {
  if (remaining <= 0) return date;
  const pace = Math.max(1, pagesPerDay);
  return addDays(date, Math.ceil(remaining / pace));
}

export function dayRow(book, date) {
  const prevStop = previousStop(book, date);
  const planStart = book.totalPages - prevStop;
  const raw = book.entries?.[date];
  if (raw === undefined || raw === null || raw === "") {
    return {
      date,
      planStart,
      stopPage: null,
      read: null,
      remaining: null,
      newEnd: null,
      logged: false,
    };
  }
  const stopPage = Number(raw);
  const read = stopPage - prevStop;
  const remaining = book.totalPages - stopPage;
  return {
    date,
    planStart,
    stopPage,
    read,
    remaining,
    newEnd: forecastFrom(date, remaining, book.pagesPerDay),
    logged: true,
  };
}

export function lastLoggedRow(book) {
  const entries = sortedEntries(book);
  if (!entries.length) return null;
  return dayRow(book, entries[entries.length - 1].date);
}

export function currentRemaining(book) {
  const last = lastLoggedRow(book);
  return last ? last.remaining : book.totalPages;
}

export function currentStop(book) {
  const last = lastLoggedRow(book);
  return last ? last.stopPage : 0;
}

export function activeForecast(book) {
  const last = lastLoggedRow(book);
  if (last) return last.newEnd;
  return originalEndDate(book);
}

export function dateSpan(book, today) {
  const entries = sortedEntries(book);
  const finish = activeForecast(book, today);
  const original = originalEndDate(book);
  let start = book.startDate;
  if (entries.length && entries[0].date < start) start = entries[0].date;
  let end = [finish, original, today, book.startDate].sort().at(-1);
  if (entries.length && entries[entries.length - 1].date > end) {
    end = entries[entries.length - 1].date;
  }
  return { start, end };
}

export function eachDate(start, end) {
  const dates = [];
  let cursor = start;
  let guard = 0;
  while (cursor <= end && guard < 800) {
    dates.push(cursor);
    cursor = addDays(cursor, 1);
    guard += 1;
  }
  return dates;
}

export function validateStop(book, date, stopPage) {
  if (!Number.isInteger(stopPage)) return "Введи целый номер страницы";
  if (stopPage < 0 || stopPage > book.totalPages) {
    return `Страница должна быть от 0 до ${formatPages(book.totalPages)}`;
  }
  const prev = previousStop(book, date);
  if (stopPage < prev) {
    return `Не раньше предыдущей закладки — страница ${formatPages(prev)}`;
  }
  const next = nextStop(book, date);
  if (next && stopPage > next.stopPage) {
    return `Дальше уже стоит закладка ${formatPages(next.stopPage)} (${formatLong(next.date)})`;
  }
  return "";
}

export function previewLog(book, date, stopPage) {
  const prev = previousStop(book, date);
  const planStart = book.totalPages - prev;
  const read = stopPage - prev;
  const remaining = book.totalPages - stopPage;
  return {
    planStart,
    read,
    remaining,
    newEnd: forecastFrom(date, remaining, book.pagesPerDay),
  };
}

export function paceNote(book, today) {
  const remaining = currentRemaining(book);
  const original = originalEndDate(book);
  const forecast = activeForecast(book);
  const last = lastLoggedRow(book);
  if (remaining <= 0) {
    return {
      tone: "done",
      forecast,
      original,
      remaining,
      text: "Книга дочитана. Можно ставить её на полку.",
    };
  }
  const shift = daysBetween(original, forecast);
  let tone = "ok";
  let shiftText = "Финиш совпадает с изначальным планом.";
  if (shift > 0) {
    tone = "late";
    shiftText = `Финиш позже плана на ${shift} ${plural(shift, "день", "дня", "дней")}.`;
  } else if (shift < 0) {
    tone = "early";
    const ahead = Math.abs(shift);
    shiftText = `Финиш раньше плана на ${ahead} ${plural(ahead, "день", "дня", "дней")}.`;
  }
  const countFrom = last ? addDays(last.date, 1) : today;
  let daysLeft = daysBetween(countFrom, original) + 1;
  if (daysLeft < 1) daysLeft = 1;
  const need = Math.ceil(remaining / daysLeft);
  const daily = book.pagesPerDay;
  let paceText;
  if (need > daily) {
    paceText = `Чтобы успеть к ${formatLong(original)}, сейчас выходит около ${formatPages(need)} ${plural(need, "страницы", "страниц", "страниц")} в день.`;
  } else {
    paceText = `План ${formatPages(daily)} ${plural(daily, "страница", "страницы", "страниц")} в день пока держит дату ${formatLong(original)}.`;
  }
  return { tone, forecast, original, remaining, shift, need, text: `${shiftText} ${paceText}` };
}

export const SEED = {
  activeId: "mister",
  books: [
    {
      id: "mister",
      title: "Мистер вечный канун",
      totalPages: 1024,
      startDate: "2026-10-12",
      pagesPerDay: 30,
      entries: {
        "2026-10-12": 15,
        "2026-10-13": 62,
      },
    },
  ],
};
