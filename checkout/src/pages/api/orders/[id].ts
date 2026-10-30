import type { NextApiRequest, NextApiResponse } from "next";
import { deps } from "@/server/env";
import { onlyMethod, rateLimited, sendError } from "@/server/http";

/** Consulta o status do pedido na FlevoPay pela referência externa. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!onlyMethod(req, res, "GET")) return;
  if (rateLimited(req, "order-get", 120, 60_000)) return res.status(429).json({ success: false, message: "Muitas consultas." });

  const id = typeof req.query.id === "string" ? req.query.id : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return res.status(404).json({ success: false, message: "Pedido não encontrado." });
  }

  try {
    const d = await deps();
    if (d.provider.demo || !d.provider.getStatusByReference) {
      return res.status(503).json({ success: false, message: "Consulta Pix indisponível." });
    }
    const status = await d.provider.getStatusByReference(id);
    if (!status) return res.status(404).json({ success: false, message: "Pedido não encontrado na FlevoPay." });

    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ success: true, data: { id, status: status.status, paidAt: status.paidAt } });
  } catch (e) {
    return sendError(res, e);
  }
}
