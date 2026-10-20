// Fisher's exact test for a 2 by 2 table of counts, two-sided: how likely a
// split at least as uneven as the one seen would be by chance alone, with
// the row and column totals kept as they are. The satiety findings use it
// to state a difference only when the counts support one. Pure functions only.

/** A difference counts when the test gives less than this. */
export const P_MAX = 0.05;

// ln(n!) for n = 0, 1, 2 ..., grown as needed.
const lnFactorials = [0];

function lnFactorial(n) {
  for (let k = lnFactorials.length; k <= n; k++) lnFactorials[k] = lnFactorials[k - 1] + Math.log(k);
  return lnFactorials[n];
}

const lnChoose = (n, k) => lnFactorial(n) - lnFactorial(k) - lnFactorial(n - k);

/**
 * The two-sided p of the table [[a, b], [c, d]] (whole counts): the summed
 * chance of every table with the same totals that is no more likely than
 * this one. A table as likely as this one, within a hair, counts too, as
 * in R's fisher.test.
 */
export function fisherExact(a, b, c, d) {
  const row1 = a + b;
  const row2 = c + d;
  const col1 = a + c;
  const n = row1 + row2;
  const ln = (x) => lnChoose(row1, x) + lnChoose(row2, col1 - x) - lnChoose(n, col1);
  const seen = ln(a);
  let p = 0;
  for (let x = Math.max(0, col1 - row2); x <= Math.min(row1, col1); x++) {
    const l = ln(x);
    if (l <= seen + 1e-7) p += Math.exp(l);
  }
  return Math.min(1, p);
}

/** Whether x of n differs from y of m: the test gives less than 0.05. */
export const differs = (x, n, y, m) => fisherExact(x, n - x, y, m - y) < P_MAX;
