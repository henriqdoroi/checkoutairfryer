import type { GetServerSideProps } from "next";
import { STORE, findProduct, findVariant } from "@/config/store";
import { isDemo } from "@/server/env";
import StoreCheckout from "@/components/StoreCheckout";
import type { PublicCheckout } from "@/components/lib";

/** Só dados públicos vão pro navegador (os cupons ficam no servidor). */
export const getServerSideProps: GetServerSideProps<{ data: PublicCheckout }> = async ({ params, query }) => {
  const product = findProduct(params?.slug);
  if (!product) return { notFound: true };
  const rawCep = Array.isArray(query.cep) ? query.cep[0] : query.cep;
  const cepDigits = typeof rawCep === "string" ? rawCep.replace(/\D/g, "").slice(0, 8) : "";
  if (product.requireAddress && cepDigits.length !== 8) {
    return { redirect: { destination: "https://ml-produto-mobile.vercel.app/", permanent: false } };
  }
  const requestedVoltage = Array.isArray(query.voltage) ? query.voltage[0] : query.voltage;
  const selectedVariant = findVariant(product, requestedVoltage) ?? product.variants?.[0] ?? null;
  const maxQuantity = selectedVariant?.maxQuantity ?? 1;
  const requestedQuantity = Number(Array.isArray(query.quantity) ? query.quantity[0] : query.quantity);
  const quantity = Number.isSafeInteger(requestedQuantity) ? Math.max(1, Math.min(maxQuantity, requestedQuantity)) : 1;
  const demo = isDemo();
  return {
    props: {
      data: {
        demo,
        initialCep: cepDigits || null,
        store: {
          name: STORE.name,
          title: STORE.checkoutTitle,
          brandColor: STORE.brandColor,
          pixDiscountPercent: STORE.pixDiscountPercent,
          couponsEnabled: STORE.coupons.some((c) => c.active),
          // a FlevoPag exige nome, e-mail, CPF e telefone
          fields: demo ? STORE.fields : { nome: true, email: true, cpf: true, celular: true },
          shipping: STORE.shipping,
        },
        product: {
          slug: product.slug,
          name: product.name,
          priceCents: product.priceCents,
          imageUrl: product.imageUrl ?? null,
          tag: product.tag ?? null,
          variant: [product.variant, selectedVariant ? `Voltagem: ${selectedVariant.value}` : null].filter(Boolean).join(" · ") || null,
          variantValue: selectedVariant?.value ?? null,
          quantity,
          maxQuantity,
          requireAddress: product.requireAddress,
          bumps: product.bumps ?? [],
        },
      },
    },
  };
};

export default function CheckoutPage({ data }: { data: PublicCheckout }) {
  return <StoreCheckout data={data} />;
}
