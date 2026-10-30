import type { NextApiRequest, NextApiResponse } from "next";
import { onlyMethod, rateLimited } from "@/server/http";

type CepAddress = { street: string; district: string; city: string; state: string };

async function fetchJson(url: string): Promise<Record<string, unknown> | null> {
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "Checkout001/1.0", Accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!onlyMethod(req, res, "POST")) return;
  if (rateLimited(req, "cep-lookup", 30, 60_000)) {
    return res.status(429).json({ success: false, message: "Muitas consultas de CEP. Aguarde um pouco." });
  }
  res.setHeader("Cache-Control", "no-store");
  const rawCep = (req.body as { cep?: unknown } | null)?.cep;
  const cep = typeof rawCep === "string" ? rawCep.replace(/\D/g, "") : "";
  if (!/^\d{8}$/.test(cep)) {
    return res.status(400).json({ success: false, message: "Informe um CEP válido com 8 números." });
  }

  const via = await fetchJson("https://viacep.com.br/ws/" + cep + "/json/");
  const viaAddress: CepAddress = {
    street: typeof via?.logradouro === "string" ? via.logradouro : "",
    district: typeof via?.bairro === "string" ? via.bairro : "",
    city: typeof via?.localidade === "string" ? via.localidade : "",
    state: typeof via?.uf === "string" ? via.uf : "",
  };
  let address = via?.erro ? { street: "", district: "", city: "", state: "" } : viaAddress;

  if (!address.street || !address.district || !address.city || !address.state) {
    const brasil = await fetchJson("https://brasilapi.com.br/api/cep/v1/" + cep);
    address = {
      street: address.street || (typeof brasil?.street === "string" ? brasil.street : ""),
      district: address.district || (typeof brasil?.neighborhood === "string" ? brasil.neighborhood : ""),
      city: address.city || (typeof brasil?.city === "string" ? brasil.city : ""),
      state: address.state || (typeof brasil?.state === "string" ? brasil.state : ""),
    };
  }

  if (!address.street || !address.district || !address.city || !address.state) {
    return res.status(404).json({ success: false, message: "Não foi possível completar o endereço desse CEP. Confira o CEP e tente novamente." });
  }
  return res.status(200).json({ success: true, address });
}