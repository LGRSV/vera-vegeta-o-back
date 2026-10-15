// Mapa dos municípios do Tocantins na página inicial (usa window.MUN de mapa-municipios-dados.js).
// Cada município pintado pela NAE dele (faixas), com o contorno das regionais por cima. Clicar numa regional aproxima
// nela e separa os polos (cada polo controla um grupo de municípios); aí clicar num município abre a página dele.
// A busca de município (#busca) abre a lista suspensa de todos os municípios (#mun-lista) e acende os achados no mapa.
// A casca (#mapa-to com a barra e o svg com viewBox) vem pronta no HTML de scripts/gera_trechos.py
// e todo o estilo está em assets/site.css: este script só preenche, nada muda de tamanho nem de lugar ao carregar.
(function () {
  const M = window.MUN, alvo = document.getElementById('mapa-to');
  if (!M || !alvo || !alvo.querySelector('.mt-mapa svg')) return;
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  // páginas que a cópia do Artifact não leva (municípios, alimentadores, polos, relatório) abrem no site publicado, em outra aba;
  // no próprio site (github.io) e no teste local tudo continua relativo, como antes
  const SITE = 'https://lgrsv.github.io/vera-vegeta-o-back/teste/';
  const noSite = /(^|\.)github\.io$|^localhost$|^127\.0\.0\.1$/.test(location.hostname);
  const pag = p => noSite ? p : SITE + p;
  const alvoA = noSite ? '' : ' target="_blank" rel="noopener"';
  const vaiPag = p => { if (noSite) location.href = p; else window.open(SITE + p, '_blank', 'noopener'); };
  window.ARGOS_PAG = { url: pag, alvo: alvoA, abre: vaiPag };
  if (!noSite) document.querySelectorAll('.cab-link[href], .rodape a[href]').forEach(a => {
    a.href = pag(a.getAttribute('href')); a.target = '_blank'; a.rel = 'noopener';
  });
  const km = m => (m / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' km';
  const semAcento = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const kmTot = m => m.als.reduce((s, a) => s + a.m, 0);
  const nAls = m => `${m.als.length} alimentador${m.als.length > 1 ? 'es' : ''}`;
  const porCod = Object.fromEntries(M.muns.map(m => [m.cod, m]));

  const svg = alvo.querySelector('.mt-mapa svg'), dica = alvo.querySelector('.mt-dica'), caixa = svg.parentNode;
  const VW = M.w + 12;
  svg.setAttribute('viewBox', `-6 -6 ${VW} ${M.h + 12}`);
  const NS = 'http://www.w3.org/2000/svg', el = {}, rot = {};
  let foco = null, achou = new Set();
  // cor de cada município pela NAE dele (faixas; a legenda sai daqui) e, por cima, o contorno das regionais
  const FAIXAS = [0, 1, 11, 31, 101, 201];
  const faixa = n => FAIXAS.reduce((k, l, i) => n >= l ? i : k, 0);
  const rotFaixa = i => i === 0 ? 'Sem NAE' : i === FAIXAS.length - 1 ? `${FAIXAS[i]} ou mais` : `${FAIXAS[i]} a ${FAIXAS[i + 1] - 1}`;
  // municípios agrupados por polo (o grupo é o que se afasta ao abrir a regional), com o contorno do polo no fim do grupo
  const grp = {};
  const grupo = m => {
    if (!m.polo) return svg;
    if (!grp[m.polo]) {
      const gp = grp[m.polo] = document.createElementNS(NS, 'g');
      gp.setAttribute('class', 'mt-polo');
      gp.dataset.reg = m.reg;
      svg.append(gp);
    }
    return grp[m.polo];
  };
  M.muns.forEach(m => {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', m.d);
    p.setAttribute('class', `mun ${m.slug ? 'tem' : 'sem'} nae-${faixa(m.nae || 0)}`);
    if (m.slug) { p.setAttribute('tabindex', '-1'); p.setAttribute('role', 'button'); p.setAttribute('aria-label', m.nome); }
    p.dataset.cod = m.cod;
    grupo(m).append(p);
    el[m.cod] = p;
  });
  // contorno do polo: um traço claro por baixo (fundo) faz a cor aparecer também sobre os municípios laranja
  Object.entries(grp).forEach(([polo, gp]) => ['mt-poloc fundo', 'mt-poloc'].forEach(cl => {
    const c = document.createElementNS(NS, 'path');
    c.setAttribute('class', cl);
    c.setAttribute('aria-hidden', 'true');
    c.setAttribute('d', (M.pols || {})[polo] || '');
    gp.append(c);
  }));
  const regs = document.createElementNS(NS, 'g');
  regs.setAttribute('class', 'mt-regc');
  regs.setAttribute('aria-hidden', 'true');
  Object.values(M.regs || {}).forEach(d => { const p = document.createElementNS(NS, 'path'); p.setAttribute('d', d); regs.append(p); });
  svg.append(regs);
  // legenda das faixas de NAE: fixa lá em cima, na barra da lupa (que acompanha a rolagem), logo depois do olho, com o
  // título "NAE-Vegetação" acima da faixa de cores. Clicar nela (ou arrastar para cima) esconde: sobra só uma orelhinha,
  // que clicada (ou puxada para baixo) traz de volta. Escondida, os números de NAE saem do mapa em todos os níveis
  // (cartões das regionais, dos polos e dos municípios, botões da barra, balão do mouse e listas): fica só a cor.
  // A escolha fica guardada no navegador.
  let leg = alvo.querySelector('.mt-regs');
  const barra = alvo.querySelector('.mt-barra');
  let legAberta = true;
  try { legAberta = localStorage.getItem('argos-legenda') !== 'fechada'; } catch (e) { /* sem armazenamento: aberta */ }
  if (leg) {
    const nova = document.createElement('div');
    nova.className = 'mt-regs';
    leg.replaceWith(nova);
    leg = nova;
    const cores = FAIXAS.map((l, i) => `<i class="nae-${i}"></i>`).join('');
    leg.innerHTML = '<div class="mt-regs-c" id="mt-regs-c"><b class="mt-regs-t" aria-hidden="true">NAE-Vegetação</b>' +
      '<div class="mt-rampa" role="list" aria-label="Faixas de NAE-Vegetação">' + FAIXAS.map((l, i) => `<span role="listitem" title="${rotFaixa(i)}"><i class="nae-${i}" aria-hidden="true"></i>` +
      `<em aria-hidden="true"><span class="mt-f-l">${i === 0 ? '0' : i === FAIXAS.length - 1 ? l + '+' : l + '–' + (FAIXAS[i + 1] - 1)}</span><span class="mt-f-c">${i === FAIXAS.length - 1 ? l + '+' : l}</span></em>` +
      `<span class="vh">${rotFaixa(i)}</span></span>`).join('') + '</div></div>' +
      `<button type="button" class="mt-regs-b" aria-controls="mt-regs-c" aria-label="Legenda NAE-Vegetação"><span class="mt-regs-m" aria-hidden="true">${cores}</span>` +
      '<span class="mt-regs-o">NAE</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 15 6-6 6 6"/></svg></button>';
    (barra || caixa).append(leg);
  }
  const legBt = leg && leg.querySelector('.mt-regs-b'), legC = leg && leg.querySelector('.mt-regs-c');
  function legenda(sim, guarda) {
    legAberta = sim;
    alvo.classList.toggle('sem-nae', !sim);
    if (leg) {
      leg.classList.toggle('fechada', !sim);
      legC.hidden = !sim;
      legBt.setAttribute('aria-expanded', String(sim));
      leg.title = legBt.title = sim ? 'Esconder a legenda e os números de NAE (clique ou arraste para cima)' : 'Mostrar a legenda e os números de NAE (clique ou puxe para baixo)';
    }
    if (!guarda) return;
    try { localStorage.setItem('argos-legenda', sim ? 'aberta' : 'fechada'); } catch (e) { /* só nesta visita */ }
    poeNomes();                                         // sem o número os cartões dos municípios encolhem: cabem mais nomes
  }
  legenda(legAberta);
  if (leg) {                                            // clique em qualquer ponto dela, ou arrastar: para cima esconde, para baixo mostra
    let y0 = null, arrastou = false;
    leg.addEventListener('pointerdown', e => { if (!e.button) { y0 = e.clientY; arrastou = false; } });
    document.addEventListener('pointermove', e => {      // no documento: a orelhinha é pequena e o arrasto sai dela
      if (y0 === null) return;
      const dy = e.clientY - y0;
      if (legAberta ? dy < -16 : dy > 16) { y0 = null; arrastou = true; legenda(!legAberta, true); }
    });
    document.addEventListener('pointerup', () => { y0 = null; setTimeout(() => { arrastou = false; }, 0); });   // o clique que vem logo depois do arrasto é ignorado
    document.addEventListener('pointercancel', () => { y0 = null; });
    leg.addEventListener('click', () => { if (arrastou) { arrastou = false; return; } legenda(!legAberta, true); });
  }
  // teclado: um só município na ordem do Tab (o escolhido, ou Palmas); as setas andam pelo mapa
  const roda = cod => {
    svg.querySelectorAll('.mun[tabindex="0"]').forEach(p => p.setAttribute('tabindex', '-1'));
    el[cod].setAttribute('tabindex', '0');
  };
  const inicial = M.muns.find(m => m.slug && m.busca === 'palmas') || M.muns.find(m => m.slug);
  if (inicial) roda(inicial.cod);

  // nomes: no estado inteiro aparecem só as regionais (Norte, Centro, Sul); o município escolhido também aparece
  const REF = [];
  const g = document.createElementNS(NS, 'g');
  g.setAttribute('class', 'mt-nomes');
  g.setAttribute('aria-hidden', 'true');
  M.muns.forEach(m => {
    const t = document.createElementNS(NS, 'text');
    t.setAttribute('x', m.c[0]); t.setAttribute('y', m.c[1]);
    t.setAttribute('class', 'mt-rot oculto');
    t.textContent = m.nome;
    t.dataset.cod = m.cod;
    t.dataset.p = m.slug ? kmTot(m) : -1;
    g.append(t);
    rot[m.cod] = t;
  });
  svg.append(g);
  // regionais no estado inteiro: um cartãozinho com o nome e a NAE de cada uma, todos alinhados no meio do mapa, cada um
  // na altura do meio dos municípios da sua regional; clicar abre a regional (e eles somem até voltar ao Tocantins).
  // Os cartões dos polos só aparecem na barra da lupa depois de abrir uma regional.
  // Bandeirinhas (pedido do usuário): o cartão de cada regional, e na regional o de cada polo, fica fora do desenho, logo
  // acima do contorno dela, preso por um fio curto que sobe de um ponto do contorno. O lugar é procurado ao longo do
  // contorno: o que não cobre o mapa nem outro cartão, com o fio mais curto.
  const fios = document.createElement('div');
  fios.className = 'mt-bandeiras';
  fios.setAttribute('aria-hidden', 'true');
  caixa.append(fios);
  const fio = (ax, ay, bx, by, cor) => `<i class="mt-fio" style="left:${ax.toFixed(1)}px;top:${ay.toFixed(1)}px;width:${Math.hypot(bx - ax, by - ay).toFixed(1)}px;` +
    `transform:rotate(${Math.atan2(by - ay, bx - ax).toFixed(4)}rad)${cor ? ';--c:' + cor : ''}"></i><i class="mt-pino" style="left:${ax.toFixed(1)}px;top:${ay.toFixed(1)}px${cor ? ';--c:' + cor : ''}"></i>`;
  const rel = r => { const c = caixa.getBoundingClientRect(); return { left: r.left - c.left, right: r.right - c.left, top: r.top - c.top, bottom: r.bottom - c.top }; };
  const p2d = {};
  function mascara(ms) {                                   // o que está desenhado na tela (px da caixa, de 2 em 2 px)
    const c = caixa.getBoundingClientRect(), E = 2, W = Math.max(1, Math.ceil(c.width / E)), H = Math.max(1, Math.ceil(c.height / E));
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const g2 = cv.getContext('2d');
    ms.forEach(m => {
      const t = el[m.cod].getScreenCTM();
      if (!t) return;
      g2.setTransform(t.a / E, t.b / E, t.c / E, t.d / E, (t.e - c.left) / E, (t.f - c.top) / E);
      g2.fill(p2d[m.cod] || (p2d[m.cod] = new Path2D(m.d)));
    });
    const px = g2.getImageData(0, 0, W, H).data;
    return (x, y) => { const i = x / E | 0, j = y / E | 0; return i >= 0 && j >= 0 && i < W && j < H && px[(j * W + i) * 4 + 3] > 0; };
  }
  function contorno(path, n) {                             // n pontos ao longo do contorno, em px da caixa
    const t = path && path.getScreenCTM(), c = caixa.getBoundingClientRect(), L = path ? path.getTotalLength() : 0, out = [];
    if (!t || !L) return out;
    for (let i = 0; i < n; i++) { const q = path.getPointAtLength(L * (i + .5) / n); out.push({ x: t.a * q.x + t.c * q.y + t.e - c.left, y: t.b * q.x + t.d * q.y + t.f - c.top }); }
    return out;
  }
  // melhor lugar para um cartão w×h em cima de um ponto do contorno, com o fio de 14 a 40 px: o que menos cobre o mapa,
  // depois o fio que não atravessa o desenho, depois o fio mais curto
  function planta(pts, w, h, noMapa, obst, CW, CH) {
    let melhor = null;
    for (const p of pts) for (const L of [14, 24, 40]) for (const al of [.5, .15, .85]) {
      const x = p.x - w * al, y = p.y - L - h;
      if (x < 2 || y < 2 || x + w > CW - 2 || y + h > CH - 2) continue;
      const R = { left: x, top: y, right: x + w, bottom: y + h };
      if (obst.some(o => R.left < o.right + 6 && R.right + 6 > o.left && R.top < o.bottom + 6 && R.bottom + 6 > o.top)) continue;
      let cobre = 0, corta = 0;
      for (let i = 0; i <= 4; i++) for (let j = 0; j <= 2; j++) if (noMapa(x + w * i / 4, y + h * j / 2)) cobre++;
      for (let k = 1; k <= 3; k++) if (noMapa(p.x, p.y - 3 - (L - 3) * k / 3)) corta++;
      const nota = cobre * 100 + corta * 30 + L + Math.abs(al - .5) * 8;
      if (!melhor || nota < melhor.nota) melhor = { nota, x, y, ax: p.x, ay: p.y, R };
    }
    return melhor;
  }
  // põe cada cartão (k.e) no lugar achado no contorno (k.path) e devolve os fios; sem lugar, o cartão fica no meio do grupo
  function bandeiras(cards, ms) {
    const c = caixa.getBoundingClientRect(), noMapa = mascara(ms), ctm = svg.getScreenCTM(), linhas = [];
    let feitos = [];
    try { feitos = [tc, volta].filter(o => o && o.offsetParent).map(o => rel(o.getBoundingClientRect())); } catch (e) { /* ainda montando */ }
    cards.forEach(k => {
      const w = k.e.offsetWidth, h = k.e.offsetHeight, b = planta(contorno(k.path, 90), w, h, noMapa, feitos, c.width, c.height);
      if (!b) {
        const pt = svg.createSVGPoint();
        [pt.x, pt.y] = k.centro;
        const s = pt.matrixTransform(ctm);
        k.e.style.left = (s.x - c.left - w / 2).toFixed(0) + 'px'; k.e.style.top = (s.y - c.top - h / 2).toFixed(0) + 'px';
        return;
      }
      k.e.style.left = b.x.toFixed(0) + 'px'; k.e.style.top = b.y.toFixed(0) + 'px';
      feitos.push(b.R, { left: b.ax - 2, right: b.ax + 2, top: b.y + h, bottom: b.ay });   // o fio também não pode ser coberto
      linhas.push(fio(b.ax, b.ay, b.ax, b.y + h, k.cor));
    });
    return linhas.join('');
  }
  const meio = ms => {                                     // município mais perto do meio do grupo: o ponto cai dentro dele
    const mx = ms.reduce((s, m) => s + m.c[0], 0) / ms.length, my = ms.reduce((s, m) => s + m.c[1], 0) / ms.length;
    return ms.reduce((a, b) => Math.hypot(b.c[0] - mx, b.c[1] - my) < Math.hypot(a.c[0] - mx, a.c[1] - my) ? b : a);
  };
  const cartoes = document.createElement('div');
  cartoes.className = 'mt-regcards';
  const regInfo = Object.keys(M.regs || {}).map(r => {
    const ms = M.muns.filter(m => m.reg === r);
    return { r, a: meio(ms).c, nae: ms.reduce((s, m) => s + (m.nae || 0), 0) };
  });
  cartoes.innerHTML = regInfo.map(i => `<button type="button" data-reg="${esc(i.r)}" aria-label="Abrir a Regional ${esc(i.r)}, ${i.nae.toLocaleString('pt-BR')} NAE">` +
    `<b>${esc(i.r)}</b><i>${i.nae.toLocaleString('pt-BR')} NAE</i></button>`).join('');
  caixa.append(cartoes);
  cartoes.addEventListener('click', e => { const b = e.target.closest('button'); if (b) entra(b.dataset.reg, e.detail === 0); });
  const poeCartoes = () => {                                // só no estado inteiro e parado (o contorno é lido da tela)
    if (caixa.classList.contains('aberta') || caixa.classList.contains('voando') || !svg.getBoundingClientRect().width) return;
    fios.innerHTML = bandeiras([...cartoes.children].map((e, i) => ({ e, path: regs.children[i], centro: regInfo[i].a })), M.muns);
  };
  const prio = t => t.dataset.cod === foco ? 2 : achou.has(t.dataset.cod) ? 1 : 0;
  const X0 = -6, X1 = M.w + 6;
  function desamontoa() {            // os que se cruzam somem (o escolhido e os achados ganham dos outros)
    const ts = [...g.children].filter(t => !t.classList.contains('oculto')).sort((a, b) => prio(b) - prio(a) || b.dataset.p - a.dataset.p);
    const ok = [];
    ts.forEach(t => {
      t.style.display = '';
      const cx = porCod[t.dataset.cod].c[0];
      t.setAttribute('x', cx);
      const r = t.getBBox();
      const dx = Math.max(X0 - r.x, 0) - Math.max(r.x + r.width - X1, 0);   // nome na beira do estado não sai da tela
      if (dx) { t.setAttribute('x', cx + dx); r.x += dx; }
      if (ok.some(q => r.x < q.x + q.width + 2 && r.x + r.width + 2 > q.x && r.y < q.y + q.height && r.y + r.height > q.y)) t.style.display = 'none';
      else ok.push(r);
    });
  }
  function rotulos() {
    M.muns.forEach(m => {
      const t = rot[m.cod], f = m.cod === foco, a = achou.has(m.cod);
      t.classList.toggle('foco', f);
      t.classList.toggle('achou', a && !f);
      t.classList.toggle('oculto', !(f || a || REF.includes(m.busca)));
    });
    desamontoa();
  }
  // letra de ~11,5 px na tela em qualquer largura do mapa
  const escala = () => {
    const r = svg.getBoundingClientRect();                 // o SVG pode ficar limitado pela altura (max-height)
    if (!r.width || !r.height) return;
    g.style.setProperty('--k', (1 / Math.min(r.width / VW, r.height / (M.h + 12))).toFixed(3));
    poeCartoes();
    desamontoa();
  };
  rotulos();
  if (window.ResizeObserver) new ResizeObserver(escala).observe(svg); else escala();

  // contorno do município por cima dos vizinhos (antes do contorno das regionais e dos nomes); quem está com o foco do teclado não o perde
  const traz = p => {
    const gp = p.parentNode, fim = gp.querySelector('.mt-poloc');
    if (p.nextSibling === fim && gp.nextSibling === regs) return;
    const tinha = document.activeElement === p;
    if (fim) { gp.insertBefore(p, fim); svg.insertBefore(gp, regs); } else svg.insertBefore(p, regs);
    if (tinha && document.activeElement !== p) p.focus({ preventScroll: true });
  };

  svg.addEventListener('mousemove', e => {
    const rd = e.target.closest('.mt-redes path[data-al]');
    if (rd) {
      const m = porCod[mun], a = m.als.find(x => x.cod === rd.dataset.al), r = caixa.getBoundingClientRect();
      realceAl(a.cod);
      dica.innerHTML = `<span class="mt-dica-h"><b class="cod">${esc(a.cod)}</b><i>${(a.n || 0).toLocaleString('pt-BR')} NAE</i></span><small>${esc(a.se)} · ${km(a.m)} em ${esc(m.nome)}</small>` +
        `<small class="mt-dica-c">${alf === a.cod ? 'Clique para abrir o alimentador' : 'Clique para dar zoom no alimentador'}</small>`;
      dica.style.left = (e.clientX - r.left) + 'px'; dica.style.top = (e.clientY - r.top) + 'px'; dica.style.display = 'block';
      return;
    }
    if (mun) realceAl(null);
    const p = e.target.closest('.mun');
    if (!p) { dica.style.display = 'none'; return; }
    const m = porCod[p.dataset.cod], r = caixa.getBoundingClientRect();
    if (!reg) realca(m.reg); else if (!pol) realcaPolo(m.reg === reg ? m.polo : null);
    dica.innerHTML = `<span class="mt-dica-h"><b>${esc(m.nome)}</b><i>${(m.nae || 0).toLocaleString('pt-BR')} NAE</i></span><small>${m.reg ? `Regional ${esc(m.reg)} · ${esc(m.polo)}` : ''}${m.slug ? `${m.reg ? ' · ' : ''}${nAls(m)} · ${km(kmTot(m))}` : `${m.reg ? ' · ' : ''}sem dados ainda`}</small>` +
      (!reg && m.reg ? `<small class="mt-dica-c">Clique para ver os polos da Regional ${esc(m.reg)}</small>` :
        reg && !pol && m.reg === reg ? `<small class="mt-dica-c">Clique para ver os municípios de ${esc(m.polo)}</small>` :
        pol && !mun && m.polo === pol && m.slug ? '<small class="mt-dica-c">Clique para ver os alimentadores</small>' : '');
    dica.style.left = (e.clientX - r.left) + 'px'; dica.style.top = (e.clientY - r.top) + 'px'; dica.style.display = 'block';
  });
  svg.addEventListener('mouseleave', () => { dica.style.display = 'none'; if (!reg) realca(null); else if (!pol) realcaPolo(null); else if (mun) realceAl(null); });

  // regional aberta: o mapa aproxima nela, as outras somem e os polos se afastam um do outro (do centro da regional
  // para fora). Ao fim da animação cada polo ganha o contorno na cor dele, e a legenda ao lado (como o T1/T2/T3 do
  // painel) lista os polos com a mesma cor, os municípios e a NAE; tocar num polo da legenda apaga ou acende ele no mapa.
  // "← Tocantins" ou Esc voltam ao estado inteiro.
  // Polo aberto (clicar num polo da regional aberta): do mesmo jeito, o mapa aproxima no polo e os municípios dele se
  // afastam um do outro, com o nome de cada um; aí clicar num município abre a página dele. "← Regional" ou Esc voltam.
  let reg = null, pol = null, anima = 0, mdesl = {}, corDe = {};
  const TODO = [-6, -6, VW, M.h + 12], AFASTA = 0.32, AFASTA_MUN = 0.30, DUR = 650, CORES = ['a', 'b', 'c', 'd'];
  const calmo = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const vb = () => svg.getAttribute('viewBox').split(' ').map(Number);
  const une = (a, b) => !a ? b : { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), x2: Math.max(a.x2, b.x2), y2: Math.max(a.y2, b.y2) };
  const caixaDe = e => { const r = e.getBBox(); return { x: r.x, y: r.y, x2: r.x + r.width, y2: r.y + r.height }; };
  const polosDe = r => Object.entries(grp).filter(([, gp]) => gp.dataset.reg === r);
  function realca(r) {
    Object.values(grp).forEach(gp => gp.classList.toggle('apaga', !!r && gp.dataset.reg !== r));
  }
  function realcaPolo(polo) {
    polosDe(reg).forEach(([po, gp]) => gp.classList.toggle('apaga', !!polo && po !== polo));
  }
  const soma = (a, b) => [a[0] + b[0], a[1] + b[1]];
  const tr = d => `translate(${d[0].toFixed(1)}px,${d[1].toFixed(1)}px)`;
  function voa(alvoVb) {             // anima o viewBox até o alvo
    cancelAnimationFrame(anima);
    caixa.classList.remove('pronta');
    caixa.classList.add('voando');
    const de = vb(), t0 = performance.now(), dur = calmo() ? 0 : DUR;
    document.dispatchEvent(new CustomEvent('argos-nivel', { detail: { reg, pol, mun, al: alf } }));   // a busca acompanha o nível
    const passo = agora => {
      const t = dur ? Math.min(1, (agora - t0) / dur) : 1, e = t < .5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      svg.setAttribute('viewBox', de.map((v, i) => +(v + (alvoVb[i] - v) * e).toFixed(2)).join(' '));
      if (t < 1) anima = requestAnimationFrame(passo); else { anima = 0; caixa.classList.remove('voando'); caixa.classList.toggle('pronta', !!reg); if (!reg) poeCartoes(); poeNomes(); poeSelos(); }
    };
    selos.innerHTML = '';
    fios.innerHTML = '';
    anima = requestAnimationFrame(passo);
  }
  const volta = document.createElement('button');
  volta.type = 'button';
  volta.className = 'mt-volta';
  volta.hidden = true;
  volta.textContent = '←';
  // polos da regional aberta: lá em cima, na barra da lupa (economiza o espaço do mapa)
  const legPolos = document.createElement('span');
  legPolos.className = 'mt-polos';
  legPolos.setAttribute('role', 'group');
  legPolos.hidden = true;
  (document.querySelector('.mt-barra') || caixa).append(legPolos);
  // alimentadores do município aberto: no computador na coluna da esquerda; no celular presos embaixo do mapa, numa
  // caixinha fechada que uma seta discreta puxa para cima (site.css)
  const legAl = document.createElement('span');
  legAl.className = 'mt-als';
  legAl.setAttribute('role', 'group');
  legAl.hidden = true;
  let puxada = false;
  const caixaPolos = (titulo, chips) => `<button type="button" class="mt-puxa" aria-expanded="${puxada}" aria-label="${puxada ? 'Esconder' : 'Mostrar'} os alimentadores">` +
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 15 6-6 6 6"/></svg></button>' +
    `<span class="mt-polos-c"><b class="mt-polos-t">${titulo}</b>${chips}</span>`;
  // coluna da esquerda do mapa: a seta de voltar e, com o município aberto, os alimentadores dele
  const lado = document.createElement('div');
  lado.className = 'mt-lado';
  lado.append(volta, legAl);
  caixa.append(lado);
  // NAE de cada polo num selo vermelho no meio dele (regional aberta, depois da animação)
  const selos = document.createElement('div');
  selos.className = 'mt-selos';
  selos.setAttribute('aria-hidden', 'true');
  caixa.append(selos);
  // tela cheia: o mapa todo (barra da lupa, legenda e mapa) cobre a tela; o mesmo botão ou Esc voltam. Sem a API de tela
  // cheia (iPhone, ou dentro de um iframe que não permite) o mapa cobre a janela (classe .mt-cheia no site.css)
  const tc = document.createElement('button');
  tc.type = 'button';
  tc.className = 'mt-tc';
  const ICO_TC = { abre: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5', sai: 'M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5' };
  const nativa = () => (document.fullscreenElement || document.webkitFullscreenElement) === alvo;
  const cheia = () => nativa() || alvo.classList.contains('mt-cheia');
  const marcaTc = () => {
    const sim = cheia();
    tc.setAttribute('aria-label', sim ? 'Sair da tela cheia' : 'Mapa em tela cheia');
    tc.title = sim ? 'Sair da tela cheia (Esc)' : 'Mapa em tela cheia';
    tc.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${sim ? ICO_TC.sai : ICO_TC.abre}"/></svg>`;
  };
  const cobre = sim => {
    alvo.classList.toggle('mt-cheia', sim);
    document.documentElement.classList.toggle('mt-cheia-trava', sim);   // a página atrás não rola
    marcaTc();
  };
  function telaCheia(sim) {
    if (!sim) {
      if (alvo.classList.contains('mt-cheia')) cobre(false);
      else if (nativa()) { const p = (document.exitFullscreen || document.webkitExitFullscreen).call(document); if (p && p.catch) p.catch(() => {}); }
      return;
    }
    const pede = alvo.requestFullscreen || alvo.webkitRequestFullscreen;
    if (!pede || !(document.fullscreenEnabled || document.webkitFullscreenEnabled)) { cobre(true); return; }
    try { const p = pede.call(alvo); if (p && p.catch) p.catch(() => cobre(true)); } catch (e) { cobre(true); }
  }
  tc.addEventListener('click', () => telaCheia(!cheia()));
  ['fullscreenchange', 'webkitfullscreenchange'].forEach(ev => document.addEventListener(ev, marcaTc));
  marcaTc();
  caixa.append(tc);
  let desl = {};
  // enquadra a regional aberta deixando livre a coluna da legenda (computador) ou o topo para o "← Tocantins" (celular)
  const move = (b, [dx, dy]) => ({ x: b.x + dx, y: b.y + dy, x2: b.x2 + dx, y2: b.y2 + dy });
  function enquadra() {
    let bb = null;
    if (alCaixa) bb = alCaixa;
    else if (mun) bb = move(caixaDe(el[mun]), soma(desl[pol], mdesl[mun]));
    else if (pol) M.muns.forEach(m => { if (m.polo === pol) bb = une(bb, move(caixaDe(el[m.cod]), soma(desl[pol], mdesl[m.cod]))); });
    else polosDe(reg).forEach(([polo, gp]) => { bb = une(bb, move(caixaDe(gp), desl[polo])); });
    const x = bb.x - 12, y = bb.y - 12, w = bb.x2 - bb.x + 24, h = bb.y2 - bb.y + 24, W = caixa.clientWidth;
    // celular (mesmo corte do site.css): sobra o topo para a seta de voltar e o pé para a seta dos polos
    if (matchMedia('(max-width:860px)').matches) { const t = 52 * w / W, f = 52 * w / W; return [x, y - t, w, h + t + f]; }
    // a coluna da esquerda (seta e lista de alimentadores) fica livre; a legenda fica na barra, em cima do mapa
    // com a busca da barra, a lista do município aberto abre embaixo da logo (largura fixa no site.css): o lado esquerdo fica livre para ela
    const lista = window.ARGOS_BUSCA && mun && !alf ? Math.min(460, innerWidth - 32) : 0;
    // na regional sobra uma faixa em cima e um pouco à direita para as bandeirinhas dos polos
    const T = reg && !pol && !mun && !alf ? 56 : 0;
    const H = svg.clientHeight || 600, L1 = Math.max(lado.offsetWidth, leg && caixa.contains(leg) ? leg.offsetWidth : 0, lista) + 24, L2 = T ? 120 : 24;
    const k = Math.min((H - T) / h, Math.max(1e-3, W - L1 - L2) / w);
    const altura = H / k;
    return [x - L1 / k, y - T / k - ((H - T) / k - h) / 2, w + (L1 + L2) / k, altura];
  }
  function entra(r, teclado, cod) {
    if (!r || reg === r) return;
    reg = r;
    realca(null);
    dica.style.display = 'none';
    const ps = polosDe(r).map(([polo, gp]) => {
      const ms = M.muns.filter(m => m.polo === polo), b = caixaDe(gp);
      return { polo, gp, ms, nae: ms.reduce((s, m) => s + (m.nae || 0), 0), cx: (b.x + b.x2) / 2, cy: (b.y + b.y2) / 2, b };
    });
    const vai = k => Math.max(...ps.map(p => p[k])) - Math.min(...ps.map(p => p[k]));
    const eixo = vai('cy') >= vai('cx') ? 'cy' : 'cx';            // legenda na ordem do mapa: de cima para baixo ou da esquerda para a direita
    ps.sort((a, b) => a[eixo] - b[eixo]);
    const rb = ps.reduce((a, p) => une(a, p.b), null), rc = [(rb.x + rb.x2) / 2, (rb.y + rb.y2) / 2];
    desl = {};
    ps.forEach((p, i) => {
      desl[p.polo] = [(p.cx - rc[0]) * AFASTA, (p.cy - rc[1]) * AFASTA];
      p.gp.style.setProperty('--pc', `var(--polo-${CORES[i % CORES.length]})`);
    });
    Object.entries(grp).forEach(([polo, gp]) => {
      const dentro = gp.dataset.reg === r;
      gp.classList.toggle('fora', !dentro);
      gp.classList.remove('desliga');
      gp.style.transform = dentro ? `translate(${desl[polo][0].toFixed(1)}px,${desl[polo][1].toFixed(1)}px)` : '';
    });
    caixa.classList.add('aberta');
    corDe = Object.fromEntries(ps.map((p, i) => [p.polo, `var(--polo-${CORES[i % CORES.length]})`]));
    legendaRegional(ps);
    legPolos.hidden = false;
    volta.hidden = false;
    voa(enquadra());
    const prim = porCod[cod] && porCod[cod].slug ? porCod[cod] : M.muns.filter(m => m.reg === r && m.slug).sort((a, b) => kmTot(b) - kmTot(a))[0];
    if (prim) { roda(prim.cod); if (teclado) el[prim.cod].focus({ preventScroll: true }); }
  }
  let psReg = [];
  const numeros = (ms, nae) => `${nae.toLocaleString('pt-BR')} NAE`;
  const nae = n => `<i>${n.toLocaleString('pt-BR')}</i>`;
  // trilha na barra da lupa: cada passo já percorrido é um botão que volta até ele; no fim, as opções do nível atual
  // (regionais, polos) como cartõezinhos com a NAE — clicar num deles abre ele e tira os outros do mapa
  const passo = (ir, txt) => `<button type="button" class="mt-passo" data-ir="${ir}">${txt}</button><span class="mt-sep" aria-hidden="true">›</span>`;
  const atual = txt => `<b class="mt-atual" aria-current="location">${txt}</b>`;
  function legendaEstado() {                               // estado inteiro: a barra só tem a busca (as regionais estão no mapa)
    legPolos.hidden = true;
    legPolos.innerHTML = '';
  }
  legendaEstado();
  function legendaRegional(ps) {
    if (ps) psReg = ps;
    legPolos.hidden = false;
    legPolos.setAttribute('aria-label', `Polos da Regional ${reg}`);
    legPolos.innerHTML = passo('estado', 'Tocantins') + atual(esc(reg)) + '<span class="mt-sep" aria-hidden="true">·</span>' + psReg.map(p =>
      `<button type="button" class="mt-pchip" data-polo="${esc(p.polo)}" style="--c:${corDe[p.polo]}" ` +
      `aria-label="${esc(p.polo)}, ${numeros(p.ms, p.nae)}"><b>${esc(p.polo)}</b>${nae(p.nae)}</button>`).join('');
    volta.setAttribute('aria-label', `Regional ${reg}. Voltar ao Tocantins`);
    volta.title = 'Voltar ao Tocantins';
  }
  // polo aberto: os municípios do polo se afastam do centro do polo; os outros polos da regional somem
  function entraPolo(polo, teclado, cod) {
    if (!reg || pol === polo || !grp[polo]) return;
    pol = polo;
    realcaPolo(null);
    dica.style.display = 'none';
    const b = caixaDe(grp[polo]), pc = [(b.x + b.x2) / 2, (b.y + b.y2) / 2], ms = M.muns.filter(m => m.polo === polo);
    mdesl = {};
    const g0 = Math.hypot(b.x2 - b.x, b.y2 - b.y) * 0.04;         // folga mínima: os do meio do polo também se soltam
    ms.forEach(m => {
      const c = cen(m.cod), dx = c[0] - pc[0], dy = c[1] - pc[1], d = Math.hypot(dx, dy) || 1, f = AFASTA_MUN + g0 / d;
      mdesl[m.cod] = [dx * f, dy * f];
      el[m.cod].style.transform = tr(mdesl[m.cod]);
    });
    polosDe(reg).forEach(([po, gp]) => { gp.classList.toggle('fora', po !== polo); gp.classList.remove('desliga'); });
    caixa.classList.add('polo');
    legendaPolo();
    voa(enquadra());
    const prim = porCod[cod] && porCod[cod].slug ? porCod[cod] : ms.filter(m => m.slug).sort((a, b) => kmTot(b) - kmTot(a))[0];
    if (prim) { roda(prim.cod); if (teclado) el[prim.cod].focus({ preventScroll: true }); }
  }
  function legendaPolo() {
    const ms = M.muns.filter(m => m.polo === pol), nae = ms.reduce((s, m) => s + (m.nae || 0), 0);
    legPolos.setAttribute('aria-label', `Polo ${pol}`);
    legPolos.innerHTML = passo('estado', 'Tocantins') + passo('regional', esc(reg)) +
      `<span class="mt-pchip mt-atual" style="--c:${corDe[pol]}" aria-current="location" aria-label="${esc(pol)}, ${numeros(ms, nae)}"><b>${esc(pol)}</b><i>${nae.toLocaleString('pt-BR')}</i></span>`;
    volta.setAttribute('aria-label', `${pol}. Voltar à Regional ${reg}`);
    volta.title = `Voltar à Regional ${reg}`;
  }
  // município aberto (clicar num município do polo aberto): o mapa aproxima nele e desenha numa cor só a rede de cada
  // alimentador que passa por ali (dados/redes/<AL>.json, de scripts/gera_trechos.py); fora do município a rede fica
  // apagada. Na caixinha, os alimentadores com a miniatura da rede, a NAE e os km no município: passar o mouse numa
  // linha (ou na rede) destaca o alimentador e clicar abre a página dele.
  let mun = null;
  const redes = {};
  const baixaJson = u => fetch(u).then(r => r.ok ? r.json() : null).catch(() => null);
  const pacotes = {};    // cópias reduzidas do site (ex.: a do Artifact) trazem a rede num pacote por polo
  const rede = (al, polo) => redes[al] || (redes[al] = baixaJson(`dados/redes/${encodeURIComponent(al)}.json`).then(r => r ||
    (pacotes[polo] = pacotes[polo] || baixaJson(`dados/redes/polo-${encodeURIComponent(semAcento(polo).replace(/[^a-z0-9]+/g, '-'))}.json`))
      .then(pk => (pk && pk[al]) || null)).then(r => { if (!r) delete redes[al]; return r; }));
  const camada = document.createElementNS(NS, 'g');
  camada.setAttribute('class', 'mt-redes');
  const realceAl = al => {
    if (alf) al = null;
    camada.classList.toggle('realce', !!al);
    camada.querySelectorAll('path[data-al]').forEach(p => p.classList.toggle('on', p.dataset.al === al));
    legAl.querySelectorAll('.mt-al').forEach(a => a.classList.toggle('on', a.dataset.al === al));
  };
  function entraMun(cod, teclado) {
    const m = porCod[cod];
    if (!pol || mun || !m || !m.slug || m.polo !== pol) return;
    mun = cod;
    dica.style.display = 'none';
    nomes2.innerHTML = '';
    caixa.classList.add('nivel-mun');
    M.muns.forEach(x => { if (x.polo === pol) el[x.cod].classList.toggle('fora-m', x.cod !== cod); });
    el[cod].classList.add('aberto-m');
    camada.innerHTML = `<defs><clipPath id="mt-corte"><path d="${m.d}"/></clipPath></defs>` +
      '<g class="mt-redes-f"></g><g class="mt-redes-d" clip-path="url(#mt-corte)"></g>';
    camada.style.transform = tr(mdesl[cod]);
    grp[pol].append(camada);
    const als = m.als.slice().sort((a, b) => b.m - a.m);
    trilhaMun();
    legAl.setAttribute('aria-label', `Alimentadores de ${m.nome}`);
    legAl.hidden = !!window.ARGOS_BUSCA;                // com a busca da barra, a lista abre embaixo da logo (busca-ativo.js)
    legAl.innerHTML = caixaPolos(`<span class="mt-lh"><b>${esc(m.nome)}</b><small>${m.als.length} alimentador${m.als.length > 1 ? 'es' : ''}</small></span>`,
      als.map(a =>
        `<button type="button" class="mt-al" data-al="${esc(a.cod)}" title="Clique para dar zoom; clique de novo para abrir"><span class="mt-al-m" aria-hidden="true"></span>` +
        `<b>${esc(a.cod)}</b><span><i>${(a.n || 0).toLocaleString('pt-BR')} NAE</i><em>${km(a.m)} aqui</em></span></button>`).join(''));
    legAl.classList.toggle('aberta', puxada);
    volta.setAttribute('aria-label', `${m.nome}. Voltar ao polo ${pol}`);
    volta.title = `Voltar ao polo ${pol}`;
    voa(enquadra());
    roda(cod);
    if (teclado) el[cod].focus({ preventScroll: true });
    als.forEach(a => rede(a.cod, m.polo).then(r => {
      if (mun !== cod || !r) return;
      [['.mt-redes-f', ''], ['.mt-redes-d', a.cod]].forEach(([g, al]) => {
        const p = document.createElementNS(NS, 'path');
        p.setAttribute('d', r.d);
        if (al) p.dataset.al = al;
        camada.querySelector(g).append(p);
      });
      const mini = legAl.querySelector(`.mt-al[data-al="${a.cod}"] .mt-al-m`), [x0, y0, x1, y1] = r.b;
      const w = Math.max(x1 - x0, .05), h = Math.max(y1 - y0, .05), f = Math.max(w, h) * .08;
      if (mini) mini.innerHTML = `<svg viewBox="${x0 - f} ${y0 - f} ${w + 2 * f} ${h + 2 * f}"><path d="${r.d}"/></svg>`;
    }));
  }
  // alimentador em foco (clicar nele na lista ou na rede): o mapa aproxima na rede inteira dele, que fica forte e sem
  // corte; os outros apagam. Clicar nele de novo (ou em "Abrir …") abre a página do alimentador.
  let alf = null, alCaixa = null;
  const abreAl = al => vaiPag(`alimentadores/${encodeURIComponent(al)}/`);
  function trilhaMun() {
    const m = porCod[mun];
    legPolos.innerHTML = passo('estado', 'Tocantins') + passo('regional', esc(reg)) + passo('polo', esc(pol)) +
      (alf ? passo('mun', esc(m.nome)) + atual(esc(alf)) : atual(esc(m.nome)));
  }
  async function focaAl(al) {
    if (!mun || alf === al) return;
    const cod = mun, r = await rede(al, porCod[mun].polo);
    if (!r || mun !== cod) return;
    alf = al;
    const [x0, y0, x1, y1] = r.b, d = soma(desl[pol], mdesl[mun]);
    alCaixa = move({ x: x0, y: y0, x2: x1, y2: y1 }, d);
    camada.classList.add('foco');
    let gf = camada.querySelector('.mt-redes-a');
    if (!gf) { gf = document.createElementNS(NS, 'g'); gf.setAttribute('class', 'mt-redes-a'); camada.append(gf); }
    gf.innerHTML = '';
    const pa = document.createElementNS(NS, 'path');
    pa.setAttribute('d', r.d);
    pa.dataset.al = al;
    gf.append(pa);
    legAl.querySelectorAll('.mt-al').forEach(a => a.classList.toggle('foco', a.dataset.al === al));
    const ab = legAl.querySelector('.mt-amun');
    if (ab) { ab.href = pag(`alimentadores/${encodeURIComponent(al)}/`); ab.textContent = `Abrir ${al} →`; }
    trilhaMun();
    volta.setAttribute('aria-label', `${al}. Voltar a ${porCod[mun].nome}`);
    volta.title = `Voltar a ${porCod[mun].nome}`;
    voa(enquadra());
  }
  function saiAl(animar = true) {
    if (!alf) return;
    alf = null;
    alCaixa = null;
    camada.classList.remove('foco');
    const gf = camada.querySelector('.mt-redes-a');
    if (gf) gf.innerHTML = '';
    if (!mun) return;
    const m = porCod[mun];
    legAl.querySelectorAll('.mt-al.foco').forEach(a => a.classList.remove('foco'));
    const ab = legAl.querySelector('.mt-amun');
    if (ab) { ab.href = pag(`municipios/${m.slug}/`); ab.textContent = `Abrir ${m.nome} →`; }
    trilhaMun();
    volta.setAttribute('aria-label', `${m.nome}. Voltar ao polo ${pol}`);
    volta.title = `Voltar ao polo ${pol}`;
    if (animar) voa(enquadra());
  }
  function saiMun(animar = true) {
    if (!mun) return;
    saiAl(false);
    const cod = mun;
    mun = null;
    const tinha = document.activeElement === volta || legAl.contains(document.activeElement);
    caixa.classList.remove('nivel-mun');
    legAl.hidden = true;
    legAl.innerHTML = '';
    M.muns.forEach(x => el[x.cod].classList.remove('fora-m', 'aberto-m'));
    camada.remove();
    camada.innerHTML = '';
    camada.classList.remove('realce');
    if (!animar) return;
    legendaPolo();
    voa(enquadra());
    if (tinha) { roda(cod); el[cod].focus({ preventScroll: true }); }
  }
  legAl.addEventListener('mouseover', e => { const a = e.target.closest('.mt-al'); realceAl(a ? a.dataset.al : null); });
  legAl.addEventListener('mouseleave', () => realceAl(null));
  legAl.addEventListener('focusin', e => { const a = e.target.closest('.mt-al'); realceAl(a ? a.dataset.al : null); });
  legAl.addEventListener('click', e => {
    const al = e.target.closest('.mt-al');
    if (al) { if (alf === al.dataset.al) abreAl(al.dataset.al); else focaAl(al.dataset.al); return; }
    const px = e.target.closest('.mt-puxa');
    if (!px) return;
    puxada = !puxada;
    legAl.classList.toggle('aberta', puxada);
    px.setAttribute('aria-expanded', String(puxada));
    px.setAttribute('aria-label', `${puxada ? 'Esconder' : 'Mostrar'} os alimentadores`);
  });
  function saiPolo(animar = true) {
    if (!pol) return;
    saiMun(false);
    const polo = pol;
    pol = null;
    M.muns.forEach(m => { if (m.polo === polo) el[m.cod].style.transform = ''; });
    polosDe(reg).forEach(([, gp]) => gp.classList.remove('fora'));
    caixa.classList.remove('polo');
    const tinha = document.activeElement === volta;
    if (!animar) return;
    legendaRegional();
    voa(enquadra());
    const m = M.muns.find(x => x.polo === polo && x.slug);
    if (tinha && m) { roda(m.cod); el[m.cod].focus({ preventScroll: true }); }
  }
  // nome de cada município do polo aberto, já no lugar afastado (entra depois da animação; os que se cruzam somem)
  // nome de cada município do polo aberto, no lugar afastado (entra depois da animação). Cada rótulo é um mini cartão
  // preto (como o das regionais): nome e, EMBAIXO, a NAE num selo vermelho. Sem sobreposição: os rótulos entram do
  // maior NAE para o menor, procurando um ponto livre DENTRO do próprio município; se o cartão inteiro não cabe, tenta
  // só nome+número, depois só o número; se nem assim, o município fica sem rótulo (o nome continua no balão do mouse).
  const nomes2 = document.createElement('div');
  nomes2.className = 'mt-nomes2';
  nomes2.setAttribute('aria-hidden', 'true');
  caixa.append(nomes2);
  const fmt = n => (n || 0).toLocaleString('pt-BR');
  const zero = m => m.nae ? '' : ' class="zero"';
  const NIVEIS_ROT = [
    m => `<b>${esc(m.nome)}</b><i${zero(m)}>${fmt(m.nae)} NAE</i>`,      // cartão completo
    m => `<b>${esc(m.nome)}</b><i${zero(m)}>${fmt(m.nae)} NAE</i>`,      // cartão compacto (letra menor, via data-nv)
    m => `<i${zero(m)}>${fmt(m.nae)}</i>`,                               // só o número
  ];
  const FOLGA_ROT = () => (matchMedia('(max-width:860px)').matches ? 4 : 8);   // folga entre rótulos (menor no celular)
  let folgaRot = 8;
  const bate = (a, b, f = folgaRot) => a.left < b.right + f && a.right + f > b.left && a.top < b.bottom + f && a.bottom + f > b.top;
  function poeNomes() {
    nomes2.innerHTML = '';
    if (!pol || mun || anima) return;
    const r = svg.getBoundingClientRect(), v = vb(), c0 = caixa.getBoundingClientRect(), ctm = svg.getScreenCTM();
    if (!r.width || !ctm) return;
    folgaRot = FOLGA_ROT();                                     // uma vez por cálculo (matchMedia a cada comparação custava ~120 ms)
    const celular = matchMedia('(max-width:860px)').matches, ocupado = [];   // seta de voltar (e a legenda, se estiver no mapa) também entram na conta
    [caixa.contains(leg) ? leg : null, volta, tc].forEach(o => { if (o && o.offsetParent) ocupado.push(o.getBoundingClientRect()); });
    const livre = { left: Math.max(r.left, c0.left) + 2, top: Math.max(r.top, c0.top) + 2, right: Math.min(r.right, c0.right) - 2, bottom: Math.min(r.bottom, c0.bottom) - 2 };
    const pt = svg.createSVGPoint(), u = Math.max(v[2] / r.width, v[3] / r.height);   // unidades do mapa por pixel de tela
    const aTela = (x, y) => { pt.x = x; pt.y = y; return pt.matrixTransform(ctm); };
    const ms = M.muns.filter(m => m.polo === pol).sort((a, b) => (b.nae || 0) - (a.nae || 0));
    // pontos candidatos no próprio município: o centro e anéis em volta (em pixels de tela)
    const ANEIS = [0, 9, 18, 28, 40, 54];
    function* cand(m) {                                         // preguiçoso: só testa o próximo ponto se o anterior não coube
      const p = el[m.cod], [cx, cy] = m.c;
      for (const rr of ANEIS) {
        const n = rr ? 12 : 1;
        for (let i = 0; i < n; i++) {
          const a = i / n * 2 * Math.PI + (rr % 2 ? .26 : 0), q = new DOMPoint(cx + Math.cos(a) * rr * u, cy + Math.sin(a) * rr * u * .8);
          if (p.isPointInFill(q)) yield q;
        }
      }
    }
    // 1º: nome DENTRO do município (cartão inteiro; no celular, compacto; depois compacto). 2º: os que não couberam
    // ganham o nome FORA, ao lado, ligado ao município por um fio fino (ninguém fica sem nome). 3º: só o número dentro.
    const fios = document.createElementNS(NS, 'svg');
    fios.setAttribute('class', 'mt-fios');
    nomes2.append(fios);
    const caixaR = (s, w, h) => ({ left: s.x - w / 2, right: s.x + w / 2, top: s.y - h / 2, bottom: s.y + h / 2 });
    const cabe = R => !(R.left < livre.left || R.right > livre.right || R.top < livre.top || R.bottom > livre.bottom) && !ocupado.some(o => bate(R, o));
    const poe = (t, s, R) => { t.style.left = (s.x - c0.left).toFixed(1) + 'px'; t.style.top = (s.y - c0.top).toFixed(1) + 'px'; ocupado.push(R); };
    const mede = (t, m, nv) => { t.innerHTML = NIVEIS_ROT[nv](m); t.dataset.nv = nv; t.style.left = '0px'; t.style.top = '0px'; return [t.offsetWidth, t.offsetHeight]; };
    const sobra = [], ponta = {};
    ms.forEach(m => {
      const it = cand(m), cache = [];                           // pontos em cache e gerados só quando preciso
      const ponto = k => { while (cache.length <= k) { const r = it.next(); if (r.done) return null; cache.push(r.value); } return cache[k]; };
      if (!ponto(0)) return;
      const [dx, dy] = soma(desl[pol], mdesl[m.cod]);
      const tela = q => aTela(q.x + dx, q.y + dy);
      ponta[m.cod] = { tela, ponto };
      const t = document.createElement('span');
      t.className = 'mt-mn';
      nomes2.append(t);
      for (let nv = celular ? 1 : 0; nv < 2; nv++) {
        const [w, h] = mede(t, m, nv);
        for (let k = 0, q; (q = ponto(k)); k++) { const s = tela(q), R = caixaR(s, w, h); if (cabe(R)) { poe(t, s, R); return; } }
      }
      sobra.push([m, t]);
    });
    const ANG = 16, RAIOS = celular ? [30, 42, 56, 72, 90] : [38, 52, 68, 86, 108, 132, 160];
    const resto = [];
    const fora = (t, m, w, h) => {                              // põe o cartão ao lado do município, ligado por um fio
      const s0 = ponta[m.cod].tela(ponta[m.cod].ponto(0));
      for (const r of RAIOS) for (let i = 0; i < ANG; i++) {
        const a = i / ANG * 2 * Math.PI - Math.PI / 2, s = { x: s0.x + Math.cos(a) * r, y: s0.y + Math.sin(a) * r * .75 }, R = caixaR(s, w, h);
        if (!cabe(R)) continue;
        poe(t, s, R);
        t.classList.add('fora');
        const x0 = s0.x - c0.left, y0 = s0.y - c0.top, x1 = s.x - c0.left, y1 = s.y - c0.top;
        fios.insertAdjacentHTML('beforeend', `<line x1="${x0.toFixed(1)}" y1="${y0.toFixed(1)}" x2="${x1.toFixed(1)}" y2="${y1.toFixed(1)}"/><circle cx="${x0.toFixed(1)}" cy="${y0.toFixed(1)}" r="2.5"/>`);
        return true;
      }
      return false;
    };
    sobra.forEach(([m, t]) => { const [w, h] = mede(t, m, 1); if (!fora(t, m, w, h)) resto.push([m, t]); });
    resto.forEach(([m, t]) => {                                 // último recurso: só o número, dentro; senão fora, com fio
      if (!legAberta) { t.remove(); return; }                   // sem NAE (legenda recolhida) não há o rótulo só do número
      const [w, h] = mede(t, m, 2), { tela, ponto } = ponta[m.cod];
      for (let k = 0, q; (q = ponto(k)); k++) { const s = tela(q), R = caixaR(s, w, h); if (cabe(R)) { poe(t, s, R); return; } }
      if (!fora(t, m, w, h)) t.remove();
    });
  }
  // cartão de cada polo: bandeirinha logo acima do contorno do polo, com o fio na cor dele
  function poeSelos() {
    selos.innerHTML = '';
    if (!reg || pol || anima) return;
    const cards = psReg.map(p => {
      const e = document.createElement('div');
      e.className = 'mt-mn mt-pm' + (grp[p.polo].classList.contains('desliga') ? ' off' : '');
      e.dataset.polo = p.polo;
      e.style.setProperty('--c', corDe[p.polo]);
      e.innerHTML = `<b>${esc(p.polo)}</b><i>${p.nae.toLocaleString('pt-BR')} NAE</i>`;
      selos.append(e);
      return { e, cor: corDe[p.polo], path: grp[p.polo].querySelector('.mt-poloc:not(.fundo)'), centro: soma(meio(p.ms).c, desl[p.polo]) };
    });
    if (cards.length) fios.innerHTML = bandeiras(cards, M.muns.filter(m => m.reg === reg));
  }
  legPolos.addEventListener('click', e => {
    const bt = e.target.closest('button');
    if (!bt) return;
    if (bt.dataset.reg) { entra(bt.dataset.reg, e.detail === 0); return; }
    if (bt.dataset.polo) { entraPolo(bt.dataset.polo, e.detail === 0); return; }
    const ir = bt.dataset.ir;
    if (ir === 'estado') sai();
    else if (ir === 'regional') { saiMun(false); saiPolo(); }
    else if (ir === 'polo') saiMun();
    else if (ir === 'mun') saiAl();
  });
  function sai() {
    if (!reg) return;
    saiPolo(false);
    nomes2.innerHTML = '';
    selos.innerHTML = '';
    const r = reg;
    reg = null;
    Object.values(grp).forEach(gp => { gp.classList.remove('fora', 'desliga'); gp.style.transform = ''; });
    const tinha = document.activeElement === volta || legPolos.contains(document.activeElement);
    caixa.classList.remove('aberta');
    legendaEstado();
    volta.hidden = true;
    voa(TODO);
    const m = M.muns.find(x => x.reg === r && x.slug);
    if (tinha && m) { roda(m.cod); el[m.cod].focus({ preventScroll: true }); }
  }
  const sobe = () => (alf ? saiAl() : mun ? saiMun() : pol ? saiPolo() : sai());
  volta.addEventListener('click', sobe);
  document.addEventListener('keydown', e => {      // Esc sobe um nível; no estado inteiro, sai da tela cheia
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    if (reg) sobe(); else if (alvo.classList.contains('mt-cheia')) cobre(false);
  });
  if (window.ResizeObserver) new ResizeObserver(() => { if (reg && !anima) { svg.setAttribute('viewBox', enquadra().join(' ')); poeNomes(); poeSelos(); } }).observe(caixa);

  // no estado inteiro, escolher um município abre a regional dele; com a regional aberta, abre o polo dele; com o polo
  // aberto, abre o município (a rede dos alimentadores); com o município aberto, abre a página dele
  const abre = cod => { const m = porCod[cod]; if (m && m.slug) vaiPag(`municipios/${m.slug}/`); };
  const escolhe = (cod, teclado) => {
    const m = porCod[cod];
    if (!reg && m.reg) entra(m.reg, teclado, cod);
    else if (reg && !pol && m.reg === reg && m.polo) entraPolo(m.polo, teclado, cod);
    else if (pol && !mun && m.polo === pol && m.slug) entraMun(cod, teclado);
    else if (!reg || (mun ? cod === mun : pol ? m.polo === pol : m.reg === reg)) abre(cod);
  };
  svg.addEventListener('click', e => {
    const r = e.target.closest('.mt-redes path[data-al]');
    if (r) { if (alf === r.dataset.al) abreAl(r.dataset.al); else focaAl(r.dataset.al); return; }
    const p = e.target.closest('.mun');
    if (p) escolhe(p.dataset.cod);
  });

  // setas: vai ao município mais perto na direção (dentro de um cone de ±56°)
  const centro = {};
  const cen = cod => centro[cod] || (centro[cod] = (b => [b.x + b.width / 2, b.y + b.height / 2])(el[cod].getBBox()));
  const DIR = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] };
  svg.addEventListener('keydown', e => {
    const p = e.target.closest('.mun');
    if (!p) return;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); escolhe(p.dataset.cod, true); return; }
    const d = DIR[e.key];
    if (!d) return;
    e.preventDefault();
    const [x0, y0] = cen(p.dataset.cod);
    let melhor = null, dist = Infinity;
    M.muns.forEach(m => {
      if (!m.slug || m.cod === p.dataset.cod || mun || (reg && m.reg !== reg) || (pol && m.polo !== pol)) return;
      const [x, y] = cen(m.cod), dx = x - x0, dy = y - y0;
      const frente = dx * d[0] + dy * d[1], lado = Math.abs(dx * d[1] + dy * d[0]);
      if (frente <= 0 || lado > frente * 1.5) return;
      const q = dx * dx + dy * dy;
      if (q < dist) { dist = q; melhor = m.cod; }
    });
    if (melhor) { roda(melhor); el[melhor].focus({ preventScroll: true }); }
  });
  // mover o path no mousedown faria o navegador perder o clique: só o foco do teclado traz o contorno para cima
  let toque = 0;
  svg.addEventListener('pointerdown', () => { toque = performance.now(); });
  svg.addEventListener('focusin', e => {
    const p = e.target.closest('.mun');
    if (!p) return;
    if (porCod[p.dataset.cod].slug) roda(p.dataset.cod);
    if (performance.now() - toque > 600) traz(p);
  });
  svg.addEventListener('focusout', () => { if (foco) traz(el[foco]); });

  // município: o campo #busca abre a lista suspensa (#mun-lista) com todos os municípios, filtrada pelo que se digita;
  // os achados acendem no mapa. Setas andam na lista, Enter abre o município (ou o único achado), Esc fecha.
  const busca = document.getElementById('busca'), lista = document.getElementById('mun-lista');
  if (busca && lista) {
    const todos = M.muns.slice().sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    let ops = [], ativo = -1;
    const acende = cod => { Object.values(el).forEach(p => p.classList.remove('acende')); if (cod) el[cod].classList.add('acende'); };
    const marca = i => {
      ops.forEach((o, k) => o.classList.toggle('marcado', k === i));
      ativo = i;
      if (i >= 0) { busca.setAttribute('aria-activedescendant', ops[i].id); ops[i].scrollIntoView({ block: 'nearest' }); acende(ops[i].dataset.cod); }
      else { busca.removeAttribute('aria-activedescendant'); acende(null); }
    };
    const abreLista = sim => {
      lista.hidden = !sim;
      busca.setAttribute('aria-expanded', String(sim));
      if (!sim) marca(-1);
    };
    function filtra() {
      const q = semAcento(busca.value.trim());
      const ms = todos.filter(m => !q || m.busca.includes(q));
      achou.forEach(c => el[c].classList.remove('achou'));
      achou = new Set(q ? ms.map(m => m.cod) : []);
      achou.forEach(c => el[c].classList.add('achou'));
      rotulos();
      lista.innerHTML = ms.map((m, i) => m.slug
        ? `<a class="mun-op" role="option" id="mun-op-${i}" data-cod="${esc(m.cod)}" href="municipios/${esc(m.slug)}/" tabindex="-1"><b>${esc(m.nome)}</b><span>${nAls(m)} · ${km(kmTot(m))}</span></a>`
        : `<div class="mun-op sem" role="option" id="mun-op-${i}" data-cod="${esc(m.cod)}" aria-disabled="true"><b>${esc(m.nome)}</b><span>sem dados ainda</span></div>`).join('')
        || `<p class="vazio">Nenhum município com “${esc(busca.value.trim())}”.</p>`;
      ops = [...lista.querySelectorAll('.mun-op')];
      abreLista(true);
      marca(q && ops.length === 1 ? 0 : -1);
    }
    busca.addEventListener('input', filtra);
    busca.addEventListener('focus', filtra);
    busca.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (lista.hidden) filtra();
        if (!ops.length) return;
        marca(e.key === 'ArrowDown' ? Math.min(ops.length - 1, ativo + 1) : Math.max(0, ativo - 1));
      } else if (e.key === 'Enter') {
        const o = ops[ativo >= 0 ? ativo : 0];
        if (o && o.href) { e.preventDefault(); location.href = o.href; }
      } else if (e.key === 'Escape' && !lista.hidden) { e.preventDefault(); abreLista(false); }
    });
    lista.addEventListener('mousedown', e => e.preventDefault());   // clicar na lista não tira o foco do campo antes do clique
    lista.addEventListener('mouseover', e => { const o = e.target.closest('.mun-op'); if (o) marca(ops.indexOf(o)); });
    document.addEventListener('pointerdown', e => { if (!lista.hidden && !busca.parentElement.contains(e.target)) abreLista(false); });
    busca.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== busca) abreLista(false); }, 0));
  }

  // ---------- ponte com a busca da barra (busca-ativo.js) ----------
  // vai({reg}|{polo}|{cod}|{al}): o mapa anda até lá pelo mesmo caminho dos cliques (regional › polo › município ›
  // alimentador), subindo só o que não serve. O alimentador abre no município onde ele tem mais km — de preferência
  // dentro do que já está aberto (município, polo ou regional).
  const kmAl = (m, al) => { const a = m.als.find(x => x.cod === al); return a ? a.m : 0; };
  function munDoAl(al) {
    const ms = M.muns.filter(m => m.slug && kmAl(m, al) > 0);
    if (!ms.length) return null;
    if (mun && ms.some(m => m.cod === mun)) return mun;
    const dentro = ms.filter(m => pol ? m.polo === pol : reg ? m.reg === reg : true);
    return (dentro.length ? dentro : ms).sort((a, b) => kmAl(b, al) - kmAl(a, al))[0].cod;
  }
  async function vai({ reg: r, polo, cod, al } = {}) {
    if (al) cod = munDoAl(al);
    const m = porCod[cod];
    if (m) { r = m.reg; polo = m.polo; }
    if (polo && !r) { const x = M.muns.find(y => y.polo === polo); r = x && x.reg; }
    previa(null);
    if (!r) { sai(); return; }
    if (reg && reg !== r) sai();
    if (pol && pol !== polo) saiPolo(!polo);
    if (mun && mun !== cod) saiMun(!cod);
    if (alf && alf !== al) saiAl(!al);
    if (!reg) entra(r);
    if (polo && !pol) entraPolo(polo);
    if (cod && !mun) entraMun(cod);
    if (al && mun) await focaAl(al);
  }
  // previa(alvo): acende no mapa o que está marcado na lista da busca, sem mudar de nível (null apaga)
  let acesos = [];
  function previa(a) {
    acesos.forEach(c => el[c].classList.remove('acende'));
    acesos = [];
    if (!reg) realca(null); else if (!pol) realcaPolo(null);
    if (achou.size) { achou = new Set(); rotulos(); }
    if (!a) return;
    const regDe = a.reg || (a.polo && (M.muns.find(x => x.polo === a.polo) || {}).reg);
    if (!a.polo && !a.cod && !a.al) { if (!reg) realca(regDe); return; }
    if (a.polo && !reg) realca(regDe);
    if (a.polo && reg === regDe && !pol) { realcaPolo(a.polo); return; }
    acesos = a.cod ? [a.cod] : M.muns.filter(m => a.al ? kmAl(m, a.al) > 0 : m.polo === a.polo).map(m => m.cod);
    acesos.forEach(c => { el[c].classList.add('acende'); if (acesos.length === 1) traz(el[c]); });
    if (!reg && (a.cod || a.al)) { achou = new Set(acesos); rotulos(); }   // no estado inteiro aparecem os nomes
  }
  // rede do alimentador (para a miniatura na lista da busca) e o destaque dela no mapa com o município aberto
  const redeDe = al => { const m = porCod[mun] || M.muns.find(x => x.als.some(a => a.cod === al)); return m ? rede(al, m.polo) : Promise.resolve(null); };
  window.ARGOS_MAPA = { nivel: () => ({ reg, pol, mun, al: alf }), vai, previa, rede: redeDe, realceAl: al => { if (mun) realceAl(al); } };
})();
