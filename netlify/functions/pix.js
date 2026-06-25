exports.handler = async function (event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Método não permitido' }) };

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Body inválido' }) }; }

  const { email, telefone, nome, cpf, metodo, cartao } = body;
  const API_KEY = process.env.ABACATEPAY_API_KEY;

  try {
    // Criar cliente com CPF
    const clienteRes = await fetch('https://api.abacatepay.com/v1/customer/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}` },
      body: JSON.stringify({
        name: nome || 'Cliente',
        email,
        cellphone: telefone || '11999999999',
        taxId: cpf || '00000000000',
      }),
    });
    const cliente = await clienteRes.json();
    if (!clienteRes.ok) return { statusCode: 500, headers, body: JSON.stringify({ error: 'Erro ao criar cliente', detail: cliente }) };

    const methods = metodo === 'CREDIT_CARD' ? ['CREDIT_CARD'] : ['PIX'];

    const billingBody = {
      frequency: 'ONE_TIME',
      methods,
      products: [{
        externalId: 'carta-para-sempre',
        name: 'Carta do Coracao - Para Sempre',
        description: 'Acesso completo para criar sua cartinha especial',
        quantity: 1,
        price: 1990,
      }],
      customer: { id: cliente.data?.id },
      returnUrl: 'https://cartadocoracao1.netlify.app/sucesso.html',
      completionUrl: 'https://cartadocoracao1.netlify.app/sucesso.html',
    };

    if (metodo === 'CREDIT_CARD' && cartao) {
      const [mes, ano] = cartao.validade.split('/');
      billingBody.card = {
        number: cartao.numero,
        expiryMonth: mes,
        expiryYear: '20' + ano,
        cvv: cartao.cvv,
        holderName: cartao.nome,
      };
    }

    const cobrancaRes = await fetch('https://api.abacatepay.com/v1/billing/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}` },
      body: JSON.stringify(billingBody),
    });
    const cobranca = await cobrancaRes.json();
    if (!cobrancaRes.ok) return { statusCode: 500, headers, body: JSON.stringify({ error: 'Erro ao gerar cobranca', detail: cobranca }) };

    const pix = cobranca.data;
    return {
      statusCode: 200, headers,
      body: JSON.stringify({
        success: true,
        pixCopiaECola: pix?.pixQrCodeText || pix?.pix?.qrCodeText,
        billingId: pix?.id,
        url: pix?.url,
      }),
    };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Erro interno', detail: err.message }) };
  }
};
