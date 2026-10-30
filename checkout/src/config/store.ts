/**
 * Configuração da loja — edite aqui produtos, preços, frete e cupons.
 * Este arquivo só é lido no SERVIDOR: os cupons nunca chegam ao navegador e
 * o preço cobrado sempre sai daqui (nunca do que o navegador manda).
 * Valores em CENTAVOS.
 */

import { BRAND } from "./brand.ts";

export type StoreBump = { id: string; title: string; description: string; priceCents: number };
export type StoreVariant = { value: string; maxQuantity: number };

export type StoreProduct = {
  slug: string; // vira o link: /checkout/<slug>
  name: string;
  priceCents: number;
  imageUrl?: string; // caminho em /public ou URL https
  tag?: string; // etiqueta acima do nome (ex.: "Lançamento")
  variant?: string; // ex.: "Cor: Preto"
  variants?: StoreVariant[];
  active: boolean;
  bumps?: StoreBump[];
  /** pede endereço de entrega (produto físico) */
  requireAddress: boolean;
};

export type StoreCoupon = { code: string; type: "percent" | "fixed"; value: number; active: boolean };

export const STORE = {
  /** nome e cor: edite em src/config/brand.ts */
  name: BRAND.name,
  /** título da barra do topo do checkout */
  checkoutTitle: "Finalize sua compra",
  brandColor: BRAND.color,
  /** desconto no Pix, em % (0 = sem desconto) */
  pixDiscountPercent: 0,
  /** dados pedidos no faturamento */
  fields: { nome: true, email: true, cpf: true, celular: true },
  shipping: {
    mode: "free" as "free" | "fixed",
    priceCents: 0,
    daysMin: 6,
    daysMax: 6,
    label: "Frete grátis",
  },
  /** cupons (só o servidor conhece) — value: % (percent) ou centavos (fixed) */
  coupons: [] as StoreCoupon[],
  /** minutos para o Pix expirar */
  pixExpiresMinutes: 30,
  supportEmail: "",
  products: [
    {
      slug: "air-fryer-forno-mondial-afon-12l-fg",
      name: "Fritadeira Air Fryer Oven Mondial AFON-12L-FG 12 L Digital Cinza",
      priceCents: 6790,
      imageUrl: "/products/air-fryer-mondial.png",
      tag: "Mondial · Air Fryer Forno",
      variant: "Cor: Cinza",
      variants: [
        { value: "127V", maxQuantity: 15 },
        { value: "220V", maxQuantity: 15 },
      ],
      active: true,
      requireAddress: true,
      bumps: [],
    },
  ] as StoreProduct[],
};

export function findProduct(slug: unknown): StoreProduct | null {
  if (typeof slug !== "string") return null;
  return STORE.products.find((p) => p.slug === slug && p.active) ?? null;
}

export function findVariant(product: StoreProduct, value: unknown): StoreVariant | null {
  if (!product.variants?.length) return null;
  if (typeof value !== "string") return null;
  return product.variants.find((variant) => variant.value === value) ?? null;
}
