// Mapa da página inicial: dois atalhos por cima de mapa-municipios.js (arquivo à parte para não mexer no mapa).
//  1. Zoom no mapa abre a tela cheia: Ctrl + roda (ou a pinça do touchpad, que o navegador manda como Ctrl + roda) e a
//     pinça de dois dedos no celular, em cima do mapa, viram um clique no botão de tela cheia do próprio mapa (.mt-tc).
//     Sem permissão para a tela cheia do navegador (pinça do touchpad, iPhone), o mapa cobre a janela, como o botão já faz.
//  2. Raio-X: Ctrl+X (⌘X no Mac) ou segurar o olho do ARGOS. Do olho sai uma onda que varre o mapa: atrás dela o
//     Tocantins fica escuro, como um filme de raio-X, e aparece a rede de todos os alimentadores (a mesma de
//     dados/redes/<AL>.json que o município aberto desenha), no lugar das cores e números da NAE. Passar o mouse numa
//     rede mostra o alimentador; clicar abre a página dele. Ctrl+X de novo, Esc ou o olho voltam (a onda volta ao olho).
//     Fora do estado inteiro, primeiro volta ao Tocantins (trilha "Tocantins") e depois varre.
//     Leve: a rede vem de um arquivo só, já reduzida para o estado inteiro (dados/redes/raiox.txt, de
//     scripts/gera_trechos.py; a versão vem no data-rede deste script), baixado só no 1º Ctrl+X. Um worker lê o arquivo,
//     monta a grade que o mouse usa e desenha a rede num canvas fora da tela (OffscreenCanvas), que vem pronto para um
//     canvas por cima do mapa: nada disso passa pela linha principal. A onda continua no svg (só o filme é recortado); a
//     rede aparece e some só pela opacidade do canvas (o compositor faz, sem pintar a rede de novo). Mudou a caixa do mapa
//     (tela cheia, janela): o canvas acompanha por transform e é refeito quando ela para. Cores e larguras da rede: as do
//     site.css (.rx-brilho, .rx-fio e o .on deles), lidas de lá. Sem worker com OffscreenCanvas, o mesmo trabalho roda
//     aqui, aos pedaços entre os quadros. Sem o raiox.txt (cópia reduzida do site), baixa os dados/redes/<AL>.json um a
//     um, como antes, e reduz do mesmo jeito.
(function () {
  const M = window.MUN, alvo = document.getElementById('mapa-to'), eu = document.currentScript;
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
  // alimentadores do mapa: polo (para o pacote da cópia reduzida), km somados nos municípios e a NAE do alimentador
  // (window.MUN repete a NAE do alimentador inteiro em cada município dele: somar multiplicava pelo nº de municípios)
  const als = new Map();
  M.muns.forEach(m => m.als.forEach(a => {
    const x = als.get(a.cod) || { polo: m.polo, m: 0, n: 0, se: a.se };
    x.m += a.m || 0; x.n = Math.max(x.n, a.n || 0);
    als.set(a.cod, x);
  }));
  const versao = eu && eu.dataset && eu.dataset.rede;
  const url = u => new URL(u, document.baseURI).href;
  const PEDIDO = {                                        // o que o núcleo precisa para ler a rede
    url: url('dados/redes/raiox.txt' + (versao ? `?v=${encodeURIComponent(versao)}` : '')),
    base: url('dados/redes/'), q: (M.w + 12) / 2600, als: [...als].map(([cod, a]) => [cod, a.polo || '']),
  };

  // ---- núcleo: lê a rede, monta a grade do mouse e desenha. Roda no worker (o texto desta função vai para ele) ou,
  // sem worker, aqui. Não usa nada de fora dela. ----
  function nucleo() {
    // a rede na memória: pontos na grade (passo q do mapa), linhas e, por alimentador, o intervalo das linhas e um Path2D
    const cresce = (a, n) => { if (n <= a.length) return a; const b = new a.constructor(Math.max(n, a.length * 2)); b.set(a); return b; };
    const R = { q: 0, xy: new Int32Array(1 << 16), n: 0, lin: new Int32Array(1 << 12), nl: 0, als: [] };
    const tem = new Set();
    let ok = null, atual = null, nova = false;
    const comeca = cod => { atual = { cod, l0: R.nl, l1: R.nl, n0: R.n, p: new Path2D() }; };
    const linha = () => { R.lin = cresce(R.lin, R.nl + 2); R.lin[R.nl++] = R.n; nova = true; };
    const ponto = (x, y) => {
      R.xy = cresce(R.xy, 2 * R.n + 2);
      R.xy[2 * R.n] = x; R.xy[2 * R.n + 1] = y; R.n++;
      if (nova) atual.p.moveTo(x, y); else atual.p.lineTo(x, y);
      nova = false;
    };
    const fecha = () => {
      const a = atual;
      atual = null;
      if (R.nl > a.l0 && R.lin[R.nl - 1] === R.n) R.nl--;   // linha aberta sem ponto
      if (!ok.has(a.cod) || tem.has(a.cod) || R.nl === a.l0) { R.n = a.n0; R.nl = a.l0; return; }   // fora do mapa: sai
      a.l1 = R.nl;
      R.lin = cresce(R.lin, R.nl + 1);
      R.lin[R.nl] = R.n;                                  // fim da última linha
      a.i = R.als.length;
      R.als.push(a);
      tem.add(a.cod);
    };
    // raiox.txt (ver scripts/gera_trechos.py): 1ª linha "raiox", versão 1 e q; depois, por alimentador, o código, uma
    // tabulação e as linhas (separadas por espaço) em polyline com os inteiros da grade, cada ponto a diferença do anterior
    function leitor(txt, cods) {
      const f0 = txt.indexOf('\n'), cab = txt.slice(0, f0).split('\t');
      if (cab[0] !== 'raiox' || cab[1] !== '1' || !(+cab[2] > 0)) return null;
      const n = txt.length;
      let k = f0 + 1, x = 0, y = 0;
      R.q = +cab[2];
      ok = cods;
      return {
        fim: false,
        passo() {                                         // um alimentador
          const tab = txt.indexOf('\t', k);
          if (k >= n || tab < 0) { this.fim = true; return; }
          comeca(txt.slice(k, tab));
          k = tab + 1;
          linha();
          while (k < n) {
            const c = txt.charCodeAt(k);
            if (c === 10) { k++; break; }
            if (c === 32) { k++; linha(); continue; }
            let r = 0, s = 0, b;
            do { b = txt.charCodeAt(k++) - 63; r |= (b & 31) << s; s += 5; } while (b >= 32);
            x += r & 1 ? ~(r >> 1) : r >> 1;
            r = 0; s = 0;
            do { b = txt.charCodeAt(k++) - 63; r |= (b & 31) << s; s += 5; } while (b >= 32);
            y += r & 1 ? ~(r >> 1) : r >> 1;
            ponto(x, y);
          }
          fecha();
          if (k >= n) this.fim = true;
        },
      };
    }
    // sem o raiox.txt: a rede inteira de um alimentador (dados/redes/<AL>.json, até 160 kB) reduzida como o gerador faz:
    // arredonda na grade q e tira os pontos e segmentos repetidos
    function poeD(cod, d) {
      const q = R.q, re = /([ML])(-?[\d.]+),(-?[\d.]+)/g, visto = new Set();
      let m, ux = null, uy = null, px = null, py = null, wx = null, wy = null;   // u: fim do último segmento; w: último escrito
      comeca(cod);
      while ((m = re.exec(d))) {
        const x = Math.round(+m[2] / q), y = Math.round(+m[3] / q);
        if (m[1] === 'M') { px = x; py = y; continue; }
        const ax = px !== null ? px : ux, ay = px !== null ? py : uy;
        px = py = null;
        ux = x; uy = y;
        if (ax === null || (ax === x && ay === y)) continue;
        const k = ax < x || (ax === x && ay < y) ? `${ax},${ay},${x},${y}` : `${x},${y},${ax},${ay}`;
        if (visto.has(k)) continue;
        visto.add(k);
        if (ax !== wx || ay !== wy) { linha(); ponto(ax, ay); }
        ponto(x, y);
        wx = x; wy = y;
      }
      fecha();
    }
    // um a um: dados/redes/<AL>.json ou o pacote do polo (cópia reduzida), 8 pedidos juntos; conta(n) a cada um
    const semAcento = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const baixa = u => fetch(u).then(r => r.ok ? r.json() : null).catch(() => null);
    function avulsos(P, conta) {
      const pacotes = {}, fila = P.als.slice();
      let n = 0;
      R.q = P.q;
      ok = new Set(P.als.map(a => a[0]));
      const rede = (al, polo) => baixa(P.base + encodeURIComponent(al) + '.json').then(r => r || (polo ?
        (pacotes[polo] = pacotes[polo] || baixa(P.base + 'polo-' + encodeURIComponent(semAcento(polo).replace(/[^a-z0-9]+/g, '-')) + '.json'))
          .then(pk => (pk && pk[al]) || null) : null));
      return new Promise(fim => {
        const um = () => {
          const a = fila.shift();
          if (!a) return;
          rede(a[0], a[1]).then(r => {
            if (r && r.d) poeD(a[0], r.d);
            conta(++n);
            if (n === P.als.length) fim(); else um();
          });
        };
        if (!fila.length) fim();
        for (let i = 0; i < 8; i++) um();
      });
    }
    // grade do mouse: os segmentos de cada célula de CEL passos (listas seguidas: ini[k]..ini[k+1] de seg e dono)
    const CEL = 16;
    function grade() {
      const xy = R.xy, lin = R.lin;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let i = 0; i < 2 * R.n; i += 2) {
        if (xy[i] < x0) x0 = xy[i]; if (xy[i] > x1) x1 = xy[i];
        if (xy[i + 1] < y0) y0 = xy[i + 1]; if (xy[i + 1] > y1) y1 = xy[i + 1];
      }
      if (!(x1 >= x0)) { x0 = y0 = x1 = y1 = 0; }
      const gw = Math.floor((x1 - x0) / CEL) + 1, gh = Math.floor((y1 - y0) / CEL) + 1, ini = new Int32Array(gw * gh + 1);
      let seg = null, dono = null, pos = null;
      for (let vez = 0; vez < 2; vez++) {                // 1ª: conta por célula; 2ª: preenche
        for (const a of R.als) for (let l = a.l0; l < a.l1; l++) for (let j = lin[l]; j < lin[l + 1] - 1; j++) {
          const ax = xy[2 * j], ay = xy[2 * j + 1], bx = xy[2 * j + 2], by = xy[2 * j + 3];
          const c0 = ((ax < bx ? ax : bx) - x0) / CEL | 0, c1 = ((ax < bx ? bx : ax) - x0) / CEL | 0;
          const r0 = ((ay < by ? ay : by) - y0) / CEL | 0, r1 = ((ay < by ? by : ay) - y0) / CEL | 0;
          for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
            const k = r * gw + c;
            if (vez) { seg[pos[k]] = j; dono[pos[k]++] = a.i; } else ini[k + 1]++;
          }
        }
        if (!vez) {
          for (let k = 0; k < gw * gh; k++) ini[k + 1] += ini[k];
          pos = ini.slice(0, gw * gh); seg = new Int32Array(ini[gw * gh]); dono = new Int32Array(ini[gw * gh]);
        }
      }
      return { cel: CEL, x0, y0, gw, gh, ini, seg, dono };
    }
    // desenha os alimentadores i0..i1 no contexto 2D (D: tamanho do canvas, caixa do mapa g e px por px da tela s)
    function traca(x, a, D, e1, e2) {
      const k = D.g.a * R.q * D.s;                        // passo da grade → px do canvas
      x.setTransform(k, 0, 0, D.g.d * R.q * D.s, D.g.e * D.s, D.g.f * D.s);
      for (const e of [e1, e2]) {
        x.globalAlpha = e.op;
        x.strokeStyle = e.cor;
        x.lineWidth = e.larg * D.s / k;                   // px da tela, como o vector-effect:non-scaling-stroke do svg
        x.stroke(a.p);
      }
    }
    function desenha(x, D, i0, i1) {
      x.lineCap = x.lineJoin = 'round';
      for (let i = i0; i < i1; i++) traca(x, R.als[i], D, D.est.brilho, D.est.fio);
    }
    return { R, leitor, poeD, avulsos, grade, desenha };
  }
  // o worker: carrega (a rede: arquivo único ou um a um) e desenha (sempre o pedido mais novo, quando a rede chegar)
  function trabalhador() {
    const N = nucleo();                                   // eslint-disable-line no-undef
    let pedido = null, pronta = false;
    const manda = () => {
      if (!pronta || !pedido) return;
      const D = pedido;
      pedido = null;
      try {
        const c = new OffscreenCanvas(D.w, D.h), x = c.getContext('2d');
        N.desenha(x, D, 0, N.R.als.length);
        const bmp = c.transferToImageBitmap();
        postMessage({ tipo: 'quadro', id: D.id, bmp }, [bmp]);
      } catch (e) { postMessage({ tipo: 'erro', msg: String(e) }); }
    };
    onmessage = async e => {
      const m = e.data;
      if (m.tipo === 'desenha') { pedido = m; manda(); return; }
      if (m.tipo !== 'carrega') return;
      try {
        let txt = null;
        try { const r = await fetch(m.P.url); if (r.ok) txt = await r.text(); } catch (_) { /* sem o arquivo: um a um */ }
        const l = txt && N.leitor(txt, new Set(m.P.als.map(a => a[0])));
        if (l) while (!l.fim) l.passo();
        else await N.avulsos(m.P, n => { if (n % 10 === 0) postMessage({ tipo: 'conta', n }); });
        const R = N.R, g = N.grade(), xy = R.xy.slice(0, 2 * R.n), lin = R.lin.slice(0, R.nl + 1);
        postMessage({ tipo: 'rede', q: R.q, n: R.n, xy, lin, als: R.als.map(a => [a.cod, a.l0, a.l1]), grade: g },
          [xy.buffer, lin.buffer, g.ini.buffer, g.seg.buffer, g.dono.buffer]);
        pronta = true;
        manda();
      } catch (e2) { postMessage({ tipo: 'erro', msg: String(e2) }); }
    };
  }

  // ---- aqui: a rede que o mouse usa (do worker ou do núcleo local) e o trabalho ----
  let T = null, N = null;                                 // o worker, ou o núcleo aqui (sem worker)
  let R = null, grade = null, carregou = 0, pedidos = false;
  const desenhadas = new Map();                           // cod → alimentador da rede
  const pronto = () => carregou >= als.size && !!R;
  function recebeRede(r) {
    R = r;
    R.als.forEach((a, i) => { a.i = i; desenhadas.set(a.cod, a); });
    carregou = als.size;
    conta();
  }
  function pedeRedes() {
    if (pedidos) return;
    pedidos = true;
    if (typeof Worker === 'function' && typeof OffscreenCanvas === 'function' && typeof Path2D === 'function' && window.Blob && window.URL) {
      try {
        const src = `const nucleo = ${nucleo};\n(${trabalhador})();`;
        let u = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
        T = new Worker(u);
        const solta = () => { if (u) { URL.revokeObjectURL(u); u = null; } };   // o endereço do texto, depois que o worker abriu
        T.onmessage = e => {
          const m = e.data;
          solta();
          if (m.tipo === 'conta') { carregou = Math.max(carregou, m.n); conta(); }
          else if (m.tipo === 'rede') {
            grade = m.grade;
            recebeRede({ q: m.q, n: m.n, xy: m.xy, lin: m.lin, als: m.als.map(([cod, l0, l1]) => ({ cod, l0, l1 })) });
          } else if (m.tipo === 'quadro') { if (m.id === vez && pedidoG) mostra(m.bmp, pedidoG); else m.bmp.close(); }
          else if (m.tipo === 'erro') semWorker();
        };
        T.onerror = e => { e.preventDefault(); solta(); semWorker(); };
        T.postMessage({ tipo: 'carrega', P: PEDIDO });
        return;
      } catch (_) { T = null; }
    }
    semWorker();
  }
  // sem worker (ou ele falhou): o mesmo núcleo aqui, aos pedaços de FATIA ms entre os quadros
  const FATIA = 6;
  let fonte = null, alvoC = null, agendado = false;
  const canal = typeof MessageChannel === 'function' ? new MessageChannel() : null;
  const agenda = () => {
    if (agendado) return;
    agendado = true;
    if (canal) canal.port2.postMessage(0); else setTimeout(trabalha, 0);
  };
  if (canal) canal.port1.onmessage = () => trabalha();
  function semWorker() {
    if (T) { try { T.terminate(); } catch (_) { /* já parou */ } T = null; }
    if (N) return;
    N = nucleo();
    if (R) Object.assign(N.R, { q: R.q, xy: R.xy, n: R.n, lin: R.lin, als: R.als });   // a rede já veio do worker: só desenhar
    else {
      carregou = 0;
      fetch(PEDIDO.url).then(r => (r.ok ? r.text() : null)).catch(() => null).then(txt => {
        const l = txt && N.leitor(txt, new Set(als.keys()));
        if (l) { fonte = l; agenda(); return; }
        fonte = { fim: false };
        N.avulsos(PEDIDO, n => { carregou = n; conta(); }).then(() => { fonte.fim = true; agenda(); });
      });
    }
    if (pedidoG) pedeDesenho(pedidoG, true);
  }
  function trabalha() {
    agendado = false;
    const t0 = performance.now();
    while (performance.now() - t0 < FATIA) {
      if (fonte && fonte.passo && !fonte.fim) { fonte.passo(); carregou = Math.min(als.size - 1, N.R.als.length); continue; }
      if (fonte && fonte.fim && !R) {
        grade = N.grade();
        recebeRede(N.R);
        break;
      }
      if (R && alvoC && alvoC.feitos < R.als.length) {
        const fim = Math.min(R.als.length, alvoC.feitos + 8);
        for (let i = alvoC.feitos; i < fim; i++) caminho(R.als[i]);
        N.desenha(alvoC.x, alvoC.D, alvoC.feitos, fim);
        alvoC.feitos = fim;
        continue;
      }
      break;
    }
    if (R && alvoC && alvoC.feitos >= R.als.length) { const c = alvoC; alvoC = null; if (c.D.id === vez) mostra(c.el, c.D.g); }
    conta();
    if ((fonte && fonte.passo && !fonte.fim) || (fonte && fonte.fim && !R) || (R && alvoC)) agenda();
  }

  // ---- a tela: canvas com a rede (vista) e, por cima, o do alimentador sob o mouse (luz) ----
  // cores e larguras: as do site.css (.rx-brilho/.rx-fio e, no alimentador sob o mouse, o .on deles)
  let EST = null;
  function estilos() {
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('class', 'rx-redes');
    g.style.display = 'none';
    g.innerHTML = '<g><path class="rx-brilho"/><path class="rx-fio"/></g><g class="on"><path class="rx-brilho"/><path class="rx-fio"/></g>';
    svg.append(g);
    const le = (el, cor, larg, op) => {
      const c = getComputedStyle(el), w = parseFloat(c.strokeWidth), o = parseFloat(c.strokeOpacity);
      return { cor: c.stroke && c.stroke !== 'none' ? c.stroke : cor, larg: w > 0 ? w : larg, op: o >= 0 ? o : op };
    };
    const p = g.querySelectorAll('path');
    EST = { brilho: le(p[0], '#3ee6ff', 5, 0.07), fio: le(p[1], '#bdf5ff', 0.8, 0.62), brilhoOn: le(p[2], '#3ee6ff', 10, 0.4), fioOn: le(p[3], '#fff', 2.4, 1) };
    g.remove();
  }
  const MARGEM = 8, MAXPX = 12e6, MAXLADO = 4096;
  let tela = null, vista = null, luz = null, sobre = null, vez = 0, pedidoG = null, refaz = 0;
  // onde o mapa está agora: a caixa do svg (mais a margem) dentro da .mt-mapa e a conta unidade do mapa → px da tela
  function geom() {
    const ctm = svg.getScreenCTM(), r = svg.getBoundingClientRect(), c = caixa.getBoundingClientRect();
    if (!ctm || !r.width || !r.height) return null;
    return { x: r.left - c.left - MARGEM, y: r.top - c.top - MARGEM, w: r.width + 2 * MARGEM, h: r.height + 2 * MARGEM,
      a: ctm.a, d: ctm.d, e: ctm.e - r.left + MARGEM, f: ctm.f - r.top + MARGEM };
  }
  const escala = g => Math.max(0.25, Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(MAXPX / (g.w * g.h)), MAXLADO / g.w, MAXLADO / g.h));
  const mesma = (g, h) => !!h && Math.abs(g.w - h.w) < 0.5 && Math.abs(g.h - h.h) < 0.5 && Math.abs(g.a - h.a) < 1e-6 * Math.abs(g.a) &&
    Math.abs(g.e - h.e) < 0.05 && Math.abs(g.f - h.f) < 0.05;
  // pede o desenho da rede na caixa g: ao worker ou, sem ele, aqui num canvas fora da tela; chega em mostra()
  function pedeDesenho(g, deNovo) {
    if (!deNovo && mesma(g, pedidoG)) return;
    pedidoG = g;
    const s = escala(g), D = { tipo: 'desenha', id: ++vez, w: Math.round(g.w * s), h: Math.round(g.h * s), s, g, est: EST };
    if (T) { T.postMessage(D); return; }
    if (!N) return;
    const el = document.createElement('canvas');
    el.width = D.w; el.height = D.h;
    alvoC = { el, x: el.getContext('2d'), D, feitos: 0 };
    agenda();
  }
  function mostra(src, g) {
    const s = escala(g), primeira = !vista;
    let el = vista && vista.el;
    if (src instanceof HTMLCanvasElement) {
      if (el) el.replaceWith(src); else tela.insertBefore(src, tela.firstChild);
      el = src;
    } else {
      if (!el || !el.__bmp) {
        const n = document.createElement('canvas');
        n.__bmp = n.getContext('bitmaprenderer');
        if (el) el.replaceWith(n); else tela.insertBefore(n, tela.firstChild);
        el = n;
      }
      el.width = src.width; el.height = src.height;
      el.__bmp.transferFromImageBitmap(src);
    }
    el.style.width = g.w + 'px'; el.style.height = g.h + 'px';
    el.style.transform = '';
    // rede chegando com a tela já acesa (onda terminou antes): entra devagar, como cada alimentador entrava no svg
    if (primeira && tela.style.opacity === '1' && el.animate && !calmo()) el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 600, easing: 'ease-out' });
    vista = { el, g, s };
    pintaLuz();
    conta();
    ajusta();                                             // a caixa pode ter mudado enquanto desenhava
  }
  // o canvas desenhado com outra caixa (tela cheia, janela mudou, viewBox mudou) acompanha por transform até ser refeito
  function encaixa(c, g) {
    if (!c) return;
    const sx = g.a / c.g.a, sy = g.d / c.g.d, tx = g.e - sx * c.g.e, ty = g.f - sy * c.g.f;
    c.el.style.transform = Math.abs(sx - 1) < 1e-6 && Math.abs(sy - 1) < 1e-6 && Math.abs(tx) < 0.01 && Math.abs(ty) < 0.01 ? ''
      : `translate(${tx}px,${ty}px) scale(${sx},${sy})`;
  }
  // a tela no lugar do mapa de agora; parado (sem voo nem mudança por 180 ms), pede o desenho de novo se a caixa mudou
  function ajusta() {
    if (!tela || !ligado) return;
    const g = geom();
    if (!g) return;
    Object.assign(tela.style, { left: g.x + 'px', top: g.y + 'px', width: g.w + 'px', height: g.h + 'px' });
    if (!vista) { pedeDesenho(g); return; }
    encaixa(vista, g);
    encaixa(luz, g);
    clearTimeout(refaz);
    if (mesma(g, pedidoG)) return;
    refaz = setTimeout(() => {
      const g2 = geom();
      if (!g2 || !ligado) return;
      if (alvo.classList.contains('voando')) { ajusta(); return; }
      pedeDesenho(g2);
    }, 180);
  }
  // Path2D de um alimentador a partir dos pontos (a rede que veio do worker não traz os Path2D dele)
  function caminho(a) {
    if (a.p) return a.p;
    const p = new Path2D(), xy = R.xy, lin = R.lin;
    for (let l = a.l0; l < a.l1; l++) {
      p.moveTo(xy[2 * lin[l]], xy[2 * lin[l] + 1]);
      for (let j = lin[l] + 1; j < lin[l + 1]; j++) p.lineTo(xy[2 * j], xy[2 * j + 1]);
    }
    return (a.p = p);
  }
  function pintaLuz() {
    if (!vista) return;
    if (!luz || luz.el.width !== vista.el.width || luz.el.height !== vista.el.height) {
      if (luz) luz.el.remove();
      const el = document.createElement('canvas');
      el.width = vista.el.width; el.height = vista.el.height;
      tela.append(el);
      luz = { el, x: el.getContext('2d') };
    } else {
      luz.x.setTransform(1, 0, 0, 1, 0, 0);
      luz.x.clearRect(0, 0, luz.el.width, luz.el.height);
    }
    Object.assign(luz, { g: vista.g, s: vista.el.width / vista.g.w });
    luz.el.style.width = vista.el.style.width; luz.el.style.height = vista.el.style.height;
    luz.el.style.transform = vista.el.style.transform;
    if (!sobre || !R) return;
    const x = luz.x, k = luz.g.a * R.q * luz.s;
    x.lineCap = x.lineJoin = 'round';
    x.setTransform(k, 0, 0, luz.g.d * R.q * luz.s, luz.g.e * luz.s, luz.g.f * luz.s);
    for (const e of [EST.brilhoOn, EST.fioOn]) {
      x.globalAlpha = e.op; x.strokeStyle = e.cor; x.lineWidth = e.larg * luz.s / k;
      x.stroke(caminho(sobre));
    }
  }
  // alimentador sob o ponto da tela (clientX/Y): o mais perto até meia largura do brilho (o traço que o mouse pegava no
  // svg); o que já está sob o mouse fica enquanto o ponto estiver no traço dele (como o realçado ia para cima no svg)
  function acha(cx, cy) {
    const ctm = svg.getScreenCTM();
    if (!grade || !R || !ctm) return null;
    const p = new DOMPoint(cx, cy).matrixTransform(ctm.inverse()), q = R.q, G = grade, C = G.cel, xy = R.xy;
    const gx = p.x / q, gy = p.y / q, raio = EST.brilho.larg / 2 / (Math.abs(ctm.a) * q), r2 = raio * raio;
    const c0 = Math.max(0, Math.floor((gx - raio - G.x0) / C)), c1 = Math.min(G.gw - 1, Math.floor((gx + raio - G.x0) / C));
    const l0 = Math.max(0, Math.floor((gy - raio - G.y0) / C)), l1 = Math.min(G.gh - 1, Math.floor((gy + raio - G.y0) / C));
    let melhor = -1, dm = Infinity, fica = false;
    for (let r = l0; r <= l1; r++) for (let c = c0; c <= c1; c++) {
      const k = r * G.gw + c;
      for (let t = G.ini[k]; t < G.ini[k + 1]; t++) {
        const j = G.seg[t], ax = xy[2 * j], ay = xy[2 * j + 1], dx = xy[2 * j + 2] - ax, dy = xy[2 * j + 3] - ay;
        const l2 = dx * dx + dy * dy, f = l2 ? Math.max(0, Math.min(1, ((gx - ax) * dx + (gy - ay) * dy) / l2)) : 0;
        const ex = gx - ax - f * dx, ey = gy - ay - f * dy, d = ex * ex + ey * ey;
        if (d > r2) continue;
        if (sobre && G.dono[t] === sobre.i) fica = true;
        if (d < dm) { dm = d; melhor = G.dono[t]; }
      }
    }
    return fica ? sobre : melhor >= 0 ? R.als[melhor] : null;
  }

  // camada: filme escuro na forma do Tocantins (no svg, recortado pela onda) e a tela com a rede por cima do svg
  let camada = null, onda = null, anel = null, filme = null;
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
    camada.append(filme);
    anel = document.createElementNS(NS, 'circle');
    anel.setAttribute('class', 'rx-anel');
    anel.setAttribute('r', '0');
    svg.append(camada, anel);
    const css = document.createElement('style');
    // a tela acende e apaga como o grupo da rede no svg acendia (.rx-redes do site.css: .45 s)
    css.textContent = '#mapa-to .mt-mapa>.rx-tela{position:absolute;pointer-events:none;opacity:0;transition:opacity .45s ease-out}' +
      '#mapa-to .rx-tela canvas{position:absolute;left:0;top:0;transform-origin:0 0;pointer-events:none}';
    document.head.append(css);
    tela = document.createElement('div');
    tela.className = 'rx-tela';
    tela.setAttribute('aria-hidden', 'true');
    svg.after(tela);
    estilos();
    const muda = () => { if (ligado) ajusta(); };
    if (window.ResizeObserver) { const ro = new ResizeObserver(muda); ro.observe(svg); ro.observe(caixa); }
    window.addEventListener('resize', muda);
    new MutationObserver(muda).observe(svg, { attributes: true, attributeFilter: ['viewBox'] });
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
  const kmTot = [...als.values()].reduce((s, a) => s + a.m, 0);
  let avisoAntes = '';
  function conta() {
    if (!ligado) return;
    const tot = als.size;
    const t = !pronto() || !vista                       // pronto: a rede toda na tela
      ? `<b>Raio-X</b> carregando a rede · ${Math.min(carregou, tot)} de ${tot} alimentadores`
      : `<b>Raio-X</b> ${desenhadas.size} alimentadores · ${km(kmTot)} km de rede<span class="rx-tecla">Ctrl+X ou Esc volta</span>`;
    if (t !== avisoAntes) aviso.innerHTML = avisoAntes = t;
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
  // durante a onda só o filme é recortado: a rede fica apagada e aparece quando a onda termina; ao desligar, a rede apaga
  // antes de a onda voltar. Acender e apagar a rede é só a opacidade do canvas
  function varre(abre) {
    cancelAnimationFrame(quadro);
    clearTimeout(varre.t);
    tela.style.opacity = '0';
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
      if (abre) { camada.removeAttribute('clip-path'); tela.style.opacity = '1'; }   // parado: sem recorte, rede acende
      else { alvo.classList.remove('raiox'); camada.style.display = 'none'; tela.style.display = 'none'; }
    };
    quadro = requestAnimationFrame(passo);
  }
  function liga() {
    if (ligado) return;
    ligado = true;
    monta();
    camada.style.display = '';
    tela.style.display = '';
    alvo.classList.add('raiox', 'raiox-vai');
    setTimeout(() => alvo.classList.remove('raiox-vai'), 1400);
    olho && olho.classList.add('rx-olho');
    aviso.hidden = false;
    pedeRedes();
    ajusta();
    conta();
    varre(true);
  }
  function desliga() {
    if (!ligado) return;
    ligado = false;
    clearTimeout(refaz);
    olho && olho.classList.remove('rx-olho');
    aviso.hidden = true;
    balao.hidden = true;
    poeSobre(null);
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
      seg = setTimeout(() => {
        segurou = true; alterna();
        // vibrar só depois de algum toque na página (antes disso o navegador bloqueia e reclama no console)
        if (navigator.vibrate && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) try { navigator.vibrate(15); } catch (_) {}
      }, 550);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => olho.addEventListener(ev, solta));
    olho.addEventListener('click', e => { if (segurou) { e.preventDefault(); e.stopImmediatePropagation(); segurou = false; } }, true);
    olho.addEventListener('contextmenu', e => { if (segurou || seg) e.preventDefault(); });
    if (!olho.title) olho.title = 'Buscar · Ctrl+X: raio-X da rede';
  }

  // rede sob o mouse: realce e balão com o alimentador; clique abre a página dele
  function poeSobre(a) {
    if (a === sobre) return;
    sobre = a;
    svg.style.cursor = a ? 'pointer' : '';               // a mãozinha que o traço da rede dava no svg
    pintaLuz();
    if (window.ARGOS_PAG && window.ARGOS_PAG.prepara) window.ARGOS_PAG.prepara(a && a.cod);   // mouse parado: a página dele começa a vir
  }
  svg.addEventListener('pointermove', e => {
    if (!ligado) return;
    const a = acha(e.clientX, e.clientY);
    poeSobre(a);
    if (!a) { balao.hidden = true; return; }
    const x = als.get(a.cod) || {}, r = caixa.getBoundingClientRect();
    balao.innerHTML = `<b>${a.cod}</b>${x.se ? `<span>${x.se}</span>` : ''}<span>${km(x.m)} km · ${(x.n || 0).toLocaleString('pt-BR')} NAE no alimentador</span>`;
    balao.style.left = (e.clientX - r.left + 14) + 'px';
    balao.style.top = (e.clientY - r.top + 14) + 'px';
    balao.hidden = false;
  });
  svg.addEventListener('pointerleave', () => { balao.hidden = true; poeSobre(null); });
  svg.addEventListener('click', e => {
    if (!ligado) return;
    const a = acha(e.clientX, e.clientY);
    e.stopImmediatePropagation();                         // no raio-X o clique não abre regional nem município
    if (a && window.ARGOS_PAG) window.ARGOS_PAG.abre(`alimentadores/${encodeURIComponent(a.cod)}/`);
  }, true);
})();
