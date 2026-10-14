// Limpeza de faixa (roda depois de alimentador.js e extras.js, com window.D e window.LIMPEZA).
// Duas vistas no mapa:
//   Por ano  — cada ano de limpeza executada com uma cor; liga/desliga por ano; a rede sem limpeza fica cinza-claro.
//   Situação — pela regra T1 a cada 3 anos, T2 a cada 4, T3 a cada 5 (em dia / vence em 12 meses / vencida).
// No painel: uma linha por ano (a cor liga/desliga no mapa; a linha abre as OS do ano embaixo dela); tocar numa OS mostra e enquadra no mapa onde ela foi (com ‹ › no mapa para a próxima).
// OS não executadas em dois grupos, cada um com liga/desliga e traço próprio no mapa: Criadas (CRIADA, tracejado) e
// Pendentes (A REPROGRAMAR / REPROGRAMADA, pontilhado).
// A posição vem das chaves/ativos citados na OS e dos km da descrição: é aproximada.
(function () {
  const LP = window.LIMPEZA;
  if (!LP || !window.D) return;
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const km = m => (m / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' km';
  const br = d => d ? d.split('-').reverse().join('/') : '—';
  const REGRA = LP.regra_anos;
  // executadas só das equipes da regra (prefixo do número da OS); pendentes aparecem de qualquer equipe
  const EQ = (LP.equipes || []).length ? ' pelas equipes ' + (LP.equipes.every(e => e.startsWith('ETO-RD-'))
    ? 'ETO-RD-' + LP.equipes.map(e => e.slice(7)).join('/') : LP.equipes.join(', ')) : '';
  const HOJE = new Date(); HOJE.setHours(0, 0, 0, 0);
  const somaAnos = (d, n) => { const x = new Date(d + 'T00:00:00'); x.setFullYear(x.getFullYear() + n); return x; };
  const iso = x => x.toISOString().slice(0, 10);
  const classeDe = nome => nome.split('-')[0];
  const guarda = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { /* sem armazenamento */ } return null; };
  const celular = () => matchMedia('(max-width:980px)').matches;
  const telaCheia = () => document.body.classList.contains('tela-cheia');
  // OS focada no mapa ou no detalhe do trecho: rola o painel (computador, gaveta da tela cheia) até ela, sem mexer na
  // página; no celular o painel não rola por dentro (o mapa fica à vista). As outras camadas usam o mesmo.
  const rolaPainel = window.__rolaPainel = (bloco, k, conferindo) => {
    const p = document.querySelector('.panel'), b = k === null ? null : bloco.querySelector(`.limp-oss [data-k="${k}"]`);
    if (!p || !b || getComputedStyle(p).overflowY === 'visible' || p.scrollHeight <= p.clientHeight) return;
    const fo = b.nextElementSibling && b.nextElementSibling.classList.contains('limp-foco') ? b.nextElementSibling : b;
    const r = b.getBoundingClientRect(), rp = p.getBoundingClientRect(), fim = fo.getBoundingClientRect().bottom;
    const alto = Math.max(rp.top, 0), baixo = Math.min(rp.bottom, innerHeight);   // a parte do painel que está na tela
    if (r.top < alto + 8) p.scrollTop += r.top - alto - 8;
    else if (fim > baixo - 8) p.scrollTop += Math.min(fim - baixo + 8, r.top - alto - 8);
    // a "âncora de rolagem" do navegador (que segura no lugar o botão com o foco do teclado, se ele estiver mais embaixo
    // no painel) pode desfazer a rolagem no quadro seguinte: confere de novo
    if (!conferindo) requestAnimationFrame(() => requestAnimationFrame(() => rolaPainel(bloco, k, true)));
  };

  // cores fixas por ano (iguais em todos os alimentadores), de frio (antigo) a quente (recente)
  const COR_ANO = { 2021: '#a78bfa', 2022: '#60a5fa', 2023: '#22d3ee', 2024: '#4ade80', 2025: '#facc15', 2026: '#fb923c', 2027: '#f87171', 2028: '#f472b6' };
  const corAno = a => COR_ANO[a] || (a < 2021 ? '#c4b5fd' : '#fb7185');
  const SEMCOR = '#cbd5e1';
  const SIT = { dia: ['Em dia', '#22c55e'], vence: ['Vence em até 12 meses', '#facc15'], vencida: ['Vencida', '#ef4444'], sem: ['Sem registro', SEMCOR] };
  function situacao(data, classe) {
    if (!data) return 'sem';
    const v = somaAnos(data, REGRA[classe]);
    if (v < HOJE) return 'vencida';
    const um = new Date(HOJE); um.setFullYear(um.getFullYear() + 1);
    return v < um ? 'vence' : 'dia';
  }

  // ---------- dados (calculados uma vez) ----------
  const vaoPorId = Object.fromEntries(D.vaos.map(v => [v[5], v]));
  const vaosDaOs = LP.os.map(() => []);
  Object.entries(LP.vaos).forEach(([id, ks]) => ks.forEach(k => vaoPorId[id] && vaosDaOs[k].push(vaoPorId[id])));
  const porVao = {};
  D.vaos.forEach(v => {
    const ks = LP.vaos[v[5]] || [];
    const datas = ks.map(k => LP.os[k].data).filter(Boolean).sort();
    porVao[v[5]] = { ks, ult: datas[datas.length - 1] || null };
  });
  const anoDe = o => o.data ? +o.data.slice(0, 4) : null;
  const ANOS = [...new Set(LP.os.map(anoDe).filter(Boolean))].sort((a, b) => b - a);
  const OS_ANO = Object.fromEntries(ANOS.map(a => [a, LP.os.map((o, k) => k).filter(k => anoDe(LP.os[k]) === a)
    .sort((x, y) => LP.os[y].data.localeCompare(LP.os[x].data))]));
  const uniao = ks => { const s = new Set(); ks.forEach(k => vaosDaOs[k].forEach(v => s.add(v))); return [...s]; };
  const somaM = vs => vs.reduce((m, v) => m + v[8], 0);
  const VAOS_ANO = Object.fromEntries(ANOS.map(a => [a, uniao(OS_ANO[a])]));
  const KM_ANO = Object.fromEntries(ANOS.map(a => [a, somaM(VAOS_ANO[a])]));
  // não executadas: Criadas (CRIADA) e Pendentes (A REPROGRAMAR / REPROGRAMADA e qualquer outra situação não executada)
  const grupoDe = o => o.sit === 'EXECUTADA' ? null : o.sit === 'CRIADA' ? 'cri' : 'pend';
  const CINZA = '#9ca3af';
  const NEXE = {
    cri: { rot: 'Criadas', um: 'criada', cls: 'trac', nota: '' },
    pend: { rot: 'Pendentes', um: 'pendente', cls: 'pont', nota: 'a reprogramar / reprogramada' },
  };
  Object.entries(NEXE).forEach(([g, x]) => {
    x.ks = LP.os.map((o, k) => k).filter(k => grupoDe(LP.os[k]) === g);
    x.vaos = uniao(x.ks); x.km = somaM(x.vaos);
  });
  const GRUPOS_NEXE = Object.entries(NEXE).filter(([, x]) => x.ks.length);
  const KM_LIMPO = somaM(uniao(LP.os.map((o, k) => k).filter(k => LP.os[k].data)));
  const KM_REDE = somaM(D.vaos);
  const ORDEM = [...ANOS.flatMap(a => OS_ANO[a]), ...NEXE.cri.ks, ...NEXE.pend.ks].filter(k => vaosDaOs[k].length); // ‹ › no mapa

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
    return { m, ext, ult, ks: [...ks], classe };
  }
  const RT = Object.fromEntries(D.trechos.map(t => [t.nome, resumoTrecho(t.nome)]));
  const sitTrecho = r => Object.entries(r.m).sort((a, b) => b[1] - a[1])[0][0];
  const TOT_SIT = { dia: 0, vence: 0, vencida: 0, sem: 0 };
  Object.values(RT).forEach(r => Object.keys(TOT_SIT).forEach(k => (TOT_SIT[k] += r.m[k])));

  // ---------- estado ----------
  const st = {
    ligado: guarda('limp-ligado') !== '0',
    vista: guarda('limp-vista') === 'sit' ? 'sit' : 'ano',
    anos: new Set(ANOS),
    nexe: new Set(),         // grupos de OS não executadas ligados no mapa ('cri', 'pend')
    foco: null,
    grupos: new Set(),       // linhas (anos, 'cri', 'pend') abertas, com as OS embaixo
    sel: null,               // trecho selecionado no mapa
  };

  const css = document.createElement('style');
  css.textContent = `
.limp-card{border:0;box-shadow:none;background:none;border-radius:0;padding:var(--s5) 0 0;border-top:1px solid var(--line);display:grid;gap:var(--s3)}
.limp-top{display:flex;align-items:center;gap:var(--s3)}
.limp-top h2{margin:0;font:700 var(--t-xl)/1.1 var(--f-display);flex:1 1 auto;min-width:0;white-space:nowrap}
.limp-top h2 small{display:block;margin-top:var(--s1);font:500 var(--t-xs)/1.4 var(--f-body);color:var(--muted);white-space:normal}
.limp-card button,.limp-sec button,.limp-maplg button,.limp-chip button{font-family:var(--f-body)}
.limp-card button:focus-visible,.limp-sec button:focus-visible,.limp-card summary:focus-visible,.limp-card select:focus-visible{outline:2px solid var(--accent);outline-offset:1px}
/* botão "Faixa" no menu Camadas do mapa, no jeito dos T1 T2 T3: ligado tem o filete com as cores dos anos; desligado fica apagado */
.ctl-card .ctl-faixa{background-image:linear-gradient(90deg,#60a5fa,#22d3ee,#4ade80,#facc15,#fb923c);background-repeat:no-repeat;background-size:100% 3px;background-position:0 100%}
.ctl-card .ctl-faixa[aria-pressed=false]{opacity:.6;text-decoration:line-through;background-image:none;box-shadow:inset 0 -3px 0 #5a636a}
/* segmentado Por ano / Vencimento */
.limp-seg{display:flex;gap:2px;padding:3px;border:0;border-radius:var(--r2);background:var(--hover)}
.limp-seg button{flex:1;min-height:var(--alvo);padding:0 var(--s3);border:0;border-radius:7px;background:transparent;color:var(--muted);font:600 var(--t-sm) var(--f-body);white-space:nowrap;cursor:pointer}
.limp-seg button[aria-pressed=true]{background:var(--seg-on,var(--paper));color:var(--fg);box-shadow:var(--sh1)}
/* anos (ou situações): uma lista só. Cada linha: cor (liga/desliga no mapa) · nome, OS e km (abre as OS logo abaixo) · "só" */
.limp-anos{display:grid}
.limp-ano-l{display:flex;align-items:stretch;min-height:var(--alvo);border-bottom:1px solid var(--line)}
.limp-ano-l>button{all:unset;box-sizing:border-box;cursor:pointer;color:var(--fg)}
.limp-ano-l>button:focus-visible{outline:2px solid var(--accent);outline-offset:-2px}
.limp-ano-l>button:hover{background:var(--hover)}
.limp-ano-l .liga,.limp-ano-l .cor{flex:none;display:grid;place-items:center;width:var(--alvo)}
.limp-ano-l i{width:22px;height:8px;border-radius:4px;background:var(--c);box-shadow:0 0 0 1px #0005}
.limp-ano-l .liga[aria-pressed=false] i{background:transparent;box-shadow:inset 0 0 0 2px var(--c)}
.limp-ano-l .abre,.limp-ano-l .rot{flex:1;min-width:0;display:flex;align-items:center;gap:var(--s2);padding:0 var(--s2) 0 var(--s1);font-size:var(--t-sm)}
.limp-ano-l .abre>span,.limp-ano-l .rot>span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.limp-ano-l b{font:600 var(--t-md) var(--f-mono);font-variant-numeric:tabular-nums}
.limp-ano-l em{font:var(--t-xs) var(--f-mono);font-style:normal;color:var(--muted);white-space:nowrap;font-variant-numeric:tabular-nums}
.limp-ano-l .abre::after{content:'';flex:none;width:6px;height:6px;margin:0 3px 3px;border:solid var(--muted);border-width:0 1.5px 1.5px 0;transform:rotate(45deg)}
.limp-ano-l .abre[aria-expanded=true]::after{margin:3px 3px 0;transform:rotate(-135deg)}
.limp-ano-l .abre:disabled{cursor:default;background:none}
.limp-ano-l .abre:disabled::after{visibility:hidden}
.limp-ano-l.off .abre{color:var(--muted)}
.limp-ano-l.off b{text-decoration:line-through}
.limp-oss{display:grid;gap:var(--s1);padding:var(--s1) 0 var(--s2) var(--s3);border-bottom:1px solid var(--line)}
/* OS não executadas: tracejado (criadas) e pontilhado (pendentes), igual ao traço no mapa */
.limp-card i.trac,.limp-maplg i.trac{background:repeating-linear-gradient(90deg,var(--c) 0 5px,transparent 5px 9px)!important;box-shadow:none!important}
.limp-card i.pont,.limp-maplg i.pont{background:radial-gradient(circle,var(--c) 2.5px,transparent 3px) 0 50%/7px 100% repeat-x!important;box-shadow:none!important}
.limp-todos{justify-self:start;min-height:32px;padding:0 var(--s2);border:0;border-radius:var(--r1);background:none;color:var(--accent);font:600 var(--t-xs) var(--f-body);cursor:pointer}
.limp-todos:hover{background:var(--hover)}
.limp-bar{display:flex;height:8px;border-radius:var(--rp);overflow:hidden;background:var(--sem)}
.limp-bar span{display:block;height:100%}
.limp-nota{font-size:var(--t-xs);color:var(--muted);margin:0}
.limp-card[hidden]{display:none}
.limp-os-b{display:grid;gap:2px;text-align:left;width:100%;min-height:var(--alvo);padding:var(--s2) var(--s3);border:0;border-left:3px solid var(--c);border-radius:0 var(--r1) var(--r1) 0;
  background:color-mix(in srgb,var(--fg) 4%,transparent);color:var(--fg);cursor:pointer;font-size:var(--t-sm)}
.limp-os-b:hover{background:color-mix(in srgb,var(--fg) 8%,transparent)}
.limp-os-b[aria-pressed=true]{background:var(--sel)}
.limp-os-b .q{font:600 var(--t-xs) var(--f-mono);font-variant-numeric:tabular-nums}
.limp-os-b .s{color:var(--muted);font-size:var(--t-xs)}
.limp-os-b.cri{border-left-style:dashed}
.limp-os-b.pend{border-left-style:dotted}
.limp-foco{border:0;border-radius:var(--r1);margin-top:-2px;padding:var(--s2) var(--s3);background:var(--sel);font-size:var(--t-sm);display:grid;gap:var(--s1);overflow-wrap:anywhere}
.limp-foco .q{font:600 var(--t-sm) var(--f-mono)}
/* no detalhe do trecho */
.limp-sec{border-top:1px solid var(--line);padding-top:var(--s3);display:grid;gap:var(--s2)}
.limp-sec h3{font:700 var(--t-base) var(--f-display);margin:0}
.limp-selo{font:600 var(--t-xs)/18px var(--f-mono);padding:0 5px;border-radius:var(--r1);color:#111;background:var(--c);margin-left:auto;white-space:nowrap}
.limp-selo.nada{background:transparent;color:var(--muted);font-weight:400}
/* na lista: coluna do selo com largura fixa (cabe "sem limpeza"), para a NAE e o km ficarem alinhados de uma linha a outra */
.row{grid-template-columns:10px minmax(0,1fr) auto 5.75rem auto}
.row .limp-selo{justify-self:start}
/* sobre o mapa: legenda dos anos (vai para a coluna da direita, embaixo do menu Camadas: extras.js) e OS em foco, no vidro escuro */
.limp-maplg{position:absolute;left:12px;bottom:12px;z-index:800;display:grid;gap:0;max-width:calc(100% - 24px);padding:var(--s1);
  background:var(--vidro);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);color:var(--vidro-fg);border:1px solid var(--vidro-borda);border-radius:var(--r2);box-shadow:var(--sh-vidro);font:var(--t-xs)/1.2 var(--f-body)}
.limp-maplg button{all:unset;box-sizing:border-box;cursor:pointer;display:flex;align-items:center;gap:var(--s2);min-height:32px;padding:0 var(--s2);border-radius:var(--r1)}
.limp-maplg button:hover{background:var(--vidro-hover)}
.limp-maplg button:focus-visible{outline:2px solid var(--foco-mapa);outline-offset:-2px}
@media (pointer:coarse){.limp-maplg button{min-height:40px}}   /* toque: alvo de 40 px */
.limp-maplg button[aria-pressed=false]{opacity:.6;text-decoration:line-through}
.limp-maplg button[aria-pressed=false] i{background:transparent;box-shadow:inset 0 0 0 2px var(--c)}
.limp-maplg span{display:flex;align-items:center;gap:var(--s2);min-height:28px;padding:0 var(--s2)}
.limp-maplg i{width:20px;height:6px;border-radius:3px;background:var(--c);flex:none}
.limp-maplg b{font-family:var(--f-mono);font-weight:600}
.limp-maplg .lg-cab{min-height:0;padding:4px var(--s2) 2px}.limp-maplg .lg-cab b{font:700 var(--t-xs) var(--f-body)}   /* título: o mesmo da Insp→manut e da Manutenção */
.limp-chip{position:absolute;right:12px;bottom:28px;z-index:805;display:flex;align-items:center;gap:2px;max-width:calc(100% - 24px);padding:var(--s1) var(--s1) var(--s1) var(--s2);
  background:var(--vidro);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);color:var(--vidro-fg);border:1px solid var(--vidro-borda);border-radius:var(--r2);
  box-shadow:inset 4px 0 0 var(--c),var(--sh-vidro);font:600 var(--t-sm) var(--f-mono)}
.limp-chip span{padding:0 var(--s2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.limp-chip button{all:unset;cursor:pointer;display:grid;place-items:center;min-width:40px;min-height:40px;border-radius:var(--r1);font-size:var(--t-lg)}
.limp-chip button:hover{background:var(--vidro-hover)}
.limp-chip button:focus-visible{outline:2px solid var(--foco-mapa);outline-offset:-2px}
.limp-tag{display:inline-flex;align-items:baseline;gap:6px;transform:translate(-50%,-140%);white-space:nowrap;pointer-events:none;
  font:700 12.5px/1 var(--f-mono);color:#111;background:var(--c);padding:5px 8px;border-radius:6px;border:2px solid #0b0f14;box-shadow:0 2px 6px #0008}
.limp-tag::after{content:'';position:absolute;left:50%;bottom:-8px;margin-left:-6px;border:6px solid transparent;border-top-color:#0b0f14;border-bottom:0}
.limp-tag small{font:600 11px var(--f-body);opacity:.8}
.limp-tag em{font:700 11px var(--f-body);font-style:normal;background:#0b0f14;color:#fff;padding:2px 5px;border-radius:4px;margin:-2px 0 -2px -4px}
.limp-popup .leaflet-popup-content{margin:10px 12px;font:13px/1.45 var(--f-body)}
.limp-pop .t{font:700 15px var(--f-display);margin-bottom:4px}
.limp-pop .t small{font:500 12px var(--f-body);color:#5a636a;margin-left:4px}
.limp-pop .lb-l{border-left:5px solid var(--c);padding:2px 0 2px 7px;margin:3px 0}
.limp-pop .lb-l b{font-family:var(--f-mono);font-size:12.5px}
.limp-pop .lb-l.cri{border-left-style:dashed}
.limp-pop .lb-l.pend{border-left-style:dotted}
.limp-pop .sit{margin-top:5px;font-weight:600;font-size:12.5px;color:#1b2024}
.limp-pop .sit::before{content:'';display:inline-block;width:9px;height:9px;border-radius:50%;background:var(--c);margin-right:6px;box-shadow:0 0 0 1px #0004}
.limp-pop .nada{color:#5a636a;font-style:italic}
body.limp-on #legenda{display:none}
body.limp-on .classes button{box-shadow:inset 0 -3px 0 #9ca3af}
body.limp-on .lb{border-left-color:#9ca3af}
body.limp-on #map.longe .lb:not(.sel),body.limp-on #map.longe .at{display:none}
body.limp-on #map.longe .leaflet-marker-icon:has(>.at,>.lb:not(.sel)){visibility:hidden}   /* escondido também sai do Tab (sem foco invisível) */
@media (min-width:701px){body.tela-cheia.tc-gaveta .limp-chip{right:calc(min(420px,92vw) + 12px)}}
@media (prefers-reduced-motion:no-preference){
  .limp-seg button,.limp-ano-l>button,.limp-todos,.limp-os-b,.limp-maplg button,.limp-chip button{
    transition:background-color var(--dur) var(--ease),color var(--dur) var(--ease),border-color var(--dur) var(--ease),box-shadow var(--dur) var(--ease),opacity var(--dur) var(--ease)}
}
@media (max-width:640px){.limp-chip{left:12px}.limp-chip span{flex:1}}   /* celular: o chip vai da esquerda até o card Tela cheia */`;
  document.head.append(css);

  // ---------- mapa ----------
  const map = window.__map;
  const seg = v => [[v[0], v[1]], [v[2], v[3]]];
  let camada = null, realce = null, selL = null, fundoCache = null;
  const vis = v => !window.__visivel || window.__visivel[classeDe(D.trechos[v[4]].nome)];
  function linhaDupla(vs, cor, peso, opacidade, extra) {
    // contorno escuro por baixo: a cor aparece igual sobre mata escura ou solo claro
    return [L.polyline(vs.map(seg), { color: '#0b0f14', weight: peso + 4, opacity: .75 * opacidade, interactive: false, lineCap: 'round' }),
      L.polyline(vs.map(seg), Object.assign({ color: cor, weight: peso, opacity: opacidade, interactive: false, lineCap: 'round' }, extra))];
  }
  function fundo() {
    const chave = JSON.stringify(window.__visivel || {});
    if (!fundoCache || fundoCache.chave !== chave) {
      const vs = D.vaos.filter(vis);
      fundoCache = { chave, ls: linhaDupla(vs, SEMCOR, 2.5, .9) };
    }
    return fundoCache.ls;
  }
  function fusiveis() {
    const f = window.__fusMarcas;
    if (!map || !f) return;
    const quer = (!st.ligado || map.getZoom() >= 14) && (!window.__visivel || window.__visivel.T3);
    if (quer && !map.hasLayer(f)) f.addTo(map); else if (!quer && map.hasLayer(f)) f.remove();
  }
  // balão ao tocar na rede: trecho + datas de limpeza naquele vão
  function maisPerto(vs, ll) {
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
  function balao(e, vs) {
    L.DomEvent.stopPropagation(e);
    const v = maisPerto(vs, e.latlng);
    if (!v) return;
    const nome = D.trechos[v[4]].nome, classe = classeDe(nome);
    const oe = e.originalEvent || {};
    if ((oe.ctrlKey || oe.metaKey) && window.__clique) return window.__clique(nome, oe, false);   // Ctrl + clique: soma trechos, sem balão
    if (window.__sel) window.__sel(nome, false);
    const ks = (porVao[v[5]] || { ks: [] }).ks.slice().sort((a, b) => (LP.os[b].data || '9' + LP.os[b].criada).localeCompare(LP.os[a].data || '9' + LP.os[a].criada));
    const exec = ks.filter(k => LP.os[k].data), nexe = ['cri', 'pend'].flatMap(g => ks.filter(k => grupoDe(LP.os[k]) === g));
    const ult = exec.length ? LP.os[exec[0]].data : null;
    const sit = situacao(ult, classe);
    const linha = (k, rot) => {
      const o = LP.os[k], g = grupoDe(o);
      const txt = o.data ? `${rot} ${br(o.data)}` : g === 'cri' ? `Criada em ${br(o.criada)}` : `Pendente (${esc(o.sit.toLowerCase())})`;
      return `<div class="lb-l${g ? ' ' + g : ''}" style="--c:${o.data ? corAno(anoDe(o)) : CINZA}"><b>${txt}</b> · <a href="#" data-k="${k}">OS ${esc(o.os)}</a></div>`;
    };
    const html = `<div class="limp-pop"><div class="t">Trecho ${esc(nome)} <small>${classe} · a cada ${REGRA[classe]} anos</small></div>` +
      (exec.length ? linha(exec[0], 'Limpo em') + exec.slice(1).map(k => linha(k, 'Antes:')).join('') +
        `<div class="sit" style="--c:${SIT[sit][1]}">${SIT[sit][0]} · próxima até ${br(iso(somaAnos(ult, REGRA[classe])))}</div>`
        : '<div class="nada">Sem registro de limpeza aqui</div>') +
      nexe.map(k => linha(k)).join('') + '</div>' +
      (window.__balaoInsp ? window.__balaoInsp(v) : '');   // Inspeção também ligada: as inspeções do vão no mesmo balão
    L.popup({ className: 'limp-popup', maxWidth: 300, autoPanPadding: [20, 20], autoPanPaddingTopLeft: window.__folgaBalao ? window.__folgaBalao() : [20, 20] }).setLatLng(e.latlng).setContent(html).openOn(map);
  }
  if (map) map.getContainer().addEventListener('click', e => {
    const a = e.target.closest('.limp-pop a[data-k]');
    if (a) { e.preventDefault(); map.closePopup(); focar(+a.dataset.k, false); }
  });
  const clicavel = (ls, vs) => { const l = ls[ls.length - 1]; l.options.interactive = true; l.on('click', e => balao(e, vs)); return ls; };

  // etiqueta com a data em cada OS executada visível (no meio do caminho dela)
  function etiquetas() {
    const ms = [], usados = new Map();
    // ano que aparece por cima em cada vão (o mais recente entre os anos ligados)
    const topo = {};
    ANOS.filter(a => st.anos.has(a)).forEach(a => VAOS_ANO[a].forEach(v => { if (!topo[v[5]] || a > topo[v[5]]) topo[v[5]] = a; }));
    ANOS.filter(a => st.anos.has(a)).forEach(a => OS_ANO[a].forEach(k => {
      // etiqueta só onde a cor que aparece é a do ano dela (se foi toda limpa de novo depois, o balão mostra o histórico)
      const vs = vaosDaOs[k].filter(v => vis(v) && topo[v[5]] === a);
      if (!vs.length) return;
      const lat = vs.reduce((s, v) => s + v[0], 0) / vs.length, lon = vs.reduce((s, v) => s + v[1], 0) / vs.length;
      const v = maisPerto(vs, L.latLng(lat, lon));
      const id = v[5];
      if (usados.has(id)) { usados.get(id).push(k); return; }   // mesma área: junta as datas numa etiqueta só
      usados.set(id, [k]);
      ms.push([v, usados.get(id)]);
    }));
    return ms.map(([v, ks]) => {
      const o = LP.os[ks[0]];
      const txt = ks.map(k => br(LP.os[k].data)).join(' · ');
      // trecho com mais metros da OS (é onde ela "está")
      const mt = {};
      vaosDaOs[ks[0]].forEach(x => { const n = D.trechos[x[4]].nome; mt[n] = (mt[n] || 0) + x[8]; });
      // prefere os troncos/ramais (T1, T2…) por onde a OS passa; senão, o ramal de fusível com mais metros
      const nomes = Object.entries(mt).sort((a, b) => b[1] - a[1]).map(e => e[0]);
      const tronco = nomes.filter(n => classeDe(n) !== 'T3');
      const tr = (tronco.length ? tronco.slice(0, 2) : nomes.slice(0, 1)).join(' / ');
      return L.marker([(v[0] + v[2]) / 2, (v[1] + v[3]) / 2], {
        zIndexOffset: 1000, interactive: false, keyboard: false,     // não cobre o clique na rede (o balão da linha mostra a OS)
        icon: L.divIcon({ className: '', iconSize: null, html: `<div class="limp-tag" data-d="${esc(o.data)}" style="--c:${corAno(anoDe(o))}"><em>${esc(tr)}</em>${txt}<small>${ks.length > 1 ? ks.length + ' OS' : km(o.m)}</small></div>` }),
      }).on('click', e => { L.DomEvent.stopPropagation(e); focar(ks[0], true); });
    });
  }

  function desenha() {
    if (!map) return;
    if (camada) camada.remove();
    camada = null;
    document.body.classList.toggle('limp-on', st.ligado);
    fusiveis();
    if (st.ligado) {
      const op = st.foco === null ? 1 : .35;
      const ls = [];
      if (st.vista === 'ano') {
        ls.push(...fundo());
        if (!fundo().clicavel) { clicavel(fundo(), D.vaos.filter(vis)); fundo().clicavel = true; }
        ANOS.slice().reverse().filter(a => st.anos.has(a)).forEach(a => {   // o ano mais recente fica por cima
          const vs = VAOS_ANO[a].filter(vis);
          if (vs.length) ls.push(...clicavel(linhaDupla(vs, corAno(a), 5, op), vs));
        });
        // não executadas por cima dos anos (ligadas pelo usuário): criadas tracejado branco, pendentes pontilhado branco com borda
        if (st.nexe.has('cri')) {
          const vs = NEXE.cri.vaos.filter(vis);
          if (vs.length) ls.push(L.polyline(vs.map(seg), { color: '#fff', weight: 4, dashArray: '6 7', opacity: op, interactive: false }));
        }
        if (st.nexe.has('pend')) {
          const vs = NEXE.pend.vaos.filter(vis);
          if (vs.length) ls.push(L.polyline(vs.map(seg), { color: '#0b0f14', weight: 9, dashArray: '1 11', lineCap: 'round', opacity: .8 * op, interactive: false }),
            L.polyline(vs.map(seg), { color: '#fff', weight: 6, dashArray: '1 11', lineCap: 'round', opacity: op, interactive: false }));
        }
        if (st.foco === null) ls.push(...etiquetas());
      } else {
        const g = { sem: [], vencida: [], vence: [], dia: [] };
        D.vaos.filter(vis).forEach(v => g[situacao(porVao[v[5]].ult, classeDe(D.trechos[v[4]].nome))].push(v));
        Object.entries(g).forEach(([k, vs]) => vs.length && ls.push(...clicavel(linhaDupla(vs, SIT[k][1], k === 'sem' ? 2.5 : 5, k === 'sem' ? .9 : op), vs)));
      }
      camada = L.layerGroup(ls).addTo(map);
      requestAnimationFrame(desamontoa);
    }
    [selL, realce].forEach(g => g && g.eachLayer(l => l.bringToFront()));
  }
  // trecho tocado no mapa ou na lista: contorno amarelo por cima da camada de limpeza
  window.__onSel = nome => {                              // um trecho ou vários (Ctrl+clique)
    st.sel = nome;
    if (selL) { selL.remove(); selL = null; }
    const nomes = Array.isArray(nome) ? nome : nome ? [nome] : [];
    if (map && nomes.length && st.ligado) {
      const vs = nomes.flatMap(n => vaosDoTrecho[n] || []);
      selL = L.layerGroup(linhaDupla(vs, '#fde047', 4, 1, { dashArray: '1 0' })).addTo(map);
      if (realce) realce.eachLayer(l => l.bringToFront());
    }
  };
  window.__onClasses = () => { desenha(); };
  // etiquetas que se cruzam: fica a mais recente; as outras aparecem ao aproximar o zoom
  function desamontoa() {
    const tags = [...document.querySelectorAll('#map .limp-tag')].sort((a, b) => b.dataset.d.localeCompare(a.dataset.d));
    tags.forEach(t => { t.style.visibility = ''; });
    const ok = [];
    tags.forEach(t => {
      const r = t.getBoundingClientRect();
      if (ok.some(q => r.left < q.right + 2 && r.right > q.left - 2 && r.top < q.bottom + 2 && r.bottom > q.top - 2)) t.style.visibility = 'hidden';
      else ok.push(r);
    });
  }
  if (map) map.on('zoomend', () => { fusiveis(); requestAnimationFrame(desamontoa); });

  function enquadra(vs) {
    if (!map || !vs.length) return;
    const mb = document.querySelector('.mapbox');      // mapa fixo no alto (sticky): já está à vista, a página não pula
    if (celular() && !telaCheia() && getComputedStyle(mb).position !== 'sticky') mb.scrollIntoView({ block: 'start' });
    map.invalidateSize();
    map.fitBounds(L.latLngBounds(vs.flatMap(seg)).pad(0.15), { maxZoom: 16 });
  }
  function focar(k, enquadrar, doPainel) {
    st.foco = st.foco === k ? null : k;
    if (realce) { realce.remove(); realce = null; }
    if (st.foco !== null && map) {
      const vs = vaosDaOs[k], o = LP.os[k];
      const cor = o.data ? corAno(anoDe(o)) : '#fff';
      realce = L.layerGroup([
        L.polyline(vs.map(seg), { color: '#fff', weight: 14, opacity: 1, interactive: false, lineCap: 'round' }),
        L.polyline(vs.map(seg), { color: cor, weight: 8, opacity: 1, interactive: false, lineCap: 'round', dashArray: o.data ? null : grupoDe(o) === 'cri' ? '8 6' : '1 13' }),
      ]).addTo(map);
      st.grupos.add(o.data ? String(anoDe(o)) : grupoDe(o));   // abre a linha do ano (ou do grupo) da OS
      if (enquadrar) enquadra(vs);
    }
    desenha();
    pinta();
    if (!doPainel) rolaPainel(card, st.foco);
  }
  function alternaAno(a) {
    if (a in NEXE) st.nexe.has(a) ? st.nexe.delete(a) : st.nexe.add(a);
    else { a = +a; st.anos.has(a) ? st.anos.delete(a) : st.anos.add(a); }
    desenha(); pinta();
  }

  // legenda (anos clicáveis) e chip da OS em foco, dentro do mapa
  let maplg = null, chip = null;
  if (map && window.L) {
    const mb = document.querySelector('.mapbox');
    maplg = document.createElement('div');
    maplg.className = 'limp-maplg';
    maplg.setAttribute('role', 'group');
    maplg.setAttribute('aria-label', 'Anos de limpeza no mapa');
    chip = document.createElement('div');
    chip.className = 'limp-chip';
    chip.hidden = true;
    mb.append(maplg, chip);
    // os dois são refeitos a cada clique (pinta): o clique não pode seguir até o mapa, que o tomaria por clique fora da rede e desfaria o trecho escolhido
    [maplg, chip].forEach(el => { L.DomEvent.disableClickPropagation(el); L.DomEvent.disableScrollPropagation(el); L.DomEvent.on(el, 'click', L.DomEvent.stopPropagation); });
    maplg.addEventListener('click', e => { const b = e.target.closest('button'); if (b) alternaAno(b.dataset.a); });
    chip.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.v === 'x') return focar(st.foco, false);
      const i = ORDEM.indexOf(st.foco), n = ORDEM.length;
      focar(ORDEM[(i + (b.dataset.v === '+' ? 1 : -1) + n) % n], true);
    });
  }

  // botão "Faixa" no menu Camadas do mapa (extras.js): liga/desliga a limpeza de faixa no mapa; os anos ficam no painel
  const l2 = map && window.__ctlMapa ? window.__ctlMapa() : null;
  let btnFaixa = null;
  if (l2) {
    const c = document.createElement('div');
    c.className = 'ctl-card';
    c.innerHTML = '<button type="button" class="ctl-faixa" aria-pressed="false" title="Mostrar ou esconder a limpeza de faixa no mapa">Faixa</button>';
    l2.append(c);
    btnFaixa = c.querySelector('button');
    btnFaixa.addEventListener('click', () => liga(!st.ligado));
  }
  // liga junto com as outras camadas (com a Inspeção também ligada, ela vira a borda colorida em volta da Faixa)
  function liga(on) {
    st.ligado = on; guarda('limp-ligado', on ? '1' : '0');
    window.__onSel(st.sel);
    desenha(); pinta();
  }

  // ---------- cartão no painel ----------
  const card = document.createElement('section');
  card.className = 'limp-card';
  card.setAttribute('aria-label', 'Limpeza de faixa');
  const legenda = $('legenda');
  if ($('det')) $('det').after(card);                  // logo depois do detalhe do trecho (a lista vem antes, com rolagem própria)
  else (legenda || document.querySelector('.panel').firstChild).before(card);

  function focoHtml(k) {
    const o = LP.os[k];
    const ts = [...new Set(vaosDaOs[k].map(v => D.trechos[v[4]].nome))];
    return `<div class="limp-foco"><span class="q">OS ${esc(o.os_completa)} · ${o.data ? 'executada ' + br(o.data) : grupoDe(o) === 'cri' ? 'criada ' + br(o.criada) : 'pendente (' + esc(o.sit.toLowerCase()) + ') · criada ' + br(o.criada)}</span>
      <span>${esc(o.desc)}</span>
      <span class="limp-nota">No mapa: ${vaosDaOs[k].length ? km(o.m) : 'sem localização'}${o.km_desc ? ` · descrição: ${String(o.km_desc).replace('.', ',')} km` : ''} · ${esc(o.metodo)}${o.al_os && o.al_os !== (D.meta || {}).al ? ` · OS lançada no ${esc(o.al_os)}` : ''}</span>
      ${o.ativos.length ? `<span class="limp-nota">Ativos: ${o.ativos.map(esc).join('; ')}</span>` : ''}
      ${ts.length ? `<span class="limp-nota">Trechos: ${ts.slice(0, 30).map(esc).join(', ')}${ts.length > 30 ? ` e mais ${ts.length - 30}` : ''}</span>` : ''}</div>`;
  }
  const osBtn = (k, comFoco) => {
    const o = LP.os[k], g = grupoDe(o);
    const cor = g ? CINZA : corAno(anoDe(o));
    const quando = !g ? br(o.data) : g === 'cri' ? 'criada ' + br(o.criada) : esc(o.sit.toLowerCase()) + ' · criada ' + br(o.criada);
    return `<button type="button" class="limp-os-b${g ? ' ' + g : ''}" data-k="${k}" style="--c:${cor}" aria-pressed="${st.foco === k}">` +
      `<span class="q">${quando} · OS ${esc(o.os)} · ${vaosDaOs[k].length ? km(o.m) : 'sem localização'}</span>` +
      `<span class="s">${esc(o.desc.slice(0, 110))}${o.desc.length > 110 ? '…' : ''}</span></button>` +
      (comFoco && st.foco === k ? focoHtml(k) : '');
  };
  const plural = (n, um) => `${n} ${um}${n === 1 ? '' : 's'}`;
  // linha de um grupo (ano, criadas, pendentes): a cor liga/desliga no mapa (só na vista por ano); o resto abre as OS
  // logo abaixo (montadas só com o grupo aberto)
  function linha(g, rot, info, cor, ks, opc) {
    const aberto = st.grupos.has(g) && ks.length > 0, id = 'limp-g-' + g;
    const i = `<i${opc.cls ? ` class="${opc.cls}"` : ''} style="--c:${cor}"></i>`;
    return `<div class="limp-ano-l${opc.liga && !opc.on ? ' off' : ''}">` +
      (opc.liga ? `<button type="button" class="liga" data-a="${g}" data-foco="a${g}" aria-pressed="${!!opc.on}" aria-label="${opc.nome} no mapa" title="${opc.liga}">${i}</button>`
        : `<span class="cor" aria-hidden="true">${i}</span>`) +
      `<button type="button" class="abre" data-g="${g}" data-foco="g${g}" aria-expanded="${aberto}" aria-controls="${id}"${ks.length ? '' : ' disabled'}><span>${rot}</span><em>${info}</em></button>` +
      `</div><div class="limp-oss" id="${id}" role="group" aria-label="OS: ${opc.nome}"${aberto ? '' : ' hidden'}>${aberto ? ks.map(k => osBtn(k, true)).join('') : ''}</div>`;
  }

  function pinta() {
    // guarda quem tinha o foco do teclado para devolver depois de refazer o cartão
    const f = document.activeElement;
    const chave = card.contains(f) ? (f.dataset.k !== undefined ? `[data-k="${f.dataset.k}"]` : f.dataset.foco ? `[data-foco="${f.dataset.foco}"]` : null) : null;

    const exec = LP.os.filter(o => o.sit === 'EXECUTADA').length;
    const sub = `${exec} OS executada${exec === 1 ? '' : 's'} · ${km(KM_LIMPO)} de ${km(KM_REDE)}` +
      GRUPOS_NEXE.map(([, x]) => ' · ' + plural(x.ks.length, x.um)).join('');
    const porAno = st.ligado && st.vista === 'ano';
    const linhas = ANOS.map(a => linha(String(a), `<b>${a}</b> · ${OS_ANO[a].length} OS`, km(KM_ANO[a]), corAno(a), OS_ANO[a],
      porAno ? { liga: `Mostrar/esconder ${a} no mapa`, on: st.anos.has(a), nome: String(a) } : { nome: String(a) })).join('') +
      GRUPOS_NEXE.map(([g, x]) => linha(g, `${x.rot} · ${x.ks.length} OS`, km(x.km), CINZA, x.ks,
        porAno ? { liga: `Mostrar/esconder no mapa as OS ${x.rot.toLowerCase()}${x.nota ? ' (' + x.nota + ')' : ''}`, on: st.nexe.has(g), nome: x.rot, cls: x.cls }
          : { nome: x.rot, cls: x.cls })).join('');
    let corpo = '';
    if (porAno && !ANOS.length) corpo = `<p class="limp-nota">Nenhuma OS executada${EQ} caiu neste alimentador.</p>`;
    else if (st.ligado && st.vista === 'sit') {      // vencimento: as situações só informam; os anos seguem embaixo, sem liga/desliga
      corpo = `<div class="limp-bar">${['dia', 'vence', 'vencida', 'sem'].map(k => TOT_SIT[k] ? `<span style="width:${100 * TOT_SIT[k] / KM_REDE}%;background:${SIT[k][1]}"></span>` : '').join('')}</div>
        <div class="limp-anos">${Object.entries(SIT).map(([k, [n, c]]) => `<div class="limp-ano-l fixo"><span class="cor" aria-hidden="true"><i style="--c:${c}"></i></span><span class="rot"><span>${n}</span><em>${km(TOT_SIT[k])}</em></span></div>`).join('')}</div>`;
    }
    if (linhas) corpo += `<div class="limp-anos">${linhas}</div>` +
      (porAno && st.anos.size < ANOS.length ? '<button type="button" class="limp-todos" data-acao="todos" data-foco="todos">Mostrar todos os anos</button>' : '');
    const seg = st.ligado ? `<div class="limp-seg" role="group" aria-label="Pintar o mapa por"><button type="button" data-acao="ano" data-foco="ano" aria-pressed="${st.vista === 'ano'}">Por ano</button><button type="button" data-acao="sit" data-foco="sit" aria-pressed="${st.vista === 'sit'}">Vencimento</button></div>` : '';
    const resto = seg + corpo;
    card.hidden = !st.ligado && !!btnFaixa;               // bloco da Faixa só com ela ligada no mapa
    card.innerHTML = `<div class="limp-top"><h2>Limpeza de faixa<small>${sub}</small></h2></div>
      ${resto}`;
    if (chave) card.querySelector(chave)?.focus({ preventScroll: true });

    if (btnFaixa) btnFaixa.setAttribute('aria-pressed', String(st.ligado));
    if (maplg) {
      maplg.hidden = !st.ligado;
      maplg.innerHTML = '<span class="lg-cab"><b>Faixa</b></span>' + (st.vista === 'ano'
        ? ANOS.map(a => `<button type="button" data-a="${a}" aria-pressed="${st.anos.has(a)}" title="Mostrar/esconder ${a}"><i style="--c:${corAno(a)}"></i><b>${a}</b></button>`).join('') +
          GRUPOS_NEXE.map(([g, x]) => `<button type="button" data-a="${g}" aria-pressed="${st.nexe.has(g)}" title="Mostrar/esconder as OS ${x.rot.toLowerCase()}${x.nota ? ' (' + x.nota + ')' : ''}"><i class="${x.cls}" style="--c:#fff"></i>${x.rot}</button>`).join('') +
          `<span class="lg-info"><i style="--c:${SEMCOR};box-shadow:0 0 0 1px #000"></i>sem registro</span>`
        : Object.values(SIT).map(([n, c]) => `<span><i style="--c:${c}"></i>${n}</span>`).join(''));
    }
    if (chip) {
      chip.hidden = st.foco === null;
      if (st.foco !== null) {
        const o = LP.os[st.foco];
        chip.style.setProperty('--c', o.data ? corAno(anoDe(o)) : CINZA);
        chip.innerHTML = `<button type="button" data-v="-" title="OS anterior" aria-label="OS anterior">‹</button>` +
          `<span title="${esc(o.desc)}">OS ${esc(o.os)} · ${o.data ? br(o.data) : esc(o.sit.toLowerCase())} · ${km(o.m)}</span>` +
          `<button type="button" data-v="+" title="Próxima OS" aria-label="Próxima OS">›</button>` +
          `<button type="button" data-v="x" title="Fechar" aria-label="Fechar OS">✕</button>`;
      }
    }
    det.querySelectorAll('.limp-os-b').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.k === st.foco)));
    if (vistaSelos !== st.vista) { vistaSelos = st.vista; poeSelos(true); }
  }
  card.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.k !== undefined) return focar(+b.dataset.k, true, true);
    if (b.classList.contains('abre')) { const g = b.dataset.g; st.grupos.has(g) ? st.grupos.delete(g) : st.grupos.add(g); return pinta(); }
    if (b.classList.contains('liga') && b.dataset.a) return alternaAno(b.dataset.a);
    const ac = b.dataset.acao;
    if (ac === 'ano' || ac === 'sit') { st.vista = ac; guarda('limp-vista', ac); }
    else if (ac === 'todos') st.anos = new Set(ANOS);
    else return;
    desenha(); pinta();
  });

  // ---------- detalhe do trecho ----------
  function secTrecho(nome) {
    const r = RT[nome], anos = REGRA[r.classe];
    const prox = r.ult ? somaAnos(r.ult, anos) : null;
    const s = sitTrecho(r);
    const ks = r.ks.slice().sort((a, b) => (LP.os[b].data || LP.os[b].criada || '').localeCompare(LP.os[a].data || LP.os[a].criada || ''));
    return `<section class="limp-sec" aria-live="off"><h3>Limpeza de faixa · ${esc(r.classe)} a cada ${anos} anos</h3>
      <div class="limp-bar">${['dia', 'vence', 'vencida', 'sem'].map(k => r.m[k] ? `<span style="width:${100 * r.m[k] / (r.ext || 1)}%;background:${SIT[k][1]}" title="${SIT[k][0]}: ${km(r.m[k])}"></span>` : '').join('')}</div>
      <dl><dt>Situação</dt><dd><b>${SIT[s][0]}</b> · ${['dia', 'vence', 'vencida', 'sem'].filter(k => r.m[k]).map(k => `${SIT[k][0].toLowerCase()} ${km(r.m[k])}`).join(' · ')}</dd>
      <dt>Última</dt><dd>${r.ult ? br(r.ult) + ` · próxima até ${br(iso(prox))}` : 'nenhuma OS executada encontrada neste trecho'}</dd></dl>
      ${ks.map(k => osBtn(k, false)).join('')}</section>`;
  }
  const det = $('det');
  function poeDetalhe() {
    if (det.querySelector('.limp-sec')) return;
    const h2 = det.querySelector('h2');
    if (!h2) return;
    const nome = [...h2.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim();
    if (RT[nome]) det.insertAdjacentHTML('beforeend', secTrecho(nome));
  }
  new MutationObserver(poeDetalhe).observe(det, { childList: true });
  det.addEventListener('click', e => { const b = e.target.closest('.limp-os-b'); if (b) focar(+b.dataset.k, true); });

  // ---------- lista: ano da última limpeza ----------
  const lista = $('lista');
  let vistaSelos = null;
  function poeSelos(refaz) {
    lista.querySelectorAll(refaz ? '.row' : '.row:not([data-limp])').forEach(b => {
      b.dataset.limp = '1';
      const r = RT[b.dataset.t];
      if (!r) return;
      const s = sitTrecho(r);
      let el = b.querySelector('.limp-selo');
      if (!el) { el = document.createElement('span'); b.querySelector('em')?.before(el); }
      el.className = 'limp-selo' + (r.ult ? '' : ' nada');
      el.style.setProperty('--c', r.ult ? (st.vista === 'sit' ? SIT[s][1] : corAno(+r.ult.slice(0, 4))) : 'transparent');
      el.title = `Limpeza de faixa: ${SIT[s][0].toLowerCase()}${r.ult ? ' · última ' + br(r.ult) : ''}`;
      el.textContent = r.ult ? r.ult.slice(0, 4) : 'sem limpeza';
    });
  }
  new MutationObserver(() => poeSelos(false)).observe(lista, { childList: true });

  // ---------- Downloads (em "Dados", extras.js): todas as OS de faixa do alimentador, executadas, criadas e pendentes ----------
  if (window.__baixar && window.__csv && LP.os.length) {
    const C = window.__csv;
    window.__baixar.botao('faixa', 'OS de faixa (Excel)', () => {
      const ks = LP.os.map((o, k) => k).sort((a, b) => (LP.os[b].data || LP.os[b].criada || '').localeCompare(LP.os[a].data || LP.os[a].criada || ''));
      C(`OS_faixa_${C.al}.csv`,
        ['Alimentador', 'OS', 'Situação', 'Execução', 'Criada', 'Equipe', 'Trechos', 'Extensão no mapa (km)', 'Km na descrição',
          'Ativos citados', 'Posição no mapa', 'Alimentador da OS', 'Descrição'],
        ks.map(k => {
          const o = LP.os[k], eq = (o.os_completa || '').replace(o.os, '').trim();
          return [D.meta.al, o.os_completa || o.os, o.sit, C.data(o.data), C.data(o.criada), eq, C.trechos(vaosDaOs[k].map(v => v[5])),
            vaosDaOs[k].length ? C.num(o.m / 1000, 2) : '', C.num(o.km_desc), (o.ativos || []).join(' · '), o.metodo,
            o.al_os && o.al_os !== D.meta.al ? o.al_os : '', o.desc];
        }));
    }, `Planilha (CSV para o Excel) com as ${LP.os.length} OS de limpeza de faixa`);
  }

  poeDetalhe();
  desenha();
  pinta();
})();
