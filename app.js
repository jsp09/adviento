'use strict';

/* ================== CONFIGURACIÓN ================== */
const ADMIN_PIN = '2812'; // Cámbialo antes de publicar

const LS = {
  datos: 'adviento3:datos',       // regalos (solo los escribe el admin)
  abiertos: 'adviento2:abiertos', // lo que ella ha desbloqueado en este navegador
  fechaSim: 'adviento2:fechaSim', // fecha simulada (sessionStorage)
  admin: 'adviento2:admin',       // sesión admin (sessionStorage)
};

const TIPOS = [
  ['pregunta', 'Pregunta con respuesta escrita'],
  ['test', 'Pregunta tipo test'],
  ['anagrama', 'Anagrama (ordenar letras)'],
  ['memory', 'Memory (parejas)'],
  ['queens', 'Queens (LinkedIn), con tiempo'],
  ['wordle', 'Wordle (adivinar palabra)'],
];
const EMOJIS = ['🎄', '🎁', '⛄', '🦌', '🔔', '⭐', '🍪', '🧦', '🕯️', '❄️', '🎅', '🍬'];

/* ================== UTILIDADES ================== */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const uid = () => Math.random().toString(36).slice(2, 10);
const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fmtFecha = f => new Date(f + 'T00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
const fmtCorta = f => new Date(f + 'T00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }).replace('.', '');
const conBr = s => esc(s).replace(/\n/g, '<br>');
async function sha(texto) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(norm(texto)));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/* ================== ESTADO ================== */
let datos = { config: {}, regalos: [] };
let abiertos = new Set(JSON.parse(localStorage.getItem(LS.abiertos) || '[]'));
let editandoId = null;
let fotoActual = '';

const cfg = () => datos.config;
const total = () => +cfg().total || 24;
const hoy = () => sessionStorage.getItem(LS.fechaSim) || iso(new Date());

function diasHasta(f) {
  const [y, m, d] = f.split('-').map(Number);
  const [hy, hm, hd] = hoy().split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(hy, hm - 1, hd)) / 864e5);
}
const textoDias = n => (n <= 0 ? 'hoy' : n === 1 ? 'mañana' : `en ${n} días`);

// vacio | bloqueado | disponible | abierto
function estado(r) {
  if (!r) return 'vacio';
  if (r.entregado || abiertos.has(r.id)) return 'abierto';
  if (!r.activo || (r.fecha && r.fecha > hoy())) return 'bloqueado';
  return 'disponible';
}
// sin | espera | lista | hecha  (segunda fase)
function estadoFase(r) {
  if (!r?.fase) return 'sin';
  if (abiertos.has(r.id + ':fase')) return 'hecha';
  return r.fase.fecha > hoy() ? 'espera' : 'lista';
}

async function cargar() {
  const local = localStorage.getItem(LS.datos);
  if (local) { try { datos = JSON.parse(local); return; } catch { /* sigue */ } }
  try {
    const res = await fetch('regalos.json', { cache: 'no-store' });
    if (res.ok) { datos = await res.json(); return; }
  } catch { /* abierto con file:// o no existe */ }
  datos = datosIniciales();
}

function guardar() {
  try { localStorage.setItem(LS.datos, JSON.stringify(datos)); return true; }
  catch { toast('No queda espacio en el navegador. Usa fotos más pequeñas o URLs.'); return false; }
}
const guardarAbiertos = () => localStorage.setItem(LS.abiertos, JSON.stringify([...abiertos]));

/* ================== CALENDARIO ================== */
function render() {
  const c = cfg();
  $('#titulo').textContent = c.titulo;
  $('#subtitulo').textContent = c.subtitulo || '';
  document.title = c.titulo;

  const sim = sessionStorage.getItem(LS.fechaSim);
  $('#avisoSim').hidden = !sim;
  if (sim) $('#avisoSim').textContent = `Fecha simulada: ${fmtFecha(sim)}`;

  const porNum = new Map(datos.regalos.map(r => [+r.numero, r]));
  const n = total();
  const hechos = datos.regalos.filter(r => +r.numero <= n && estado(r) === 'abierto').length;
  $('#progreso').innerHTML = `${hechos} de ${n} regalos abiertos<span class="pbar"><i style="width:${(hechos / n) * 100}%"></i></span>`;

  const np = pistasCena().length;
  $('#btnExpediente').hidden = np === 0;
  $('#btnExpediente').textContent = `🕵️ Expediente: la cena · ${np} pista${np === 1 ? '' : 's'}`;

  let html = '';
  for (let i = 1; i <= n; i++) {
    const r = porNum.get(i);
    const st = estado(r);
    const fase = estadoFase(r);
    const final = i === n;
    const ver = st === 'abierto' || (c.spoilers && r);
    let pie;
    if (st === 'abierto') pie = fase === 'espera' ? `🔒 Se activa el ${fmtCorta(r.fase.fecha)}` : fase === 'lista' ? '✨ ¡Ya puedes!' : '✓ Abierto';
    else if (st === 'disponible') pie = '¡Ábreme!';
    else if (final && c.cumple) pie = `🎂 ${textoDias(diasHasta(c.cumple)).replace(/^./, m => m.toUpperCase())}`;
    else if (r?.activo && r.fecha) pie = `🔒 ${textoDias(diasHasta(r.fecha))}`;
    else pie = st === 'vacio' ? '' : '🔒 Pronto';

    const clases = ['puerta', st, final ? 'final' : '', fase === 'lista' ? 'fase' : ''].join(' ');
    html += `<button class="${clases}" data-num="${i}" style="--i:${i}">
      ${r?.foto && ver ? `<img src="${esc(r.foto)}" alt="" loading="lazy">` : ''}
      <span class="num">${i}</span>
      ${final ? `<span class="mes">${c.cumple ? fmtCorta(c.cumple) : 'el gran día'}</span>` : ''}
      ${ver ? `<span class="nombre">${esc(r.nombre)}</span>` : ''}
      <span class="pie">${pie}</span>
    </button>`;
  }
  $('#calendario').innerHTML = html;
}

$('#calendario').addEventListener('click', e => {
  const b = e.target.closest('.puerta');
  if (!b) return;
  const num = +b.dataset.num;
  const r = datos.regalos.find(x => +x.numero === num);
  const st = estado(r);
  if (st === 'abierto') return mostrarRegalo(r);
  if (st === 'disponible') return jugar(r.retos || [], () => desbloquear(r));
  sacudir(b);
  if (num === total() && cfg().cumple) toast(`El gran día: ${fmtFecha(cfg().cumple)} 🎂`);
  else if (r?.activo && r.fecha) toast(`Paciencia: se abre el ${fmtFecha(r.fecha)}`);
  else toast('Este regalo todavía no está listo 😉');
});

/* ================== MODAL / AVISOS ================== */
function modal(html) { $('#modalContenido').innerHTML = html; $('#modal').hidden = false; }
function cerrarModal() { $('#modal').hidden = true; $('#modalContenido').innerHTML = ''; }
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal' || e.target.closest('[data-close]')) cerrarModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#modal').hidden) cerrarModal(); });

let toastT;
function toast(txt) {
  const t = $('#toast');
  t.textContent = txt; t.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), 2600);
}
function sacudir(el) { el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); }
const FALLOS = ['Nop. Prueba otra vez.', 'Casi… o no. Inténtalo de nuevo.', 'Frío, frío ❄️', 'Ese no es. ¡Ánimo!'];
function fallo(zona, el) {
  sacudir(el);
  const m = $('.msg', zona);
  if (m) m.textContent = FALLOS[Math.floor(Math.random() * FALLOS.length)];
}

/* ================== RETOS ================== */
function jugar(retos, alTerminar) {
  let paso = 0;
  const siguiente = () => {
    if (paso >= retos.length) return alTerminar();
    const reto = retos[paso];
    modal(`<p class="paso">Reto ${paso + 1} de ${retos.length}</p>
      <div class="barra"><i style="width:${(paso / retos.length) * 100}%"></i></div>
      <div id="zonaReto"></div>`);
    JUEGOS[reto.tipo](reto, $('#zonaReto'), () => {
      paso++;
      $('.barra i').style.width = `${(paso / retos.length) * 100}%`;
      toast('¡Correcto! 🎉');
      setTimeout(siguiente, 750);
    });
  };
  siguiente();
}

const pistaHTML = p => (p ? `<details><summary>Ver pista</summary>${esc(p)}</details>` : '');

const JUEGOS = {
  pregunta(reto, el, ok) {
    el.innerHTML = `<h3>${esc(reto.pregunta)}</h3>${pistaHTML(reto.pista)}
      <form class="form-resp"><input placeholder="Tu respuesta" autocomplete="off" required><button class="btn">Comprobar</button></form>
      <p class="msg"></p>`;
    const validas = String(reto.respuesta || '').split('|').map(norm).filter(Boolean);
    const f = $('form', el);
    $('input', f).focus();
    f.onsubmit = async e => {
      e.preventDefault();
      const v = norm($('input', f).value);
      const bien = validas.length ? validas.includes(v) : (reto.hashes || []).includes(await sha(v));
      if (bien) { $('button', f).disabled = true; ok(); }
      else { fallo(el, f); $('input', f).select(); }
    };
  },

  test(reto, el, ok) {
    const ops = shuffle(reto.opciones.map((texto, i) => ({ texto, i })));
    el.innerHTML = `<h3>${esc(reto.pregunta)}</h3>
      <div class="opciones">${ops.map(o => `<button data-i="${o.i}">${esc(o.texto)}</button>`).join('')}</div>
      <p class="msg"></p>`;
    $('.opciones', el).onclick = e => {
      const b = e.target.closest('button');
      if (!b || b.disabled) return;
      if (+b.dataset.i === +reto.correcta) { b.classList.add('ok'); $$('.opciones button', el).forEach(x => (x.disabled = true)); ok(); }
      else { b.classList.add('mal'); b.disabled = true; fallo(el, b); }
    };
  },

  anagrama(reto, el, ok) {
    const objetivo = String(reto.palabra || '').toUpperCase().replace(/\s+/g, '');
    let letras = shuffle([...objetivo]);
    if (letras.join('') === objetivo) letras.reverse();
    let usadas = [];
    el.innerHTML = `<h3>Ordena las letras</h3>${reto.pista ? `<p class="pista">Pista: ${esc(reto.pista)}</p>` : ''}
      <div class="respuesta-fichas"></div><div class="fichas"></div>
      <div class="row" style="justify-content:center"><button class="btn sec mini" data-borrar>Borrar</button></div>
      <p class="msg"></p>`;
    const pintar = () => {
      $('.respuesta-fichas', el).innerHTML = [...objetivo].map((_, k) =>
        `<span class="ficha hueco" data-k="${k}">${usadas[k] !== undefined ? esc(letras[usadas[k]]) : ''}</span>`).join('');
      $('.fichas', el).innerHTML = letras.map((c, i) =>
        `<button class="ficha" data-i="${i}" ${usadas.includes(i) ? 'disabled' : ''}>${esc(c)}</button>`).join('');
    };
    pintar();
    $('.fichas', el).onclick = e => {
      const b = e.target.closest('button');
      if (!b || b.disabled) return;
      usadas.push(+b.dataset.i); pintar();
      if (usadas.length < objetivo.length) return;
      if (norm(usadas.map(i => letras[i]).join('')) === norm(objetivo)) ok();
      else { fallo(el, $('.respuesta-fichas', el)); setTimeout(() => { usadas = []; pintar(); }, 650); }
    };
    $('.respuesta-fichas', el).onclick = e => {
      const s = e.target.closest('[data-k]');
      if (s && +s.dataset.k < usadas.length) { usadas.splice(+s.dataset.k, 1); pintar(); }
    };
    $('[data-borrar]', el).onclick = () => { usadas = []; pintar(); };
  },

  memory(reto, el, ok) {
    const n = Math.min(Math.max(+reto.parejas || 6, 2), EMOJIS.length);
    const base = shuffle(EMOJIS).slice(0, n);
    const cartas = shuffle([...base, ...base]);
    const cols = n <= 6 ? 4 : 6;
    el.innerHTML = `<h3>Encuentra todas las parejas</h3>
      <div class="memory" style="--cols:${cols}">${cartas.map((c, i) => `<button class="carta" data-i="${i}"><span>${c}</span></button>`).join('')}</div>
      <p class="msg" style="color:inherit">Intentos: <b>0</b></p>`;
    let vueltas = [], hechas = 0, intentos = 0, espera = false;
    $('.memory', el).onclick = e => {
      const b = e.target.closest('.carta');
      if (!b || espera || b.classList.contains('vuelta')) return;
      b.classList.add('vuelta'); vueltas.push(b);
      if (vueltas.length < 2) return;
      intentos++; $('.msg b', el).textContent = intentos;
      const [a, c] = vueltas;
      if (cartas[a.dataset.i] === cartas[c.dataset.i]) {
        a.classList.add('par'); c.classList.add('par'); vueltas = [];
        if (++hechas === n) ok();
      } else {
        espera = true;
        setTimeout(() => { a.classList.remove('vuelta'); c.classList.remove('vuelta'); vueltas = []; espera = false; }, 850);
      }
    };
  },
};

/* ---------- Queens ---------- */
const COLORES_Q = { P: '#dfa0bf', O: '#f8cb9c', B: '#9fbefe', G: '#bfdea6', W: '#dfdfdf', Y: '#e6f396', R: '#f0836a', T: '#acd0d6', V: '#b9a3e0', K: '#bab3a0' };
const PALETA_Q = Object.values(COLORES_Q);
const parseTablero = t => String(t || '').trim().split(/\s*\n\s*/).map(f => f.replace(/\s/g, '').toUpperCase()).filter(Boolean);
const fmtSeg = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

function choca(g, r1, c1, r2, c2) {
  return r1 === r2 || c1 === c2 || g[r1][c1] === g[r2][c2] || (Math.abs(r1 - r2) <= 1 && Math.abs(c1 - c2) <= 1);
}
function contarSoluciones(g) {
  const n = g.length, pos = [];
  let sols = 0;
  const bt = r => {
    if (sols > 1) return;
    if (r === n) { sols++; return; }
    for (let c = 0; c < n; c++) {
      if (pos.every(([rr, cc]) => !choca(g, rr, cc, r, c))) { pos.push([r, c]); bt(r + 1); pos.pop(); }
    }
  };
  bt(0);
  return sols;
}
function validarTablero(g) {
  const n = g.length;
  if (n < 4) return 'el tablero necesita al menos 4 filas';
  if (g.some(f => f.length !== n)) return `todas las filas deben tener ${n} letras`;
  const colores = new Set(g.join('')).size;
  if (colores !== n) return `hay ${colores} colores y deben ser ${n}`;
  if (contarSoluciones(g) === 0) return 'este tablero no tiene solución';
  return '';
}

JUEGOS.queens = (reto, el, ok) => {
  const g = parseTablero(reto.tablero);
  const n = g.length;
  const seg = +reto.segundos || 0;
  const letras = [...new Set(g.join(''))];
  const color = l => COLORES_Q[l] || PALETA_Q[letras.indexOf(l) % PALETA_Q.length];
  const borde = dif => (dif ? '2.5px solid #222' : '.5px solid rgba(0,0,0,.18)');

  el.innerHTML = `<h3>Queens 👑</h3>
    <p class="reglas">Una corona por fila, por columna y por color. No pueden tocarse, ni siquiera en diagonal. Toca una vez para marcar ✕ y otra para poner 👑.</p>
    ${seg ? `<div class="q-top"><span class="q-reloj">${fmtSeg(seg)}</span></div>` : ''}
    <div class="q-wrap">
      <div class="q-grid" style="--n:${n}"></div>
      <div class="q-velo"><p class="q-aviso">${seg ? `Tienes <b>${seg} segundos</b>. Si se acaba el tiempo, vuelta a empezar.` : '¿Lista?'}</p>
        <button class="btn" data-start>¡Empezar!</button></div>
    </div>
    <p class="msg"></p>`;

  const grid = $('.q-grid', el), velo = $('.q-velo', el), reloj = $('.q-reloj', el);
  let html = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    const st = [
      `background-color:${color(g[r][c])}`,
      `border-top:${borde(r === 0 || g[r - 1][c] !== g[r][c])}`,
      `border-bottom:${borde(r === n - 1 || g[r + 1][c] !== g[r][c])}`,
      `border-left:${borde(c === 0 || g[r][c - 1] !== g[r][c])}`,
      `border-right:${borde(c === n - 1 || g[r][c + 1] !== g[r][c])}`,
    ].join(';');
    html += `<div class="q-celda" data-k="${r * n + c}" style="${st}"></div>`;
  }
  grid.innerHTML = html;
  const celdas = $$('.q-celda', grid);
  let marcas = [], jugando = false, timer = null, restante = seg;

  const pintar = () => {
    const reinas = marcas.map((m, k) => (m === 2 ? k : -1)).filter(k => k >= 0);
    const malas = new Set();
    for (let i = 0; i < reinas.length; i++) for (let j = i + 1; j < reinas.length; j++) {
      const a = reinas[i], b = reinas[j];
      if (choca(g, Math.floor(a / n), a % n, Math.floor(b / n), b % n)) { malas.add(a); malas.add(b); }
    }
    celdas.forEach((d, k) => {
      d.textContent = marcas[k] === 2 ? '👑' : marcas[k] === 1 ? '✕' : '';
      d.classList.toggle('x', marcas[k] === 1);
      d.classList.toggle('mal', malas.has(k));
    });
    return reinas.length === n && malas.size === 0;
  };
  const reiniciar = () => { marcas = Array(n * n).fill(0); pintar(); };
  const parar = () => { clearInterval(timer); timer = null; jugando = false; };

  reiniciar();
  $('[data-start]', el).onclick = () => {
    reiniciar();
    velo.hidden = true; jugando = true; restante = seg;
    $('.msg', el).textContent = '';
    if (!seg) return;
    reloj.textContent = fmtSeg(restante); reloj.classList.remove('urgente');
    timer = setInterval(() => {
      if (!el.isConnected) return parar();
      restante--;
      reloj.textContent = fmtSeg(Math.max(restante, 0));
      reloj.classList.toggle('urgente', restante <= 10);
      if (restante > 0) return;
      parar(); reiniciar();
      $('.q-aviso', el).innerHTML = '⏰ <b>¡Se acabó el tiempo!</b><br>Vuelta a empezar.';
      $('[data-start]', el).textContent = 'Reintentar';
      velo.hidden = false;
      sacudir(grid);
    }, 1000);
  };
  grid.onclick = e => {
    const d = e.target.closest('.q-celda');
    if (!d || !jugando) return;
    const k = +d.dataset.k;
    marcas[k] = (marcas[k] + 1) % 3;
    if (pintar()) { parar(); ok(); }
  };
};

/* ---------- Wordle ---------- */
const normW = s => String(s || '').toUpperCase().replace(/Ñ/g, '\u0001').normalize('NFD')
  .replace(/[̀-ͯ]/g, '').replace(/\u0001/g, 'Ñ').replace(/[^A-ZÑ]/g, '');

function evaluarW(intento, objetivo) {
  const res = Array(objetivo.length).fill('g');
  const quedan = {};
  [...objetivo].forEach((c, i) => { if (intento[i] === c) res[i] = 'v'; else quedan[c] = (quedan[c] || 0) + 1; });
  [...intento].forEach((c, i) => { if (res[i] !== 'v' && quedan[c]) { res[i] = 'a'; quedan[c]--; } });
  return res;
}

JUEGOS.wordle = (reto, el, ok) => {
  const obj = normW(reto.palabra), L = obj.length, max = +reto.intentos || 6;
  const TECLAS = ['QWERTYUIOP', 'ASDFGHJKLÑ', '↵ZXCVBNM⌫'];
  let filas, actual, fin;
  el.innerHTML = `<h3>Adivina la palabra</h3>
    <p class="reglas">${L} letras y ${max} intentos. 🟩 letra en su sitio, 🟨 está pero en otro sitio, ⬜ no está. Si se acaban los intentos, vuelta a empezar.</p>
    <div class="w-grid" style="--l:${L}"></div>
    <p class="msg"></p>
    <div class="w-kb">${TECLAS.map(f => `<div>${[...f].map(k => `<button data-k="${k}" class="${k === '↵' || k === '⌫' ? 'ancha' : ''}">${k === '↵' ? 'ENVIAR' : k}</button>`).join('')}</div>`).join('')}</div>`;
  const grid = $('.w-grid', el), kb = $('.w-kb', el), msg = $('.msg', el);

  const pintar = () => {
    let html = '';
    for (let r = 0; r < max; r++) {
      const fila = filas[r];
      const txt = fila ? fila.palabra : r === filas.length ? actual : '';
      for (let i = 0; i < L; i++) html += `<div class="w-c ${fila ? fila.res[i] : txt[i] ? 'llena' : ''}">${txt[i] || ''}</div>`;
    }
    grid.innerHTML = html;
    const mejor = {};
    const rango = { g: 1, a: 2, v: 3 };
    filas.forEach(f => [...f.palabra].forEach((c, i) => { if (!mejor[c] || rango[f.res[i]] > rango[mejor[c]]) mejor[c] = f.res[i]; }));
    $$('button', kb).forEach(b => { b.className = (b.className.includes('ancha') ? 'ancha ' : '') + (mejor[b.dataset.k] || ''); });
  };
  const empezar = () => { filas = []; actual = ''; fin = false; pintar(); };

  const pulsar = k => {
    if (fin) return;
    if (k === '⌫') actual = actual.slice(0, -1);
    else if (k === '↵') {
      if (actual.length < L) { sacudir(grid); msg.textContent = `Faltan letras: son ${L}`; return; }
      const res = evaluarW(actual, obj);
      filas.push({ palabra: actual, res }); actual = ''; msg.textContent = '';
      if (res.every(x => x === 'v')) { fin = true; pintar(); return setTimeout(ok, 600); }
      if (filas.length >= max) {
        fin = true; pintar(); sacudir(grid);
        msg.textContent = 'Se acabaron los intentos… ¡vuelta a empezar!';
        return setTimeout(() => { if (el.isConnected) { empezar(); msg.textContent = ''; } }, 2200);
      }
    } else if (actual.length < L) actual += k;
    pintar();
  };
  kb.onclick = e => { const b = e.target.closest('button'); if (b) pulsar(b.dataset.k); };
  const teclado = e => {
    if (!el.isConnected) return document.removeEventListener('keydown', teclado);
    if (e.key === 'Enter') pulsar('↵');
    else if (e.key === 'Backspace') pulsar('⌫');
    else { const c = normW(e.key); if (c.length === 1) pulsar(c); }
  };
  document.addEventListener('keydown', teclado);
  empezar();
};

function desbloquear(r) {
  abiertos.add(r.id); guardarAbiertos();
  render(); mostrarRegalo(r); confeti();
}

function mostrarRegalo(r) {
  const fase = estadoFase(r);
  let faseHTML = '';
  if (fase === 'espera') {
    const d = diasHasta(r.fase.fecha);
    faseHTML = `<div class="fase-box"><p>🔒 Todavía no se puede usar</p>
      <p class="grande">${d === 1 ? 'Mañana' : `Faltan ${d} días`}</p>
      <p>Se activa el ${fmtFecha(r.fase.fecha)}</p></div>`;
  } else if (fase === 'lista') {
    faseHTML = `<div class="fase-box"><p>✨ ¡Ha llegado el día! Pero antes…</p>
      <button class="btn" id="btnFase">Desbloquear</button></div>`;
  } else if (fase === 'hecha' && r.fase.mensaje) {
    faseHTML = `<blockquote>${conBr(r.fase.mensaje)}</blockquote>`;
  }
  modal(`<div class="regalo">
    ${r.foto ? `<img src="${esc(r.foto)}" alt="">` : '<div class="emoji-grande">🎁</div>'}
    <p class="fecha">Regalo nº ${r.numero}</p>
    <h2>${esc(r.nombre)}</h2>
    ${r.descripcion ? `<p>${conBr(r.descripcion)}</p>` : ''}
    ${r.mensaje ? `<blockquote>${conBr(r.mensaje)}</blockquote>` : ''}
    ${faseHTML}
    ${tienePistaCena(r) ? `<div class="pista-box"><strong>🕵️ Nueva pista para el expediente</strong>
      ${r.pistaCena?.texto ? `<p>${conBr(r.pistaCena.texto)}</p>` : ''}
      ${+r.pistaCena?.pieza ? '<p>🧩 Y una pieza más del puzzle</p>' : ''}
      <button class="btn mini" id="btnVerExp">Abrir expediente</button></div>` : ''}
    ${r.pistaSiguiente ? `<div class="pista-box sig"><strong>🔎 Pista del próximo regalo</strong><p>${conBr(r.pistaSiguiente)}</p></div>` : ''}
  </div>`);
  const be = $('#btnVerExp');
  if (be) be.onclick = abrirExpediente;
  const btn = $('#btnFase');
  if (btn) btn.onclick = () => jugar(r.fase.retos || [], () => {
    abiertos.add(r.id + ':fase'); guardarAbiertos();
    render(); mostrarRegalo(r); confeti();
  });
}

/* ================== EXPEDIENTE DE LA CENA ================== */
const tienePistaCena = r => !!(r?.pistaCena && (r.pistaCena.texto || +r.pistaCena.pieza));
const pistasCena = () => datos.regalos
  .filter(r => tienePistaCena(r) && estado(r) === 'abierto')
  .sort((a, b) => a.numero - b.numero);

function puzzleHTML(piezasAbiertas) {
  const p = cfg().puzzle;
  if (!p?.foto) return '';
  const f = +p.filas || 3, c = +p.cols || 3;
  let html = '';
  for (let k = 0; k < f * c; k++) {
    const fila = Math.floor(k / c), col = k % c;
    const visible = piezasAbiertas.has(k + 1);
    const pos = `${c > 1 ? (col / (c - 1)) * 100 : 0}% ${f > 1 ? (fila / (f - 1)) * 100 : 0}%`;
    html += visible
      ? `<div style="background-image:url('${esc(p.foto)}');background-size:${c * 100}% ${f * 100}%;background-position:${pos}"></div>`
      : `<div>?</div>`;
  }
  return `<div class="puzzle" style="grid-template-columns:repeat(${c},1fr);--ar:${p.ar || 1}">${html}</div>`;
}

function abrirExpediente() {
  const pistas = pistasCena();
  const piezas = new Set(pistas.map(r => +r.pistaCena.pieza).filter(Boolean));
  const textos = pistas.filter(r => r.pistaCena.texto);
  modal(`<p class="paso">Caso abierto</p>
    <h3>Expediente: la cena del ${cfg().cumple ? fmtCorta(cfg().cumple) : 'gran día'}</h3>
    <p style="margin-top:-6px">Pista a pista vas a descubrir adónde te llevo a cenar.</p>
    ${puzzleHTML(piezas)}
    ${textos.length ? `<ol class="pistas">${textos.map(r => `<li>${conBr(r.pistaCena.texto)} <small>(regalo ${r.numero})</small></li>`).join('')}</ol>` : ''}`);
}
$('#btnExpediente').onclick = abrirExpediente;

/* ================== EFECTOS ================== */
function confeti() {
  const colores = ['#d9a441', '#a8281f', '#1d5a46', '#f5eee2', '#e86a5c'];
  for (let i = 0; i < 90; i++) {
    const d = document.createElement('i');
    d.className = 'confeti';
    d.style.left = Math.random() * 100 + 'vw';
    d.style.background = colores[i % colores.length];
    d.style.setProperty('--dx', (Math.random() * 200 - 100) + 'px');
    d.style.setProperty('--rot', (Math.random() * 900 - 450) + 'deg');
    d.style.animationDelay = Math.random() * .5 + 's';
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 3300);
  }
}

function nieve() {
  const cont = $('#nieve');
  for (let i = 0; i < 40; i++) {
    const f = document.createElement('i');
    const s = 2 + Math.random() * 4;
    Object.assign(f.style, {
      left: Math.random() * 100 + 'vw', width: s + 'px', height: s + 'px',
      animationDuration: 8 + Math.random() * 12 + 's', animationDelay: -Math.random() * 20 + 's',
      opacity: .3 + Math.random() * .5,
    });
    f.style.setProperty('--dx', (Math.random() * 80 - 40) + 'px');
    cont.appendChild(f);
  }
}

/* ================== ADMIN ================== */
$('#btnAdmin').onclick = () => (sessionStorage.getItem(LS.admin) ? abrirAdmin() : pedirPin());

function pedirPin() {
  modal(`<h3>Acceso administrador</h3>
    <form id="fPin" class="form-resp"><input type="password" placeholder="PIN" required><button class="btn">Entrar</button></form>
    <p class="msg"></p>`);
  const f = $('#fPin');
  $('input', f).focus();
  f.onsubmit = e => {
    e.preventDefault();
    if ($('input', f).value === ADMIN_PIN) { sessionStorage.setItem(LS.admin, '1'); cerrarModal(); abrirAdmin(); }
    else { fallo($('#modalContenido'), f); $('input', f).value = ''; }
  };
}

function abrirAdmin() {
  $('#admin').hidden = false;
  document.body.style.overflow = 'hidden';
  $('#cfgTitulo').value = cfg().titulo || '';
  $('#cfgSubtitulo').value = cfg().subtitulo || '';
  $('#cfgTotal').value = total();
  $('#cfgCumple').value = cfg().cumple || '';
  $('#cfgSpoilers').checked = !!cfg().spoilers;
  $('#cfgFecha').value = sessionStorage.getItem(LS.fechaSim) || '';
  const pz = cfg().puzzle || {};
  $('#cfgPuzzleFilas').value = pz.filas || 3;
  $('#cfgPuzzleCols').value = pz.cols || 3;
  previewPuzzle();
  renderLista();
  nuevoRegalo();
}

$('#btnSalirAdmin').onclick = () => { $('#admin').hidden = true; document.body.style.overflow = ''; render(); };

// Ajustes
$('#cfgTitulo').oninput = e => { cfg().titulo = e.target.value; guardar(); };
$('#cfgSubtitulo').oninput = e => { cfg().subtitulo = e.target.value; guardar(); };
$('#cfgTotal').onchange = e => { cfg().total = Math.min(Math.max(+e.target.value || 24, 1), 60); guardar(); opcionesNumero(); };
$('#cfgCumple').onchange = e => { cfg().cumple = e.target.value; guardar(); };
$('#cfgSpoilers').onchange = e => { cfg().spoilers = e.target.checked; guardar(); };
$('#cfgFecha').onchange = e => {
  e.target.value ? sessionStorage.setItem(LS.fechaSim, e.target.value) : sessionStorage.removeItem(LS.fechaSim);
  toast(e.target.value ? 'Fecha simulada activada' : 'Usando la fecha real');
};
function previewPuzzle() {
  const foto = cfg().puzzle?.foto;
  $('#puzzlePrevWrap').hidden = !foto;
  $('#puzzlePreview').src = foto || '';
}
const puzzleCfg = () => (cfg().puzzle ||= { filas: 3, cols: 3 });
$('#cfgPuzzleFile').onchange = async e => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    const foto = await comprimir(f, 1000);
    const img = new Image();
    img.onload = () => { Object.assign(puzzleCfg(), { foto, ar: +(img.width / img.height).toFixed(3) }); guardar(); previewPuzzle(); toast('Foto del puzzle guardada'); };
    img.src = foto;
  } catch { toast('No se pudo leer la imagen'); }
  e.target.value = '';
};
$('#cfgPuzzleFilas').onchange = e => { puzzleCfg().filas = Math.min(Math.max(+e.target.value || 3, 2), 6); guardar(); };
$('#cfgPuzzleCols').onchange = e => { puzzleCfg().cols = Math.min(Math.max(+e.target.value || 3, 2), 6); guardar(); };
$('#btnQuitarPuzzle').onclick = () => { delete puzzleCfg().foto; guardar(); previewPuzzle(); };

$('#btnResetAbiertos').onclick = () => {
  if (!confirm('¿Volver a cerrar todos los regalos en este navegador?')) return;
  abiertos.clear(); guardarAbiertos(); renderLista(); toast('Regalos cerrados de nuevo');
};

// Exportar / importar
async function ocultarRespuestas(retos = []) {
  for (const r of retos) {
    if (r.tipo === 'pregunta' && r.respuesta) {
      r.hashes = await Promise.all(r.respuesta.split('|').map(s => s.trim()).filter(Boolean).map(sha));
      delete r.respuesta;
    }
  }
}
$('#btnRecargar').onclick = () => {
  if (!confirm('Se descartan los cambios no exportados de este navegador y se carga el regalos.json publicado. ¿Seguir?')) return;
  localStorage.removeItem(LS.datos); location.reload();
};
$('#btnExport').onclick = async () => {
  // En el archivo público las respuestas escritas van cifradas (SHA-256), así no se pueden leer
  const copia = JSON.parse(JSON.stringify(datos));
  for (const r of copia.regalos) { await ocultarRespuestas(r.retos); await ocultarRespuestas(r.fase?.retos); }
  const blob = new Blob([JSON.stringify(copia, null, 2)], { type: 'application/json' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'regalos.json' });
  a.click(); URL.revokeObjectURL(a.href);
};
$('#fileImport').onchange = async e => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const d = JSON.parse(await file.text());
    if (!Array.isArray(d.regalos)) throw new Error();
    datos = { config: { ...cfg(), ...d.config }, regalos: d.regalos };
    guardar(); abrirAdmin(); toast(`Importados ${d.regalos.length} regalos`);
  } catch { toast('Ese archivo no es un regalos.json válido'); }
  e.target.value = '';
};

// Lista
function etiqueta(r) {
  if (r.entregado) return 'Entregado';
  if (abiertos.has(r.id)) return 'Abierto';
  if (!r.activo) return 'Sin activar';
  return r.fecha && r.fecha > hoy() ? `Activo desde ${fmtCorta(r.fecha)}` : 'Activo';
}
function renderLista() {
  const lista = [...datos.regalos].sort((a, b) => a.numero - b.numero);
  $('#listaAdmin').innerHTML = lista.length ? lista.map(r => `
    <li class="${r.id === editandoId ? 'activo' : ''}">
      ${r.foto ? `<img class="mini-foto" src="${esc(r.foto)}" alt="">` : `<span class="mini-foto">${r.numero}</span>`}
      <div class="info"><b>${r.numero}. ${esc(r.nombre)}</b><small>${etiqueta(r)} · ${(r.retos || []).length} reto(s)${r.fase ? ' · 2ª fase' : ''}</small></div>
      <button class="btn sec mini" data-edit="${r.id}">Editar</button>
      <button class="btn peligro mini" data-del="${r.id}" aria-label="Borrar">✕</button>
    </li>`).join('') : '<li><small>Aún no hay regalos.</small></li>';
}

$('#listaAdmin').onclick = e => {
  const ed = e.target.closest('[data-edit]'), del = e.target.closest('[data-del]');
  if (ed) editarRegalo(ed.dataset.edit);
  if (del) {
    const r = datos.regalos.find(x => x.id === del.dataset.del);
    if (!confirm(`¿Borrar "${r.nombre}"?`)) return;
    datos.regalos = datos.regalos.filter(x => x.id !== r.id);
    guardar();
    if (editandoId === r.id) nuevoRegalo(); else renderLista();
  }
};
$('#btnNuevo').onclick = () => nuevoRegalo();
$('#btnCancelar').onclick = () => nuevoRegalo();

// Formulario
const form = $('#formRegalo');

function opcionesNumero(sel) {
  const usados = new Set(datos.regalos.filter(r => r.id !== editandoId).map(r => +r.numero));
  const actual = sel ?? +form.numero.value;
  let html = '';
  for (let i = 1; i <= total(); i++) html += `<option value="${i}" ${i === actual ? 'selected' : ''}>${i}${usados.has(i) ? ' (ocupada)' : ''}</option>`;
  form.numero.innerHTML = html;
}
function primerLibre() {
  const usados = new Set(datos.regalos.map(r => +r.numero));
  for (let i = 1; i <= total(); i++) if (!usados.has(i)) return i;
  return 1;
}
function setFoto(src) {
  fotoActual = src || '';
  $('#fotoPrevWrap').hidden = !fotoActual;
  $('#fotoPreview').src = fotoActual;
}
function mostrarFase() { $('#faseBox').hidden = !form.tieneFase.checked; }
form.tieneFase.onchange = mostrarFase;

function nuevoRegalo() {
  editandoId = null;
  form.reset();
  $('#formTitulo').textContent = 'Nuevo regalo';
  opcionesNumero(primerLibre());
  setFoto('');
  $('#retos').innerHTML = ''; $('#retosFase').innerHTML = '';
  añadirReto($('#retos'));
  mostrarFase();
  renderLista();
}

function editarRegalo(id) {
  const r = datos.regalos.find(x => x.id === id);
  editandoId = id;
  form.reset();
  $('#formTitulo').textContent = `Editar: ${r.nombre}`;
  opcionesNumero(+r.numero);
  form.nombre.value = r.nombre;
  form.descripcion.value = r.descripcion || '';
  form.activo.checked = !!r.activo;
  form.fecha.value = r.fecha || '';
  form.entregado.checked = !!r.entregado;
  form.mensaje.value = r.mensaje || '';
  form.pistaSiguiente.value = r.pistaSiguiente || '';
  form.pistaCena.value = r.pistaCena?.texto || '';
  form.pieza.value = r.pistaCena?.pieza || '';
  form.fotoUrl.value = r.foto && !r.foto.startsWith('data:') ? r.foto : '';
  setFoto(r.foto);
  $('#retos').innerHTML = '';
  (r.retos || []).forEach(x => añadirReto($('#retos'), x));
  form.tieneFase.checked = !!r.fase;
  $('#retosFase').innerHTML = '';
  if (r.fase) {
    form.faseFecha.value = r.fase.fecha || '';
    form.faseMensaje.value = r.fase.mensaje || '';
    (r.fase.retos || []).forEach(x => añadirReto($('#retosFase'), x));
  }
  mostrarFase();
  renderLista();
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

$('#fotoFile').onchange = async e => {
  const f = e.target.files[0];
  if (!f) return;
  try { setFoto(await comprimir(f)); form.fotoUrl.value = ''; }
  catch { toast('No se pudo leer la imagen'); }
};
form.fotoUrl.oninput = e => setFoto(e.target.value.trim());
$('#btnQuitarFoto').onclick = () => { setFoto(''); form.fotoUrl.value = ''; $('#fotoFile').value = ''; };

function comprimir(file, max = 900, calidad = .82) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      res(c.toDataURL('image/jpeg', calidad));
    };
    img.onerror = rej;
    img.src = URL.createObjectURL(file);
  });
}

// Editor de retos (sirve para los retos normales y los de la segunda fase)
function añadirReto(cont, reto = { tipo: 'pregunta' }) {
  const fs = document.createElement('fieldset');
  fs.className = 'reto';
  fs.innerHTML = `
    <div class="row">
      <select name="tipo">${TIPOS.map(([v, l]) => `<option value="${v}" ${v === reto.tipo ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <button type="button" class="btn peligro mini" data-quitar>Quitar</button>
    </div>
    <label data-t="pregunta test">Pregunta <input name="pregunta" value="${esc(reto.pregunta)}"></label>
    <label data-t="pregunta">Respuesta correcta <input name="respuesta" value="${esc(reto.respuesta)}" placeholder="Admite varias separadas por |  (ej: 8|ocho)"></label>
    <label data-t="test">Opciones, una por línea <textarea name="opciones" rows="4">${esc((reto.opciones || []).join('\n'))}</textarea></label>
    <label data-t="test">Número de la opción correcta <input type="number" min="1" name="correcta" value="${(reto.correcta ?? 0) + 1}"></label>
    <label data-t="anagrama wordle">Palabra a adivinar <input name="palabra" value="${esc(reto.palabra)}"></label>
    <label data-t="pregunta anagrama">Pista (opcional) <input name="pista" value="${esc(reto.pista)}"></label>
    <label data-t="memory">Número de parejas (2-12) <input type="number" min="2" max="12" name="parejas" value="${reto.parejas || 6}"></label>
    <label data-t="queens">Tablero: una fila por línea y una letra por color <textarea name="tablero" rows="8" class="mono">${esc(reto.tablero)}</textarea></label>
    <label data-t="wordle">Intentos <input type="number" min="3" max="10" name="intentos" value="${reto.intentos || 6}"></label>
    <label data-t="queens">Segundos para resolverlo (0 = sin límite) <input type="number" min="0" name="segundos" value="${reto.segundos ?? 40}"></label>`;
  if (reto.hashes && !reto.respuesta) {
    fs.dataset.hashes = JSON.stringify(reto.hashes);
    $('[name=respuesta]', fs).placeholder = 'Oculta. Escribe otra solo si quieres cambiarla';
  }
  const campos = () => {
    const t = $('[name=tipo]', fs).value;
    $$('[data-t]', fs).forEach(l => (l.hidden = !l.dataset.t.split(' ').includes(t)));
  };
  $('[name=tipo]', fs).onchange = campos;
  $('[data-quitar]', fs).onclick = () => fs.remove();
  campos();
  cont.appendChild(fs);
}
$('#btnAddReto').onclick = () => añadirReto($('#retos'));
$('#btnAddRetoFase').onclick = () => añadirReto($('#retosFase'));

function leerRetos(cont, prefijo) {
  return $$('.reto', cont).map((fs, n) => {
    const g = k => $(`[name=${k}]`, fs).value.trim();
    const tipo = g('tipo');
    const r = { tipo };
    const err = msg => { throw new Error(`${prefijo} ${n + 1}: ${msg}`); };
    if (tipo === 'pregunta') {
      Object.assign(r, { pregunta: g('pregunta'), respuesta: g('respuesta'), pista: g('pista') });
      if (!r.respuesta && fs.dataset.hashes) { r.hashes = JSON.parse(fs.dataset.hashes); delete r.respuesta; }
      if (!r.pregunta || (!r.respuesta && !r.hashes)) err('falta la pregunta o la respuesta');
    } else if (tipo === 'test') {
      r.pregunta = g('pregunta');
      r.opciones = g('opciones').split('\n').map(s => s.trim()).filter(Boolean);
      r.correcta = (+g('correcta') || 1) - 1;
      if (!r.pregunta || r.opciones.length < 2) err('necesita pregunta y al menos 2 opciones');
      if (r.correcta < 0 || r.correcta >= r.opciones.length) err('el número de la opción correcta no existe');
    } else if (tipo === 'anagrama') {
      Object.assign(r, { palabra: g('palabra'), pista: g('pista') });
      if (r.palabra.replace(/\s/g, '').length < 2) err('la palabra debe tener al menos 2 letras');
    } else if (tipo === 'wordle') {
      r.palabra = g('palabra');
      r.intentos = Math.min(Math.max(+g('intentos') || 6, 3), 10);
      if (normW(r.palabra).length < 3) err('la palabra debe tener al menos 3 letras');
    } else if (tipo === 'queens') {
      const t = parseTablero(g('tablero'));
      const problema = validarTablero(t);
      if (problema) err(problema);
      r.tablero = t.join('\n');
      r.segundos = Math.max(+g('segundos') || 0, 0);
    } else if (tipo === 'memory') {
      r.parejas = Math.min(Math.max(+g('parejas') || 6, 2), 12);
    }
    return r;
  });
}

form.onsubmit = e => {
  e.preventDefault();
  const numero = +form.numero.value;
  if (datos.regalos.some(r => r.id !== editandoId && +r.numero === numero)) return toast(`La casilla ${numero} ya tiene regalo`);
  let retos, fase = null;
  try {
    retos = leerRetos($('#retos'), 'Reto');
    if (form.tieneFase.checked) {
      if (!form.faseFecha.value) return toast('Pon la fecha de la segunda fase');
      fase = { fecha: form.faseFecha.value, mensaje: form.faseMensaje.value.trim(), retos: leerRetos($('#retosFase'), 'Reto 2ª fase') };
    }
  } catch (err) { return toast(err.message); }
  const regalo = {
    id: editandoId || uid(),
    numero,
    nombre: form.nombre.value.trim(),
    descripcion: form.descripcion.value.trim(),
    activo: form.activo.checked,
    fecha: form.fecha.value,
    entregado: form.entregado.checked,
    foto: fotoActual,
    mensaje: form.mensaje.value.trim(),
    pistaSiguiente: form.pistaSiguiente.value.trim(),
    pistaCena: (form.pistaCena.value.trim() || +form.pieza.value)
      ? { texto: form.pistaCena.value.trim(), pieza: +form.pieza.value || 0 } : null,
    retos,
    fase,
  };
  const previo = JSON.stringify(datos.regalos);
  const i = datos.regalos.findIndex(x => x.id === regalo.id);
  i >= 0 ? (datos.regalos[i] = regalo) : datos.regalos.push(regalo);
  if (!guardar()) { datos.regalos = JSON.parse(previo); return; }
  toast('Regalo guardado');
  editarRegalo(regalo.id);
};

/* ================== DATOS INICIALES ================== */
function datosIniciales() {
  return {
    config: { titulo: 'El adviento más especial del año', subtitulo: 'Calendario de adviento particular pre-cumpleaños', total: 24, cumple: '2026-12-28', spoilers: false },
    regalos: [
      { id: 'r01', numero: 1, nombre: 'Calendario de adviento de chocolate', descripcion: 'Una chocolatina para cada día de diciembre.',
        activo: true, fecha: '', entregado: true, foto: '', mensaje: '', retos: [],
        fase: { fecha: '2026-12-01', mensaje: '¡Ya puedes empezar a comértelo! Una ventanita al día, sin trampas 🍫',
          retos: [{ tipo: 'test', pregunta: '¿Cuántas ventanitas tiene un calendario de adviento clásico?', opciones: ['12', '24', '25', '31'], correcta: 1 }] } },
      { id: 'r02', numero: 2, nombre: 'Guantes', descripcion: 'Para que este invierno no se te congelen las manos.',
        activo: true, fecha: '2026-11-24', entregado: false, foto: '', mensaje: 'Pídemelos, los tengo yo 😉',
        pistaCena: { texto: 'A partir de hoy irás recibiendo pistas sobre el restaurante de la cena. Guárdalas bien.', pieza: 0 },
        pistaSiguiente: 'Tu primer regalo tiene la respuesta escrita. ↑ arriba, ↓ abajo:\n↓5 · ↑2 · ↓8 · ↓4',
        retos: [{ tipo: 'queens', segundos: 40, tablero: 'PPPPPPPPOO\nPPBGGGGOOW\nPBBBGGOOWW\nPPBRGOOYYY\nPPRROOTTTY\nPPROOTTTTY\nPPOOYTTVTY\nPOOYYYVVVY\nOOKKYYYVYY\nOKKYYYYYYY' }], fase: null },
      { id: 'r04', numero: 4, nombre: 'Vela', descripcion: '', activo: false, fecha: '', entregado: false, foto: '', mensaje: '',
        retos: [{ tipo: 'memory', parejas: 6 }], fase: null },
      { id: 'r03', numero: 3, nombre: 'Bolsa de deporte', descripcion: '', activo: false, fecha: '', entregado: false, foto: '', mensaje: '',
        retos: [{ tipo: 'wordle', palabra: 'bolsa', intentos: 6 }], fase: null },
      { id: 'r24', numero: 24, nombre: 'Regalo final', descripcion: '', activo: false, fecha: '2026-12-28', entregado: false, foto: '', mensaje: '',
        retos: [], fase: null },
    ],
  };
}

/* ================== ARRANQUE ================== */
(async () => {
  nieve();
  await cargar();
  render();
})();
