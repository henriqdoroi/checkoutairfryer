# Página mobile de produto · reconstrução visual

Página de produto mobile-first da Casa Nativa, criada com HTML, CSS e JavaScript nativos e servida por um pequeno servidor Node.js sem dependências externas. É uma loja independente e não tem vínculo com o Mercado Livre.

## Executar

```powershell
node server.js
```

Abra `http://127.0.0.1:4173` no navegador. Para escolher outra porta, defina `PORT` antes de iniciar o processo.

## Dados e integrações

- O preço do produto, as parcelas, a avaliação, a contagem de vendas, o nome do vendedor, trechos de opiniões, a ficha técnica e os recortes de produtos relacionados foram transcritos das 12 capturas fornecidas na conversa. Os recortes do logotipo e das fotos de opiniões também vieram das capturas; as imagens estão em `assets/`.
- O cartão do vendedor reproduz as métricas visíveis na captura de 20/10/2026. São dados históricos da referência, não um catálogo conectado. A lista adicional de produtos do vendedor foi removida conforme solicitado.
- O rodapé usa navegação para seções da loja e identifica a Casa Nativa; não reproduz dados legais ou de contato de outra empresa.
- O bloco de pagamento mantém nomes vistos na captura apenas como referência e informa que a integração está em preparação. A loja ainda não tem um meio de pagamento ativo nem apresenta selos de aceitação.
- As capturas de referência são de 20/10/2026 e não confirmam preços, avaliações ou disponibilidade atuais. O estoque foi informado pela loja: 15 unidades para cada voltagem.
- A galeria contém a imagem principal, o vídeo na segunda posição e as imagens informativas fornecidas pela loja.
- A validação do carrinho permite até 15 unidades por voltagem. O saldo não é sincronizado nem reservado entre pedidos.
- Os botões de compra e do carrinho abrem a rota de produto em `https://checkout001.vercel.app`. O checkout está publicado em modo de prévia: não aceita pedidos, não cobra e pede que a pessoa não informe dados pessoais até um provedor e um banco de pedidos serem configurados.
- As informações de frete e prazo e os trechos de opiniões são reproduções das capturas, sem consulta atual. Garantias e devoluções, avaliações verificadas e meios de pagamento ainda não têm fontes ativas conectadas.
- O chat responde perguntas do produto. Sem credencial de IA, usa respostas locais baseadas no catálogo. Com Vercel AI Gateway configurado, encaminha as perguntas para o modelo selecionado e limita as respostas aos fatos disponíveis, sem afirmar que vendedor, avaliações, entrega ou políticas foram verificados.
- Para ativar as respostas por IA, defina `AI_GATEWAY_API_KEY` no ambiente do servidor (ou use `VERCEL_OIDC_TOKEN` em um deployment Vercel). Opcionalmente, escolha um modelo disponível em `AI_CHAT_MODEL`; o padrão é `openai/gpt-5.4-mini`. A chave nunca é enviada ao navegador. Quando a IA está ativa, o texto da conversa é processado pelo serviço configurado. [Documentação do AI Gateway](https://vercel.com/docs/ai-gateway/sdks-and-apis).
- O CEP e o favorito podem ser guardados no `localStorage` deste navegador. O carrinho existe apenas em memória e é apagado ao recarregar a página.
- O endereço fixo que aparecia na referência foi removido. Ao abrir a página, o navegador solicita permissão para usar a localização; a pessoa também pode tentar novamente em “Usar minha localização”. Com a permissão, as coordenadas seguem ao Nominatim do OpenStreetMap para obter uma rua/cidade/CEP aproximados. As coordenadas não são guardadas; apenas o endereço/CEP retornado é salvo localmente e pode ser removido pelo diálogo de entrega. A consulta manual ou o complemento por CEP usa ViaCEP e, quando necessário, tenta a BrasilAPI como reserva.
- O uso do Nominatim público é disparado pela pessoa, enfileirado a no máximo uma requisição por segundo e usa cache em memória por coordenadas arredondadas. A UI mostra atribuição ao OpenStreetMap. O endpoint pode ser trocado sem editar código via `NOMINATIM_REVERSE_URL`; para uso comercial ou volume maior, configure uma instância/fornecedor apropriado e observe a [política oficial de uso](https://operations.osmfoundation.org/policies/nominatim/) e a [documentação de geocodificação reversa](https://nominatim.org/release-docs/latest/api/Reverse/).
- A única cor confirmada nas referências é Cinza; o seletor oferece essa opção.

## Endpoints locais

- `GET /api/product`: dados do produto, incluindo o estoque informado pela loja.
- `GET /api/chat/status`: indica se o chat está no modo IA ou respostas locais de catálogo.
- `POST /api/chat`: valida o histórico curto de conversa e responde com o AI Gateway quando configurado; caso contrário, usa respostas locais fundamentadas nos dados disponíveis.
- `GET /api/shipping?postalCode=...`: valida o formato do CEP e responde que não há transportadora conectada.
- `POST /api/location/reverse`: valida latitude/longitude, reduz a precisão para quatro casas decimais e consulta o endereço aproximado no Nominatim configurado.
- `POST /api/location/cep`: consulta rua, bairro e cidade pelo ViaCEP e tenta a BrasilAPI como reserva se os dados estiverem incompletos ou o ViaCEP falhar.
- `POST /api/cart`: valida produto, voltagem e a quantidade máxima informada de 15 unidades por voltagem.
- `POST /api/checkout`: resposta local legada; a navegação de compra usa o checkout publicado em `checkout001.vercel.app`.

Para processar vendas, configure um provedor de pagamentos e um banco de pedidos no projeto `checkout001`. Também é necessário integrar a gestão de estoque para reservar unidades e atualizar o saldo dos pedidos.
