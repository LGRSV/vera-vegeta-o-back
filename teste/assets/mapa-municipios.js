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
  const leg = alvo.querySelector('.mt-regs');
  if (leg) leg.innerHTML = '<b>NAE-Vegetação</b>' +
    FAIXAS.map((l, i) => `<span><i class="nae-${i}" aria-hidden="true"></i>${rotFaixa(i)}</span>`).join('') +
    (M.regs ? '<span class="lim-s"><i class="lim" aria-hidden="true"></i>Limite das regionais</span>' : '');
  // teclado: um só município na ordem do Tab (o escolhido, ou Palmas); as setas andam pelo mapa
  const roda = cod => {
    svg.querySelectorAll('.mun[tabindex="0"]').forEach(p => p.setAttribute('tabindex', '-1'));
    el[cod].setAttribute('tabindex', '0');
  };
  const inicial = M.muns.find(m => m.slug && m.busca === 'palmas') || M.muns.find(m => m.slug);
  if (inicial) roda(inicial.cod);

  // nomes: em repouso só as cidades de referência; o escolhido e os achados na busca também aparecem
  const REF = ['palmas', 'araguaina', 'gurupi', 'porto nacional', 'paraiso do tocantins', 'guarai', 'colinas do tocantins',
    'miracema do tocantins', 'pedro afonso', 'araguatins', 'tocantinopolis', 'dianopolis', 'natividade', 'formoso do araguaia', 'arraias'];
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
    const p = e.target.closest('.mun');
    if (!p) { dica.style.display = 'none'; return; }
    const m = porCod[p.dataset.cod], r = caixa.getBoundingClientRect();
    if (!reg) realca(m.reg); else if (!pol) realcaPolo(m.reg === reg ? m.polo : null);
    dica.innerHTML = `${esc(m.nome)} <small>· ${(m.nae || 0).toLocaleString('pt-BR')} NAE${m.reg ? ` · Regional ${esc(m.reg)} · ${esc(m.polo)}` : ''}${m.slug ? ` · ${nAls(m)} · ${km(kmTot(m))}` : ' · sem dados ainda'}</small>` +
      (!reg && m.reg ? `<small class="mt-dica-c">Clique para ver os polos da Regional ${esc(m.reg)}</small>` :
        reg && !pol && m.reg === reg ? `<small class="mt-dica-c">Clique para ver os municípios de ${esc(m.polo)}</small>` : '');
    dica.style.left = (e.clientX - r.left) + 'px'; dica.style.top = (e.clientY - r.top) + 'px'; dica.style.display = 'block';
  });
  svg.addEventListener('mouseleave', () => { dica.style.display = 'none'; if (!reg) realca(null); else if (!pol) realcaPolo(null); });

  // regional aberta: o mapa aproxima nela, as outras somem e os polos se afastam um do outro (do centro da regional
  // para fora). Ao fim da animação cada polo ganha o contorno na cor dele, e a legenda ao lado (como o T1/T2/T3 do
  // painel) lista os polos com a mesma cor, os municípios e a NAE; tocar num polo da legenda apaga ou acende ele no mapa.
  // "← Tocantins" ou Esc voltam ao estado inteiro.
  // Polo aberto (clicar num polo da regional aberta): do mesmo jeito, o mapa aproxima no polo e os municípios dele se
  // afastam um do outro, com o nome de cada um; aí clicar num município abre a página dele. "← Regional" ou Esc voltam.
  let reg = null, pol = null, anima = 0, mdesl = {}, corDe = {};
  const TODO = [-6, -6, VW, M.h + 12], AFASTA = 0.32, AFASTA_MUN = 0.22, DUR = 650, CORES = ['a', 'b', 'c', 'd'];
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
    const passo = agora => {
      const t = dur ? Math.min(1, (agora - t0) / dur) : 1, e = t < .5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      svg.setAttribute('viewBox', de.map((v, i) => +(v + (alvoVb[i] - v) * e).toFixed(2)).join(' '));
      if (t < 1) anima = requestAnimationFrame(passo); else { anima = 0; caixa.classList.remove('voando'); caixa.classList.toggle('pronta', !!reg); poeNomes(); }
    };
    anima = requestAnimationFrame(passo);
  }
  const volta = document.createElement('button');
  volta.type = 'button';
  volta.className = 'mt-volta';
  volta.hidden = true;
  volta.textContent = '← Tocantins';
  const legPolos = document.createElement('span');
  legPolos.className = 'mt-polos';
  legPolos.setAttribute('role', 'group');
  legPolos.hidden = true;
  (leg || caixa).append(volta, legPolos);   // embaixo da legenda (no celular, o "← Tocantins" vai no canto do mapa: site.css)
  let desl = {};
  // enquadra a regional aberta deixando livre a coluna da legenda (computador) ou o topo para o "← Tocantins" (celular)
  const move = (b, [dx, dy]) => ({ x: b.x + dx, y: b.y + dy, x2: b.x2 + dx, y2: b.y2 + dy });
  function enquadra() {
    let bb = null;
    if (pol) M.muns.forEach(m => { if (m.polo === pol) bb = une(bb, move(caixaDe(el[m.cod]), soma(desl[pol], mdesl[m.cod]))); });
    else polosDe(reg).forEach(([polo, gp]) => { bb = une(bb, move(caixaDe(gp), desl[polo])); });
    const x = bb.x - 12, y = bb.y - 12, w = bb.x2 - bb.x + 24, h = bb.y2 - bb.y + 24, W = caixa.clientWidth;
    if (!leg || getComputedStyle(leg).position !== 'absolute') { const t = 52 * w / W; return [x, y - t, w, h + t]; }
    const H = svg.clientHeight || 600, L = leg.offsetWidth + 24, k = Math.min(H / h, Math.max(1e-3, W - 2 * L) / w);
    const altura = H / k;
    return [x - L / k, y - (altura - h) / 2, w + 2 * L / k, altura];
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
  const numeros = (ms, nae) => `${ms.length} municípios · ${nae.toLocaleString('pt-BR')} NAE`;
  function legendaRegional(ps) {
    if (ps) psReg = ps;
    legPolos.setAttribute('aria-label', `Polos da Regional ${reg}`);
    legPolos.innerHTML = `<b class="mt-polos-t">Regional ${esc(reg)}</b>` + psReg.map(p =>
      `<button type="button" class="mt-pchip" aria-pressed="true" data-polo="${esc(p.polo)}" style="--c:${corDe[p.polo]}">` +
      `<b>${esc(p.polo)}</b><span>${numeros(p.ms, p.nae)}</span></button>`).join('');
    volta.textContent = '← Tocantins';
    volta.setAttribute('aria-label', `Regional ${reg}. Voltar ao Tocantins`);
  }
  // polo aberto: os municípios do polo se afastam do centro do polo; os outros polos da regional somem
  function entraPolo(polo, teclado, cod) {
    if (!reg || pol === polo || !grp[polo]) return;
    pol = polo;
    realcaPolo(null);
    dica.style.display = 'none';
    const b = caixaDe(grp[polo]), pc = [(b.x + b.x2) / 2, (b.y + b.y2) / 2], ms = M.muns.filter(m => m.polo === polo);
    mdesl = {};
    const g0 = Math.hypot(b.x2 - b.x, b.y2 - b.y) * 0.025;        // folga mínima: os do meio do polo também se soltam
    ms.forEach(m => {
      const c = cen(m.cod), dx = c[0] - pc[0], dy = c[1] - pc[1], d = Math.hypot(dx, dy) || 1, f = AFASTA_MUN + g0 / d;
      mdesl[m.cod] = [dx * f, dy * f];
      el[m.cod].style.transform = tr(mdesl[m.cod]);
    });
    polosDe(reg).forEach(([po, gp]) => { gp.classList.toggle('fora', po !== polo); gp.classList.remove('desliga'); });
    caixa.classList.add('polo');
    const nae = ms.reduce((s, m) => s + (m.nae || 0), 0);
    legPolos.setAttribute('aria-label', `Polo ${polo}`);
    legPolos.innerHTML = `<b class="mt-polos-t">Regional ${esc(reg)} › ${esc(polo)}</b>` +
      `<span class="mt-pchip" style="--c:${corDe[polo]}"><b>${esc(polo)}</b><span>${numeros(ms, nae)}</span></span>`;
    volta.textContent = `← Regional ${reg}`;
    volta.setAttribute('aria-label', `${polo}. Voltar à Regional ${reg}`);
    voa(enquadra());
    const prim = porCod[cod] && porCod[cod].slug ? porCod[cod] : ms.filter(m => m.slug).sort((a, b) => kmTot(b) - kmTot(a))[0];
    if (prim) { roda(prim.cod); if (teclado) el[prim.cod].focus({ preventScroll: true }); }
  }
  function saiPolo(animar = true) {
    if (!pol) return;
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
  const nomes2 = document.createElementNS(NS, 'g');
  nomes2.setAttribute('class', 'mt-nomes2');
  nomes2.setAttribute('aria-hidden', 'true');
  svg.append(nomes2);
  function poeNomes() {
    nomes2.innerHTML = '';
    if (!pol || anima) return;
    const r = svg.getBoundingClientRect(), v = vb();
    if (!r.width) return;
    nomes2.style.setProperty('--k', Math.max(v[2] / r.width, v[3] / r.height).toFixed(4));
    const ok = [];
    M.muns.filter(m => m.polo === pol).sort((a, b) => (b.nae || 0) - (a.nae || 0)).forEach(m => {
      const t = document.createElementNS(NS, 'text'), [x, y] = soma(soma(m.c, desl[pol]), mdesl[m.cod]);
      t.setAttribute('x', x); t.setAttribute('y', y);
      t.setAttribute('class', 'mt-rot');
      t.textContent = m.nome;
      nomes2.append(t);
      const q = t.getBBox();
      if (ok.some(o => q.x < o.x + o.width + 2 && q.x + q.width + 2 > o.x && q.y < o.y + o.height && q.y + q.height > o.y)) t.remove();
      else ok.push(q);
    });
  }
  legPolos.addEventListener('click', e => {
    const bt = e.target.closest('.mt-pchip');
    if (!bt) return;
    const liga = bt.getAttribute('aria-pressed') !== 'true';
    bt.setAttribute('aria-pressed', String(liga));
    grp[bt.dataset.polo].classList.toggle('desliga', !liga);
  });
  function sai() {
    if (!reg) return;
    saiPolo(false);
    nomes2.innerHTML = '';
    const r = reg;
    reg = null;
    Object.values(grp).forEach(gp => { gp.classList.remove('fora', 'desliga'); gp.style.transform = ''; });
    const tinha = document.activeElement === volta || legPolos.contains(document.activeElement);
    caixa.classList.remove('aberta');
    legPolos.hidden = true;
    legPolos.innerHTML = '';
    volta.hidden = true;
    voa(TODO);
    const m = M.muns.find(x => x.reg === r && x.slug);
    if (tinha && m) { roda(m.cod); el[m.cod].focus({ preventScroll: true }); }
  }
  const sobe = () => (pol ? saiPolo() : sai());
  volta.addEventListener('click', sobe);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && reg && !e.defaultPrevented) sobe(); });
  if (window.ResizeObserver) new ResizeObserver(() => { if (reg && !anima) { svg.setAttribute('viewBox', enquadra().join(' ')); poeNomes(); } }).observe(caixa);

  // no estado inteiro, escolher um município abre a regional dele; com a regional aberta, abre o polo dele; com o polo
  // aberto, abre a página do município
  const abre = cod => { const m = porCod[cod]; if (m && m.slug) location.href = `municipios/${m.slug}/`; };
  const escolhe = (cod, teclado) => {
    const m = porCod[cod];
    if (!reg && m.reg) entra(m.reg, teclado, cod);
    else if (reg && !pol && m.reg === reg && m.polo) entraPolo(m.polo, teclado, cod);
    else if (!reg || (pol ? m.polo === pol : m.reg === reg)) abre(cod);
  };
  svg.addEventListener('click', e => { const p = e.target.closest('.mun'); if (p) escolhe(p.dataset.cod); });

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
      if (!m.slug || m.cod === p.dataset.cod || (reg && m.reg !== reg) || (pol && m.polo !== pol)) return;
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
})();
