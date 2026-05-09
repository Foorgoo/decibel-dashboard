const ZERO_CURRENCY_THRESHOLD = 0.005;

export const CURRENCY_FORMATTER = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export const AMP_FORMATTER = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export const COMPACT_CURRENCY_FORMATTER = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 1,
});

export const normalizeCurrencyAmount = (value: number) => (
  Math.abs(value) < ZERO_CURRENCY_THRESHOLD ? 0 : value
);

export const formatCurrency = (value: number) => CURRENCY_FORMATTER.format(normalizeCurrencyAmount(value));

export const formatSignedCurrency = (value: number) => {
  const normalizedValue = normalizeCurrencyAmount(value);
  return `${normalizedValue > 0 ? '+' : ''}${CURRENCY_FORMATTER.format(normalizedValue)}`;
};

export const formatAmp = (value: number) => AMP_FORMATTER.format(value);

export const formatCompactCurrency = (value: number) => (
  COMPACT_CURRENCY_FORMATTER.format(normalizeCurrencyAmount(value))
);
