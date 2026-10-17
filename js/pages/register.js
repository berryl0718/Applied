// Create an account. The plan picked here is saved by the database; picking
// Premium starts the 1-month (30-day) free trial straight away.
// The order summary shows the 8% SST on the paid plans and on guided onboarding.
import { formatRM } from "../cashflow.js";
import { signUp } from "../db.js";
import { ONBOARDING_SEN, PLAN_ORDER, PLANS, SST_PERCENT, checkoutSummary } from "../plans.js";
import { busy, clearMessages, goTo, html, param, runPage, show, showMessage, startPage, t, th } from "../ui.js";

/** The order summary box: plan fee, SST, onboarding and what is due today. */
function orderSummary(planKey, withOnboarding) {
  const s = checkoutSummary(planKey, withOnboarding);
  const row = (label, amount, extra = "") => html`<div class="d-flex justify-content-between gap-3 ${extra}">
    <span>${label}</span><span class="amount text-nowrap">${amount}</span></div>`;
  const sst = t("SST ({percent}%)", { percent: SST_PERCENT });
  return html`
    <div class="fw-semibold mb-2">${t("Order summary")}</div>
    ${row(t("{plan} plan, monthly fee", { plan: t(PLANS[s.plan].label) }), formatRM(s.monthly.fee_sen))}
    ${s.monthly.fee_sen ? html`
      ${row(sst, formatRM(s.monthly.sst_sen), "text-secondary")}
      ${row(t("Monthly total incl. SST"), formatRM(s.monthly.total_sen), "fw-semibold")}` : ""}
    ${s.trial ? row(t("Free trial"), t("1 month (RM0 today)"), "text-success") : ""}
    <hr class="my-2">
    ${withOnboarding ? html`
      ${row(t("Guided onboarding (one-time)"), formatRM(s.onboarding.fee_sen))}
      ${row(sst, formatRM(s.onboarding.sst_sen), "text-secondary")}`
      : row(t("Guided onboarding"), t("Not selected"), "text-secondary")}
    <hr class="my-2">
    ${row(t("Due today"), formatRM(s.today.total_sen), "fw-bold fs-6")}
    ${s.today.sst_sen ? html`<div class="small text-secondary text-end">${t("includes {amount} SST", { amount: formatRM(s.today.sst_sen) })}</div>` : ""}
    ${s.trial ? html`<div class="small text-secondary mt-1">${t("After your 30-day trial: {amount}/month incl. SST.", { amount: formatRM(s.monthly.total_sen) })}</div>` : ""}
    <div class="small text-secondary mt-1">${t("Prototype: no payment is taken.")}</div>`;
}

const PLAN_NOTES = {
  free: t("Free forever"),
  basic: t("{price}/month, no trial", { price: PLANS.basic.price }),
  premium: t("1-month free trial, then {price}/month", { price: PLANS.premium.price }),
};

runPage(async () => {
  const ctx = await startPage("register");
  if (ctx.session) {
    window.location.replace("dashboard.html");
    return;
  }
  const chosen = PLANS[param("plan")] ? param("plan") : "free";

  show("main", html`<div class="card p-4 mx-auto form-card">
    <h1 class="h4 mb-1">${t("Create your account")}</h1>
    <p class="text-secondary small">${t("It takes a minute. This is a prototype: no payment is ever taken.")}</p>
    <form id="register-form" novalidate>
      <div class="mb-3">
        <label class="form-label" for="business_name">${t("Business name")}</label>
        <input class="form-control" id="business_name" name="business_name" maxlength="80" placeholder="${t("e.g. {example}", { example: "Dapur Seri" })}" autocomplete="organization">
      </div>
      <div class="mb-3">
        <label class="form-label" for="email">${t("Email")}</label>
        <input class="form-control" id="email" name="email" type="email" autocomplete="email" required maxlength="254">
      </div>
      <div class="mb-3">
        <label class="form-label" for="password">${t("Password")}</label>
        <input class="form-control" id="password" name="password" type="password" autocomplete="new-password" required minlength="8" aria-describedby="password-help">
        <div class="form-text" id="password-help">${t("At least 8 characters.")}</div>
      </div>
      <fieldset class="mb-3">
        <legend class="form-label fs-6">${t("Choose a plan")}</legend>
        <div class="row g-2">${PLAN_ORDER.map((key) => html`
          <div class="col-md-4"><label class="plan-option d-block h-100">
            <input type="radio" name="plan" value="${key}" ${key === chosen ? "checked" : ""}>
            <span class="card p-3 h-100 d-block">
              <span class="fw-semibold d-block">${t(PLANS[key].label)}</span>
              <span class="small text-secondary d-block">${PLAN_NOTES[key]}</span>
              ${key === "premium" ? html`<span class="trial-chip mt-2">${t("First month free")}</span>` : ""}
            </span></label></div>`)}
        </div>
      </fieldset>
      <div class="form-check mb-3">
        <input class="form-check-input" type="checkbox" id="onboarding" name="onboarding">
        <label class="form-check-label" for="onboarding">${t("Add guided onboarding ({price} one-time)", { price: formatRM(ONBOARDING_SEN) })}</label>
        <div class="form-text">${t("We help you set up your cash, invoices and expenses. 8% SST applies.")}</div>
      </div>
      <div class="card p-3 mb-3 bg-light small order-summary" id="order-summary" aria-live="polite">${orderSummary(chosen, false)}</div>
      <button class="btn btn-primary w-100" type="submit">${t("Create account")}</button>
    </form>
    <p class="small text-secondary mt-3 mb-0">${t("Already have an account?")} <a href="login.html">${t("Log in")}</a></p>
  </div>`);

  const form = document.getElementById("register-form");
  // Keep the order summary up to date as the plan or onboarding choice changes.
  form.addEventListener("change", () => {
    show("order-summary", orderSummary(form.plan.value, form.onboarding.checked));
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    clearMessages();
    const businessName = form.business_name.value.trim();
    const email = form.email.value.trim();
    const password = form.password.value;
    const plan = form.plan.value;
    const onboarding = form.onboarding.checked;
    let error = "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) error = t("Enter a valid email address.");
    else if (password.length < 8) error = t("Password must be at least 8 characters.");
    else if (businessName.length > 80) error = t("Business name must be 80 characters or less.");
    else if (!PLANS[plan]) error = t("Choose a plan.");
    if (error) {
      showMessage(error, "danger");
      return;
    }
    busy(form.querySelector("button"), async () => {
      const loggedIn = await signUp({ email, password, businessName, plan, onboarding });
      const welcome = plan === "premium"
        ? t("Account created! Your 1-month Premium free trial has started.")
        : t("Account created!");
      if (loggedIn) {
        goTo("dashboard.html", welcome);
      } else {
        show("main", html`<div class="card p-4 mx-auto auth-card text-center">
          <div class="display-6 text-primary"><i class="bi bi-envelope-check"></i></div>
          <h1 class="h4 mt-2">${t("Check your email")}</h1>
          <p class="text-secondary mb-0">${th("We sent a link to <strong>{email}</strong>. Click it to confirm your account, then log in.", { email })}</p>
        </div>`);
      }
    });
  });
});
