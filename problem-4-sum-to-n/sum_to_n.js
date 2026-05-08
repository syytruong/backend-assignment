function assertInteger(n) {
  if (typeof n !== 'number' || !Number.isInteger(n)) {
    throw new TypeError(
      `sum_to_n expected an integer, received ${typeof n}: ${String(n)}`,
    );
  }
}

var sum_to_n_a = function (n) {
  assertInteger(n);
  let sum = 0;
  if (n >= 0) {
    for (let i = 1; i <= n; i++) sum += i;
  } else {
    for (let i = -1; i >= n; i--) sum += i;
  }
  return sum;
};

var sum_to_n_b = function (n) {
  assertInteger(n);

  const abs = Math.abs(n);
  return (Math.sign(n) * (abs * (abs + 1))) / 2;
};

var sum_to_n_c = function (n) {
  assertInteger(n);
  return _sum_to_n_c_unchecked(n);
};

function _sum_to_n_c_unchecked(n) {
  if (n === 0) return 0;
  if (n > 0) return n + _sum_to_n_c_unchecked(n - 1);
  return n + _sum_to_n_c_unchecked(n + 1);
}

module.exports = { sum_to_n_a, sum_to_n_b, sum_to_n_c };