import { getProvider } from "./providers.ts";

/** Dependências do servidor a partir das variáveis de ambiente. */
export async function deps() {
  const provider = getProvider();
  return {
    provider,
    baseUrl: process.env.PUBLIC_BASE_URL?.trim() || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null),
    webhookSecret: process.env.PIX_WEBHOOK_SECRET?.trim() || null,
  };
}

export function isDemo(): boolean {
  try {
    return getProvider().demo;
  } catch {
    return true;
  }
}
