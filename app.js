'use strict';

const API_BASE = '/api';

let token =
  localStorage.getItem('igc_token') ||
  sessionStorage.getItem('igc_token') ||
  '';

let role =
  localStorage.getItem('igc_role') ||
  sessionStorage.getItem('igc_role') ||
  '';

function el(id) {
  return document.getElementById(id);
}

function show(page) {
  document.querySelectorAll('.page').forEach(section => {
    section.classList.toggle('active', section.id === page);
  });
}

function message(text, isError = false) {
  const node =
    el('message') ||
    el('messageRegister') ||
    el('messageLogin');

  if (!node) {
    if (text) alert(text);
    return;
  }

  node.textContent = text || '';
  node.className = isError ? 'error' : 'success';

  setTimeout(() => {
    node.textContent = '';
    node.className = '';
  }, 4000);
}

async function api(endpoint, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(
    `${API_BASE}/${String(endpoint).replace(/^\/+/, '')}`,
    {
      ...options,
      headers
    }
  );

  let data = {};

  try {
    data = await response.json();
  } catch (_) {
    data = {};
  }

  if (!response.ok) {
    throw new Error(
      data.error ||
      data.message ||
      'Erro na comunicação com o servidor.'
    );
  }

  return data;
}

function salvarSessao(novoToken, novoRole = 'user', lembrar = true) {
  token = novoToken || '';
  role = novoRole || 'user';

  const storage = lembrar ? localStorage : sessionStorage;
  const otherStorage = lembrar ? sessionStorage : localStorage;

  otherStorage.removeItem('igc_token');
  otherStorage.removeItem('igc_role');

  storage.setItem('igc_token', token);
  storage.setItem('igc_role', role);
}

function limparSessao() {
  token = '';
  role = '';

  localStorage.removeItem('igc_token');
  localStorage.removeItem('igc_role');

  sessionStorage.removeItem('igc_token');
  sessionStorage.removeItem('igc_role');
}

function logout() {
  const oldToken = token;

  limparSessao();

  if (oldToken) {
    fetch(`${API_BASE}/logout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${oldToken}`
      }
    }).catch(() => {});
  }

  window.location.href = 'index.html';
}

function verificarAutenticacao() {
  if (!token) {
    window.location.href = 'index.html';
    return false;
  }

  return true;
}

function formatarMinutos(minutos) {
  const total = Math.max(0, Number(minutos) || 0);
  const horas = Math.floor(total / 60);
  const minutosRestantes = total % 60;

  if (horas > 0) {
    return `${horas}h ${minutosRestantes}m`;
  }

  return `${minutosRestantes}m`;
}

function formatarMoeda(valor) {
  return Number(valor || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
}

function escaparHTML(valor) {
  return String(valor ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

/* =========================================================
   LOGIN
========================================================= */

async function fazerLogin(event) {
  if (event) event.preventDefault();

  const userInput =
    el('username') ||
    el('user') ||
    el('login') ||
    el('email');

  const passwordInput =
    el('password') ||
    el('senha') ||
    el('pass');

  const lembrarInput =
    el('remember') ||
    el('lembrar');

  const user = userInput ? userInput.value.trim() : '';
  const pass = passwordInput ? passwordInput.value : '';
  const lembrar = lembrarInput ? lembrarInput.checked : true;

  if (!user || !pass) {
    message('Informe usuário/e-mail e senha.', true);
    return;
  }

  try {
    const data = await api('/login', {
      method: 'POST',
      body: JSON.stringify({
        user,
        pass
      })
    });

    if (!data.token) {
      throw new Error(
        'O servidor não retornou um token de sessão.'
      );
    }

    salvarSessao(
      data.token,
      data.role || 'user',
      lembrar
    );

    message('Login realizado com sucesso.');

    setTimeout(() => {
      if ((data.role || role) === 'admin') {
        window.location.href = 'admin.html';
      } else {
        window.location.href = 'usuario.html';
      }
    }, 300);

  } catch (error) {
    message(
      error.message ||
      'E-mail/usuário ou senha incorretos.',
      true
    );
  }
}

/* =========================================================
   CADASTRO
========================================================= */

async function registrar(event) {
  if (event) event.preventDefault();

  const usernameInput =
    el('registerUsername') ||
    el('regUsername') ||
    el('username');

  const emailInput =
    el('registerEmail') ||
    el('regEmail') ||
    el('email');

  const passwordInput =
    el('registerPassword') ||
    el('regPassword') ||
    el('password');

  const confirmInput =
    el('confirmPassword') ||
    el('registerConfirmPassword') ||
    el('regConfirmPassword');

  const username =
    usernameInput
      ? usernameInput.value.trim()
      : '';

  const email =
    emailInput
      ? emailInput.value.trim()
      : '';

  const password =
    passwordInput
      ? passwordInput.value
      : '';

  const confirm =
    confirmInput
      ? confirmInput.value
      : password;

  if (!username || !email || !password) {
    message(
      'Preencha usuário, e-mail e senha.',
      true
    );
    return;
  }

  if (username.length < 3) {
    message(
      'O usuário deve ter pelo menos 3 caracteres.',
      true
    );
    return;
  }

  if (password.length < 6) {
    message(
      'A senha deve ter pelo menos 6 caracteres.',
      true
    );
    return;
  }

  if (password !== confirm) {
    message(
      'As senhas não conferem.',
      true
    );
    return;
  }

  try {
    message('Criando sua conta...');

    const data = await api('/register', {
      method: 'POST',
      body: JSON.stringify({
        username,
        email,
        password
      })
    });

    message(
      data.message ||
      'Conta criada com sucesso!'
    );

    setTimeout(() => {
      show('login');
    }, 800);

  } catch (error) {
    message(
      error.message ||
      'Não foi possível criar a conta.',
      true
    );
  }
}

/* =========================================================
   USUÁRIO LOGADO
========================================================= */

async function obterUsuario() {
  return api('/me');
}

async function carregarUsuario() {
  if (!verificarAutenticacao()) return null;

  try {
    const data = await obterUsuario();

    const usuario =
      data.user ||
      data.usuario ||
      data;

    preencherDadosUsuario(usuario);

    return usuario;

  } catch (error) {
    limparSessao();
    window.location.href = 'index.html';
    return null;
  }
}

function preencherDadosUsuario(usuario) {
  if (!usuario) return;

  const nome =
    usuario.username ||
    usuario.nome ||
    usuario.user ||
    'Usuário';

  const email =
    usuario.email ||
    '';

  const minutos =
    Number(usuario.minutos || 0);

  const plano =
    usuario.plano ||
    'Nenhum';

  const elementosNome = [
    'userName',
    'usernameDisplay',
    'nomeUsuario',
    'welcomeName'
  ];

  elementosNome.forEach(id => {
    const node = el(id);

    if (node) {
      node.textContent = nome;
    }
  });

  const elementosEmail = [
    'userEmail',
    'emailDisplay',
    'emailUsuario'
  ];

  elementosEmail.forEach(id => {
    const node = el(id);

    if (node) {
      node.textContent = email;
    }
  });

  const elementosMinutos = [
    'minutes',
    'minutos',
    'userMinutes',
    'saldoMinutos',
    'minutesBalance'
  ];

  elementosMinutos.forEach(id => {
    const node = el(id);

    if (node) {
      node.textContent =
        formatarMinutos(minutos);
    }
  });

  const elementosPlano = [
    'plan',
    'userPlan',
    'plano',
    'currentPlan'
  ];

  elementosPlano.forEach(id => {
    const node = el(id);

    if (node) {
      node.textContent = plano;
    }
  });
}

/* =========================================================
   PACOTES
========================================================= */

async function carregarPacotes() {
  try {
    const data = await api('/packages');

    const pacotes =
      data.packages ||
      data.pacotes ||
      [];

    window.IGC_PACKAGES = pacotes;

    document.dispatchEvent(
      new CustomEvent('igc:packages', {
        detail: pacotes
      })
    );

    return pacotes;

  } catch (error) {
    console.error(
      'Erro ao carregar pacotes:',
      error
    );

    return [];
  }
}

function renderizarPacotes(
  container,
  pacotes
) {
  if (!container) return;

  if (!pacotes.length) {
    container.innerHTML = `
      <div class="empty-state">
        Nenhum pacote disponível no momento.
      </div>
    `;

    return;
  }

  container.innerHTML =
    pacotes.map(pacote => `
      <article
        class="package-card"
        data-package-id="${escaparHTML(pacote.id)}"
      >

        <div class="package-name">
          ${escaparHTML(
            pacote.nome ||
            pacote.name ||
            'Pacote'
          )}
        </div>

        <div class="package-price">
          ${formatarMoeda(
            pacote.preco ??
            pacote.price ??
            0
          )}
        </div>

        <div class="package-minutes">
          ${escaparHTML(
            formatarMinutos(
              pacote.minutos || 0
            )
          )}
        </div>

        <div class="package-description">
          ${escaparHTML(
            pacote.descricao ||
            pacote.description ||
            ''
          )}
        </div>

        <button
          type="button"
          class="btn-buy"
          onclick="comprarPacote('${escaparHTML(pacote.id)}')"
        >
          Comprar
        </button>

      </article>
    `).join('');
}

/* =========================================================
   COMPRA / CHECKOUT
========================================================= */

async function comprarPacote(pacoteId) {
  if (!verificarAutenticacao()) return;

  if (!pacoteId) {
    message(
      'Pacote inválido.',
      true
    );

    return;
  }

  try {
    message(
      'Preparando pagamento...'
    );

    const data = await api('/orders', {
      method: 'POST',
      body: JSON.stringify({
        pacote_id: pacoteId
      })
    });

    if (data.checkout_url) {
      window.location.href =
        data.checkout_url;

      return;
    }

    if (data.url) {
      window.location.href =
        data.url;

      return;
    }

    message(
      data.message ||
      'Pedido criado. Aguarde a confirmação do pagamento.'
    );

  } catch (error) {
    message(
      error.message ||
      'Não foi possível iniciar o pagamento.',
      true
    );
  }
}

/* =========================================================
   PEDIDOS DO USUÁRIO
========================================================= */

async function carregarPedidos() {
  if (!verificarAutenticacao()) {
    return [];
  }

  try {
    const data =
      await api('/orders');

    const pedidos =
      data.orders ||
      data.pedidos ||
      [];

    window.IGC_ORDERS =
      pedidos;

    document.dispatchEvent(
      new CustomEvent('igc:orders', {
        detail: pedidos
      })
    );

    return pedidos;

  } catch (error) {
    console.error(
      'Erro ao carregar pedidos:',
      error
    );

    return [];
  }
}

/* =========================================================
   PAINEL DO USUÁRIO
========================================================= */

async function iniciarPainelUsuario() {
  if (!verificarAutenticacao()) {
    return;
  }

  const usuario =
    await carregarUsuario();

  if (!usuario) return;

  const pacotes =
    await carregarPacotes();

  const packageContainer =
    el('packages') ||
    el('packagesGrid') ||
    el('plansGrid') ||
    el('pacotes');

  if (packageContainer) {
    renderizarPacotes(
      packageContainer,
      pacotes
    );
  }

  await carregarPedidos();

  verificarRetornoPagamento();
}

/* =========================================================
   RETORNO DO PAGAMENTO
========================================================= */

function verificarRetornoPagamento() {
  const params =
    new URLSearchParams(
      window.location.search
    );

  const status = (
    params.get('pagamento') ||
    params.get('payment') ||
    params.get('status') ||
    ''
  ).toLowerCase();

  if (
    status === 'sucesso' ||
    status === 'success' ||
    status === 'paid'
  ) {
    message(
      'Pagamento recebido. Os minutos serão liberados após a confirmação.'
    );
  }
}
