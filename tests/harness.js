// A tiny test runner that works in Node AND in a web browser, so you don't need
// to install anything. Each test is a function; a failed check throws an error.
export const tests = [];
export function test(name, fn) { tests.push({ name, fn }); }

export function equal(actual, expected, message = "") {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${message}\n  expected: ${e}\n  actual:   ${a}`);
}
export function ok(value, message = "expected something true") {
  if (!value) throw new Error(message);
}

/** Run every test. report(name, error) is called for each one (error is null when it passed). */
export async function runAll(report) {
  let failed = 0;
  for (const { name, fn } of tests) {
    try {
      await fn();
      report(name, null);
    } catch (error) {
      failed += 1;
      report(name, error);
    }
  }
  return { passed: tests.length - failed, failed };
}
