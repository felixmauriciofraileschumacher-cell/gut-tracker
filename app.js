"use strict";

/* =========================================================================
   Gut Tracker — single-page app entry
   Year scope: 2026 only.
   ========================================================================= */

const APP_YEAR = 2026;
const STORAGE_KEY = "gut-tracker-entries";

const ACTIVITY_TYPES = {
  stool: { label: "Stool", icon: "gastroenterology" },
  urine: { label: "Urine", icon: "water" },
};

/* ---------- Date helpers ----------------------------------------------- */
function pad2(n) { return String(n).padStart(2, "0"); }

function ymd(date) {
  return date.getFullYear() + "-" + pad2(date.getMonth() + 1) + "-" + pad2(date.getDate());
}

function parseYmd(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatDayTitle(date) {
  // e.g. "Tue 19 May"
  return date.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function formatMonth(date) {
  return date.toLocaleDateString("en-GB", { month: "long" });
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

function clampToYear(date) {
  const start = new Date(APP_YEAR, 0, 1);
  const end = new Date(APP_YEAR, 11, 31);
  if (date < start) return start;
  if (date > end) return end;
  return date;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

/* ---------- Storage ---------------------------------------------------- */
function loadEntries() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    console.error("Could not load entries:", e);
    return [];
  }
}

function saveEntries(entries) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

function entriesForDate(date) {
  const key = ymd(date);
  return loadEntries().filter((e) => e.date === key);
}

/* ---------- Sample data ------------------------------------------------ */
// Seeds today (in 2026) with the sample activities requested. Only runs
// when there are no entries in storage yet.
function seedSampleIfEmpty(date) {
  if (loadEntries().length > 0) return;
  const samples = [
    { type: "stool", time: "09:00" },
    { type: "stool", time: "09:45" },
    { type: "urine", time: "10:00" },
    { type: "stool", time: "14:30" },
    { type: "urine", time: "15:00" },
    { type: "stool", time: "17:00" },
  ];
  const key = ymd(date);
  const entries = samples.map((s, i) => ({
    id: Date.now() + i,
    date: key,
    time: s.time,
    type: s.type,
  }));
  saveEntries(entries);
}

/* ---------- State ------------------------------------------------------ */
const state = {
  // Base view shown underneath any overlay: "day" | "month".
  view: "day",
  // Sheet stacked over the base view: null | "log" | "details".
  overlay: null,
  // The day currently visible. In month view it determines the month shown
  // (we use its year/month). Clamped into 2026 since that is the app's scope.
  currentDate: clampToYear(new Date()),
  // The in-progress draft for the Log screen. Null when not editing.
  draft: null,
  // When set, Save updates that entry in place instead of appending a new one.
  editingId: null,
  // The id of the entry currently shown on the Details screen.
  viewingId: null,
};

function findEntry(id) {
  return loadEntries().find((e) => e.id === id);
}

function newDraft() {
  const now = new Date();
  return {
    type: "stool",
    bristolType: null,
    amount: null,
    discomfort: null,
    date: ymd(now),
    time: pad2(now.getHours()) + ":" + pad2(now.getMinutes()),
    remarks: "",
  };
}

function draftFromEntry(entry) {
  return {
    type: entry.type,
    bristolType: entry.bristolType != null ? entry.bristolType : null,
    amount: entry.amount || null,
    discomfort: entry.discomfort || null,
    date: entry.date,
    time: entry.time,
    remarks: entry.remarks || "",
  };
}

function openLogScreen(prefill) {
  if (state.overlay === "log") return;
  state.draft = newDraft();
  // Optional prefill (e.g. tapping an empty slot in the Day grid seeds
  // the draft with that slot's date + time).
  if (prefill) Object.assign(state.draft, prefill);
  state.editingId = null;
  state.overlay = "log";
  // The base view (day or month) stays mounted; the log slides up over it.
  renderBaseView();
  showSheet("screen--log", renderLogScreen);
}

function closeLogScreen() {
  if (state.overlay !== "log") return;
  state.overlay = null;
  hideSheet("screen--log", () => {
    state.draft = null;
    state.editingId = null;
  });
}

function saveDraft() {
  const d = state.draft;
  if (!d) return closeLogScreen();
  const entries = loadEntries();
  const payload = {
    date: d.date,
    time: d.time,
    type: d.type,
    bristolType: d.type === "stool" ? d.bristolType : null,
    amount: d.type === "urine" ? d.amount : null,
    discomfort: d.discomfort,
    remarks: (d.remarks || "").trim(),
  };
  if (state.editingId != null) {
    const idx = entries.findIndex((e) => e.id === state.editingId);
    if (idx >= 0) entries[idx] = Object.assign({}, entries[idx], payload);
  } else {
    entries.push(Object.assign({ id: Date.now() }, payload));
  }
  saveEntries(entries);
  state.currentDate = clampToYear(parseYmd(d.date));
  state.overlay = null;
  // Refresh the base view BEFORE animating out, so the new entry / month
  // dot is visible underneath as the log slides down.
  renderBaseView();
  if (state.view === "day") {
    const [hh] = d.time.split(":").map(Number);
    scrollToHour(Number.isFinite(hh) ? hh : new Date().getHours());
  }
  hideSheet("screen--log", () => {
    state.draft = null;
    state.editingId = null;
  });
}

function updateDraft(patch) {
  if (!state.draft) return;
  Object.assign(state.draft, patch);
  updateLogContent();
}

/* --- Details screen navigation --- */
function openDetailsScreen(id) {
  if (state.overlay === "details") return;
  if (!findEntry(id)) return;
  state.viewingId = id;
  state.overlay = "details";
  renderBaseView();
  showSheet("screen--details", renderDetailsScreen);
}

function closeDetailsScreen() {
  if (state.overlay !== "details") return;
  state.overlay = null;
  hideSheet("screen--details", () => {
    state.viewingId = null;
  });
}

function deleteFromDetails() {
  if (state.viewingId == null) return;
  if (!confirm("Delete this activity?")) return;
  const removed = state.viewingId;
  const entries = loadEntries().filter((e) => e.id !== removed);
  saveEntries(entries);
  state.overlay = null;
  renderBaseView();
  hideSheet("screen--details", () => { state.viewingId = null; });
}

// Edit transitions from Details to Log without animating either out — the
// already-open sheet has its content swapped in place. Snappy and avoids
// a double-slide.
function editFromDetails() {
  const entry = findEntry(state.viewingId);
  if (!entry) return closeDetailsScreen();
  state.draft = draftFromEntry(entry);
  state.editingId = entry.id;
  state.viewingId = null;
  state.overlay = "log";
  const sheet = document.querySelector(".screen--details");
  if (!sheet) {
    // Edge case: sheet already gone, just open log normally.
    showSheet("screen--log", renderLogScreen);
    return;
  }
  sheet.classList.remove("screen--details");
  sheet.classList.add("screen--log");
  sheet.innerHTML = "";
  sheet.append(renderLogHeader(), renderLogForm(), renderLogFooter());
}

/* --- Day / Month view navigation --- */
function openMonthView() {
  if (state.view === "month") return;
  state.view = "month";
  renderBaseView();
}

function openDayViewAtToday() {
  state.view = "day";
  state.currentDate = clampToYear(new Date());
  renderBaseView();
  scrollToCurrentHour();
}

function openDayViewAtDate(date) {
  state.view = "day";
  state.currentDate = clampToYear(date);
  renderBaseView();
}

function goToMonth(delta) {
  const d = new Date(state.currentDate);
  d.setDate(1); // avoid month overflow with day numbers > 28
  d.setMonth(d.getMonth() + delta);
  if (d.getFullYear() !== APP_YEAR) return; // clamp to 2026 — no-op
  state.currentDate = d;
  renderBaseView();
  slideInBase(delta > 0 ? "forward" : "backward");
}

// Directional slide-in for prev/next navigation on the base view.
// Uses the Web Animations API so rapid presses (each rendering a fresh
// element) get their own clean animation — no class accumulation or
// animationend race. View-type changes (day↔month) intentionally skip
// this and stay instant.
function slideInBase(direction) {
  // Animate the .screen-body wrapper, NOT the whole screen, so the top
  // header and the floating Add button stay static during the transition.
  const body = document.querySelector(
    ".screen--day > .screen-body, .screen--month > .screen-body",
  );
  if (!body || !body.animate) return; // graceful no-op without WAAPI
  const fromX = direction === "forward" ? "20%" : "-20%";
  body.animate(
    [
      { opacity: 0, transform: "translateX(" + fromX + ")" },
      { opacity: 1, transform: "translateX(0)" },
    ],
    {
      duration: 200,
      easing: "cubic-bezier(0.16, 1, 0.3, 1)",
    },
  );
}

/* ---------- View dispatch --------------------------------------------- */
// The base view (Day Time Grid or Month View) is always mounted as the
// bottom layer. Overlay sheets (Log, Details) are mounted on top as
// absolutely-positioned siblings that slide up over the base. This lets
// us animate transitions without unmounting/remounting the base below.
function renderApp() {
  renderBaseView();
  if (state.overlay === "log" && state.draft) showSheet("screen--log", renderLogScreen);
  else if (state.overlay === "details" && state.viewingId != null) showSheet("screen--details", renderDetailsScreen);
}

function renderBaseView() {
  const root = document.getElementById("app");
  const newBase = state.view === "month" ? renderMonthView() : renderDayTimeGrid();
  const oldBase = root.querySelector(".screen--day, .screen--month");
  if (oldBase) {
    oldBase.replaceWith(newBase);
  } else {
    root.innerHTML = "";
    root.appendChild(newBase);
  }
}

// Generic sheet open/close — used by both the Log and Details screens.
// className: the sheet's distinguishing class (e.g. "screen--log").
// builder: function returning the sheet's root element.
function showSheet(className, builder) {
  const root = document.getElementById("app");
  if (root.querySelector("." + className)) return; // already mounted
  const sheet = builder();
  sheet.classList.add("is-entering");
  root.appendChild(sheet);
  document.body.classList.add("sheet-open");
  // Double rAF: append happens, layout settles, then we drop the
  // is-entering class so the CSS transition runs.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => sheet.classList.remove("is-entering"));
  });
}

function updateLogContent() {
  const log = document.querySelector(".screen--log");
  if (!log) return;
  log.innerHTML = "";
  log.append(renderLogHeader(), renderLogForm(), renderLogFooter());
}

function hideSheet(className, onDone) {
  const sheet = document.querySelector("." + className);
  if (!sheet) { onDone && onDone(); return; }
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    sheet.remove();
    // Only release the body scroll lock if no other sheet is still open.
    if (!document.querySelector(".screen--log, .screen--details")) {
      document.body.classList.remove("sheet-open");
    }
    onDone && onDone();
  };
  sheet.addEventListener("transitionend", (e) => {
    if (e.propertyName === "transform") finish();
  });
  sheet.classList.add("is-exiting");
  // Safety net in case transitionend doesn't fire (e.g. tab inactive).
  setTimeout(finish, 500);
}

function renderDayTimeGrid() {
  const screen = el("div", { class: "screen screen--day" });
  // .screen-body wraps the per-day content so the slide animation can
  // target only it — the header and FAB are siblings and stay static.
  screen.append(
    renderHeader(),
    el("div", { class: "screen-body" }, [renderDayNav(), renderTimeGrid()]),
    renderFab(),
  );
  return screen;
}

function renderHeader() {
  const toggle = el("button", {
    class: "gt-day-month-toggle",
    type: "button",
    "aria-label": "Switch to month view",
  }, [
    icon("calendar_today", "icon-24"),
    el("span", { class: "gt-day-month-toggle__label" }, formatMonth(state.currentDate)),
  ]);
  toggle.addEventListener("click", openMonthView);
  return el("header", { class: "gt-header" }, [toggle, renderHeaderSide()]);
}

function renderHeaderSide() {
  return el("div", { class: "gt-header__side" }, [
    el("button", { class: "gt-icon-btn", type: "button", "aria-label": "Filter" }, [
      icon("filter_list", "icon-32"),
    ]),
    el("button", { class: "gt-icon-btn", type: "button", "aria-label": "Export" }, [
      icon("drive_folder_upload", "icon-32"),
    ]),
  ]);
}

function renderDayNav() {
  const today = new Date();
  const isCurrent = isSameDay(state.currentDate, today);

  const prevBtn = el("button", {
    class: "gt-day-nav__btn gt-day-nav__btn--prev",
    type: "button",
    "aria-label": "Previous day",
  }, [icon("chevron_right", "icon-24 icon-w200")]);

  const nextBtn = el("button", {
    class: "gt-day-nav__btn gt-day-nav__btn--next",
    type: "button",
    "aria-label": "Next day",
  }, [icon("chevron_right", "icon-24 icon-w200")]);

  prevBtn.addEventListener("click", () => goToDay(-1));
  nextBtn.addEventListener("click", () => goToDay(1));

  const titleClasses = ["gt-day-nav__title"];
  if (isCurrent) titleClasses.push("gt-day-nav__title--current");

  return el("nav", { class: "gt-day-nav", "aria-label": "Day navigation" }, [
    prevBtn,
    el("div", { class: titleClasses.join(" ") }, formatDayTitle(state.currentDate)),
    nextBtn,
  ]);
}

function goToDay(delta) {
  const next = clampToYear(addDays(state.currentDate, delta));
  // No-op at year boundaries — also skips the animation.
  if (isSameDay(next, state.currentDate)) return;
  state.currentDate = next;
  renderBaseView();
  slideInBase(delta > 0 ? "forward" : "backward");
}

function renderTimeGrid() {
  const grid = el("main", { class: "gt-time-grid", id: "gt-time-grid" });
  const buckets = bucketEntries(entriesForDate(state.currentDate));

  // The "now band": when looking at today, highlight the label for the
  // current hour and the one after. At 07:30 → 07:00 and 08:00; at 08:00
  // exactly → 08:00 and 09:00. Off on any non-today date.
  const now = new Date();
  const isToday = isSameDay(state.currentDate, now);
  const currentHour = now.getHours();

  for (let h = 0; h < 24; h++) {
    const isNow = isToday && (h === currentHour || h === currentHour + 1);
    grid.appendChild(renderHour(h, buckets[h], false, isNow));
  }
  // Final terminator row "00:00" represents the next day's midnight.
  // When the current hour is 23, the next-hour part of the band lands on
  // the terminator, so highlight it too.
  grid.appendChild(renderHour(0, null, /* terminator */ true, isToday && currentHour === 23));

  return grid;
}

function renderHour(hour, slots, isTerminator, isNow) {
  const classes = ["gt-hour"];
  if (isTerminator) classes.push("gt-hour--terminator");
  if (isNow) classes.push("gt-hour--now");
  const wrap = el("section", {
    class: classes.join(" "),
    "data-hour": hour,
  });

  wrap.appendChild(el("div", { class: "gt-hour__row" }, [
    el("span", { class: "gt-hour__label" }, pad2(hour) + ":00"),
    el("span", { class: "gt-hour__divider" }),
  ]));

  if (isTerminator) return wrap;

  const slotsEl = el("div", { class: "gt-hour__slots" });
  for (let s = 0; s < 4; s++) {
    slotsEl.appendChild(renderSlot(slots[s], hour, s));
  }
  wrap.appendChild(slotsEl);
  return wrap;
}

function renderSlot(activities, hour, slotIndex) {
  // Empty slot → render the slot itself as a button so a tap opens the Log
  // sheet pre-filled with this slot's date + time (start of the 15-min
  // window). The invisible placeholder stays inside to preserve height.
  if (!activities || activities.length === 0) {
    const time = pad2(hour) + ":" + pad2(slotIndex * 15);
    const btn = el("button", {
      class: "gt-slot gt-slot--empty",
      type: "button",
      "aria-label": "Add activity at " + time,
    });
    btn.appendChild(activityBlock({ type: "stool" }, /* placeholder */ true));
    btn.addEventListener("click", () => openLogScreen({
      date: ymd(state.currentDate),
      time: time,
    }));
    return btn;
  }
  const slot = el("div", { class: "gt-slot" });
  for (const a of activities) slot.appendChild(activityBlock(a, false));
  return slot;
}

function activityBlock(activity, isPlaceholder) {
  const meta = ACTIVITY_TYPES[activity.type] || ACTIVITY_TYPES.stool;
  const classes = ["gt-activity"];
  if (isPlaceholder) classes.push("gt-activity--placeholder");

  if (isPlaceholder) {
    return el("div", { class: classes.join(" "), "aria-hidden": "true" }, [
      el("span", { class: "material-symbols-outlined gt-activity__icon" }, meta.icon),
      el("span", { class: "gt-activity__label" }, meta.label),
    ]);
  }

  const btn = el("button", {
    class: classes.join(" "),
    type: "button",
    "aria-label": meta.label + " at " + activity.time,
  }, [
    el("span", { class: "material-symbols-outlined gt-activity__icon" }, meta.icon),
    el("span", { class: "gt-activity__label" }, meta.label),
  ]);
  btn.addEventListener("click", () => openDetailsScreen(activity.id));
  return btn;
}

function renderFab() {
  const btn = el("button", {
    class: "gt-fab",
    type: "button",
    "aria-label": "Add a new activity",
  }, [
    el("span", { class: "material-symbols-outlined gt-fab__icon" }, "add"),
    el("span", null, "Add"),
  ]);
  btn.addEventListener("click", openLogScreen);
  return btn;
}

/* ---------- View: Month View ------------------------------------------ */
const WEEKDAYS_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function renderMonthView() {
  const screen = el("div", { class: "screen screen--month" });
  // .screen-body wraps the per-month content; header + FAB stay static.
  screen.append(
    renderMonthHeader(),
    el("div", { class: "screen-body" }, [renderMonthNav(), renderMonthGrid()]),
    renderFab(),
  );
  return screen;
}

function renderMonthHeader() {
  const toggle = el("button", {
    class: "gt-day-month-toggle",
    type: "button",
    "aria-label": "Switch to day view for today",
  }, [
    icon("calendar_view_day", "icon-24"),
    el("span", { class: "gt-day-month-toggle__label" }, "Today"),
  ]);
  toggle.addEventListener("click", openDayViewAtToday);
  return el("header", { class: "gt-header" }, [toggle, renderHeaderSide()]);
}

function renderMonthNav() {
  const month = state.currentDate.getMonth();
  const atJan = month === 0;
  const atDec = month === 11;

  const prevBtn = el("button", {
    class: "gt-day-nav__btn gt-day-nav__btn--prev",
    type: "button",
    "aria-label": "Previous month",
    disabled: atJan ? "" : null,
  }, [icon("chevron_right", "icon-24 icon-w200")]);
  if (!atJan) prevBtn.addEventListener("click", () => goToMonth(-1));

  const nextBtn = el("button", {
    class: "gt-day-nav__btn gt-day-nav__btn--next",
    type: "button",
    "aria-label": "Next month",
    disabled: atDec ? "" : null,
  }, [icon("chevron_right", "icon-24 icon-w200")]);
  if (!atDec) nextBtn.addEventListener("click", () => goToMonth(1));

  return el("nav", { class: "gt-month-nav", "aria-label": "Month navigation" }, [
    prevBtn,
    el("div", { class: "gt-month-nav__pill" }, formatMonth(state.currentDate)),
    nextBtn,
  ]);
}

function renderMonthGrid() {
  const wrap = el("div", { class: "gt-month-grid" });
  // Weekday header
  const weekdays = el("div", { class: "gt-month-weekdays" });
  for (const w of WEEKDAYS_SHORT) {
    weekdays.appendChild(el("div", { class: "gt-month-weekday" }, w));
  }
  wrap.appendChild(weekdays);

  // Build only as many rows as the month actually needs (4–6).
  const { cells, rows } = buildMonthGrid(
    state.currentDate.getFullYear(),
    state.currentDate.getMonth(),
  );
  const weeks = el("div", { class: "gt-month-weeks" });
  for (let w = 0; w < rows; w++) {
    const row = el("div", { class: "gt-month-week" });
    for (let d = 0; d < 7; d++) {
      row.appendChild(renderMonthDay(cells[w * 7 + d]));
    }
    weeks.appendChild(row);
  }
  wrap.appendChild(weeks);
  return wrap;
}

function buildMonthGrid(year, month) {
  // Start from the Monday of the week containing the 1st of the month.
  const first = new Date(year, month, 1);
  const dow = (first.getDay() + 6) % 7; // 0=Mon..6=Sun (ISO)
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  // Trailing rows that contain only next-month days are dropped.
  // rows is always 4, 5, or 6 — never less, never more.
  const rows = Math.ceil((dow + daysInMonth) / 7);
  const cellCount = rows * 7;
  const start = new Date(year, month, 1 - dow);
  const cells = [];
  const today = new Date();
  for (let i = 0; i < cellCount; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    cells.push({
      date: d,
      inMonth: d.getMonth() === month,
      isToday: isSameDay(d, today),
      count: countActivitiesForDate(d),
    });
  }
  return { cells, rows };
}

function countActivitiesForDate(date) {
  const key = ymd(date);
  return loadEntries().reduce((n, e) => n + (e.date === key ? 1 : 0), 0);
}

function renderMonthDay(cell) {
  const classes = ["gt-month-day"];
  if (cell.isToday) classes.push("gt-month-day--current");

  const num = el("span", {
    class: "gt-month-day__num" + (cell.inMonth ? "" : " gt-month-day__num--muted"),
  }, String(cell.date.getDate()));

  const cappedCount = Math.min(3, cell.count);
  const marking = el("div", {
    class: "gt-month-marking" + (cappedCount > 0 ? " gt-month-marking--" + cappedCount : ""),
  });
  for (let i = 0; i < cappedCount; i++) {
    marking.appendChild(el("span", { class: "gt-month-dot" }));
  }

  const btn = el("button", {
    class: classes.join(" "),
    type: "button",
    "aria-label": cell.date.toLocaleDateString("en-GB", {
      weekday: "long", day: "numeric", month: "long", year: "numeric",
    }) + " — " + cell.count + (cell.count === 1 ? " activity" : " activities"),
  }, [num, marking]);

  btn.addEventListener("click", () => openDayViewAtDate(cell.date));
  return btn;
}

/* ---------- View: Log screen ------------------------------------------ */
const DISCOMFORT_LEVELS = [
  { value: "none", label: "None", muted: true },
  { value: "low", label: "Low" },
  { value: "med", label: "Med" },
  { value: "high", label: "High" },
];

const AMOUNT_LEVELS = [
  { value: "low", label: "Low" },
  { value: "med", label: "Med" },
  { value: "high", label: "High" },
];

function renderLogScreen() {
  const screen = el("div", { class: "screen screen--log" });
  screen.append(renderLogHeader(), renderLogForm(), renderLogFooter());
  return screen;
}

function renderLogHeader() {
  const saveBtn = el("button", { class: "gt-icon-btn", type: "button", "aria-label": "Save" },
    [icon("save", "icon-32")]);
  const closeBtn = el("button", { class: "gt-icon-btn", type: "button", "aria-label": "Close" },
    [icon("close", "icon-32")]);
  saveBtn.addEventListener("click", saveDraft);
  closeBtn.addEventListener("click", closeLogScreen);
  return el("header", { class: "gt-log-header" }, [saveBtn, closeBtn]);
}

function renderLogForm() {
  const form = el("form", { class: "gt-log-form", id: "gt-log-form" });
  form.addEventListener("submit", (e) => { e.preventDefault(); saveDraft(); });
  const isStool = state.draft.type === "stool";
  form.append(
    renderActivityTypeField(),
    isStool ? renderBristolField() : renderAmountField(),
    renderDiscomfortField(),
    renderDateTimeField(),
    renderRemarksField(),
  );
  return form;
}

function renderLogFooter() {
  const btn = el("button", { class: "gt-primary-btn", type: "button" }, [
    icon("save", "icon-32"),
    el("span", null, "Save"),
  ]);
  btn.addEventListener("click", saveDraft);
  return el("footer", { class: "gt-log-footer" }, [btn]);
}

/* --- Activity type field --- */
function renderActivityTypeField() {
  const types = [
    { value: "stool", label: "Stool", icon: "gastroenterology" },
    { value: "urine", label: "Urine", icon: "water" },
  ];
  const row = el("div", { class: "gt-choice-row" });
  for (const t of types) {
    const selected = state.draft.type === t.value;
    const btn = el("button", {
      class: "gt-choice gt-choice--activity",
      type: "button",
      "aria-pressed": String(selected),
    }, [
      icon(t.icon, "icon-32"),
      el("span", null, t.label),
    ]);
    btn.addEventListener("click", () => {
      if (state.draft.type !== t.value) updateDraft({ type: t.value });
    });
    row.appendChild(btn);
  }
  return field("Activity type", row);
}

/* --- Bristol field (stool only) --- */
function renderBristolField() {
  const grid = el("div", { class: "gt-bristol" });
  // Indicator row (non-interactive)
  const sel = state.draft.bristolType;
  const lumpyActive  = sel === 1 || sel === 2;
  const normalActive = sel === 3 || sel === 4;
  const liquidActive = sel === 5 || sel === 6 || sel === 7;
  grid.appendChild(bristolIndicator("Lumpy", "lumpy", lumpyActive));
  grid.appendChild(bristolIndicator("Normal", "normal", normalActive));
  grid.appendChild(bristolIndicator("Liquid", "liquid", liquidActive));
  // Numbers 1..7
  for (let n = 1; n <= 7; n++) {
    const selected = sel === n;
    const num = el("button", {
      class: "gt-bristol-num",
      type: "button",
      "aria-pressed": String(selected),
    }, String(n));
    num.addEventListener("click", () => {
      updateDraft({ bristolType: selected ? null : n });
    });
    grid.appendChild(num);
  }
  return field("Bristol stool type", grid);
}

function bristolIndicator(label, kind, active) {
  return el("div", {
    class: "gt-bristol-ind gt-bristol-ind--" + kind + (active ? " gt-bristol-ind--active" : ""),
    "aria-hidden": "true",
  }, label);
}

/* --- Amount field (urine only) --- */
function renderAmountField() {
  return field("Amount", choiceRow(AMOUNT_LEVELS, state.draft.amount, (v) => {
    updateDraft({ amount: state.draft.amount === v ? null : v });
  }));
}

/* --- Discomfort field --- */
function renderDiscomfortField() {
  return field("Experienced discomfort",
    choiceRow(DISCOMFORT_LEVELS, state.draft.discomfort, (v) => {
      updateDraft({ discomfort: state.draft.discomfort === v ? null : v });
    })
  );
}

function choiceRow(options, currentValue, onSelect) {
  const row = el("div", { class: "gt-choice-row" });
  for (const opt of options) {
    const selected = currentValue === opt.value;
    const classes = ["gt-choice"];
    if (opt.muted && !selected) classes.push("gt-choice--muted");
    const btn = el("button", {
      class: classes.join(" "),
      type: "button",
      "aria-pressed": String(selected),
    }, opt.label);
    btn.addEventListener("click", () => onSelect(opt.value));
    row.appendChild(btn);
  }
  return row;
}

/* --- Date & time field --- */
function renderDateTimeField() {
  const dateInput = el("input", {
    class: "gt-input",
    type: "date",
    value: state.draft.date,
    min: APP_YEAR + "-01-01",
    max: APP_YEAR + "-12-31",
    "aria-label": "Date",
  });
  dateInput.addEventListener("change", (e) => {
    // Re-render keeps the draft in sync, but reactively swapping the
    // <input> while focused would lose focus — so just update state
    // without re-rendering until another field changes.
    state.draft.date = e.target.value;
  });

  const timeInput = el("input", {
    class: "gt-input",
    type: "time",
    value: state.draft.time,
    "aria-label": "Time",
  });
  timeInput.addEventListener("change", (e) => {
    state.draft.time = e.target.value;
  });

  const row = el("div", { class: "gt-choice-row" }, [dateInput, timeInput]);
  return field("Date & time", row);
}

/* --- Remarks field --- */
function renderRemarksField() {
  const ta = el("textarea", {
    class: "gt-textarea",
    placeholder: "Type your remarks here ...",
    rows: "3",
  });
  ta.value = state.draft.remarks || "";
  ta.addEventListener("input", (e) => { state.draft.remarks = e.target.value; });
  const f = field("Remarks (Optional)", ta);
  f.classList.add("gt-field--remarks");
  return f;
}

/* --- Helpers --- */
function field(label, control) {
  return el("section", { class: "gt-field" }, [
    el("p", { class: "gt-field__label" }, label),
    control,
  ]);
}

/* ---------- View: Activity Details ------------------------------------ */
function renderDetailsScreen() {
  const screen = el("div", { class: "screen screen--details" });
  screen.append(renderDetailsHeader(), renderDetailsBody(), renderDetailsFooter());
  return screen;
}

function renderDetailsHeader() {
  const delBtn = el("button", { class: "gt-icon-btn", type: "button", "aria-label": "Delete" },
    [icon("delete", "icon-32")]);
  const closeBtn = el("button", { class: "gt-icon-btn", type: "button", "aria-label": "Close" },
    [icon("close", "icon-32")]);
  delBtn.addEventListener("click", deleteFromDetails);
  closeBtn.addEventListener("click", closeDetailsScreen);
  return el("header", { class: "gt-log-header" }, [delBtn, closeBtn]);
}

function renderDetailsBody() {
  const entry = findEntry(state.viewingId);
  const body = el("div", { class: "gt-det-body" });
  if (!entry) {
    body.appendChild(el("p", { class: "gt-det-value" }, "Entry not found."));
    return body;
  }
  const meta = ACTIVITY_TYPES[entry.type] || ACTIVITY_TYPES.stool;

  // 1. Activity type
  body.appendChild(detailRow(iconNode(meta.icon), "Activity type", meta.label));

  // 2. Bristol scale (stool) or Amount (urine)
  if (entry.type === "stool" && entry.bristolType != null) {
    const group = bristolGroupLabel(entry.bristolType);
    body.appendChild(detailRow(
      bristolThumbnail(entry.bristolType),
      "Bristol stool type",
      [span("Type " + entry.bristolType), dotSep(), span(group)],
    ));
  } else if (entry.type === "urine" && entry.amount) {
    body.appendChild(detailRow(iconNode("water_drop"), "Amount", amountLabel(entry.amount)));
  }

  // 3. Experienced discomfort
  if (entry.discomfort) {
    body.appendChild(detailRow(iconNode("symptoms"), "Experienced discomfort",
      discomfortLabel(entry.discomfort)));
  }

  // 4. Date & time
  body.appendChild(detailRow(
    iconNode("calendar_today"),
    "Date & time",
    [span(formatDayTitle(parseYmd(entry.date))), dotSep(), span(entry.time)],
  ));

  // 5. Remarks — only shown when present.
  const remarks = (entry.remarks || "").trim();
  if (remarks) {
    body.appendChild(detailRow(iconNode("edit_note"), "Remarks", remarks, /* startAlign */ true));
  }

  return body;
}

function renderDetailsFooter() {
  const btn = el("button", { class: "gt-primary-btn", type: "button" }, [
    icon("edit", "icon-32"),
    el("span", null, "Edit"),
  ]);
  btn.addEventListener("click", editFromDetails);
  return el("footer", { class: "gt-log-footer" }, [btn]);
}

function detailRow(iconEl, label, value, startAlign) {
  const row = el("div", { class: "gt-det-row" + (startAlign ? " gt-det-row--start" : "") });
  // Start-aligned rows (Remarks) wrap the leading icon in a padded
  // box so it visually lines up with the first line of multi-line text.
  if (startAlign) {
    const wrap = el("div", { class: "gt-det-leading-wrap" });
    wrap.appendChild(iconEl);
    row.appendChild(wrap);
  } else {
    row.appendChild(iconEl);
  }
  const content = el("div", { class: "gt-det-content" });
  content.appendChild(el("p", { class: "gt-det-label" }, label));
  const valueEl = el("p", { class: "gt-det-value" });
  if (Array.isArray(value)) {
    for (const v of value) appendChild(valueEl, v);
  } else {
    valueEl.textContent = value;
  }
  content.appendChild(valueEl);
  row.appendChild(content);
  return row;
}

function iconNode(name) {
  return el("span", { class: "material-symbols-outlined icon-32 gt-det-leading" }, name);
}

function bristolThumbnail(n) {
  return el("div", { class: "gt-det-leading gt-det-thumbnail" }, String(n));
}

function dotSep() {
  return el("span", { class: "gt-det-dot", "aria-hidden": "true" });
}

function span(text) {
  return el("span", null, text);
}

function bristolGroupLabel(n) {
  if (n <= 2) return "Lumpy";
  if (n <= 4) return "Normal";
  return "Liquid";
}

function discomfortLabel(v) {
  return { none: "None", low: "Low", med: "Medium", high: "High" }[v] || v;
}

function amountLabel(v) {
  return { low: "Low", med: "Medium", high: "High" }[v] || v;
}

/* ---------- Bucketing -------------------------------------------------- */
function bucketEntries(entries) {
  // hours[0..23] = [slot0, slot1, slot2, slot3] of activity arrays
  const buckets = Array.from({ length: 24 }, () => [[], [], [], []]);
  for (const e of entries) {
    const [hh, mm] = e.time.split(":").map(Number);
    if (Number.isNaN(hh) || Number.isNaN(mm)) continue;
    const slot = Math.min(3, Math.floor(mm / 15));
    if (hh >= 0 && hh < 24) buckets[hh][slot].push(e);
  }
  return buckets;
}

/* ---------- Scroll behaviour ------------------------------------------- */
// Called once at boot to land on the current hour. NOT called when the
// Log or Details sheets close — those keep the user's scroll position.
function scrollToCurrentHour() {
  const now = new Date();
  if (!isSameDay(state.currentDate, now)) return;
  scrollToHour(now.getHours());
}

// Used after saving a new entry to land the user on the entry's hour.
function scrollToHour(hour) {
  const targetHour = Math.max(0, Math.min(23, hour));
  const target = document.querySelector(
    '#gt-time-grid .gt-hour[data-hour="' + targetHour + '"]'
  );
  if (!target) return;
  const stickyOffset = parseInt(getCssVar("--gut-header-h"), 10)
    + parseInt(getCssVar("--gut-day-nav-h"), 10)
    + 8;
  const y = target.getBoundingClientRect().top + window.scrollY - stickyOffset;
  window.scrollTo({ top: Math.max(0, y), behavior: "auto" });
}

function getCssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/* ---------- DOM helpers ------------------------------------------------ */
function el(tag, attrs, children) {
  const node = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === "class") node.className = v;
      else node.setAttribute(k, v);
    }
  }
  if (children == null) return node;
  if (Array.isArray(children)) {
    for (const c of children) appendChild(node, c);
  } else {
    appendChild(node, children);
  }
  return node;
}

function appendChild(parent, child) {
  if (child == null) return;
  if (typeof child === "string" || typeof child === "number") {
    parent.appendChild(document.createTextNode(String(child)));
  } else {
    parent.appendChild(child);
  }
}

function icon(name, extraClass) {
  return el("span", {
    class: "material-symbols-outlined" + (extraClass ? " " + extraClass : ""),
    "aria-hidden": "true",
  }, name);
}

/* ---------- Bootstrap -------------------------------------------------- */
document.addEventListener("DOMContentLoaded", () => {
  seedSampleIfEmpty(state.currentDate);
  // Dev convenience:
  //   ?month=1  — boot the Month View as the base view
  //   ?log=1    — open the Log sheet (optionally &type=urine|stool, &bristol=N)
  //   ?details=first|last|<id>  — open Details on a stored entry
  const qs = new URLSearchParams(location.search);
  if (qs.get("month") === "1") {
    state.view = "month";
  }
  if (qs.get("log") === "1") {
    state.draft = newDraft();
    const t = qs.get("type");
    if (t === "urine" || t === "stool") state.draft.type = t;
    const b = parseInt(qs.get("bristol"), 10);
    if (b >= 1 && b <= 7) state.draft.bristolType = b;
    state.overlay = "log";
  } else if (qs.get("details")) {
    const want = qs.get("details");
    const list = loadEntries();
    let entry;
    if (want === "first") entry = list[0];
    else if (want === "last") entry = list[list.length - 1];
    else entry = list.find((e) => String(e.id) === want);
    if (entry) {
      state.viewingId = entry.id;
      state.overlay = "details";
    }
  }
  renderApp();
  // Land on the current hour ONLY at boot (page open / refresh) and only
  // when the day view is the base AND no overlay is open.
  if (state.view === "day" && !state.overlay) scrollToCurrentHour();
});

// When the user re-foregrounds the app (visibilitychange fires on PWA
// resume / tab switch back), refresh the day view so the "now hour" band
// catches up. Skip when an overlay is open — the form state shouldn't be
// touched while the user is mid-edit.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  if (state.view === "day" && !state.overlay) renderBaseView();
});

/* ---------- Service worker registration -------------------------------- */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./service-worker.js")
      .catch((err) => console.warn("SW registration failed:", err));
  });
}
