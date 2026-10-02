// Limpeza de faixa (roda depois de alimentador.js e extras.js, com window.D e window.LIMPEZA):
// pinta cada vão pela situação da última limpeza executada, pela regra T1 a cada 3 anos, T2 a cada 4, T3 a cada 5;
// mostra as OS no detalhe do trecho e o ano da última limpeza na lista.
// A posição vem das chaves/ativos citados na OS e dos km da descrição: é aproximada.
(function () {
  const LP = window.LIMPEZA;
  if (!LP || !window.D) return;
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const km = m => (m / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' km';
  const br = d => d ? d.split('-').reverse().join('/') : '—';
  const REGRA = LP.regra_anos;
  const HOJE = new Date(); HOJE.setHours(0, 0, 0, 0);
  const somaAnos = (d, n) => { const x = new Date(d + 'T00:00:00'); x.setFullYear(x.getFullYear() + n); return x; };
  const iso = x => x.toISOString().slice(0, 10);
  const classeDe = nome => nome.split('-')[0];
  const SIT = {
    dia: ['Em dia', '#16a34a'],
    vence: ['Vence em até 12 meses', '#eab308'],
    vencida: ['Vencida', '#dc2626'],
    sem: ['Sem registro', '#9ca3af'],
  };
  function situacao(data, classe) {
    if (!data) return 'sem';
    const v = somaAnos(data, REGRA[classe]);
    if (v < HOJE) return 'vencida';
    const um = new Date(HOJE); um.setFullYear(um.getFullYear() + 1);
    return v < um ? 'vence' : 'dia';
  }

  // vão -> última data executada e OS
  const porVao = {};
  D.vaos.forEach(v => {
    const ks = LP.vaos[v[5]] || [];
    const datas = ks.map(k => LP.os[k].data).filter(Boolean).sort();
    porVao[v[5]] = { ks, ult: datas[datas.length - 1] || null };
  });
  const vaosDoTrecho = {};
  D.vaos.forEach(v => (vaosDoTrecho[D.trechos[v[4]].nome] = vaosDoTrecho[D.trechos[v[4]].nome] || []).push(v));
  function resumoTrecho(nome) {
    const vs = vaosDoTrecho[nome] || [], classe = classeDe(nome);
    const m = { dia: 0, vence: 0, vencida: 0, sem: 0 }, ks = new Set();
    let ult = null, ext = 0;
    vs.forEach(v => {
      const p = porVao[v[5]];
      m[situacao(p.ult, classe)] += v[8]; ext += v[8];
      p.ks.forEach(k => ks.add(k));
      if (p.ult && (!ult || p.ult > ult)) ult = p.ult;
    });
    return { m, ext, ult, ks: [...ks].sort((a, b) => a - b), classe };
  }
  const RT = Object.fromEntries(D.trechos.map(t => [t.nome, resumoTrecho(t.nome)]));
  // situação "do trecho" = a da maior parte da extensão
  const sitTrecho = r => Object.entries(r.m).sort((a, b) => b[1] - a[1])[0][0];

  const css = document.createElement('style');
  css.textContent = `
.limpbtn{position:absolute;left:10px;bottom:24px;z-index:800;display:flex;flex-direction:column;gap:6px;align-items:flex-start}
.limpbtn button{font:600 13px 'IBM Plex Sans',sans-serif;padding:7px 11px;border-radius:8px;border:1px solid #0006;background:#fff;color:#111;cursor:pointer}
.limpbtn button[aria-pressed=true]{background:#14532d;color:#fff}
.limpleg{background:#fffffff2;color:#111;border-radius:8px;padding:6px 9px;font-size:12px;line-height:1.55;box-shadow:0 1px 4px #0004}
.limpleg i{display:inline-block;width:18px;height:5px;border-radius:3px;margin-right:6px;vertical-align:middle;background:var(--c)}
.limp-sec{margin-top:10px;border-top:1px solid var(--line,#ddd);padding-top:8px}
.limp-sec h3{font-size:14px;margin:0 0 4px}
.limp-bar{display:flex;height:8px;border-radius:4px;overflow:hidden;margin:4px 0 6px;background:#9ca3af}
.limp-bar span{display:block;height:100%}
.limp-os{list-style:none;padding:0;margin:4px 0;font-size:12.5px}
.limp-os li{padding:4px 0;border-bottom:1px dashed var(--line,#ddd)}
.limp-os li.pend{opacity:.75}
.limp-os .q{font-family:'IBM Plex Mono',monospace;font-size:12px}
.limp-os details{font-size:12px;opacity:.85}
.limp-ano{font:600 11px 'IBM Plex Mono',monospace;padding:1px 5px;border-radius:5px;color:#fff;background:var(--c);margin-left:auto;white-space:nowrap}
.limp-nota{font-size:12px;opacity:.8}`;
  document.head.append(css);

  // ---------- mapa ----------
  const map = window.__map;
  let camada = null, ligado = false;
  if (map && window.L) {
    const box = document.createElement('div');
    box.className = 'limpbtn';
    box.innerHTML = `<button type="button" id="limp-on" aria-pressed="false" title="Pintar a rede pela situação da limpeza de faixa">Limpeza de faixa</button><div class="limpleg" id="limp-leg" hidden></div>`;
    document.querySelector('.mapbox').append(box);
    L.DomEvent.disableClickPropagation(box);
    const tot = { dia: 0, vence: 0, vencida: 0, sem: 0 };
    Object.values(RT).forEach(r => Object.keys(tot).forEach(k => (tot[k] += r.m[k])));
    $('limp-leg').innerHTML = Object.entries(SIT).map(([k, [n, c]]) => `<div><i style="--c:${c}"></i>${n} · ${km(tot[k])}</div>`).join('') +
      `<div class="limp-nota">T1 a cada ${REGRA.T1} anos · T2 a cada ${REGRA.T2} · T3 a cada ${REGRA.T3}</div>`;
    function desenha() {
      const grupos = { dia: [], vence: [], vencida: [], sem: [] };
      D.vaos.forEach(v => grupos[situacao(porVao[v[5]].ult, classeDe(D.trechos[v[4]].nome))].push([[v[0], v[1]], [v[2], v[3]]]));
      camada = L.layerGroup(Object.entries(grupos).filter(([, g]) => g.length).map(([k, g]) =>
        L.polyline(g, { color: SIT[k][1], weight: k === 'sem' ? 3 : 5, opacity: .95, interactive: false, lineCap: 'round' })));
    }
    $('limp-on').addEventListener('click', () => {
      ligado = !ligado;
      $('limp-on').setAttribute('aria-pressed', ligado);
      $('limp-leg').hidden = !ligado;
      if (!camada) desenha();
      ligado ? camada.addTo(map) : camada.remove();
    });
  }

  // ---------- detalhe ----------
  const linhaOs = k => {
    const o = LP.os[k], pend = o.sit !== 'EXECUTADA';
    return `<li class="${pend ? 'pend' : ''}"><span class="q">${pend ? esc(o.sit.toLowerCase()) + ' · criada ' + br(o.criada) : br(o.data)} · OS ${esc(o.os)}</span><br>` +
      `${esc(o.metodo)}${o.km_desc ? ` · descrição: ${String(o.km_desc).replace('.', ',')} km` : ''} · no mapa: ${km(o.m)}` +
      `${o.al_os && o.al_os !== D.meta?.al ? ` · <b>OS lançada no ${esc(o.al_os)}</b>` : ''}` +
      `<details><summary>descrição e ativos</summary>${esc(o.desc)}${o.ativos.length ? '<br>Ativos: ' + o.ativos.map(esc).join('; ') : ''}</details></li>`;
  };
  const barra = r => `<div class="limp-bar">${['dia', 'vence', 'vencida', 'sem'].map(k => r.m[k] ? `<span style="width:${100 * r.m[k] / (r.ext || 1)}%;background:${SIT[k][1]}" title="${SIT[k][0]}: ${km(r.m[k])}"></span>` : '').join('')}</div>`;
  function secTrecho(nome) {
    const r = RT[nome], anos = REGRA[r.classe];
    const prox = r.ult ? somaAnos(r.ult, anos) : null;
    const s = sitTrecho(r);
    return `<section class="limp-sec"><h3>Limpeza de faixa · ${esc(r.classe)} a cada ${anos} anos</h3>${barra(r)}<dl>
      <dt>Situação</dt><dd><b style="color:${SIT[s][1]}">${SIT[s][0]}</b> na maior parte · ${['dia', 'vence', 'vencida', 'sem'].filter(k => r.m[k]).map(k => `${SIT[k][0].toLowerCase()} ${km(r.m[k])}`).join(' · ')}</dd>
      <dt>Última limpeza</dt><dd>${r.ult ? br(r.ult) + ` · próxima até ${br(iso(prox))}` : 'nenhuma OS executada encontrada neste trecho'}</dd>
      <dt>OS</dt><dd>${r.ks.length ? `<ul class="limp-os">${r.ks.slice().reverse().map(linhaOs).join('')}</ul>` : '—'}</dd></dl>
      <p class="limp-nota">Posição aproximada: vem das chaves/ativos citados na OS e dos km da descrição.</p></section>`;
  }
  function secResumo() {
    const tot = { dia: 0, vence: 0, vencida: 0, sem: 0 }; let ext = 0;
    Object.values(RT).forEach(r => { Object.keys(tot).forEach(k => (tot[k] += r.m[k])); ext += r.ext; });
    const pend = LP.os.map((o, k) => k).filter(k => LP.os[k].sit !== 'EXECUTADA');
    const fora = LP.sem_local;
    const exec = LP.os.filter(o => o.sit === 'EXECUTADA').length;
    return `<section class="limp-sec"><h3>Limpeza de faixa no alimentador</h3>${barra({ m: tot, ext })}<dl>
      <dt>Rede</dt><dd>${['dia', 'vence', 'vencida', 'sem'].map(k => `${SIT[k][0].toLowerCase()} ${km(tot[k])}`).join(' · ')}</dd>
      <dt>OS</dt><dd>${exec} executada${exec === 1 ? '' : 's'} · ${pend.length} pendente${pend.length === 1 ? '' : 's'} · fonte ${esc(LP.fonte)}</dd>
      ${pend.length ? `<dt>Pendentes</dt><dd><ul class="limp-os">${pend.map(linhaOs).join('')}</ul></dd>` : ''}
      ${fora.length ? `<dt>Sem localização</dt><dd>Nenhum ativo da OS caiu na rede deste mapa.<ul class="limp-os">${fora.map(linhaOs).join('')}</ul></dd>` : ''}
      </dl><p class="limp-nota">Regra: T1 a cada ${REGRA.T1} anos, T2 a cada ${REGRA.T2}, T3 a cada ${REGRA.T3}. Toque em “Limpeza de faixa” no mapa para ver onde.</p></section>`;
  }
  const det = $('det');
  function poeDetalhe() {
    if (det.querySelector('.limp-sec')) return;
    const h2 = det.querySelector('h2');
    if (!h2) return;
    const nome = [...h2.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim();
    det.insertAdjacentHTML('beforeend', RT[nome] ? secTrecho(nome) : secResumo());
  }
  new MutationObserver(poeDetalhe).observe(det, { childList: true });
  poeDetalhe();

  // ---------- lista: ano da última limpeza ----------
  const lista = $('lista');
  function poeAnos() {
    lista.querySelectorAll('.row:not([data-limp])').forEach(b => {
      b.dataset.limp = '1';
      const r = RT[b.dataset.t];
      if (!r) return;
      const s = sitTrecho(r);
      const el = document.createElement('span');
      el.className = 'limp-ano';
      el.style.setProperty('--c', SIT[s][1]);
      el.title = `Limpeza de faixa: ${SIT[s][0].toLowerCase()}${r.ult ? ' · última ' + br(r.ult) : ''}`;
      el.textContent = r.ult ? r.ult.slice(0, 4) : '—';
      b.querySelector('em')?.before(el);
    });
  }
  new MutationObserver(poeAnos).observe(lista, { childList: true });
  poeAnos();
})();
