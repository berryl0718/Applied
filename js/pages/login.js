// Log in with email and password (Supabase Auth).
import { signIn } from "../db.js";
import { busy, clearMessages, goTo, html, param, runPage, show, showMessage, startPage } from "../ui.js";

/** Only follow "next" links to our own pages, never to other websites. */
function safeNext(value) {
  return /^[a-z-]+\.html(\?[\w=&%-]*)?$/.test(value) ? value : "dashboard.html";
}

runPage(async () => {
  const ctx = await startPage("login");
  if (ctx.session) {
    window.location.replace(safeNext(param("next")));
    return;
  }

  show("main", html`<div class="card p-4 mx-auto auth-card">
    <h1 class="h4 mb-1">Welcome back</h1>
    <p class="text-secondary small">Log in to see your cash-flow forecast.</p>
    <form id="login-form" novalidate>
      <div class="mb-3">
        <label class="form-label" for="email">Email</label>
        <input class="form-control" id="email" name="email" type="email" autocomplete="email" required maxlength="254">
      </div>
      <div class="mb-3">
        <label class="form-label" for="password">Password</label>
        <input class="form-control" id="password" name="password" type="password" autocomplete="current-password" required>
      </div>
      <button class="btn btn-primary w-100" type="submit">Log in</button>
    </form>
    <p class="small text-secondary mt-3 mb-0">New here? <a href="register.html">Create a free account</a></p>
  </div>`);

  const form = document.getElementById("login-form");
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    clearMessages();
    const email = form.email.value.trim();
    const password = form.password.value;
    if (!email || !password) {
      showMessage("Enter your email and password.", "danger");
      return;
    }
    busy(form.querySelector("button"), async () => {
      await signIn(email, password);
      goTo(safeNext(param("next")), "Welcome back!");
    });
  });
});
