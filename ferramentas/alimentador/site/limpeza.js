// Limpeza de faixa (roda depois de alimentador.js e extras.js, com window.D e window.LIMPEZA).
// Duas vistas no mapa:
//   Por ano  — cada ano de limpeza executada com uma cor; liga/desliga por ano; a rede sem limpeza fica cinza-claro.
//   Situação — pela regra T1 a cada 3 anos, T2 a cada 4, T3 a cada 5 (em dia / vence em 12 meses / vencida).
// No painel: uma linha por ano (a cor liga/desliga no mapa; a linha abre as OS do ano embaixo dela); tocar numa OS mostra e enquadra no mapa onde ela foi (com ‹ › no mapa para a próxima).
// OS não executadas em dois grupos, cada um com liga/desliga e traço próprio no mapa: Criadas (CRIADA, tracejado) e
// Pendentes (A REPROGRAMAR / REPROGRAMADA, pontilhado).
// A posição vem das chaves/ativos citados na OS e dos km da descrição: é aproximada.
// OS parcial (espelho, pagamento parcial, medição): a OS mãe é a primeira criada da obra e descreve o trecho todo; as
// parciais (campo "mae") não pintam vãos, não somam km e não contam como OS: aparecem dentro da mãe. Mãe criada ou
// pendente com parcial executada = obra em andamento.
// Carga (com a montagem em fatias do alimentador.js, window.__al): ao rodar, este script só põe o que é leve (botão e
// legenda no mapa, o bloco no lugar dele no painel); as contas que passam por todos os vãos vêm em passos curtos e, com
// elas, o bloco do painel (a página espera por ele para aparecer); as linhas da Faixa entram no mapa depois das linhas da
// rede, montadas em fatias, e as etiquetas logo depois. Quem mexer na Faixa antes disso (ligar, ano, vista, uma OS, um
// trecho) recebe na hora o que falta. Detalhes no fim do arquivo (carga) e em desenhaAosPoucos().
(function () {
  // Índices dos vãos que as camadas dividem (Faixa, Inspeção, Insp→manut, Manutenção): cada um é montado uma vez, na 1ª
  // vez que alguém pede (antes cada script montava o seu, com todos os vãos, ao carregar)
  const BASE = window.__baseVaos || (window.__baseVaos = (() => {
    let porId = null, doTrecho = null, postes = null;
    return {
      porId() {                                        // id do vão → vão
        if (!porId) { porId = new Map(); for (const v of window.D.vaos) porId.set(String(v[5]), v); }
        return porId;
      },
      doTrecho() {                                     // nome do trecho → vãos dele
        if (!doTrecho) {
          const D = window.D, o = {}, nomes = D.trechos.map(t => t.nome);
          for (const v of D.vaos) { const n = nomes[v[4]]; (o[n] || (o[n] = [])).push(v); }
          doTrecho = o;
        }
        return doTrecho;
      },
      postes() {                                       // nome do trecho → postes dele (pontas dos vãos)
        if (!postes) {
          const D = window.D, o = {}, nomes = D.trechos.map(t => t.nome);
          for (const v of D.vaos) { const n = nomes[v[4]], s = o[n] || (o[n] = new Set()); s.add(v[6]); s.add(v[7]); }
          postes = o;
        }
        return postes;
      },
    };
  })());
  const LP = window.LIMPEZA;
  if (!LP || !window.D) return;
  const AL = window.__al || null;     // montagem em fatias (alimentador.js); sem ela, tudo entra de uma vez, como antes
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const NF1 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });   // criado uma vez: roda milhares de vezes
  const km = m => NF1.format(m / 1000) + ' km';
  const br = d => d ? d.split('-').reverse().join('/') : '—';
  const REGRA = LP.regra_anos;
  // executadas só das equipes da regra (prefixo do número da OS); pendentes aparecem de qualquer equipe
  const EQ = (LP.equipes || []).length ? ' pelas equipes ' + (LP.equipes.every(e => e.startsWith('ETO-RD-'))
    ? 'ETO-RD-' + LP.equipes.map(e => e.slice(7)).join('/') : LP.equipes.join(', ')) : '';
  const HOJE = new Date(); HOJE.setHours(0, 0, 0, 0);
  // data + n anos: são poucas datas (uma por OS) para dezenas de milhares de vãos, então cada conta é feita uma vez (a
  // data devolvida é dividida por quem pede: ninguém a altera)
  const SOMA = new Map();
  const somaAnos = (d, n) => {
    const ch = n + '|' + d;
    let x = SOMA.get(ch);
    if (!x) { x = new Date(d + 'T00:00:00'); x.setFullYear(x.getFullYear() + n); SOMA.set(ch, x); }
    return x;
  };
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
  // sem OS de faixa = situação desconhecida, tratada como pendente (regra aprovada): cor própria, nunca o cinza neutro
  const SEMCOR = '#d946ef';
  const FUNDOCOR = '#cbd5e1';     // vista Por ano: vão sem OS fica neutro no mapa (a cor é do ano da limpeza); na vista Vencimento ele é pendência (SEMCOR)
  const SIT = { dia: ['Em dia', '#22c55e'], vence: ['Vence em até 12 meses', '#facc15'], vencida: ['Vencida', '#ef4444'], sem: ['Sem registro (pendente)', SEMCOR] };
  const PIOR = ['vencida', 'sem', 'vence', 'dia'];      // ordem de gravidade
  const CURTO = { dia: 'em dia', vence: 'vence', vencida: 'vencida', sem: 'sem registro' };
  // a base de OS de faixa quase não tem registro antes de 2022 (31 OS no estado de 2016 a 2021): o "sem registro" vem daí
  const BASE_DESDE = LP.desde || '2022';
  const kmm = m => m < 1000 ? Math.round(m) + ' m' : km(m);   // pedaço pequeno do trecho em metros (não vira "0,0 km")
  const pct = (m, t) => t ? Math.round(100 * m / t).toLocaleString('pt-BR') + '%' : '—';
  const km1 = m => NF1.format(m / 1000);   // sem a unidade: "0,2 de 35,7 km"
  const DAQUI_A_1_ANO = new Date(HOJE); DAQUI_A_1_ANO.setFullYear(DAQUI_A_1_ANO.getFullYear() + 1);
  const SITU = new Map();                               // situação por data e classe (a mesma conta para milhares de vãos)
  function situacao(data, classe) {
    if (!data) return 'sem';
    const ch = classe + '|' + data;
    let s = SITU.get(ch);
    if (!s) {
      const v = somaAnos(data, REGRA[classe]);
      s = v < HOJE ? 'vencida' : v < DAQUI_A_1_ANO ? 'vence' : 'dia';
      SITU.set(ch, s);
    }
    return s;
  }

  // ---------- dados ----------
  // Leves (só as OS: dezenas ou centenas), na hora.
  // parciais por mãe; mãe não executada com parcial executada = em andamento
  const FILHAS = {};
  LP.os.forEach((o, k) => { if (o.mae) (FILHAS[o.mae] = FILHAS[o.mae] || []).push(k); });
  const filhasDe = o => FILHAS[o.os_completa] || [];
  const parcs = (n, pre = '') => n === 1 ? `1 ${pre}parcial` : `${n} ${pre}parciais`;
  const andamento = o => o.sit !== 'EXECUTADA' && filhasDe(o).some(k => LP.os[k].sit === 'EXECUTADA');
  const PRIN = LP.os.map((o, k) => k).filter(k => !LP.os[k].mae);   // as OS que contam (sem as parciais)
  const anoDe = o => o.data ? +o.data.slice(0, 4) : null;
  const ANOS = [...new Set(PRIN.map(k => anoDe(LP.os[k])).filter(Boolean))].sort((a, b) => b - a);
  const OS_ANO = Object.fromEntries(ANOS.map(a => [a, PRIN.filter(k => anoDe(LP.os[k]) === a)
    .sort((x, y) => LP.os[y].data.localeCompare(LP.os[x].data))]));
  // não executadas: Criadas (CRIADA) e Pendentes (A REPROGRAMAR / REPROGRAMADA e qualquer outra situação não executada)
  const grupoDe = o => o.sit === 'EXECUTADA' ? null : o.sit === 'CRIADA' ? 'cri' : 'pend';
  const CINZA = '#9ca3af';
  const NEXE = {
    cri: { rot: 'Criadas', um: 'criada', cls: 'trac', nota: '' },
    pend: { rot: 'Pendentes', um: 'pendente', cls: 'pont', nota: 'a reprogramar / reprogramada' },
  };
  Object.entries(NEXE).forEach(([g, x]) => { x.ks = PRIN.filter(k => grupoDe(LP.os[k]) === g); x.vaos = []; x.km = 0; });
  const GRUPOS_NEXE = Object.entries(NEXE).filter(([, x]) => x.ks.length);

  // Pesados (passam pelos vãos: dezenas de milhares num alimentador grande): em PASSOS curtos. Na carga, um por fatia, sem
  // segurar os scripts seguintes nem o mapa (monta(), no fim do arquivo); quem precisa deles antes (toque na Faixa, numa
  // OS, num trecho) chama dados(), que faz na hora os que faltam.
  let CL = null;                                        // classe de cada trecho, pelo índice dele (o vão guarda o índice: v[4])
  const vaosDaOs = LP.os.map(() => []);
  // vão com OS: as OS dele e a data da execução mais recente; os outros (a maioria) dividem o VAZIO
  const VAZIO = { ks: [], ult: null }, POR_VAO = new Map();
  const porVao = v => POR_VAO.get(String(v[5])) || VAZIO;
  const uniao = ks => { const s = new Set(); ks.forEach(k => vaosDaOs[k].forEach(v => s.add(v))); return [...s]; };
  const somaM = vs => vs.reduce((m, v) => m + v[8], 0);
  let VAOS_ANO = {}, KM_ANO = {}, KM_LIMPO = 0, KM_REDE = 0, ORDEM = [];
  const TOT_SIT = { dia: 0, vence: 0, vencida: 0, sem: 0 };
  const PASSOS = [
    () => { CL = D.trechos.map(t => classeDe(t.nome)); BASE.porId(); },
    () => {                                             // as OS de cada vão e os vãos de cada OS
      const vaoPorId = BASE.porId();
      Object.keys(LP.vaos).forEach(id => {
        const ks = LP.vaos[id], v = vaoPorId.get(id);
        let ult = null;
        ks.forEach(k => {
          const d = LP.os[k].data;
          if (d && (ult === null || d > ult)) ult = d;
          if (v) vaosDaOs[k].push(v);
        });
        POR_VAO.set(id, { ks, ult });
      });
    },
    () => {
      // extensão do alimentador por situação: a soma de cada trecho (os vãos na ordem deles, como em resumoTrecho) e, dessas,
      // a do alimentador, trecho a trecho. É a mesma conta de somar os resumos de todos os trechos, sem montar os ~2.000
      // resumos na carga (cada um é feito quando a lista, o detalhe ou uma etiqueta pede: resumo())
      const n = D.trechos.length, lugar = Object.create(null), dono = new Array(n);   // dono: o 1º trecho com aquele nome
      D.trechos.forEach((t, i) => { if (!(t.nome in lugar)) lugar[t.nome] = i; dono[i] = lugar[t.nome]; });
      const S = { dia: new Float64Array(n), vence: new Float64Array(n), vencida: new Float64Array(n), sem: new Float64Array(n) };
      for (const v of D.vaos) { const i = dono[v[4]], p = porVao(v); S[p === VAZIO ? 'sem' : situacao(p.ult, CL[i])][i] += v[8]; }
      for (const nome in lugar) { const i = lugar[nome]; for (const k in TOT_SIT) TOT_SIT[k] += S[k][i]; }
    },
    () => {
      VAOS_ANO = Object.fromEntries(ANOS.map(a => [a, uniao(OS_ANO[a])]));
      KM_ANO = Object.fromEntries(ANOS.map(a => [a, somaM(VAOS_ANO[a])]));
      Object.values(NEXE).forEach(x => { x.vaos = uniao(x.ks); x.km = somaM(x.vaos); });
      KM_LIMPO = somaM(uniao(LP.os.map((o, k) => k).filter(k => LP.os[k].data)));
      KM_REDE = somaM(D.vaos);
      ORDEM = [...ANOS.flatMap(a => OS_ANO[a]), ...NEXE.cri.ks, ...NEXE.pend.ks].filter(k => vaosDaOs[k].length); // ‹ › no mapa
    },
  ];
  let passo = 0;
  const dados = () => { while (passo < PASSOS.length) PASSOS[passo++](); };

  function resumoTrecho(nome) {
    const vs = BASE.doTrecho()[nome] || [], classe = classeDe(nome);
    const m = { dia: 0, vence: 0, vencida: 0, sem: 0 }, ks = new Set();
    let ult = null, ven = null, ext = 0;
    for (const v of vs) {
      const p = porVao(v);
      ext += v[8];
      if (p === VAZIO) { m.sem += v[8]; continue; }       // sem OS (a maioria): só soma a extensão
      m[situacao(p.ult, classe)] += v[8];
      for (const k of p.ks) ks.add(k);
      if (p.ult && (!ult || p.ult > ult)) ult = p.ult;
      // próxima: o vencimento MAIS CEDO entre os vãos com OS (a OS mais recente não cobre o trecho todo)
      if (p.ult) { const x = somaAnos(p.ult, REGRA[classe]); if (!ven || x < ven) ven = x; }
    }
    return { m, ext, ult, ven, limpo: ext - m.sem, ks: [...ks], classe };
  }
  // resumo de um trecho (undefined se o nome não é de trecho), feito na 1ª vez que alguém pede; conta com os dados()
  const RT = {};
  let NOMES = null;
  const resumo = nome => RT[nome] || ((NOMES || (NOMES = new Set(D.trechos.map(t => t.nome)))).has(nome) ? (RT[nome] = resumoTrecho(nome)) : undefined);
  // situação do trecho: a PIOR entre as que têm extensão relevante (mais de 10% do trecho ou mais de 300 m)
  const relevante = (r, k) => r.m[k] > 300 || r.m[k] > 0.1 * r.ext;
  const sitTrecho = r => PIOR.find(k => r.m[k] && relevante(r, k)) || PIOR.find(k => r.m[k]) || 'sem';

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
.limp-pend{margin:0;font-size:var(--t-sm);line-height:1.45;font-variant-numeric:tabular-nums}
.limp-sec dd small{color:var(--muted)}
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
body.limp-on #map.longe .leaflet-marker-icon:has(>.at,>.lb:not(.sel)){display:none}   /* fora do Tab e fora da conta de cada quadro do zoom (~300 rótulos) */
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
  // vãos seguidos numa linha só (alimentador.js): menos pontos para o mapa refazer a cada zoom
  const linhaDe = window.__cadeias || (vs => vs.map(seg));
  let camada = null, realce = null, selL = null, fundoCache = null;
  // Filtro de município (lupa-painel.js: __munFora, __munSel). O 1º desenho, na carga, usa o que valia quando este script
  // rodou (munDaCarga): a Faixa entrava no mapa nessa hora, antes de o lupa-painel.js ler o município da URL (?m=), e só
  // passava a segui-lo no desenho seguinte (classe, ano ou município trocados). Continua assim.
  let munDaCarga = null;
  const munFora = () => munDaCarga ? munDaCarga.fora : window.__munFora;
  const munSel = () => (munDaCarga ? munDaCarga.sel : window.__munSel) || '';
  // classe à vista (T1/T2/T3) e, com o filtro de município, só os trechos do município
  const vis = v => { const fora = munFora(); return (!window.__visivel || window.__visivel[CL[v[4]]]) && !(fora && fora(D.trechos[v[4]].nome)); };
  // Contorno escuro e cor numa camada só do canvas (eram duas linhas com os mesmos pontos, uma por cima da outra): o mapa
  // projeta, recorta e simplifica os pontos uma vez para os dois traços, na carga e a cada zoom. O desenho é o mesmo: o
  // contorno e, logo por cima, a cor, no lugar que as duas tinham na ordem do canvas; o toque vale pela linha da cor.
  const Dupla = map && window.L && L.Canvas && map.options.renderer instanceof L.Canvas && L.Polyline.extend({
    _updatePath() {
      const r = this._renderer, cor = this.options;
      this.options = this._contorno;
      try { r._updatePoly(this); } finally { this.options = cor; }
      r._updatePoly(this);
    },
    // a caixa de redesenho é a que as duas linhas somavam: a do contorno (2 px a mais de cada lado) e os 4 px que ele pedia além dela
    _updateBounds() {
      const w = this._clickTolerance() + 6, p = new L.Point(w, w);
      if (this._rawPxBounds) this._pxBounds = new L.Bounds([this._rawPxBounds.min.subtract(p), this._rawPxBounds.max.add(p)]);
    },
  });
  function linhaDupla(vs, cor, peso, opacidade, extra) {
    // contorno escuro por baixo: a cor aparece igual sobre mata escura ou solo claro
    const ls = linhaDe(vs);
    const contorno = { color: '#0b0f14', weight: peso + 4, opacity: .75 * opacidade, interactive: false, lineCap: 'round' };
    const dentro = Object.assign({ color: cor, weight: peso, opacity: opacidade, interactive: false, lineCap: 'round' }, extra);
    if (!Dupla) return [L.polyline(ls, contorno), L.polyline(ls, dentro)];   // sem canvas (SVG): as duas linhas, como antes
    const l = new Dupla(ls, dentro);
    l._contorno = Object.assign({ stroke: true, fill: false, lineJoin: 'round' }, contorno);
    return [l];
  }
  window.__linhaDupla = linhaDupla;                     // inspecao.js desenha a rede inspecionada com a mesma linha
  // As linhas ficam guardadas enquanto o filtro (classes à vista, município) não muda: a cinza da rede inteira (fundo), a de
  // cada ano e as das situações. Ligar a Faixa de novo, tirar ou pôr um ano e trocar de vista reaproveitam as que já
  // existem (com os pontos já projetados), e a carga pode montá-las antes da hora de entrar no mapa (adianta())
  const filtro = () => JSON.stringify(window.__visivel || {}) + munSel();
  const anoCache = {}, sitCache = {};                   // por ano e opacidade (com uma OS em foco as linhas ficam apagadas); por opacidade
  function fundo() {
    const chave = filtro();
    if (!fundoCache || fundoCache.chave !== chave) {
      const vs = D.vaos.filter(vis);
      fundoCache = { chave, ls: clicavel(linhaDupla(vs, FUNDOCOR, 2.5, .9), vs) };   // sem OS: neutro e fino, para os anos aparecerem
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
    const ks = porVao(v).ks.slice().sort((a, b) => (LP.os[b].data || '9' + LP.os[b].criada).localeCompare(LP.os[a].data || '9' + LP.os[a].criada));
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
        : '<div class="nada">Sem registro de limpeza aqui: situação desconhecida, tratar como pendente</div>') +
      nexe.map(k => linha(k)).join('') + '</div>' +
      (window.__balaoInsp ? window.__balaoInsp(v) : '');   // Inspeção também ligada: as inspeções do vão no mesmo balão
    L.popup({ className: 'limp-popup', maxWidth: 300, autoPanPadding: [20, 20], autoPanPaddingTopLeft: window.__folgaBalao ? window.__folgaBalao() : [20, 20] }).setLatLng(e.latlng).setContent(html).openOn(map);
  }
  if (map) map.getContainer().addEventListener('click', e => {
    const a = e.target.closest('.limp-pop a[data-k]');
    if (a) { e.preventDefault(); map.closePopup(); focar(+a.dataset.k, false); }
  });
  const clicavel = (ls, vs) => { const l = ls[ls.length - 1]; l.options.interactive = true; l.on('click', e => balao(e, vs)); return ls; };

  // etiqueta com a data em cada OS executada visível (no meio do caminho dela). Os marcadores vão para `saida`; a função
  // devolve a vez (yield) a cada OS, para quem monta em fatias (1ª vez); quem quer tudo na hora só corre até o fim
  function* etiquetas(saida) {
    const ms = [], usados = new Map(), ligados = ANOS.filter(a => st.anos.has(a));
    // ano que aparece por cima em cada vão (o mais recente entre os anos ligados)
    const topo = new Map();
    ligados.forEach(a => VAOS_ANO[a].forEach(v => { const t = topo.get(v[5]); if (!t || a > t) topo.set(v[5], a); }));
    for (const a of ligados) for (const k of OS_ANO[a]) {
      yield;
      // etiqueta só onde a cor que aparece é a do ano dela (se foi toda limpa de novo depois, o balão mostra o histórico)
      const vs = vaosDaOs[k].filter(v => vis(v) && topo.get(v[5]) === a);
      if (!vs.length) continue;
      const lat = vs.reduce((s, v) => s + v[0], 0) / vs.length, lon = vs.reduce((s, v) => s + v[1], 0) / vs.length;
      const v = maisPerto(vs, L.latLng(lat, lon));
      const id = v[5];
      if (usados.has(id)) { usados.get(id).push(k); continue; }   // mesma área: junta as datas numa etiqueta só
      usados.set(id, [k]);
      ms.push([v, usados.get(id)]);
    }
    for (const [v, ks] of ms) {
      yield;
      const o = LP.os[ks[0]];
      const txt = ks.map(k => br(LP.os[k].data)).join(' · ');
      // trecho com mais metros da OS (é onde ela "está")
      const mt = {};
      vaosDaOs[ks[0]].forEach(x => { const n = D.trechos[x[4]].nome; mt[n] = (mt[n] || 0) + x[8]; });
      // prefere os troncos/ramais (T1, T2…) por onde a OS passa; senão, o ramal de fusível com mais metros
      const nomes = Object.entries(mt).sort((a, b) => b[1] - a[1]).map(e => e[0]);
      const tronco = nomes.filter(n => classeDe(n) !== 'T3');
      const ns = tronco.length ? tronco.slice(0, 2) : nomes.slice(0, 1), tr = ns.join(' / ');
      // a parte limpa dos trechos da etiqueta ("0,2 de 35,7 km"): uma OS curta não pode parecer o trecho inteiro limpo
      const doTr = new Set(ns), feito = somaM(uniao(ks).filter(x => doTr.has(D.trechos[x[4]].nome)));
      const total = ns.reduce((s, n) => s + resumo(n).ext, 0);
      saida.push(L.marker([(v[0] + v[2]) / 2, (v[1] + v[3]) / 2], {
        zIndexOffset: 1000, interactive: false, keyboard: false,     // não cobre o clique na rede (o balão da linha mostra a OS)
        icon: L.divIcon({ className: '', iconSize: null, html: `<div class="limp-tag" data-d="${esc(o.data)}" style="--c:${corAno(anoDe(o))}"><em>${esc(tr)}</em>${txt}<small>${ks.length > 1 ? ks.length + ' OS · ' : ''}${km1(feito)} de ${km(total)}</small></div>` }),
      }).on('click', e => { L.DomEvent.stopPropagation(e); focar(ks[0], true); }));
    }
  }
  const comEtiquetas = () => st.vista === 'ano' && st.foco === null;

  // as linhas da camada, de baixo para cima, em `ls`; devolve a vez (yield) entre uma e outra, como etiquetas()
  function* linhas(ls) {
    const op = st.foco === null ? 1 : .35;
    if (st.vista === 'ano') {
      ls.push(...fundo());
      yield;
      for (const a of ANOS.slice().reverse()) {             // o ano mais recente fica por cima
        if (!st.anos.has(a)) continue;
        const k = a + '|' + op, chave = filtro();           // (a chave é lida junto com o filtro: entre um ano e outro a vez pode ter voltado ao navegador)
        if (!anoCache[k] || anoCache[k].chave !== chave) {
          const vs = VAOS_ANO[a].filter(vis);
          anoCache[k] = { chave, ls: vs.length ? clicavel(linhaDupla(vs, corAno(a), 5, op), vs) : [] };
        }
        ls.push(...anoCache[k].ls);
        yield;
      }
      // não executadas por cima dos anos (ligadas pelo usuário): criadas tracejado branco, pendentes pontilhado branco com borda
      if (st.nexe.has('cri')) {
        const vs = NEXE.cri.vaos.filter(vis);
        if (vs.length) ls.push(L.polyline(linhaDe(vs), { color: '#fff', weight: 4, dashArray: '6 7', opacity: op, interactive: false }));
      }
      if (st.nexe.has('pend')) {
        const vs = NEXE.pend.vaos.filter(vis);
        if (vs.length) ls.push(L.polyline(linhaDe(vs), { color: '#0b0f14', weight: 9, dashArray: '1 11', lineCap: 'round', opacity: .8 * op, interactive: false }),
          L.polyline(linhaDe(vs), { color: '#fff', weight: 6, dashArray: '1 11', lineCap: 'round', opacity: op, interactive: false }));
      }
    } else {
      const chave = filtro();
      if (!sitCache[op] || sitCache[op].chave !== chave) {
        const g = { sem: [], vencida: [], vence: [], dia: [] }, feitas = [];
        D.vaos.filter(vis).forEach(v => g[situacao(porVao(v).ult, CL[v[4]])].push(v));   // os vãos de cada situação são separados agora, com o filtro da chave
        for (const [k, vs] of Object.entries(g)) {
          yield;
          if (vs.length) feitas.push(...clicavel(linhaDupla(vs, SIT[k][1], k === 'sem' ? 4 : 5, op), vs));
        }
        sitCache[op] = { chave, ls: feitas };
      }
      ls.push(...sitCache[op].ls);
    }
  }
  const corre = g => { while (!g.next().done); };
  const frente = () => [selL, realce].forEach(g => g && g.eachLayer(l => l.bringToFront()));
  // `desenho` conta os desenhos pedidos: a montagem em fatias da 1ª vez para se alguém pede outro no meio dela. `primeiro`:
  // 'espera' enquanto as linhas da Faixa aguardam as da rede, 'monta' durante a montagem em fatias, null depois
  let desenho = 0, primeiro = null;
  function desenha() {
    if (!map) return;
    desenho++; primeiro = null; munDaCarga = null;
    if (camada) camada.remove();
    camada = null;
    document.body.classList.toggle('limp-on', st.ligado);
    fusiveis();
    if (st.ligado) {
      dados();
      const ls = [];
      corre(linhas(ls));
      if (comEtiquetas()) corre(etiquetas(ls));
      // As camadas entram no mapa uma a uma, na ordem da lista (de baixo para cima). O grupo criado já com elas as punha
      // na ordem em que foram criadas (o número de cada uma), e as linhas guardadas são reaproveitadas fora dessa ordem:
      // um ano religado depois de uma troca de classe ou de município ficava por cima dos mais recentes, ou por baixo de tudo
      camada = L.layerGroup().addTo(map);
      for (const l of ls) camada.addLayer(l);
      pedeEtiquetas();
      nomesDepois(ls);
    } else if (devoNomes !== null) {                     // Faixa desligada antes de o desenho da carga acabar: o aviso dos nomes não sairia mais
      avisaNomes();                                      // (devoNomes fica: AL.rede, na carga, avisa de novo quando os rótulos da rede entrarem)
    }
    frente();
  }
  // Os nomes dos municípios (municipios.js) desviam das etiquetas e são escolhidos quando a página acaba de carregar,
  // quando as etiquetas já estavam no mapa; agora elas chegam depois. O aviso é o evento do mapa que ele escuta para
  // refazer os nomes ('resize': só ele e os pontinhos do modo Limpeza de faixa o ouvem): os nomes ficam onde ficavam.
  // `devoNomes`: o aviso da carga ainda não saiu (vale o filtro com que as etiquetas da carga seriam postas). Quem mexe
  // na Faixa ou nas classes antes do 1º desenho em fatias recebe o desenho na hora (desenha()); cada um desses desenhos
  // com etiquetas refaz os nomes, até um deles sair com as etiquetas da carga (todos os anos, o mesmo filtro)
  let devoNomes = null;
  const avisaNomes = () => { const t = map.getSize(); map.fire('resize', { oldSize: t, newSize: t }); };
  function nomesDepois(ls) {
    if (devoNomes === null || !comEtiquetas() || !ls.some(l => l instanceof L.Marker)) return;
    if (st.anos.size === ANOS.length && filtro() === devoNomes) devoNomes = null;
    avisaNomes();
  }
  // 1ª vez (carga), com as linhas da rede já todas no mapa: as linhas da Faixa são montadas fora dele, em fatias (a 1ª
  // projeção dos pontos incluída; quase tudo já vem pronto de adianta()), e entram em dois quadros: a 1ª (a maior: a rede inteira em cinza, ou a maior situação)
  // e, no quadro seguinte, as outras. As linhas da rede não esperam por elas nem são redesenhadas no fim. As etiquetas vêm
  // em seguida, montadas do mesmo jeito e postas todas juntas
  async function desenhaAosPoucos() {
    const meu = ++desenho, vale = () => meu === desenho;
    const fatia = async g => { for (;;) { if (g.next().done) return true; if (AL.cheia()) { await AL.cede(); if (!vale()) return false; } } };
    primeiro = 'monta';
    const ls = [];
    if (!await fatia(linhas(ls)) || !await fatia(aquece(ls))) return;
    await AL.cede();                                    // a entrada num quadro só dela (a última fatia das linhas da rede acabou de rodar)
    if (!vale()) return;
    camada = L.layerGroup().addTo(map);
    entra(ls.slice(0, 1));
    if (ls.length > 1) { await AL.cede(); if (!vale()) return; entra(ls.slice(1)); }
    primeiro = null;                                    // (o contorno do trecho escolhido antes disto já subiu para cima dela, em entra())
    if (!comEtiquetas()) { munDaCarga = null; devoNomes = null; return; }
    await AL.cede();
    const ms = [];
    if (!vale() || !await fatia(etiquetas(ms))) return;
    munDaCarga = null;
    ms.forEach(m => camada.addLayer(m));
    pedeEtiquetas();
    devoNomes = null;
    if (ms.length) avisaNomes();                        // os nomes dos municípios desviam das etiquetas (ver nomesDepois)
  }
  // Enquanto as linhas da rede ainda entram no mapa, a carga adianta a parte pesada das da Faixa: monta as linhas (ficam
  // guardadas) e faz a 1ª projeção dos pontos delas, em fatias. Quando as da rede acabam, o 1º desenho só as põe no mapa.
  // Se o filtro ou a vista mudarem no caminho, o desenho monta de novo o que mudou
  async function adianta() {
    await AL.cede();
    if (primeiro !== 'espera') return;
    const ls = [];
    for (const g of [linhas(ls), aquece(ls)]) for (;;) {
      if (g.next().done) break;
      if (AL.cheia()) { await AL.cede(); if (primeiro !== 'espera') return; }
    }
  }
  // Toque na rede com a Faixa ainda por entrar no mapa (carga): ela entra na hora, antes de o mapa procurar a linha
  // tocada (este ouvinte vem antes do ouvinte do canvas). O toque cai na linha da Faixa, que fica por cima da linha da
  // rede: escolhe o trecho do vão mais perto e abre o balão com as datas, como sempre. Soltar o mapa depois de um arrasto
  // também manda um clique, que o mapa ignora: aí nada muda
  if (map) map.getContainer().addEventListener('click', e => {
    const ren = map.options.renderer;
    if (primeiro !== null && st.ligado && ren && e.target === ren._container && !map._draggableMoved(map)) desenha();
  }, true);
  // Entrada de linhas da Faixa no mapa na 1ª vez. Lugar na ordem do canvas: o que a Faixa tinha quando era desenhada assim
  // que este script rodava e de novo a cada troca de classe ou município (desenha()). Ficam embaixo dela: o que estava no
  // mapa nessa hora (até o `marco`), as linhas da rede (as que chegam depois entram junto das outras) e os pontos dos
  // fusíveis que nunca saíram do mapa (mapa aberto já de perto). Fica em cima dela, na ordem em que chegou: o contorno do
  // trecho escolhido e tudo o que entrou depois (pontos dos fusíveis que voltaram ao aproximar, ativos de perto, destaque
  // da busca). Se nada precisou subir e o canvas está em dia (nenhum redesenho pedido, nenhum zoom em curso), as linhas
  // novas, que são as últimas da ordem, são só pintadas por cima do que já está nele: a mesma imagem de limpar e
  // redesenhar tudo, sem desenhar a rede de novo
  let fusFicou = false;                                 // os pontos dos fusíveis estavam no mapa quando este script rodou e não saíram desde então
  let marco = null, selNoMarco = null;                  // última camada do canvas na hora em que a Faixa seria desenhada, e o contorno do trecho que havia
  function poeMarco() {
    if (!Dupla) return;
    const doSel = new Set(selL ? selL.getLayers() : []);
    let o = map.options.renderer._drawLast;
    while (o && doSel.has(o.layer)) o = o.prev;
    marco = o ? o.layer : null;
    selNoMarco = selL;
  }
  function entra(ls) {
    const ren = map.options.renderer, ctx = Dupla && ren._ctx;
    const emDia = !!ctx && !ren._redrawRequest && !map._animatingZoom;
    ls.forEach(l => camada.addLayer(l));
    if (!ctx) return;
    const minhas = new Set(camada.getLayers());
    let ancora = null;
    for (let o = ren._drawFirst; o; o = o.next) { const l = o.layer; if (l === marco || (l._al && (fusFicou || !(l instanceof L.CircleMarker)))) ancora = o; }
    let sobem = [], alheias = [];
    for (let o = ancora ? ancora.next : null; o; o = o.next) {
      if (minhas.has(o.layer)) { sobem.push(...alheias); alheias = []; } else alheias.push(o.layer);
    }
    // o contorno do trecho que já estava escolhido no marco vem logo acima da Faixa (desenha() o punha ali), antes do resto
    if (selNoMarco && selNoMarco === selL) {
      const doSel = selL.getLayers().filter(l => l._order);
      sobem = doSel.concat(sobem.filter(l => !doSel.includes(l)));
    }
    sobem.forEach(l => l.bringToFront());
    if (!emDia || sobem.length || !ren._redrawRequest) return;
    L.Util.cancelAnimFrame(ren._redrawRequest);           // o redesenho que a entrada destas linhas pediu
    ren._redrawRequest = null; ren._redrawBounds = null;
    ctx.save();
    ren._drawing = true;
    try { for (const l of ls) if (l._map) l._updatePath(); } finally { ren._drawing = false; ctx.restore(); }
  }
  // a parte cara da 1ª projeção de cada ponto (a que o alimentador.js guarda no próprio ponto, _alProj) feita antes de a
  // linha entrar no mapa, alguns pedaços por vez: quando ela entra, sobra pouco a fazer
  function* aquece(ls) {
    const P = L.Polyline.prototype;
    if (!P._alProj) return;
    const falso = { _map: map }, caixa = new L.Bounds(), LOTE = 1500;
    for (const l of ls) {
      if (!(l instanceof L.Polyline) || l._quente) continue;
      l._quente = true;
      const lls = l.getLatLngs(), partes = lls[0] instanceof L.LatLng ? [lls] : lls;
      let lote = [];                                    // pontos de várias partes seguidas, projetados de uma vez
      for (let i = 0; i < partes.length; i++) {
        for (const p of partes[i]) lote.push(p);
        if (lote.length < LOTE && i < partes.length - 1) continue;
        try { P._projectLatlngs.call(falso, lote, [], caixa); } catch (e) { return; }   // é só adiantar a conta: sem isso a linha entra do mesmo jeito
        lote = [];
        yield;
      }
    }
  }
  // trecho tocado no mapa ou na lista: contorno amarelo por cima da camada de limpeza
  window.__onSel = nome => {                              // um trecho ou vários (Ctrl+clique)
    st.sel = nome;
    if (selL) { selL.remove(); selL = null; }
    const nomes = Array.isArray(nome) ? nome : nome ? [nome] : [];
    if (map && nomes.length && st.ligado) {
      const doTrecho = BASE.doTrecho(), vs = nomes.flatMap(n => doTrecho[n] || []);
      selL = L.layerGroup(linhaDupla(vs, '#fde047', 4, 1, { dashArray: '1 0' })).addTo(map);
      if (realce) realce.eachLayer(l => l.bringToFront());
    }
  };
  // classes T1 T2 T3 ou município trocados: refaz a camada (antes de ela entrar no mapa, na carga, não há o que refazer:
  // ela já entra com o filtro da hora; só os pontos dos fusíveis seguem o T3)
  window.__onClasses = () => { munDaCarga = null; if (primeiro === 'espera') { fusiveis(); poeMarco(); if (devoNomes !== null) devoNomes = filtro(); } else desenha(); };
  // etiquetas que se cruzam: fica a mais recente; as outras aparecem ao aproximar o zoom. Mede todas e só depois esconde
  // ou mostra (medir no meio das trocas fazia o navegador refazer a conta da página a cada etiqueta); vários pedidos no
  // mesmo quadro (zoom seguido de zoom, desenho seguido de zoom) viram uma passada só
  function desamontoa() {
    const tags = [...document.querySelectorAll('#map .limp-tag')].sort((a, b) => b.dataset.d.localeCompare(a.dataset.d));
    const rs = tags.map(t => t.getBoundingClientRect()), ok = [];
    const some = rs.map(r => {
      if (ok.some(q => r.left < q.right + 2 && r.right > q.left - 2 && r.top < q.bottom + 2 && r.bottom > q.top - 2)) return 'hidden';
      ok.push(r);
      return '';
    });
    tags.forEach((t, i) => { if (t.style.visibility !== some[i]) t.style.visibility = some[i]; });
  }
  let quadroEtiquetas = 0;
  const pedeEtiquetas = () => { if (!quadroEtiquetas) quadroEtiquetas = requestAnimationFrame(() => { quadroEtiquetas = 0; desamontoa(); }); };
  if (map) map.on('zoomend', () => {
    const ren = map.options.renderer, canvas = !!(window.L && L.Canvas && ren instanceof L.Canvas), pedido = canvas && ren._redrawRequest;
    fusiveis();
    // Os pontos dos fusíveis entraram ou saíram (zoom 14): cada um pede um redesenho do canvas para o quadro seguinte, mas o
    // fim do zoom (o moveend, que vem logo depois deste zoomend) já redesenha o canvas inteiro, com eles ou sem eles. O
    // pedido que nasceu aqui é desfeito: era o mesmo desenho feito duas vezes em quadros seguidos
    if (canvas && !pedido && ren._redrawRequest && !map._animatingZoom) { L.Util.cancelAnimFrame(ren._redrawRequest); ren._redrawRequest = null; }
    pedeEtiquetas();
  });

  function enquadra(vs) {
    if (!map || !vs.length) return;
    const mb = document.querySelector('.mapbox');      // mapa fixo no alto (sticky): já está à vista, a página não pula
    if (celular() && !telaCheia() && getComputedStyle(mb).position !== 'sticky') mb.scrollIntoView({ block: 'start' });
    map.invalidateSize();
    map.fitBounds(L.latLngBounds(vs.flatMap(seg)).pad(0.15), { maxZoom: 16 });
  }
  function focar(k, enquadrar, doPainel) {
    dados();
    st.foco = st.foco === k ? null : k;
    if (realce) { realce.remove(); realce = null; }
    if (st.foco !== null && map) {
      const vs = vaosDaOs[k], o = LP.os[k];
      const cor = o.data ? corAno(anoDe(o)) : '#fff';
      realce = L.layerGroup([
        L.polyline(linhaDe(vs), { color: '#fff', weight: 14, opacity: 1, interactive: false, lineCap: 'round' }),
        L.polyline(linhaDe(vs), { color: cor, weight: 8, opacity: 1, interactive: false, lineCap: 'round', dashArray: o.data ? null : grupoDe(o) === 'cri' ? '8 6' : '1 13' }),
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
    return `<div class="limp-foco"><span class="q">OS ${esc(o.os_completa)} · ${o.data ? 'executada ' + br(o.data) : grupoDe(o) === 'cri' ? 'criada ' + br(o.criada) : 'pendente (' + esc(o.sit.toLowerCase()) + ') · criada ' + br(o.criada)}${andamento(o) ? ' · <b>em andamento</b>' : ''}</span>
      <span>${esc(o.desc)}</span>
      <span class="limp-nota">No mapa: ${vaosDaOs[k].length ? kmm(o.m) : 'sem localização'}${o.km_desc ? ` · descrição: ${String(o.km_desc).replace('.', ',')} km` : ''} · ${esc(o.metodo)}${o.al_os && o.al_os !== (D.meta || {}).al ? ` · OS lançada no ${esc(o.al_os)}` : ''}</span>
      ${filhasDe(o).length ? `<span class="limp-nota">${parcs(filhasDe(o).length, 'OS ')} (o km conta só o da mãe): ${filhasDe(o).map(k => { const f = LP.os[k]; return `${esc(f.os_completa)} ${f.data ? 'executada ' + br(f.data) : esc(f.sit.toLowerCase()) + ' · criada ' + br(f.criada)}`; }).join('; ')}</span>` : ''}
      ${o.ativos.length ? `<span class="limp-nota">Ativos: ${o.ativos.map(esc).join('; ')}</span>` : ''}
      ${ts.length ? `<span class="limp-nota">Trechos: ${ts.slice(0, 30).map(esc).join(', ')}${ts.length > 30 ? ` e mais ${ts.length - 30}` : ''}</span>` : ''}</div>`;
  }
  const osBtn = (k, comFoco) => {
    const o = LP.os[k], g = grupoDe(o);
    const cor = g ? CINZA : corAno(anoDe(o));
    const quando = (!g ? br(o.data) : g === 'cri' ? 'criada ' + br(o.criada) : esc(o.sit.toLowerCase()) + ' · criada ' + br(o.criada)) +
      (andamento(o) ? ' · em andamento' : '') + (filhasDe(o).length ? ` · +${parcs(filhasDe(o).length)}` : '');
    return `<button type="button" class="limp-os-b${g ? ' ' + g : ''}" data-k="${k}" style="--c:${cor}" aria-pressed="${st.foco === k}">` +
      `<span class="q">${quando} · OS ${esc(o.os)} · ${vaosDaOs[k].length ? kmm(o.m) : 'sem localização'}</span>` +
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

  // o que fica sobre o mapa: o botão Faixa, a legenda dos anos e o chip da OS em foco (não depende dos dados pesados:
  // na carga sai antes do bloco do painel)
  function pintaMapa() {
    if (btnFaixa) btnFaixa.setAttribute('aria-pressed', String(st.ligado));
    if (maplg) {
      maplg.hidden = !st.ligado;
      maplg.innerHTML = '<span class="lg-cab"><b>Faixa</b></span>' + (st.vista === 'ano'
        ? ANOS.map(a => `<button type="button" data-a="${a}" aria-pressed="${st.anos.has(a)}" title="Mostrar/esconder ${a}"><i style="--c:${corAno(a)}"></i><b>${a}</b></button>`).join('') +
          GRUPOS_NEXE.map(([g, x]) => `<button type="button" data-a="${g}" aria-pressed="${st.nexe.has(g)}" title="Mostrar/esconder as OS ${x.rot.toLowerCase()}${x.nota ? ' (' + x.nota + ')' : ''}"><i class="${x.cls}" style="--c:#fff"></i>${x.rot}</button>`).join('') +
          `<span class="lg-info"><i style="--c:${FUNDOCOR};box-shadow:0 0 0 1px #000"></i>sem registro (pendente)</span>`
        : PIOR.map(k => `<span><i style="--c:${SIT[k][1]}"></i>${SIT[k][0]}</span>`).join(''));
    }
    if (chip) {
      chip.hidden = st.foco === null;
      if (st.foco !== null) {
        const o = LP.os[st.foco];
        chip.style.setProperty('--c', o.data ? corAno(anoDe(o)) : CINZA);
        chip.innerHTML = `<button type="button" data-v="-" title="OS anterior" aria-label="OS anterior">‹</button>` +
          `<span title="${esc(o.desc)}">OS ${esc(o.os)} · ${o.data ? br(o.data) : esc(o.sit.toLowerCase())} · ${kmm(o.m)}</span>` +
          `<button type="button" data-v="+" title="Próxima OS" aria-label="Próxima OS">›</button>` +
          `<button type="button" data-v="x" title="Fechar" aria-label="Fechar OS">✕</button>`;
      }
    }
  }
  function pinta() {
    dados();
    // guarda quem tinha o foco do teclado para devolver depois de refazer o cartão
    const f = document.activeElement;
    const chave = card.contains(f) ? (f.dataset.k !== undefined ? `[data-k="${f.dataset.k}"]` : f.dataset.foco ? `[data-foco="${f.dataset.foco}"]` : null) : null;

    const exec = PRIN.filter(k => LP.os[k].sit === 'EXECUTADA').length;
    const sub = `${exec} OS executada${exec === 1 ? '' : 's'}${KM_LIMPO ? ` · ${km(KM_LIMPO)} estimados de ${km(KM_REDE)}` : ''}` +
      GRUPOS_NEXE.map(([, x]) => ' · ' + plural(x.ks.length, x.um)).join('');
    // "vencida 22,0 km (1%) · sem registro …", só as situações com extensão
    const ROT = { vencida: 'vencida', sem: 'sem registro', vence: 'vence em até 12 meses', dia: 'em dia' };
    const parte = (ks, antes) => { const t = ks.filter(k => TOT_SIT[k]).map(k => `${ROT[k]} ${km(TOT_SIT[k])} (${pct(TOT_SIT[k], KM_REDE)})`).join(' · '); return t ? antes + t : ''; };
    // pendência do alimentador nas duas vistas: vencida e sem registro (desconhecida = pendente), com o % da rede
    const pend = `<div class="limp-bar" role="img" aria-label="Situação da rede">${['dia', 'vence', 'vencida', 'sem'].map(k => TOT_SIT[k] ? `<span style="width:${100 * TOT_SIT[k] / KM_REDE}%;background:${SIT[k][1]}" title="${SIT[k][0]}: ${km(TOT_SIT[k])}"></span>` : '').join('')}</div>
      <p class="limp-pend"><b>Pendente ${km(TOT_SIT.vencida + TOT_SIT.sem)} de ${km(KM_REDE)} (${pct(TOT_SIT.vencida + TOT_SIT.sem, KM_REDE)})</b>${parte(['vencida', 'sem'], ': ')}${parte(['vence', 'dia'], '<br>')}</p>
      <p class="limp-nota">Sem registro: nenhuma OS de faixa${EQ} na base, que tem OS regulares desde ${BASE_DESDE} (antes, quase nenhuma). A situação é desconhecida: tratar como pendente. Km estimados pelos ativos e pelos km citados na OS. A poda (OS MC/MP de poda, rede urbana) não entra nesta conta.</p>`;
    const porAno = st.ligado && st.vista === 'ano';
    const linhas = ANOS.map(a => linha(String(a), `<b>${a}</b> · ${OS_ANO[a].length} OS`, km(KM_ANO[a]), corAno(a), OS_ANO[a],
      porAno ? { liga: `Mostrar/esconder ${a} no mapa`, on: st.anos.has(a), nome: String(a) } : { nome: String(a) })).join('') +
      GRUPOS_NEXE.map(([g, x]) => linha(g, `${x.rot} · ${x.ks.length} OS`, km(x.km), CINZA, x.ks,
        porAno ? { liga: `Mostrar/esconder no mapa as OS ${x.rot.toLowerCase()}${x.nota ? ' (' + x.nota + ')' : ''}`, on: st.nexe.has(g), nome: x.rot, cls: x.cls }
          : { nome: x.rot, cls: x.cls })).join('');
    let corpo = '';
    if (st.ligado) corpo = pend;
    if (porAno && !ANOS.length) corpo += `<p class="limp-nota">Nenhuma OS executada${EQ} caiu neste alimentador.</p>`;
    else if (st.ligado && st.vista === 'sit') {      // vencimento: as situações só informam; os anos seguem embaixo, sem liga/desliga
      corpo += `<div class="limp-anos">${PIOR.map(k => `<div class="limp-ano-l fixo"><span class="cor" aria-hidden="true"><i style="--c:${SIT[k][1]}"></i></span><span class="rot"><span>${SIT[k][0]}</span><em>${km(TOT_SIT[k])} · ${pct(TOT_SIT[k], KM_REDE)}</em></span></div>`).join('')}</div>`;
    }
    if (linhas) corpo += `<div class="limp-anos">${linhas}</div>` +
      (porAno && st.anos.size < ANOS.length ? '<button type="button" class="limp-todos" data-acao="todos" data-foco="todos">Mostrar todos os anos</button>' : '');
    const seg = st.ligado ? `<div class="limp-seg" role="group" aria-label="Pintar o mapa por"><button type="button" data-acao="ano" data-foco="ano" aria-pressed="${st.vista === 'ano'}">Por ano</button><button type="button" data-acao="sit" data-foco="sit" aria-pressed="${st.vista === 'sit'}">Vencimento</button></div>` : '';
    const resto = seg + corpo;
    card.hidden = !st.ligado && !!btnFaixa;               // bloco da Faixa só com ela ligada no mapa
    card.innerHTML = `<div class="limp-top"><h2>Limpeza de faixa<small>${sub}</small></h2></div>
      ${resto}`;
    if (chave) card.querySelector(chave)?.focus({ preventScroll: true });

    pintaMapa();
    det.querySelectorAll('.limp-os-b').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.k === st.foco)));
    // 1ª vez (ao abrir a página): selos em fatias, com a página ociosa; a lista começa fechada com a Faixa ligada. O selo
    // é a situação do trecho, a mesma nas duas vistas: trocar de vista não refaz nenhum
    if (!selosPostos) { selosPostos = true; poeSelos(); }
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
    const r = resumo(nome), anos = REGRA[r.classe];
    const s = sitTrecho(r);
    const ks4 = ['dia', 'vence', 'vencida', 'sem'];
    // próxima: o vencimento mais cedo entre os vãos com OS; vão sem registro conta como já vencido
    const prox = (r.m.sem ? `<b>já</b>: ${kmm(r.m.sem)} sem registro (tratar como vencido)` : '') +
      (r.ven ? `${r.m.sem ? ' · nos vãos com OS, ' : ''}${r.ven < HOJE ? 'vencida desde ' : ''}${br(iso(r.ven))} <small>(o vencimento mais cedo entre os vãos)</small>` : '');
    const ks = r.ks.slice().sort((a, b) => (LP.os[b].data || LP.os[b].criada || '').localeCompare(LP.os[a].data || LP.os[a].criada || ''));
    return `<section class="limp-sec" aria-live="off"><h3>Limpeza de faixa · ${esc(r.classe)} a cada ${anos} anos</h3>
      <div class="limp-bar">${ks4.map(k => r.m[k] ? `<span style="width:${100 * r.m[k] / (r.ext || 1)}%;background:${SIT[k][1]}" title="${SIT[k][0]}: ${km(r.m[k])}"></span>` : '').join('')}</div>
      <dl><dt>Situação</dt><dd><b>${SIT[s][0]}</b> · ${PIOR.filter(k => r.m[k]).map(k => `${CURTO[k]} ${kmm(r.m[k])} (${pct(r.m[k], r.ext)})`).join(' · ')} <small>· vale a pior com mais de 10% ou 300 m do trecho</small></dd>
      <dt>Última</dt><dd>${r.ult ? `${br(r.ult)} · com OS ${km1(r.limpo)} de ${km(r.ext)} <small>(km estimados)</small>` : 'nenhuma OS executada encontrada neste trecho'}</dd>
      <dt>Próxima até</dt><dd>${prox || '—'}</dd></dl>
      ${ks.map(k => osBtn(k, false)).join('')}</section>`;
  }
  const det = $('det');
  function poeDetalhe() {
    if (det.querySelector('.limp-sec')) return;
    const h2 = det.querySelector('h2');
    if (!h2) return;
    const nome = [...h2.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim();
    dados();
    if (resumo(nome)) det.insertAdjacentHTML('beforeend', secTrecho(nome));
  }
  new MutationObserver(poeDetalhe).observe(det, { childList: true });
  det.addEventListener('click', e => { const b = e.target.closest('.limp-os-b'); if (b) focar(+b.dataset.k, true); });

  // ---------- lista: ano da última limpeza ----------
  const lista = $('lista');
  let selosPostos = false;
  const ocioso = (f, prazo) => window.requestIdleCallback ? requestIdleCallback(f, { timeout: prazo }) : setTimeout(() => f(null), 50);
  // as linhas que já estão na lista quando o bloco é pintado pela 1ª vez: um pedaço por folga do navegador. Se a folga não
  // vem em 1 s (a vez chega pelo prazo, sem tempo anunciado: navegador ocupado, ou que não dá folga), o pedaço é por tempo
  // (12 ms) e o prazo seguinte é curto: os selos não ficam esperando uma folga que não vem (antes: 1 linha por segundo)
  function poeSelos() {
    const rs = [...lista.querySelectorAll('.row')];
    let i = 0;
    const vez = d => {
      const folga = !!d && !d.didTimeout, fim = performance.now() + 12;
      do selo(rs[i++]); while (i < rs.length && (folga ? d.timeRemaining() > 1 : performance.now() < fim));
      if (i < rs.length) ocioso(vez, folga ? 1000 : 250);
    };
    if (rs.length) ocioso(vez, 1000);
  }
  function selo(b) {
    if (!b.isConnected) return;                        // a lista foi refeita no meio: a nova já ganhou os selos
    b.dataset.limp = '1';
    const r = resumo(b.dataset.t);
    if (!r) return;
    // a cor e o texto são a situação do trecho (a pior relevante), não o ano da OS mais recente; a conta e o texto do
    // selo de cada trecho são feitos uma vez (a lista é refeita a cada busca ou troca de ordem)
    if (!r.selo) {
      const s = sitTrecho(r);
      r.selo = [SIT[s][1], CURTO[s], `Limpeza de faixa: ${SIT[s][0].toLowerCase()}${r.ult ? ` · última ${br(r.ult)} em ${km1(r.limpo)} de ${km(r.ext)}` : ' · nenhuma OS'}`];
    }
    let el = b.querySelector('.limp-selo');
    if (!el) { el = document.createElement('span'); b.querySelector('em')?.before(el); }
    el.className = 'limp-selo';
    el.style.setProperty('--c', r.selo[0]);
    el.title = r.selo[2];
    el.textContent = r.selo[1];
  }
  // linhas que entram na lista (aos poucos na carga, todas de uma vez a cada busca): só as que chegaram ganham o selo, na
  // hora (antes, cada pedaço que entrava fazia procurar na lista inteira as que faltavam)
  new MutationObserver(ms => {
    if (passo < PASSOS.length) return;                 // dados ainda em montagem (carga): o 1º pinta() põe os selos do que já chegou
    for (const m of ms) for (const n of m.addedNodes) {
      if (n.nodeType !== 1) continue;
      if (!n.classList.contains('row')) n.querySelectorAll('.row:not([data-limp])').forEach(selo);
      else if (!n.dataset.limp) selo(n);
    }
  }).observe(lista, { childList: true });

  // ---------- Downloads (em "Dados", extras.js): todas as OS de faixa do alimentador, executadas, criadas e pendentes ----------
  if (window.__baixar && window.__csv && LP.os.length) {
    const C = window.__csv;
    window.__baixar.botao('faixa', 'OS de faixa (Excel)', () => {
      dados();
      const ks = LP.os.map((o, k) => k).sort((a, b) => (LP.os[b].data || LP.os[b].criada || '').localeCompare(LP.os[a].data || LP.os[a].criada || ''));
      C(`OS_faixa_${C.al}.csv`,
        ['Alimentador', 'OS', 'Situação', 'Execução', 'Criada', 'Equipe', 'Trechos', 'Extensão no mapa (km)', 'Km na descrição',
          'Ativos citados', 'Posição no mapa', 'Alimentador da OS', 'Obra', 'OS mãe', 'Parciais', 'Descrição'],
        ks.map(k => {
          const o = LP.os[k], eq = (o.os_completa || '').replace(o.os, '').trim();
          return [D.meta.al, o.os_completa || o.os, o.sit, C.data(o.data), C.data(o.criada), eq, C.trechos(vaosDaOs[k].map(v => v[5])),
            vaosDaOs[k].length ? C.num(o.m / 1000, 2) : '', C.num(o.km_desc), (o.ativos || []).join(' · '), o.metodo,
            o.al_os && o.al_os !== D.meta.al ? o.al_os : '', o.obra || '', o.mae || '', filhasDe(o).length || '', o.desc];
        }));
    }, `Planilha (CSV para o Excel) com as ${LP.os.length} OS de limpeza de faixa`);
  }

  // ---------- carga ----------
  // Com a montagem em fatias do alimentador.js: agora só o que é leve (o botão e a legenda no mapa, o bloco no lugar dele no
  // painel, a classe do body); os dados entram em fatias (um passo por vez) e, com eles, o bloco do painel, que a página
  // espera para ficar pronta (__al.espera); as linhas da Faixa, depois das da rede.
  async function monta() {
    await AL.cede();
    while (passo < PASSOS.length) { PASSOS[passo++](); if (passo < PASSOS.length && AL.cheia()) await AL.cede(); }
    pinta();
  }
  poeDetalhe();
  if (AL) {
    card.hidden = !st.ligado && !!btnFaixa;
    pintaMapa();
    const pronta = monta();
    AL.espera(pronta);
    if (map && st.ligado) {
      // Faixa ligada (o padrão): o que não é desenho vale já (a legenda de classes some, os pontos dos fusíveis só de perto)
      primeiro = 'espera';
      munDaCarga = { fora: window.__munFora, sel: window.__munSel };
      if (comEtiquetas()) devoNomes = filtro();           // as etiquetas chegam depois dos nomes dos municípios (nomesDepois)
      document.body.classList.add('limp-on');
      fusiveis();
      const f = window.__fusMarcas;
      fusFicou = !!f && map.hasLayer(f);
      if (fusFicou) f.once('remove', () => { fusFicou = false; });
      poeMarco();
      // Faixa desligada antes do fim da carga: o desenho em fatias para e as etiquetas dela não saem; o aviso dos nomes
      // (ver nomesDepois) vem então quando os rótulos da rede entram no mapa, que são o que os nomes têm de evitar
      AL.rede.then(() => { if (!st.ligado && devoNomes !== null) { devoNomes = null; avisaNomes(); } });
      pronta.then(() => { const antes = adianta().catch(e => console.error(e)); return AL.linhas.then(() => antes); })
        .then(() => { if (primeiro === 'espera') return desenhaAosPoucos(); }).catch(e => console.error(e));
    } else { desenha(); pronta.catch(e => console.error(e)); }
  } else { desenha(); pinta(); }
})();
