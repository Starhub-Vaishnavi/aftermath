// Legacy CommonJS module used by the email worker.
const { formatPrice } = require("../utils/currency");

function receiptLine(name, cents) {
  return name + ": " + formatPrice(cents);
}

module.exports = { receiptLine };
