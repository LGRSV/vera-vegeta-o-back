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
  // varre um d só com M e L absolutos e sem espaços (o formato de dados/redes, M.regs e M.pols) e chama
  // f(éM, x, y, i0, i1) a cada ponto (d.slice(i0, i1) é o texto "x,y"); devolve false se o formato for outro.
  // Lê os números direto dos códigos dos caracteres: sem criar uma string por número.
  const varre = (d, f) => {
    if (!d || /[^ML\d.,-]/.test(d)) return false;
    const n = d.length;
    let k = 0;
    const num = () => {
      let neg = false, v = 0, fr = 0;
      if (d.charCodeAt(k) === 45) { neg = true; k++; }
      for (; k < n; k++) {
        const c = d.charCodeAt(k);
        if (c === 46) { fr = 1; continue; }
        if (c < 48 || c > 57) break;
        if (fr) { fr *= 10; v += (c - 48) / fr; } else v = v * 10 + c - 48;
      }
      return neg ? -v : v;
    };
    while (k < n) {
      const c = d.charCodeAt(k);
      if (c !== 77 && c !== 76) return false;
      const i0 = ++k, x = num();
      if (d.charCodeAt(k) !== 44) return false;
      k++;
      const y = num();
      f(c === 77, x, y, i0, k);
    }
    return true;
  };
  // pedaços por célula da grade. O navegador desenha (raster) o mapa em ladrilhos e, em cada ladrilho, traça INTEIRO
  // cada path que encosta nele: o contorno de uma regional (mais de 1.000 trechos) ou a rede de um alimentador (até
  // 160 kB) num path só eram traçados de novo em cada ladrilho, a cada quadro do voo. Cortado numa grade, cada ladrilho
  // só traça os pedaços perto dele. Sem perder nada: as coordenadas são as mesmas; trechos seguidos viram uma linha só
  // (mesmo desenho com ponta e junta redondas) e some só o segmento de comprimento zero que repete o ponto onde a linha
  // anterior já terminou. Formato inesperado: fica inteiro. O corte de cada (chave, célula) é guardado.
  // junto (opcional): outro leitor {f, fim} que aproveita a mesma passada pelo texto (a miniatura da rede, miniador)
  const cortes = new Map();
  function pedacos(chave, d, cel, junto) {
    const k = chave + '|' + cel;
    let r = cortes.get(k);
    if (r) return r;
    const bal = new Map();
    let pena = null, px = 0, py = 0, fim = null, fx = 0, fy = 0, kFim = NaN;   // pena: último M; fim: onde a linha atual termina
    const corta = (eM, x, y, i0, i1) => {
      const p = d.slice(i0, i1);
      if (eM) { pena = p; px = x; py = y; return; }
      let ini = fim, ix = fx, iy = fy;
      if (pena !== null) { ini = pena; ix = px; iy = py; pena = null; }
      if (ini === null || (ini === p && ini === fim)) return;    // segmento nulo sobre o fim da linha anterior: já desenhado
      const kc = Math.floor(ix / cel) * 1e5 + Math.floor(iy / cel);
      let a = bal.get(kc);
      if (!a) bal.set(kc, a = []);
      a.push(kc === kFim && ini === fim ? 'L' + p : 'M' + ini + 'L' + p);
      fim = p; fx = x; fy = y; kFim = kc;
    };
    const ok = varre(d, junto ? (eM, x, y, i0, i1) => { corta(eM, x, y, i0, i1); junto.f(eM, x, y); } : corta);
    r = ok ? [...bal.values()].map(a => a.join('')) : [d];
    cortes.set(k, r);
    if (junto) junto.fim(ok);
    return r;
  }
  // n pontos espalhados por igual ao longo de um contorno (unidades do mapa), como path.getPointAtLength(L·(i+½)/n):
  // as bandeirinhas procuram lugar nesses pontos. Feito uma vez por contorno, em JS (o contorno agora é um grupo de
  // pedaços, e 90 getPointAtLength num path de mil trechos custavam caro a cada pouso); formato inesperado: um path solto
  const amostras = new Map();
  function amostra(chave, d, n) {
    const k = chave + '|' + n;
    let out = amostras.get(k);
    if (out) return out;
    const seg = [];                                          // [x0, y0, x1, y1, comprimento]
    let x0 = 0, y0 = 0, L = 0;
    const ok = varre(d, (eM, x, y) => {
      if (!eM) { const c = Math.hypot(x - x0, y - y0); seg.push([x0, y0, x, y, c]); L += c; }
      x0 = x; y0 = y;
    });
    out = [];
    if (ok) {
      for (let i = 0, j = 0, acum = 0; i < n && L; i++) {
        const alvo = L * (i + .5) / n;
        while (j < seg.length - 1 && acum + seg[j][4] < alvo) acum += seg[j++][4];
        const [a, b, c, e, s] = seg[j], f = s ? Math.min(1, (alvo - acum) / s) : 0;
        out.push([a + (c - a) * f, b + (e - b) * f]);
      }
    } else if (d) {
      const p = document.createElementNS(NS, 'path');
      p.setAttribute('d', d);
      const T = p.getTotalLength();
      for (let i = 0; i < n && T; i++) { const q = p.getPointAtLength(T * (i + .5) / n); out.push([q.x, q.y]); }
    }
    amostras.set(k, out);
    return out;
  }
  let foco = null, achou = new Set();
  // cor de cada município pela NAE dele (faixas; a legenda sai daqui) e, por cima, o contorno das regionais
  let FAIXAS = [0, 1, 11, 31, 101, 201];
  const faixa = n => FAIXAS.reduce((k, l, i) => n >= l ? i : k, 0);
  // visões do mapa (pedido do usuário: "mantendo esse mesmo layout e design"): as mesmas cores, legenda, cartões e
  // balões; só troca a métrica. NAE-Vegetação (padrão) e, de assets/mapa-municipios-visoes.js (window.MUN_VIS, de
  // gera-visoes.js: por município e, dentro dele, por alimentador), Manutenção (OS executadas, sem limpeza de faixa),
  // Inspeção (km inspecionados), Inspeção que gerou manutenção (OS geradas) e Limpeza de faixa (km executados).
  // Escolhe-se no título da legenda (ou na orelhinha, com ela recolhida); a escolhida fica na URL (?v=limpeza).
  // Sem o arquivo das visões, só a NAE (como antes). c: coluna em MUN_VIS (campos); faixas de MUN_VIS.faixas.
  const MV = window.MUN_VIS && window.MUN_VIS.muns && window.MUN_VIS.faixas ? window.MUN_VIS : null;
  const VIS = [
    { id: 'nae', nome: 'NAE-Vegetação', curto: 'NAE', un: 'NAE', mais: 'NAE', sem: 'Sem NAE', o: 'pontos de vegetação na rede', faixas: FAIXAS },
    { id: 'manutencao', nome: 'Manutenção', curto: 'Manutenção', un: 'OS', mais: 'OS de manutenção', sem: 'Sem OS', o: 'OS executadas (sem limpeza de faixa)', c: 0 },
    { id: 'inspecao', nome: 'Inspeção', curto: 'Inspeção', un: 'km', mais: 'km inspecionados', sem: 'Sem inspeção', o: 'km inspecionados', c: 1 },
    { id: 'insp-manut', nome: 'Inspeção que gerou manutenção', curto: 'Insp→manut', un: 'OS', mais: 'OS geradas pela inspeção', sem: 'Sem OS', o: 'OS geradas pela inspeção', c: 2 },
    { id: 'limpeza', nome: 'Limpeza de faixa', curto: 'Limpeza', un: 'km', mais: 'km de limpeza de faixa', sem: 'Sem limpeza', o: 'km de faixa limpos (executada)', c: 3 }
  ].filter(v => v.c === undefined || (MV && (v.faixas = MV.faixas[(MV.campos || [])[v.c]])));
  let V = VIS.find(v => v.id === new URLSearchParams(location.search).get('v')) || VIS[0];
  FAIXAS = V.faixas;
  const vMun = m => V.c === undefined ? m.nae || 0 : (MV.muns[m.cod] || {})[MV.campos[V.c]] || 0;
  const vAl = (m, a) => V.c === undefined ? a.n || 0 : ((((MV.muns[m.cod] || {}).als || {})[a.cod] || [])[V.c] || 0);   // NAE: a do alimentador
  const somaV = ms => ms.reduce((s, m) => s + vMun(m), 0);
  const comoNae = f => { const v = V; V = VIS[0]; try { f(); } finally { V = v; } };   // f com os números da NAE
  // número da visão (km com 1 casa até 100 km) e com a unidade ("36 NAE", "12 OS", "34,5 km")
  const numV = n => V.un !== 'km' ? (n || 0).toLocaleString('pt-BR') : !n ? '0' : n < 50 ? '<0,1' :   // 15 a 49 m não viram 0,0 km
    (n / 1000).toLocaleString('pt-BR', n < 1e5 ? { minimumFractionDigits: 1, maximumFractionDigits: 1 } : { maximumFractionDigits: 0 });
  const txtV = n => `${numV(n)} ${V.un}`;
  const kmF = l => (l / 1000).toLocaleString('pt-BR');
  const rotFaixa = i => i === 0 ? V.sem : V.un === 'km' ? (i === 1 ? `até ${kmF(FAIXAS[2])} km` : i === FAIXAS.length - 1 ? `${kmF(FAIXAS[i])} km ou mais` : `${kmF(FAIXAS[i])} a ${kmF(FAIXAS[i + 1])} km`) :
    (i === FAIXAS.length - 1 ? `${FAIXAS[i].toLocaleString('pt-BR')}${V.un === 'OS' ? ' OS' : ''} ou mais` : `${FAIXAS[i].toLocaleString('pt-BR')} a ${(FAIXAS[i + 1] - 1).toLocaleString('pt-BR')}${V.un === 'OS' ? ' OS' : ''}`);
  // texto das faixas na rampa: inteiro (l: "11–30", c: só o começo) ou km ("10–25", "até 10"; c: ">0")
  const rotRampa = (i, curto) => {
    const l = FAIXAS[i], ult = i === FAIXAS.length - 1, f = V.un === 'km' ? kmF : n => n.toLocaleString('pt-BR');
    if (i === 0) return '0';
    if (ult) return f(l) + '+';
    if (V.un === 'km') return curto ? (i === 1 ? '>0' : f(l)) : i === 1 ? 'até ' + f(FAIXAS[2]) : f(l) + '–' + f(FAIXAS[i + 1]);
    return curto ? f(l) : f(l) + '–' + f(FAIXAS[i + 1] - 1);
  };
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
    p.setAttribute('class', `mun ${m.slug ? 'tem' : 'sem'} nae-${faixa(vMun(m))}`);
    if (m.slug) { p.setAttribute('tabindex', '-1'); p.setAttribute('role', 'button'); p.setAttribute('aria-label', m.nome); }
    p.dataset.cod = m.cod;
    grupo(m).append(p);
    el[m.cod] = p;
  });
  // contornos (polos e regionais) em pedaços por célula da grade de 128 unidades (ver pedacos): o desenho é o mesmo,
  // mas cada ladrilho do raster só traça os pedaços perto dele (antes, os 3 contornos das regionais e os 8 dos polos
  // inteiros, em todo ladrilho, a cada quadro do voo)
  const emPedacos = (alvo, chave, d) => pedacos(chave, d, 128).forEach(dd => {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', dd);
    alvo.append(p);
  });
  // contorno do polo: um traço claro por baixo (fundo) faz a cor aparecer também sobre os municípios laranja
  Object.entries(grp).forEach(([polo, gp]) => ['mt-poloc fundo', 'mt-poloc'].forEach(cl => {
    const c = document.createElementNS(NS, 'g');
    c.setAttribute('class', cl);
    c.setAttribute('aria-hidden', 'true');
    emPedacos(c, 'polo:' + polo, (M.pols || {})[polo] || '');
    gp.append(c);
  }));
  const regs = document.createElementNS(NS, 'g');
  regs.setAttribute('class', 'mt-regc');
  regs.setAttribute('aria-hidden', 'true');
  Object.entries(M.regs || {}).forEach(([r, d]) => emPedacos(regs, 'reg:' + r, d));
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
    leg.innerHTML = '<div class="mt-regs-c" id="mt-regs-c"></div>' +
      '<button type="button" class="mt-regs-b"><span class="mt-regs-m" aria-hidden="true"></span>' +
      '<span class="mt-regs-o"></span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 15 6-6 6 6"/></svg></button>' +
      '<div class="mt-vis-menu" id="mt-vis-menu" role="menu" aria-label="Visão do mapa" hidden></div>';
    (barra || caixa).append(leg);
  }
  const legBt = leg && leg.querySelector('.mt-regs-b'), legC = leg && leg.querySelector('.mt-regs-c'), menu = leg && leg.querySelector('.mt-vis-menu');
  // conteúdo da legenda na visão atual: o título (botão que troca a visão, com mais de uma), a rampa e, na orelhinha, a
  // mini rampa e o nome curto
  function poeLegenda() {
    if (!leg) return;
    legC.innerHTML = (VIS.length > 1 ? '<button type="button" class="mt-regs-t mt-vis-b" aria-haspopup="menu" aria-controls="mt-vis-menu" aria-expanded="false" ' +
      `title="Trocar a visão do mapa" aria-label="Visão do mapa: ${esc(V.nome)}. Trocar a visão">${esc(V.nome)}<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button>`
      : `<b class="mt-regs-t" aria-hidden="true">${esc(V.nome)}</b>`) +
      `<div class="mt-rampa" role="list" aria-label="Faixas de ${esc(V.nome)}">` + FAIXAS.map((l, i) => `<span role="listitem" title="${rotFaixa(i)}"><i class="nae-${i}" aria-hidden="true"></i>` +
      `<em aria-hidden="true"><span class="mt-f-l">${rotRampa(i)}</span><span class="mt-f-c">${rotRampa(i, true)}</span></em>` +
      `<span class="vh">${rotFaixa(i)}</span></span>`).join('') + '</div>';
    leg.querySelector('.mt-regs-m').innerHTML = FAIXAS.map((l, i) => `<i class="nae-${i}"></i>`).join('');
    leg.querySelector('.mt-regs-o').textContent = V.curto;
    ajustaTitulo();
  }
  // o título não alarga a legenda além da rampa (na tela estreita "Inspeção que gerou manutenção" jogava a legenda para
  // outra linha e o mapa descia): não cabendo, fica o nome curto ("Insp→manut"; o completo segue no aria-label e no menu)
  function ajustaTitulo() {
    const t = legC && legC.querySelector('.mt-vis-b');
    if (!t || legC.hidden || V === VIS[0] || V.curto === V.nome) return;
    t.firstChild.textContent = V.curto;
    const curto = legC.offsetWidth;
    t.firstChild.textContent = V.nome;
    if (legC.offsetWidth > curto + .5) t.firstChild.textContent = V.curto;
  }
  addEventListener('resize', ajustaTitulo);
  let reancoraPend = false;                             // visão trocada com a legenda recolhida: ao mostrar, os cartões voltam ao fio
  poeLegenda();
  function legenda(sim, guarda) {
    legAberta = sim;
    alvo.classList.toggle('sem-nae', !sim);
    if (leg) {
      fechaMenu();
      leg.classList.toggle('fechada', !sim);
      legC.hidden = !sim;
      // aberta, a orelhinha esconde a legenda; recolhida (com mais de uma visão), ela abre o menu das visões
      const nums = V === VIS[0] ? 'os números de NAE' : 'os números', menuNela = !sim && VIS.length > 1;
      legBt.setAttribute('aria-controls', menuNela ? 'mt-vis-menu' : 'mt-regs-c');
      legBt.setAttribute('aria-expanded', menuNela ? 'false' : String(sim));
      if (menuNela) legBt.setAttribute('aria-haspopup', 'menu'); else legBt.removeAttribute('aria-haspopup');
      legBt.setAttribute('aria-label', menuNela ? `Legenda ${V.nome} recolhida. Trocar a visão ou mostrar a legenda` : `Legenda ${V.nome}`);
      leg.title = legBt.title = sim ? `Esconder a legenda e ${nums} (clique ou arraste para cima)` :
        menuNela ? `Trocar a visão ou mostrar a legenda e ${nums} (clique; ou puxe para baixo)` : `Mostrar a legenda e ${nums} (clique ou puxe para baixo)`;
      if (sim) ajustaTitulo();
    }
    if (sim && reancoraPend) { reancoraPend = false; reancoraNivel(); }
    if (!guarda) return;
    try { localStorage.setItem('argos-legenda', sim ? 'aberta' : 'fechada'); } catch (e) { /* só nesta visita */ }
    poeNomes();                                         // sem o número os cartões dos municípios encolhem: cabem mais nomes
  }
  // menu das visões, preso embaixo da legenda (ou da orelhinha): as visões (uma marcada) e, por último, mostrar ou
  // esconder a legenda e os números. Setas andam, Enter escolhe, Esc fecha (o foco volta ao botão que abriu).
  let menuDe = null;
  function abreMenu(de) {
    menuDe = de;
    menu.innerHTML = VIS.map(v => `<button type="button" class="mt-vis-op" role="menuitemradio" aria-checked="${v === V}" tabindex="-1" data-v="${v.id}">` +
      `<i aria-hidden="true"></i><b>${esc(v.nome)}</b><small>${esc(v.o)}</small></button>`).join('') +
      `<span class="mt-vis-sep" role="separator"></span><button type="button" class="mt-vis-op mt-vis-leg" role="menuitem" tabindex="-1">${legAberta ? 'Esconder' : 'Mostrar'} a legenda e os números</button>`;
    menu.hidden = false;
    menu.style.maxHeight = '';                          // não passa do pé da tela (paisagem baixa, tela cheia): rola por dentro
    const r = menu.getBoundingClientRect(), vh = window.visualViewport ? visualViewport.height : innerHeight;
    if (r.bottom > vh - 8) menu.style.maxHeight = Math.max(120, vh - 8 - r.top).toFixed(0) + 'px';
    de.setAttribute('aria-expanded', 'true');
    menu.querySelector('[aria-checked="true"]').focus({ preventScroll: true });
  }
  function fechaMenu(foco) {
    if (!menu || menu.hidden) return;
    menu.hidden = true;
    menu.innerHTML = '';
    if (!menuDe) return;
    menuDe.setAttribute('aria-expanded', 'false');
    if (foco && menuDe.isConnected) menuDe.focus({ preventScroll: true });
    menuDe = null;
  }
  legenda(legAberta);
  if (menu) {
    menu.addEventListener('click', e => {
      e.stopPropagation();                              // o clique não chega à legenda (que esconderia ela)
      const op = e.target.closest('.mt-vis-op');
      if (!op) return;
      const de = menuDe;
      fechaMenu(e.detail === 0);                        // pelo teclado o foco volta ao botão
      if (op.dataset.v) { visao(op.dataset.v); if (e.detail === 0 && de && !de.isConnected) { const t = leg.querySelector('.mt-vis-b'); if (t) t.focus({ preventScroll: true }); } }
      else { legenda(!legAberta, true); if (e.detail === 0) (legAberta ? leg.querySelector('.mt-vis-b') || legBt : legBt).focus({ preventScroll: true }); }
    });
    menu.addEventListener('keydown', e => {
      const ops = [...menu.querySelectorAll('.mt-vis-op')], i = ops.indexOf(document.activeElement);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); ops[(i + (e.key === 'ArrowDown' ? 1 : ops.length - 1)) % ops.length].focus(); }
      else if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); ops[e.key === 'Home' ? 0 : ops.length - 1].focus(); }
      else if (e.key === 'Escape') { e.preventDefault(); fechaMenu(true); }
      else if (e.key === 'Tab' || e.ctrlKey || e.metaKey || e.altKey) fechaMenu();   // atalho (Ctrl+X do raio-X…) segue adiante
    });
    document.addEventListener('pointerdown', e => { if (!menu.hidden && !leg.contains(e.target)) fechaMenu(); });
    // o foco saiu do menu sem toque nenhum (ex.: "/" abre a busca): fecha. Toque dentro da legenda não conta (no Safari o
    // botão não ganha o foco no clique e o foco cai no body antes do clique chegar à opção)
    let tocou = false;
    leg.addEventListener('pointerdown', () => { tocou = true; });
    document.addEventListener('pointerup', () => setTimeout(() => { tocou = false; }, 0));
    menu.addEventListener('focusout', e => { if (!menu.hidden && !tocou && !(e.relatedTarget && leg.contains(e.relatedTarget))) fechaMenu(); });
  }
  if (leg) {                                            // clique em qualquer ponto dela, ou arrastar: para cima esconde, para baixo mostra
    let y0 = null, arrastou = false;
    leg.addEventListener('pointerdown', e => { if (!e.button && menu.hidden) { y0 = e.clientY; arrastou = false; } });
    document.addEventListener('pointermove', e => {      // no documento: a orelhinha é pequena e o arrasto sai dela
      if (y0 === null) return;
      const dy = e.clientY - y0;
      if (legAberta ? dy < -16 : dy > 16) { y0 = null; arrastou = true; legenda(!legAberta, true); }
    });
    document.addEventListener('pointerup', () => { y0 = null; setTimeout(() => { arrastou = false; }, 0); });   // o clique que vem logo depois do arrasto é ignorado
    document.addEventListener('pointercancel', () => { y0 = null; });
    leg.addEventListener('click', e => {
      if (arrastou) { arrastou = false; return; }
      if (e.target.closest('.mt-vis-menu')) return;    // o menu trata os cliques dele
      if (!menu.hidden) { fechaMenu(); return; }       // menu aberto: clicar na legenda (rampa, orelhinha, título) só fecha o menu
      const bt = e.target.closest('.mt-vis-b') || (!legAberta && VIS.length > 1 ? legBt : null);   // título, ou a orelhinha recolhida: menu das visões
      if (bt) { if (menu.hidden) abreMenu(bt); else fechaMenu(); return; }
      legenda(!legAberta, true);
    });
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
  // n pontos ao longo do contorno k.chave (d em k.d), em px da caixa (t: matriz do svg na tela, c: retângulo da caixa);
  // k.desl: o quanto o grupo está afastado (polo na regional aberta), no lugar de ler o transform do grupo (que é o mesmo
  // no fim da transição)
  function contorno(k, n, t, c) {
    const [dx, dy] = k.desl || [0, 0];
    if (!t) return [];
    return amostra(k.chave, k.d, n).map(([x, y]) => (x += dx, y += dy, { x: t.a * x + t.c * y + t.e - c.left, y: t.b * x + t.d * y + t.f - c.top }));
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
      if (!melhor || nota < melhor.nota) melhor = { nota, x, y, ax: p.x, ay: p.y, R, al };
    }
    return melhor;
  }
  // põe cada cartão (k.e) no lugar achado no contorno (k.chave/k.d) e devolve os fios; sem lugar, o cartão fica no meio do grupo.
  // Fora da NAE (troca: põe nos cartões o número da visão) o lugar é achado com o cartão da NAE e, trocado o número, o cartão
  // fica preso ao mesmo fio, no mesmo alinhamento: mudar de visão não tira nenhum cartão do lugar. Esse lugar (k.ref e
  // cards.fiosRef) é a referência de todas as visões; refaz: lugar só desta visão, quando o cartão dela bate em outro
  function bandeiras(cards, ms, troca, refaz) {
    const c = caixa.getBoundingClientRect(), noMapa = mascara(ms), ctm = svg.getScreenCTM(), linhas = [];
    let feitos = [];
    try { feitos = [tc, volta].filter(o => o && o.offsetParent).map(o => rel(o.getBoundingClientRect())); } catch (e) { /* ainda montando */ }
    const tam = cards.map(k => [k.e.offsetWidth, k.e.offsetHeight]);   // lidos todos antes de mexer em qualquer cartão
    cards.forEach((k, i) => {
      const [w, h] = tam[i], b = planta(contorno(k, 90, ctm, c), w, h, noMapa, feitos, c.width, c.height);
      if (!b) {
        const pt = svg.createSVGPoint();
        [pt.x, pt.y] = k.centro;
        const s = pt.matrixTransform(ctm);
        k.e.style.left = (s.x - c.left - w / 2).toFixed(0) + 'px'; k.e.style.top = (s.y - c.top - h / 2).toFixed(0) + 'px';
        if (!refaz) k.ref = { meio: true, x: s.x - c.left, y: s.y - c.top };
        return;
      }
      k.e.style.left = b.x.toFixed(0) + 'px'; k.e.style.top = b.y.toFixed(0) + 'px';
      if (!refaz) k.ref = { ax: b.ax, al: b.al, fundo: b.y + h };
      feitos.push(b.R, { left: b.ax - 2, right: b.ax + 2, top: b.y + h, bottom: b.ay });   // o fio também não pode ser coberto
      linhas.push(fio(b.ax, b.ay, b.ax, b.y + h, k.cor));
    });
    if (!refaz) { cards.fiosRef = linhas.join(''); cards.refeito = false; }
    if (troca) { troca(); if (!reancora(cards)) { cards.refeito = true; return bandeiras(cards, ms, null, true); } }   // bateu: lugar desta visão
    return linhas.join('');
  }
  // cartão com outro texto (outra visão): continua preso ao mesmo fio, no mesmo alinhamento (sem procurar lugar de novo)
  // (e sem sair da caixa do mapa: o número de outra visão pode ser mais largo)
  // Devolve false se algum cartão ficou batendo em outro (ou na seta, na tela cheia, ou saiu por cima): aí quem chamou
  // procura lugar de novo com o tamanho de agora (só nesse caso; senão o lugar não muda)
  function reancora(cards) {
    const tam = cards.map(k => [k.e.offsetWidth, k.e.offsetHeight]), CW = caixa.clientWidth, R = [];
    cards.forEach((k, i) => {
      const [w, h] = tam[i], a = k.ref;
      if (!a) return;
      const x = Math.max(2, Math.min(CW - 2 - w, a.meio ? a.x - w / 2 : a.ax - w * a.al)), y = a.meio ? a.y - h / 2 : a.fundo - h;
      k.e.style.left = x.toFixed(0) + 'px'; k.e.style.top = y.toFixed(0) + 'px';
      R.push({ left: x, top: y, right: x + w, bottom: y + h });
    });
    let obst = [];
    try { obst = [tc, volta].filter(o => o && o.offsetParent).map(o => rel(o.getBoundingClientRect())); } catch (e) { /* ainda montando */ }
    const bateu = (a, b) => a.left < b.right + 2 && a.right + 2 > b.left && a.top < b.bottom + 2 && a.bottom + 2 > b.top;
    return !R.some((a, i) => a.top < 2 || R.some((b, j) => j > i && bateu(a, b)) || obst.some(o => bateu(a, o)));
  }
  // cartões do nível aberto (regionais, ou polos da regional) presos de novo ao fio, com o número da visão
  // (de volta ao lugar de referência e aos fios dele; batendo em outro, lugar só desta visão)
  function reancoraNivel() {
    if (anima) return;
    const ks = !reg ? (regK && fios.innerHTML ? regK : null) : !pol && selK && selK.cards[0].e.isConnected ? selK.cards : null;
    if (!ks) return;
    if (!reancora(ks)) { ks.refeito = true; fios.innerHTML = bandeiras(ks, reg ? M.muns.filter(m => m.reg === reg) : M.muns, null, true); }
    else if (ks.refeito) { ks.refeito = false; fios.innerHTML = ks.fiosRef; }
  }
  const meio = ms => {                                     // município mais perto do meio do grupo: o ponto cai dentro dele
    const mx = ms.reduce((s, m) => s + m.c[0], 0) / ms.length, my = ms.reduce((s, m) => s + m.c[1], 0) / ms.length;
    return ms.reduce((a, b) => Math.hypot(b.c[0] - mx, b.c[1] - my) < Math.hypot(a.c[0] - mx, a.c[1] - my) ? b : a);
  };
  const cartoes = document.createElement('div');
  cartoes.className = 'mt-regcards';
  const regInfo = Object.keys(M.regs || {}).map(r => {
    const ms = M.muns.filter(m => m.reg === r);
    return { r, a: meio(ms).c, ms };
  });
  cartoes.innerHTML = regInfo.map(i => `<button type="button" data-reg="${esc(i.r)}"><b>${esc(i.r)}</b><i></i></button>`).join('');
  const poeRegCards = () => [...cartoes.children].forEach((b, k) => {   // o número é a soma dos municípios da regional, na visão atual
    const t = txtV(somaV(regInfo[k].ms));
    b.setAttribute('aria-label', `Abrir a Regional ${regInfo[k].r}, ${t}`);
    b.lastChild.textContent = t;
  });
  poeRegCards();
  caixa.append(cartoes);
  cartoes.addEventListener('click', e => { const b = e.target.closest('button'); if (b) entra(b.dataset.reg, e.detail === 0); });
  const poeCartoes = () => {                                // só no estado inteiro e parado (o contorno é lido da tela)
    if (caixa.classList.contains('aberta') || caixa.classList.contains('voando') || !svg.getBoundingClientRect().width) return;
    const outra = V !== VIS[0];
    if (outra) comoNae(poeRegCards);                       // o lugar é o do cartão da NAE (ver bandeiras)
    regK = [...cartoes.children].map((e, i) => ({ e, chave: 'reg:' + regInfo[i].r, d: M.regs[regInfo[i].r], centro: regInfo[i].a }));
    fios.innerHTML = bandeiras(regK, M.muns, outra && poeRegCards);
  };
  let regK = null, selK = null;                             // cartões das regionais e dos polos já postos (com a âncora)
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
  // letra de ~11,5 px na tela em qualquer largura do mapa.
  // Em voo não mede nada (no celular a altura do svg muda a cada quadro), nem com uma regional aberta (nomes e cartões
  // só aparecem no estado inteiro): o pouso no estado inteiro chama escala(true). Sem forca, só refaz se o tamanho do
  // svg mudou: o ResizeObserver avisa logo depois do pouso a mudança que o próprio pouso já tratou (era tudo em dobro).
  let anima = 0;                                           // id do requestAnimationFrame do voo (0 = parado)
  let reg = null, pol = null, mdesl = {}, corDe = {};      // nível aberto (regional, polo) e os afastamentos
  let tamSvg = '';
  const escala = forca => {
    if (anima || reg) return;
    const r = svg.getBoundingClientRect();                 // o SVG pode ficar limitado pela altura (max-height)
    if (!r.width || !r.height) return;
    const k = r.width + 'x' + r.height;
    if (forca !== true && k === tamSvg) return;
    tamSvg = k;
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
      dica.innerHTML = `<span class="mt-dica-h"><b class="cod">${esc(a.cod)}</b><i>${txtV(vAl(m, a))}</i></span><small>${esc(a.se)} · ${km(a.m)} em ${esc(m.nome)}</small>` +
        '<small class="mt-dica-c">Clique para abrir o painel do alimentador</small>';
      dica.style.left = (e.clientX - r.left) + 'px'; dica.style.top = (e.clientY - r.top) + 'px'; dica.style.display = 'block';
      return;
    }
    if (mun) realceAl(null);
    const p = e.target.closest('.mun');
    if (!p) { dica.style.display = 'none'; return; }
    const m = porCod[p.dataset.cod], r = caixa.getBoundingClientRect();
    if (!reg) realca(m.reg); else if (!pol) realcaPolo(m.reg === reg ? m.polo : null);
    dica.innerHTML = `<span class="mt-dica-h"><b>${esc(m.nome)}</b><i>${txtV(vMun(m))}</i></span><small>${m.reg ? `Regional ${esc(m.reg)} · ${esc(m.polo)}` : ''}${m.slug ? `${m.reg ? ' · ' : ''}${nAls(m)} · ${km(kmTot(m))}` : `${m.reg ? ' · ' : ''}sem dados ainda`}</small>` +
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
  const TODO = [-6, -6, VW, M.h + 12], AFASTA = 0.32, AFASTA_MUN = 0.30, DUR = 650, CORES = ['a', 'b', 'c', 'd'];
  // cubic-bezier como no CSS: acha o t da curva para o x pedido (Newton; bisseção se não convergir)
  const bezier = (x1, y1, x2, y2) => {
    const c = (a, b, t) => ((1 - 3 * b + 3 * a) * t + (3 * b - 6 * a)) * t * t + 3 * a * t;
    const dc = (a, b, t) => (3 - 9 * b + 9 * a) * t * t + (6 * b - 12 * a) * t + 3 * a;
    return x => {
      if (x <= 0) return 0;
      if (x >= 1) return 1;
      let t = x;
      for (let i = 0; i < 8; i++) { const e = c(x1, x2, t) - x, d = dc(x1, x2, t); if (Math.abs(e) < 1e-6 || Math.abs(d) < 1e-6) break; t -= e / d; }
      if (!(t >= 0 && t <= 1) || Math.abs(c(x1, x2, t) - x) > 1e-4) {
        let lo = 0, hi = 1;
        for (let i = 0; i < 40; i++) { t = (lo + hi) / 2; if (c(x1, x2, t) < x) lo = t; else hi = t; }
      }
      return c(y1, y2, t);
    };
  };
  // a câmera usa a MESMA curva das transições dos polos e municípios (site.css: .mt-polo e .mt-polo .mun): o mapa e os
  // grupos que se afastam andam juntos, sem um "escorregar" sobre o outro no meio do voo
  const curva = bezier(.45, 0, .55, 1);
  // trajeto da câmera: a escala muda em progressão geométrica (zoom de ritmo constante: não "dispara" no fim ao
  // aproximar nem no começo ao afastar) e o canto anda junto, de modo que o ponto fixo do zoom fica parado na tela
  const eixo = (x0, w0, x1, w1) => {
    const r = w1 / w0;
    if (!(r > 0) || Math.abs(r - 1) < 1e-3) return e => [x0 + (x1 - x0) * e, w0 + (w1 - w0) * e];
    const lr = Math.log(r);
    return e => { const s = Math.exp(lr * e); return [x0 + (x1 - x0) * (s - 1) / (r - 1), w0 * s]; };
  };
  const trajeto = (a, b) => {
    const X = eixo(a[0], a[2], b[0], b[2]), Y = eixo(a[1], a[3], b[1], b[3]);
    return e => { const [x, w] = X(e), [y, h] = Y(e); return [x, y, w, h]; };
  };
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
  // voo: anima o viewBox até o alvo. O relógio começa no 1º quadro (o mesmo em que começam as transições CSS dos polos
  // e municípios): sem salto no início mesmo se o clique custou caro. Em voo só o viewBox muda; nada mede o DOM.
  // Nomes e cartões somem (site.css: .voando) e voltam no pouso, já no lugar novo; a rede do município entra no pouso.
  function voa(alvoVb) {
    cancelAnimationFrame(anima);
    caixa.classList.remove('pronta');
    caixa.classList.add('voando');
    const de = vb(), dur = calmo() ? 0 : DUR, cam = trajeto(de, alvoVb);
    let t0 = 0;
    const passo = agora => {
      if (!t0) t0 = agora;
      const t = dur ? Math.min(1, (agora - t0) / dur) : 1;
      if (t > 0) svg.setAttribute('viewBox', (t < 1 ? cam(curva(t)) : alvoVb).map(v => +v.toFixed(4)).join(' '));
      if (t < 1) anima = requestAnimationFrame(passo); else { anima = 0; pousa(); }
    };
    selos.innerHTML = '';
    fios.innerHTML = '';
    anima = requestAnimationFrame(passo);           // antes do evento: quem ouve já vê o voo em andamento (quieto)
    document.dispatchEvent(new CustomEvent('argos-nivel', { detail: { reg, pol, mun, al: alf } }));   // a busca acompanha o nível
  }
  // trabalho que pode esperar o voo (miniaturas da rede): quieto() resolve depois do pouso, um por tarefa
  // (sem tarefa longa logo depois do pouso); se outro voo começa, o resto espera o próximo pouso
  const esperas = [];
  const quieto = () => anima ? new Promise(res => esperas.push(res)) : Promise.resolve();
  const solta = () => { if (anima || !esperas.length) return; esperas.shift()(); setTimeout(solta, 0); };
  // pouso: o que esperou o voo (medidas, nomes, cartões, rede) entra de uma vez
  function pousa() {
    caixa.classList.remove('voando');
    caixa.classList.toggle('pronta', !!reg);
    if (reg && chaveEnq() !== baseEnq) svg.setAttribute('viewBox', enquadra().join(' '));   // a caixa mudou de tamanho em pleno voo
    tamCaixa = chaveCaixa();                        // nomes e cartões abaixo saem neste tamanho (o ResizeObserver compara com ele)
    if (!reg) escala(true);                         // estado inteiro: letra dos nomes e bandeirinhas das regionais
    poeNomes();
    poeSelos();
    agendaRede();
    setTimeout(solta, 0);
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
  // tamanho em que o último enquadramento foi feito (no celular só a largura conta: a altura sai do próprio viewBox)
  let baseEnq = '';
  const chaveEnq = () => caixa.clientWidth + 'x' + (matchMedia('(max-width:860px)').matches ? '' : svg.clientHeight || 600);
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
    if (matchMedia('(max-width:860px)').matches) { const t = 52 * w / W, f = 52 * w / W; baseEnq = W + 'x'; return [x, y - t, w, h + t + f]; }
    // a coluna da esquerda (seta e lista de alimentadores) fica livre; a legenda fica na barra, em cima do mapa
    // com a busca da barra, a lista do município aberto abre embaixo da logo (largura fixa no site.css): o lado esquerdo fica livre para ela
    const lista = window.ARGOS_BUSCA && mun && !alf ? Math.min(460, innerWidth - 32) : 0;
    // na regional sobra uma faixa em cima e um pouco à direita para as bandeirinhas dos polos
    const T = reg && !pol && !mun && !alf ? 56 : 0;
    const H = svg.clientHeight || 600, L1 = Math.max(lado.offsetWidth, leg && caixa.contains(leg) ? leg.offsetWidth : 0, lista) + 24, L2 = T ? 120 : 24;
    const k = Math.min((H - T) / h, Math.max(1e-3, W - L1 - L2) / w);
    baseEnq = W + 'x' + H;
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
      return { polo, gp, ms, cx: (b.x + b.x2) / 2, cy: (b.y + b.y2) / 2, b };
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
  const numeros = ms => txtV(somaV(ms));                  // soma dos municípios, na visão atual
  const nae = n => `<i>${numV(n)}</i>`;
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
      `aria-label="${esc(p.polo)}, ${numeros(p.ms)}"><b>${esc(p.polo)}</b>${nae(somaV(p.ms))}</button>`).join('');
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
    const ms = M.muns.filter(m => m.polo === pol);
    legPolos.setAttribute('aria-label', `Polo ${pol}`);
    legPolos.innerHTML = passo('estado', 'Tocantins') + passo('regional', esc(reg)) +
      `<span class="mt-pchip mt-atual" style="--c:${corDe[pol]}" aria-current="location" aria-label="${esc(pol)}, ${numeros(ms)}"><b>${esc(pol)}</b>${nae(somaV(ms))}</span>`;
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
  // rede em pedaços (ver pedacos), numa célula de ~180 px na tela no zoom de chegada; em potência de 2 para
  // reaproveitar o corte entre zooms parecidos
  const CEL_PX = 180;
  const celula = alvoVb => {
    const ppu = Math.min(svg.clientWidth / alvoVb[2], (svg.clientHeight || 1e9) / alvoVb[3]) || 1;
    return 2 ** Math.round(Math.log2(CEL_PX / ppu));
  };
  // miniatura da rede (lista da busca e caixa ao lado do mapa): {d, b} com a mesma rede numa grade de 1/120 do tamanho
  // dela (meio pixel numa miniatura de 56 px), sem segmentos nulos nem repetidos, escrita em unidades da grade (inteiros
  // de 0 a 120; b é a caixa nessas unidades, para o viewBox): fica 5 a 20 vezes menor e sem formatar números. O navegador
  // lia e desenhava a rede inteira (até 160 kB) em cada miniatura.
  // A leitura do texto (varre) é o que mais custa: com o município aberto a miniatura sai na mesma passada do corte da
  // rede para a tela (pedacos com junto), em vez de ler a rede duas vezes.
  const minis = new Map();
  function miniD(al, r) {
    const s = minis.get(al);
    if (s) return s;
    if (mun && porCod[mun].als.some(a => a.cod === al) && !cortes.has(al + '|' + celMun)) pedacos(al, r.d, celMun, miniador(al, r));
    else { const mm = miniador(al, r); mm.fim(varre(r.d, mm.f)); }
    return minis.get(al);
  }
  function miniador(al, r) {                                    // {f: um ponto por vez, fim: guarda a miniatura}
    const [x0, y0, x1, y1] = r.b, q = Math.max(x1 - x0, y1 - y0, .05) / 120;
    const out = [], visto = new Set();                          // chaves numéricas: ponto da grade e segmento (par de pontos)
    let pk = -1, pgx = 0, pgy = 0, fk = -1, fgx = 0, fgy = 0, uk = -1;   // p: último M; f: fim do último segmento; u: último escrito
    const f = (eM, x, y) => {
      const gx = Math.round((x - x0) / q), gy = Math.round((y - y0) / q), k = (gx + 64) * 4096 + (gy + 64);
      if (eM) { pk = k; pgx = gx; pgy = gy; return; }
      let ik = fk, igx = fgx, igy = fgy;
      if (pk >= 0) { ik = pk; igx = pgx; igy = pgy; pk = -1; }
      fk = k; fgx = gx; fgy = gy;
      if (ik < 0 || ik === k) return;
      const sk = ik < k ? ik * 16777216 + k : k * 16777216 + ik;
      if (visto.has(sk)) return;
      visto.add(sk);
      out.push(ik === uk ? 'L' + gx + ',' + gy : 'M' + igx + ',' + igy + 'L' + gx + ',' + gy);
      uk = k;
    };
    return { f, fim: ok => { minis.set(al, ok ? { d: out.join(''), b: [0, 0, (x1 - x0) / q, (y1 - y0) / q] } : { d: r.d, b: r.b }); } };
  }
  // a rede chega aos poucos (um JSON por alimentador) e entra na tela fora do voo: em lotes de ~24 ms de trabalho por
  // quadro, cada lote com o seu esmaecer (um só grupo anima, não cada path). Cada lote faz o navegador repintar a rede
  // toda: lotes maiores (menos quadros) terminam antes no celular, sem passar de ~70 ms por quadro no computador
  let fila = [], filaId = 0, celMun = 1;
  const agendaRede = () => { if (!filaId && !anima && fila.length) filaId = requestAnimationFrame(despeja); };
  const lote = () => { const g = document.createElementNS(NS, 'g'); g.setAttribute('class', 'lote'); return g; };
  function despeja() {
    filaId = 0;
    if (anima || !mun || !fila.length) return;
    const gF = camada.querySelector('.mt-redes-f'), gD = camada.querySelector('.mt-redes-d');
    if (!gF || !gD) { fila = []; return; }
    const lf = lote(), ld = lote(), t0 = performance.now();
    while (fila.length && performance.now() - t0 < 24) {     // o resto fica para o próximo quadro
      const [al, r] = fila.shift();
      pedacos(al, r.d, celMun, minis.has(al) ? null : miniador(al, r)).forEach(d => {   // a miniatura sai junto
        const f = document.createElementNS(NS, 'path');
        f.setAttribute('d', d);
        lf.append(f);
        const p = f.cloneNode();
        p.dataset.al = al;
        if (realcado === al) p.classList.add('on');
        ld.append(p);
      });
    }
    gF.append(lf);
    gD.append(ld);
    agendaRede();
  }
  // realce de um alimentador (mouse na rede ou na lista). A rede agora tem muitos pedaços por alimentador e o mousemove
  // chama isto a cada pixel: só mexe quando o alimentador muda, e só nos pedaços do que apaga e do que acende
  let realcado = null;
  const pedacosDe = al => camada.querySelectorAll(`path[data-al="${CSS.escape(al)}"]`);
  const realceAl = al => {
    if (alf) al = null;
    if (al === realcado) return;
    if (realcado) pedacosDe(realcado).forEach(p => p.classList.remove('on'));
    realcado = al;
    camada.classList.toggle('realce', !!al);
    if (al) pedacosDe(al).forEach(p => p.classList.add('on'));
    legAl.querySelectorAll('.mt-al').forEach(a => a.classList.toggle('on', a.dataset.al === al));
  };
  function entraMun(cod, teclado) {
    const m = porCod[cod];
    if (!pol || mun || !m || !m.slug || m.polo !== pol) return;
    mun = cod;
    dica.style.display = 'none';
    realcado = null;
    caixa.classList.add('nivel-mun');                   // os nomes do polo somem no voo (site.css: .voando) e saem no pouso
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
        `<button type="button" class="mt-al" data-al="${esc(a.cod)}" title="Clique para abrir o painel do alimentador"><span class="mt-al-m" aria-hidden="true"></span>` +
        `<b>${esc(a.cod)}</b><span><i>${txtV(vAl(m, a))}</i><em>${km(a.m)} aqui</em></span></button>`).join(''));
    legAl.classList.toggle('aberta', puxada);
    volta.setAttribute('aria-label', `${m.nome}. Voltar ao polo ${pol}`);
    volta.title = `Voltar ao polo ${pol}`;
    const alvoVb = enquadra();
    celMun = celula(alvoVb);
    fila = [];
    voa(alvoVb);
    roda(cod);
    if (teclado) el[cod].focus({ preventScroll: true });
    // a rede vai para a fila e entra depois do pouso (despeja); a miniatura só se a caixa ao lado do mapa estiver à
    // vista (com a busca da barra a lista é a dela, busca-ativo.js, e a caixa fica escondida). Os pedidos saem aos
    // poucos, alguns por quadro (cada fetch custa ~0,5 ms; dezenas de uma vez seguravam o clique e o 1º quadro do voo)
    const pede = als.slice();
    const pedeMais = () => {
      if (mun !== cod) return;
      const t0 = performance.now();
      while (pede.length && performance.now() - t0 < 4) {
        const a = pede.shift();
        rede(a.cod, m.polo).then(r => {
          if (mun !== cod || !r) return;
          fila.push([a.cod, r]);
          agendaRede();
          if (!legAl.hidden) quieto().then(() => miniCaixa(a.cod, r));
        });
      }
      if (pede.length) requestAnimationFrame(pedeMais);
    };
    requestAnimationFrame(pedeMais);
  }
  // miniatura na caixa ao lado do mapa (só sem a busca da barra)
  function miniCaixa(al, r) {
    const mini = legAl.querySelector(`.mt-al[data-al="${al}"] .mt-al-m`), mn = miniD(al, r), [x0, y0, x1, y1] = mn.b;
    const w = Math.max(x1 - x0, .05), h = Math.max(y1 - y0, .05), f = Math.max(w, h) * .08;
    if (mini) mini.innerHTML = `<svg viewBox="${x0 - f} ${y0 - f} ${w + 2 * f} ${h + 2 * f}"><path d="${mn.d}"/></svg>`;
  }
  // alimentador em foco (escolhido na busca ou em "Ver no mapa"): o mapa aproxima na rede inteira dele, que fica forte e
  // sem corte; os outros apagam. Clicar num alimentador (na lista ou na rede) abre direto a página dele.
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
    legAl.querySelectorAll('.mt-al').forEach(a => a.classList.toggle('foco', a.dataset.al === al));
    const ab = legAl.querySelector('.mt-amun');
    if (ab) { ab.href = pag(`alimentadores/${encodeURIComponent(al)}/`); ab.textContent = `Abrir ${al} →`; }
    trilhaMun();
    volta.setAttribute('aria-label', `${al}. Voltar a ${porCod[mun].nome}`);
    volta.title = `Voltar a ${porCod[mun].nome}`;
    const alvoVb = enquadra(), la = lote();               // a rede dele também em pedaços (célula do zoom no alimentador)
    pedacos(al, r.d, celula(alvoVb)).forEach(dd => {
      const pa = document.createElementNS(NS, 'path');
      pa.setAttribute('d', dd);
      pa.dataset.al = al;
      la.append(pa);
    });
    gf.append(la);
    voa(alvoVb);
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
    fila = [];                                         // a rede que ainda não entrou não entra mais
    cancelAnimationFrame(filaId);
    filaId = 0;
    realcado = null;
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
    if (al) { abreAl(al.dataset.al); return; }        // 1 clique abre o painel do alimentador (pedido do usuário)
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
  const zero = m => vMun(m) ? '' : ' class="zero"';
  const NIVEIS_ROT = [
    m => `<b>${esc(m.nome)}</b><i${zero(m)}>${txtV(vMun(m))}</i>`,      // cartão completo
    m => `<b>${esc(m.nome)}</b><i${zero(m)}>${txtV(vMun(m))}</i>`,      // cartão compacto (letra menor, via data-nv)
    m => `<i${zero(m)}>${numV(vMun(m))}</i>`,                           // só o número
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
    const ms = M.muns.filter(m => m.polo === pol).sort((a, b) => vMun(b) - vMun(a));
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
    // Tudo o que vem do DOM é lido antes de escrever qualquer coisa: os cartões dos 3 níveis de todos os municípios são
    // medidos de uma vez (uma leitura de layout só), a escolha é só conta e as escritas ficam para o fim. Antes cada
    // tentativa escrevia no cartão e a medida (ou o isPointInFill) seguinte refazia o layout, dezenas de vezes por polo.
    // A escolha é a mesma de antes, na mesma ordem.
    const caixaR = (s, w, h) => ({ left: s.x - w / 2, right: s.x + w / 2, top: s.y - h / 2, bottom: s.y + h / 2 });
    const cabe = R => !(R.left < livre.left || R.right > livre.right || R.top < livre.top || R.bottom > livre.bottom) && !ocupado.some(o => bate(R, o));
    const itens = [];
    ms.forEach(m => {
      const it = cand(m), cache = [];                           // pontos em cache e gerados só quando preciso
      const ponto = k => { while (cache.length <= k) { const r = it.next(); if (r.done) return null; cache.push(r.value); } return cache[k]; };
      if (!ponto(0)) return;
      const [dx, dy] = soma(desl[pol], mdesl[m.cod]);
      itens.push({ m, ponto, tela: q => aTela(q.x + dx, q.y + dy), nv: -1, s: null, fora: false });
    });
    const medir = document.createDocumentFragment();
    itens.forEach(x => {
      x.t = NIVEIS_ROT.map((f, nv) => {
        const t = document.createElement('span');
        t.className = 'mt-mn';
        t.dataset.nv = nv;
        t.innerHTML = f(x.m);
        t.style.cssText = 'left:0;top:0;visibility:hidden';
        medir.append(t);
        return t;
      });
    });
    nomes2.append(medir);
    itens.forEach(x => { x.tam = x.t.map(t => [t.offsetWidth, t.offsetHeight]); });
    const dentro = (x, nv) => {                                 // primeiro ponto do município onde o cartão nv cabe
      const [w, h] = x.tam[nv];
      for (let k = 0, q; (q = x.ponto(k)); k++) { const s = x.tela(q), R = caixaR(s, w, h); if (cabe(R)) { ocupado.push(R); x.nv = nv; x.s = s; return true; } }
      return false;
    };
    const sobra = [];
    itens.forEach(x => { for (let nv = celular ? 1 : 0; nv < 2; nv++) if (dentro(x, nv)) return; sobra.push(x); });
    const ANG = 16, RAIOS = celular ? [30, 42, 56, 72, 90] : [38, 52, 68, 86, 108, 132, 160];
    const linhas = [];
    const fora = (x, nv) => {                                   // põe o cartão ao lado do município, ligado por um fio
      const [w, h] = x.tam[nv], s0 = x.tela(x.ponto(0));
      for (const r of RAIOS) for (let i = 0; i < ANG; i++) {
        const a = i / ANG * 2 * Math.PI - Math.PI / 2, s = { x: s0.x + Math.cos(a) * r, y: s0.y + Math.sin(a) * r * .75 }, R = caixaR(s, w, h);
        if (!cabe(R)) continue;
        ocupado.push(R);
        x.nv = nv; x.s = s; x.fora = true;
        const x0 = s0.x - c0.left, y0 = s0.y - c0.top, x1 = s.x - c0.left, y1 = s.y - c0.top;
        linhas.push(`<line x1="${x0.toFixed(1)}" y1="${y0.toFixed(1)}" x2="${x1.toFixed(1)}" y2="${y1.toFixed(1)}"/><circle cx="${x0.toFixed(1)}" cy="${y0.toFixed(1)}" r="2.5"/>`);
        return true;
      }
      return false;
    };
    const resto = sobra.filter(x => !fora(x, 1));
    // último recurso: só o número, dentro; senão fora, com fio. Sem NAE (legenda recolhida) não há o rótulo só do número
    if (legAberta) resto.forEach(x => { if (!dentro(x, 2)) fora(x, 2); });
    // escritas: o svg dos fios na frente e, na ordem dos municípios, só o cartão escolhido de cada um, no lugar
    const fios = document.createElementNS(NS, 'svg');
    fios.setAttribute('class', 'mt-fios');
    fios.innerHTML = linhas.join('');
    nomes2.prepend(fios);
    itens.forEach(x => x.t.forEach((t, nv) => {
      if (nv !== x.nv) { t.remove(); return; }
      t.style.cssText = `left:${(x.s.x - c0.left).toFixed(1)}px;top:${(x.s.y - c0.top).toFixed(1)}px`;
      if (x.fora) t.classList.add('fora');
    }));
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
      e.innerHTML = `<b>${esc(p.polo)}</b><i></i>`;
      selos.append(e);
      return { e, ms: p.ms, cor: corDe[p.polo], chave: 'polo:' + p.polo, d: (M.pols || {})[p.polo] || '', desl: desl[p.polo], centro: soma(meio(p.ms).c, desl[p.polo]) };
    });
    const poeNum = () => cards.forEach(k => { k.e.lastChild.textContent = numeros(k.ms); }), outra = V !== VIS[0];   // número do polo na visão
    if (outra) comoNae(poeNum); else poeNum();                // o lugar é o do cartão da NAE (ver bandeiras)
    if (cards.length) fios.innerHTML = bandeiras(cards, M.muns.filter(m => m.reg === reg), outra && poeNum);
    selK = cards.length ? { cards, poeNum } : null;
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
  // caixa mudou de tamanho: reenquadra e repõe nomes e cartões. Compara com o tamanho em que o pouso já os pôs: no
  // celular a altura da caixa acompanha o próprio viewBox (muda a cada voo) e o aviso que chega logo depois do pouso
  // repetia todo o trabalho dos nomes e das bandeirinhas. Em voo não faz nada (o pouso confere).
  function chaveCaixa() { return caixa.clientWidth + 'x' + caixa.clientHeight; }
  let tamCaixa = '';
  if (window.ResizeObserver) new ResizeObserver(() => {
    if (anima) return;
    const k = chaveCaixa();
    if (k === tamCaixa) return;
    tamCaixa = k;
    if (reg) { svg.setAttribute('viewBox', enquadra().join(' ')); poeNomes(); poeSelos(); }
  }).observe(caixa);

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
    if (r) { abreAl(r.dataset.al); return; }          // 1 clique na rede abre o painel do alimentador (T1/T2/T3, camadas)
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

  // troca a visão (menu da legenda): cor dos municípios, legenda e os números do nível aberto (cartões das regionais, dos
  // polos e dos municípios, trilha, caixa dos alimentadores), sem voo nem recarga. A URL guarda a escolha (?v=, o resto
  // dela fica); a busca da barra (busca-ativo.js) ouve 'argos-visao'.
  function visao(id) {
    const nv = VIS.find(v => v.id === id);
    if (!nv || nv === V) return;
    V = nv;
    FAIXAS = V.faixas;
    M.muns.forEach(m => {
      const p = el[m.cod], k = 'nae-' + faixa(vMun(m));
      if (!p.classList.contains(k)) { p.classList.remove('nae-0', 'nae-1', 'nae-2', 'nae-3', 'nae-4', 'nae-5'); p.classList.add(k); }
    });
    poeLegenda();
    legenda(legAberta);
    poeRegCards();
    dica.style.display = 'none';
    // cartões já postos só trocam o número e ficam presos ao mesmo fio, sem procurar outro lugar (só se baterem em outro).
    // Com a legenda recolhida o número não aparece e o cartão fica onde está (como ao recolher); ao mostrar, volta ao fio
    if (!reg) { if (!(regK && fios.innerHTML)) poeCartoes(); }
    else if (!pol) { legendaRegional(); if (selK && selK.cards[0].e.isConnected) selK.poeNum(); else poeSelos(); }
    else if (!mun) { legendaPolo(); poeNomes(); }
    else legAl.querySelectorAll('.mt-al').forEach(b => { const a = porCod[mun].als.find(x => x.cod === b.dataset.al), i = b.querySelector('i'); if (a && i) i.textContent = txtV(vAl(porCod[mun], a)); });
    if (!pol) { if (legAberta) reancoraNivel(); else reancoraPend = true; }
    try {
      const u = new URL(location.href);
      if (V === VIS[0]) u.searchParams.delete('v'); else u.searchParams.set('v', V.id);
      history.replaceState(history.state, '', u.href);
    } catch (e) { /* sem history (cópia em sandbox): vale só nesta visita */ }
    document.dispatchEvent(new CustomEvent('argos-visao', { detail: { v: V.id } }));
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
  // rede do alimentador para a miniatura na lista da busca ({d, b} de miniD, a versão leve; pedida e desenhada depois do
  // pouso, uma por tarefa) e o destaque dela no mapa com o município aberto
  const redeDe = al => {
    const m = porCod[mun] || M.muns.find(x => x.als.some(a => a.cod === al));
    return m ? quieto().then(() => rede(al, m.polo)).then(r => r && miniD(al, r)) : Promise.resolve(null);
  };
  // visao(): null na NAE (a busca usa os números dela, como antes); nas outras, o valor por município e por alimentador
  // no município, e o texto do número; visao(id) troca
  const visaoApi = id => {
    if (id) { visao(id); return; }
    return V === VIS[0] ? null : { id: V.id, nome: V.nome, un: V.un, mais: V.mais, num: numV, txt: txtV,
      mun: cod => porCod[cod] ? vMun(porCod[cod]) : 0, al: (al, cod) => porCod[cod] ? vAl(porCod[cod], { cod: al }) : 0 };
  };
  window.ARGOS_MAPA = { nivel: () => ({ reg, pol, mun, al: alf }), vai, previa, rede: redeDe, realceAl: al => { if (mun) realceAl(al); }, visao: visaoApi };
})();
