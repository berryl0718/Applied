// Team access (Premium). A prototype: it prepares an invite code, but no email
// is sent and invited people cannot log in yet.
import { addInvite, deleteInvite, listInvites } from "../db.js";
import { MAX_TEAM_INVITES, TEAM_ROLES } from "../plans.js";
import {
  busy, clearMessages, goTo, html, lockedCard, runPage, show, showMessage, startPage,
} from "../ui.js";
import { prettyDate } from "../cashflow.js";

/** A random invite code like "k7Qp2xMa" (uses the browser's secure random numbers). */
export function makeInviteCode(length = 8) {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return [...bytes].map((b) => letters[b % letters.length]).join("");
}

runPage(async () => {
  const { plan } = await startPage("team", { login: true });
  if (!plan.team) {
    show("main", lockedCard("Team access", "Premium", plan));
    return;
  }
  const invites = await listInvites();
  const full = invites.length >= MAX_TEAM_INVITES;

  show("main", html`
    <div class="mb-3"><h1 class="h3 m-0">Team access</h1>
      <p class="text-secondary small mb-0">Prepare a demo invite for a team member. This is a prototype: no email is sent, and invited people cannot log in yet.</p></div>
    <div class="row g-3">
      <div class="col-lg-5"><div class="card p-4">
        <h2 class="h6">New invite</h2>
        ${full ? html`<p class="text-secondary small mb-0">You have prepared the maximum of ${MAX_TEAM_INVITES} invites. Remove one to add another.</p>`
        : html`<form id="invite-form" novalidate>
          <div class="mb-3"><label class="form-label" for="name">Team member's name</label>
            <input class="form-control" id="name" name="name" required maxlength="60"></div>
          <div class="mb-3"><label class="form-label" for="role">Role</label>
            <select class="form-select" id="role" name="role">${TEAM_ROLES.map((r) =>
              html`<option value="${r}">${r === "viewer" ? "Viewer (can look)" : "Editor (can add and edit)"}</option>`)}</select></div>
          <button class="btn btn-primary" type="submit">Prepare invite</button>
        </form>`}
      </div></div>
      <div class="col-lg-7"><div class="card p-3">
        <h2 class="h6">Prepared invites</h2>
        ${invites.length ? invites.map((inv) => html`<div class="event-row">
          <div class="min-w-0"><div class="fw-semibold small text-break">${inv.name} <span class="badge badge-soft">${inv.role}</span></div>
            <div class="small text-secondary">Invite code <span class="code-chip">${inv.code}</span> &middot; ${prettyDate(inv.created_at.slice(0, 10))}</div></div>
          <button class="btn btn-sm btn-outline-danger" data-id="${inv.id}">Remove</button></div>`)
        : html`<p class="text-secondary small mb-0">No invites yet.</p>`}
      </div></div>
    </div>`);

  const form = document.getElementById("invite-form");
  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    clearMessages();
    const name = form.name.value.trim();
    const role = form.role.value;
    if (!name || name.length > 60) return showMessage("Enter the team member's name (60 characters or less).", "danger");
    if (!TEAM_ROLES.includes(role)) return showMessage("Pick a role for the invite.", "danger");
    return busy(form.querySelector("button"), async () => {
      await addInvite(name, role, makeInviteCode());
      goTo("team.html", `Demo invite prepared for ${name}. No email is sent.`);
    });
  });

  document.querySelector("main").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-id]");
    if (!button || !window.confirm("Remove this invite?")) return;
    busy(button, async () => {
      await deleteInvite(Number(button.dataset.id));
      goTo("team.html", "Invite removed.", "info");
    });
  });
});
