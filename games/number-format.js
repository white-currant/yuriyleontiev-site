function formatGameNumber(value) {
  if (!Number.isFinite(value) || Math.abs(value) < 1e6) return String(value);

  var suffixes = ["M", "B", "T"];
  var amount = Math.abs(value) / 1e6;
  var unit = 0;
  while (unit < suffixes.length - 1 && Number(amount.toPrecision(3)) >= 1000) {
    amount /= 1000;
    unit += 1;
  }
  var rounded = Number(amount.toPrecision(3));
  if (rounded >= 1000) return value.toExponential(2).replace(/\.?0+(?=e)/, "");
  return (value < 0 ? "-" : "") + rounded + suffixes[unit];
}
