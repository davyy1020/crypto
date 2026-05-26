export function checkPriceAlert({ symbol, price, threshold }) {
  if (!threshold || Number.isNaN(Number(threshold))) return null;

  const latestPrice = Number(price);
  const targetPrice = Number(threshold);

  if (latestPrice >= targetPrice) {
    return {
      type: 'PRICE_ABOVE',
      symbol: symbol.toUpperCase(),
      price: latestPrice,
      message: `${symbol.toUpperCase()} sudah mencapai ${latestPrice}, melewati target ${targetPrice}`,
      createdAt: new Date().toISOString()
    };
  }

  return null;
}
