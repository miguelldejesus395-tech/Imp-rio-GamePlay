'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const PORT = Number(process.env.PORT || 10000);

const SUPABASE_URL = String(process.env.SUPABASE_URL || '').trim();
const SUPABASE_SECRET_KEY = String(
  process.env.SUPABASE_SECRET_KEY || ''
).trim();

const ADMIN_USER = String(process.env.ADMIN_USER || 'admin').trim();
const ADMIN_PASSWORD = String(
  process.env.ADMIN_PASSWORD || '123456'
).trim();

const PUBLIC_URL = String(
  process.env.PUBLIC_URL ||
  `http://localhost:${PORT}`
).replace(/\/+$/, '');

const SESSION_TTL = 1000 * 60 * 60 * 24 * 7;
const STREAM_AGENT_KEY = String(
  process.env.STREAM_AGENT_KEY || ''
).trim();

const streamAgents = new Map();
const streamCommands = new Map();
let lastStreamAgentId = '';

function streamAgentAuthorized(req) {
  if (!STREAM_AGENT_KEY) {
    return false;
  }

  const key = String(
    req.headers['x-stream-agent-key'] || ''
  ).trim();

  return key === STREAM_AGENT_KEY;
}

function requireStreamAgent(req, res) {
  if (!streamAgentAuthorized(req)) {
    sendJson(res, 401, {
      ok: false,
      error: 'Stream Agent não autorizado.'
    });

    return false;
  }

  return true;
}

if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  console.error('ERRO: SUPABASE_URL e SUPABASE_SECRET_KEY precisam estar configurados.');
  process.exit(1);
}

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_SECRET_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  }
);

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

/* =========================================================
   UTILIDADES
========================================================= */

function sendJson(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });

  res.end(JSON.stringify(data));
}

function sendText(res, status, text) {
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8'
  });

  res.end(text);
}

function getToken(req) {
  const header = String(req.headers.authorization || '');

  if (!header.toLowerCase().startsWith('bearer ')) {
    return '';
  }

  return header.slice(7).trim();
}

function parseUrl(req) {
  return new URL(
    req.url,
    `http://${req.headers.host || 'localhost'}`
  );
}

function routePath(req) {
  const { data: found, error } = await supabase
  .from('usuarios')
  .select(
    'id,username,email,password,minutos,plano,bloqueado,created_at'
  )
  .or(
    `username.eq.${user},email.eq.${user}`
  )
  .limit(1)
  .maybeSingle();
}
  .limit(1)
  .maybeSingle();
  return pathname.slice(prefix.length).replace(/^\/+/, '').split('/')[0];
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';

    req.on('data', chunk => {
      body += chunk;

      if (body.length > 2 * 1024 * 1024) {
        reject(new Error('Requisição muito grande.'));
        req.destroy();
      }
    });

    req.on('end', () => {
      if (!body.trim()) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error('JSON inválido.'));
      }
    });

    req.on('error', reject);
  });
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');

  const hash = crypto.scryptSync(
    String(password),
    salt,
    64
  ).toString('hex');

  return `scrypt:${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const value = String(stored || '');

  if (!value.startsWith('scrypt:')) {
    return crypto.timingSafeEqual(
      Buffer.from(String(password)),
      Buffer.from(value)
    );
  }

  const parts = value.split(':');

  if (parts.length !== 3) {
    return false;
  }

  const salt = parts[1];
  const originalHash = Buffer.from(parts[2], 'hex');

  const testHash = crypto.scryptSync(
    String(password),
    salt,
    originalHash.length
  );

  return (
    testHash.length === originalHash.length &&
    crypto.timingSafeEqual(testHash, originalHash)
  );
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function normalizeUsername(username) {
  return String(username || '').trim();
}

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function moneyToCents(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return 0;
  }

  return Math.round(number * 100);
}

function centsToMoney(cents) {
  return Number(cents || 0) / 100;
}

function makeOrderNSU() {
  return `IGP-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
}

/* =========================================================
   SESSÕES
========================================================= */

async function createSession(usuarioId, tipo) {
  const token = crypto.randomBytes(32).toString('hex');

  const row = {
    usuario_id: usuarioId || null,
    token,
    ativo: true,
    created_at: new Date().toISOString()
  };

  /*
    Se a tabela sessoes possuir a coluna tipo, salvamos.
    Se não possuir, o restante do sistema continua funcionando
    usando usuario_id nulo para identificar o administrador.
  */
  if (tipo) {
    row.tipo = tipo;
  }

  let result = await supabase
    .from('sessoes')
    .insert(row)
    .select()
    .single();

  /*
    Compatibilidade caso tipo ainda não exista na tabela.
  */
  if (result.error && row.tipo) {
    const fallback = {
      usuario_id: usuarioId || null,
      token,
      ativo: true,
      created_at: new Date().toISOString()
    };

    result = await supabase
      .from('sessoes')
      .insert(fallback)
      .select()
      .single();
  }

  if (result.error) {
    throw new Error(result.error.message);
  }

  return token;
}

async function getSession(req) {
  const token = getToken(req);

  if (!token) {
    return null;
  }

  const { data, error } = await supabase
    .from('sessoes')
    .select('*')
    .eq('token', token)
    .eq('ativo', true)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const created = new Date(data.created_at).getTime();

  if (
    Number.isFinite(created) &&
    Date.now() - created > SESSION_TTL
  ) {
    await supabase
      .from('sessoes')
      .update({ ativo: false })
      .eq('id', data.id);

    return null;
  }

  return data;
}

async function logoutSession(req) {
  const token = getToken(req);

  if (!token) {
    return;
  }

  await supabase
    .from('sessoes')
    .update({ ativo: false })
    .eq('token', token);
}

async function requireLogin(req, res) {
  const session = await getSession(req);

  if (!session) {
    sendJson(res, 401, {
      ok: false,
      error: 'Não autenticado.'
    });

    return null;
  }

  return session;
}

async function requireAdmin(req, res) {
  const session = await requireLogin(req, res);

  if (!session) {
    return null;
  }

  /*
    Admin usa sessão sem usuario_id.
  */
  const isAdmin =
    session.tipo === 'admin' ||
    session.usuario_id === null ||
    session.usuario_id === undefined;

  if (!isAdmin) {
    sendJson(res, 403, {
      ok: false,
      error: 'Acesso de administrador necessário.'
    });

    return null;
  }

  return session;
}

/* =========================================================
   INFINITEPAY
========================================================= */

async function getStoreConfig() {
  const { data, error } = await supabase
    .from('configuracoes_loja')
    .select('*')
    .eq('id', 1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data || {
    id: 1,
    pix_ativo: true,
    cartao_ativo: true,
    infinitepay_ativo: false,
    infinitepay_handle: ''
  };
}

async function createInfinitePayCheckout({
  orderNSU,
  handle,
  items,
  customer
}) {
  if (!handle) {
    throw new Error(
      'A InfiniteTag da InfinitePay ainda não foi configurada no ADM.'
    );
  }

  const payload = {
    handle,
    order_nsu: orderNSU,
    redirect_url: `${PUBLIC_URL}/pagamento.html`,
    webhook_url: `${PUBLIC_URL}/api/payments/infinitepay/webhook`,
    items
  };

  if (customer && customer.email) {
    payload.customer = {
      name: customer.name || customer.username || 'Cliente',
      email: customer.email,
      phone_number: customer.phone_number || undefined
    };
  }

  const response = await fetch(
    'https://api.checkout.infinitepay.io/links',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    }
  );

  const text = await response.text();

  let result;

  try {
    result = JSON.parse(text);
  } catch {
    result = {};
  }

  if (!response.ok) {
    throw new Error(
      result.message ||
      result.error ||
      `InfinitePay retornou HTTP ${response.status}.`
    );
  }

  if (!result.url) {
    throw new Error(
      'A InfinitePay não retornou o link de pagamento.'
    );
  }

  return result;
}

async function checkInfinitePayPayment({
  handle,
  orderNSU,
  transactionNSU,
  slug
}) {
  if (!handle || !orderNSU || !transactionNSU || !slug) {
    return {
      success: false,
      paid: false
    };
  }

  const response = await fetch(
    'https://api.checkout.infinitepay.io/payment_check',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        handle,
        order_nsu: orderNSU,
        transaction_nsu: transactionNSU,
        slug
      })
    }
  );

  const text = await response.text();

  try {
    return JSON.parse(text);
  } catch {
    return {
      success: false,
      paid: false
    };
  }
}

/* =========================================================
   PAGAMENTO APROVADO
========================================================= */

async function creditApprovedPayment(payment, webhook) {
  if (!payment) {
    return {
      ok: false,
      error: 'Pagamento não encontrado.'
    };
  }

  /*
    Idempotência:
    se já foi pago, não adiciona os minutos novamente.
  */
  if (payment.status === 'pago') {
    return {
      ok: true,
      alreadyPaid: true
    };
  }

  const config = await getStoreConfig();

  if (
    !config.infinitepay_handle ||
    !webhook.transaction_nsu ||
    !webhook.invoice_slug ||
    !webhook.order_nsu
  ) {
    return {
      ok: false,
      error: 'Dados insuficientes para confirmar o pagamento.'
    };
  }

  const check = await checkInfinitePayPayment({
    handle: config.infinitepay_handle,
    orderNSU: webhook.order_nsu,
    transactionNSU: webhook.transaction_nsu,
    slug: webhook.invoice_slug
  });

  if (!check.success || !check.paid) {
    return {
      ok: false,
      error: 'Pagamento ainda não confirmado pela InfinitePay.'
    };
  }

  const receivedAmount = Number(
    check.paid_amount ?? check.amount ?? 0
  );

  const expectedAmount = moneyToCents(payment.valor);

  if (receivedAmount < expectedAmount) {
    return {
      ok: false,
      error: 'Valor recebido menor que o valor do pedido.'
    };
  }

  /*
    Atualiza pagamento primeiro somente depois da confirmação
    oficial da InfinitePay.
  */
  const { data: updatedPayment, error: paymentError } =
    await supabase
      .from('pagamentos')
      .update({
        status: 'pago',
        pagamento_id: String(webhook.transaction_nsu),
        updated_at: new Date().toISOString()
      })
      .eq('id', payment.id)
      .eq('status', 'pendente')
      .select()
      .maybeSingle();

  if (paymentError) {
    throw new Error(paymentError.message);
  }

  /*
    Outra chamada pode ter processado o pagamento primeiro.
  */
  if (!updatedPayment) {
    const { data: current } = await supabase
      .from('pagamentos')
      .select('status')
      .eq('id', payment.id)
      .maybeSingle();

    return {
      ok: current?.status === 'pago',
      alreadyPaid: current?.status === 'pago'
    };
  }

  const { data: user, error: userError } = await supabase
    .from('usuarios')
    .select('id,minutos')
    .eq('id', payment.usuario_id)
    .single();

  if (userError || !user) {
    throw new Error(
      userError?.message || 'Usuário não encontrado.'
    );
  }

  const novosMinutos =
    Number(user.minutos || 0) +
    Number(payment.minutos || 0);

  const { error: updateUserError } = await supabase
    .from('usuarios')
    .update({
      minutos: novosMinutos
    })
    .eq('id', user.id);

  if (updateUserError) {
    /*
      Se a confirmação foi salva mas o crédito falhou,
      deixamos o pagamento marcado como erro de crédito.
      O ADM poderá identificar e corrigir.
    */
    await supabase
      .from('pagamentos')
      .update({
        status: 'erro_credito',
        updated_at: new Date().toISOString()
      })
      .eq('id', payment.id);

    throw new Error(updateUserError.message);
  }

  await supabase
    .from('pedidos')
    .update({
      status: 'pago'
    })
    .eq('id', payment.pedido_id);

  return {
    ok: true,
    minutosAdicionados: Number(payment.minutos || 0),
    novoSaldo: novosMinutos
  };
}

/* =========================================================
   API
========================================================= */

async function handleApi(req, res) {
  const pathname = routePath(req);
  const method = req.method.toUpperCase();
  
  /*
   * =========================================================
   * GAMECLOUD STREAM AGENT
   * HEARTBEAT
   * =========================================================
   */

  if (
    pathname === '/api/stream/heartbeat' &&
    method === 'POST'
  ) {
    if (!requireStreamAgent(req, res)) {
      return true;
    }

    try {
      const body = await readJson(req);

      const agentId = String(
        body.agentId ||
        body.agent_id ||
        body.host ||
        'gamecloud-agent'
      ).trim();

      if (!agentId) {
        sendJson(res, 400, {
          ok: false,
          error: 'agentId não informado.'
        });

        return true;
      }

      const agent = {
        agentId,
        status: String(body.status || 'online'),
        game: String(body.game || 'FiveM'),
        host: String(body.host || agentId),
        message: String(body.message || ''),
        lastSeen: new Date().toISOString()
      };

      streamAgents.set(agentId, agent);
      lastStreamAgentId = agentId;

      sendJson(res, 200, {
        ok: true,
        agent
      });

      return true;

    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: error.message
      });

      return true;
    }
  }

  /*
   * =========================================================
   * STREAM AGENT - BUSCAR COMANDO
   * =========================================================
   */

  if (
    pathname === '/api/stream/command' &&
    method === 'GET'
  ) {
    if (!requireStreamAgent(req, res)) {
      return true;
    }

    const agentId = lastStreamAgentId;

    if (!agentId) {
      sendJson(res, 200, {
        ok: true,
        command: null
      });

      return true;
    }

    const command =
      streamCommands.get(agentId) || null;

    if (command) {
      streamCommands.delete(agentId);
    }

    sendJson(res, 200, {
      ok: true,
      command
    });

    return true;
  }
    /*
   * =========================================================
   * STREAM AGENT - STATUS
   * =========================================================
   */

  if (
    pathname === '/api/stream/status' &&
    method === 'GET'
  ) {
    sendJson(res, 200, {
      ok: true,
      agents: Array.from(
        streamAgents.values()
      )
    });

    return true;
  }

   /*
   * =========================================================
   * USUÁRIO - INICIAR FIVEM
   * =========================================================
   */

  if (
    pathname === '/api/stream/start' &&
    method === 'POST'
  ) {
    const agentId =
      String(lastStreamAgentId || '').trim();

    if (!agentId) {
      sendJson(res, 404, {
        ok: false,
        error: 'Nenhum Stream Agent online.'
      });

      return true;
    }

    streamCommands.set(
      agentId,
      'start_fivem'
    );

    sendJson(res, 200, {
      ok: true,
      agentId,
      command: 'start_fivem',
      message: 'FiveM autorizado para iniciar.'
    });

    return true;
  } 
  /*
   * =========================================================
   * ADMIN - ENVIAR COMANDO PARA O STREAM AGENT
   * =========================================================
   */

  if (
    pathname === '/api/admin/stream/command' &&
    method === 'POST'
  ) {
    try {
      const admin = await requireAdmin(req, res);

      if (!admin) {
        return true;
      }

      const body = await readJson(req);

      const command = String(
        body.command || ''
      ).trim();

      if (
        command !== 'start_fivem' &&
        command !== 'stop_fivem'
      ) {
        sendJson(res, 400, {
          ok: false,
          error: 'Comando inválido.'
        });

        return true;
      }

      const agentId = String(
        body.agentId ||
        body.agent_id ||
        lastStreamAgentId ||
        ''
      ).trim();

      if (!agentId) {
        sendJson(res, 404, {
          ok: false,
          error: 'Nenhum Stream Agent online.'
        });

        return true;
      }

      streamCommands.set(
        agentId,
        command
      );

      sendJson(res, 200, {
        ok: true,
        agentId,
        command
      });

      return true;

    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: error.message
      });

      return true;
    }
  }
    if (
    pathname === '/api/admin/stream/status' &&
    method === 'GET'
  ) {
    try {
      const admin = await requireAdmin(req, res);

      if (!admin) {
        return true;
      }

      const agents = Array.from(
        streamAgents.values()
      );

      sendJson(res, 200, {
        ok: true,
        agents
      });

      return true;

    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: error.message
      });

      return true;
    }
  }
  /*
    ---------------------------------------------------------
    HEALTH
    ---------------------------------------------------------
  */
  if (
    pathname === '/api/health' &&
    method === 'GET'
  ) {
    const { error } = await supabase
      .from('usuarios')
      .select('id')
      .limit(1);

    if (error) {
      sendJson(res, 500, {
        ok: false,
        database: 'supabase',
        error: error.message
      });

      return true;
    }

    sendJson(res, 200, {
      ok: true,
      database: 'supabase',
      payment: 'infinitepay'
    });

    return true;
  }

  /*
    ---------------------------------------------------------
    REGISTRO
    ---------------------------------------------------------
  */
  if (
    pathname === '/api/register' &&
    method === 'POST'
  ) {
    try {
      const body = await readJson(req);

      const username = normalizeUsername(body.username);
      const email = normalizeEmail(body.email);
      const password = String(body.password || '');

      if (username.length < 3) {
        sendJson(res, 400, {
          ok: false,
          error: 'O usuário precisa ter pelo menos 3 caracteres.'
        });

        return true;
      }

      if (!validEmail(email)) {
        sendJson(res, 400, {
          ok: false,
          error: 'Informe um e-mail válido.'
        });

        return true;
      }

      if (password.length < 6) {
        sendJson(res, 400, {
          ok: false,
          error: 'A senha precisa ter pelo menos 6 caracteres.'
        });

        return true;
      }

      const { data: existingUser } = await supabase
        .from('usuarios')
        .select('id,username,email')
        .or(
          `username.eq.${username},email.eq.${email}`
        )
        .limit(1)
        .maybeSingle();

      if (existingUser) {
        sendJson(res, 409, {
          ok: false,
          error: 'Usuário ou e-mail já cadastrado.'
        });

        return true;
      }

      const passwordHash = hashPassword(password);

      const { data: user, error } = await supabase
        .from('usuarios')
        .insert({
          username,
          email,
          password: passwordHash,
          minutos: 0,
          plano: 'nenhum',
          bloqueado: false
        })
        .select(
          'id,username,email,minutos,plano,bloqueado,created_at'
        )
        .single();

      if (error) {
        sendJson(res, 400, {
          ok: false,
          error: error.message
        });

        return true;
      }

      sendJson(res, 201, {
        ok: true,
        user
      });

      return true;

    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: error.message
      });

      return true;
    }
  }

  /*
    ---------------------------------------------------------
    LOGIN
    ---------------------------------------------------------
  */
  if (
    pathname === '/api/login' &&
    method === 'POST'
  ) {
    try {
      const body = await readJson(req);

      const user = normalizeUsername(
        body.user || body.username
      );

      const pass = String(
        body.pass || body.password || ''
      );

      /*
        ADMIN
      */
      if (
        user === ADMIN_USER &&
        pass === ADMIN_PASSWORD
      ) {
        const token = await createSession(
          null,
          'admin'
        );

        sendJson(res, 200, {
          ok: true,
          token,
          role: 'admin'
        });

        return true;
      }

     const { data: found, error } = await supabase
  .from('usuarios')
  .select(
    'id,username,email,password,minutos,plano,bloqueado,created_at'
  )
  .or(
    `username.eq.${user},email.eq.${user}`
  )
  .limit(1)
  .maybeSingle();

if (error || !found) {
  sendJson(res, 401, {
    ok: false,
    error: 'Usuário ou senha incorretos.'
  });

  return true;
}

      if (found.bloqueado) {
        sendJson(res, 403, {
          ok: false,
          error: 'Esta conta está bloqueada.'
        });

        return true;
      }

      if (!verifyPassword(pass, found.password)) {
        sendJson(res, 401, {
          ok: false,
          error: 'Usuário ou senha incorretos.'
        });

        return true;
      }

      const token = await createSession(
        found.id,
        'user'
      );

      sendJson(res, 200, {
        ok: true,
        token,
        role: 'user',
        user: {
          id: found.id,
          username: found.username,
          email: found.email,
          minutos: found.minutos,
          plano: found.plano,
          bloqueado: found.bloqueado
        }
      });

      return true;

    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: error.message
      });

      return true;
    }
  }

  /*
    ---------------------------------------------------------
    LOGOUT
    ---------------------------------------------------------
  */
  if (
    pathname === '/api/logout' &&
    method === 'POST'
  ) {
    await logoutSession(req);

    sendJson(res, 200, {
      ok: true
    });

    return true;
  }

  /*
    ---------------------------------------------------------
    ME
    ---------------------------------------------------------
  */
  if (
    pathname === '/api/me' &&
    method === 'GET'
  ) {
    const session = await requireLogin(req, res);

    if (!session) {
      return true;
    }

    if (
      session.tipo === 'admin' ||
      session.usuario_id === null
    ) {
      sendJson(res, 200, {
        ok: true,
        role: 'admin'
      });

      return true;
    }

    const { data: user, error } = await supabase
      .from('usuarios')
      .select(
        'id,username,email,minutos,plano,bloqueado,created_at'
      )
      .eq('id', session.usuario_id)
      .maybeSingle();

    if (error || !user) {
      sendJson(res, 404, {
        ok: false,
        error: 'Usuário não encontrado.'
      });

      return true;
    }

    sendJson(res, 200, {
      ok: true,
      role: 'user',
      user
    });

    return true;
  }

  /*
    ---------------------------------------------------------
    PACOTES PÚBLICOS
    ---------------------------------------------------------
  */
  if (
    pathname === '/api/packages' &&
    method === 'GET'
  ) {
    const { data, error } = await supabase
      .from('pacotes_minutos')
      .select(
        'id,nome,minutos,preco,descricao,ativo,ordem,created_at,updated_at'
      )
      .eq('ativo', true)
      .order('ordem', { ascending: true });

    if (error) {
      sendJson(res, 500, {
        ok: false,
        error: error.message
      });

      return true;
    }

    sendJson(res, 200, {
      ok: true,
      packages: data || []
    });

    return true;
  }

  /*
    ---------------------------------------------------------
    CRIAR PEDIDO
    ---------------------------------------------------------
  */
  if (
    pathname === '/api/orders' &&
    method === 'POST'
  ) {
    try {
      const session = await requireLogin(req, res);

      if (!session) {
        return true;
      }

      if (
        session.tipo === 'admin' ||
        session.usuario_id === null
      ) {
        sendJson(res, 400, {
          ok: false,
          error: 'Administrador não pode criar pedido de cliente.'
        });

        return true;
      }

      const body = await readJson(req);

      const packageId = String(
        body.packageId ||
        body.pacote_id ||
        ''
      ).trim();

      if (!packageId) {
        sendJson(res, 400, {
          ok: false,
          error: 'Pacote não informado.'
        });

        return true;
      }

      const { data: user, error: userError } =
        await supabase
          .from('usuarios')
          .select(
            'id,username,email,minutos,bloqueado'
          )
          .eq('id', session.usuario_id)
          .single();

      if (userError || !user) {
        sendJson(res, 404, {
          ok: false,
          error: 'Usuário não encontrado.'
        });

        return true;
      }

      if (user.bloqueado) {
        sendJson(res, 403, {
          ok: false,
          error: 'Conta bloqueada.'
        });

        return true;
      }

      const { data: pacote, error: packageError } =
        await supabase
          .from('pacotes_minutos')
          .select(
            'id,nome,minutos,preco,descricao,ativo'
          )
          .eq('id', packageId)
          .eq('ativo', true)
          .single();

      if (packageError || !pacote) {
        sendJson(res, 404, {
          ok: false,
          error: 'Pacote não encontrado ou indisponível.'
        });

        return true;
      }

      const valor = Number(pacote.preco);
      const minutos = Number(pacote.minutos);

      if (
        !Number.isFinite(valor) ||
        valor < 0 ||
        !Number.isInteger(minutos) ||
        minutos <= 0
      ) {
        sendJson(res, 400, {
          ok: false,
          error: 'Pacote inválido.'
        });

        return true;
      }

      const config = await getStoreConfig();

      if (!config.infinitepay_ativo) {
        sendJson(res, 503, {
          ok: false,
          error: 'Pagamento InfinitePay está desativado.'
        });

        return true;
      }

      if (!config.infinitepay_handle) {
        sendJson(res, 503, {
          ok: false,
          error: 'InfinitePay ainda não foi configurada pelo administrador.'
        });

        return true;
      }

      /*
        Cria pedido.
      */
      const { data: pedido, error: orderError } =
        await supabase
          .from('pedidos')
          .insert({
            usuario_id: user.id,
            valor,
            status: 'pendente'
          })
          .select()
          .single();

      if (orderError || !pedido) {
        sendJson(res, 500, {
          ok: false,
          error:
            orderError?.message ||
            'Não foi possível criar o pedido.'
        });

        return true;
      }

      /*
        Cria registro de pagamento.
      */
      const { data: pagamento, error: paymentError } =
        await supabase
          .from('pagamentos')
          .insert({
            usuario_id: user.id,
            pacote_id: pacote.id,
            pedido_id: pedido.id,
            valor,
            minutos,
            provedor: 'infinitepay',
            metodo: null,
            pagamento_id: null,
            status: 'pendente'
          })
          .select()
          .single();

      if (paymentError || !pagamento) {
        await supabase
          .from('pedidos')
          .update({
            status: 'erro'
          })
          .eq('id', pedido.id);

        sendJson(res, 500, {
          ok: false,
          error:
            paymentError?.message ||
            'Não foi possível criar o pagamento.'
        });

        return true;
      }

      const orderNSU = makeOrderNSU();

      /*
        O order_nsu identifica esse pedido dentro
        da InfinitePay.
      */
      const checkout = await createInfinitePayCheckout({
        orderNSU,
        handle: config.infinitepay_handle,
        items: [
          {
            quantity: 1,
            price: moneyToCents(valor),
            description:
              `${pacote.nome} - ${minutos} minutos`
          }
        ],
        customer: {
          name: user.username,
          username: user.username,
          email: user.email
        }
      });

      /*
        Guardamos o order_nsu no pagamento.
      */
      const { error: saveNsuError } =
        await supabase
          .from('pagamentos')
          .update({
            pagamento_id: orderNSU
          })
          .eq('id', pagamento.id);

      if (saveNsuError) {
        console.error(
          'Erro salvando order_nsu:',
          saveNsuError.message
        );
      }

      sendJson(res, 201, {
        ok: true,
        order: pedido,
        payment: {
          id: pagamento.id,
          status: 'pendente',
          provider: 'infinitepay',
          order_nsu: orderNSU
        },
        checkout_url: checkout.url
      });

      return true;

    } catch (error) {
      console.error('Erro criando pedido:', error);

      sendJson(res, 500, {
        ok: false,
        error: error.message
      });

      return true;
    }
  }

  /*
    ---------------------------------------------------------
    PEDIDOS DO USUÁRIO
    ---------------------------------------------------------
  */
  if (
    pathname === '/api/orders' &&
    method === 'GET'
  ) {
    const session = await requireLogin(req, res);

    if (!session) {
      return true;
    }

    if (
      session.tipo === 'admin' ||
      session.usuario_id === null
    ) {
      sendJson(res, 400, {
        ok: false,
        error: 'Use a área administrativa.'
      });

      return true;
    }

    const { data, error } = await supabase
      .from('pedidos')
      .select(
        'id,usuario_id,valor,status,created_at'
      )
      .eq('usuario_id', session.usuario_id)
      .order('created_at', {
        ascending: false
      });

    if (error) {
      sendJson(res, 500, {
        ok: false,
        error: error.message
      });

      return true;
    }

    sendJson(res, 200, {
      ok: true,
      orders: data || []
    });

    return true;
  }

  /*
    ---------------------------------------------------------
    WEBHOOK INFINITEPAY
    ---------------------------------------------------------
  */
  if (
    pathname === '/api/payments/infinitepay/webhook' &&
    method === 'POST'
  ) {
    try {
      const body = await readJson(req);

      const orderNSU = String(
        body.order_nsu || ''
      ).trim();

      const transactionNSU = String(
        body.transaction_nsu || ''
      ).trim();

      const slug = String(
        body.invoice_slug || body.slug || ''
      ).trim();

      if (!orderNSU) {
        sendJson(res, 400, {
          success: false,
          message: 'order_nsu não informado.'
        });

        return true;
      }

      /*
        Localiza o pagamento pelo order_nsu.
      */
      const { data: payment, error } =
        await supabase
          .from('pagamentos')
          .select('*')
          .eq('pagamento_id', orderNSU)
          .maybeSingle();

      if (error) {
        sendJson(res, 400, {
          success: false,
          message: error.message
        });

        return true;
      }

      if (!payment) {
        /*
          A InfinitePay pode reenviar.
          Se o pedido não existe, 400 faz sentido
          porque a própria documentação informa que
          ela tenta novamente quando recebe 400.
        */
        sendJson(res, 400, {
          success: false,
          message: 'Pedido não encontrado.'
        });

        return true;
      }

      if (payment.status === 'pago') {
        sendJson(res, 200, {
          success: true,
          message: null
        });

        return true;
      }

      /*
        Confirma o pagamento na própria InfinitePay
        antes de liberar os minutos.
      */
      const result = await creditApprovedPayment(
        payment,
        {
          ...body,
          order_nsu: orderNSU,
          transaction_nsu: transactionNSU,
          invoice_slug: slug
        }
      );

      if (!result.ok) {
        sendJson(res, 400, {
          success: false,
          message: result.error || 'Pagamento não confirmado.'
        });

        return true;
      }

      sendJson(res, 200, {
        success: true,
        message: null
      });

      return true;

    } catch (error) {
      console.error(
        'Erro webhook InfinitePay:',
        error
      );

      sendJson(res, 400, {
        success: false,
        message: error.message
      });

      return true;
    }
  }

  /*
    ---------------------------------------------------------
    VERIFICAR PAGAMENTO MANUALMENTE
    ---------------------------------------------------------
  */
  if (
    pathname === '/api/payments/infinitepay/check' &&
    method === 'POST'
  ) {
    try {
      const session = await requireLogin(req, res);

      if (!session) {
        return true;
      }

      if (
        session.tipo === 'admin' ||
        session.usuario_id === null
      ) {
        sendJson(res, 400, {
          ok: false,
          error: 'Operação disponível somente para clientes.'
        });

        return true;
      }

      const body = await readJson(req);

      const paymentId = String(
        body.payment_id || ''
      ).trim();

      if (!paymentId) {
        sendJson(res, 400, {
          ok: false,
          error: 'Pagamento não informado.'
        });

        return true;
      }

      const { data: payment, error } =
        await supabase
          .from('pagamentos')
          .select('*')
          .eq('id', paymentId)
          .eq('usuario_id', session.usuario_id)
          .maybeSingle();

      if (error || !payment) {
        sendJson(res, 404, {
          ok: false,
          error: 'Pagamento não encontrado.'
        });

        return true;
      }

      if (payment.status === 'pago') {
        sendJson(res, 200, {
          ok: true,
          paid: true
        });

        return true;
      }

      const config = await getStoreConfig();

      /*
        pagamento_id começa como order_nsu.
      */
      const orderNSU = payment.pagamento_id;

      if (!orderNSU) {
        sendJson(res, 400, {
          ok: false,
          error: 'Pedido ainda não possui identificador de pagamento.'
        });

        return true;
      }

      /*
        Aqui só conseguimos confirmar se temos os
        dados da transação vindos do checkout.
      */
      const transactionNSU = String(
        body.transaction_nsu || ''
      );

      const slug = String(
        body.slug || ''
      );

      if (!transactionNSU || !slug) {
        sendJson(res, 200, {
          ok: true,
          paid: false,
          status: payment.status
        });

        return true;
      }

      const check = await checkInfinitePayPayment({
        handle: config.infinitepay_handle,
        orderNSU,
        transactionNSU,
        slug
      });

      if (!check.success || !check.paid) {
        sendJson(res, 200, {
          ok: true,
          paid: false,
          status: payment.status
        });

        return true;
      }

      const result = await creditApprovedPayment(
        payment,
        {
          order_nsu: orderNSU,
          transaction_nsu: transactionNSU,
          invoice_slug: slug
        }
      );

      sendJson(res, 200, {
        ok: result.ok,
        paid: result.ok,
        result
      });

      return true;

    } catch (error) {
      sendJson(res, 500, {
        ok: false,
        error: error.message
      });

      return true;
    }
  }

  /*
    =========================================================
    ADMIN - PACOTES
    =========================================================
  */

  if (
    pathname === '/api/admin/packages' &&
    method === 'GET'
  ) {
    const admin = await requireAdmin(req, res);

    if (!admin) {
      return true;
    }

    const { data, error } = await supabase
      .from('pacotes_minutos')
      .select('*')
      .order('ordem', {
        ascending: true
      });

    if (error) {
      sendJson(res, 500, {
        ok: false,
        error: error.message
      });

      return true;
    }

    sendJson(res, 200, {
      ok: true,
      packages: data || []
    });

    return true;
  }

  if (
    pathname === '/api/admin/packages' &&
    method === 'POST'
  ) {
    try {
      const admin = await requireAdmin(req, res);

      if (!admin) {
        return true;
      }

      const body = await readJson(req);

      const nome = String(
        body.nome || body.name || ''
      ).trim();

      const minutos = Number(body.minutos);
      const preco = Number(body.preco);

      const descricao = String(
        body.descricao || body.description || ''
      ).trim();

      const ativo =
        body.ativo === undefined
          ? true
          : Boolean(body.ativo);

      const ordem = Number(
        body.ordem || 0
      );

      if (!nome) {
        sendJson(res, 400, {
          ok: false,
          error: 'Nome do pacote é obrigatório.'
        });

        return true;
      }

      if (
        !Number.isInteger(minutos) ||
        minutos <= 0
      ) {
        sendJson(res, 400, {
          ok: false,
          error: 'Quantidade de minutos inválida.'
        });

        return true;
      }

      if (
        !Number.isFinite(preco) ||
        preco < 0
      ) {
        sendJson(res, 400, {
          ok: false,
          error: 'Preço inválido.'
        });

        return true;
      }

      const { data, error } = await supabase
        .from('pacotes_minutos')
        .insert({
          nome,
          minutos,
          preco,
          descricao,
          ativo,
          ordem
        })
        .select()
        .single();

      if (error) {
        sendJson(res, 400, {
          ok: false,
          error: error.message
        });

        return true;
      }

      sendJson(res, 201, {
        ok: true,
        package: data
      });

      return true;

    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: error.message
      });

      return true;
    }
  }

  if (
    pathname.startsWith('/api/admin/packages/') &&
    method === 'PUT'
  ) {
    try {
      const admin = await requireAdmin(req, res);

      if (!admin) {
        return true;
      }

      const id = getRouteId(
        req,
        '/api/admin/packages/'
      );

      if (!id) {
        sendJson(res, 400, {
          ok: false,
          error: 'ID do pacote não informado.'
        });

        return true;
      }

      const body = await readJson(req);

      const update = {};

      if (body.nome !== undefined) {
        update.nome = String(body.nome).trim();
      }

      if (body.minutos !== undefined) {
        update.minutos = Number(body.minutos);
      }

      if (body.preco !== undefined) {
        update.preco = Number(body.preco);
      }

      if (body.descricao !== undefined) {
        update.descricao = String(body.descricao);
      }

      if (body.ativo !== undefined) {
        update.ativo = Boolean(body.ativo);
      }

      if (body.ordem !== undefined) {
        update.ordem = Number(body.ordem);
      }

      update.updated_at = new Date().toISOString();

      const { data, error } = await supabase
        .from('pacotes_minutos')
        .update(update)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        sendJson(res, 400, {
          ok: false,
          error: error.message
        });

        return true;
      }

      sendJson(res, 200, {
        ok: true,
        package: data
      });

      return true;

    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: error.message
      });

      return true;
    }
  }

  if (
    pathname.startsWith('/api/admin/packages/') &&
    method === 'DELETE'
  ) {
    try {
      const admin = await requireAdmin(req, res);

      if (!admin) {
        return true;
      }

      const id = getRouteId(
        req,
        '/api/admin/packages/'
      );

      const { error } = await supabase
        .from('pacotes_minutos')
        .delete()
        .eq('id', id);

      if (error) {
        sendJson(res, 400, {
          ok: false,
          error: error.message
        });

        return true;
      }

      sendJson(res, 200, {
        ok: true
      });

      return true;

    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: error.message
      });

      return true;
    }
  }

  /*
    =========================================================
    ADMIN - USUÁRIOS
    =========================================================
  */

  if (
    pathname === '/api/admin/users' &&
    method === 'GET'
  ) {
    const admin = await requireAdmin(req, res);

    if (!admin) {
      return true;
    }

    const { data, error } = await supabase
      .from('usuarios')
      .select(
        'id,username,email,minutos,plano,bloqueado,created_at'
      )
      .order('created_at', {
        ascending: false
      });

    if (error) {
      sendJson(res, 500, {
        ok: false,
        error: error.message
      });

      return true;
    }

    sendJson(res, 200, {
      ok: true,
      users: data || []
    });

    return true;
  }

  /*
    Editar usuário.
  */
  if (
    pathname.startsWith('/api/admin/users/') &&
    method === 'PUT'
  ) {
    try {
      const admin = await requireAdmin(req, res);

      if (!admin) {
        return true;
      }

      const id = getRouteId(
        req,
        '/api/admin/users/'
      );

      const body = await readJson(req);

      const update = {};

      if (body.username !== undefined) {
        update.username =
          normalizeUsername(body.username);
      }

      if (body.email !== undefined) {
        update.email =
          normalizeEmail(body.email);
      }

      if (body.plano !== undefined) {
        update.plano =
          String(body.plano).trim();
      }

      if (body.bloqueado !== undefined) {
        update.bloqueado =
          Boolean(body.bloqueado);
      }

      if (body.password) {
        update.password =
          hashPassword(body.password);
      }

      if (body.minutos !== undefined) {
        const minutos = Number(body.minutos);

        if (
          !Number.isInteger(minutos) ||
          minutos < 0
        ) {
          sendJson(res, 400, {
            ok: false,
            error: 'Quantidade de minutos inválida.'
          });

          return true;
        }

        update.minutos = minutos;
      }

      const { data, error } = await supabase
        .from('usuarios')
        .update(update)
        .eq('id', id)
        .select(
          'id,username,email,minutos,plano,bloqueado,created_at'
        )
        .single();

      if (error) {
        sendJson(res, 400, {
          ok: false,
          error: error.message
        });

        return true;
      }

      sendJson(res, 200, {
        ok: true,
        user: data
      });

      return true;

    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: error.message
      });

      return true;
    }
  }

  /*
    Adicionar/remover minutos.
  */
  if (
    pathname.startsWith('/api/admin/users/') &&
    pathname.endsWith('/minutes') &&
    method === 'POST'
  ) {
    try {
      const admin = await requireAdmin(req, res);

      if (!admin) {
        return true;
      }

      const id = pathname
        .replace('/api/admin/users/', '')
        .replace('/minutes', '')
        .replace(/^\/+|\/+$/g, '');

      const body = await readJson(req);

      const quantidade = Number(
        body.minutos ??
        body.quantidade ??
        body.amount
      );

      if (
        !Number.isInteger(quantidade)
      ) {
        sendJson(res, 400, {
          ok: false,
          error: 'Quantidade inválida.'
        });

        return true;
      }

      const { data: user, error } =
        await supabase
          .from('usuarios')
          .select('id,minutos')
          .eq('id', id)
          .single();

      if (error || !user) {
        sendJson(res, 404, {
          ok: false,
          error: 'Usuário não encontrado.'
        });

        return true;
      }

      const novoSaldo =
        Number(user.minutos || 0) +
        quantidade;

      if (novoSaldo < 0) {
        sendJson(res, 400, {
          ok: false,
          error: 'O saldo não pode ficar negativo.'
        });

        return true;
      }

      const { data, error: updateError } =
        await supabase
          .from('usuarios')
          .update({
            minutos: novoSaldo
          })
          .eq('id', id)
          .select(
            'id,username,email,minutos,plano,bloqueado'
          )
          .single();

      if (updateError) {
        sendJson(res, 400, {
          ok: false,
          error: updateError.message
        });

        return true;
      }

      sendJson(res, 200, {
        ok: true,
        user: data
      });

      return true;

    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: error.message
      });

      return true;
    }
  }

  /*
    =========================================================
    ADMIN - CONFIGURAÇÃO DE PAGAMENTO
    =========================================================
  */

  if (
    pathname === '/api/admin/payment-config' &&
    method === 'GET'
  ) {
    const admin = await requireAdmin(req, res);

    if (!admin) {
      return true;
    }

    try {
      const config = await getStoreConfig();

      sendJson(res, 200, {
        ok: true,
        config: {
          id: config.id,
          pix_ativo: Boolean(config.pix_ativo),
          cartao_ativo: Boolean(config.cartao_ativo),
          infinitepay_ativo: Boolean(
            config.infinitepay_ativo
          ),
          infinitepay_handle:
            config.infinitepay_handle || ''
        }
      });

      return true;

    } catch (error) {
      sendJson(res, 500, {
        ok: false,
        error: error.message
      });

      return true;
    }
  }

  if (
    pathname === '/api/admin/payment-config' &&
    method === 'PUT'
  ) {
    try {
      const admin = await requireAdmin(req, res);

      if (!admin) {
        return true;
      }

      const body = await readJson(req);

      const update = {
        updated_at: new Date().toISOString()
      };

      if (body.pix_ativo !== undefined) {
        update.pix_ativo =
          Boolean(body.pix_ativo);
      }

      if (body.cartao_ativo !== undefined) {
        update.cartao_ativo =
          Boolean(body.cartao_ativo);
      }

      if (body.infinitepay_ativo !== undefined) {
        update.infinitepay_ativo =
          Boolean(body.infinitepay_ativo);
      }

      if (
        body.infinitepay_handle !== undefined
      ) {
        update.infinitepay_handle =
          String(
            body.infinitepay_handle || ''
          )
            .trim()
            .replace(/^\$/, '');
      }

      const { data, error } = await supabase
        .from('configuracoes_loja')
        .upsert({
          id: 1,
          ...update
        })
        .select()
        .single();

      if (error) {
        sendJson(res, 400, {
          ok: false,
          error: error.message
        });

        return true;
      }

      sendJson(res, 200, {
        ok: true,
        config: data
      });

      return true;

    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: error.message
      });

      return true;
    }
  }

  /*
    =========================================================
    ADMIN - PEDIDOS
    =========================================================
  */

  if (
    pathname === '/api/admin/orders' &&
    method === 'GET'
  ) {
    const admin = await requireAdmin(req, res);

    if (!admin) {
      return true;
    }

    const { data, error } = await supabase
      .from('pedidos')
      .select(
        'id,usuario_id,valor,status,created_at'
      )
      .order('created_at', {
        ascending: false
      });

    sendJson(res, 200, {
      ok: true,
      orders: data || []
    });

    return true;
  }

  /*
    =========================================================
    ADMIN - DASHBOARD
    =========================================================
  */

  if (
    pathname === '/api/admin/dashboard' &&
    method === 'GET'
  ) {
    const admin = await requireAdmin(req, res);

    if (!admin) {
      return true;
    }

    try {
      const [
        usersResult,
        activePaymentsResult,
        paidOrdersResult
      ] = await Promise.all([
        supabase
          .from('usuarios')
          .select('id', {
            count: 'exact',
            head: true
          }),

        supabase
          .from('pagamentos')
          .select('id', {
            count: 'exact',
            head: true
          })
          .eq('status', 'pendente'),

        supabase
          .from('pedidos')
          .select('valor')
          .eq('status', 'pago')
      ]);

      const totalUsuarios =
        usersResult.count || 0;

      const pagamentosPendentes =
        activePaymentsResult.count || 0;

      const vendas = paidOrdersResult.data || [];

      const totalVendas = vendas.reduce(
        (sum, item) =>
          sum + Number(item.valor || 0),
        0
      );

      sendJson(res, 200, {
        ok: true,
        dashboard: {
          totalUsuarios,
          pagamentosPendentes,
          pedidosPagos: vendas.length,
          totalVendas,
activeServers: streamAgents.size
        }
      });

      return true;

    } catch (error) {
      sendJson(res, 500, {
        ok: false,
        error: error.message
      });

      return true;
    }
  }

  return false;
}

/* =========================================================
   ARQUIVOS DO SITE
========================================================= */

function safeStaticPath(req) {
  let pathname = routePath(req);

  if (pathname === '/') {
    pathname = '/index.html';
  }

  /*
    Evita ../.
  */
  pathname = pathname.replace(/\0/g, '');

  const filePath = path.resolve(
    __dirname,
    `.${pathname}`
  );

  const root = path.resolve(__dirname);

  if (
    filePath !== root &&
    !filePath.startsWith(`${root}${path.sep}`)
  ) {
    return null;
  }

  return filePath;
}

function serveStatic(req, res) {
  const filePath = safeStaticPath(req);

  if (!filePath) {
    sendText(res, 403, 'Acesso negado.');
    return;
  }

  if (!fs.existsSync(filePath)) {
    sendText(res, 404, 'Página não encontrada.');
    return;
  }

  const stat = fs.statSync(filePath);

  if (!stat.isFile()) {
    sendText(res, 404, 'Página não encontrada.');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();

  const mimeType =
    mimeTypes[ext] ||
    'application/octet-stream';

  res.writeHead(200, {
    'Content-Type': mimeType
  });

  fs.createReadStream(filePath).pipe(res);
}

/* =========================================================
   SERVIDOR
========================================================= */

const server = http.createServer(
  async (req, res) => {
    try {
      const pathname = routePath(req);

      if (pathname.startsWith('/api/')) {
        const handled =
          await handleApi(req, res);

        if (!handled) {
          sendJson(res, 404, {
            ok: false,
            error: 'API não encontrada.'
          });
        }

        return;
      }

      if (
        req.method !== 'GET' &&
        req.method !== 'HEAD'
      ) {
        sendText(
          res,
          405,
          'Método não permitido.'
        );

        return;
      }

      serveStatic(req, res);

    } catch (error) {
      console.error(
        'Erro interno:',
        error
      );

      if (!res.headersSent) {
        sendJson(res, 500, {
          ok: false,
          error: 'Erro interno do servidor.'
        });
      } else {
        res.end();
      }
    }
  }
);

server.listen(
  PORT,
  () => {
    console.log(
      `🚀 Império GamePlay rodando na porta ${PORT}`
    );

    console.log(
      `🌐 URL pública: ${PUBLIC_URL}`
    );

    console.log(
      `☁️ Banco: Supabase`
    );

    console.log(
      `💳 Pagamento: InfinitePay`
    );
  }
);
