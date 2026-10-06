const D = window.D;
const COR_Z = {1:'#3b82f6', 2:'#22c55e', 3:'#facc15', 4:'#f97316', 5:'#ef4444'};
D.trechos.forEach(t => {
  t.cor = COR_Z[t.zona] || '#d946ef';                  // cor pela classe: T2, T2-A, T2-B… na mesma cor
  t.peso = t.tipo === 'principal' ? 6 : t.tipo === 'ramal' ? 4.5 : 3;
});
const TR = Object.fromEntries(D.trechos.map(t => [t.nome, t]));
const TIPO = {DJ:'disjuntor', '79':'religador', '03':'fusível 03', '33':'fusível 33', '02':'chave 02',
              '40':'trip saver 40', '41':'trip saver 41', SEC:'seccionamento',
              FTR:'fusível no tronco (não abre T3)'};
const km = m => m < 1000 ? Math.round(m) + ' m' : (m / 1000).toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2}) + ' km';
const nv = q => q + (q === 1 ? ' vão' : ' vãos');
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const $ = id => document.getElementById(id);

// legenda
const nRamal = D.trechos.filter(t => t.tipo === 'ramal').length;
const leg = [['T1', COR_Z[1], ''], [nRamal > 1 ? 'T2, T2-A, T2-B…' : nRamal ? 'T2, T2-A' : 'T2', COR_Z[2], '']];
[3, 4, 5].forEach(z => { if (D.trechos.some(t => t.zona === z)) leg.push([`T${z}-…`, COR_Z[z], 'fino']); });
if (D.trechos.some(t => t.zona > 5)) leg.push(['T6+', '#d946ef', 'fino']);
$('legenda').innerHTML = leg.map(([n, c, k]) => `<span><i class="${k}" style="--c:${c}"></i>${esc(n)}</span>`).join('');

// interrupções (NAE): coletiva = atuou DJ, religador, fusível ou trafo; individual = um consumidor
const NAE = D.nae || null;
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const rotMes1 = m => `${MESES[+m.slice(5, 7) - 1]}/${m.slice(0, 4)}`;
const rotMes = m => m === 'todos' ? `${rotMes1(NAE.meses[0])} a ${rotMes1(NAE.meses[NAE.meses.length - 1])}` : rotMes1(m);
const ABR = {DJ: 'DJ', RL: 'religador', 'CH FUS': 'fusível', CH: 'chave', TR: 'trafo', UC: 'consumidor'};
if (NAE && NAE.meses.length) {
  $('ctrl').hidden = false;
  $('mes').innerHTML = (NAE.meses.length > 1 ? `<option value="todos" selected>Todos (${rotMes('todos')})</option>` : '') +
    NAE.meses.map(m => `<option value="${m}">${rotMes(m)}</option>`).join('');
}
const filtra = l => (l || []).filter(o => ($('mes').value === 'todos' || o.mes === $('mes').value) && (o.col || $('ind').checked));
const doMes = () => NAE ? filtra(NAE.oc) : [];            // NAE deste alimentador (Crítica): o total do alimentador
const doExt = () => NAE ? filtra(NAE.ext) : [];           // NAE de outro alimentador cujo ativo hoje está num trecho daqui
const doTrecho = () => [...doMes(), ...doExt()];          // bloco do trecho: soma a NAE de todos os ativos do trecho
function contagem() { const c = {}; doTrecho().forEach(o => { if (o.trecho) c[o.trecho] = (c[o.trecho] || 0) + 1; }); return c; }
const raizAl = location.pathname.includes('/alimentadores/') ? '../' : null;   // no site: link para o outro alimentador
function listaOc(os, comTrecho) {
  return `<ul class="oc">${os.map(o => `<li class="${o.col ? 'col' : ''}"><span class="q">${comTrecho ? `<b>${esc(o.trecho)}</b> · ` : ''}${esc(o.dia)} · ${!o.col ? '1 consumidor · trafo ' + esc(o.ativo) : esc(ABR[o.abr] || o.abr) + ' ' + esc(o.prob || o.ativo) + (o.prob && o.prob !== o.ativo ? ' · trafo ' + esc(o.ativo) : '')}</span><br>` +
    `${esc(o.sub || o.causa)}${o.prog ? ' · <b>programada</b>' : ''} · ${o.cons} cons. · ${o.dur} min` +
    (o.lonlat && map ? ` · <button type="button" class="ir" data-ll="${o.lonlat[1]},${o.lonlat[0]}">ver no mapa</button>` : '') +
    (o.de ? `<br><b>registrada no ${esc(o.de)}</b> (a Crítica conta lá; o ativo hoje fica aqui)` : '') +
    (o.hoje ? `<br>ativo hoje no ${raizAl && o.hoje[1] ? `<a href="${raizAl}${encodeURIComponent(o.hoje[0])}/?t=${encodeURIComponent(o.hoje[1])}">${esc(o.hoje[0])} · ${esc(o.hoje[1])}</a>` : esc(o.hoje[0]) + (o.hoje[1] ? ' · ' + esc(o.hoje[1]) : '')}${o.hoje[1] ? ' (conta também lá)' : ''}` : '') +
    `</li>`).join('')}</ul>`;
}
function blocoNae(nome, l) {
  const os = doTrecho().filter(o => (l || [nome]).includes(o.trecho)), col = os.filter(o => o.col).length, ext = os.filter(o => o.de).length;
  const ind = $('ind').checked ? ` · ${os.length - col} individua${os.length - col === 1 ? 'l' : 'is'}` : '';
  return `<dt>NAE ${rotMes($('mes').value)}</dt><dd><b>${os.length}</b> (${col} coletiva${col === 1 ? '' : 's'}${ind}${ext ? ` · ${ext} registrada${ext === 1 ? '' : 's'} em outro alimentador` : ''})${os.length ? listaOc(os, !!l) : ''}</dd>`;
}
function atualizaNae() {
  desenhaLista($('busca').value);
  multi.length ? detalheVarios(multi) : sel ? detalhe(TR[sel]) : resumo();
  marcaNae(multi.length ? multi : sel ? [sel] : null);
  const c = contagem();
  Object.entries(rotulos).forEach(([n, m]) => { const el = m.getElement(); if (el) { el.firstChild.innerHTML = esc(n) + (c[n] ? `<span class="n">${c[n]}</span>` : ''); el.firstChild.classList.toggle('oc', !!c[n]); } });
  rotulosT3();
}
$('mes').addEventListener('change', atualizaNae);
$('ind').addEventListener('change', atualizaNae);

// lista
const GRUPOS = [['principal', 'T1 e T2'], ['ramal', 'T2-A, T2-B… (um por religador)'], ['fusivel', 'Depois de fusível']];
function fimTxt(t) { return t.fim.join(' / '); }
function desenhaLista(filtro) {
  const q = (filtro || '').trim().toLowerCase();
  const casa = t => !q || [t.nome, t.inicio, t.inicio_poste, ...t.fim, ...t.passa].some(s => String(s).toLowerCase().includes(q));
  const cnt = NAE ? contagem() : null;
  $('lista').innerHTML = GRUPOS.map(([g, titulo]) => {
    const ts = D.trechos.filter(t => t.tipo === g && casa(t));
    if (!ts.length) return '';
    return `<div class="grp">${titulo} · ${ts.length}</div>` + ts.map(t =>
      `<button class="row" role="listitem" data-t="${esc(t.nome)}" aria-current="${escolhido(t.nome)}"><i style="--c:${t.cor}"></i><b>${esc(t.nome)}</b>` +
      `<span title="${esc(t.inicio + ' → ' + fimTxt(t))}">${esc(t.inicio)} → ${esc(fimTxt(t).replace('fim de linha · poste ', 'fim '))}</span>${cnt ? `<strong class="nae ${cnt[t.nome] ? 'tem' : ''}" title="NAE no período">${cnt[t.nome] || 0}</strong>` : ''}<em>${km(t.ext)}</em></button>`).join('');
  }).join('') || '<p class="lede">Nada encontrado.</p>';
}
$('lista').addEventListener('click', e => {
  const b = e.target.closest('.row');
  if (!b) return;
  const y = b.getBoundingClientRect().top;               // a linha tocada fica no mesmo lugar da tela (o detalhe acima muda de altura)
  clique(b.dataset.t, e, true);
  requestAnimationFrame(() => {                          // depois dos acréscimos ao detalhe (limpeza, NAE), antes de pintar
    const n = document.querySelector(`.row[data-t="${CSS.escape(b.dataset.t)}"]`);
    if (n) window.scrollBy(0, n.getBoundingClientRect().top - y);
  });
});
// rola só a lista até a linha, sem mexer na página (tocar no mapa não leva a tela até a lista)
function naLista(b) {
  const l = $('lista'), r = b.getBoundingClientRect(), c = l.getBoundingClientRect(), topo = 30;  // 30: título do grupo fixo no topo
  if (r.top < c.top + topo) l.scrollTop -= c.top + topo - r.top;
  else if (r.bottom > c.bottom) l.scrollTop += r.bottom - c.bottom;
}

// detalhe
function detalhe(t, vao) {
  const chips = l => l.length ? `<div class="chips">${l.map(n => `<button class="chip" data-t="${esc(n)}">${esc(n)}</button>`).join('')}</div>` : '—';
  const tipoTxt = {principal: t.zona === 1 ? 'tronco T1' : 'tronco T2', ramal: t.tronco ? 'T2 · tronco' : 'T2 · ramal', fusivel: `depois de fusível · T${t.zona}`}[t.tipo];
  $('det').innerHTML = `<h2><i style="--c:${t.cor}"></i>${esc(t.nome)} <small>${tipoTxt}</small></h2><dl>
    <dt>Início</dt><dd><span class="mono">${esc(t.inicio)}</span> · ${TIPO[t.inicio_tipo] || t.inicio_tipo} · poste ${esc(t.inicio_poste)}</dd>
    ${t.passa.length ? `<dt>Passa por</dt><dd class="mono">${t.passa.map(esc).join(', ')}</dd>` : ''}
    <dt>Fim</dt><dd class="mono">${t.fim.map(esc).join('<br>')}</dd>
    <dt>Extensão</dt><dd>${km(t.ext)} · ${nv(t.qtd)}</dd>
    ${t.fase ? `<dt>Fases</dt><dd>${esc(t.fase)}${t.fases && Object.keys(t.fases).length > 1 ? ' · ' + Object.entries(t.fases).map(([f, m]) => `${esc(f)} ${km(m)}`).join(' · ') : ''}</dd>` : ''}
    <dt>Vem de</dt><dd>${t.pai ? chips([t.pai]) : '—'}</dd>
    <dt>Derivações</dt><dd>${chips(t.derivacoes)}</dd>
    ${NAE ? blocoNae(t.nome) : ''}
    ${vao ? `<dt>Vão</dt><dd class="mono">${esc(vao[5])} · poste ${esc(vao[6])} → ${esc(vao[7])} · ${Math.round(vao[8])} m</dd>` : ''}
  </dl><div><button class="chip" id="todos">Ver todos</button></div>`;
}
// vários trechos (Ctrl ou ⌘ + clique): soma de extensão e NAE, e cada trecho com o seu
function detalheVarios(l) {
  const ts = l.map(n => TR[n]), ext = ts.reduce((s, t) => s + t.ext, 0), c = NAE ? contagem() : {};
  const nae = NAE ? blocoNae(null, l) : '';
  $('det').innerHTML = `<h2>${l.length} trechos <small>${km(ext)} · ${nv(ts.reduce((s, t) => s + t.qtd, 0))}</small></h2>
    <div class="varios">${ts.map(t => `<div><button class="chip" data-t="${esc(t.nome)}">${esc(t.nome)}</button><span>${km(t.ext)}</span>` +
      `${NAE ? `<span><b>${c[t.nome] || 0}</b> NAE</span>` : ''}<small class="mono">${esc(t.inicio)} → ${esc(fimTxt(t).replace('fim de linha · poste ', 'fim '))}</small></div>`).join('')}</div><dl>
    <dt>Extensão</dt><dd>${km(ext)} somados</dd>
    ${nae}
  </dl><p class="lede">Ctrl (⌘ no Mac) + clique põe ou tira um trecho. Clique sem Ctrl volta a um trecho só.</p><div><button class="chip" id="todos">Ver todos</button></div>`;
}
function resumoNae() {
  const os = doMes(), col = os.filter(o => o.col).length, fora = os.filter(o => !o.trecho), mot = {}, ext = doExt();
  fora.forEach(o => { const m = (o.fora || '').startsWith('hoje no ') ? 'com o ativo hoje em outro alimentador' : o.fora; mot[m] = (mot[m] || 0) + 1; });
  return `<dt>NAE ${rotMes($('mes').value)}</dt><dd><b>${os.length}</b> no alimentador (${col} coletivas${$('ind').checked ? ` · ${os.length - col} individuais` : ''})` +
    `${fora.length ? `<br>Sem trecho aqui: ${Object.entries(mot).map(([m, n]) => `${n} ${esc(m)}`).join(' · ')}${listaOc(fora)}` : ''}` +
    `${ext.length ? `<br>Mais ${ext.length} de outros alimentadores com o ativo hoje num trecho daqui: contam no trecho, não no total acima.` : ''}</dd>`;
}
function resumo() {
  const total = D.trechos.reduce((s, t) => s + t.ext, 0);
  const fus = D.trechos.filter(t => t.tipo === 'fusivel');
  const porZ = {};
  fus.forEach(t => { porZ[t.zona] = (porZ[t.zona] || 0) + 1; });
  const linha = t => `<dt>${esc(t.nome)}</dt><dd><span class="mono">${esc(t.inicio)} → ${esc(fimTxt(t))}</span> · ${km(t.ext)}</dd>`;
  $('det').innerHTML = `<h2>${D.trechos.length} trechos <small>${km(total)} de rede</small></h2><dl>
    ${D.trechos.filter(t => t.tipo !== 'fusivel').map(linha).join('')}
    <dt>Fusíveis</dt><dd>${fus.length} trechos (${Object.entries(porZ).map(([z, n]) => `T${z}: ${n}`).join(' · ')})</dd>
    ${NAE ? resumoNae() : ''}
  </dl><p class="lede">Toque num trecho no mapa ou na lista para ver início, fim e derivações. Para somar vários, segure Ctrl (⌘ no Mac) e clique em cada um.</p>`;
}
$('det').addEventListener('click', e => {
  const v = e.target.closest('[data-ll]');               // ocorrência da lista: vai até o ativo no mapa
  if (v) { if (map) { map.setView(v.dataset.ll.split(',').map(Number), 18); document.getElementById('map').scrollIntoView({block: 'nearest'}); } return; }
  const b = e.target.closest('.chip'); if (!b) return; b.id === 'todos' ? limpar() : clique(b.dataset.t, e, true);
});

// mapa
let map = null, sel = null, multi = [];                // multi: trechos escolhidos com Ctrl (ou ⌘) + clique
const escolhido = n => n === sel || multi.includes(n);
const linhas = {}, rotulos = {};
const visivel = {T1: true, T2: true, T3: true};
let fusMarcas = null;                                     // pontos dos fusíveis: somem junto com o T3          // botões T1 / T2 / T3 sobre o mapa
const classeDe = nome => nome.split('-')[0];          // nome do trecho → [polyline com todos os vãos, vãos]; rótulos no mapa
let halo = null, marcas = null;
const fimDe = {};
D.trechos.forEach(t => t.fim.forEach(f => (fimDe[f] = fimDe[f] || []).push(t.nome)));
const papel = nome => [...D.trechos.filter(t => t.inicio === nome).map(t => 'início do ' + t.nome), ...(fimDe[nome] || []).map(n => 'fim do ' + n)].join(' · ');
// clique com Ctrl (⌘ no Mac): põe ou tira o trecho da seleção; sem Ctrl: um trecho só
const comCtrl = e => !!e && (e.ctrlKey || e.metaKey);
function clique(nome, e, enquadrar, vao) {
  if (!comCtrl(e)) return selecionar(nome, enquadrar, vao);
  const l = multi.length ? multi.slice() : sel ? [sel] : [], i = l.indexOf(nome);
  i < 0 ? l.push(nome) : l.splice(i, 1);
  if (l.length > 1) selecionarVarios(l, nome);
  else if (l.length) selecionar(l[0], false);
  else limpar();
}
function selecionar(nome, enquadrar, vao) {
  sel = nome; multi = [];
  detalhe(TR[nome], vao);
  desenhaLista($('busca').value);
  const b = document.querySelector(`.row[data-t="${CSS.escape(nome)}"]`);
  if (b) naLista(b);
  realca([nome], enquadrar);
}
function selecionarVarios(l, ultimo) {
  sel = null; multi = l;
  detalheVarios(l);
  desenhaLista($('busca').value);
  const b = document.querySelector(`.row[data-t="${CSS.escape(ultimo)}"]`);
  if (b) naLista(b);
  realca(l, false);
}
// destaca no mapa os trechos escolhidos: os outros ficam apagados; pinos de início e fim (com vários, só o início de cada um)
function realca(nomes, enquadrar) {
  if (!map) return;
  Object.entries(linhas).forEach(([n, [l]]) => l.setStyle({opacity: nomes.includes(n) ? 1 : 0.28}));
  if (halo) halo.remove();
  const meus = n => (linhas[n] || [null, []])[1].map(v => [[v[0], v[1]], [v[2], v[3]]]);
  halo = L.layerGroup(nomes.map(n => L.polyline(meus(n), {color: '#fff', weight: TR[n].peso + 6, opacity: .9, interactive: false}))).addTo(map);
  halo.eachLayer(l => l.bringToBack());
  Object.entries(rotulos).forEach(([n, m]) => m.getElement() && m.getElement().firstChild.classList.toggle('sel', nomes.includes(n)));
  if (marcas) marcas.remove();
  const pino = (pt, cls, tag, txt) => L.marker(pt, {interactive: false, zIndexOffset: 900, icon: L.divIcon({className: '', iconSize: null, html: `<div class="ie ${cls}"><em>${tag}</em>${esc(txt)}</div>`})});
  const t = TR[nomes[0]];
  marcas = L.layerGroup(nomes.length > 1 ? nomes.map(n => pino([TR[n].inicio_lat, TR[n].inicio_lon], 'ini', esc(n), TR[n].inicio))
    : [pino([t.inicio_lat, t.inicio_lon], 'ini', 'INÍCIO', t.inicio),
      ...t.fim.map((f, i) => pino(t.fim_pts[i], 'fim', 'FIM', f.replace('fim de linha · poste ', 'poste ') + (f.startsWith('fim de linha') ? ' (fim de linha)' : '')))]).addTo(map);
  if (enquadrar) map.fitBounds(L.latLngBounds(nomes.flatMap(n => meus(n).flat())).pad(0.25), {maxZoom: 17});
  marcaNae(nomes);
  rotulosT3();
}
// ativos com NAE nos trechos escolhidos: um marcador vermelho por ativo, com quantas NAE teve (mês e filtro da tela)
let naeMarcas = null;
function marcaNae(nomes) {
  if (naeMarcas) { naeMarcas.remove(); naeMarcas = null; }
  if (!map || !NAE || !nomes) return;
  const g = {};
  doTrecho().forEach(o => { if (o.lonlat && nomes.includes(o.trecho)) { const k = o.ativo + '|' + o.trecho; (g[k] = g[k] || {o, n: 0, de: new Set()}).n++; if (o.de) g[k].de.add(o.de); } });
  naeMarcas = L.layerGroup(Object.values(g).map(({o, n, de}) => L.marker([o.lonlat[1], o.lonlat[0]], {zIndexOffset: 950, keyboard: false,
    icon: L.divIcon({className: '', iconSize: null, html: `<div class="nae-at">${n}</div>`})})
    .bindTooltip(`${esc(ABR[o.abr] || o.abr)} ${esc(o.ativo)} · ${n} NAE · ${esc(o.trecho)}${de.size ? ' · registrada no ' + esc([...de].join(', ')) : ''}`, {direction: 'top'})
    .on('click', e => { L.DomEvent.stopPropagation(e); map.setView(e.latlng, Math.max(map.getZoom(), 17)); }))).addTo(map);
}
function limpar() {
  sel = null; multi = [];
  marcaNae(null);
  resumo();
  desenhaLista($('busca').value);
  if (!map) return;
  Object.values(linhas).forEach(([l]) => l.setStyle({opacity: 1}));
  if (halo) { halo.remove(); halo = null; }
  if (marcas) { marcas.remove(); marcas = null; }
  Object.values(rotulos).forEach(m => m.getElement() && m.getElement().firstChild.classList.remove('sel'));
  rotulosT3();
}
// vão do trecho mais perto do ponto tocado (o trecho é desenhado como uma linha só)
function vaoPerto(vs, ll) {
  const k = Math.cos(ll.lat * Math.PI / 180);
  let melhor = null, dmin = Infinity;
  vs.forEach(v => {
    const ax = v[1] * k, ay = v[0], bx = v[3] * k, by = v[2], px = ll.lng * k, py = ll.lat;
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    const f = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
    const d = (ax + f * dx - px) ** 2 + (ay + f * dy - py) ** 2;
    if (d < dmin) { dmin = d; melhor = v; }
  });
  return melhor;
}
// rótulos: T1/T2 sempre; T3 só de perto e só os que estão na tela (mais leve em alimentador grande)
function rotulo(t, c) {
  const m = L.marker(t.rotulo, {icon: L.divIcon({className: '', iconSize: null, html: `<div class="lb ${t.tipo === 'fusivel' ? 'fus' : ''}${escolhido(t.nome) ? ' sel' : ''}${c && c[t.nome] ? ' oc' : ''}" style="--c:${t.cor}">${esc(t.nome)}${c && c[t.nome] ? `<span class="n">${c[t.nome]}</span>` : ''}</div>`}), zIndexOffset: t.tipo === 'fusivel' ? 0 : 400})
    .bindTooltip(`${t.inicio} → ${fimTxt(t)}`, {direction: 'top'})
    .on('click', e => { L.DomEvent.stopPropagation(e); clique(t.nome, e.originalEvent, false); }).addTo(map);
  rotulos[t.nome] = m;
}
function mostraClasses() {
  if (!map) return;
  Object.entries(linhas).forEach(([n, [l]]) => { const v = visivel[classeDe(n)]; if (v && !map.hasLayer(l)) l.addTo(map); else if (!v && map.hasLayer(l)) l.remove(); });
  D.trechos.forEach(t => { if (t.tipo === 'fusivel') return;
    const v = visivel[classeDe(t.nome)];
    if (v && !rotulos[t.nome]) rotulo(t, contagem()); else if (!v && rotulos[t.nome]) { rotulos[t.nome].remove(); delete rotulos[t.nome]; } });
  if (visivel.T3 && !map.hasLayer(fusMarcas)) fusMarcas.addTo(map); else if (!visivel.T3) fusMarcas.remove();
  rotulosT3();
}
function rotulosT3() {
  if (!map) return;
  const perto = map.getZoom() >= 15.5, b = map.getBounds().pad(0.2), c = contagem();
  D.trechos.forEach(t => {
    if (t.tipo !== 'fusivel') return;
    const ver = visivel.T3 && (escolhido(t.nome) || c[t.nome] || (perto && b.contains(t.rotulo)));
    if (ver && !rotulos[t.nome]) rotulo(t, c);
    else if (!ver && rotulos[t.nome]) { rotulos[t.nome].remove(); delete rotulos[t.nome]; }
  });
}

if (typeof L === 'undefined') {
  $('nolib').hidden = false;
} else {
  // área de toque em volta das linhas: não precisa acertar em cima do trecho (mais larga no celular)
  map = L.map('map', {preferCanvas: true, renderer: L.canvas({tolerance: L.Browser.mobile ? 16 : 10}), zoomSnap: 0.25, zoomDelta: 0.5});
  window.__map = map;
  let falhas = 0;
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 19, maxNativeZoom: 18, attribution: 'Imagem © Esri — Esri, Maxar, Earthstar Geographics'
  }).on('tileerror', () => { if (++falhas > 3) $('nosat').hidden = false; }).addTo(map);
  // v = [lat1, lon1, lat2, lon2, idx_trecho, id, poste_ini, poste_fim, ext]
  const vaosDe = {};
  D.vaos.forEach(v => (vaosDe[v[4]] = vaosDe[v[4]] || []).push(v));
  Object.keys(vaosDe).forEach(i => {
    const t = D.trechos[i], vs = vaosDe[i];
    const l = L.polyline(vs.map(v => [[v[0], v[1]], [v[2], v[3]]]), {color: t.cor, weight: t.peso, opacity: 1, lineCap: 'round'}).addTo(map);
    l.on('click', e => { L.DomEvent.stopPropagation(e); clique(t.nome, e.originalEvent, false, vaoPerto(vs, e.latlng)); });
    l.bindTooltip(t.nome, {sticky: true, direction: 'top', offset: [0, -8]});
    l.on('mouseover', () => l.setStyle({weight: t.peso + 3}));
    l.on('mouseout', () => l.setStyle({weight: t.peso}));
    linhas[t.nome] = [l, vs];
  });
  fusMarcas = L.layerGroup().addTo(map);
  D.fusiveis.forEach(a => {
    L.circleMarker([a.lat, a.lon], {radius: 4, color: '#111', weight: 1.5, fillColor: a.t === 'SEC' || a.t === 'FTR' ? '#9ca3af' : '#fff', fillOpacity: 1})
      .bindTooltip(`${a.nome} · ${TIPO[a.t] || a.t}${papel(a.nome) ? ' · ' + papel(a.nome) : ''}`, {direction: 'top'})
      .on('click', e => { L.DomEvent.stopPropagation(e); if (a.trecho) clique(a.trecho, e.originalEvent, false); }).addTo(fusMarcas);
  });
  D.principais.forEach(a => {
    L.marker([a.lat, a.lon], {icon: L.divIcon({className: '', iconSize: null, html: `<div class="at"><b>${a.t === 'DJ' ? 'DJ' : '79'}</b><span>${esc(a.nome)}</span></div>`}), zIndexOffset: 500})
      .bindTooltip(`${a.nome} · ${TIPO[a.t]} · poste ${a.poste}${papel(a.nome) ? ' · ' + papel(a.nome) : ''}`, {direction: 'top'}).addTo(map);
  });
  D.trechos.forEach(t => { if (t.tipo !== 'fusivel') rotulo(t); });
  const todos = L.latLngBounds(D.vaos.flatMap(v => [[v[0], v[1]], [v[2], v[3]]]));
  map.fitBounds(todos.pad(0.04));
  const zoomClasse = () => $('map').classList.toggle('longe', map.getZoom() < 15.5);
  map.on('zoomend', zoomClasse); zoomClasse();
  map.on('moveend', rotulosT3); rotulosT3();
  $('classes').innerHTML = [['T1', COR_Z[1]], ['T2', COR_Z[2]], ['T3', COR_Z[3]]]
    .map(([c, cor]) => `<button type="button" data-c="${c}" aria-pressed="true" style="--c:${cor}" title="Mostrar ou esconder ${c}">${c}</button>`).join('');
  $('classes').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    L.DomEvent.stopPropagation(e);
    visivel[b.dataset.c] = !visivel[b.dataset.c];
    b.setAttribute('aria-pressed', visivel[b.dataset.c]);
    mostraClasses();
  });
  L.DomEvent.disableClickPropagation($('classes'));
  map.on('click', e => { if (!comCtrl(e.originalEvent)) limpar(); });   // Ctrl + clique fora da rede não desfaz a seleção
}

$('busca').addEventListener('input', e => {
  const q = e.target.value.trim();
  desenhaLista(q);
  const qq = q.toLowerCase();
  if (!qq) return;
  if (TR[q.toUpperCase()]) return selecionar(q.toUpperCase(), true);
  const at = D.trechos.find(t => t.inicio.toLowerCase() === qq);
  if (at) return selecionar(at.nome, true);
  const v = D.vaos.find(v => String(v[6]).toLowerCase() === qq || String(v[7]).toLowerCase() === qq);
  if (v) { selecionar(D.trechos[v[4]].nome, false, v); if (map) map.setView([v[2], v[3]], Math.max(map.getZoom(), 17)); }
});
window.__sel = selecionar;
window.__clique = clique;
window.__limpar = limpar;
limpar();
if (NAE) atualizaNae();
