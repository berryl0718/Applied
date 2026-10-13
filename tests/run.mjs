// Run the tests in Node:  node tests/run.mjs
import "./app.test.js";
import { runAll } from "./harness.js";

const { passed, failed } = await runAll((name, error) => {
  console.log(`${error ? "FAIL" : "ok  "} ${name}`);
  if (error) console.log(`     ${error.message}`);
});
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
