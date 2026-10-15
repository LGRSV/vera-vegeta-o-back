// RASCUNHO: modo "Limpeza de faixa" do painel do alimentador. Passo a passo (pedido do usuário):
//   1) o mapa fica na visualização normal dos trechos (T1 T2 T3 nas cores de sempre): as camadas ligadas (Faixa,
//      Inspeção…) são desligadas enquanto o modo está ligado e voltam ao sair;
//   2) Ctrl+M liga o modo: clicar nos trechos escolhe (contorno branco); clicar de novo tira;
//   3) com trecho escolhido aparece um painel mínimo: Leve / Pesada (ligar um e arrastar sobre a rede, como um marcador,
//      pinta só os vãos dos trechos escolhidos; o km de cada um aparece no botão) e, embaixo, "Baixar croqui" (o croqui
//      de limpeza de faixa do painel, croqui.js, já com os trechos escolhidos e os km marcados).
// Marca em pedaços de PASSO m (não o vão inteiro): o pincel pinta só o que passa por baixo dele; Leve não cobre Pesada
// nem o contrário (para trocar: Apagar, ou segurar Shift enquanto pinta). O Ctrl+Z desfaz a última alteração (o último
// traço, ou o último trecho escolhido/tirado); Ctrl+Shift+Z ou Ctrl+Y refaz.
// Atalhos: Ctrl+M liga/desliga · L leve · P pesada · B apagar · Espaço (segurar) move o mapa · Ctrl+Z desfaz ·
// Esc solta a ferramenta (de novo: sai). Celular: abre em tela cheia; 1 dedo pinta, 2 dedos andam/dão zoom.
// Roda depois de alimentador.js (window.__map, window.D). Os km são a soma dos vãos (D.vaos[i][8], metros).
(function () {
  const map = window.__map, D = window.D, L = window.L, box = document.querySelector('.mapbox');
  if (!map || !L || !D || !Array.isArray(D.vaos) || !box) return;
  const mc = map.getContainer(), V = D.vaos, T = D.trechos;
  const km = m => (m / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  // cores que não se confundem com as dos trechos (T1 azul, T2 verde, T3 amarelo)
  const COR = { 1: '#22d3ee', 2: '#f43f5e' }, ALVO = { leve: 1, pesada: 2, apagar: 0 };

  // ---------- dados ----------
  const vaosDe = T.map(() => []); V.forEach((v, i) => vaosDe[v[4]].push(i));
  const extDe = vaosDe.map(l => l.reduce((s, i) => s + V[i][8], 0));
  let ativo = false, ferr = null, temp = false, entrouTC = false, camadasDesligadas = [];
  // pedaços: o vão i tem np[i] pedaços iguais (de até PASSO m), guardados a partir de off[i] em marca (0 sem, 1 leve, 2 pesada)
  const PASSO = 5;
  const np = new Int32Array(V.length), off = new Int32Array(V.length + 1);
  V.forEach((v, i) => { np[i] = Math.max(1, Math.ceil(v[8] / PASSO)); off[i + 1] = off[i] + np[i]; });
  const sel = new Set(), marca = new Uint8Array(off[V.length]), undo = [], redo = [];
  let selV = [];
  const pintando = () => ferr !== null && !temp;                  // com Leve/Pesada/Apagar ligado, arrastar pinta
  const toque = e => (e && e.pointerType) ? e.pointerType !== 'mouse' : matchMedia('(pointer:coarse)').matches;

  // ---------- projeção: pixels absolutos no zoom atual (não mudam ao arrastar o mapa) ----------
  const mx = (lon, s) => (lon + 180) / 360 * s;
  const my = (lat, s) => (0.5 - Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) / (2 * Math.PI)) * s;
  let todosP = null, selP = null;
  const projeta = lista => {
    const s = 256 * Math.pow(2, map.getZoom()), a = new Float64Array(lista.length * 4);
    for (let k = 0; k < lista.length; k++) { const v = V[lista[k]]; a[k * 4] = mx(v[1], s); a[k * 4 + 1] = my(v[0], s); a[k * 4 + 2] = mx(v[3], s); a[k * 4 + 3] = my(v[2], s); }
    return a;
  };
  const TODOS = V.map((_, i) => i);
  const abs = e => { const lp = map.containerPointToLayerPoint(map.mouseEventToContainerPoint(e)), o = map.getPixelOrigin(); return [lp.x + o.x, lp.y + o.y]; };
  const d2 = (px, py, a, k) => {
    const x1 = a[k * 4], y1 = a[k * 4 + 1], dx = a[k * 4 + 2] - x1, dy = a[k * 4 + 3] - y1, l = dx * dx + dy * dy;
    let t = l ? ((px - x1) * dx + (py - y1) * dy) / l : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const cx = x1 + t * dx - px, cy = y1 + t * dy - py; return cx * cx + cy * cy;
  };
  const fora = (a, k, px, py, R) => {
    const x1 = a[k * 4], x2 = a[k * 4 + 2]; if ((x1 < px - R && x2 < px - R) || (x1 > px + R && x2 > px + R)) return true;
    const y1 = a[k * 4 + 1], y2 = a[k * 4 + 3]; return (y1 < py - R && y2 < py - R) || (y1 > py + R && y2 > py + R);
  };
  const vaoPerto = (px, py, tol) => {
    const a = todosP || (todosP = projeta(TODOS)); let m = tol * tol, r = -1;
    for (let k = 0; k < V.length; k++) { if (fora(a, k, px, py, tol)) continue; const d = d2(px, py, a, k); if (d <= m) { m = d; r = k; } }
    return r;
  };
  map.on('zoomend', () => { todosP = null; selP = null; });

  // ---------- desenho: por cima da rede, num canvas próprio ----------
  map.createPane('faixa').style.zIndex = 450;
  map.getPane('faixa').style.pointerEvents = 'none';
  const rend = L.canvas({ pane: 'faixa' });
  const base = { renderer: rend, pane: 'faixa', interactive: false, lineCap: 'round', lineJoin: 'round' };
  const lHover = L.polyline([], Object.assign({}, base, { color: '#fde047', weight: 14, opacity: .6 }));
  const lCas = L.polyline([], Object.assign({}, base, { color: '#ffffff', weight: 11, opacity: .95 }));
  const lSem = L.layerGroup();                                    // vãos sem marca: na cor do próprio trecho
  const lLeve = L.polyline([], Object.assign({}, base, { color: COR[1], weight: 6.5, opacity: 1 }));
  const lPes = L.polyline([], Object.assign({}, base, { color: COR[2], weight: 6.5, opacity: 1 }));
  const camadas = [lHover, lCas, lSem, lLeve, lPes];
  let quadro = 0;
  const agenda = () => { if (!quadro) quadro = requestAnimationFrame(() => { quadro = 0; desenha(); ui(); }); };
  function desenha() {
    const todos = [], le = [], pe = [], porCor = new Map();
    const sem = c => { if (!porCor.has(c)) porCor.set(c, []); return porCor.get(c); };
    for (const i of selV) {
      const v = V[i], n = np[i], o = off[i], ponto = t => [v[0] + (v[2] - v[0]) * t, v[1] + (v[3] - v[1]) * t];
      todos.push([[v[0], v[1]], [v[2], v[3]]]);
      for (let j = 0; j < n;) {                                   // corridas de pedaços com a mesma marca
        const m = marca[o + j]; let k = j + 1; while (k < n && marca[o + k] === m) k++;
        const seg = [ponto(j / n), ponto(k / n)];
        (m === 1 ? le : m === 2 ? pe : sem(T[v[4]].cor)).push(seg);
        j = k;
      }
    }
    lCas.setLatLngs(todos); lLeve.setLatLngs(le); lPes.setLatLngs(pe);
    lSem.clearLayers(); porCor.forEach((ss, c) => lSem.addLayer(L.polyline(ss, Object.assign({}, base, { color: c, weight: 5.5, opacity: 1 }))));
  }

  // ---------- escolha dos trechos ----------
  function muda() {
    selV = []; [...sel].sort((a, b) => a - b).forEach(t => vaosDe[t].forEach(i => selV.push(i))); selP = null;
    if (!sel.size) ferr = null;
    aplicaFerr(); agenda();
  }

  // ---------- pintura ----------
  let pincel = 8, stroke = null;
  // pedaços do vão (k na lista dos escolhidos) dentro do círculo do pincel: o trecho da reta do vão que cai no círculo
  function pinta(px, py, alvo, cobre) {
    const a = selP || (selP = projeta(selV)), R = pincel; let tocou = 0;
    for (let k = 0; k < selV.length; k++) {
      if (fora(a, k, px, py, R)) continue;
      const x1 = a[k * 4], y1 = a[k * 4 + 1], dx = a[k * 4 + 2] - x1, dy = a[k * 4 + 3] - y1, l2 = dx * dx + dy * dy, l = Math.sqrt(l2);
      let t0, t1;
      if (l < 1e-9) { if ((px - x1) ** 2 + (py - y1) ** 2 > R * R) continue; t0 = 0; t1 = 1; }
      else {
        const t = ((px - x1) * dx + (py - y1) * dy) / l2, hx = x1 + t * dx - px, hy = y1 + t * dy - py, h2 = hx * hx + hy * hy;
        if (h2 > R * R) continue;
        const c = Math.sqrt(R * R - h2) / l; t0 = Math.max(0, t - c); t1 = Math.min(1, t + c);
        if (t0 >= t1) continue;
      }
      tocou++;
      const i = selV[k], n = np[i], o = off[i], j0 = Math.floor(t0 * n), j1 = Math.min(n - 1, Math.ceil(t1 * n) - 1), ml = V[i][8] / n;
      for (let j = j0; j <= j1; j++) {
        const q = o + j, m = marca[q];
        if (m === alvo || (alvo && m && !cobre)) continue;            // Leve não cobre Pesada (nem o contrário) sem o Shift
        if (!stroke.rec.has(q)) stroke.rec.set(q, m);
        marca[q] = alvo;
      }
    }
    return tocou;
  }
  // desfazer: cada alteração é um item — um traço inteiro ({m: pedaço → marca de antes}) ou um trecho escolhido/tirado ({t})
  const guarda = a => { undo.push(a); if (undo.length > 500) undo.shift(); redo.length = 0; };
  function troca(de, para) {
    const a = de.pop(); if (!a) return false;
    if (a.m) { const volta = new Map(); a.m.forEach((antes, q) => { volta.set(q, marca[q]); marca[q] = antes; }); para.push({ m: volta }); agenda(); }
    else { sel.has(a.t) ? sel.delete(a.t) : sel.add(a.t); para.push(a); muda(); }   // escolher/tirar desfaz a si mesmo
    return true;
  }
  const desfaz = () => troca(undo, redo), refaz = () => troca(redo, undo);
  function totais() {
    let le = 0, pe = 0, s = 0;
    for (const i of selV) {
      const n = np[i], o = off[i], ml = V[i][8] / n;
      for (let j = 0; j < n; j++) { const m = marca[o + j]; if (m === 1) le += ml; else if (m === 2) pe += ml; else s += ml; }
    }
    return { leve: le, pesada: pe, falta: s };
  }

  // ---------- interface: aviso no alto (escolher trechos) e o painel mínimo (depois de escolher) ----------
  const css = document.createElement('style');
  css.textContent = `
.fx-pill{position:absolute;top:12px;left:50%;transform:translateX(-50%);z-index:1002;display:none;align-items:center;gap:10px;max-width:calc(100% - 140px);padding:6px 6px 6px 14px;border-radius:999px;background:var(--paper);color:var(--fg);border:1px solid var(--line);box-shadow:var(--sh2);font:600 13px var(--f-body);white-space:nowrap}
.fx-pill span{overflow:hidden;text-overflow:ellipsis}
.fx-pill button,.fx-dash button{font:inherit;color:inherit;cursor:pointer}
.fx-modo:not(.fx-tem) .fx-pill{display:flex}
.fx-dash{position:absolute;left:12px;bottom:28px;z-index:1002;width:min(320px,calc(100% - 24px));display:none;gap:8px;padding:10px;border-radius:16px;background:var(--paper);color:var(--fg);border:1px solid var(--line);box-shadow:var(--sh2);font:500 13px/1.3 var(--f-body)}
.fx-modo.fx-tem .fx-dash{display:grid}
.fx-modo .ctl-lgs,.fx-modo .tc-canto,.fx-modo .limp-chip{display:none!important}
.fx-cab{display:flex;align-items:center;gap:4px;min-width:0}
.fx-cab .fx-info{flex:1;min-width:0;padding-left:2px;font-size:12px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.fx-cab .fx-info b{color:var(--fg);font-weight:700}
.fx-ic{flex:none;display:grid;place-items:center;width:32px;height:32px;padding:0;border:0;border-radius:8px;background:none}
.fx-ic:hover{background:var(--hover)}.fx-ic:disabled{opacity:.35;cursor:default}.fx-ic[aria-pressed=true]{background:var(--hover);color:var(--accent);box-shadow:inset 0 0 0 1.5px var(--accent)}
.fx-ic svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.fx-x{font-size:17px}
.fx-tools{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.fx-t{display:grid;grid-template-columns:auto 1fr;align-items:center;column-gap:8px;padding:9px 10px;border:1.5px solid var(--line);border-radius:12px;background:none;text-align:left}
.fx-t:hover{background:var(--hover)}
.fx-t i{grid-row:1/3;width:14px;height:14px;border-radius:50%;background:var(--c)}
.fx-t span{font-weight:700;font-size:13px}.fx-t b{font:700 16px var(--f-mono);font-variant-numeric:tabular-nums}.fx-t b small{font:500 11px var(--f-body);color:var(--muted)}
.fx-t[aria-pressed=true]{border-color:var(--c);background:color-mix(in srgb,var(--c) 14%,transparent)}
.fx-barra{display:flex;height:6px;border-radius:3px;overflow:hidden;background:var(--hover)}.fx-barra span{display:block;height:100%}
.fx-dica-p{margin:0;font-size:11.5px;color:var(--muted);min-height:1.3em}
.fx-croqui{display:flex;align-items:center;justify-content:center;gap:8px;min-height:42px;border:0;border-radius:12px;background:var(--accent);color:var(--on-accent)!important;font-weight:700!important}
.fx-croqui:disabled{opacity:.6;cursor:default}
.fx-croqui svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}
.fx-capa{position:absolute;inset:0;z-index:640;touch-action:none;display:none;cursor:none}
.fx-pinta .fx-capa{display:block}
.fx-pincel{position:absolute;left:0;top:0;border:2px solid #fff;border-radius:50%;pointer-events:none;box-shadow:0 0 0 1.5px #000,inset 0 0 0 1.5px #0007;display:none}
.fx-dica{position:absolute;z-index:1001;pointer-events:none;display:none;padding:4px 8px;border-radius:6px;background:#000d;color:#fff;font:600 12px var(--f-body);white-space:nowrap}
.fx-entrada{position:absolute;top:64px;left:12px;z-index:900;display:none;place-items:center;width:48px;height:44px;border:1px solid var(--vidro-borda);border-radius:999px;background:var(--vidro);color:var(--vidro-fg);box-shadow:var(--sh-vidro)}
.fx-entrada svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
@media (pointer:coarse){.fx-entrada{display:grid}}.fx-modo .fx-entrada{display:none!important}
.fx-croqui-km{margin:0 0 8px;padding:8px 10px;border-radius:8px;background:var(--hover);font-size:13px}.fx-croqui-km b{font-family:var(--f-mono)}
`;
  document.head.append(css);

  const SVG = {
    desfaz: '<svg viewBox="0 0 24 24"><path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 010 12h-3"/></svg>',
    apagar: '<svg viewBox="0 0 24 24"><path d="M4 16l9-10 7 6-6 7H8zM10 19h10"/></svg>',
    baixa: '<svg viewBox="0 0 24 24"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>'
  };
  const pill = document.createElement('div');
  pill.className = 'fx-pill'; pill.setAttribute('role', 'status');
  pill.innerHTML = `<span>${matchMedia('(pointer:coarse)').matches ? 'Toque' : 'Clique'} nos trechos da limpeza de faixa</span><button type="button" class="fx-ic fx-x" title="Sair (Esc)" aria-label="Sair do modo limpeza de faixa">✕</button>`;
  const dash = document.createElement('div');
  dash.className = 'fx-dash'; dash.setAttribute('role', 'region'); dash.setAttribute('aria-label', 'Limpeza de faixa');
  dash.innerHTML = `<div class="fx-cab"><span class="fx-info" id="fx-info"></span>
  <button type="button" class="fx-ic" id="fx-apagar" aria-pressed="false" title="Apagar marca (B)" aria-label="Apagar marca">${SVG.apagar}</button>
  <button type="button" class="fx-ic" id="fx-desfaz" title="Desfazer (Ctrl+Z)" aria-label="Desfazer">${SVG.desfaz}</button>
  <button type="button" class="fx-ic fx-x" title="Sair (Esc)" aria-label="Sair do modo limpeza de faixa">✕</button></div>
<div class="fx-tools">
  <button type="button" class="fx-t" data-f="leve" aria-pressed="false" style="--c:${COR[1]}" title="Leve (L): ligue e arraste sobre o trecho"><i></i><span>Leve</span><b id="fx-L">0,00 <small>km</small></b></button>
  <button type="button" class="fx-t" data-f="pesada" aria-pressed="false" style="--c:${COR[2]}" title="Pesada (P): ligue e arraste sobre o trecho"><i></i><span>Pesada</span><b id="fx-P">0,00 <small>km</small></b></button>
</div>
<div class="fx-barra" id="fx-barra" aria-hidden="true"></div>
<p class="fx-dica-p" id="fx-dica-p"></p>
<button type="button" class="fx-croqui" id="fx-croqui">${SVG.baixa}Baixar croqui</button>`;
  // sem teclado (celular) não há Ctrl+M: um botão pequeno, embaixo do olho, só em tela de toque
  const entrada = document.createElement('button');
  entrada.type = 'button'; entrada.className = 'fx-entrada';
  entrada.title = 'Limpeza de faixa'; entrada.setAttribute('aria-label', 'Limpeza de faixa: escolher trechos e marcar leve e pesada');
  entrada.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20l3-1 11-11-2-2L5 17zM14 6l2 2"/></svg>';
  box.append(pill, dash, entrada);
  const $ = id => dash.querySelector('#' + id);
  const capa = L.DomUtil.create('div', 'fx-capa', mc);
  const bPincel = L.DomUtil.create('div', 'fx-pincel', capa);
  const bDica = L.DomUtil.create('div', 'fx-dica', box);

  let tAviso = 0;
  function ui() {
    const t = totais(), tot = t.leve + t.pesada + t.falta, n = sel.size;
    box.classList.toggle('fx-tem', ativo && n > 0);
    if (!n) return;
    $('fx-info').innerHTML = `<b>${n} trecho${n > 1 ? 's' : ''}</b> · ${km(tot)} km · falta ${km(t.falta)} km`;
    $('fx-L').innerHTML = `${km(t.leve)} <small>km</small>`; $('fx-P').innerHTML = `${km(t.pesada)} <small>km</small>`;
    $('fx-barra').innerHTML = tot ? `<span style="width:${t.leve / tot * 100}%;background:${COR[1]}"></span><span style="width:${t.pesada / tot * 100}%;background:${COR[2]}"></span>` : '';
    $('fx-desfaz').disabled = !undo.length;
    dash.querySelectorAll('.fx-t').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.f === ferr)));
    $('fx-apagar').setAttribute('aria-pressed', String(ferr === 'apagar'));
    if (tAviso) return;
    $('fx-dica-p').textContent = ferr ? (toque() ? 'Arraste com 1 dedo sobre o trecho. 2 dedos movem o mapa.' : 'Arraste sobre o trecho. Segure Espaço para mover o mapa.') +
      (map.getZoom() < 13 ? ' Aproxime para mais precisão.' : '') : `${toque() ? 'Toque' : 'Clique'} em outro trecho para somar, ou ligue Leve ou Pesada.`;
  }
  function aviso(t) {
    const p = $('fx-dica-p'); p.textContent = t; p.style.color = '#f59e0b';
    clearTimeout(tAviso); tAviso = setTimeout(() => { tAviso = 0; p.style.color = ''; ui(); }, 2800);
  }

  // ---------- ferramentas ----------
  function aplicaFerr() {
    const p = pintando();
    mc.classList.toggle('fx-pinta', ativo && p);
    if (ativo && p) map.dragging.disable(); else map.dragging.enable();
    mc.style.cursor = ativo && !ferr ? 'pointer' : '';
    bPincel.style.display = 'none'; bDica.style.display = 'none'; lHover.setLatLngs([]);
    ui();
  }
  const setFerr = f => { ferr = ferr === f ? null : f; temp = false; aplicaFerr(); };   // tocar de novo solta: volta a escolher trechos

  const ativos = new Set();
  capa.addEventListener('pointerdown', e => {
    if (!ativo || e.button > 0) return;
    ativos.add(e.pointerId);
    if (ativos.size > 1) {                                        // 2 dedos: pinça/andar; o pontinho do 1º dedo sai
      if (stroke) { stroke.rec.forEach((antes, q) => { marca[q] = antes; }); stroke = null; agenda(); }
      return;
    }
    const alvo = ALVO[ferr]; if (alvo === undefined) return;
    pincel = toque(e) ? 14 : 8;
    capa.setPointerCapture(e.pointerId);
    const [x, y] = abs(e);
    stroke = { rec: new Map(), x, y, alvo, cobre: e.shiftKey, tocou: 0 };
    stroke.tocou = pinta(x, y, alvo, stroke.cobre);
    mostraPincel(e); agenda();
  });
  capa.addEventListener('pointermove', e => {
    mostraPincel(e);
    if (!stroke || ativos.size > 1) return;
    const [x, y] = abs(e), s = stroke, n = Math.max(1, Math.ceil(Math.hypot(x - s.x, y - s.y) / (pincel / 2)));
    s.cobre = s.cobre || e.shiftKey;
    for (let k = 1; k <= n; k++) s.tocou += pinta(s.x + (x - s.x) * k / n, s.y + (y - s.y) * k / n, s.alvo, s.cobre);
    s.x = x; s.y = y; agenda();
  });
  const solta = e => {
    ativos.delete(e.pointerId);
    if (!stroke) return;
    const s = stroke; stroke = null;
    if (s.rec.size) guarda({ m: s.rec });
    agenda();
    if (!s.tocou) aviso('Aí não tem trecho escolhido: arraste sobre os de contorno branco.');
  };
  capa.addEventListener('pointerup', solta); capa.addEventListener('pointercancel', solta);
  capa.addEventListener('pointerleave', () => { if (!stroke) bPincel.style.display = 'none'; });
  function mostraPincel(e) {
    if (toque(e) && !stroke) { bPincel.style.display = 'none'; return; }
    const r = mc.getBoundingClientRect(), d = pincel * 2;
    bPincel.style.cssText = `display:block;width:${d}px;height:${d}px;transform:translate(${e.clientX - r.left - pincel}px,${e.clientY - r.top - pincel}px)`;
  }

  // escolher trechos: o clique é tomado antes do Leaflet (que selecionaria o trecho do jeito normal do painel)
  let down = null;
  mc.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; }, true);
  mc.addEventListener('click', e => {
    if (!ativo || e.target.closest('.leaflet-control, .leaflet-popup')) return;
    e.stopPropagation();
    if (ferr || (down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6)) return;
    const [x, y] = abs(e), k = vaoPerto(x, y, toque(e) ? 22 : 12);
    if (k < 0) return;
    const ti = V[k][4]; sel.has(ti) ? sel.delete(ti) : sel.add(ti);
    guarda({ t: ti });
    muda(); lHover.setLatLngs([]); bDica.style.display = 'none';
  }, true);
  mc.addEventListener('dblclick', e => { if (ativo) e.stopPropagation(); }, true);
  let mov = 0;
  mc.addEventListener('mousemove', e => {                         // passar o mouse: o trecho acende, com nome e km
    if (!ativo || ferr || mov) return;
    mov = requestAnimationFrame(() => {
      mov = 0;
      const [x, y] = abs(e), k = vaoPerto(x, y, 12);
      if (k < 0) { lHover.setLatLngs([]); bDica.style.display = 'none'; return; }
      const ti = V[k][4], r = box.getBoundingClientRect();
      lHover.setLatLngs(vaosDe[ti].map(i => [[V[i][0], V[i][1]], [V[i][2], V[i][3]]]));
      bDica.textContent = `${T[ti].nome} · ${km(extDe[ti])} km${sel.has(ti) ? ' · clique para tirar' : ''}`;
      bDica.style.cssText = `display:block;left:${Math.min(e.clientX - r.left + 14, r.width - 200)}px;top:${e.clientY - r.top + 16}px`;
    });
  });
  mc.addEventListener('mouseleave', () => { lHover.setLatLngs([]); bDica.style.display = 'none'; });

  // ---------- botões ----------
  pill.addEventListener('click', e => { if (e.target.closest('.fx-x')) desliga(); });
  dash.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.classList.contains('fx-x')) return desliga();
    if (b.dataset.f) return setFerr(b.dataset.f);
    if (b.id === 'fx-apagar') return setFerr('apagar');
    if (b.id === 'fx-desfaz') return desfaz();
    if (b.id === 'fx-croqui') return croqui();
  });
  // croqui: o do painel com os trechos escolhidos e o marcado no mapa no mesmo croqui (Leve = Expedita, Pesada =
  // Convencional; croqui-rascunho.js, que nas páginas de rascunho entra no lugar do croqui.js)
  async function croqui() {
    if (!window.__croqui) { aviso('O croqui não está disponível nesta página.'); return; }
    const t = totais();
    if (!t.leve && !t.pesada) { aviso('Marque Leve ou Pesada antes de baixar o croqui.'); return; }
    const nomes = [...sel].sort((a, b) => a - b).map(i => T[i].nome);
    const bt = $('fx-croqui'); bt.disabled = true;
    try { await window.__croqui(nomes, { leve: t.leve / 1000, pesada: t.pesada / 1000 }); } finally { bt.disabled = false; }
  }

  // ---------- ligar e desligar ----------
  entrada.addEventListener('click', () => liga());
  function liga() {
    if (ativo) return;
    ativo = true;
    // 1) visualização normal dos trechos: desliga as camadas (Faixa, Inspeção…) e guarda quais eram, para religar ao sair
    camadasDesligadas = [...document.querySelectorAll('#ctl-camadas .ctl-card > button:not(.tc-painel-m)')].filter(b => b.getAttribute('aria-pressed') === 'true');
    camadasDesligadas.forEach(b => b.click());
    map.closePopup();
    if (window.__limpar) window.__limpar();                      // sem o trecho escolhido do jeito normal por baixo
    if (innerWidth <= 700 && window.__telaCheia && !document.body.classList.contains('tela-cheia')) { window.__telaCheia(); entrouTC = true; }
    box.classList.add('fx-modo');
    camadas.forEach(l => l.addTo(map));
    map.doubleClickZoom.disable();
    ferr = null; temp = false;
    selV = []; [...sel].sort((a, b) => a - b).forEach(t => vaosDe[t].forEach(i => selV.push(i))); selP = null;
    desenha(); aplicaFerr();
  }
  function desliga() {
    if (!ativo) return;
    ativo = false; stroke = null; ativos.clear(); ferr = null; temp = false;
    box.classList.remove('fx-modo', 'fx-tem'); mc.classList.remove('fx-pinta'); mc.style.cursor = '';
    camadas.forEach(l => l.remove());
    map.dragging.enable(); map.doubleClickZoom.enable();
    bPincel.style.display = 'none'; bDica.style.display = 'none';
    camadasDesligadas.forEach(b => { if (b.getAttribute('aria-pressed') !== 'true') b.click(); }); camadasDesligadas = [];
    if (entrouTC) { entrouTC = false; if (document.body.classList.contains('tela-cheia') && window.__telaCheia) window.__telaCheia(); }
  }

  // ---------- teclado ----------
  const editavel = t => t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
  window.addEventListener('keydown', e => {
    if (e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey && (e.key === 'm' || e.key === 'M')) { e.preventDefault(); e.stopPropagation(); ativo ? desliga() : liga(); return; }
    if (!ativo || document.querySelector('dialog[open]')) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); if (ferr) { ferr = null; aplicaFerr(); } else desliga(); return; }
    if (editavel(e.target)) return;
    if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.code === 'KeyZ' || e.code === 'KeyY')) {   // Ctrl+Z desfaz a última alteração; Ctrl+Shift+Z / Ctrl+Y refaz
      e.preventDefault(); e.stopPropagation();
      if (e.code === 'KeyY' || e.shiftKey) refaz(); else desfaz();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const f = { l: 'leve', p: 'pesada', b: 'apagar' }[e.key.toLowerCase()];
    if (f && sel.size) { e.preventDefault(); setFerr(f); }
    else if (e.code === 'Space' && !e.repeat && ferr && !temp) { e.preventDefault(); temp = true; aplicaFerr(); }
  }, true);
  window.addEventListener('keyup', e => { if (ativo && e.code === 'Space' && temp) { temp = false; aplicaFerr(); } }, true);

  window.__faixa = { liga, desliga, ativo: () => ativo, sel: () => [...sel].map(i => T[i].nome), totais, marca, np, off, ferr: () => ferr, desfeitos: () => undo.length };
})();
