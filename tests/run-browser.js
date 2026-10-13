// Runs the same tests in the browser: open http://localhost:8000/tests/
import "./app.test.js";
import { runAll } from "./harness.js";

const list = document.getElementById("results");
const { passed, failed } = await runAll((name, error) => {
  const item = document.createElement("li");
  item.className = error ? "fail" : "pass";
  item.textContent = `${error ? "FAIL" : "ok"}: ${name}`;
  if (error) {
    const details = document.createElement("pre");
    details.textContent = error.message;
    item.append(details);
  }
  list.append(item);
});
document.getElementById("summary").textContent = `${passed} passed, ${failed} failed`;
