const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

let product = null;
let selectedVoltage = "127V";
let quantity = 1;
let activeSlide = 0;
let cartItem = null;
let toastTimer;
let chatHistory = [];
let chatBusy = false;
let chatWelcomeShown = false;
let locationRequestInFlight = false;
let locationChoiceVersion = 0;

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const announce = (message) => { $("#liveRegion").textContent = message; };

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 3200);
}

function openDialog(id) {
  const dialog = document.getElementById(id);
  if (dialog && !dialog.open) dialog.showModal();
}

function showStatus(title, message) {
  $("#statusTitle").textContent = title;
  $("#statusMessage").textContent = message;
  openDialog("statusDialog");
}

function appendChatMessage(role, content) {
  const message = document.createElement("article");
  message.className = "chat-message";
  message.dataset.role = role;
  const author = document.createElement("strong");
  author.textContent = role === "user" ? "Você" : "Casa Nativa";
  const text = document.createElement("p");
  text.textContent = content;
  message.append(author, text);
  $("#chatMessages").append(message);
  $("#chatMessages").scrollTop = $("#chatMessages").scrollHeight;
}

function setChatMode(mode) {
  $("#chatModeLabel").textContent = mode === "ai"
    ? "IA conectada · perguntas enviadas ao serviço configurado"
    : "Respostas automáticas do catálogo · IA não configurada";
}

function openProductChat() {
  openDialog("chatDialog");
  if (!chatWelcomeShown) {
    appendChatMessage("assistant", "Olá! Posso ajudar com dúvidas sobre o produto e as condições mostradas nesta página. O que você gostaria de saber?");
    chatWelcomeShown = true;
  }
  api("/api/chat/status").then((status) => setChatMode(status.mode)).catch(() => setChatMode("catalog"));
  setTimeout(() => $("#chatInput").focus({ preventScroll: true }), 0);
}

async function sendChatQuestion(rawQuestion) {
  const question = String(rawQuestion || "").trim().slice(0, 800);
  if (!question || chatBusy) return;
  chatHistory.push({ role: "user", content: question });
  chatHistory = chatHistory.slice(-10);
  appendChatMessage("user", question);
  chatBusy = true;
  const input = $("#chatInput");
  const sendButton = $("#chatSendButton");
  input.disabled = true;
  sendButton.disabled = true;
  sendButton.textContent = "…";
  try {
    const result = await api("/api/chat", {
      method: "POST",
      body: JSON.stringify({ messages: chatHistory }),
    });
    setChatMode(result.mode);
    chatHistory.push({ role: "assistant", content: result.message });
    chatHistory = chatHistory.slice(-10);
    appendChatMessage("assistant", result.message);
  } catch (error) {
    appendChatMessage("assistant", error.message || "Não consegui responder agora. Tente novamente em instantes.");
  } finally {
    chatBusy = false;
    input.disabled = false;
    sendButton.disabled = false;
    sendButton.textContent = "Enviar";
    input.focus({ preventScroll: true });
  }
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { ...(options.body ? { "content-type": "application/json" } : {}), ...options.headers },
  });
  let data;
  try { data = await response.json(); } catch { data = {}; }
  if (!response.ok) throw Object.assign(new Error(data.error || "A solicitação não foi concluída."), { status: response.status });
  return data;
}

function sourcePrice(value) { return money.format(value); }

function miniCard(item) {
  const title = escapeHtml(item.title);
  const image = escapeHtml(item.image);
  const oldPrice = sourcePrice(item.oldPrice);
  const discount = item.discountLabel ? `<span>${escapeHtml(item.discountLabel)}</span>` : "";
  return `<article class="mini-product-card">
    <button class="mini-product-image" type="button" data-preview-product="${escapeHtml(item.id)}" aria-label="Ver informações de ${title}"><img src="${image}" alt="" loading="lazy"></button>
    <div class="mini-product-copy"><span class="mini-category">${item.id.includes("britania") ? "Britânia" : "Mondial"}</span><h3>${title}</h3>
      <p class="mini-reference-prices">${discount}<del>${oldPrice}</del></p>
      <p class="mini-price">${sourcePrice(item.price)}</p>
    </div>
  </article>`;
}

function renderProduct(data) {
  product = data;
  $("#productTitle").textContent = data.title;
  $("#salesRank").textContent = data.bestSellerRank;
  $("#salesLabel").textContent = data.salesLabel;
  $("#ratingValue").textContent = data.rating.toFixed(1);
  $("#reviewCount").textContent = `(${data.reviewCount})`;
  $("#priceValue").textContent = sourcePrice(data.price);
  $("#captureNotice").textContent = data.captureNotice;
  $("#installmentCopy").textContent = `${data.installments.count}x ${sourcePrice(data.installments.amount)} ${data.installments.interestFree ? "sem juros" : ""}`.trim();
  $("#reviewScore").textContent = data.rating.toFixed(1);
  $("#reviewTotal").textContent = `${data.reviewCount} avaliações na captura`;
  updateShippingEstimate();
  if (data.seller) {
    $("#sellerName").textContent = data.seller.name;
    $("#sellerSales").textContent = data.seller.salesLabel;
    $("#sellerProductCount").textContent = data.seller.productCountLabel;
    $("#sellerMetrics").innerHTML = data.seller.metrics.map((metric) => {
      const icon = metric.icon === "service"
        ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h13v10H9l-5 4z"/><path d="m13 12 2 2 4-5"/></svg>'
        : metric.icon === "delivery"
          ? '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="13" r="8"/><path d="M12 8v5l3 2M9 2h6M18 5l2-2"/></svg>'
          : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19V5m0 14h16M8 15l4-4 3 2 5-6"/></svg>';
      const text = metric.icon === "sales"
        ? `<strong>${escapeHtml(metric.value)}</strong><span>${escapeHtml(metric.label)}</span>`
        : `<span>${escapeHtml(metric.value)}</span>`;
      return `<div class="seller-metric"><div class="seller-metric-value">${icon}${text}</div></div>`;
    }).join("");
  }
  if (data.paymentReference) {
    $("#paymentInstallmentCopy").textContent = data.paymentReference.installmentMessage;
    $("#paymentMethods").innerHTML = data.paymentReference.methods.map((method) => {
      return `<span class="payment-method payment-${escapeHtml(method.id)}" role="img" aria-label="Logotipo ${escapeHtml(method.label)}"><span class="payment-logo-slot" data-payment-logo="${escapeHtml(method.id)}" aria-hidden="true"><img src="${escapeHtml(method.image)}" alt="" loading="lazy"></span></span>`;
    }).join("");
  }

  $("#galleryTrack").innerHTML = data.gallery.map((photo, index) => {
    if (photo.type === "video") {
      return `<figure class="gallery-slide" data-slide="${index}"><div class="gallery-video-shell"><video class="gallery-video" controls playsinline preload="metadata" poster="${escapeHtml(photo.poster)}" aria-label="${escapeHtml(photo.alt)}"><source src="${escapeHtml(photo.src)}" type="video/mp4">Seu navegador não consegue reproduzir este vídeo.</video><button class="gallery-video-play" type="button" aria-label="Reproduzir vídeo do produto"><svg viewBox="0 0 48 48" aria-hidden="true"><path d="M17 11.5c0-1.2 1.3-1.9 2.3-1.2l18 12.5a1.5 1.5 0 0 1 0 2.4l-18 12.5a1.5 1.5 0 0 1-2.3-1.2z"/></svg><span>Assistir vídeo</span></button></div></figure>`;
    }
    return `<figure class="gallery-slide" data-slide="${index}"><button type="button" class="gallery-image-button" data-zoom-index="${index}" aria-label="Ampliar foto ${index + 1} de ${data.gallery.length}"><img src="${escapeHtml(photo.src)}" alt="${escapeHtml(photo.alt)}" ${index === 0 ? "fetchpriority=high" : "loading=lazy"}></button></figure>`;
  }).join("");
  $$(".gallery-video", $("#galleryTrack")).forEach((video) => {
    const shell = video.closest(".gallery-video-shell");
    video.addEventListener("play", () => shell.classList.add("is-playing"));
    video.addEventListener("ended", () => shell.classList.remove("is-playing"));
  });
  $("#galleryDots").innerHTML = data.gallery.map((photo, index) => `<button class="gallery-dot ${index === 0 ? "is-active" : ""}" type="button" data-slide-to="${index}" aria-label="${photo.type === "video" ? "Ir para o vídeo" : `Ver foto ${index + 1}`}" aria-current="${index === 0 ? "true" : "false"}"></button>`).join("");
  $("#galleryThumbnails").innerHTML = data.gallery.map((photo, index) => {
    const thumbnail = photo.type === "video" ? photo.poster : photo.src;
    const playMarker = photo.type === "video" ? '<span class="gallery-thumbnail-play" aria-hidden="true">▶</span>' : "";
    return `<button class="gallery-thumbnail ${index === 0 ? "is-active" : ""}" type="button" data-slide-to="${index}" aria-label="Selecionar ${photo.type === "video" ? "vídeo" : `foto ${index + 1}`}" aria-current="${index === 0 ? "true" : "false"}"><img src="${escapeHtml(thumbnail)}" alt="" loading="lazy">${playMarker}</button>`;
  }).join("");
  $("#galleryCount").textContent = `1 / ${data.gallery.length}`;

  $("#photoStrip").innerHTML = data.gallery.map((photo, index) => {
    if (photo.type === "video") {
      return `<button class="photo-tile" type="button" data-slide-to="${index}" aria-label="Ir para o vídeo do produto"><img src="${escapeHtml(photo.poster)}" alt="" loading="lazy"><span class="photo-tile-play" aria-hidden="true">▶</span><span>Vídeo</span></button>`;
    }
    return `<button class="photo-tile" type="button" data-zoom-index="${index}" aria-label="Ampliar foto ${index + 1}"><img src="${escapeHtml(photo.src)}" alt="${escapeHtml(photo.alt)}" loading="lazy"><span>Foto ${index + 1}</span></button>`;
  }).join("");
  $("#zoomImage").src = data.gallery[0].src;
  $("#zoomImage").alt = data.gallery[0].alt;

  $("#specRows").innerHTML = data.specifications.map(([key, value]) => `<tr><th scope="row">${escapeHtml(key)}</th><td>${escapeHtml(value)}</td></tr>`).join("");
  $("#highlightList").innerHTML = data.highlights.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  $("#recommendationTrack").innerHTML = data.related.map(miniCard).join("");
  updateVariant("127V", false);
  updateCartUI();
}

function updateShippingEstimate() {
  const arrivalDate = new Date();
  arrivalDate.setHours(12, 0, 0, 0);
  arrivalDate.setDate(arrivalDate.getDate() + 6);
  const formattedDate = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(arrivalDate);
  $("#deliveryEstimate").textContent = formattedDate;
}

function currentVariant() {
  return product?.variants.find((variant) => variant.value === selectedVoltage);
}

function updateVariant(voltage, announceChange = true) {
  if (!product) return;
  selectedVoltage = voltage;
  const variant = currentVariant();
  $$("[data-voltage]").forEach((button) => {
    const selected = button.dataset.voltage === voltage;
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
  const available = Number.isInteger(variant?.quantity) && variant.quantity > 0;
  if (available) {
    $("#variantNote").textContent = `${voltage} selecionado · ${variant.quantity} unidades disponíveis`;
    $("#stockTitle").textContent = "Estoque disponível";
    $("#stockCopy").textContent = `${variant.quantity} unidades para ${voltage}.`;
    $("#quantityDown").disabled = quantity <= 1;
    $("#quantityUp").disabled = quantity >= variant.quantity;
    $("#addCartButton").disabled = false;
    $("#buyNowButton").disabled = false;
    if (quantity > variant.quantity) quantity = variant.quantity;
  } else {
    $("#variantNote").textContent = `Sem estoque para ${voltage}.`;
    $("#stockTitle").textContent = "Sem estoque disponível";
      $("#stockCopy").textContent = `Não há unidades disponíveis para ${voltage}.`;
    $("#quantityDown").disabled = true;
    $("#quantityUp").disabled = true;
    $("#addCartButton").disabled = true;
    $("#buyNowButton").disabled = true;
  }
  $("#quantityValue").textContent = String(quantity);
  $("#addCartButton").setAttribute("aria-disabled", String(!available));
  $("#buyNowButton").setAttribute("aria-disabled", String(!available));
  if (announceChange) announce(available ? `Voltagem ${voltage} selecionada. Estoque disponível: ${variant.quantity} unidades.` : `Sem estoque para ${voltage}.`);
}

function updateGallery(index) {
  if (!product) return;
  const nextSlide = (index + product.gallery.length) % product.gallery.length;
  const previousVideo = $(`.gallery-slide[data-slide="${activeSlide}"] video`);
  if (activeSlide !== nextSlide) previousVideo?.pause();
  activeSlide = nextSlide;
  const activeMedia = product.gallery[activeSlide];
  const viewport = $("#galleryViewport");
  const slide = $(`.gallery-slide[data-slide="${activeSlide}"]`, viewport);
  if (slide) viewport.scrollTo({ left: activeSlide * viewport.clientWidth, behavior: "smooth" });
  $("#galleryCount").textContent = `${activeSlide + 1} / ${product.gallery.length}`;
  $$("[data-slide-to]").forEach((button) => {
    const selected = Number(button.dataset.slideTo) === activeSlide;
    button.classList.toggle("is-active", selected);
    button.setAttribute("aria-current", String(selected));
  });
  if (activeMedia.type === "video" && $("#zoomDialog").open) $("#zoomDialog").close();
  $("#zoomImage").src = activeMedia.type === "video" ? activeMedia.poster : activeMedia.src;
  $("#zoomImage").alt = activeMedia.alt;
  $("#zoomCount").textContent = `${activeSlide + 1} / ${product.gallery.length}`;
}

function updateGalleryFromScroll() {
  const viewport = $("#galleryViewport");
  if (!viewport || !product) return;
  const slideWidth = viewport.clientWidth || 1;
  const index = Math.round(viewport.scrollLeft / slideWidth);
  if (index !== activeSlide) {
    const previousVideo = $(`.gallery-slide[data-slide="${activeSlide}"] video`);
    previousVideo?.pause();
    activeSlide = Math.min(product.gallery.length - 1, index);
    const activeMedia = product.gallery[activeSlide];
    $("#galleryCount").textContent = `${activeSlide + 1} / ${product.gallery.length}`;
    $$("[data-slide-to]").forEach((button) => {
      const selected = Number(button.dataset.slideTo) === activeSlide;
      button.classList.toggle("is-active", selected);
      button.setAttribute("aria-current", String(selected));
    });
    if (activeMedia.type === "video" && $("#zoomDialog").open) $("#zoomDialog").close();
    $("#zoomImage").src = activeMedia.type === "video" ? activeMedia.poster : activeMedia.src;
    $("#zoomImage").alt = activeMedia.alt;
    $("#zoomCount").textContent = `${activeSlide + 1} / ${product.gallery.length}`;
  }
}

function changeQuantity(delta) {
  const variant = currentVariant();
  if (!variant || !Number.isInteger(variant.quantity) || variant.quantity < 1) return;
  quantity = Math.max(1, Math.min(variant.quantity, quantity + delta));
  $("#quantityValue").textContent = String(quantity);
  $("#quantityDown").disabled = quantity <= 1;
  $("#quantityUp").disabled = quantity >= variant.quantity;
  announce(`Quantidade ${quantity}.`);
}

function updateCartUI() {
  const count = cartItem?.quantity || 0;
  $("#cartCount").textContent = String(count);
  $(".cart-trigger").setAttribute("aria-label", `Abrir carrinho, ${count} ${count === 1 ? "item" : "itens"}`);
  $("#cartCheckoutButton").disabled = !cartItem;
  $("#cartTotal").textContent = money.format(cartItem?.total || 0);
  if (!cartItem) {
    $("#cartContents").innerHTML = `<div class="empty-cart"><span aria-hidden="true">▱</span><strong>Seu carrinho está vazio</strong><p>Adicione o produto para conferir os itens.</p></div>`;
    return;
  }
  $("#cartContents").innerHTML = `<article class="cart-line"><img src="${escapeHtml(product.gallery[0].src)}" alt=""><div><h3>${escapeHtml(cartItem.title)}</h3><p>Voltagem ${escapeHtml(cartItem.voltage)} · quantidade ${cartItem.quantity}</p><strong>${money.format(cartItem.unitPrice)} cada</strong><div class="cart-line-actions"><button type="button" data-cart-quantity="-1" aria-label="Remover uma unidade">−</button><span>${cartItem.quantity}</span><button type="button" data-cart-quantity="1" aria-label="Adicionar uma unidade">+</button><button class="remove-line" type="button" data-cart-remove>Remover</button></div></div></article><p class="cart-reference-note">${escapeHtml(product.captureNotice)}</p>`;
}

async function addToCart() {
  if (!product) return;
  const variant = currentVariant();
  if (!variant || !Number.isInteger(variant.quantity) || variant.quantity < 1) {
    return showStatus("Sem estoque disponível", "A voltagem escolhida está sem estoque.");
  }
  const nextQuantity = (cartItem?.voltage === selectedVoltage ? cartItem.quantity : 0) + quantity;
  try {
    const result = await api("/api/cart", { method: "POST", body: JSON.stringify({ productId: product.id, voltage: selectedVoltage, quantity: nextQuantity }) });
    cartItem = result.item;
    updateCartUI();
    announce(result.notice);
    openDialog("cartDialog");
  } catch (error) {
    showStatus("Não foi possível adicionar", error.message);
  }
}

function beginCheckout(input = { productId: product?.id, voltage: selectedVoltage, quantity }) {
  if (!product) return;
  let postalCode = "";
  try { postalCode = (localStorage.getItem("casa-nativa-cep") || "").replace(/\D/g, "").slice(0, 8); } catch { /* storage can be unavailable in private browsing */ }
  if (postalCode.length !== 8) {
    openDialog("locationDialog");
    $("#locationResult").textContent = "Defina sua localização com o GPS ou informe seu CEP para continuar.";
    return;
  }
  const checkoutUrl = new URL("/checkout/air-fryer-forno-mondial-afon-12l-fg", "https://checkout001.vercel.app");
  checkoutUrl.searchParams.set("voltage", input.voltage === "220V" ? "220V" : "127V");
  checkoutUrl.searchParams.set("cep", postalCode);
  const requestedQuantity = Number(input.quantity);
  checkoutUrl.searchParams.set("quantity", String(Number.isInteger(requestedQuantity) ? Math.max(1, Math.min(15, requestedQuantity)) : 1));
  const passthroughKeys = new Set(["src", "sck", "xcod", "subid", ...Array.from({ length: 10 }, (_, index) => "subid" + (index + 1))]);
  for (const [key, value] of new URLSearchParams(window.location.search)) {
    const normalizedKey = key.toLowerCase();
    if (normalizedKey.startsWith("utm_") || passthroughKeys.has(normalizedKey)) {
      checkoutUrl.searchParams.set(normalizedKey, value.slice(0, 200));
    }
  }
  window.location.assign(checkoutUrl.toString());
}

function scrollCarousel(id, direction) {
  const track = document.getElementById(id);
  if (!track) return;
  const card = track.querySelector(".mini-product-card");
  const distance = (card?.getBoundingClientRect().width || track.clientWidth * 0.8) + 16;
  track.scrollBy({ left: distance * Number(direction), behavior: "smooth" });
}

function setCep(rawValue, persist = true) {
  const digits = rawValue.replace(/\D/g, "").slice(0, 8);
  if (digits.length !== 8) return null;
  const formatted = `${digits.slice(0, 5)}-${digits.slice(5)}`;
  if (persist) {
    try { localStorage.setItem("casa-nativa-cep", digits); } catch { /* storage can be unavailable in private browsing */ }
  }
  try {
    localStorage.removeItem("casa-nativa-location");
    localStorage.removeItem("casa-nativa-header-location");
  } catch { /* storage can be unavailable in private browsing */ }
  $("#headerPostalCode").textContent = formatted;
  $("#deliveryPostalCode").textContent = `CEP ${formatted} · prazo a confirmar`;
  $("#postalCodeInput").value = formatted;
  $("#locationPostalInput").value = formatted;
  return formatted;
}

function loadSavedCep() {
  let saved = "";
  let savedLocation = "";
  let savedHeaderLocation = "";
  try {
    saved = localStorage.getItem("casa-nativa-cep") || "";
    savedLocation = localStorage.getItem("casa-nativa-location") || "";
    savedHeaderLocation = localStorage.getItem("casa-nativa-header-location") || "";
  } catch { /* storage can be unavailable in private browsing */ }
  if (savedLocation) {
    $("#headerPostalCode").textContent = savedHeaderLocation || saved || "Localização detectada";
    $("#deliveryPostalCode").textContent = savedLocation;
    $("#postalCodeInput").value = saved;
    $("#locationPostalInput").value = saved;
  } else if (saved) setCep(saved, false);
}

function clearSavedCep() {
  try {
    localStorage.removeItem("casa-nativa-cep");
    localStorage.removeItem("casa-nativa-location");
    localStorage.removeItem("casa-nativa-header-location");
  } catch { /* storage can be unavailable in private browsing */ }
  $("#headerPostalCode").textContent = "Informe seu CEP";
  $("#deliveryPostalCode").textContent = "Definir local de entrega";
  $("#postalCodeInput").value = "";
  $("#locationPostalInput").value = "";
  $("#locationResult").textContent = "CEP removido deste navegador.";
  $("#shippingResult").textContent = "";
  announce("CEP removido.");
}

function setDetectedLocation(address) {
  const street = [address.road || address.logradouro, address.house_number].filter(Boolean).join(", ");
  const neighborhood = address.neighbourhood || address.suburb || address.quarter || address.bairro;
  const city = address.city || address.town || address.village || address.municipality || address.county || address.localidade;
  const state = address.state_code || address.state || address.uf;
  const postcode = (address.postcode || address.cep || "").replace(/\D/g, "").slice(0, 8);
  const formattedPostcode = postcode.length === 8 ? `${postcode.slice(0, 5)}-${postcode.slice(5)}` : "";
  const locationText = [street || neighborhood, city, state].filter(Boolean).join(", ");
  if (!locationText && !formattedPostcode) throw new Error("O OpenStreetMap não encontrou uma rua ou cidade próxima.");

  if (formattedPostcode) {
    setCep(formattedPostcode, false);
    try { localStorage.setItem("casa-nativa-cep", postcode); } catch { /* storage can be unavailable in private browsing */ }
  } else {
    try { localStorage.removeItem("casa-nativa-cep"); } catch { /* storage can be unavailable in private browsing */ }
    $("#headerPostalCode").textContent = city || neighborhood || "Localização detectada";
    $("#postalCodeInput").value = "";
    $("#locationPostalInput").value = "";
  }
  const shortLocation = [city, state].filter(Boolean).join(" · ") || locationText;
  const headerLocation = formattedPostcode || city || neighborhood || "Localização detectada";
  const visibleLocation = formattedPostcode ? `${shortLocation || locationText} · CEP ${formattedPostcode}` : locationText;
  $("#headerPostalCode").textContent = headerLocation;
  $("#deliveryPostalCode").textContent = visibleLocation;
  try {
    localStorage.setItem("casa-nativa-location", visibleLocation);
    localStorage.setItem("casa-nativa-header-location", headerLocation);
  } catch { /* storage can be unavailable in private browsing */ }
  return visibleLocation;
}

function describeDetectedAddress(address) {
  const street = address.road || address.logradouro || "";
  const neighborhood = address.neighbourhood || address.suburb || address.quarter || address.bairro || "";
  const city = address.city || address.town || address.village || address.municipality || address.county || address.localidade || "";
  const state = address.state_code || address.uf || address.state || "";
  const postcode = (address.postcode || address.cep || "").replace(/\D/g, "").slice(0, 8);
  const formattedPostcode = postcode.length === 8 ? `${postcode.slice(0, 5)}-${postcode.slice(5)}` : "";
  return [street || neighborhood, city, state, formattedPostcode ? `CEP ${formattedPostcode}` : ""].filter(Boolean).join(" · ");
}

async function resolveCepLocation(rawValue) {
  const postalCode = rawValue.replace(/\D/g, "");
  if (postalCode.length !== 8) throw new Error("Digite um CEP válido com 8 dígitos.");
  const result = await api("/api/location/cep", {
    method: "POST",
    body: JSON.stringify({ postalCode }),
  });
  const address = result.address || {};
  return { label: setDetectedLocation(address), details: describeDetectedAddress(address) };
}

async function useCurrentLocation({ showFallback = false } = {}) {
  const button = $("#useLocationButton");
  const feedback = $("#locationResult");
  if (locationRequestInFlight) return;
  const requestVersion = locationChoiceVersion;
  const showError = (message) => {
    if (requestVersion !== locationChoiceVersion) return;
    feedback.textContent = message;
    if (showFallback) openDialog("locationDialog");
  };
  locationRequestInFlight = true;
  button.disabled = true;
  try {
    if (!window.isSecureContext) {
      showError("O GPS só funciona em uma página segura (HTTPS). Abra o site pelo endereço https:// ou informe seu CEP.");
      return;
    }
    if (!navigator.geolocation) {
      showError("Este navegador não oferece localização por GPS. Informe seu CEP para localizar a entrega.");
      return;
    }
    if (requestVersion === locationChoiceVersion) feedback.textContent = "Solicitando permissão de localização…";
    // Chame a API imediatamente, sem aguardar navigator.permissions.query:
    // alguns navegadores móveis descartam a ativação do toque depois de um await.
    const position = await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      maximumAge: 60000,
      timeout: 15000,
    }));
    if (requestVersion !== locationChoiceVersion) return;
    feedback.textContent = "Convertendo localização em endereço aproximado…";
    const result = await api("/api/location/reverse", {
      method: "POST",
      body: JSON.stringify({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
    });
    if (requestVersion !== locationChoiceVersion) return;
    let address = result.address || {};
    const detectedPostcode = (address.postcode || address.cep || "").replace(/\D/g, "").slice(0, 8);
    let postalLookupSucceeded = false;
    if (detectedPostcode.length === 8) {
      feedback.textContent = "Localização encontrada. Consultando o CEP para preencher rua e cidade…";
      try {
        const cepResult = await api("/api/location/cep", {
          method: "POST",
          body: JSON.stringify({ postalCode: detectedPostcode }),
        });
        if (requestVersion !== locationChoiceVersion) return;
        address = { ...address, ...(cepResult.address || {}), house_number: address.house_number || "" };
        postalLookupSucceeded = true;
      } catch {
        // Preserve the CEP returned by OpenStreetMap if ViaCEP is temporarily unavailable.
        // This lets the checkout retry the lookup instead of losing the detected location.
        address = { ...address, postcode: detectedPostcode };
      }
    }
    const label = setDetectedLocation(address);
    const addressDetails = describeDetectedAddress(address);
    let savedCep = "";
    try { savedCep = localStorage.getItem("casa-nativa-cep") || ""; } catch { /* storage can be unavailable in private browsing */ }
    if (savedCep.replace(/\D/g, "").length !== 8) {
      feedback.textContent = detectedPostcode.length === 8
        ? `Localização encontrada: ${addressDetails || label}. O ViaCEP não confirmou esse CEP; informe seu CEP manualmente para continuar.`
        : `Localização encontrada: ${addressDetails || label}. Informe seu CEP para continuar ao checkout.`;
      if (showFallback) openDialog("locationDialog");
    } else if (postalLookupSucceeded) feedback.textContent = `Endereço localizado: ${addressDetails || label}.`;
    else feedback.textContent = `Localização aproximada: ${addressDetails || label}. O CEP não foi confirmado pelo ViaCEP.`;
    announce("Localização atualizada.");
  } catch (error) {
    if (error?.code === 1) showError("Permissão de localização negada. Permita Localização nas configurações do navegador ou informe seu CEP.");
    else if (error?.code === 2 || error?.code === 3) showError("Não foi possível obter o GPS agora. Informe seu CEP para localizar a entrega.");
    else showError(error.message || "Não foi possível localizar você. Informe seu CEP para continuar.");
  } finally {
    button.disabled = false;
    locationRequestInFlight = false;
  }
}

function updateZoom(index) {
  if (product?.gallery[index]?.type === "video") {
    updateGallery(index);
    $("#produto").scrollIntoView({ behavior: "smooth" });
    return;
  }
  updateGallery(index);
  openDialog("zoomDialog");
}

function openProductPreview(id) {
  if (id === product?.id) {
    document.getElementById("produto").scrollIntoView({ behavior: "smooth" });
    return;
  }
  const related = product?.related.find((item) => item.id === id);
  showStatus("Produto relacionado", related ? `${related.title}. Valor da imagem de referência: ${money.format(related.price)}. A página deste item não está no catálogo conectado.` : "Este item não está no catálogo conectado.");
}

function searchProducts(query) {
  const normalized = query.trim().toLocaleLowerCase("pt-BR");
  const box = $("#searchResults");
  if (!normalized || !product) { box.hidden = true; box.innerHTML = ""; return; }
  const items = [product, ...product.related].filter((item) => `${item.title} ${item.brand || ""}`.toLocaleLowerCase("pt-BR").includes(normalized));
  box.innerHTML = items.length ? items.map((item) => `<button class="search-result" type="button" data-preview-product="${escapeHtml(item.id)}"><span class="search-result-icon" aria-hidden="true">⌕</span><span>${escapeHtml(item.title)}</span><span aria-hidden="true">→</span></button>`).join("") : `<p class="no-search-results">Nenhum produto encontrado nas referências carregadas.</p>`;
  box.hidden = false;
}

async function consultShipping(form, input, feedback) {
  const digits = input.value.replace(/\D/g, "");
  if (digits.length !== 8) {
    feedback.textContent = "Digite um CEP válido com 8 dígitos.";
    input.setAttribute("aria-invalid", "true");
    input.focus();
    return;
  }
  input.removeAttribute("aria-invalid");
  const requestVersion = ++locationChoiceVersion;
  const button = form.querySelector('button[type="submit"]');
  if (button) button.disabled = true;
  feedback.textContent = "Consultando o CEP…";
  try {
    const { label, details } = await resolveCepLocation(digits);
    if (requestVersion !== locationChoiceVersion) return;
    feedback.textContent = `Endereço encontrado: ${details || label}. A cotação da transportadora ainda não está conectada.`;
  } catch (error) {
    if (requestVersion === locationChoiceVersion) feedback.textContent = error.message || "Não foi possível localizar esse CEP.";
  } finally {
    if (button) button.disabled = false;
  }
  if (requestVersion === locationChoiceVersion) announce(feedback.textContent);
}

async function saveLocationFromCep(input, feedback) {
  const digits = input.value.replace(/\D/g, "");
  if (digits.length !== 8) {
    feedback.textContent = "Digite um CEP válido com 8 dígitos.";
    input.setAttribute("aria-invalid", "true");
    input.focus();
    return;
  }
  input.removeAttribute("aria-invalid");
  const requestVersion = ++locationChoiceVersion;
  const form = input.form;
  const button = form?.querySelector('button[type="submit"]');
  if (button) button.disabled = true;
  feedback.textContent = "Buscando endereço pelo CEP…";
  try {
    const { label, details } = await resolveCepLocation(digits);
    if (requestVersion !== locationChoiceVersion) return;
    feedback.textContent = `Endereço encontrado pelo CEP: ${details || label}.`;
    announce("Localização definida pelo CEP.");
  } catch (error) {
    if (requestVersion === locationChoiceVersion) {
      feedback.textContent = error.message || "Não foi possível localizar esse CEP. Confira os números e tente novamente.";
      input.setAttribute("aria-invalid", "true");
    }
  } finally {
    if (button) button.disabled = false;
  }
}

function bindEvents() {
  document.addEventListener("click", (event) => {
    const openButton = event.target.closest("[data-open-dialog]");
    if (openButton) openDialog(openButton.dataset.openDialog);

    const suggestedQuestion = event.target.closest("[data-chat-prompt]");
    if (suggestedQuestion) {
      const question = suggestedQuestion.dataset.chatPrompt;
      $("#chatInput").value = "";
      sendChatQuestion(question);
    }

    const closeButton = event.target.closest(".dialog-close, .dialog-close-action");
    if (closeButton) closeButton.closest("dialog")?.close();

    if (event.target.closest("#footerAskButton")) openProductChat();
    if (event.target.closest("#footerFavoriteButton")) $("#favoriteButton").click();
    if (event.target.closest("#footerShareButton")) $("#shareButton").click();

    const scrollButton = event.target.closest("[data-scroll]");
    if (scrollButton) scrollCarousel(scrollButton.dataset.scroll, scrollButton.dataset.direction);

    const slideButton = event.target.closest("[data-slide-to]");
    if (slideButton) {
      updateGallery(Number(slideButton.dataset.slideTo));
      if (slideButton.closest("#photoStrip")) $("#produto").scrollIntoView({ behavior: "smooth" });
    }

    const videoPlayButton = event.target.closest(".gallery-video-play");
    if (videoPlayButton) {
      const video = videoPlayButton.closest(".gallery-video-shell")?.querySelector("video");
      if (video) video.play().catch(() => showToast("Não foi possível reproduzir o vídeo. Tente novamente."));
    }

    const zoomButton = event.target.closest("[data-zoom-index]");
    if (zoomButton) updateZoom(Number(zoomButton.dataset.zoomIndex));

    const previewButton = event.target.closest("[data-preview-product]");
    if (previewButton) {
      $("#searchResults").hidden = true;
      openProductPreview(previewButton.dataset.previewProduct);
    }

    const voltageButton = event.target.closest("[data-voltage]");
    if (voltageButton) updateVariant(voltageButton.dataset.voltage);

    const colorButton = event.target.closest("[data-color]");
    if (colorButton) {
      $$("[data-color]").forEach((button) => {
        const selected = button === colorButton;
        button.classList.toggle("is-selected", selected);
        button.setAttribute("aria-pressed", String(selected));
      });
      announce(`Cor ${colorButton.dataset.color} selecionada.`);
    }

    const cartQuantityButton = event.target.closest("[data-cart-quantity]");
    if (cartQuantityButton && cartItem) {
      const nextQuantity = cartItem.quantity + Number(cartQuantityButton.dataset.cartQuantity);
      api("/api/cart", { method: "POST", body: JSON.stringify({ productId: product.id, voltage: cartItem.voltage, quantity: nextQuantity }) })
        .then((result) => { cartItem = result.item; updateCartUI(); })
        .catch((error) => showToast(error.message));
    }

    if (event.target.closest("[data-cart-remove]")) { cartItem = null; updateCartUI(); announce("Produto removido do carrinho."); }
  });

  $$("dialog").forEach((dialog) => dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  }));

  $("#searchInput").addEventListener("input", (event) => searchProducts(event.target.value));
  $("#searchForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const query = $("#searchInput").value;
    searchProducts(query);
    const firstResult = $(".search-result");
    if (firstResult) firstResult.click();
    else if (!query.trim()) $("#searchInput").focus();
  });
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".search-form")) $("#searchResults").hidden = true;
  });

  $("#galleryViewport").addEventListener("scroll", updateGalleryFromScroll, { passive: true });
  window.addEventListener("resize", () => {
    const viewport = $("#galleryViewport");
    if (viewport) viewport.scrollTo({ left: activeSlide * viewport.clientWidth, behavior: "auto" });
  }, { passive: true });
  $("#quantityDown").addEventListener("click", () => changeQuantity(-1));
  $("#quantityUp").addEventListener("click", () => changeQuantity(1));
  $("#addCartButton").addEventListener("click", addToCart);
  $("#buyNowButton").addEventListener("click", () => beginCheckout());
  $("#cartCheckoutButton").addEventListener("click", () => cartItem && beginCheckout({ productId: cartItem.productId, voltage: cartItem.voltage, quantity: cartItem.quantity }));
  $(".cart-trigger").addEventListener("click", () => openDialog("cartDialog"));
  $("#shippingForm").addEventListener("submit", (event) => { event.preventDefault(); consultShipping(event.currentTarget, $("#postalCodeInput"), $("#shippingResult")); });
  $("#locationForm").addEventListener("submit", (event) => {
    event.preventDefault();
    saveLocationFromCep($("#locationPostalInput"), $("#locationResult"));
  });
  $("#clearCepButton").addEventListener("click", clearSavedCep);
  $("#useLocationButton").addEventListener("click", useCurrentLocation);

  $("#postalCodeInput").addEventListener("input", (event) => {
    const digits = event.target.value.replace(/\D/g, "").slice(0, 8);
    event.target.value = digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
    event.target.removeAttribute("aria-invalid");
  });
  $("#locationPostalInput").addEventListener("input", (event) => {
    const digits = event.target.value.replace(/\D/g, "").slice(0, 8);
    event.target.value = digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
    event.target.removeAttribute("aria-invalid");
  });

  $("#favoriteButton").addEventListener("click", (event) => {
    const button = event.currentTarget;
    const isFavorite = button.getAttribute("aria-pressed") !== "true";
    button.setAttribute("aria-pressed", String(isFavorite));
    button.setAttribute("aria-label", isFavorite ? "Remover dos favoritos" : "Adicionar aos favoritos");
    try { localStorage.setItem("casa-nativa-favorite", String(isFavorite)); } catch { /* storage can be unavailable in private browsing */ }
    showToast(isFavorite ? "Produto salvo nos favoritos deste navegador." : "Produto removido dos favoritos.");
  });
  try {
    const favorite = localStorage.getItem("casa-nativa-favorite") === "true";
    $("#favoriteButton").setAttribute("aria-pressed", String(favorite));
    if (favorite) $("#favoriteButton").setAttribute("aria-label", "Remover dos favoritos");
  } catch { /* storage can be unavailable in private browsing */ }

  $("#shareButton").addEventListener("click", async () => {
    const payload = { title: product?.title || document.title, text: "Veja este produto na Casa Nativa.", url: location.href };
    try {
      if (navigator.share) await navigator.share(payload);
      else if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(payload.url); showToast("Link copiado para compartilhar."); }
      else showStatus("Compartilhar", payload.url);
    } catch (error) { if (error.name !== "AbortError") showStatus("Compartilhar", "Não foi possível abrir o compartilhamento neste navegador."); }
  });

  $("#zoomButton").addEventListener("click", () => updateZoom(activeSlide));
  $("#openAllPhotos").addEventListener("click", () => updateZoom(0));
  $(".zoom-prev").addEventListener("click", () => updateGallery(activeSlide - 1));
  $(".zoom-next").addEventListener("click", () => updateGallery(activeSlide + 1));

  $("#expandDescription").addEventListener("click", (event) => {
    const button = event.currentTarget;
    const expanded = button.getAttribute("aria-expanded") !== "true";
    button.setAttribute("aria-expanded", String(expanded));
    $("#descriptionCopy").classList.toggle("collapsed", !expanded);
    $(".expand-description-label").textContent = expanded ? "Mostrar menos" : "Ver descrição completa";
  });
  $("#contactButton").addEventListener("click", openProductChat);
  $("#chatForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const input = $("#chatInput");
    const question = input.value;
    input.value = "";
    sendChatQuestion(question);
  });
  $("#showAllReviews").addEventListener("click", (event) => {
    const button = event.currentTarget;
    const expanded = button.getAttribute("aria-expanded") !== "true";
    button.setAttribute("aria-expanded", String(expanded));
    $("#extraReviews").hidden = !expanded;
    button.textContent = expanded ? "Mostrar menos opiniões" : "Mostrar todas as opiniões";
  });

  document.addEventListener("keydown", (event) => {
    if (event.target.matches("input, textarea, [contenteditable=true]")) return;
    if (event.key === "ArrowRight" && $("#zoomDialog").open) updateGallery(activeSlide + 1);
    if (event.key === "ArrowLeft" && $("#zoomDialog").open) updateGallery(activeSlide - 1);
    if (event.key === "ArrowRight" && !$("#zoomDialog").open && document.activeElement === $("#galleryViewport")) updateGallery(activeSlide + 1);
    if (event.key === "ArrowLeft" && !$("#zoomDialog").open && document.activeElement === $("#galleryViewport")) updateGallery(activeSlide - 1);
  });
}

bindEvents();
loadSavedCep();
void useCurrentLocation({ showFallback: true });
api("/api/product")
  .then(renderProduct)
  .catch((error) => {
    showToast(`Não foi possível carregar os dados do produto: ${error.message}`);
    announce("Dados do produto indisponíveis.");
  });
