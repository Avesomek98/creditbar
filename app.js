(() => {
  "use strict";

  // Bump this on every meaningful deploy so it's obvious from the footer
  // whether an iPhone actually picked up the update.
  const APP_VERSION = "0.5.1";

  const STORAGE_KEY = "creditbar:loans:v1";
  const SORT_KEY = "creditbar:sort:v1";

  const currency = new Intl.NumberFormat("pl-PL", {
    style: "currency",
    currency: "PLN",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  // Whole-złoty formatting for tight spaces (dashboard stat chips).
  const currencyCompact = new Intl.NumberFormat("pl-PL", {
    style: "currency",
    currency: "PLN",
    maximumFractionDigits: 0,
  });

  const dateFmt = new Intl.DateTimeFormat("pl-PL", { day: "2-digit", month: "2-digit", year: "numeric" });

  const BANK_GRADIENTS = [
    ["#f59e0b", "#c2410c"], ["#f43f5e", "#e11d48"], ["#10b981", "#059669"],
    ["#a855f7", "#7e22ce"], ["#84cc16", "#4d7c0f"], ["#14b8a6", "#0f766e"],
    ["#ec4899", "#be185d"], ["#fb923c", "#c2410c"],
  ];

  // Przybliżone barwy marki znanych banków (nie oficjalne logo) — dla
  // rozpoznawalności avatara na karcie. Nierozpoznana nazwa banku spada
  // na hash-owaną paletę BANK_GRADIENTS poniżej.
  const KNOWN_BANK_COLORS = {
    "pko bp": ["#d1132a", "#8f0e1d"],
    "pko": ["#d1132a", "#8f0e1d"],
    "mbank": ["#e2001a", "#a3000f"],
    "ing": ["#ff6200", "#c94e00"],
    "santander": ["#ec0000", "#a60000"],
    "santander consumer bank": ["#ec0000", "#a60000"],
    "millennium": ["#e6007e", "#a3005b"],
    "bank millennium": ["#e6007e", "#a3005b"],
    "alior bank": ["#00b2a9", "#00847c"],
    "alior": ["#00b2a9", "#00847c"],
    "credit agricole": ["#00975f", "#016b43"],
    "bnp paribas": ["#00915a", "#00693f"],
    "pekao": ["#1e3a5f", "#0f2338"],
    "bank pekao": ["#1e3a5f", "#0f2338"],
    "citi handlowy": ["#003b70", "#00284d"],
    "citibank": ["#003b70", "#00284d"],
    "raiffeisen": ["#fff200", "#ccc200"],
    "nest bank": ["#7ac143", "#5a9130"],
    "velobank": ["#6c2eb9", "#4b1f80"],
    "bos": ["#00954b", "#00713a"],
    "bank ochrony środowiska": ["#00954b", "#00713a"],
    "toyota bank": ["#eb0a1e", "#a60712"],
  };

  function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
    return hash;
  }

  function gradientForBank(bank) {
    const known = KNOWN_BANK_COLORS[bank.trim().toLowerCase()];
    if (known) return known;
    return BANK_GRADIENTS[hashString(bank) % BANK_GRADIENTS.length];
  }

  function initialsForBank(bank) {
    const words = bank.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return "?";
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return (words[0][0] + words[1][0]).toUpperCase();
  }

  function progressBucket(pct) {
    if (pct >= 67) return "p-high";
    if (pct >= 34) return "p-mid";
    return "p-low";
  }

  const RING_R = 52;
  const RING_CIRCUMFERENCE = 2 * Math.PI * RING_R;

  // ---- Calculation core: single source of truth for every derived number ----
  // Dashboard totals and per-card figures both funnel through these, so they
  // can never disagree (e.g. a card showing 75% while the dashboard says 73%).

  function round2(n) {
    return Math.round(n * 100) / 100;
  }

  function paidAmount(loan) {
    return Math.max(0, round2((loan.total || 0) - (loan.remaining || 0)));
  }

  function progressPct(loan) {
    if (!loan.total || loan.total <= 0) return 0;
    return Math.min(100, Math.max(0, (paidAmount(loan) / loan.total) * 100));
  }

  function remainingInstallments(loan) {
    if (!loan.installmentsTotal) return null;
    return Math.max(0, loan.installmentsTotal - (loan.installmentsPaid || 0));
  }

  function isPaidOff(loan) {
    return (loan.total || 0) > 0 && (loan.remaining || 0) <= 0;
  }

  function addMonths(dateStr, count) {
    const d = new Date(dateStr);
    d.setMonth(d.getMonth() + count);
    return d.toISOString().slice(0, 10);
  }

  function todayStr() {
    return new Date().toISOString().slice(0, 10);
  }

  function projectedPayoffDate(loan) {
    if (isPaidOff(loan)) return null;
    if (!loan.monthly || loan.monthly <= 0 || !loan.remaining || loan.remaining <= 0) return null;
    const monthsNeeded = Math.ceil(loan.remaining / loan.monthly);
    if (loan.nextDate) return addMonths(loan.nextDate, monthsNeeded - 1);
    return addMonths(todayStr(), monthsNeeded);
  }

  function aggregate(list) {
    const totalRemaining = list.reduce((s, l) => s + (l.remaining || 0), 0);
    const totalOriginal = list.reduce((s, l) => s + (l.total || 0), 0);
    const totalPaid = list.reduce((s, l) => s + paidAmount(l), 0);
    const totalMonthly = list.reduce((s, l) => s + (l.monthly || 0), 0);
    const overallPct = totalOriginal > 0
      ? Math.min(100, Math.max(0, (totalPaid / totalOriginal) * 100))
      : 0;

    const activeLoans = list.filter((l) => !isPaidOff(l));

    let nearestPaymentLoan = null;
    for (const l of activeLoans) {
      if (!l.nextDate) continue;
      if (!nearestPaymentLoan || l.nextDate < nearestPaymentLoan.nextDate) nearestPaymentLoan = l;
    }

    let mostAdvancedLoan = null;
    let bestPct = -1;
    for (const l of activeLoans) {
      const p = progressPct(l);
      if (p > bestPct) {
        bestPct = p;
        mostAdvancedLoan = l;
      }
    }

    return {
      totalRemaining, totalOriginal, totalPaid, totalMonthly, overallPct,
      activeCount: activeLoans.length,
      nearestPaymentLoan, mostAdvancedLoan,
    };
  }

  // Date the *last* active loan is projected to hit zero — i.e. debt-free day.
  function overallPayoffDate(list) {
    const dates = list.filter((l) => !isPaidOff(l)).map(projectedPayoffDate).filter(Boolean);
    if (!dates.length) return null;
    return dates.reduce((max, d) => (d > max ? d : max));
  }

  // Highest-interest active loan — the debt-avalanche pick to pay off first.
  function ratePriorityLoan(list) {
    const withRate = list.filter((l) => !isPaidOff(l) && l.rate > 0);
    if (!withRate.length) return null;
    return withRate.reduce((top, l) => (l.rate > top.rate ? l : top));
  }

  function sortLoans(list, sortBy) {
    const arr = [...list];
    switch (sortBy) {
      case "debtDesc":
        return arr.sort((a, b) => (b.remaining || 0) - (a.remaining || 0));
      case "debtAsc":
        return arr.sort((a, b) => (a.remaining || 0) - (b.remaining || 0));
      case "progressDesc":
        return arr.sort((a, b) => progressPct(b) - progressPct(a));
      case "progressAsc":
        return arr.sort((a, b) => progressPct(a) - progressPct(b));
      case "bank":
        return arr.sort((a, b) => a.bank.localeCompare(b.bank, "pl"));
      case "nextDate":
      default:
        return arr.sort((a, b) => {
          const aPaid = isPaidOff(a), bPaid = isPaidOff(b);
          if (aPaid !== bPaid) return aPaid ? 1 : -1;
          const aDate = a.nextDate || "9999-99-99";
          const bDate = b.nextDate || "9999-99-99";
          return aDate < bDate ? -1 : aDate > bDate ? 1 : 0;
        });
    }
  }

  // ---- Storage ----

  function normalizeLoan(loan) {
    return {
      id: loan.id || crypto.randomUUID(),
      bank: loan.bank || "",
      name: loan.name || "",
      total: loan.total || 0,
      remaining: loan.remaining || 0,
      monthly: loan.monthly || 0,
      rate: loan.rate || 0,
      installmentsTotal: loan.installmentsTotal || 0,
      installmentsPaid: loan.installmentsPaid || 0,
      nextDate: loan.nextDate || "",
      notes: loan.notes || "",
      history: Array.isArray(loan.history) ? loan.history : [],
    };
  }

  function loadLoans() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.map(normalizeLoan) : [];
    } catch {
      return [];
    }
  }

  function saveLoans(list) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  }

  function loadSort() {
    try {
      return localStorage.getItem(SORT_KEY) || "nextDate";
    } catch {
      return "nextDate";
    }
  }

  function saveSort(value) {
    try {
      localStorage.setItem(SORT_KEY, value);
    } catch {}
  }

  // ---- Settings: which optional modules are switched on ----

  const SETTINGS_KEY = "creditbar:settings:v1";

  const DEFAULT_SETTINGS = {
    features: {
      summary: true,
      totalProgress: true,
      loanProgress: true,
      history: true,
      payInstallment: true,
      overpayment: false,
      debtChart: false,
      calendar: false,
      payoffEta: false,
      ratePriority: false,
      reminders: false,
      autoInstallments: false,
    },
    dashboard: {
      totalDebt: true,
      totalPaid: true,
      totalMonthly: true,
      loanCount: true,
      nextPayment: true,
      loanCards: true,
    },
  };

  const FEATURE_DEFS = [
    { key: "summary", label: "Podsumowanie wszystkich kredytów", desc: "Karta z sumą zadłużenia na górze ekranu." },
    { key: "totalProgress", label: "Progress całkowitego zadłużenia", desc: "Pierścień postępu w podsumowaniu." },
    { key: "loanProgress", label: "Progress poszczególnych kredytów", desc: "Pasek postępu na karcie i w szczegółach kredytu." },
    { key: "history", label: "Historia spłat", desc: "Lista wcześniejszych wpłat w szczegółach kredytu." },
    { key: "payInstallment", label: "Przycisk „Opłać ratę”", desc: "Szybkie odnotowanie spłaty raty." },
    { key: "overpayment", label: "Funkcja nadpłaty", desc: "Nadpłata zmniejsza saldo bez zmiany harmonogramu rat." },
    { key: "debtChart", label: "Wykres zadłużenia", desc: "Porównanie zadłużenia w poszczególnych bankach." },
    { key: "calendar", label: "Kalendarz rat", desc: "Lista najbliższych terminów płatności." },
    { key: "payoffEta", label: "Przewidywana data wyjścia z długów", desc: "Szacowana data spłaty wszystkich kredytów." },
    { key: "ratePriority", label: "Priorytet spłaty według oprocentowania", desc: "Podpowiada, który kredyt spłacać najpierw." },
    { key: "reminders", label: "Przypomnienia o ratach", desc: "Baner, gdy rata zbliża się w ciągu 7 dni." },
    { key: "autoInstallments", label: "Automatycznie obliczaj liczbę rat", desc: "Na podstawie kwoty i raty — możesz i tak nadpisać ręcznie." },
  ];

  const DASHBOARD_DEFS = [
    { key: "totalDebt", label: "Łączne zadłużenie", desc: "" },
    { key: "totalPaid", label: "Łącznie spłacono", desc: "" },
    { key: "totalMonthly", label: "Łączna miesięczna rata", desc: "" },
    { key: "loanCount", label: "Liczba kredytów", desc: "" },
    { key: "nextPayment", label: "Najbliższa rata", desc: "" },
    { key: "loanCards", label: "Karty kredytów", desc: "Lista kredytów poniżej podsumowania." },
  ];

  function loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) return structuredClone(DEFAULT_SETTINGS);
      const parsed = JSON.parse(raw);
      return {
        features: { ...DEFAULT_SETTINGS.features, ...parsed.features },
        dashboard: { ...DEFAULT_SETTINGS.dashboard, ...parsed.dashboard },
      };
    } catch {
      return structuredClone(DEFAULT_SETTINGS);
    }
  }

  function saveSettings() {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }

  let loans = loadLoans();
  let currentSort = loadSort();
  let settings = loadSettings();
  let editingId = null;
  let currentDetailId = null;
  let activeSheetEl = null;
  let amountDialogHandler = null;

  const el = {
    list: document.getElementById("list"),
    hero: document.getElementById("hero"),
    insights: document.getElementById("insights"),
    insightNextPayment: document.getElementById("insightNextPayment"),
    insightMostAdvanced: document.getElementById("insightMostAdvanced"),
    listHeading: document.getElementById("listHeading"),
    sortSelect: document.getElementById("sortSelect"),
    emptyState: document.getElementById("emptyState"),
    sumRemaining: document.getElementById("sumRemaining"),
    sumPaid: document.getElementById("sumPaid"),
    sumMonthly: document.getElementById("sumMonthly"),
    loanCount: document.getElementById("loanCount"),
    heroPct: document.getElementById("heroPct"),
    ringFill: document.getElementById("ringFill"),
    sheet: document.getElementById("sheet"),
    sheetBackdrop: document.getElementById("sheetBackdrop"),
    sheetTitle: document.getElementById("sheetTitle"),
    form: document.getElementById("loanForm"),
    deleteBtn: document.getElementById("deleteBtn"),
    cancelBtn: document.getElementById("cancelBtn"),
    fab: document.getElementById("fab"),
    emptyAddBtn: document.getElementById("emptyAddBtn"),
    template: document.getElementById("loanCardTemplate"),
    toast: document.getElementById("toast"),
    toastMsg: document.getElementById("toastMsg"),
    toastUndo: document.getElementById("toastUndo"),
    f_bank: document.getElementById("f_bank"),
    f_name: document.getElementById("f_name"),
    f_total: document.getElementById("f_total"),
    f_remaining: document.getElementById("f_remaining"),
    f_monthly: document.getElementById("f_monthly"),
    f_rate: document.getElementById("f_rate"),
    f_installmentsTotal: document.getElementById("f_installmentsTotal"),
    f_installmentsPaid: document.getElementById("f_installmentsPaid"),
    f_nextDate: document.getElementById("f_nextDate"),
    f_notes: document.getElementById("f_notes"),
    detailSheet: document.getElementById("detailSheet"),
    detailAvatar: document.getElementById("detailAvatar"),
    detailName: document.getElementById("detailName"),
    detailBank: document.getElementById("detailBank"),
    detailPaidBadge: document.getElementById("detailPaidBadge"),
    detailProgressFill: document.getElementById("detailProgressFill"),
    detailPct: document.getElementById("detailPct"),
    detailTotal: document.getElementById("detailTotal"),
    detailPaid: document.getElementById("detailPaid"),
    detailRemaining: document.getElementById("detailRemaining"),
    detailMonthly: document.getElementById("detailMonthly"),
    detailInstallmentsTotal: document.getElementById("detailInstallmentsTotal"),
    detailInstallmentsLeft: document.getElementById("detailInstallmentsLeft"),
    detailRate: document.getElementById("detailRate"),
    detailNextDate: document.getElementById("detailNextDate"),
    detailPayoffDate: document.getElementById("detailPayoffDate"),
    detailPayBtn: document.getElementById("detailPayBtn"),
    detailOverpayBtn: document.getElementById("detailOverpayBtn"),
    detailDeleteBtn: document.getElementById("detailDeleteBtn"),
    detailCloseBtn: document.getElementById("detailCloseBtn"),
    detailEditBtn: document.getElementById("detailEditBtn"),
    historyList: document.getElementById("historyList"),
    historyEmpty: document.getElementById("historyEmpty"),
    historyItemTemplate: document.getElementById("historyItemTemplate"),
    amountDialogBackdrop: document.getElementById("amountDialogBackdrop"),
    amountDialog: document.getElementById("amountDialog"),
    amountDialogTitle: document.getElementById("amountDialogTitle"),
    amountDialogLabel: document.getElementById("amountDialogLabel"),
    amountDialogInput: document.getElementById("amountDialogInput"),
    amountDialogConfirm: document.getElementById("amountDialogConfirm"),
    amountDialogCancel: document.getElementById("amountDialogCancel"),
    settingsBtn: document.getElementById("settingsBtn"),
    settingsSheet: document.getElementById("settingsSheet"),
    settingsCloseBtn: document.getElementById("settingsCloseBtn"),
    resetSettingsBtn: document.getElementById("resetSettingsBtn"),
    featureToggles: document.getElementById("featureToggles"),
    dashboardToggles: document.getElementById("dashboardToggles"),
    toggleRowTemplate: document.getElementById("toggleRowTemplate"),
    reminderBanner: document.getElementById("reminderBanner"),
    reminderText: document.getElementById("reminderText"),
    chipPayoffEta: document.getElementById("chipPayoffEta"),
    sumPayoffEta: document.getElementById("sumPayoffEta"),
    insightCardNextPayment: document.getElementById("insightCardNextPayment"),
    insightCardRatePriority: document.getElementById("insightCardRatePriority"),
    insightRatePriority: document.getElementById("insightRatePriority"),
    debtChartSection: document.getElementById("debtChartSection"),
    debtChart: document.getElementById("debtChart"),
    calendarSection: document.getElementById("calendarSection"),
    calendarList: document.getElementById("calendarList"),
    calendarEmpty: document.getElementById("calendarEmpty"),
    cardsHiddenNote: document.getElementById("cardsHiddenNote"),
    heroRing: document.getElementById("heroRing"),
    heroStatMain: document.getElementById("heroStatMain"),
    chipPaid: document.getElementById("chipPaid"),
    chipMonthly: document.getElementById("chipMonthly"),
    chipCount: document.getElementById("chipCount"),
    appVersion: document.getElementById("appVersion"),
  };

  el.appVersion.textContent = `v${APP_VERSION}`;

  // ---- Toast (undo) ----

  let toastTimer = null;

  function showToast(message, onUndo) {
    clearTimeout(toastTimer);
    el.toastMsg.textContent = message;
    el.toastUndo.onclick = () => {
      onUndo();
      hideToast();
    };
    el.toast.hidden = false;
    toastTimer = setTimeout(hideToast, 5000);
  }

  function hideToast() {
    el.toast.hidden = true;
  }

  // ---- Payments ----

  function refreshDetailIfOpen(id) {
    if (currentDetailId === id && !el.detailSheet.hidden) openDetail(id);
  }

  function payInstallment(id, amount) {
    const loan = loans.find((l) => l.id === id);
    if (!loan || !(amount > 0)) return;

    const snapshot = { ...loan, history: [...loan.history] };

    loan.remaining = round2(Math.max(0, loan.remaining - amount));
    const total = loan.installmentsTotal || 0;
    loan.installmentsPaid = total > 0
      ? Math.min(total, (loan.installmentsPaid || 0) + 1)
      : (loan.installmentsPaid || 0) + 1;
    if (loan.nextDate) loan.nextDate = addMonths(loan.nextDate, 1);
    loan.history = [...loan.history, { date: todayStr(), amount: round2(amount), balanceAfter: loan.remaining, type: "installment" }];

    saveLoans(loans);
    render();
    refreshDetailIfOpen(id);

    showToast(`Zapisano ratę: ${loan.bank}`, () => {
      const idx = loans.findIndex((l) => l.id === id);
      if (idx !== -1) loans[idx] = snapshot;
      saveLoans(loans);
      render();
      refreshDetailIfOpen(id);
    });
  }

  function overpayLoan(id, amount) {
    const loan = loans.find((l) => l.id === id);
    if (!loan || !(amount > 0)) return;

    const snapshot = { ...loan, history: [...loan.history] };

    loan.remaining = round2(Math.max(0, loan.remaining - amount));
    loan.history = [...loan.history, { date: todayStr(), amount: round2(amount), balanceAfter: loan.remaining, type: "overpayment" }];

    saveLoans(loans);
    render();
    refreshDetailIfOpen(id);

    showToast(`Zapisano nadpłatę: ${loan.bank}`, () => {
      const idx = loans.findIndex((l) => l.id === id);
      if (idx !== -1) loans[idx] = snapshot;
      saveLoans(loans);
      render();
      refreshDetailIfOpen(id);
    });
  }

  function promptPayInstallment(id) {
    const loan = loans.find((l) => l.id === id);
    if (!loan) return;
    openAmountDialog({
      title: "Opłać ratę",
      label: `Kwota raty — ${loan.bank}`,
      initialValue: loan.monthly > 0 ? loan.monthly : "",
      confirmLabel: "Zapłać",
      onConfirm: (amount) => payInstallment(id, amount),
    });
  }

  function promptOverpay(id) {
    const loan = loans.find((l) => l.id === id);
    if (!loan) return;
    openAmountDialog({
      title: "Nadpłać kredyt",
      label: `Kwota nadpłaty — ${loan.bank}`,
      initialValue: "",
      confirmLabel: "Nadpłać",
      onConfirm: (amount) => overpayLoan(id, amount),
    });
  }

  // ---- Amount dialog (shared by "Opłać ratę" and "Nadpłać") ----

  function openAmountDialog({ title, label, initialValue, confirmLabel, onConfirm }) {
    el.amountDialogTitle.textContent = title;
    el.amountDialogLabel.textContent = label;
    el.amountDialogInput.value = initialValue === "" || initialValue == null ? "" : initialValue;
    el.amountDialogConfirm.textContent = confirmLabel;
    amountDialogHandler = onConfirm;
    el.amountDialogBackdrop.hidden = false;
    el.amountDialog.hidden = false;
    el.amountDialogInput.focus();
  }

  function closeAmountDialog() {
    el.amountDialogBackdrop.hidden = true;
    el.amountDialog.hidden = true;
    amountDialogHandler = null;
  }

  function confirmAmountDialog() {
    const value = parseFloat(el.amountDialogInput.value);
    if (!Number.isFinite(value) || value <= 0) return;
    const handler = amountDialogHandler;
    closeAmountDialog();
    if (handler) handler(round2(value));
  }

  // ---- Settings sheet ----

  function buildToggleRows(container, defs, group) {
    container.innerHTML = "";
    for (const def of defs) {
      const node = el.toggleRowTemplate.content.cloneNode(true);
      node.querySelector(".toggle-label").textContent = def.label;
      const descEl = node.querySelector(".toggle-desc");
      if (def.desc) descEl.textContent = def.desc;
      else descEl.remove();
      const input = node.querySelector(".switch-input");
      input.checked = !!settings[group][def.key];
      input.addEventListener("change", () => {
        settings[group][def.key] = input.checked;
        saveSettings();
        render();
      });
      container.appendChild(node);
    }
  }

  function renderSettingsSheet() {
    buildToggleRows(el.featureToggles, FEATURE_DEFS, "features");
    buildToggleRows(el.dashboardToggles, DASHBOARD_DEFS, "dashboard");
  }

  function openSettings() {
    openGenericSheet(el.settingsSheet);
  }

  function closeSettings() {
    closeGenericSheet();
  }

  function resetSettings() {
    if (!confirm("Przywrócić domyślne ustawienia widoku i funkcji? Kredyty i historia spłat pozostaną bez zmian.")) return;
    settings = structuredClone(DEFAULT_SETTINGS);
    saveSettings();
    renderSettingsSheet();
    render();
  }

  // ---- Rendering ----

  const REMINDER_WINDOW_DAYS = 7;

  function daysUntil(dateStr) {
    const target = new Date(`${dateStr}T00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.round((target - today) / 86400000);
  }

  function renderDashboard() {
    const f = settings.features;
    const d = settings.dashboard;
    const agg = aggregate(loans);

    el.heroRing.hidden = !f.totalProgress;
    el.heroStatMain.hidden = !d.totalDebt;
    el.chipPaid.hidden = !d.totalPaid;
    el.chipMonthly.hidden = !d.totalMonthly;
    el.chipCount.hidden = !d.loanCount;
    el.chipPayoffEta.hidden = !f.payoffEta;

    el.sumRemaining.textContent = currency.format(agg.totalRemaining);
    el.sumPaid.textContent = currencyCompact.format(agg.totalPaid);
    el.sumMonthly.textContent = currencyCompact.format(agg.totalMonthly);
    el.loanCount.textContent = String(agg.activeCount);
    el.heroPct.textContent = `${Math.round(agg.overallPct)}%`;

    const offset = RING_CIRCUMFERENCE * (1 - agg.overallPct / 100);
    el.ringFill.style.strokeDasharray = String(RING_CIRCUMFERENCE);
    el.ringFill.style.strokeDashoffset = String(offset);

    if (f.payoffEta) {
      const eta = overallPayoffDate(loans);
      el.sumPayoffEta.textContent = eta ? dateFmt.format(new Date(eta)) : "—";
    }

    el.insightCardNextPayment.hidden = !d.nextPayment;
    if (d.nextPayment) {
      el.insightNextPayment.textContent = agg.nearestPaymentLoan
        ? `${agg.nearestPaymentLoan.bank} • ${dateFmt.format(new Date(agg.nearestPaymentLoan.nextDate))}`
        : "Brak zaplanowanych rat";
    }

    el.insightMostAdvanced.textContent = agg.mostAdvancedLoan
      ? `${agg.mostAdvancedLoan.bank} • ${Math.round(progressPct(agg.mostAdvancedLoan))}%`
      : "—";

    el.insightCardRatePriority.hidden = !f.ratePriority;
    if (f.ratePriority) {
      const top = ratePriorityLoan(loans);
      el.insightRatePriority.textContent = top ? `${top.bank} • ${top.rate}%` : "Brak danych o oprocentowaniu";
    }

    renderReminderBanner();
    renderDebtChart();
    renderCalendar();
  }

  function renderReminderBanner() {
    if (!settings.features.reminders) {
      el.reminderBanner.hidden = true;
      return;
    }
    const due = loans
      .filter((l) => !isPaidOff(l) && l.nextDate && daysUntil(l.nextDate) <= REMINDER_WINDOW_DAYS)
      .sort((a, b) => (a.nextDate < b.nextDate ? -1 : 1));

    if (!due.length) {
      el.reminderBanner.hidden = true;
      return;
    }

    const parts = due.map((l) => {
      const dd = daysUntil(l.nextDate);
      const when = dd < 0 ? "zaległa" : dd === 0 ? "dziś" : `za ${dd} dni`;
      return `${l.bank} (${when})`;
    });
    el.reminderText.textContent = `${due.length > 1 ? "Nadchodzące raty" : "Nadchodząca rata"}: ${parts.join(", ")}`;
    el.reminderBanner.hidden = false;
  }

  function renderDebtChart() {
    if (!settings.features.debtChart) {
      el.debtChartSection.hidden = true;
      return;
    }
    const active = loans.filter((l) => !isPaidOff(l));
    el.debtChartSection.hidden = active.length === 0;
    el.debtChart.innerHTML = "";
    if (!active.length) return;

    const maxRemaining = Math.max(...active.map((l) => l.remaining || 0), 1);
    for (const loan of [...active].sort((a, b) => (b.remaining || 0) - (a.remaining || 0))) {
      const [c1, c2] = gradientForBank(loan.bank);

      const row = document.createElement("div");
      row.className = "debt-chart-row";

      const labels = document.createElement("div");
      labels.className = "debt-chart-labels";
      const nameSpan = document.createElement("span");
      nameSpan.textContent = loan.bank;
      const amountSpan = document.createElement("span");
      amountSpan.textContent = currency.format(loan.remaining || 0);
      labels.append(nameSpan, amountSpan);

      const track = document.createElement("div");
      track.className = "debt-chart-track";
      const fill = document.createElement("div");
      fill.className = "debt-chart-fill";
      fill.style.width = `${((loan.remaining || 0) / maxRemaining) * 100}%`;
      fill.style.background = `linear-gradient(90deg, ${c1}, ${c2})`;
      track.appendChild(fill);

      row.append(labels, track);
      el.debtChart.appendChild(row);
    }
  }

  function renderCalendar() {
    if (!settings.features.calendar) {
      el.calendarSection.hidden = true;
      return;
    }
    el.calendarSection.hidden = loans.length === 0;
    el.calendarList.innerHTML = "";

    const upcoming = loans
      .filter((l) => !isPaidOff(l) && l.nextDate)
      .sort((a, b) => (a.nextDate < b.nextDate ? -1 : 1));

    el.calendarEmpty.hidden = upcoming.length > 0;

    for (const loan of upcoming) {
      const row = document.createElement("div");
      row.className = "calendar-item";

      const dateSpan = document.createElement("span");
      dateSpan.className = "calendar-date";
      dateSpan.textContent = dateFmt.format(new Date(loan.nextDate));

      const bankSpan = document.createElement("span");
      bankSpan.className = "calendar-bank";
      bankSpan.textContent = loan.bank;

      const amountSpan = document.createElement("span");
      amountSpan.className = "calendar-amount";
      amountSpan.textContent = loan.monthly ? currency.format(loan.monthly) : "—";

      row.append(dateSpan, bankSpan, amountSpan);
      el.calendarList.appendChild(row);
    }
  }

  function buildCard(loan) {
    const node = el.template.content.cloneNode(true);
    const card = node.querySelector(".card");
    const pct = progressPct(loan);
    const bucket = progressBucket(pct);
    const paidOff = isPaidOff(loan);
    const [c1, c2] = gradientForBank(loan.bank);

    card.classList.toggle("is-paid", paidOff);

    const avatar = card.querySelector(".bank-avatar");
    avatar.style.background = `linear-gradient(135deg, ${c1}, ${c2})`;
    avatar.textContent = initialsForBank(loan.bank);

    card.querySelector(".card-name").textContent = loan.name || loan.bank;
    card.querySelector(".card-bank-name").textContent = loan.bank;

    const pctEl = card.querySelector(".card-pct");
    const statusEl = card.querySelector(".card-status-badge");
    const showProgress = settings.features.loanProgress;
    if (paidOff) {
      pctEl.hidden = true;
      statusEl.hidden = !showProgress;
    } else {
      pctEl.hidden = !showProgress;
      pctEl.textContent = `${Math.round(pct)}%`;
      pctEl.classList.add(bucket);
      statusEl.hidden = true;
    }

    card.querySelector(".progress-track").hidden = !showProgress;
    card.querySelector(".progress-fill").style.width = `${pct}%`;
    card.querySelector(".progress-fill").classList.add(bucket);

    card.querySelector(".card-remaining").textContent = currency.format(loan.remaining);
    card.querySelector(".card-total").textContent = `z ${currency.format(loan.total)}`;

    const remLeft = remainingInstallments(loan);
    card.querySelector(".card-installments").textContent = remLeft != null ? `Pozostało rat: ${remLeft}` : "";

    const metaParts = [`Spłacono: ${currency.format(paidAmount(loan))}`];
    if (loan.monthly) metaParts.push(`${currency.format(loan.monthly)}/mies.`);
    if (loan.rate) metaParts.push(`${loan.rate}% RRSO`);
    if (loan.nextDate) metaParts.push(`kolejna rata: ${dateFmt.format(new Date(loan.nextDate))}`);
    card.querySelector(".card-meta").textContent = metaParts.join(" · ");

    const payBtn = card.querySelector(".pay-btn");
    if (!paidOff && settings.features.payInstallment) {
      payBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        promptPayInstallment(loan.id);
      });
    } else {
      payBtn.hidden = true;
    }

    card.addEventListener("click", () => openDetail(loan.id));
    return node;
  }

  function render() {
    const hasLoans = loans.length > 0;
    const showCards = settings.dashboard.loanCards;

    el.emptyState.hidden = hasLoans;
    el.hero.hidden = !hasLoans || !settings.features.summary;
    el.insights.hidden = !hasLoans;
    el.listHeading.hidden = !hasLoans || !showCards;
    el.list.hidden = !showCards;
    el.list.innerHTML = "";
    el.cardsHiddenNote.hidden = !hasLoans || showCards;

    renderDashboard();

    if (!hasLoans || !showCards) return;

    for (const loan of sortLoans(loans, currentSort)) {
      el.list.appendChild(buildCard(loan));
    }
  }

  function renderHistory(loan) {
    const history = [...loan.history].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    el.historyList.innerHTML = "";
    el.historyEmpty.hidden = history.length > 0;

    for (const entry of history) {
      const node = el.historyItemTemplate.content.cloneNode(true);
      node.querySelector(".history-date").textContent = dateFmt.format(new Date(entry.date));
      node.querySelector(".history-type").textContent = entry.type === "overpayment" ? "Nadpłata" : "Rata";
      node.querySelector(".history-amount").textContent = `-${currency.format(entry.amount)}`;
      node.querySelector(".history-balance").textContent = `Saldo: ${currency.format(entry.balanceAfter)}`;
      el.historyList.appendChild(node);
    }
  }

  // ---- Detail sheet ----

  function openDetail(id) {
    const loan = loans.find((l) => l.id === id);
    if (!loan) return;
    currentDetailId = id;

    const pct = progressPct(loan);
    const paidOff = isPaidOff(loan);
    const payoff = projectedPayoffDate(loan);
    const remLeft = remainingInstallments(loan);

    const [c1, c2] = gradientForBank(loan.bank);
    const showProgress = settings.features.loanProgress;

    el.detailAvatar.style.background = `linear-gradient(135deg, ${c1}, ${c2})`;
    el.detailAvatar.textContent = initialsForBank(loan.bank);
    el.detailName.textContent = loan.name || loan.bank;
    el.detailBank.textContent = loan.bank;
    el.detailPaidBadge.hidden = !paidOff || !showProgress;

    el.detailProgressFill.parentElement.hidden = !showProgress;
    el.detailPct.closest(".detail-pct-row").hidden = !showProgress;
    el.detailProgressFill.style.width = `${pct}%`;
    el.detailProgressFill.classList.remove("p-low", "p-mid", "p-high");
    el.detailProgressFill.classList.add(progressBucket(pct));
    el.detailPct.textContent = `${Math.round(pct)}%`;

    el.detailTotal.textContent = currency.format(loan.total || 0);
    el.detailPaid.textContent = currency.format(paidAmount(loan));
    el.detailRemaining.textContent = currency.format(loan.remaining || 0);
    el.detailMonthly.textContent = loan.monthly ? currency.format(loan.monthly) : "—";
    el.detailInstallmentsTotal.textContent = loan.installmentsTotal ? String(loan.installmentsTotal) : "—";
    el.detailInstallmentsLeft.textContent = remLeft != null ? String(remLeft) : "—";
    el.detailRate.textContent = loan.rate ? `${loan.rate}%` : "—";
    el.detailNextDate.textContent = loan.nextDate ? dateFmt.format(new Date(loan.nextDate)) : "—";
    el.detailPayoffDate.textContent = paidOff ? "Spłacono" : (payoff ? dateFmt.format(new Date(payoff)) : "—");

    el.detailPayBtn.hidden = paidOff || !settings.features.payInstallment;
    el.detailOverpayBtn.hidden = paidOff || !settings.features.overpayment;

    const showHistory = settings.features.history;
    el.detailSheet.querySelector(".sheet-section").hidden = !showHistory;
    el.historyList.hidden = !showHistory;
    if (showHistory) renderHistory(loan);
    else el.historyEmpty.hidden = true;

    openGenericSheet(el.detailSheet);
  }

  function closeDetail() {
    closeGenericSheet();
    currentDetailId = null;
  }

  // ---- Add / edit sheet ----

  let installmentsManuallyEdited = false;

  function openAdd() {
    editingId = null;
    el.sheetTitle.textContent = "Nowy kredyt";
    el.deleteBtn.hidden = true;
    el.form.reset();
    installmentsManuallyEdited = false;
    openGenericSheet(el.sheet);
  }

  function openEdit(id) {
    const loan = loans.find((l) => l.id === id);
    if (!loan) return;
    editingId = id;
    el.sheetTitle.textContent = "Edytuj kredyt";
    el.deleteBtn.hidden = false;

    el.f_bank.value = loan.bank || "";
    el.f_name.value = loan.name || "";
    el.f_total.value = loan.total ?? "";
    el.f_remaining.value = loan.remaining ?? "";
    el.f_monthly.value = loan.monthly ?? "";
    el.f_rate.value = loan.rate ?? "";
    el.f_installmentsTotal.value = loan.installmentsTotal ?? "";
    el.f_installmentsPaid.value = loan.installmentsPaid ?? "";
    el.f_nextDate.value = loan.nextDate || "";
    el.f_notes.value = loan.notes || "";
    installmentsManuallyEdited = loan.installmentsTotal > 0;

    openGenericSheet(el.sheet);
  }

  // Ustawienia → "Automatycznie obliczaj liczbę rat": liczy total/monthly na
  // bieżąco, ale przestaje nadpisywać pole, gdy użytkownik sam je zmieni.
  function maybeAutoFillInstallments() {
    if (!settings.features.autoInstallments || installmentsManuallyEdited) return;
    const total = parseFloat(el.f_total.value);
    const monthly = parseFloat(el.f_monthly.value);
    if (total > 0 && monthly > 0) {
      el.f_installmentsTotal.value = String(Math.ceil(total / monthly));
    }
  }

  function closeSheet() {
    closeGenericSheet();
    editingId = null;
  }

  // ---- Generic sheet plumbing (shared dim backdrop, one panel visible at a time) ----

  function openGenericSheet(sheetEl) {
    activeSheetEl = sheetEl;
    el.sheetBackdrop.hidden = false;
    sheetEl.hidden = false;
    document.body.style.overflow = "hidden";
  }

  function closeGenericSheet() {
    if (activeSheetEl) activeSheetEl.hidden = true;
    el.sheetBackdrop.hidden = true;
    document.body.style.overflow = "";
    activeSheetEl = null;
  }

  function handleSubmit(e) {
    e.preventDefault();

    const existing = editingId ? loans.find((l) => l.id === editingId) : null;

    const loan = {
      id: editingId || crypto.randomUUID(),
      bank: el.f_bank.value.trim(),
      name: el.f_name.value.trim(),
      total: parseFloat(el.f_total.value) || 0,
      remaining: parseFloat(el.f_remaining.value) || 0,
      monthly: parseFloat(el.f_monthly.value) || 0,
      rate: parseFloat(el.f_rate.value) || 0,
      installmentsTotal: parseInt(el.f_installmentsTotal.value, 10) || 0,
      installmentsPaid: parseInt(el.f_installmentsPaid.value, 10) || 0,
      nextDate: el.f_nextDate.value || "",
      notes: el.f_notes.value.trim(),
      history: existing ? existing.history : [],
    };

    if (!loan.bank || loan.total <= 0) return;

    if (editingId) {
      loans = loans.map((l) => (l.id === editingId ? loan : l));
    } else {
      loans.push(loan);
    }

    saveLoans(loans);
    closeSheet();
    render();
  }

  function deleteLoan(id) {
    if (!id) return;
    if (!confirm("Usunąć ten kredyt?")) return;
    loans = loans.filter((l) => l.id !== id);
    saveLoans(loans);
    closeGenericSheet();
    editingId = null;
    currentDetailId = null;
    render();
  }

  // ---- Wiring ----

  el.fab.addEventListener("click", openAdd);
  el.emptyAddBtn.addEventListener("click", openAdd);
  el.cancelBtn.addEventListener("click", closeSheet);
  el.deleteBtn.addEventListener("click", () => deleteLoan(editingId));
  el.form.addEventListener("submit", handleSubmit);

  el.sheetBackdrop.addEventListener("click", () => {
    if (activeSheetEl === el.sheet) closeSheet();
    else if (activeSheetEl === el.detailSheet) closeDetail();
    else if (activeSheetEl === el.settingsSheet) closeSettings();
  });

  el.settingsBtn.addEventListener("click", openSettings);
  el.settingsCloseBtn.addEventListener("click", closeSettings);
  el.resetSettingsBtn.addEventListener("click", resetSettings);

  el.f_total.addEventListener("input", maybeAutoFillInstallments);
  el.f_monthly.addEventListener("input", maybeAutoFillInstallments);
  el.f_installmentsTotal.addEventListener("input", () => {
    installmentsManuallyEdited = true;
  });

  el.detailCloseBtn.addEventListener("click", closeDetail);
  el.detailDeleteBtn.addEventListener("click", () => deleteLoan(currentDetailId));
  el.detailEditBtn.addEventListener("click", () => {
    const id = currentDetailId;
    closeDetail();
    openEdit(id);
  });
  el.detailPayBtn.addEventListener("click", () => promptPayInstallment(currentDetailId));
  el.detailOverpayBtn.addEventListener("click", () => promptOverpay(currentDetailId));

  el.amountDialogCancel.addEventListener("click", closeAmountDialog);
  el.amountDialogBackdrop.addEventListener("click", closeAmountDialog);
  el.amountDialogConfirm.addEventListener("click", confirmAmountDialog);
  el.amountDialogInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      confirmAmountDialog();
    }
  });

  el.sortSelect.value = currentSort;
  el.sortSelect.addEventListener("change", () => {
    currentSort = el.sortSelect.value;
    saveSort(currentSort);
    render();
  });

  renderSettingsSheet();
  render();

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").then((reg) => {
        reg.update();
        // Nowa wersja service workera przejmuje kontrolę -> auto-odśwież raz,
        // żeby zmiany były widoczne od razu, bez ręcznego czyszczenia cache.
        let reloaded = false;
        navigator.serviceWorker.addEventListener("controllerchange", () => {
          if (reloaded) return;
          reloaded = true;
          window.location.reload();
        });
      }).catch(() => {});
    });
  }
})();
