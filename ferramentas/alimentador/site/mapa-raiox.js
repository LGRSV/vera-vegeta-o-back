// Mapa da página inicial: dois atalhos por cima de mapa-municipios.js (arquivo à parte para não mexer no mapa).
//  1. Zoom no mapa abre a tela cheia: Ctrl + roda (ou a pinça do touchpad, que o navegador manda como Ctrl + roda) e a
//     pinça de dois dedos no celular, em cima do mapa, viram um clique no botão de tela cheia do próprio mapa (.mt-tc).
//     Sem permissão para a tela cheia do navegador (pinça do touchpad, iPhone), o mapa cobre a janela, como o botão já faz.
//  2. Raio-X: Ctrl+X (⌘X no Mac) ou segurar o olho do ARGOS. Do olho sai uma onda que varre o mapa: atrás dela o
//     Tocantins fica escuro, como um filme de raio-X, e aparece a rede de todos os alimentadores (a mesma de
//     dados/redes/<AL>.json que o município aberto desenha), no lugar das cores e números da NAE. Passar o mouse numa
//     rede mostra o alimentador; clicar abre a página dele. Ctrl+X de novo, Esc ou o olho voltam (a onda volta ao olho).
//     Fora do estado inteiro, primeiro volta ao Tocantins (trilha "Tocantins") e depois varre.
(function () {
  const M = window.MUN, alvo = document.getElementById('mapa-to');
  const svg = alvo && alvo.querySelector('.mt-mapa svg'), caixa = svg && svg.parentNode, olho = document.getElementById('lupa');
  if (!M || !svg) return;
  const NS = 'http://www.w3.org/2000/svg';
  const calmo = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const cheia = () => !!(document.fullscreenElement || document.webkitFullscreenElement) || alvo.classList.contains('mt-cheia');
  const botaoTc = () => caixa.querySelector('.mt-tc');

  // ---------- 1. zoom → tela cheia ----------
  let ultimoGesto = 0;
  const abreCheia = () => {
    const agora = performance.now(), tc = botaoTc();
    if (cheia() || !tc || agora - ultimoGesto < 900) { ultimoGesto = agora; return false; }
    ultimoGesto = agora;
    tc.click();
    return true;
  };
  caixa.addEventListener('wheel', e => {
    if (!e.ctrlKey || cheia()) return;                    // dentro da tela cheia o zoom continua o do navegador
    e.preventDefault();
    abreCheia();
  }, { passive: false });
  let pinca = null;                                       // distância inicial entre os dois dedos
  const dist = t => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  caixa.addEventListener('touchstart', e => { pinca = e.touches.length === 2 && !cheia() ? { d0: dist(e.touches), ok: false } : null; }, { passive: true });
  caixa.addEventListener('touchmove', e => {
    if (!pinca || e.touches.length !== 2) return;
    e.preventDefault();                                   // a página não amplia: quem amplia é a tela cheia
    if (Math.abs(dist(e.touches) - pinca.d0) > 24) pinca.ok = true;
  }, { passive: false });
  caixa.addEventListener('touchend', e => {             // o fim do toque libera a tela cheia do navegador (Android)
    if (pinca && pinca.ok) { pinca = null; abreCheia(); }
    else if (!e.touches.length) pinca = null;
  });

  // ---------- 2. raio-X ----------
  const VB0 = `-6 -6 ${M.w + 12} ${M.h + 12}`;
  const noEstado = () => (svg.getAttribute('viewBox') || '').trim() === VB0 && !alvo.classList.contains('voando');
  // alimentadores do mapa: polo (para o pacote da cópia reduzida), km e NAE somados nos municípios
  const als = new Map();
  M.muns.forEach(m => m.als.forEach(a => {
    const x = als.get(a.cod) || { polo: m.polo, m: 0, n: 0, se: a.se };
    x.m += a.m || 0; x.n += a.n || 0;
    als.set(a.cod, x);
  }));
  const semAcento = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const baixa = u => fetch(u).then(r => r.ok ? r.json() : null).catch(() => null);
  const pacotes = {};
  const rede = (al, polo) => baixa(`dados/redes/${encodeURIComponent(al)}.json`).then(r => r || (polo ?
    (pacotes[polo] = pacotes[polo] || baixa(`dados/redes/polo-${encodeURIComponent(semAcento(polo).replace(/[^a-z0-9]+/g, '-'))}.json`))
      .then(pk => (pk && pk[al]) || null) : null));
  // a rede inteira de um alimentador tem até 160 kB; no estado inteiro um ponto a cada ~0,4 px da tela basta:
  // arredonda na grade q e tira os pontos e segmentos repetidos (fica 5 a 15 vezes menor)
  const Q = (M.w + 12) / 2600;
  function reduz(d) {
    const out = [], re = /([ML])(-?[\d.]+),(-?[\d.]+)/g, visto = new Set();
    let m, ux = null, uy = null, px = null, py = null, wx = null, wy = null;   // u: fim do último segmento; w: último escrito
    while ((m = re.exec(d))) {
      const x = Math.round(+m[2] / Q), y = Math.round(+m[3] / Q);
      if (m[1] === 'M') { px = x; py = y; continue; }
      const ax = px !== null ? px : ux, ay = px !== null ? py : uy;
      px = py = null;
      ux = x; uy = y;
      if (ax === null || (ax === x && ay === y)) continue;
      const k = ax < x || (ax === x && ay < y) ? `${ax},${ay},${x},${y}` : `${x},${y},${ax},${ay}`;
      if (visto.has(k)) continue;
      visto.add(k);
      out.push((ax === wx && ay === wy ? '' : `M${(ax * Q).toFixed(2)},${(ay * Q).toFixed(2)}`) + `L${(x * Q).toFixed(2)},${(y * Q).toFixed(2)}`);
      wx = x; wy = y;
    }
    return out.join('');
  }

  // camada: filme escuro na forma do Tocantins + redes (brilho largo por baixo, traço fino por cima), recortada pela onda
  let camada = null, onda = null, anel = null, filme = null, gRedes = null, carregou = 0, pedidos = false;
  const desenhadas = new Map();                           // cod → d reduzido (fica para a próxima vez)
  function monta() {
    if (camada) return;
    const defs = document.createElementNS(NS, 'defs');
    defs.innerHTML = '<clipPath id="rx-recorte"><circle r="0"/></clipPath>';
    svg.append(defs);
    onda = defs.querySelector('circle');
    camada = document.createElementNS(NS, 'g');
    camada.setAttribute('class', 'rx-camada');
    camada.setAttribute('clip-path', 'url(#rx-recorte)');
    filme = document.createElementNS(NS, 'path');
    filme.setAttribute('class', 'rx-filme');
    filme.setAttribute('d', M.muns.map(m => m.d).join(''));
    gRedes = document.createElementNS(NS, 'g');
    gRedes.setAttribute('class', 'rx-redes');
    camada.append(filme, gRedes);
    anel = document.createElementNS(NS, 'circle');
    anel.setAttribute('class', 'rx-anel');
    anel.setAttribute('r', '0');
    svg.append(camada, anel);
  }
  function poeRede(cod, d) {
    const g = document.createElementNS(NS, 'g');
    g.dataset.al = cod;
    g.innerHTML = `<path class="rx-brilho" d="${d}"/><path class="rx-fio" d="${d}"/>`;
    gRedes.append(g);
  }
  function pedeRedes() {
    if (pedidos) return;
    pedidos = true;
    const fila = [...als.keys()];
    const um = () => {
      const cod = fila.shift();
      if (!cod) return;
      rede(cod, als.get(cod).polo).then(r => {
        if (r && r.d) {
          const d = reduz(r.d);
          desenhadas.set(cod, d);
          poeRede(cod, d);
        }
        carregou++;
        conta();
        um();
      });
    };
    for (let i = 0; i < 8; i++) um();                     // 8 de cada vez
  }

  // aviso embaixo do mapa e balão do alimentador
  const aviso = document.createElement('div');
  aviso.className = 'rx-aviso';
  aviso.setAttribute('role', 'status');
  aviso.hidden = true;
  const balao = document.createElement('div');
  balao.className = 'rx-balao';
  balao.hidden = true;
  caixa.append(aviso, balao);
  const km = m => (m / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 0 });
  function conta() {
    if (!ligado) return;
    const tot = als.size, kmTot = [...als.values()].reduce((s, a) => s + a.m, 0);
    aviso.innerHTML = carregou < tot
      ? `<b>Raio-X</b> carregando a rede · ${carregou} de ${tot} alimentadores`
      : `<b>Raio-X</b> ${desenhadas.size} alimentadores · ${km(kmTot)} km de rede<span class="rx-tecla">Ctrl+X ou Esc volta</span>`;
  }

  // a onda: círculo que cresce a partir do olho (em unidades do mapa), com um anel claro na frente
  let ligado = false, quadro = 0;
  function centroOlho() {
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const r = olho && olho.getBoundingClientRect();
    const px = r && r.width ? r.left + r.width / 2 : svg.getBoundingClientRect().left;
    const py = r && r.width ? r.top + r.height / 2 : svg.getBoundingClientRect().top;
    const p = new DOMPoint(px, py).matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  }
  // durante a onda só o filme é recortado: a rede (até 3,7 MB de traço) fica apagada e aparece quando a onda termina
  // (recortar a rede inteira a cada quadro travava o celular); ao desligar, a rede apaga antes de a onda voltar
  function varre(abre) {
    cancelAnimationFrame(quadro);
    clearTimeout(varre.t);
    gRedes.style.opacity = '0';
    if (!abre && !calmo()) { varre.t = setTimeout(() => onda2(abre), 220); return; }
    onda2(abre);
  }
  function onda2(abre) {
    const c = centroOlho(), [x, y, w, h] = svg.getAttribute('viewBox').split(/\s+/).map(Number);
    const rMax = Math.max(...[[x, y], [x + w, y], [x, y + h], [x + w, y + h]].map(([a, b]) => Math.hypot(a - c.x, b - c.y))) * 1.02;
    [onda, anel].forEach(o => { o.setAttribute('cx', c.x); o.setAttribute('cy', c.y); });
    camada.setAttribute('clip-path', 'url(#rx-recorte)');
    const de = +onda.getAttribute('r') || 0, para = abre ? rMax : 0;
    const dur = calmo() ? 0 : abre ? 1300 : 800, t0 = performance.now();
    const passo = agora => {
      const t = dur ? Math.min(1, Math.max(0, (agora - t0) / dur)) : 1;   // o 1º quadro pode ter hora anterior a t0
      const e = abre ? 1 - Math.pow(1 - t, 3) : t * t;     // abre desacelerando; fecha acelerando para dentro do olho
      const r = de + (para - de) * e;
      onda.setAttribute('r', r.toFixed(1));
      anel.setAttribute('r', r.toFixed(1));
      anel.style.opacity = t < 1 ? String(Math.min(1, (1 - t) * 2.2)) : '0';
      if (t < 1) { quadro = requestAnimationFrame(passo); return; }
      if (abre) { camada.removeAttribute('clip-path'); gRedes.style.opacity = '1'; }   // parado: sem recorte, rede acende
      else { alvo.classList.remove('raiox'); camada.style.display = 'none'; }
    };
    quadro = requestAnimationFrame(passo);
  }
  function liga() {
    if (ligado) return;
    ligado = true;
    monta();
    camada.style.display = '';
    alvo.classList.add('raiox', 'raiox-vai');
    setTimeout(() => alvo.classList.remove('raiox-vai'), 1400);
    olho && olho.classList.add('rx-olho');
    aviso.hidden = false;
    conta();
    pedeRedes();
    varre(true);
  }
  function desliga() {
    if (!ligado) return;
    ligado = false;
    olho && olho.classList.remove('rx-olho');
    aviso.hidden = true;
    balao.hidden = true;
    varre(false);
  }
  // fora do estado inteiro: volta ao Tocantins pela trilha e varre quando o mapa pousar
  function alterna() {
    if (ligado) { desliga(); return; }
    if (noEstado()) { liga(); return; }
    const volta = alvo.querySelector('.mt-passo[data-ir="estado"]');
    if (volta) volta.click();
    const t0 = performance.now();
    const espera = () => {
      if (noEstado()) liga();
      else if (performance.now() - t0 < 3000) setTimeout(espera, 60);
    };
    setTimeout(espera, 60);
  }

  const editavel = t => t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
  window.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (e.key === 'x' || e.key === 'X')) {
      if (editavel(e.target) || String(window.getSelection && getSelection()).trim()) return;   // recortar texto continua
      if (!alvo.offsetParent && !cheia()) return;
      e.preventDefault();
      alterna();
    } else if (e.key === 'Escape' && ligado) {
      e.preventDefault();                                 // o mapa não sobe de nível nem sai da tela cheia por este Esc
      desliga();
    }
  }, true);
  // celular: segurar o olho (meio segundo) liga e desliga; o toque curto continua abrindo a busca
  if (olho) {
    let seg = 0, segurou = false;
    const solta = () => clearTimeout(seg);
    olho.addEventListener('pointerdown', e => {
      if (e.button) return;
      segurou = false;
      seg = setTimeout(() => { segurou = true; alterna(); if (navigator.vibrate) try { navigator.vibrate(15); } catch (_) {} }, 550);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => olho.addEventListener(ev, solta));
    olho.addEventListener('click', e => { if (segurou) { e.preventDefault(); e.stopImmediatePropagation(); segurou = false; } }, true);
    olho.addEventListener('contextmenu', e => { if (segurou || seg) e.preventDefault(); });
    if (!olho.title) olho.title = 'Buscar · Ctrl+X: raio-X da rede';
  }

  // rede sob o mouse: balão com o alimentador; clique abre a página dele
  let sobre = null;
  svg.addEventListener('pointermove', e => {
    if (!ligado) return;
    const g = e.target.closest && e.target.closest('.rx-redes g');
    if (g !== sobre) {
      if (sobre) sobre.classList.remove('on');
      sobre = g;
      if (g) { g.classList.add('on'); g.parentNode.append(g); }
    }
    if (!g) { balao.hidden = true; return; }
    const a = als.get(g.dataset.al) || {}, r = caixa.getBoundingClientRect();
    balao.innerHTML = `<b>${g.dataset.al}</b>${a.se ? `<span>${a.se}</span>` : ''}<span>${km(a.m)} km · ${(a.n || 0).toLocaleString('pt-BR')} NAE</span>`;
    balao.style.left = (e.clientX - r.left + 14) + 'px';
    balao.style.top = (e.clientY - r.top + 14) + 'px';
    balao.hidden = false;
  });
  svg.addEventListener('pointerleave', () => { balao.hidden = true; if (sobre) sobre.classList.remove('on'); sobre = null; });
  svg.addEventListener('click', e => {
    if (!ligado) return;
    const g = e.target.closest && e.target.closest('.rx-redes g');
    e.stopImmediatePropagation();                         // no raio-X o clique não abre regional nem município
    if (g && window.ARGOS_PAG) window.ARGOS_PAG.abre(`alimentadores/${encodeURIComponent(g.dataset.al)}/`);
  }, true);
})();
