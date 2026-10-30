/**
 * Preço cobrado — calculado SÓ no servidor a partir de src/config/store.ts.
 * Ordem: subtotal (produto + adicionais) → cupom → % do Pix → + frete.
 * O frete não recebe desconto. Os itens somam exatamente o total.
 */
import { STORE, findVariant, type StoreCoupon, type StoreProduct } from "../config/store.ts";

export type OrderItem = {
  id: string;
  name: string;
  kind: "product" | "bump" | "shipping" | "discount";
  priceCents: number;
  quantity: number;
};

export type Quote = {
  subtotalCents: number;
  couponDiscountCents: number;
  pixDiscountCents: number;
  pixDiscountPercent: number;
  shippingCents: number;
  totalCents: number;
  coupon: { code: string; type: "percent" | "fixed"; value: number } | null;
  items: OrderItem[];
};

export type PricingResult =
  | { ok: true; quote: Quote }
  | { ok: false; code: "bump_unavailable" | "coupon_invalid" | "variant_unavailable" | "quantity_invalid"; message: string };

export function normalizeCode(v: unknown): string {
  return typeof v === "string" ? v.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 30) : "";
}

export function findCoupon(code: unknown, coupons: StoreCoupon[] = STORE.coupons): StoreCoupon | null {
  const c = normalizeCode(code);
  if (!c) return null;
  return coupons.find((x) => x.active && normalizeCode(x.code) === c && x.value > 0) ?? null;
}

export function shippingFor(product: StoreProduct, shipping = STORE.shipping): number {
  return product.requireAddress && shipping.mode === "fixed" ? Math.max(0, Math.round(shipping.priceCents)) : 0;
}

export function quote(
  product: StoreProduct,
  body: { bumpIds?: unknown; couponCode?: unknown; variant?: unknown; quantity?: unknown },
  opts: { pixDiscountPercent?: number; coupons?: StoreCoupon[]; shipping?: typeof STORE.shipping } = {},
): PricingResult {
  const pixPercent = Math.min(100, Math.max(0, opts.pixDiscountPercent ?? STORE.pixDiscountPercent));
  const bumps = product.bumps ?? [];
  const selectedVariant = product.variants?.length ? findVariant(product, body.variant) : null;
  if (product.variants?.length && !selectedVariant) {
    return { ok: false, code: "variant_unavailable", message: "Escolha uma voltagem disponível." };
  }
  const requestedQuantity = body.quantity === undefined ? 1 : Number(body.quantity);
  const maxQuantity = selectedVariant?.maxQuantity ?? 1;
  if (!Number.isSafeInteger(requestedQuantity) || requestedQuantity < 1 || requestedQuantity > maxQuantity) {
    return { ok: false, code: "quantity_invalid", message: `Escolha uma quantidade entre 1 e ${maxQuantity}.` };
  }
  const quantity = requestedQuantity;

  const wanted = Array.isArray(body.bumpIds) ? [...new Set(body.bumpIds.slice(0, 20).map(String))] : [];
  const chosen = [];
  for (const id of wanted) {
    const b = bumps.find((x) => x.id === id);
    if (!b) return { ok: false, code: "bump_unavailable", message: "Um item adicional não está mais disponível. Atualize a página." };
    chosen.push(b);
  }

  let coupon: StoreCoupon | null = null;
  if (typeof body.couponCode === "string" && body.couponCode.trim()) {
    coupon = findCoupon(body.couponCode, opts.coupons);
    if (!coupon) return { ok: false, code: "coupon_invalid", message: "Cupom inválido ou expirado." };
  }

  const base: OrderItem[] = [
    {
      id: product.slug,
      name: `${product.name}${selectedVariant ? ` · ${selectedVariant.value}` : ""}`,
      kind: "product",
      priceCents: Math.max(0, Math.round(product.priceCents)),
      quantity,
    },
    ...chosen.map((b) => ({ id: b.id, name: b.title, kind: "bump" as const, priceCents: Math.max(0, Math.round(b.priceCents)), quantity: 1 })),
  ];
  const subtotal = base.reduce((s, i) => s + i.priceCents * i.quantity, 0);
  const couponDiscount = !coupon
    ? 0
    : coupon.type === "percent"
      ? Math.round((subtotal * Math.min(100, coupon.value)) / 100)
      : Math.min(subtotal, Math.round(coupon.value));
  const afterCoupon = subtotal - couponDiscount;
  const goods = pixPercent > 0 ? Math.round((afterCoupon * (100 - pixPercent)) / 100) : afterCoupon;

  const discount = subtotal - goods;
  let items = discount > 0 ? [...base, { id: "desconto", name: "Desconto", kind: "discount" as const, priceCents: -discount, quantity: 1 }] : base;
  const ship = shippingFor(product, opts.shipping);
  if (ship > 0) items = [...items, { id: "frete", name: (opts.shipping ?? STORE.shipping).label || "Frete", kind: "shipping", priceCents: ship, quantity: 1 }];

  return {
    ok: true,
    quote: {
      subtotalCents: subtotal,
      couponDiscountCents: couponDiscount,
      pixDiscountCents: afterCoupon - goods,
      pixDiscountPercent: pixPercent,
      shippingCents: ship,
      totalCents: goods + ship,
      coupon: coupon ? { code: normalizeCode(coupon.code), type: coupon.type, value: coupon.value } : null,
      items,
    },
  };
}
