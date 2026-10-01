'use strict';

const API_BASE = '/api/';

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
  const node = el('message');

  if (!node) {
    alert(text);
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
    API_BASE + endpoint.replace(/^\//, ''),
    {
      ...options,
      headers
    }
  );

  let data;

  try {
    data = await response.json();
  } catch {
    data = {
      ok: false,
      error: 'Resposta inválida do servidor.'
    };
  }

  if (!response.ok) {
    throw new Error(
      data.error || `Erro HTTP ${response.status}`
    );
  }

  return data;
}

function salvarSessao(novoToken, novoRole, lembrar = true) {
  token = novoToken || '';
  role = novoRole || '';

  localStorage.removeItem('igc_token');
  localStorage.removeItem('igc_role');
  sessionStorage.removeItem('igc_token');
  sessionStorage.removeItem('igc_role');

  const storage = lembrar
    ? localStorage
    : sessionStorage;

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

function formatarMinutos(minutos) {
  minutos = Number(minutos || 0);

  const h = Math.floor(minutos / 60);
  const m = minutos % 60;

  return `${h}h ${m}m`;
}

async function login(user, pass, lembrar = true) {
  try {
    const result = await api('login', {
      method: 'POST',
      body: JSON.stringify({
        user,
        pass
      })
    });

    if (!result.ok) {
      message(
        result.error || 'Usuário ou senha incorretos.',
        true
      );
      return false;
    }

    salvarSessao(
      result.token,
      result.role,
      lembrar
    );

    if (result.role === 'admin') {
      window.location.href = 'admin.html';
    } else {
      window.location.href = 'usuario.html';
    }

    return true;

  } catch (error) {
    console.error(error);

    message(
      error.message ||
      'Não foi possível conectar ao servidor.',
      true
    );

    return false;
  }
}

async function registrar(username, password) {
  try {
    const result = await api('register', {
      method: 'POST',
      body: JSON.stringify({
        username,
        password
      })
    });

    if (!result.ok) {
      message(
        result.error || 'Não foi possível criar a conta.',
        true
      );
      return false;
    }

    message(
      'Conta criada com sucesso! Agora faça login.'
    );

    return true;

  } catch (error) {
    console.error(error);

    message(
      error.message ||
      'Erro ao criar a conta.',
      true
    );

    return false;
  }
}

async function carregarUsuario() {
  if (!token) {
    return null;
  }

  try {
    const result = await api('me');

    if (!result.ok) {
      limparSessao();
      return null;
    }

    return result.user || null;

  } catch (error) {
    console.error(error);
    return null;
  }
}

async function carregarPacotes() {
  try {
    const result = await api('packages');

    if (!result.ok) {
      return [];
    }

    return result.packages || [];

  } catch (error) {
    console.error(error);
    return [];
  }
}

async function logout() {
  try {
    if (token) {
      await api('logout', {
        method: 'POST'
      });
    }
  } catch (error) {
    console.warn('Logout remoto:', error);
  }

  limparSessao();

  window.location.href = 'index.html';
}

function verificarAutenticacao() {
  if (!token) {
    window.location.href = 'index.html';
    return false;
  }

  return true;
}

async function verificarSessao() {
  if (!token) {
    return null;
  }

  const usuario = await carregarUsuario();

  if (!usuario) {
    limparSessao();
    window.location.href = 'index.html';
    return null;
  }

  return usuario;
}

window.IGC = {
  api,
  login,
  registrar,
  carregarUsuario,
  carregarPacotes,
  verificarAutenticacao,
  verificarSessao,
  logout,
  formatarMinutos,
  show,
  message
};
