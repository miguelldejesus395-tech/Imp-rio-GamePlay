'use strict';

const API_BASE = '/api';

function api(path, options = {}) {
  const token =
    localStorage.getItem('igc_token') ||
    sessionStorage.getItem('igc_token');

  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return fetch(
    `${API_BASE}${path}`,
    {
      ...options,
      headers
    }
  ).then(async response => {
    const text = await response.text();

    let data = {};

    try {
      data = text
        ? JSON.parse(text)
        : {};
    } catch {
      data = {
        message: text
      };
    }

    if (!response.ok) {
      throw new Error(
        data.message ||
        data.error ||
        'Erro na comunicação com o servidor.'
      );
    }

    return data;
  });
}

function el(id) {
  return document.getElementById(id);
}

function show(id, visible = true) {
  const node = el(id);

  if (!node) {
    return;
  }

  node.style.display =
    visible ? '' : 'none';
}

function message(text, isError = false) {
  const node =
    el('message') ||
    el('messageRegister') ||
    el('messageLogin');

  if (!node) {
    return;
  }

  node.textContent = text || '';

  node.style.color =
    isError
      ? '#ff5c7a'
      : '';
}

function salvarToken(token, lembrar = true) {
  localStorage.removeItem('igc_token');
  sessionStorage.removeItem('igc_token');

  if (!token) {
    return;
  }

  const storage =
    lembrar
      ? localStorage
      : sessionStorage;

  storage.setItem(
    'igc_token',
    token
  );
}

function obterToken() {
  return (
    localStorage.getItem('igc_token') ||
    sessionStorage.getItem('igc_token') ||
    ''
  );
}

function limparToken() {
  localStorage.removeItem(
    'igc_token'
  );

  sessionStorage.removeItem(
    'igc_token'
  );
}

async function verificarAutenticacao() {
  const token = obterToken();

  if (!token) {
    return null;
  }

  try {
    const data =
      await api('/me');

    return (
      data.user ||
      data.usuario ||
      data
    );

  } catch {
    limparToken();
    return null;
  }
}

async function verificarAdmin() {
  const token = obterToken();

  if (!token) {
    return false;
  }

  try {
    const data =
      await api('/me');

    const role =
      data.role ||
      data.user?.role ||
      data.usuario?.role;

    return role === 'admin';

  } catch {
    return false;
  }
}

async function fazerLogin(
  event
) {
  if (event) {
    event.preventDefault();
  }

  const user =
    (
      el('loginUser') ||
      el('username') ||
      el('email')
    )?.value.trim() || '';

  const pass =
    (
      el('loginPassword') ||
      el('password')
    )?.value || '';

  const lembrar =
    el('rememberMe')
      ? el('rememberMe').checked
      : true;

  if (!user || !pass) {
    message(
      'Informe usuário/e-mail e senha.',
      true
    );
    return;
  }

  try {
    const data =
      await api(
        '/login',
        {
          method: 'POST',
          body: JSON.stringify({
            user,
            email: user,
            username: user,
            pass,
            password: pass
          })
        }
      );

    salvarToken(
      data.token,
      lembrar
    );

    const role =
      data.role ||
      data.user?.role ||
      data.usuario?.role;

    if (role === 'admin') {
      window.location.href =
        'admin.html';
      return;
    }

    window.location.href =
      'usuario.html';

  } catch (error) {
    message(
      error.message ||
      'E-mail ou senha incorretos.',
      true
    );
  }
}
async function registrar(
  event
) {
  if (event) {
    event.preventDefault();
  }

  const username =
    el('registerUsername')?.value.trim() ||
    '';

  const email =
    el('registerEmail')?.value.trim() ||
    '';

  const password =
    el('registerPassword')?.value ||
    '';

  const confirmPassword =
    el('confirmPassword')?.value ||
    '';

  if (!username || !email || !password) {
    message(
      'Preencha todos os campos.',
      true
    );
    return;
  }

  if (password !== confirmPassword) {
    message(
      'As senhas não conferem.',
      true
    );
    return;
  }

  try {
    await api(
      '/register',
      {
        method: 'POST',
        body: JSON.stringify({
          username,
          email,
          password
        })
      }
    );

    message(
      'Conta criada com sucesso!'
    );

    const loginEmail =
      el('loginUser') ||
      el('email');

    if (loginEmail) {
      loginEmail.value =
        email;
    }

    const loginPassword =
      el('loginPassword') ||
      el('password');

    if (loginPassword) {
      loginPassword.value =
        password;
    }

  } catch (error) {
    message(
      error.message ||
      'Não foi possível criar a conta.',
      true
    );
  }
}

async function logout() {
  limparToken();

  window.location.href =
    'index.html';
}

async function carregarUsuario() {
  try {
    const data =
      await api('/me');

    const usuario =
      data.user ||
      data.usuario ||
      data;

    window.IGC_USER =
      usuario;

    const valores = {
      username:
        usuario.username ||
        usuario.nome ||
        '',
      email:
        usuario.email ||
        '',
      minutes:
        usuario.minutes ??
        usuario.minutos ??
        0,
      saldo:
        usuario.saldo ??
        0
    };

    Object.entries(valores)
      .forEach(
        ([id, value]) => {
          const node =
            el(id);

          if (node) {
            node.textContent =
              String(value);
          }
        }
      );

    return usuario;

  } catch (error) {
    message(
      error.message ||
      'Não foi possível carregar o usuário.',
      true
    );

    return null;
  }
}

async function carregarPacotes() {
  try {
    const data =
      await api('/packages');

    const pacotes =
      data.packages ||
      data.pacotes ||
      [];

    window.IGC_PACKAGES =
      pacotes;

    document.dispatchEvent(
      new CustomEvent(
        'igc:packages',
        {
          detail: pacotes
        }
      )
    );

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

async function comprarPacote(
  packageId
) {
  if (!packageId) {
    throw new Error(
      'Pacote inválido.'
    );
  }

  return api(
    '/orders',
    {
      method: 'POST',
      body: JSON.stringify({
        packageId,
        pacoteId:
          packageId
      })
    }
  );
}

async function carregarPedidos() {
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
      new CustomEvent(
        'igc:orders',
        {
          detail: pedidos
        }
      )
    );

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

async function iniciarPainelUsuario() {
  const usuario =
    await verificarAutenticacao();

  if (!usuario) {
    window.location.href =
      'index.html';

    return;
  }

  window.IGC_USER =
    usuario;

  await carregarUsuario();
  await carregarPacotes();
  await carregarPedidos();

  try {
    const data =
      await api(
        '/stream/status'
      );

    window.IGC_STREAM =
      data;

    document.dispatchEvent(
      new CustomEvent(
        'igc:stream-status',
        {
          detail: data
        }
      )
    );

  } catch {
    // Sem streaming disponível.
  }
}

async function iniciarFiveM() {
  try {
    const data =
      await api(
        '/stream/start',
        {
          method: 'POST'
        }
      );

    window.IGC_STREAM =
      data;

    document.dispatchEvent(
      new CustomEvent(
        'igc:stream-started',
        {
          detail: data
        }
      )
    );

    return data;

  } catch (error) {
    message(
      error.message ||
      'Não foi possível iniciar o FiveM.',
      true
    );

    throw error;
  }
}

async function verificarRetornoPagamento() {
  const params =
    new URLSearchParams(
      window.location.search
    );

  const status =
    params.get('status');

  if (!status) {
    return null;
  }

  return {
    status
  };
}

/* =========================================================
   ADMIN
========================================================= */

async function carregarAdminDashboard() {
  if (!(await verificarAdmin())) {
    return [];
  }

  try {
    const data =
      await api(
        '/admin/dashboard'
      );

    const valores =
      data.dashboard ||
      data;

    window.IGC_ADMIN_DASHBOARD =
      valores;

    Object.entries(valores)
      .forEach(
        ([id, value]) => {
          const node =
            el(id);

          if (node) {
            node.textContent =
              id === 'sales'
                ? formatarMoeda(value)
                : String(value);
          }
        }
      );

    return valores;

  } catch (error) {
    message(
      error.message ||
      'Erro ao carregar painel administrativo.',
      true
    );

    return [];
  }
}
/* =========================================================
   USUÁRIOS DO ADMIN
========================================================= */

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

  if (!id) {
    throw new Error(
      'ID do usuário não informado.'
    );
  }

  return api(
    `/admin/users/${encodeURIComponent(id)}`,
    {
      method: 'PUT',
      body: JSON.stringify(
        dados || {}
      )
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

  if (!id) {
    throw new Error(
      'ID do usuário não informado.'
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

  return api(
    `/admin/users/${encodeURIComponent(id)}/minutes`,
    {
      method: 'POST',
      body: JSON.stringify({
        minutos: minutosNumero
      })
    }
  );
}

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

/* =========================================================
   PEDIDOS DO ADMIN
========================================================= */

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

    document.dispatchEvent(
      new CustomEvent(
        'igc:admin-orders',
        {
          detail: pedidos
        }
      )
    );

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
   PACOTES DO ADMIN
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

    document.dispatchEvent(
      new CustomEvent(
        'igc:admin-packages',
        {
          detail: pacotes
        }
      )
    );

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

  return api(
    '/admin/packages',
    {
      method: 'POST',
      body: JSON.stringify(
        dados || {}
      )
    }
  );
}

async function editarPacoteAdmin(
  id,
  dados
) {
  if (!(await verificarAdmin())) {
    return null;
  }

  if (!id) {
    throw new Error(
      'ID do pacote não informado.'
    );
  }

  return api(
    `/admin/packages/${encodeURIComponent(id)}`,
    {
      method: 'PUT',
      body: JSON.stringify(
        dados || {}
      )
    }
  );
}

async function excluirPacoteAdmin(
  id
) {
  if (!(await verificarAdmin())) {
    return null;
  }

  if (!id) {
    throw new Error(
      'ID do pacote não informado.'
    );
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
      await api(
        '/admin/payment-config'
      );

    window.IGC_PAYMENT_CONFIG =
      data.payment_config ||
      data.paymentConfig ||
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

  return api(
    '/admin/payment-config',
    {
      method: 'PUT',
      body: JSON.stringify(
        dados || {}
      )
    }
  );
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
   ADICIONAR MINUTOS PELA TELA DO ADMIN
========================================================= */

async function adicionarMinutosTela() {
  const idInput =
    el('giftUserId') ||
    el('minutesUserId');

  const idMinutesInput =
    el('giftMinutes') ||
    el('minutesAmount');

  const emailInput =
    el('giftUserEmail') ||
    el('minutesUserEmail');

  const emailMinutesInput =
    el('giftEmailMinutes') ||
    el('minutesEmailAmount');

  const id =
    idInput
      ? idInput.value.trim()
      : '';

  const minutosId =
    idMinutesInput
      ? Number(idMinutesInput.value)
      : 0;

  const email =
    emailInput
      ? emailInput.value.trim()
      : '';

  const minutosEmail =
    emailMinutesInput
      ? Number(emailMinutesInput.value)
      : 0;

  try {
    if (id) {
      if (
        !Number.isFinite(minutosId) ||
        minutosId <= 0
      ) {
        message(
          'Informe uma quantidade válida de minutos para o ID.',
          true
        );
        return;
      }

      await adicionarMinutosAdmin(
        id,
        minutosId
      );

      message(
        'Minutos adicionados pelo ID com sucesso.'
      );

      if (idMinutesInput) {
        idMinutesInput.value = '';
      }

      if (idInput) {
        idInput.value = '';
      }

      return;
    }

    if (email) {
      if (
        !Number.isFinite(minutosEmail) ||
        minutosEmail <= 0
      ) {
        message(
          'Informe uma quantidade válida de minutos para o e-mail.',
          true
        );
        return;
      }

      await adicionarMinutosAdminPorEmail(
        email,
        minutosEmail
      );

      message(
        'Minutos adicionados pelo e-mail com sucesso.'
      );

      if (emailMinutesInput) {
        emailMinutesInput.value = '';
      }

      if (emailInput) {
        emailInput.value = '';
      }

      return;
    }

    message(
      'Informe o ID ou o e-mail do usuário.',
      true
    );

  } catch (error) {
    message(
      error.message ||
      'Não foi possível adicionar os minutos.',
      true
    );
  }
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
        async event => {
          event.preventDefault();

          const usuario =
            pegarValor(
              'loginUser',
              pegarValor(
                'usernameLogin',
                pegarValor('emailLogin')
              )
            ).trim();

          const senha =
            pegarValor(
              'loginPassword',
              pegarValor(
                'passwordLogin'
              )
            );

          try {
            await fazerLogin(event);
          } catch (error) {
            message(
              error.message ||
              'Não foi possível entrar.',
              true
            );
          }
        }
      );
    }

    const registerForm =
      el('registerForm') ||
      el('formRegister');

    if (registerForm) {
      registerForm.addEventListener(
        'submit',
        async event => {
          event.preventDefault();

          try {
            await registrarUsuario();
          } catch (error) {
            message(
              error.message ||
              'Não foi possível realizar o cadastro.',
              true
            );
          }
        }
      );
    }

    const adminPage =
      document.querySelector(
        '[data-admin-page]'
      ) ||
      el('adminPanel') ||
      el('admin');

    if (adminPage) {
      verificarAdmin()
        .then(ok => {
          if (!ok) return;

          carregarAdminDashboard();
          carregarUsuariosAdmin();
          carregarPedidosAdmin();
          carregarPacotesAdmin();
          carregarConfiguracaoPagamento();
        })
        .catch(error => {
          console.error(
            'Erro ao inicializar painel admin:',
            error
          );
        });
    }
  }
);

/* =========================================================
   COMPATIBILIDADE GLOBAL
========================================================= */

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
