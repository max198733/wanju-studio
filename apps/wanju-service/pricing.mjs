import { fail } from './store.mjs';

function decimal(value, digits, maximum, label) {
  const text = String(value ?? '');
  if (!new RegExp(`^\\d{1,9}(?:\\.\\d{1,${digits}})?$`).test(text)) fail(`${label}格式无效。`);
  const [whole, fraction = ''] = text.split('.');
  const scaled = BigInt(whole) * 10n ** BigInt(digits) + BigInt(fraction.padEnd(digits, '0'));
  if (scaled <= 0n || scaled > maximum) fail(`${label}超出范围。`);
  return scaled;
}
const money = (scaled, digits) => `${scaled / 10n ** BigInt(digits)}.${String(scaled % 10n ** BigInt(digits)).padStart(digits, '0')}`;

export function pricingQuote(input) {
  const unit = input.unit;
  if (!['input-million', 'output-million', 'image', 'video-second', 'video-clip'].includes(unit)) fail('请选择计价单位。');
  const cost = decimal(input.costYuan, 4, 10000000000n, '单位成本');
  const multiplier = decimal(input.multiplier, 2, 1000n, '售价倍数');
  if (multiplier < 100n) fail('售价倍数至少为1。');
  const quantity = input.quantity ?? 1;
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 100000) fail('数量需为1至100000的整数。');
  // 100 points = one yuan; round the unit selling price upward once, then multiply by quantity.
  const unitPoints = (cost * multiplier + 9999n) / 10000n;
  const revenue = unitPoints * BigInt(quantity) * 100n;
  const totalCost = cost * BigInt(quantity);
  return {
    unit, quantity, pointsPerYuan: 100, unitPoints: Number(unitPoints), totalPoints: Number(unitPoints * BigInt(quantity)),
    unitSaleYuan: money(unitPoints, 2), totalCostYuan: money(totalCost, 4),
    totalSaleYuan: money(revenue, 4), grossProfitYuan: money(revenue - totalCost, 4),
    grossMarginPercent: Math.round(Number(revenue - totalCost) / Number(revenue) * 10000) / 100,
    estimateOnly: true,
    note: '按手填供应商实际成本测算，未扣除重试损耗、支付及服务器等费用；不会修改售价或发起生成。',
  };
}
