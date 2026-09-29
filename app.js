'use strict';

const API_BASE = '/api/';

let token = localStorage.getItem('igc_token') || sessionStorage.getItem('igc_token') || '';
let role = localStorage.getItem('igc_role') || sessionStorage.getItem('igc_role') || '';

function el(id) {
  return document.getElementById(id);
}

function show(page) {
  document.querySelectorAll('.page').forEach(section => {
    section.classList.toggle('active', section.id === page);
  });
}

function message(text, isError) {
  const node = el('message');
  if (!node) return;
  node.textContent = text || '';
  node.className = isError ? 'error' : 'success';
  setTimeout(() => { node.textContent = ''; node.className = ''; }, 4000);
}

async function api(endpoint, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  
  const res = await fetch(API_BASE + endpoint.replace(/^\//, ''), {
    ...options,
    headers
  });
  return res.json();
}

function formatarMinutos(minutos) {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return `${h}h ${m}m`;
}

function verificarAutenticacao() {
  if (!token) {
    window.location.href = 'index.html';
    return false;
  }
  return true;
}

function logout() {
  localStorage.removeItem('igc_token');
  localStorage.removeItem('igc_role');
  sessionStorage.removeItem('igc_token');
  sessionStorage.removeItem('igc_role');
  window.location.href = 'index.html';
}

