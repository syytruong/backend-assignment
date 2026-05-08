// Plain Node test runner — no framework needed. Run with: node sum_to_n.test.js
//
// Tests cover:
// 1. Happy path (the brief's example)
// 2. Edge cases: 0, 1, -1, -3
// 3. A larger value to verify the formula
// 4. Parity: all three implementations agree on every n in 1..1000
// 5. Recursion's stack-depth limit is documented and asserted
// 6. Bad input rejected with TypeError (not silently coerced or hung)

const { sum_to_n_a, sum_to_n_b, sum_to_n_c } = require('./sum_to_n');

let passed = 0;
let failed = 0;

function assert(actual, expected, label) {
  const ok = actual === expected;
  const status = ok ? '✓' : '✗';
  const detail = ok ? '' : `  expected ${expected}, got ${actual}`;
  console.log(`  ${status} ${label}${detail}`);
  ok ? passed++ : failed++;
}

function assertThrows(fn, label) {
  let threw = false;
  let actualError = null;
  try {
    fn();
  } catch (e) {
    threw = true;
    actualError = e;
  }
  const ok = threw && actualError instanceof TypeError;
  const status = ok ? '✓' : '✗';
  const detail = ok
    ? ''
    : `  expected TypeError, got ${actualError ? actualError.constructor.name : 'no throw'}`;
  console.log(`  ${status} ${label}${detail}`);
  ok ? passed++ : failed++;
}

console.log('\n--- Happy path: sum_to_n(5) === 15 ---');
assert(sum_to_n_a(5), 15, 'A (loop)');
assert(sum_to_n_b(5), 15, 'B (formula)');
assert(sum_to_n_c(5), 15, 'C (recursion)');

console.log('\n--- Edge: n = 0 ---');
assert(sum_to_n_a(0), 0, 'A');
assert(sum_to_n_b(0), 0, 'B');
assert(sum_to_n_c(0), 0, 'C');

console.log('\n--- Edge: n = 1 ---');
assert(sum_to_n_a(1), 1, 'A');
assert(sum_to_n_b(1), 1, 'B');
assert(sum_to_n_c(1), 1, 'C');

console.log('\n--- Negative: n = -1 ---');
assert(sum_to_n_a(-1), -1, 'A');
assert(sum_to_n_b(-1), -1, 'B');
assert(sum_to_n_c(-1), -1, 'C');

console.log('\n--- Negative: n = -3 (-1 + -2 + -3 = -6) ---');
assert(sum_to_n_a(-3), -6, 'A');
assert(sum_to_n_b(-3), -6, 'B');
assert(sum_to_n_c(-3), -6, 'C');

console.log('\n--- Larger: n = 100 (formula: 100*101/2 = 5050) ---');
assert(sum_to_n_a(100), 5050, 'A');
assert(sum_to_n_b(100), 5050, 'B');
assert(sum_to_n_c(100), 5050, 'C');

console.log('\n--- Parity check: all three agree on n = 1..1000 ---');
let allAgree = true;
for (let n = 1; n <= 1000; n++) {
  if (sum_to_n_a(n) !== sum_to_n_b(n) || sum_to_n_b(n) !== sum_to_n_c(n)) {
    console.log(`  ✗ disagreement at n=${n}: a=${sum_to_n_a(n)}, b=${sum_to_n_b(n)}, c=${sum_to_n_c(n)}`);
    allAgree = false;
    break;
  }
}
assert(allAgree, true, 'a, b, c agree for n in [1, 1000]');

console.log('\n--- Big input: n = 1,000,000 (formula only — recursion would overflow) ---');
const expectedBig = (1000000 * 1000001) / 2;
assert(sum_to_n_a(1000000), expectedBig, 'A (loop)');
assert(sum_to_n_b(1000000), expectedBig, 'B (formula)');
console.log(`  ⓘ skipping C — recursion depth ${1_000_000} exceeds the JS engine stack limit`);

console.log('\n--- Documented limit: C throws on very large n ---');
let stackThrew = false;
try {
  sum_to_n_c(100000);
} catch (e) {
  stackThrew = e instanceof RangeError;
}
assert(stackThrew, true, 'sum_to_n_c(100000) throws RangeError as documented');

console.log('\n--- Bad input: rejects non-integers with TypeError ---');
const badInputs = [
  ['undefined', undefined],
  ['null', null],
  ['empty string', ''],
  ['numeric string', '5'],
  ['letters', 'abc'],
  ['NaN', NaN],
  ['Infinity', Infinity],
  ['-Infinity', -Infinity],
  ['boolean true', true],
  ['boolean false', false],
  ['object', {}],
  ['array', [1, 2, 3]],
  ['float 3.7', 3.7],
  ['float 0.1', 0.1],
  ['BigInt', 5n],
];

for (const [label, val] of badInputs) {
  assertThrows(() => sum_to_n_a(val), `A rejects ${label}`);
  assertThrows(() => sum_to_n_b(val), `B rejects ${label}`);
  assertThrows(() => sum_to_n_c(val), `C rejects ${label}`);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);