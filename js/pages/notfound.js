// Shown by Vercel for any address that doesn't exist.
import { html, runPage, show, startPage } from "../ui.js";

runPage(async () => {
  const { session } = await startPage("notfound");
  show("main", html`<div class="text-center py-5">
    <div class="display-5 fw-bold text-secondary">404</div>
    <h1 class="h4">We couldn't find that page.</h1>
    <a class="btn btn-primary mt-2" href="${session ? "dashboard.html" : "index.html"}">Go back home</a>
  </div>`);
});
