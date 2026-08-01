// Currency formatting utility for Nepali Rupees.
// Anything non-numeric (undefined, null, '', NaN) formats as Rs 0.00 so a missing
// server field can never render "Rs NaN" in a financial summary.
function toNumber(amount) {
  const parsed = typeof amount === 'number' ? amount : parseFloat(amount)
  return Number.isFinite(parsed) ? parsed : 0
}

export const formatCurrency = (amount) => {
  return `Rs ${toNumber(amount).toFixed(2)}`
}

export const formatCurrencyShort = (amount) => {
  return `Rs ${toNumber(amount).toFixed(0)}`
}
