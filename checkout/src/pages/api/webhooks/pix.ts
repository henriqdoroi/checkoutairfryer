import type { NextApiRequest, NextApiResponse } from "next";
import crypto from "node:crypto";
import { deps } from "@/server/env";

export const config = { api: { bodyParser: false } };

async function rawBody(req: NextApiRequest): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > 256 * 1024) throw new Error("payload grande demais");
    chunks.push(c as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function sameToken(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/**
 * Aviso do provedor. O conteúdo NÃO é confiável (a FlevoPay não assina):
 * consultamos a API autenticada; o pedido continua sem armazenamento no servidor.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();
  try {
    const d = await deps();
    const expected = d.webhookSecret;
    const got = typeof req.query.token === "string" ? req.query.token : "";
    if (!expected || !sameToken(got, expected)) return res.status(401).json({ ok: false });

    const body = await rawBody(req);
    const ref = await d.provider.parseWebhook(req.headers, body);
    if (!ref) return res.status(200).json({ ok: true, ignored: true });

    if (ref.orderId && d.provider.getStatusByReference) await d.provider.getStatusByReference(ref.orderId);
    else if (ref.chargeId) await d.provider.getStatus(ref.chargeId);
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("[webhook]", e);
    return res.status(500).json({ ok: false });
  }
}
