const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 4173);
const capturedAt = "2026-10-20";
const NOMINATIM_REVERSE_URL = process.env.NOMINATIM_REVERSE_URL || "https://nominatim.openstreetmap.org/reverse";
const reverseGeocodeCache = new Map();
const postalCodeLookupCache = new Map();
let reverseGeocodeQueue = Promise.resolve();
let lastReverseGeocodeAt = 0;
const chatRequestsByAddress = new Map();

// Prices, ratings and seller details below come from reference screenshots.
// The store owner reports the stock quantities below as current inventory.
const product = {
  id: "mondial-afon-12l-fg",
  title: "Fritadeira Air Fryer Oven Mondial Afon-12l-fg 12l Digital 2.0 Cinza",
  brand: "Mondial",
  model: "Air Fryer Oven Digit",
  sku: "AFON-12L-FG",
  price: 67.90,
  installments: { count: 10, amount: 6.79, interestFree: true },
  rating: 4.9,
  reviewCount: 593,
  salesLabel: "+5 mil vendidos",
  bestSellerRank: "13º em De Ar Mondial",
  shippingPolicy: { free: true, minimumOrderAmount: 19, firstPurchasePrice: 0, deliveryDays: 7, countTodayAsDayOne: true },
  capturedAt,
  captureNotice: "Preço definido pela loja. As informações de vendas, avaliação, posição e vendedor foram transcritas das imagens de referência e podem estar desatualizadas.",
  variants: [
    { type: "voltage", value: "127V", status: "in-stock", quantity: 15 },
    { type: "voltage", value: "220V", status: "in-stock", quantity: 15 },
  ],
  color: "Cinza",
  gallery: [
    { src: "/assets/product-main.png", alt: "Fritadeira Air Fryer Forno Mondial em aço inox e painel digital" },
    { type: "video", src: "/assets/product-video.mp4", poster: "/assets/product-main.png", alt: "Vídeo da Air Fryer Forno Mondial" },
    { src: "/assets/product-differentials.png", alt: "Diferenciais e acessórios da Air Fryer Forno Mondial" },
    { src: "/assets/product-benefits.png", alt: "Benefícios da Air Fryer Forno Mondial" },
    { src: "/assets/product-specifications.png", alt: "Especificações da Air Fryer Forno Mondial" },
    { src: "/assets/product-box-contents.png", alt: "Itens que acompanham a Air Fryer Forno Mondial" },
    { src: "/assets/product-dimensions.png", alt: "Dimensões da Air Fryer Forno Mondial" },
  ],
  description: [
    "Sobre a empresa: Somos a Lojas Campana, uma empresa especializada em vendas online, revendedora autorizada das maiores marcas do mercado. Trabalhamos apenas com produtos originais com garantia de fábrica.",
    "Sobre o produto: A Air Fryer Forno Mondial Oven AFON-12L-FG tem capacidade de 12 litros e potência de 2000W. Possui painel digital Touch com 10 funções predefinidas, temperatura ajustável até 200°C, timer de até 90 minutos, visor amplo, iluminação interna, desligamento automático e aviso sonoro.",
    "Disponível nas voltagens 127V e 220V. Confira e selecione a voltagem correta antes de finalizar a compra e utilizar o produto. Especificações informadas: 60Hz, antiaderente, medidas de 39 × 32 × 36,1 cm e peso de 7,6 kg. Conteúdo informado: aparelho, cesto bandeja com puxador, assadeira perfurada, assadeira coletora e manual de instruções. Garantia de fábrica informada: 12 meses.",
  ],
  highlights: [
    "Capacidade total de 12 L",
    "Potência de 2000 W",
    "Painel touch e superfície antiaderente, segundo a referência",
  ],
  specifications: [
    ["Marca", "Mondial"],
    ["Modelo", "Air Fryer Oven Digit"],
    ["Modelo alfanumérico", "AFON-12L-FG"],
    ["Cor", "Cinza"],
    ["Voltagem", "127V ou 220V"],
    ["Peso", "9 kg"],
  ],
  related: [
    {
      id: "mondial-afon-12l-bg",
      title: "Fritadeira Elétrica AFON-12L-BG Forno Oven 12 Litros Preto",
      image: "/assets/related-mondial-preview.jpg",
      price: 514.09,
      oldPrice: 899,
      discountLabel: "42% OFF",
    },
    {
      id: "britania-air-fryer-12l",
      title: "Fritadeira Air Fryer Oven 12 Litros 1800W Britânia",
      image: "/assets/air-fryer-britania.jpg",
      price: 478.57,
      oldPrice: 829.9,
      discountLabel: null,
    },
  ],
  seller: {
    name: "2EMESTORE",
    salesLabel: "+100 vendas",
    productCountLabel: "+100 Produtos",
    referenceDate: capturedAt,
    metrics: [
      { value: "+100", label: "Vendas", icon: "sales" },
      { value: "Bom atendimento", label: "Atendimento", icon: "service" },
      { value: "Entrega no prazo", label: "Entrega", icon: "delivery" },
    ],
  },
  paymentReference: {
    installmentMessage: "Pague em até 10x sem juros!",
    methods: [
      { id: "mercado-pago", label: "Mercado Pago", image: "/assets/payment-mercado-pago.png" },
      { id: "american-express", label: "American Express", image: "/assets/payment-american-express.png" },
      { id: "elo", label: "Elo", image: "/assets/payment-elo.png" },
      { id: "visa", label: "Visa", image: "/assets/payment-visa.png" },
      { id: "mastercard", label: "Mastercard", image: "/assets/payment-mastercard.png" },
      { id: "pix", label: "Pix", image: "/assets/payment-pix.png" },
      { id: "boleto", label: "Boleto", image: "/assets/payment-boleto.png" },
    ],
    referenceDate: capturedAt,
  },
  coupons: [],
  shippingProvider: null,
  paymentMethods: [],
  policies: null,
};

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mp4": "video/mp4",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  response.end(JSON.stringify(payload));
}

function readJson(request, maxLength = 4096) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > maxLength) {
        reject(new Error("body-too-large"));
        request.destroy();
      }
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch {
        reject(new Error("invalid-json"));
      }
    });
    request.on("error", reject);
  });
}

function validateCartRequest(input) {
  if (input.productId !== product.id) return { error: "Produto não encontrado no catálogo da loja." };
  const variant = product.variants.find((item) => item.type === "voltage" && item.value === input.voltage);
  if (!variant || variant.quantity < 1) return { error: "Não há estoque disponível para essa voltagem." };
  if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > variant.quantity) {
    return { error: `A quantidade precisa estar entre 1 e as ${variant.quantity} unidades disponíveis.` };
  }
  return {
    item: {
      productId: product.id,
      title: product.title,
      voltage: input.voltage,
      quantity: input.quantity,
      unitPrice: product.price,
      total: Number((product.price * input.quantity).toFixed(2)),
    },
  };
}

function normalizeQuestion(value) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function answerFromCatalog(question) {
  const text = normalizeQuestion(question);
  if (/golpe|fraude|confiavel|confianca|seguro|segura|legitimo/.test(text)) {
    return "Não consigo confirmar que esta oferta seja legítima nem garantir que não seja golpe: o checkout e os pagamentos ainda não estão conectados. O nome e os números do vendedor e das avaliações vieram das imagens de referência e não foram verificados agora. Não pague por fora; só conclua uma compra quando a loja tiver um checkout oficial e condições verificáveis.";
  }
  if (/voltagem|volts|127|220/.test(text)) {
    return "A loja informou 15 unidades disponíveis para 127V e 15 para 220V. O saldo é informado pela loja e ainda não sincroniza automaticamente com um sistema de estoque.";
  }
  if (/estoque|quantas unidades|disponibilidade/.test(text)) {
    return "A loja informou 15 unidades disponíveis para 127V e 15 para 220V. O estoque não é atualizado automaticamente quando há vendas fora deste site.";
  }
  if (/preco|valor|parcela|parcelamento|pix|cartao|pagamento|boleto/.test(text)) {
    return "O preço exibido para este produto é R$ 67,90, com opção de 10 parcelas de R$ 6,79 sem juros. Confirme o valor final no checkout antes de concluir a compra.";
  }
  if (/frete|entrega|prazo|chega|cep|retirada/.test(text)) {
    return "A condição exibida pela loja é frete grátis acima de R$ 19 e R$ 0 na primeira compra. A previsão da página é de 7 dias corridos, contando hoje como o primeiro dia. Cotação por CEP, transportadora e rastreio ainda não estão conectados.";
  }
  if (/garantia|devolucao|troca|reembolso|protecao/.test(text)) {
    return "As regras de garantia, devolução e proteção da compra não estão configuradas nesta loja. Confirme essas condições por escrito antes de comprar.";
  }
  if (/vendedor|loja|2emestore|avaliacao|reputacao|vendas/.test(text)) {
    return "As capturas mostram o vendedor 2EMESTORE e mais de 100 vendas, além de nota 4,9 com 593 avaliações do produto. Esses dados são reproduzidos das imagens e não foram verificados em uma plataforma ativa.";
  }
  if (/litro|capacidade|potencia|2000|watt|dimens|peso|cor|cinza|modelo|funcao/.test(text)) {
    return "Segundo as imagens de referência, o produto é o Mondial AFON-12L-FG, na cor cinza, com capacidade de 12 litros, potência indicada de 2000 W e peso informado de 9 kg. A ficha foi transcrita das imagens, não validada com o fabricante.";
  }
  return "Posso ajudar com capacidade, potência, voltagem, preço e dados mostrados nas capturas. Quando a informação não está confirmada, vou avisar em vez de inventar. Qual desses pontos você quer conferir?";
}

function limitChatRequests(address) {
  const now = Date.now();
  const current = chatRequestsByAddress.get(address);
  if (!current || now - current.startedAt >= 60_000) {
    chatRequestsByAddress.set(address, { startedAt: now, count: 1 });
    return true;
  }
  if (current.count >= 12) return false;
  current.count += 1;
  return true;
}

function getGatewayToken() {
  return process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN || "";
}

async function answerProductChat(messages) {
  const lastQuestion = messages.filter((message) => message.role === "user").at(-1)?.content || "";
  const token = getGatewayToken();
  if (!token) return { mode: "catalog", message: answerFromCatalog(lastQuestion) };

  const facts = {
    product: product.title,
    priceCaptured: moneyText(product.price),
    installmentsCaptured: `${product.installments.count}x ${moneyText(product.installments.amount)} sem juros`,
    ratingCaptured: `${product.rating} (${product.reviewCount} avaliações do produto)`,
    salesCaptured: `${product.salesLabel}; posição ${product.bestSellerRank}`,
    sellerCaptured: `${product.seller.name}, ${product.seller.salesLabel}`,
    specificationsCaptured: product.specifications,
    variants: product.variants.map((variant) => ({ voltage: variant.value, quantity: variant.quantity, stockSource: "informado pela loja", automaticInventorySync: false })),
    shippingPolicy: { ...product.shippingPolicy, source: "política informada pela loja" },
    shippingProviderConnected: false,
    paymentProviderConnected: false,
    sellerAndReviewFactsIndependentlyVerified: false,
    warrantyAndReturnPoliciesConfigured: false,
    captureDate: product.capturedAt,
  };
  const system = `Você é o assistente de produto da Casa Nativa. Responda em português brasileiro, com tom simpático, claro, breve e útil. Ajude a pessoa a avaliar o produto sem pressionar ou inventar motivos para comprar. Use somente os fatos abaixo. Se a pergunta não puder ser respondida com esses dados, diga isso e sugira o que precisa ser confirmado.\n\nFATOS: ${JSON.stringify(facts)}\n\nREGRAS: o preço de R$ 67,90 é o valor configurado pela loja. Avaliação, vendedor, vendas, ranking, opiniões e especificações foram copiados de capturas antigas e não são confirmações atuais. A loja informou 15 unidades para 127V e 15 para 220V; diga que o saldo não é sincronizado automaticamente nem reservado até concluir um pedido. A política de entrega informada pela loja é frete grátis acima de R$ 19, com R$ 0 na primeira compra, e prazo de sete dias corridos contando hoje como o primeiro dia; explique que é a política exibida pela loja, sem afirmar cotação, rastreio ou transportadora conectada. Não afirme que o vendedor é confiável, que a oferta não é golpe, que a compra é protegida, nem que há garantia, devolução ou meios de pagamento ativos. Se perguntarem se é golpe ou se é seguro comprar, seja direto: os dados do vendedor não foram verificados e não se deve pagar por fora. Não diga que uma compra foi aprovada e não solicite dados pessoais, de cartão ou Pix.`;

  try {
    const response = await fetch("https://ai-gateway.vercel.sh/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: process.env.AI_CHAT_MODEL || "openai/gpt-5.4-mini",
        messages: [{ role: "system", content: system }, ...messages],
        stream: false,
        temperature: 0.35,
        max_tokens: 320,
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`AI Gateway returned ${response.status}`);
    const data = await response.json();
    const answer = data.choices?.[0]?.message?.content;
    const message = typeof answer === "string" ? answer.trim() : "";
    if (!message) throw new Error("AI Gateway returned no answer");
    return { mode: "ai", message };
  } catch (error) {
    console.error("Product chat gateway error:", error.message);
    return {
      mode: "catalog",
      message: `A IA não respondeu agora. Com os dados do catálogo: ${answerFromCatalog(lastQuestion)}`,
    };
  }
}

function moneyText(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function reverseGeocode(latitude, longitude) {
  const roundedLatitude = Math.round(latitude * 10000) / 10000;
  const roundedLongitude = Math.round(longitude * 10000) / 10000;
  const cacheKey = `${roundedLatitude},${roundedLongitude}`;
  if (reverseGeocodeCache.has(cacheKey)) return Promise.resolve(reverseGeocodeCache.get(cacheKey));

  const operation = reverseGeocodeQueue.then(async () => {
    if (reverseGeocodeCache.has(cacheKey)) return reverseGeocodeCache.get(cacheKey);
    const delay = Math.max(0, 1000 - (Date.now() - lastReverseGeocodeAt));
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    lastReverseGeocodeAt = Date.now();

    const url = new URL(NOMINATIM_REVERSE_URL);
    url.search = new URLSearchParams({
      format: "jsonv2",
      lat: String(roundedLatitude),
      lon: String(roundedLongitude),
      addressdetails: "1",
      zoom: "18",
    }).toString();
    const upstream = await fetch(url, {
      headers: {
        "accept-language": "pt-BR,pt;q=0.9",
        "user-agent": "CasaNativaProductPreview/1.0 (user-initiated reverse geocoding)",
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!upstream.ok) throw new Error("O serviço de endereço não respondeu agora. Tente de novo ou informe o CEP.");
    const data = await upstream.json();
    if (!data.address || typeof data.address !== "object") {
      throw new Error("O OpenStreetMap não encontrou uma rua ou cidade próxima.");
    }
    const result = { address: data.address };
    reverseGeocodeCache.set(cacheKey, result);
    if (reverseGeocodeCache.size > 500) reverseGeocodeCache.delete(reverseGeocodeCache.keys().next().value);
    return result;
  });
  reverseGeocodeQueue = operation.catch(() => {});
  return operation;
}

async function lookupPostalCode(postalCode) {
  if (postalCodeLookupCache.has(postalCode)) return postalCodeLookupCache.get(postalCode);
  const fetchJson = async (url) => {
    try {
      const response = await fetch(url, {
        headers: { "accept-language": "pt-BR,pt;q=0.9", "user-agent": "CasaNativaStore/1.0 (CEP lookup)" },
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  };
  const viaCep = await fetchJson(`https://viacep.com.br/ws/${postalCode}/json/`);
  const brasilApi = !viaCep || viaCep.erro || !viaCep.logradouro || !viaCep.bairro || !viaCep.localidade || !viaCep.uf
    ? await fetchJson(`https://brasilapi.com.br/api/cep/v1/${postalCode}`)
    : null;
  const address = {
    road: (typeof viaCep?.logradouro === "string" && viaCep.logradouro) || (typeof brasilApi?.street === "string" && brasilApi.street) || "",
    house_number: "",
    neighbourhood: (typeof viaCep?.bairro === "string" && viaCep.bairro) || (typeof brasilApi?.neighborhood === "string" && brasilApi.neighborhood) || "",
    city: (typeof viaCep?.localidade === "string" && viaCep.localidade) || (typeof brasilApi?.city === "string" && brasilApi.city) || "",
    state: (typeof viaCep?.estado === "string" && viaCep.estado) || (typeof brasilApi?.state === "string" && brasilApi.state) || "",
    state_code: (typeof viaCep?.uf === "string" && viaCep.uf) || (typeof brasilApi?.state === "string" && brasilApi.state) || "",
    postcode: (typeof viaCep?.cep === "string" && viaCep.cep) || (typeof brasilApi?.cep === "string" && brasilApi.cep) || postalCode,
  };
  if (!address.city || !address.state_code) throw new Error("Não foi possível localizar esse CEP agora. Tente novamente ou confirme os números.");
  const result = { address, provider: brasilApi ? "ViaCEP + BrasilAPI" : "ViaCEP" };
  postalCodeLookupCache.set(postalCode, result);
  if (postalCodeLookupCache.size > 500) postalCodeLookupCache.delete(postalCodeLookupCache.keys().next().value);
  return result;
}

async function handleRequest(request, response) {
  const requestUrl = new URL(request.url, `http://${request.headers.host || "localhost"}`);

  if (request.method === "GET" && requestUrl.pathname === "/api/product") {
    return sendJson(response, 200, product);
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/chat/status") {
    return sendJson(response, 200, { mode: getGatewayToken() ? "ai" : "catalog" });
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/chat") {
    try {
      const input = await readJson(request, 16_384);
      if (!Array.isArray(input.messages) || input.messages.length === 0) {
        return sendJson(response, 400, { error: "Envie uma pergunta para continuar." });
      }
      const messages = input.messages.slice(-10).map((message) => ({
        role: message?.role,
        content: typeof message?.content === "string" ? message.content.trim() : "",
      }));
      if (messages.some((message) => !["user", "assistant"].includes(message.role) || !message.content || message.content.length > 800)) {
        return sendJson(response, 400, { error: "A conversa contém uma mensagem inválida ou muito longa." });
      }
      if (messages[messages.length - 1].role !== "user") return sendJson(response, 400, { error: "Envie uma pergunta para continuar." });
      if (!limitChatRequests(request.socket.remoteAddress || "unknown")) {
        return sendJson(response, 429, { error: "Você enviou várias perguntas. Aguarde um minuto e tente novamente." });
      }
      return sendJson(response, 200, await answerProductChat(messages));
    } catch (error) {
      const status = error.message === "body-too-large" ? 413 : 400;
      return sendJson(response, status, { error: status === 413 ? "Mensagem muito grande." : "Não foi possível processar a pergunta." });
    }
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/shipping") {
    const postalCode = (requestUrl.searchParams.get("postalCode") || "").replace(/\D/g, "");
    if (postalCode.length !== 8) return sendJson(response, 400, { error: "Informe um CEP com 8 dígitos." });
    return sendJson(response, 503, { error: "A loja informa frete grátis acima de R$ 19 e R$ 0 na primeira compra, com prazo estimado de 7 dias corridos contando hoje. Cotação por CEP, transportadora e rastreio ainda não estão conectados." });
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/location/cep") {
    try {
      const input = await readJson(request);
      const postalCode = typeof input.postalCode === "string" ? input.postalCode.replace(/\D/g, "") : "";
      if (postalCode.length !== 8) return sendJson(response, 400, { error: "Informe um CEP válido com 8 dígitos." });
      return sendJson(response, 200, await lookupPostalCode(postalCode));
    } catch (error) {
      const messageText = String(error?.message || "");
      const status = messageText === "body-too-large" ? 413 : messageText.startsWith("CEP não encontrado") ? 404 : 502;
      const message = messageText === "body-too-large" ? "Requisição muito grande." : messageText || "Não foi possível consultar esse CEP.";
      return sendJson(response, status, { error: message });
    }
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/location/reverse") {
    try {
      const input = await readJson(request);
      const latitude = Number(input.latitude);
      const longitude = Number(input.longitude);
      if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
        return sendJson(response, 400, { error: "A localização recebida não é válida." });
      }
      const result = await reverseGeocode(latitude, longitude);
      return sendJson(response, 200, {
        ...result,
        attribution: "© OpenStreetMap contributors",
        approximate: true,
      });
    } catch (error) {
      const status = error.message === "body-too-large" ? 413 : 502;
      const message = error.message === "body-too-large" ? "Requisição muito grande." : (error.message || "Não foi possível consultar o endereço agora.");
      return sendJson(response, status, { error: message });
    }
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/cart") {
    try {
      const input = await readJson(request);
      const result = validateCartRequest(input);
      if (result.error) return sendJson(response, 409, { error: result.error });
      return sendJson(response, 200, {
        ...result,
        notice: "Item adicionado ao carrinho neste navegador. Nenhum pedido foi criado.",
      });
    } catch (error) {
      const status = error.message === "body-too-large" ? 413 : 400;
      return sendJson(response, status, { error: error.message === "body-too-large" ? "Requisição muito grande." : "Requisição inválida." });
    }
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/checkout") {
    try {
      const input = await readJson(request);
      const result = validateCartRequest(input);
      if (result.error) return sendJson(response, 409, { error: result.error });
      return sendJson(response, 503, {
        error: "Pagamento indisponível: o site ainda não está conectado a um provedor de pagamento. Nenhum pedido ou cobrança foi criado.",
      });
    } catch {
      return sendJson(response, 400, { error: "Requisição inválida." });
    }
  }

  if (request.method !== "GET") return sendJson(response, 405, { error: "Método não permitido." });

  const relativePath = requestUrl.pathname === "/" ? "index.html" : decodeURIComponent(requestUrl.pathname).replace(/^\/+/, "");
  const absolutePath = path.resolve(ROOT, relativePath);
  if (absolutePath !== ROOT && !absolutePath.startsWith(`${ROOT}${path.sep}`)) {
    response.writeHead(403);
    return response.end("Forbidden");
  }

  fs.readFile(absolutePath, (error, data) => {
    if (error) {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      return response.end("Not found");
    }
    response.writeHead(200, {
      "content-type": mimeTypes[path.extname(absolutePath)] || "application/octet-stream",
      "x-content-type-options": "nosniff",
      "permissions-policy": "geolocation=(self)",
      "cache-control": "no-cache",
    });
    response.end(data);
  });
}

if (require.main === module) {
  const server = http.createServer(handleRequest);
  server.listen(PORT, "127.0.0.1", () => {
    console.log(`Casa Nativa disponível em http://127.0.0.1:${PORT}`);
    console.log("Preços e dados de mercado vêm das imagens de referência; o estoque foi informado pela loja.");
  });
}

module.exports = handleRequest;
