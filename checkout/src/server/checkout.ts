/**
 * Fluxo do pedido no servidor:
 *  1. recalcula o preço (src/server/pricing.ts) — o total do navegador não vale;
 *  2. usa uma referência aleatória para a cobrança;
 *  3. cria a cobrança Pix no provedor;
 *  4. o navegador guarda os dados públicos e consulta o status pela referência.
 */
import { STORE, findProduct } from "../config/store.ts";
import { quote } from "./pricing.ts";
import { parseAddress, parseBuyer } from "./validate.ts";
import { type Order, newOrderId } from "./orders.ts";
import type { PixProvider } from "./providers.ts";

export class CheckoutError extends Error {
  code: string;
  status: number;
  constructor(message: string, code: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function tracking(v: unknown): Record<string, string> {
  const o = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  const out: Record<string, string> = {};
  const passthrough = new Set(["src", "sck", "xcod", "subid", ...Array.from({ length: 10 }, (_, index) => "subid" + (index + 1))]);
  for (const [rawKey, rawValue] of Object.entries(o)) {
    const key = rawKey.toLowerCase();
    if (!/^utm_[a-z0-9_]{1,32}$/.test(key) && !passthrough.has(key)) continue;
    const value = typeof rawValue === "string" ? rawValue.trim().slice(0, 200) : "";
    if (value) out[key] = value;
    if (Object.keys(out).length >= 24) break;
  }
  return out;
}

export async function createOrder(
  body: Record<string, unknown>,
  deps: { provider: PixProvider; baseUrl: string | null; webhookSecret: string | null },
): Promise<Order> {
  const product = findProduct(body.slug);
  if (!product) throw new CheckoutError("Produto não encontrado.", "product_not_found", 404);

  const priced = quote(product, { bumpIds: body.bumpIds ?? [], couponCode: body.couponCode, variant: body.variant, quantity: body.quantity });
  if (!priced.ok) throw new CheckoutError(priced.message, priced.code);
  const q = priced.quote;
  if (q.totalCents < 100) throw new CheckoutError("Valor mínimo para Pix é R$ 1,00.", "amount_too_low");

  let address = null;
  if (product.requireAddress) {
    const a = parseAddress(body.shippingAddress);
    if (!a.ok) throw new CheckoutError(a.message, "address_invalid");
    address = a.address;
  }
  // FlevoPag exige nome, e-mail, documento e telefone do pagador.
  const fields = deps.provider.demo ? STORE.fields : { nome: true, email: true, cpf: true, celular: true };
  const b = parseBuyer(body, fields, address?.recipient ?? "");
  if (!b.ok) throw new CheckoutError(b.message, "buyer_invalid");

  const rawKey = typeof body.checkoutKey === "string" ? body.checkoutKey.trim() : "";
  const variantKey = typeof body.variant === "string" ? body.variant : "default";
  const key = /^[A-Za-z0-9-]{16,64}$/.test(rawKey) ? `${product.slug}:${variantKey}:${rawKey}` : null;
  // A mesma tentativa usa a mesma referência externa para permitir consulta à API.
  const id = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(rawKey)
    ? rawKey.toLowerCase()
    : newOrderId();

  const draft: Order = {
    id,
    idempotencyKey: key,
    productSlug: product.slug,
    productName: q.items.find((item) => item.kind === "product")?.name ?? product.name,
    status: "pending",
    totalCents: q.totalCents,
    items: q.items,
    couponCode: q.coupon?.code ?? null,
    buyer: b.buyer,
    address,
    provider: deps.provider.name,
    chargeId: null,
    pixCode: null,
    pixQrImage: null,
    expiresAt: null,
    paidAt: null,
    createdAt: new Date().toISOString(),
  };
  const webhookUrl =
    deps.baseUrl && deps.webhookSecret && !deps.provider.demo
      ? `${deps.baseUrl.replace(/\/+$/, "")}/api/webhooks/pix${deps.webhookSecret ? `?token=${encodeURIComponent(deps.webhookSecret)}` : ""}`
      : null;
  try {
    const charge = await deps.provider.createCharge({
      orderId: draft.id,
      amountCents: draft.totalCents,
      description: draft.productName,
      expiresMinutes: STORE.pixExpiresMinutes,
      buyer: draft.buyer,
      idempotencyKey: draft.id,
      webhookUrl,
      address,
      tracking: tracking(body.tracking),
    });
    return {
      ...draft,
      chargeId: charge.chargeId,
      pixCode: charge.pixCode,
      pixQrImage: charge.pixQrImage,
      expiresAt: charge.expiresAt,
    };
  } catch (e: any) {
    throw new CheckoutError(e?.message || "Não foi possível gerar o Pix. Tente de novo.", "charge_failed", 502);
  }
}

const lastCheck = new Map<string, number>();

/** Consulta status na API usando a referência externa, sem guardar pedido no servidor. */
export async function refreshOrder(order: Order, deps: { provider: PixProvider }, force = false): Promise<Order> {
  if (order.status !== "pending" || deps.provider.demo || deps.provider.name !== order.provider || !deps.provider.getStatusByReference) return order;
  const now = Date.now();
  if (!force && now - (lastCheck.get(order.id) ?? 0) < 10_000) return order;
  lastCheck.set(order.id, now);
  if (lastCheck.size > 5000) for (const [k, v] of lastCheck) if (now - v > 60_000) lastCheck.delete(k);
  try {
    const s = await deps.provider.getStatusByReference(order.id);
    if (!s) return order;
    if (s.status !== order.status) {
      return { ...order, status: s.status, paidAt: s.paidAt };
    }
  } catch {
    /* provedor fora: mostra o que tem */
  }
  return order;
}

/** O que o link público do pedido mostra — sem rua, CPF, e-mail ou telefone. */
export function publicOrder(o: Order, demo: boolean) {
  const expired = o.status === "pending" && !!o.expiresAt && new Date(o.expiresAt).getTime() < Date.now();
  return {
    id: o.id,
    status: expired ? "expired" : o.status,
    demo,
    productSlug: o.productSlug,
    productName: o.productName,
    totalCents: o.totalCents,
    items: o.items.map((i) => ({ name: i.name, kind: i.kind, priceCents: i.priceCents, quantity: i.quantity })),
    pixCode: o.status === "pending" && !expired ? o.pixCode : null,
    pixQrImage: o.status === "pending" && !expired ? o.pixQrImage : null,
    expiresAt: o.expiresAt,
    paidAt: o.paidAt,
    createdAt: o.createdAt,
    delivery: o.address
      ? { city: o.address.city, state: o.address.state, daysMin: STORE.shipping.daysMin, daysMax: STORE.shipping.daysMax }
      : null,
  };
}
export type PublicOrder = ReturnType<typeof publicOrder>;
