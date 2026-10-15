// RASCUNHO: modo "Limpeza de faixa" do painel do alimentador (Ctrl+M).
// Para saber quantos km de manutenção LEVE e PESADA vão em cada trecho:
//   1) Trechos: clique nos trechos que entram na limpeza (clique de novo para tirar);
//   2) Leve / Pesada: arraste sobre a rede, como um marcador, pintando só os vãos dos trechos escolhidos;
//   Apagar tira a marca; Mover (ou segurar Espaço) anda com o mapa. Os km (soma dos vãos, D.vaos[i][8]) aparecem na hora.
// Atalhos: Ctrl+M liga/desliga · T trechos · L leve · P pesada · B apagar · M mover · Espaço (segurar) mover · Ctrl+Z desfaz · Esc sai.
// As marcas ficam só neste navegador (localStorage, por alimentador). Nada vai para o servidor.
// Roda depois de alimentador.js (window.__map, window.D); não altera as outras camadas: só as esmaece enquanto o modo está ligado.
(function () {
  const map = window.__map, D = window.D, L = window.L, box = document.querySelector('.mapbox');
  if (!map || !L || !D || !Array.isArray(D.vaos) || !box) return;
  const mc = map.getContainer(), V = D.vaos, T = D.trechos, AL = (D.meta || {}).al || '';
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const km = m => (m / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const classe = n => n.split('-')[0];
  const COR = { 1: '#a3e635', 2: '#f43f5e', 0: '#94a3b8' }, NOME = { 1: 'Leve', 2: 'Pesada' };
  const ALVO = { leve: 1, pesada: 2, apagar: 0 };                 // ferramentas de pintar → valor da marca
  const KEY = 'faixa-rascunho:' + AL;

  // ---------- dados ----------
  const idxDe = {}; T.forEach((t, i) => { idxDe[t.nome] = i; });
  const vaosDe = T.map(() => []); V.forEach((v, i) => vaosDe[v[4]].push(i));
  const extDe = vaosDe.map(l => l.reduce((s, i) => s + V[i][8], 0));
  let ativo = false, ferr = 'trechos', temp = null, entrouTC = false, restaurou = false;
  const sel = new Set(), marca = new Uint8Array(V.length), undo = [];
  let selV = [];                                                  // vãos dos trechos escolhidos
  const ef = () => temp || ferr;
  const toque = e => (e && e.pointerType) ? e.pointerType !== 'mouse' : matchMedia('(pointer:coarse)').matches;

  // ---------- projeção (pixels absolutos no zoom atual: não muda ao arrastar o mapa) ----------
  const escala = () => 256 * Math.pow(2, map.getZoom());
  const mx = (lon, s) => (lon + 180) / 360 * s;
  const my = (lat, s) => (0.5 - Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) / (2 * Math.PI)) * s;
  let todosP = null, selP = null;
  const projeta = lista => {
    const s = escala(), a = new Float64Array(lista.length * 4);
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
  const vaoPerto = (px, py, tol) => {                             // vão mais perto (entre todos) dentro de tol px
    const a = todosP || (todosP = projeta(TODOS)); let m = tol * tol, r = -1;
    for (let k = 0; k < V.length; k++) {
      const x1 = a[k * 4], x2 = a[k * 4 + 2]; if ((x1 < px - tol && x2 < px - tol) || (x1 > px + tol && x2 > px + tol)) continue;
      const y1 = a[k * 4 + 1], y2 = a[k * 4 + 3]; if ((y1 < py - tol && y2 < py - tol) || (y1 > py + tol && y2 > py + tol)) continue;
      const d = d2(px, py, a, k); if (d <= m) { m = d; r = k; }
    }
    return r;
  };
  map.on('zoomend', () => { todosP = null; selP = null; });

  // ---------- desenho: por cima da rede, num canvas próprio ----------
  const pane = map.createPane('faixa'); pane.style.zIndex = 450; pane.style.pointerEvents = 'none';
  const rend = L.canvas({ pane: 'faixa' });
  const base = { renderer: rend, pane: 'faixa', interactive: false, lineCap: 'round', lineJoin: 'round' };
  const lHover = L.polyline([], Object.assign({}, base, { color: '#fde047', weight: 13, opacity: .65 }));
  const lCas = L.polyline([], Object.assign({}, base, { color: '#ffffff', weight: 10, opacity: .92 }));
  const lSem = L.polyline([], Object.assign({}, base, { color: COR[0], weight: 5, opacity: 1, dashArray: '7 6', lineCap: 'butt' }));
  const lLeve = L.polyline([], Object.assign({}, base, { color: COR[1], weight: 6, opacity: 1 }));
  const lPes = L.polyline([], Object.assign({}, base, { color: COR[2], weight: 6, opacity: 1 }));
  const camadas = [lHover, lCas, lSem, lLeve, lPes];
  let quadro = 0;
  const agenda = () => { if (!quadro) quadro = requestAnimationFrame(() => { quadro = 0; desenha(); ui(); }); };
  function desenha() {
    const todos = [], sem = [], le = [], pe = [];
    for (const i of selV) { const v = V[i], s = [[v[0], v[1]], [v[2], v[3]]]; todos.push(s); (marca[i] === 1 ? le : marca[i] === 2 ? pe : sem).push(s); }
    lCas.setLatLngs(todos); lSem.setLatLngs(sem); lLeve.setLatLngs(le); lPes.setLatLngs(pe);
  }

  // ---------- escolha dos trechos ----------
  function muda() {
    selV = []; [...sel].sort((a, b) => a - b).forEach(t => { vaosDe[t].forEach(i => selV.push(i)); }); selP = null;
    agenda(); salva();
  }
  const alterna = ti => { sel.has(ti) ? sel.delete(ti) : sel.add(ti); muda(); };

  // ---------- pintura ----------
  let pincel = 14, stroke = null;
  function pinta(px, py, alvo, rec) {
    const a = selP || (selP = projeta(selV)), R = pincel, R2 = R * R; let tocou = 0;
    for (let k = 0; k < selV.length; k++) {
      const x1 = a[k * 4], x2 = a[k * 4 + 2]; if ((x1 < px - R && x2 < px - R) || (x1 > px + R && x2 > px + R)) continue;
      const y1 = a[k * 4 + 1], y2 = a[k * 4 + 3]; if ((y1 < py - R && y2 < py - R) || (y1 > py + R && y2 > py + R)) continue;
      if (d2(px, py, a, k) > R2) continue;
      tocou++;
      const i = selV[k]; if (marca[i] === alvo) continue;
      if (!rec.has(i)) rec.set(i, marca[i]);
      marca[i] = alvo;
    }
    return tocou;
  }
  const fecha = rec => { if (rec.size) { undo.push(rec); if (undo.length > 200) undo.shift(); agenda(); salva(); } };
  function preenche(ti, alvo) {
    const rec = new Map(); vaosDe[ti].forEach(i => { if (marca[i] !== alvo) { rec.set(i, marca[i]); marca[i] = alvo; } }); fecha(rec);
  }
  function desfaz() {
    const rec = undo.pop(); if (!rec) { aviso('Nada para desfazer.'); return; }
    rec.forEach((antes, i) => { marca[i] = antes; }); agenda(); salva();
  }
  function limpaMarcas() {
    const rec = new Map(); selV.forEach(i => { if (marca[i]) { rec.set(i, marca[i]); marca[i] = 0; } });
    if (!rec.size) { aviso('Não há marcas para limpar.'); return; }
    fecha(rec);
  }

  // ---------- totais ----------
  function totais() {
    const tt = { L: 0, P: 0, S: 0, t: new Map() };
    for (const i of selV) {
      const v = V[i], m = v[8], ti = v[4]; let r = tt.t.get(ti); if (!r) tt.t.set(ti, r = { L: 0, P: 0, S: 0 });
      if (marca[i] === 1) { tt.L += m; r.L += m; } else if (marca[i] === 2) { tt.P += m; r.P += m; } else { tt.S += m; r.S += m; }
    }
    return tt;
  }
  const textoResumo = () => {
    const tt = totais(), lin = [`Limpeza de faixa · alimentador ${AL}`, `Leve: ${km(tt.L)} km`, `Pesada: ${km(tt.P)} km`, `Sem marcação: ${km(tt.S)} km`, `Total dos trechos escolhidos: ${km(tt.L + tt.P + tt.S)} km`, '', 'Por trecho (leve / pesada / sem marcação, km):'];
    [...tt.t.entries()].sort((a, b) => a[0] - b[0]).forEach(([ti, r]) => lin.push(`${T[ti].nome}: ${km(r.L)} / ${km(r.P)} / ${km(r.S)}`));
    return lin.join('\n');
  };
  const csv = () => {
    const tt = totais(), q = n => String(n).replace('.', ','), l = ['trecho;classe;total_km;leve_km;pesada_km;sem_marcacao_km'];
    [...tt.t.entries()].sort((a, b) => a[0] - b[0]).forEach(([ti, r]) => l.push([T[ti].nome, classe(T[ti].nome), q(((r.L + r.P + r.S) / 1000).toFixed(3)), q((r.L / 1000).toFixed(3)), q((r.P / 1000).toFixed(3)), q((r.S / 1000).toFixed(3))].join(';')));
    l.push(['TOTAL', '', q(((tt.L + tt.P + tt.S) / 1000).toFixed(3)), q((tt.L / 1000).toFixed(3)), q((tt.P / 1000).toFixed(3)), q((tt.S / 1000).toFixed(3))].join(';'));
    return '﻿' + l.join('\r\n');
  };

  // ---------- guardar no navegador ----------
  let tSalva = 0;
  function salva() {
    clearTimeout(tSalva);
    tSalva = setTimeout(() => {
      try {
        const m = []; for (let i = 0; i < marca.length; i++) if (marca[i]) m.push(i + ':' + marca[i]);
        localStorage.setItem(KEY, JSON.stringify({ sel: [...sel], m: m.join(',') }));
      } catch (e) { /* sem armazenamento: segue sem guardar */ }
    }, 400);
  }
  function restaura() {
    try {
      const o = JSON.parse(localStorage.getItem(KEY) || 'null'); if (!o) return false;
      (o.sel || []).forEach(t => { if (t >= 0 && t < T.length) sel.add(t); });
      (o.m || '').split(',').forEach(p => { const [i, c] = p.split(':').map(Number); if (i >= 0 && i < marca.length && (c === 1 || c === 2)) marca[i] = c; });
      return sel.size > 0;
    } catch (e) { return false; }
  }

  // ---------- interface ----------
  const css = document.createElement('style');
  css.textContent = `
.fx-entrada{position:absolute;top:64px;left:12px;z-index:900;display:inline-flex;align-items:center;gap:8px;min-height:40px;padding:0 12px;border:1px solid var(--vidro-borda);border-radius:var(--r2,10px);background:var(--vidro);color:var(--vidro-fg);font:600 13px var(--f-body);cursor:pointer;box-shadow:var(--sh-vidro);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px)}
.fx-entrada:hover{background:#262d33}.fx-entrada kbd{font:600 11px var(--f-mono);padding:1px 5px;border-radius:4px;border:1px solid var(--vidro-borda);opacity:.8}
.fx-entrada svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}
.fx-modo .fx-entrada,.fx-modo .ctl-lgs,.fx-modo .tc-canto,.fx-modo .ctl-dir,.fx-modo .limp-chip{display:none!important}
.fx-on .leaflet-overlay-pane{opacity:.28}.fx-on .leaflet-marker-pane{opacity:.4}
.fx-capa{position:absolute;inset:0;z-index:640;touch-action:none;display:none;cursor:none}
.fx-pinta .fx-capa{display:block}
.fx-pincel{position:absolute;left:0;top:0;border:2px solid #fff;border-radius:50%;pointer-events:none;box-shadow:0 0 0 1.5px #000,inset 0 0 0 1.5px #0007;display:none;z-index:641}
.fx-dica{position:absolute;z-index:1001;pointer-events:none;display:none;padding:4px 8px;border-radius:6px;background:#000d;color:#fff;font:600 12px var(--f-body);white-space:nowrap}
.fx-ui{position:absolute;left:12px;right:12px;bottom:28px;max-width:640px;z-index:1002;display:none;gap:8px;padding:10px 12px;border:1px solid var(--line);border-radius:var(--r3,14px);background:var(--paper);color:var(--fg);box-shadow:var(--sh2);font:500 13px/1.35 var(--f-body);max-height:70%;overflow:auto;overscroll-behavior:contain}
.fx-modo .fx-ui{display:grid}
.fx-ui button{font:inherit;color:inherit;cursor:pointer}
.fx-topo{display:flex;align-items:center;gap:8px}.fx-topo b{font:700 14px var(--f-display,var(--f-body))}
.fx-passo{flex:1;min-width:0;color:var(--muted);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.fx-x{flex:none;width:32px;height:32px;border:0;border-radius:8px;background:none;font-size:18px}.fx-x:hover{background:var(--hover)}
.fx-tot{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
.fx-n{padding:6px 8px;border-radius:8px;background:var(--hover);border-left:5px solid var(--c);min-width:0}
.fx-n small{display:block;font-size:11px;color:var(--muted)}.fx-n b{font:700 17px/1.15 var(--f-mono);font-variant-numeric:tabular-nums}.fx-n i{font:500 11px var(--f-body);font-style:normal;color:var(--muted)}
.fx-barra{display:flex;height:8px;border-radius:4px;overflow:hidden;background:var(--hover)}.fx-barra span{display:block;height:100%}
.fx-ferr{display:grid;grid-template-columns:repeat(5,1fr);gap:4px}
.fx-ferr button{display:grid;justify-items:center;gap:2px;padding:6px 2px;border:1.5px solid var(--line);border-radius:10px;background:none;font-size:11px;font-weight:600;min-width:0}
.fx-ferr button:hover{background:var(--hover)}.fx-ferr button[aria-pressed=true]{border-color:var(--accent);background:var(--hover);color:var(--accent)}
.fx-ferr svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}
.fx-ferr i{width:16px;height:16px;border-radius:50%;background:var(--c);box-shadow:0 0 0 2px var(--paper),0 0 0 3.5px var(--c)}
.fx-ferr kbd{font:600 9px var(--f-mono);opacity:.55}
.fx-msg{margin:0;display:flex;align-items:center;gap:8px;min-height:32px;font-size:12.5px}.fx-msg span{flex:1}.fx-msg.aviso{color:#f59e0b}
.fx-go{flex:none;padding:6px 12px;border:0;border-radius:8px;background:var(--accent);color:var(--on-accent);font-weight:700}
.fx-acoes{display:flex;flex-wrap:wrap;gap:6px}
.fx-acoes button{padding:5px 10px;border:1px solid var(--line);border-radius:8px;background:none;font-size:12px;font-weight:600}.fx-acoes button:hover{background:var(--hover)}.fx-acoes button:disabled{opacity:.4;cursor:default}
.fx-lista{display:grid;gap:4px;max-height:200px;overflow:auto}
.fx-lista[hidden]{display:none}
.fx-l{display:grid;grid-template-columns:1fr auto;gap:2px 8px;align-items:center;padding:6px 8px;border-radius:8px;background:var(--hover)}
.fx-l b{font:700 12.5px var(--f-mono)}.fx-l b::before{content:"";display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;background:var(--c)}
.fx-l small{grid-column:1;font-size:11px;color:var(--muted)}.fx-l .fx-b{grid-column:1/-1}
.fx-l .fx-bt{grid-column:2;grid-row:1/3;display:flex;gap:4px}
.fx-bt button{width:30px;height:30px;border:1px solid var(--line);border-radius:7px;background:var(--paper);font:700 12px var(--f-mono)}
.fx-bt button[data-f="1"]{color:${COR[1]}}.fx-bt button[data-f="2"]{color:${COR[2]}}
@media (min-width:700px){.fx-ui{left:12px;right:auto;width:360px}}
`;
  document.head.append(css);

  const entrada = document.createElement('button');
  entrada.type = 'button'; entrada.className = 'fx-entrada';
  entrada.title = 'Marcar onde a limpeza de faixa é leve e onde é pesada (Ctrl+M)';
  entrada.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20l3-1 11-11-2-2L5 17zM14 6l2 2"/></svg>Limpeza de faixa <kbd>Ctrl M</kbd>';
  box.append(entrada);

  const ui_ = document.createElement('div');
  ui_.className = 'fx-ui'; ui_.setAttribute('role', 'region'); ui_.setAttribute('aria-label', 'Limpeza de faixa');
  const IC = {
    mover: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3"/></svg>',
    trechos: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3l14 7-6 2-2 6z"/></svg>',
    apagar: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 16l9-10 7 6-6 7H8zM10 19h10"/></svg>'
  };
  const FERR = [['trechos', 'Trechos', 'T', IC.trechos], ['leve', 'Leve', 'L', `<i style="--c:${COR[1]}"></i>`], ['pesada', 'Pesada', 'P', `<i style="--c:${COR[2]}"></i>`], ['apagar', 'Apagar', 'B', IC.apagar], ['mover', 'Mover', 'M', IC.mover]];
  ui_.innerHTML = `<div class="fx-topo"><b>Limpeza de faixa</b><span class="fx-passo" id="fx-passo"></span><button type="button" class="fx-x" id="fx-sai" title="Sair (Esc)" aria-label="Sair do modo limpeza de faixa">✕</button></div>
<div class="fx-tot"><div class="fx-n" style="--c:${COR[1]}"><small>Leve</small><b id="fx-L">0,00</b> <i>km</i></div><div class="fx-n" style="--c:${COR[2]}"><small>Pesada</small><b id="fx-P">0,00</b> <i>km</i></div><div class="fx-n" style="--c:${COR[0]}"><small>Falta marcar</small><b id="fx-S">0,00</b> <i>km</i></div></div>
<div class="fx-barra" id="fx-barra" aria-hidden="true"></div>
<div class="fx-ferr" role="group" aria-label="Ferramentas">${FERR.map(([k, n, t, ic]) => `<button type="button" data-f="${k}" aria-pressed="false" title="${n} (${t})">${ic}${n}<kbd>${t}</kbd></button>`).join('')}</div>
<p class="fx-msg" id="fx-msg" aria-live="polite"></p>
<div class="fx-acoes"><button type="button" id="fx-desfaz">↶ Desfazer</button><button type="button" id="fx-limpa">Limpar marcas</button><button type="button" id="fx-copia">Copiar resumo</button><button type="button" id="fx-csv">Baixar CSV</button><button type="button" id="fx-enq">Enquadrar trechos</button><button type="button" id="fx-ver" aria-expanded="false">Por trecho ▾</button></div>
<div class="fx-lista" id="fx-lista" hidden></div>`;
  box.append(ui_);
  const $ = id => ui_.querySelector('#' + id);

  const capa = L.DomUtil.create('div', 'fx-capa', mc);
  const bPincel = L.DomUtil.create('div', 'fx-pincel', capa);
  const bDica = L.DomUtil.create('div', 'fx-dica', box);

  let msgFixa = '', msgTmp = 0;
  function aviso(t) {
    const p = $('fx-msg'); p.className = 'fx-msg aviso'; p.innerHTML = `<span>${esc(t)}</span>`;
    clearTimeout(msgTmp); msgTmp = setTimeout(() => { msgTmp = 0; mensagem(); }, 3200);
  }
  function mensagem() {
    if (msgTmp) return;
    const p = $('fx-msg'); p.className = 'fx-msg';
    const f = ef(); let t = '', go = '';
    if (f === 'trechos') {
      t = sel.size ? `${sel.size} trecho${sel.size > 1 ? 's' : ''} escolhido${sel.size > 1 ? 's' : ''}. Clique em outro para somar, ou no mesmo para tirar.` : 'Clique nos trechos que entram na limpeza (eles ficam com contorno branco).';
      if (sel.size) go = '<button type="button" class="fx-go" id="fx-go">Pintar ▸</button>';
    } else if (f === 'mover') t = 'Arraste para andar com o mapa. Solte a tecla Espaço ou escolha outra ferramenta para voltar.';
    else {
      const nome = f === 'apagar' ? 'tirar a marca' : `marcar manutenção ${NOME[ALVO[f]].toUpperCase()}`;
      t = !sel.size ? 'Primeiro escolha os trechos (ferramenta Trechos).' : map.getZoom() < 13 ? 'Aproxime o mapa para pintar com mais precisão.' : `Arraste sobre os trechos de contorno branco para ${nome}.`;
    }
    p.innerHTML = `<span>${esc(t)}</span>${go}`;
  }
  let ultSel = -1;
  function ui() {
    const tt = totais(), tot = tt.L + tt.P + tt.S;
    $('fx-L').textContent = km(tt.L); $('fx-P').textContent = km(tt.P); $('fx-S').textContent = km(tt.S);
    $('fx-barra').innerHTML = tot ? `<span style="width:${tt.L / tot * 100}%;background:${COR[1]}"></span><span style="width:${tt.P / tot * 100}%;background:${COR[2]}"></span><span style="width:${tt.S / tot * 100}%;background:${COR[0]}"></span>` : '';
    $('fx-passo').textContent = !sel.size ? '1 · Escolha os trechos' : `2 · Pinte leve e pesada · ${km(tot)} km escolhidos`;
    $('fx-desfaz').disabled = !undo.length; $('fx-limpa').disabled = !(tt.L + tt.P);
    ui_.querySelectorAll('.fx-ferr button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.f === ef())));
    if (ultSel !== sel.size) { ultSel = sel.size; mensagem(); }
    if (!$('fx-lista').hidden) lista(tt);
  }
  function lista(tt) {
    tt = tt || totais();
    const rows = [...sel].sort((a, b) => a - b).map(ti => {
      const r = tt.t.get(ti) || { L: 0, P: 0, S: extDe[ti] }, t = T[ti], tot = r.L + r.P + r.S || 1;
      return `<div class="fx-l" style="--c:${esc(t.cor)}" data-t="${ti}"><b>${esc(t.nome)}</b><div class="fx-bt"><button type="button" data-f="1" title="Pintar o trecho todo de leve">L</button><button type="button" data-f="2" title="Pintar o trecho todo de pesada">P</button><button type="button" data-f="0" title="Tirar o trecho da escolha">✕</button></div>` +
        `<small>${km(r.L + r.P + r.S)} km · leve ${km(r.L)} · pesada ${km(r.P)} · falta ${km(r.S)}</small><div class="fx-barra fx-b"><span style="width:${r.L / tot * 100}%;background:${COR[1]}"></span><span style="width:${r.P / tot * 100}%;background:${COR[2]}"></span><span style="width:${r.S / tot * 100}%;background:${COR[0]}"></span></div></div>`;
    });
    $('fx-lista').innerHTML = rows.join('') || '<p class="fx-msg"><span>Nenhum trecho escolhido ainda.</span></p>';
  }

  // ---------- ferramentas ----------
  function aplicaFerr() {
    const f = ef(), pinta_ = f in ALVO;
    mc.classList.toggle('fx-pinta', pinta_);
    if (pinta_) { map.dragging.disable(); mc.style.cursor = ''; } else { map.dragging.enable(); }
    mc.style.cursor = f === 'trechos' ? 'pointer' : '';
    bPincel.style.display = 'none'; bDica.style.display = 'none'; lHover.setLatLngs([]);
    ui(); mensagem();
  }
  function setFerr(f) { ferr = f; temp = null; aplicaFerr(); }

  // pintar: arrastar na capa
  const ativos = new Set();
  capa.addEventListener('pointerdown', e => {
    if (!ativo || e.button > 0) return;
    ativos.add(e.pointerId);
    if (ativos.size > 1) {                                              // 2 dedos: é pinça/andar, não pintar: desfaz o pontinho do 1º dedo
      if (stroke) { stroke.rec.forEach((antes, i) => { marca[i] = antes; }); stroke = null; agenda(); }
      return;
    }
    const alvo = ALVO[ef()]; if (alvo === undefined) return;
    pincel = toque(e) ? 22 : 14;
    capa.setPointerCapture(e.pointerId);
    const [x, y] = abs(e), rec = new Map();
    stroke = { rec, x, y, alvo, tocou: pinta(x, y, alvo, rec) };
    mostraPincel(e); agenda();
  });
  capa.addEventListener('pointermove', e => {
    mostraPincel(e);
    if (!stroke || ativos.size > 1) return;
    const [x, y] = abs(e), s = stroke, dist = Math.hypot(x - s.x, y - s.y), n = Math.max(1, Math.ceil(dist / (pincel / 2)));
    for (let k = 1; k <= n; k++) s.tocou += pinta(s.x + (x - s.x) * k / n, s.y + (y - s.y) * k / n, s.alvo, s.rec);
    s.x = x; s.y = y; agenda();
  });
  const solta = e => {
    ativos.delete(e.pointerId);
    if (!stroke) return;
    const s = stroke; stroke = null; fecha(s.rec);
    if (!s.rec.size && !s.tocou) aviso(!sel.size ? 'Primeiro escolha os trechos (ferramenta Trechos).' : 'Aí não tem trecho escolhido. Pinte sobre os trechos de contorno branco.');
  };
  capa.addEventListener('pointerup', solta); capa.addEventListener('pointercancel', solta);
  capa.addEventListener('pointerleave', e => { if (!stroke) bPincel.style.display = 'none'; });
  function mostraPincel(e) {
    if (toque(e) && !stroke) { bPincel.style.display = 'none'; return; }
    const r = mc.getBoundingClientRect(), d = pincel * 2;
    bPincel.style.cssText = `display:block;width:${d}px;height:${d}px;transform:translate(${e.clientX - r.left - pincel}px,${e.clientY - r.top - pincel}px)`;
  }

  // escolher trechos: clique (capturado antes do Leaflet, que selecionaria o trecho do jeito normal)
  let down = null;
  mc.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; }, true);
  mc.addEventListener('click', e => {
    if (!ativo || e.target.closest('.leaflet-control, .leaflet-popup')) return;
    e.stopPropagation();
    if (ef() !== 'trechos' || (down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6)) return;
    const [x, y] = abs(e), k = vaoPerto(x, y, toque(e) ? 22 : 12);
    if (k < 0) { aviso('Não achei trecho aí. Clique em cima da linha.'); return; }
    const ti = V[k][4]; alterna(ti);
    mensagem(); ui();
  }, true);
  mc.addEventListener('dblclick', e => { if (ativo) e.stopPropagation(); }, true);
  // passar o mouse num trecho: nome, km e o que o clique faz
  let mov = 0;
  mc.addEventListener('mousemove', e => {
    if (!ativo || ef() !== 'trechos' || mov) return;
    mov = requestAnimationFrame(() => {
      mov = 0;
      const [x, y] = abs(e), k = vaoPerto(x, y, 12);
      if (k < 0) { lHover.setLatLngs([]); bDica.style.display = 'none'; return; }
      const ti = V[k][4], r = box.getBoundingClientRect();
      lHover.setLatLngs(vaosDe[ti].map(i => [[V[i][0], V[i][1]], [V[i][2], V[i][3]]]));
      bDica.textContent = `${T[ti].nome} · ${km(extDe[ti])} km · clique para ${sel.has(ti) ? 'tirar' : 'escolher'}`;
      bDica.style.cssText = `display:block;left:${Math.min(e.clientX - r.left + 14, r.width - 230)}px;top:${e.clientY - r.top + 16}px`;
    });
  });
  mc.addEventListener('mouseleave', () => { lHover.setLatLngs([]); bDica.style.display = 'none'; });

  // ---------- botões ----------
  ui_.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.f && b.closest('.fx-ferr')) return setFerr(b.dataset.f);
    if (b.id === 'fx-sai') return desliga();
    if (b.id === 'fx-go') { enquadra(); return setFerr('leve'); }
    if (b.id === 'fx-enq') return enquadra();
    if (b.id === 'fx-desfaz') return desfaz();
    if (b.id === 'fx-limpa') return limpaMarcas();
    if (b.id === 'fx-copia') return copia();
    if (b.id === 'fx-csv') return baixa();
    if (b.id === 'fx-ver') { const l = $('fx-lista'); l.hidden = !l.hidden; b.setAttribute('aria-expanded', String(!l.hidden)); b.textContent = l.hidden ? 'Por trecho ▾' : 'Por trecho ▴'; if (!l.hidden) lista(); return; }
    const row = b.closest('.fx-l');
    if (row) {
      const ti = +row.dataset.t;
      if (b.dataset.f === '0') alterna(ti); else preenche(ti, +b.dataset.f);
    }
  });
  // leva os trechos escolhidos para a parte livre do mapa (acima do painel), no zoom em que dá para pintar com precisão
  function enquadra() {
    if (!selV.length) { aviso('Escolha trechos primeiro.'); return; }
    const pts = []; selV.forEach(i => { pts.push([V[i][0], V[i][1]], [V[i][2], V[i][3]]); });
    map.fitBounds(L.latLngBounds(pts), { animate: false, maxZoom: 17, paddingTopLeft: [40, 70], paddingBottomRight: [40, ui_.offsetHeight + 40] });
  }
  async function copia() {
    const t = textoResumo();
    try { await navigator.clipboard.writeText(t); aviso('Resumo copiado.'); }
    catch (e) { const a = document.createElement('textarea'); a.value = t; a.style.cssText = 'position:fixed;opacity:0'; document.body.append(a); a.select(); try { document.execCommand('copy'); aviso('Resumo copiado.'); } catch (_) { aviso('Não deu para copiar neste navegador.'); } a.remove(); }
  }
  function baixa() {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv()], { type: 'text/csv;charset=utf-8' }));
    a.download = `limpeza-faixa-${AL}.csv`; document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  // ---------- ligar e desligar ----------
  function liga() {
    if (ativo) return;
    ativo = true;
    if (!restaurou) { restaurou = true; if (restaura()) aviso('Marcas anteriores restauradas deste navegador.'); }
    if (!sel.size && window.__selecao) (window.__selecao() || []).forEach(n => { if (n in idxDe) sel.add(idxDe[n]); });   // o que já estava escolhido no painel
    if (innerWidth <= 700 && window.__telaCheia && !document.body.classList.contains('tela-cheia')) { window.__telaCheia(); entrouTC = true; }
    mc.classList.add('fx-on'); box.classList.add('fx-modo');
    camadas.forEach(l => l.addTo(map));
    map.doubleClickZoom.disable();
    selV = []; [...sel].sort((a, b) => a - b).forEach(t => vaosDe[t].forEach(i => selV.push(i))); selP = null;
    ferr = sel.size ? 'leve' : 'trechos'; temp = null; ultSel = -1;
    desenha(); aplicaFerr();
    if (sel.size && !msgTmp) mensagem();
  }
  function desliga() {
    if (!ativo) return;
    ativo = false; stroke = null; ativos.clear();
    mc.classList.remove('fx-on', 'fx-pinta'); box.classList.remove('fx-modo'); mc.style.cursor = '';
    camadas.forEach(l => l.remove());
    map.dragging.enable(); map.doubleClickZoom.enable();
    bPincel.style.display = 'none'; bDica.style.display = 'none';
    if (entrouTC) { entrouTC = false; if (document.body.classList.contains('tela-cheia') && window.__telaCheia) window.__telaCheia(); }
  }
  entrada.addEventListener('click', liga);

  // ---------- teclado ----------
  const editavel = t => t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
  window.addEventListener('keydown', e => {
    if (e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey && (e.key === 'm' || e.key === 'M')) { e.preventDefault(); e.stopPropagation(); ativo ? desliga() : liga(); return; }
    if (!ativo) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); desliga(); return; }
    if (editavel(e.target)) return;
    if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); desfaz(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase(), mapa = { t: 'trechos', l: 'leve', p: 'pesada', b: 'apagar', m: 'mover' };
    if (mapa[k]) { e.preventDefault(); setFerr(mapa[k]); }
    else if (e.code === 'Space' && !e.repeat && !temp) { e.preventDefault(); temp = 'mover'; aplicaFerr(); }
  }, true);
  window.addEventListener('keyup', e => { if (ativo && e.code === 'Space' && temp) { temp = null; aplicaFerr(); } }, true);

  window.__faixa = { liga, desliga, ativo: () => ativo, sel: () => [...sel].map(i => T[i].nome), totais: () => { const t = totais(); return { leve: t.L, pesada: t.P, falta: t.S }; }, marca, resumo: textoResumo, csv };
})();
