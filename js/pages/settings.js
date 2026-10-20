// Settings: business details and current cash, the plan (with the 1-month
// Premium free trial), demo data, and clearing your data.
import { formatRM, parseAmount, prettyDate, senToInput } from "../cashflow.js";
import { clearMyData, countRecords, isAdmin, loadDemoData, startTrial, updateProfile } from "../db.js";
import {
  DEMO_BUSINESS, DEMO_CASH_SEN, DEMO_LOCATION, PLAN_ORDER, PLANS, SST_PERCENT, demoRecords, sstSen,
} from "../plans.js";
import {
  busy, clearMessages, goTo, html, malaysiaDate, plural, runPage, show, showMessage, startPage, t, th, todayISO, trialBanner,
} from "../ui.js";


runPage(async () => {
  const { profile, session, userId, email, trial } = await startPage("settings", { login: true });
  const onboarding = Boolean(session.user?.user_metadata?.onboarding);
  const [hasData, admin] = await Promise.all([countRecords().then((n) => n > 0), isAdmin()]);

  function planButton(key) {
    const plan = PLANS[key];
    const current = profile.plan === key;
    if (key !== "premium") {
      return current
        ? html`<button class="btn btn-primary w-100" type="button" disabled>${t("Current plan")}</button>`
        : html`<button class="btn btn-outline-primary w-100" type="button" data-plan="${key}">${t("Switch to {plan}", { plan: t(plan.label) })}</button>`;
    }
    if (current) {
      return html`<button class="btn btn-mint w-100" type="button" disabled>${trial.active ? t("Current plan (free trial)") : t("Current plan")}</button>
        ${trial.active ? html`<div class="plan-note">${t("{days} left. Then {price}/month.", { days: plural(trial.daysLeft, "day"), price: plan.price })}</div>` : ""}`;
    }
    if (!trial.used) {
      return html`<button class="btn btn-mint w-100" type="button" data-plan="premium">${t("Start 1-Month Free Trial")}</button>
        <div class="plan-note">${t("Then {price}/month after your 30-day trial.", { price: plan.price })}</div>`;
    }
    if (!trial.ended) {
      return html`<button class="btn btn-mint w-100" type="button" data-plan="premium">${t("Switch back to Premium")}</button>
        <div class="plan-note">${t("Your free trial runs until {date}.", { date: prettyDate(malaysiaDate(trial.endsAt)) })}</div>`;
    }
    return html`<button class="btn btn-mint w-100" type="button" data-plan="premium">${t("Switch to {plan}", { plan: t(plan.label) })}</button>
      <div class="plan-note">${t("Free trial already used. {price}/month.", { price: plan.price })}</div>`;
  }

  show("main", html`
    <h1 class="h3 mb-3">${t("Settings")}</h1>
    ${trialBanner(trial, profile)}
    ${admin ? html`<div class="card p-4 mb-4 admin-link-card">
      <h2 class="h5"><i class="bi bi-shield-lock me-1"></i>${t("Admin")}</h2>
      <p class="text-secondary small">${t("You are an admin. Open the Control Centre to see users, the live log, system health and security.")}</p>
      <div><a class="btn btn-primary" href="admin.html">${t("Open Admin Control Centre")}</a></div>
    </div>` : ""}

    <div class="card p-4 mb-4">
      <h2 class="h5">${t("Your business")}</h2>
      <p class="text-secondary small">${t("Your forecast starts from the cash figure below. Update it whenever your bank balance changes.")}</p>
      <form id="profile-form" novalidate>
        <div class="row g-3 mb-3">
          <div class="col-md-4"><label class="form-label" for="business_name">${t("Business name")}</label>
            <input class="form-control" id="business_name" name="business_name" maxlength="80" value="${profile.business_name}"></div>
          <div class="col-md-4"><label class="form-label" for="location">${t("Location")}</label>
            <input class="form-control" id="location" name="location" maxlength="80" value="${profile.location}" placeholder="${t("e.g. {example}", { example: "Petaling Jaya" })}"></div>
          <div class="col-md-4"><label class="form-label" for="cash">${t("Current cash")}</label>
            <div class="input-group"><span class="input-group-text">RM</span>
            <input class="form-control" id="cash" name="cash" inputmode="decimal" required maxlength="20" value="${senToInput(profile.cash_sen)}"></div></div>
        </div>
        <button class="btn btn-primary" type="submit">${t("Save")}</button>
      </form>
    </div>

    <div class="card p-4 mb-4" id="plan">
      <h2 class="h5">${t("Your plan")}</h2>
      <p class="text-secondary small">${t("This is a prototype, so switching plans is free and no payment is taken. Premium comes with a 1-month free trial (once per account).")}</p>
      <div class="row g-3">${PLAN_ORDER.map((key) => {
        const plan = PLANS[key];
        const current = profile.plan === key;
        return html`<div class="col-lg-4"><div class="card plan-card d-flex flex-column ${key === "premium" ? "plan-dark" : ""} ${current ? "plan-current" : ""}">
          <div>${t(plan.label)}${current ? html` <span class="badge text-bg-light ms-1">${t("Your plan")}</span>` : ""}</div>
          <div class="price">${plan.price}<small>${t("/month")}</small></div>
          ${plan.price_sen ? html`<div class="plan-note text-start mt-0 mb-1">${t("+ {percent}% SST = {amount}/month", { percent: SST_PERCENT, amount: formatRM(plan.price_sen + sstSen(plan.price_sen)) })}</div>` : ""}
          ${key === "premium" && !trial.used ? html`<div><span class="trial-chip">${t("First month free")}</span></div>` : ""}
          <ul class="flex-grow-1">${plan.highlights.map((line) => html`<li>${t(line)}</li>`)}</ul>
          <div>${planButton(key)}</div></div></div>`;
      })}</div>
    </div>

    <div class="card p-4 mb-4" id="demo">
      <h2 class="h5">${t("Demo data and clean-up")}</h2>
      <div class="row g-4">
        <div class="col-md-6">
          <h3 class="h6">${t("Try it with demo data")}</h3>
          <p class="text-secondary small">${th("Loads <strong>{business}</strong>, a demo food seller in {location}: current cash {cash}, sample invoices and expenses, and a shortfall in the middle of the month.",
            { business: DEMO_BUSINESS, location: DEMO_LOCATION, cash: formatRM(DEMO_CASH_SEN) })}</p>
          ${hasData ? html`<p class="small text-secondary mb-0"><i class="bi bi-info-circle"></i> ${t("Demo data can only be loaded into an empty account. Clear your data first if you want to try it.")}</p>`
            : html`<button class="btn btn-outline-primary" type="button" id="demo-button">${t("Load demo data")}</button>`}
        </div>
        <div class="col-md-6">
          <h3 class="h6">${t("Clear all my data")}</h3>
          <p class="text-secondary small">${t("Deletes all your invoices, expenses and uploads, and sets current cash back to RM0. Your account, name and plan stay.")}</p>
          <button class="btn btn-outline-danger" type="button" id="clear-button">${t("Clear all my data")}</button>
        </div>
      </div>
    </div>

    <div class="card p-4">
      <h2 class="h5">${t("Account")}</h2>
      <p class="text-secondary small mb-1">${th("Logged in as <strong>{email}</strong>.", { email })}</p>
      <p class="text-secondary small mb-0">${onboarding
        ? t("Guided onboarding: requested at sign-up (prototype: no session is booked).")
        : t("Guided onboarding: not requested.")}</p>
    </div>`);

  if (window.location.hash) document.querySelector(window.location.hash)?.scrollIntoView();

  // Save business details and current cash
  const form = document.getElementById("profile-form");
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    clearMessages();
    const business_name = form.business_name.value.trim();
    const location = form.location.value.trim();
    const cash_sen = parseAmount(form.cash.value, { allowNegative: true, allowZero: true });
    if (business_name.length > 80 || location.length > 80) {
      return showMessage(t("Business name and location must be 80 characters or less."), "danger");
    }
    if (cash_sen === null) {
      return showMessage(t("Enter your current cash like 2960 or 2960.50. Use a minus sign if you are overdrawn."), "danger");
    }
    return busy(form.querySelector("button"), async () => {
      await updateProfile(userId, { business_name, location, cash_sen });
      goTo("settings.html", t("Saved. Your forecast now starts from the new cash figure."));
    });
  });

  // Change plan / start the free trial
  document.getElementById("plan").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-plan]");
    if (!button) return;
    const key = button.dataset.plan;
    busy(button, async () => {
      if (key === "premium" && !trial.used) {
        const ends = await startTrial();
        goTo("settings.html#plan", t("Your 1-month Premium free trial has started. It ends on {date}, then Premium is {price}/month. No payment is taken in this prototype.",
          { date: prettyDate(malaysiaDate(ends)), price: PLANS.premium.price }));
        return;
      }
      if (profile.plan === "premium" && trial.active
          && !window.confirm(t("You are in your Premium free trial. If you switch, the trial keeps counting down and ends on {date}. Switch to {plan}?",
            { date: prettyDate(malaysiaDate(trial.endsAt)), plan: t(PLANS[key].label) }))) {
        return;
      }
      await updateProfile(userId, { plan: key });
      goTo("settings.html#plan", t("You are now on the {plan} plan. This is a demo, so no payment was taken.", { plan: t(PLANS[key].label) }));
    });
  });

  // Demo data
  document.getElementById("demo-button")?.addEventListener("click", (event) => {
    if (!window.confirm(t("This sets your current cash to {cash} and adds sample invoices and expenses. Continue?", { cash: formatRM(DEMO_CASH_SEN) }))) return;
    busy(event.currentTarget, async () => {
      if ((await countRecords()) > 0) {
        showMessage(t("Demo data can only be loaded into an empty account. Clear your data first."), "warning");
        return;
      }
      const demo = demoRecords(todayISO());
      await loadDemoData(userId, {
        ...demo, businessName: DEMO_BUSINESS, location: DEMO_LOCATION, cashSen: DEMO_CASH_SEN,
      });
      let message = t("Demo data loaded: {business}, a food seller in {location}.", { business: DEMO_BUSINESS, location: DEMO_LOCATION });
      if (PLANS[profile.plan].horizon < 30) {
        message += ` ${t("You are on the Free plan, which shows 7 days. Switch to Basic or Premium in Settings to see the full 30-day demo.")}`;
      }
      goTo("dashboard.html", message);
    });
  });

  // Clear everything
  document.getElementById("clear-button").addEventListener("click", (event) => {
    if (!window.confirm(t("Delete ALL your invoices, expenses and uploads? This cannot be undone."))) return;
    busy(event.currentTarget, async () => {
      await clearMyData();
      goTo("settings.html", t("All your invoices, expenses and uploads were cleared, and current cash is back to RM0."), "info");
    });
  });
});
