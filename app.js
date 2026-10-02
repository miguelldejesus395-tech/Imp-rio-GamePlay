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
/* =========================================================
   ADMIN
========================================================= */

async function verificarAdmin() {
  if (!verificarAutenticacao()) {
    return false;
  }

  if (role !== 'admin') {
    try {
      const data =
        await obterUsuario();

      if (data.role !== 'admin') {
        window.location.href =
          'usuario.html';

        return false;
      }

      role = 'admin';

    } catch (_) {
      window.location.href =
        'index.html';

      return false;
    }
  }

  return true;
}

async function carregarAdminDashboard() {
  if (!(await verificarAdmin())) {
    return null;
  }

  try {
    const data =
      await api('/admin/dashboard');

    window.IGC_ADMIN_DASHBOARD =
      data;

    preencherDashboardAdmin(data);

    return data;

  } catch (error) {
    message(
      error.message ||
      'Erro ao carregar painel administrativo.',
      true
    );

    return null;
  }
}

function preencherDashboardAdmin(data) {
  if (!data) return;

  const stats =
    data.stats ||
    data;

  const valores = {
    totalUsers:
      stats.total_users ??
      stats.totalUsers ??
      stats.usuarios ??
      0,

    activeServers:
      stats.active_servers ??
      stats.activeServers ??
      0,

    orders:
      stats.orders ??
      stats.pedidos ??
      0,

    sales:
      stats.sales ??
      stats.vendas ??
      0
  };

  Object.entries(valores)
    .forEach(([id, value]) => {
      const node = el(id);

      if (node) {
        node.textContent =
          id === 'sales'
            ? formatarMoeda(value)
            : String(value);
      }
    });
}

async function carregarUsuariosAdmin() {
  if (!(await verificarAdmin())) {
    return [];
  }

  try {
    const data =
      await api('/admin/users');

    const usuarios =
      data.users ||
      data.usuarios ||
      [];

    window.IGC_ADMIN_USERS =
      usuarios;

    document.dispatchEvent(
      new CustomEvent(
        'igc:admin-users',
        {
          detail: usuarios
        }
      )
    );

    return usuarios;

  } catch (error) {
    message(
      error.message ||
      'Erro ao carregar usuários.',
      true
    );

    return [];
  }
}

async function editarUsuarioAdmin(
  id,
  dados
) {
  if (!(await verificarAdmin())) {
    return null;
  }

  return api(
    `/admin/users/${encodeURIComponent(id)}`,
    {
      method: 'PUT',
      body: JSON.stringify(dados)
    }
  );
}

async function adicionarMinutosAdmin(
  id,
  minutos
) {
  if (!(await verificarAdmin())) {
    return null;
  }

  return api(
    `/admin/users/${encodeURIComponent(id)}/minutes`,
    {
      method: 'POST',
      body: JSON.stringify({
        minutos: Number(minutos)
      })
    }
  );
}

/* =========================================================
   ADICIONAR MINUTOS POR E-MAIL
========================================================= */

async function adicionarMinutosAdminPorEmail(
  email,
  minutos
) {
  if (!(await verificarAdmin())) {
    return null;
  }

  const emailNormalizado =
    String(email || '')
      .trim()
      .toLowerCase();

  if (!emailNormalizado) {
    throw new Error(
      'Informe o e-mail do usuário.'
    );
  }

  const minutosNumero =
    Number(minutos);

  if (
    !Number.isFinite(minutosNumero) ||
    minutosNumero <= 0
  ) {
    throw new Error(
      'Informe uma quantidade de minutos válida.'
    );
  }

  let usuarios =
    Array.isArray(window.IGC_ADMIN_USERS)
      ? window.IGC_ADMIN_USERS
      : [];

  if (!usuarios.length) {
    usuarios =
      await carregarUsuariosAdmin();
  }

  const usuario =
    usuarios.find(item =>
      String(
        item.email ||
        item.emailAddress ||
        ''
      )
        .trim()
        .toLowerCase() ===
      emailNormalizado
    );

  if (!usuario) {
    throw new Error(
      'Nenhum usuário encontrado com esse e-mail.'
    );
  }

  const id =
    usuario.id ||
    usuario.userId ||
    usuario._id;

  if (!id) {
    throw new Error(
      'O usuário encontrado não possui um ID válido.'
    );
  }

  return adicionarMinutosAdmin(
    id,
    minutosNumero
  );
}

async function carregarPedidosAdmin() {
  if (!(await verificarAdmin())) {
    return [];
  }

  try {
    const data =
      await api('/admin/orders');

    const pedidos =
      data.orders ||
      data.pedidos ||
      [];

    window.IGC_ADMIN_ORDERS =
      pedidos;

    return pedidos;

  } catch (error) {
    message(
      error.message ||
      'Erro ao carregar pedidos.',
      true
    );

    return [];
  }
}

/* =========================================================
   PACOTES ADMIN
========================================================= */

async function carregarPacotesAdmin() {
  if (!(await verificarAdmin())) {
    return [];
  }

  try {
    const data =
      await api('/admin/packages');

    const pacotes =
      data.packages ||
      data.pacotes ||
      [];

    window.IGC_ADMIN_PACKAGES =
      pacotes;

    return pacotes;

  } catch (error) {
    message(
      error.message ||
      'Erro ao carregar pacotes.',
      true
    );

    return [];
  }
}

async function criarPacoteAdmin(
  dados
) {
  if (!(await verificarAdmin())) {
    return null;
  }

  return api('/admin/packages', {
    method: 'POST',
    body: JSON.stringify(dados)
  });
}

async function editarPacoteAdmin(
  id,
  dados
) {
  if (!(await verificarAdmin())) {
    return null;
  }

  return api(
    `/admin/packages/${encodeURIComponent(id)}`,
    {
      method: 'PUT',
      body: JSON.stringify(dados)
    }
  );
}

async function excluirPacoteAdmin(
  id
) {
  if (!(await verificarAdmin())) {
    return null;
  }

  return api(
    `/admin/packages/${encodeURIComponent(id)}`,
    {
      method: 'DELETE'
    }
  );
}

/* =========================================================
   CONFIGURAÇÃO DE PAGAMENTO
========================================================= */

async function carregarConfiguracaoPagamento() {
  if (!(await verificarAdmin())) {
    return null;
  }

  try {
    const data =
      await api('/admin/payment-config');

    window.IGC_PAYMENT_CONFIG =
      data.config ||
      data.configuration ||
      data;

    return window.IGC_PAYMENT_CONFIG;

  } catch (error) {
    message(
      error.message ||
      'Erro ao carregar configuração de pagamento.',
      true
    );

    return null;
  }
}

async function salvarConfiguracaoPagamento(
  dados
) {
  if (!(await verificarAdmin())) {
    return null;
  }

  try {
    const data =
      await api(
        '/admin/payment-config',
        {
          method: 'PUT',
          body: JSON.stringify(dados)
        }
      );

    window.IGC_PAYMENT_CONFIG =
      data.config ||
      data.configuration ||
      data;

    message(
      'Configuração de pagamento salva.'
    );

    return data;

  } catch (error) {
    message(
      error.message ||
      'Não foi possível salvar a configuração.',
      true
    );

    return null;
  }
}
/* =========================================================
   UTILITÁRIOS PARA FORMULÁRIOS
========================================================= */

function pegarValor(
  id,
  fallback = ''
) {
  const node = el(id);

  return node
    ? node.value
    : fallback;
}

function pegarNumero(
  id,
  fallback = 0
) {
  const value =
    Number(
      pegarValor(id, fallback)
    );

  return Number.isFinite(value)
    ? value
    : fallback;
}

function pegarCheckbox(
  id,
  fallback = false
) {
  const node = el(id);

  return node
    ? !!node.checked
    : fallback;
}

/* =========================================================
   FORMULÁRIO DE PACOTE ADMIN
========================================================= */

async function salvarPacoteDoFormulario(
  id = null
) {
  const dados = {
    nome: pegarValor(
      'packageName',
      pegarValor('nomePacote')
    ),

    minutos: pegarNumero(
      'packageMinutes',
      pegarNumero('minutosPacote')
    ),

    preco: pegarNumero(
      'packagePrice',
      pegarNumero('precoPacote')
    ),

    descricao: pegarValor(
      'packageDescription',
      pegarValor('descricaoPacote')
    ),

    ativo: pegarCheckbox(
      'packageActive',
      true
    ),

    ordem: pegarNumero(
      'packageOrder',
      0
    )
  };

  if (!dados.nome) {
    message(
      'Informe o nome do pacote.',
      true
    );

    return;
  }

  if (dados.minutos <= 0) {
    message(
      'Informe uma quantidade válida de minutos.',
      true
    );

    return;
  }

  if (dados.preco < 0) {
    message(
      'Informe um preço válido.',
      true
    );

    return;
  }

  try {
    if (id) {
      await editarPacoteAdmin(
        id,
        dados
      );

      message(
        'Pacote atualizado com sucesso.'
      );

    } else {
      await criarPacoteAdmin(
        dados
      );

      message(
        'Pacote criado com sucesso.'
      );
    }

    await carregarPacotesAdmin();

  } catch (error) {
    message(
      error.message ||
      'Erro ao salvar pacote.',
      true
    );
  }
}

/* =========================================================
   FORMULÁRIO DE CONFIGURAÇÃO INFINITEPAY
========================================================= */

async function salvarInfinitePay() {
  const dados = {
    infinitepay_ativo:
      pegarCheckbox(
        'infinitepayActive',
        pegarCheckbox(
          'infinitepayAtivo',
          false
        )
      ),

    infinitepay_handle:
      pegarValor(
        'infinitepayHandle',
        pegarValor(
          'infinitepay_handle'
        )
      ).trim(),

    pix_ativo:
      pegarCheckbox(
        'pixActive',
        pegarCheckbox(
          'pixAtivo',
          true
        )
      ),

    cartao_ativo:
      pegarCheckbox(
        'cardActive',
        pegarCheckbox(
          'cartaoAtivo',
          true
        )
      )
  };

  await salvarConfiguracaoPagamento(
    dados
  );
}

/* =========================================================
   INICIALIZAÇÃO AUTOMÁTICA
========================================================= */

document.addEventListener(
  'DOMContentLoaded',
  () => {

    const loginForm =
      el('loginForm') ||
      el('formLogin');

    if (loginForm) {
      loginForm.addEventListener(
        'submit',
        fazerLogin
      );
    }

    const registerForm =
      el('registerForm') ||
      el('formRegister') ||
      el('cadastroForm');

    if (registerForm) {
      registerForm.addEventListener(
        'submit',
        registrar
      );
    }

    const logoutButtons =
      document.querySelectorAll(
        '[data-action="logout"], .logout-button, #logout'
      );

    logoutButtons.forEach(
      button => {
        button.addEventListener(
          'click',
          logout
        );
      }
    );

    if (
      document.body &&
      (
        document.body.dataset.page === 'usuario' ||
        window.location.pathname.endsWith(
          'usuario.html'
        )
      )
    ) {
      iniciarPainelUsuario();
    }

    if (
      document.body &&
      (
        document.body.dataset.page === 'admin' ||
        window.location.pathname.endsWith(
          'admin.html'
        )
      )
    ) {
      carregarAdminDashboard();
      carregarUsuariosAdmin();
      carregarPedidosAdmin();
      carregarPacotesAdmin();
      carregarConfiguracaoPagamento();
    }
  }
);

/* =========================================================
   COMPATIBILIDADE COM HTML ANTIGO
========================================================= */

window.api = api;
window.el = el;
window.show = show;
window.message = message;
window.logout = logout;
window.verificarAutenticacao =
  verificarAutenticacao;
window.fazerLogin = fazerLogin;
window.registrar = registrar;
window.carregarUsuario =
  carregarUsuario;
window.carregarPacotes =
  carregarPacotes;
window.comprarPacote =
  comprarPacote;
window.carregarPedidos =
  carregarPedidos;
window.carregarAdminDashboard =
  carregarAdminDashboard;
window.carregarUsuariosAdmin =
  carregarUsuariosAdmin;
window.editarUsuarioAdmin =
  editarUsuarioAdmin;
window.adicionarMinutosAdmin =
  adicionarMinutosAdmin;
window.adicionarMinutosAdminPorEmail =
  adicionarMinutosAdminPorEmail;
window.carregarPedidosAdmin =
  carregarPedidosAdmin;
window.carregarPacotesAdmin =
  carregarPacotesAdmin;
window.criarPacoteAdmin =
  criarPacoteAdmin;
window.editarPacoteAdmin =
  editarPacoteAdmin;
window.excluirPacoteAdmin =
  excluirPacoteAdmin;
window.carregarConfiguracaoPagamento =
  carregarConfiguracaoPagamento;
window.salvarConfiguracaoPagamento =
  salvarConfiguracaoPagamento;
window.salvarPacoteDoFormulario =
  salvarPacoteDoFormulario;
window.salvarInfinitePay =
  salvarInfinitePay;
window.formatarMinutos =
  formatarMinutos;
window.formatarMoeda =
  formatarMoeda;
