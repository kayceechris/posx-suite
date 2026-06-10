// Per-outlet product pricing. Products keep one base price + cost on the
// root document, and an array of { outlet_id, price, cost_price } overrides
// stored under `terminal_prices` (the field name is legacy — terminal_id is
// now ignored). priceForOutlet() picks the override for the active outlet
// when one exists, otherwise the base price.
//
// Backwards compatible with older data that still has terminal_id set —
// we treat the first matching outlet_id row as the active price regardless.

export function priceForOutlet(product, outletId) {
  if (!product) return 0;
  const base = parseFloat(product.price) || 0;
  if (!outletId) return base;
  const overrides = product.terminal_prices || product.outlet_prices || [];
  const match = overrides.find((tp) => tp && tp.outlet_id === outletId);
  if (match && match.price !== "" && match.price != null) {
    const p = parseFloat(match.price);
    if (!Number.isNaN(p)) return p;
  }
  return base;
}

export function costForOutlet(product, outletId) {
  if (!product) return 0;
  const base = parseFloat(product.cost_price) || 0;
  if (!outletId) return base;
  const overrides = product.terminal_prices || product.outlet_prices || [];
  const match = overrides.find((tp) => tp && tp.outlet_id === outletId);
  if (match && match.cost_price !== "" && match.cost_price != null) {
    const c = parseFloat(match.cost_price);
    if (!Number.isNaN(c)) return c;
  }
  return base;
}
