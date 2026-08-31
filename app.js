(() => {
  "use strict";

  const STORAGE_KEY = "creditbar:loans:v1";

  const currency = new Intl.NumberFormat("pl-PL", {
    style: "currency",
    currency: "PLN",
    maximumFractionDigits: 0,
  });

  const dateFmt = new Intl.DateTimeFormat("pl-PL", { day: "2-digit", month: "2-digit", year: "numeric" });

  const BANK_GRADIENTS = [
    ["#6366f1", "#8b5cf6"], ["#0ea5e9", "#22d3ee"], ["#f59e0b", "#f97316"],
    ["#ec4899", "#f43f5e"], ["#10b981", "#14b8a6"], ["#8b5cf6", "#d946ef"],
    ["#3b82f6", "#6366f1"], ["#ef4444", "#f97316"],
  ];

  function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
    return hash;
  }

  function gradientForBank(bank) {
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

  function loadLoans() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function saveLoans(loans) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(loans));
  }

  let loans = loadLoans();
  let editingId = null;

  const el = {
    list: document.getElementById("list"),
    hero: document.getElementById("hero"),
    listHeading: document.getElementById("listHeading"),
    emptyState: document.getElementById("emptyState"),
    sumRemaining: document.getElementById("sumRemaining"),
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
  };

  function progressPct(loan) {
    if (!loan.total || loan.total <= 0) return 0;
    const paid = loan.total - loan.remaining;
    return Math.min(100, Math.max(0, (paid / loan.total) * 100));
  }

  function render() {
    const hasLoans = loans.length > 0;
    el.emptyState.hidden = hasLoans;
    el.hero.hidden = !hasLoans;
    el.listHeading.hidden = !hasLoans;
    el.list.innerHTML = "";

    if (!hasLoans) return;

    const sorted = [...loans].sort((a, b) => b.remaining - a.remaining);

    for (const loan of sorted) {
      const node = el.template.content.cloneNode(true);
      const card = node.querySelector(".card");
      const pct = progressPct(loan);
      const bucket = progressBucket(pct);
      const [c1, c2] = gradientForBank(loan.bank);

      const avatar = card.querySelector(".bank-avatar");
      avatar.style.background = `linear-gradient(135deg, ${c1}, ${c2})`;
      avatar.textContent = initialsForBank(loan.bank);

      card.querySelector(".card-name").textContent = loan.name || loan.bank;
      card.querySelector(".card-bank-name").textContent = loan.bank;

      const pctEl = card.querySelector(".card-pct");
      pctEl.textContent = `${Math.round(pct)}%`;
      pctEl.classList.add(bucket);

      card.querySelector(".progress-fill").style.width = `${pct}%`;
      card.querySelector(".progress-fill").classList.add(bucket);

      card.querySelector(".card-remaining").textContent = currency.format(loan.remaining);
      card.querySelector(".card-total").textContent = `z ${currency.format(loan.total)}`;

      const instParts = [];
      if (loan.installmentsTotal) {
        instParts.push(`rata ${loan.installmentsPaid || 0}/${loan.installmentsTotal}`);
      }
      card.querySelector(".card-installments").textContent = instParts.join(" · ");

      const metaParts = [];
      if (loan.monthly) metaParts.push(`${currency.format(loan.monthly)}/mies.`);
      if (loan.rate) metaParts.push(`${loan.rate}% RRSO`);
      if (loan.nextDate) metaParts.push(`kolejna rata: ${dateFmt.format(new Date(loan.nextDate))}`);
      card.querySelector(".card-meta").textContent = metaParts.join(" · ");

      card.addEventListener("click", () => openEdit(loan.id));
      el.list.appendChild(node);
    }

    renderSummary();
  }

  function renderSummary() {
    const totalRemaining = loans.reduce((s, l) => s + (l.remaining || 0), 0);
    const totalAmount = loans.reduce((s, l) => s + (l.total || 0), 0);
    const totalMonthly = loans.reduce((s, l) => s + (l.monthly || 0), 0);
    const overallPct = totalAmount > 0
      ? Math.min(100, Math.max(0, ((totalAmount - totalRemaining) / totalAmount) * 100))
      : 0;

    el.sumRemaining.textContent = currency.format(totalRemaining);
    el.sumMonthly.textContent = currency.format(totalMonthly);
    el.loanCount.textContent = String(loans.length);
    el.heroPct.textContent = `${Math.round(overallPct)}%`;

    const offset = RING_CIRCUMFERENCE * (1 - overallPct / 100);
    el.ringFill.style.strokeDasharray = String(RING_CIRCUMFERENCE);
    el.ringFill.style.strokeDashoffset = String(offset);
  }

  function openAdd() {
    editingId = null;
    el.sheetTitle.textContent = "Nowy kredyt";
    el.deleteBtn.hidden = true;
    el.form.reset();
    openSheet();
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

    openSheet();
  }

  function openSheet() {
    el.sheetBackdrop.hidden = false;
    el.sheet.hidden = false;
    document.body.style.overflow = "hidden";
  }

  function closeSheet() {
    el.sheetBackdrop.hidden = true;
    el.sheet.hidden = true;
    document.body.style.overflow = "";
    editingId = null;
  }

  function handleSubmit(e) {
    e.preventDefault();

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

  function handleDelete() {
    if (!editingId) return;
    if (!confirm("Usunąć ten kredyt?")) return;
    loans = loans.filter((l) => l.id !== editingId);
    saveLoans(loans);
    closeSheet();
    render();
  }

  el.fab.addEventListener("click", openAdd);
  el.emptyAddBtn.addEventListener("click", openAdd);
  el.cancelBtn.addEventListener("click", closeSheet);
  el.sheetBackdrop.addEventListener("click", closeSheet);
  el.deleteBtn.addEventListener("click", handleDelete);
  el.form.addEventListener("submit", handleSubmit);

  render();

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    });
  }
})();
