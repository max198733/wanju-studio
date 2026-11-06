import test from 'node:test';
import assert from 'node:assert/strict';
import { pricingQuote } from './pricing.mjs';

test('selling at twice the cost yields fifty percent gross margin with integer point accounting', () => {
  const quote = pricingQuote({ unit: 'image', costYuan: '0.15', multiplier: '2', quantity: 100 });
  assert.equal(quote.unitPoints, 30);
  assert.equal(quote.totalPoints, 3000);
  assert.equal(quote.totalCostYuan, '15.0000');
  assert.equal(quote.grossProfitYuan, '15.0000');
  assert.equal(quote.grossMarginPercent, 50);
  assert.equal(quote.estimateOnly, true);
});
test('small costs round upward at the unit price and invalid or unbounded inputs are rejected', () => {
  assert.equal(pricingQuote({ unit: 'video-second', costYuan: '0.0001', multiplier: '2' }).unitPoints, 1);
  for (const change of [{ costYuan: '-1' }, { costYuan: 'NaN' }, { costYuan: '1e9' }, { multiplier: '0.9' },
    { quantity: 1.5 }, { quantity: 100001 }, { unit: 'unknown' }]) {
    assert.throws(() => pricingQuote({ unit: 'image', costYuan: '1', multiplier: '2', ...change }));
  }
});
