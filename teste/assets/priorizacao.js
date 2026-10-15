// Priorização de limpeza de faixa e poda (/teste/priorizacao/): motor e tela do Artifact "VERA Priorização de Faixa",
// com o ranking de alimentadores por NAE que ficava na página inicial. Dados: window.DADOS (priorizacao-dados.js),
// window.RANK (ranking-nae.js) e window.MUN (mapa-municipios-dados.js).
'use strict';
/* Motor de priorização VERA (teste). Funções puras: recebem dados + pesos + parâmetros e devolvem o ranking com
   componentes, regras e justificativa. É o mesmo código que iria para o serviço de score do backend. */
const VERA = (() => {
  const DIA = 864e5;
  const CRIT = [
    { k: 'nae', b: 'his', nome: 'NAE', curto: 'NAE' },
    { k: 'dec', b: 'his', nome: 'DEC (consumidor·hora interrompido)', curto: 'DEC' },
    { k: 'fec', b: 'his', nome: 'FEC (consumidores interrompidos)', curto: 'FEC' },
    { k: 'cli', b: 'imp', nome: 'Quantidade de clientes', curto: 'Clientes' },
    { k: 'ga', b: 'imp', nome: 'Quantidade de clientes Grupo A', curto: 'Grupo A' },
    { k: 'hier', b: 'imp', nome: 'Hierarquia do trecho (T1/T2/T3)', curto: 'Hierarquia' },
    { k: 'venc', b: 'man', nome: 'Limpeza de faixa vencida', curto: 'Limpeza vencida' },
    { k: 'avenc', b: 'man', nome: 'Limpeza de faixa a vencer em 3 meses', curto: 'Limpeza a vencer' },
  ];
  const BLOCOS = [
    { k: 'imp', nome: 'Impacto', cor: 'var(--c-imp)' },
    { k: 'his', nome: 'Histórico', cor: 'var(--c-his)' },
    { k: 'man', nome: 'Limpeza de faixa', cor: 'var(--c-man)' },
  ];
  const PERFIS = {
    padrao: { nome: 'Padrão', w: { nae: 18, dec: 14, fec: 9, cli: 13, ga: 9, hier: 10, venc: 18, avenc: 9 } },
    prechuva: { nome: 'Pré-chuva (set–nov)', w: { nae: 14, dec: 14, fec: 9, cli: 13, ga: 9, hier: 10, venc: 22, avenc: 9 } },
    clima: { nome: 'Plano climático', w: { nae: 18, dec: 18, fec: 9, cli: 14, ga: 9, hier: 10, venc: 13, avenc: 9 } },
  };

  function parametrosPadrao() {
    return {
      ref: '2026-10-07', meiaVida: 6, janela: 12, desconto: 0.3, cobEfetiva: 0.5, cobBloqueio: 0.8,
      carencia: { 1: 6, 2: 9, 3: 12 }, ciclo: { 1: 3, 2: 4, 3: 5 }, aVencer: 3, falta: 'repondera',
      lim: { p1: 70, p2: 50, p3: 30 }, planoPolos: [], bonus: 8,
      hier: { 1: 1, 2: 0.5, 3: 0.3 },   // fração do peso da hierarquia por classe: com 10%, T1 10, T2 5 e T3 3 pontos
    };
  }

  const nf0 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
  const nf1 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const fmtN = (x) => nf0.format(x);
  const fmt1 = (x) => nf1.format(x);
  const nf2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtKm = (x) => (x < 1 ? nf2.format(x) : nf1.format(x));
  const pct = (x) => nf0.format(Math.round(x * 100)) + '%';
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const logNorm = (x, ref) => (x <= 0 || ref <= 0 ? 0 : clamp(Math.log1p(x) / Math.log1p(ref)));

  function quantil(arr, q) {
    if (!arr.length) return 0;
    const a = Float64Array.from(arr).sort();
    const p = (a.length - 1) * q, lo = Math.floor(p), hi = Math.ceil(p);
    return a[lo] + (a[hi] - a[lo]) * (p - lo);
  }

  function preparar(D) {
    const d0 = Date.parse(D.d0 + 'T00:00:00Z');
    const ctx = { D, d0, alims: D.alims, muns: D.muns };
    ctx.osInicio = Math.round((Date.parse(D.os_inicio + 'T00:00:00Z') - d0) / DIA);
    ctx.kmClasse = { 1: D.estat.km_T1, 2: D.estat.km_T2, 3: D.estat.km_T3 };
    ctx.trechos = D.trechos.map((t, i) => {
      const a = D.alims[t.a];
      return Object.assign(t, {
        i, al: a[0], se: a[2], polo: a[3] || 'Sem polo', equipe: a[4] || '',
        mun: t.mu >= 0 ? D.muns[t.mu] : '—', id: a[0] + ' · ' + t.n,
      });
    });
    return ctx;
  }
  const diaDe = (ctx, iso) => Math.round((Date.parse(iso + 'T00:00:00Z') - ctx.d0) / DIA);
  const dataDe = (ctx, n) => {
    const s = new Date(ctx.d0 + n * DIA).toISOString();
    return s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4);
  };
  const mesDe = (ctx, n) => {
    const d = new Date(ctx.d0 + n * DIA);
    return d.getUTCFullYear() * 12 + d.getUTCMonth();
  };

  function avaliar(ctx, W, P, flags) {
    const ref = diaDe(ctx, P.ref);
    const janela = P.janela * 30.44, meia = P.meiaVida * 30.44;
    const plano = new Set(P.planoPolos);
    const ga = flags.ga, noPlano = flags.plano;

    // 1. fatos por trecho na data de referência
    const F = ctx.trechos.map((t) => {
      let ult = null, bloq = null, cart = null, parcial = null;
      for (const [d, s, f, cod] of t.os) {
        if (d > ref) continue;
        if (s === 1) {
          if (f >= P.cobEfetiva && (ult === null || d > ult)) ult = d;
          if (!parcial || d > parcial.d) parcial = { d, f };
          if (f >= P.cobBloqueio && ref - d <= P.carencia[t.c] * 30.44 && (!bloq || d > bloq.d)) bloq = { d, cod, f };
        } else if (f >= 0.3 && (!cart || f > cart.f)) cart = { d, cod, f };
      }
      let neff = 0, chi = 0, ci = 0, n = 0, n90 = 0, posBloq = 0, cliMax = 0, durS = 0, durN = 0;
      const meses = new Set(), usadas = [];
      for (const [d, cons, dur, col, rg] of t.oc) {
        const age = ref - d;
        if (age < 0 || age > janela) continue;
        let w = Math.pow(0.5, age / meia);
        const pre = ult !== null && d < ult;
        if (pre) w *= P.desconto;
        neff += w; chi += (w * cons * dur) / 60; ci += w * cons; n++;
        if (age <= 90) n90++;
        if (bloq && d >= bloq.d) posBloq++;
        meses.add(mesDe(ctx, d));
        if (cons > cliMax) cliMax = cons;
        if (dur > 0) { durS += dur; durN++; }
        usadas.push({ d, cons, dur, col, rg, w, pre });
      }
      return { ult, parcial, bloq, cart, neff, chi, ci, n, n90, posBloq, meses: meses.size, cliMax, usadas };
    });

    // 2. referências da rodada: calculadas sobre a rede toda, não mudam com filtro
    const pos = (a) => a.filter((x) => x > 0);
    const R = {
      nae: quantil(pos(F.map((f) => f.neff)), 0.95), chi: quantil(pos(F.map((f) => f.chi)), 0.95),
      ci: quantil(pos(F.map((f) => f.ci)), 0.95), cli: quantil(pos(F.map((f) => f.cliMax)), 0.95),
    };
    const med = { cli: {} };
    for (const c of [1, 2, 3]) {
      med.cli[c] = quantil(F.filter((f, i) => ctx.trechos[i].c === c && f.cliMax > 0).map((f) => logNorm(f.cliMax, R.cli)), 0.5);
    }
    const Wtot = CRIT.reduce((s, c) => s + (W[c.k] || 0), 0) || 1;

    // 3. score, regras e faixa
    const res = ctx.trechos.map((t, i) => {
      const f = F[i], eGA = ga.has(t.i), ePlano = plano.has(t.polo) || noPlano.has(t.i);
      const v = {};
      v.cli = f.cliMax > 0
        ? { s: logNorm(f.cliMax, R.cli), st: 'real', dado: fmtN(f.cliMax) + ' consumidores (máx. por evento)' }
        : { s: med.cli[t.c], st: 'est', dado: 'sem evento: mediana da classe' };
      v.ga = eGA ? { s: 1, st: 'real', dado: 'clientes Grupo A marcados neste teste' } : { s: 0, st: 'falta', dado: 'sem fonte na base' };
      v.hier = { s: P.hier[t.c], st: 'real', dado: 'T' + t.c + ' recebe ' + pct(P.hier[t.c]) + ' do peso da hierarquia' };
      v.nae = { s: logNorm(f.neff, R.nae), st: 'real', dado: f.n ? fmtN(f.n) + ' ocorrência(s) no trecho · ' + fmt1(f.neff) + ' ponderadas' : 'nenhuma ocorrência na janela' };
      v.dec = { s: logNorm(f.chi, R.chi), st: 'real', dado: fmtN(Math.round(f.chi)) + ' consumidor·hora ponderado' };
      v.fec = { s: logNorm(f.ci, R.ci), st: 'real', dado: fmtN(Math.round(f.ci)) + ' consumidores ponderado' };
      // situação da limpeza de faixa: vence na última limpeza efetiva + ciclo da classe (T1 3, T2 4, T3 5 anos)
      const base = f.ult !== null ? f.ult : ctx.osInicio, stL = f.ult !== null ? 'real' : 'est';
      const vence = Math.round(base + P.ciclo[t.c] * 365.25), faltam = vence - ref;
      const vencida = faltam < 0, aVencer = !vencida && faltam <= P.aVencer * 30.44;
      const origem = f.ult !== null ? 'última limpeza em ' + dataDe(ctx, f.ult)
        : f.parcial ? 'nenhuma limpeza cobrindo ≥ ' + pct(P.cobEfetiva) + ' do trecho desde ' + dataDe(ctx, ctx.osInicio) + ' (última parcial em ' + dataDe(ctx, f.parcial.d) + ', ' + pct(f.parcial.f) + ')'
        : 'sem limpeza registrada desde ' + dataDe(ctx, ctx.osInicio);
      const ciclo = 'ciclo T' + t.c + ' = ' + P.ciclo[t.c] + ' anos';
      v.venc = { s: vencida ? 1 : 0, st: stL, dado: (vencida ? 'vencida em ' + dataDe(ctx, vence) : 'não vencida') + ' · ' + origem + ' · ' + ciclo };
      v.avenc = { s: aVencer ? 1 : 0, st: stL, dado: vencida ? 'já vencida' : 'vence em ' + dataDe(ctx, vence) + (aVencer ? ' (dentro de ' + P.aVencer + ' meses)' : '') };

      let num = 0, den = 0, conf = 0;
      const blk = { imp: [0, 0], his: [0, 0], man: [0, 0] }, pts = {};
      const situacao = vencida ? 'vencida' : aVencer ? 'vence em até ' + P.aVencer + ' meses' : 'em dia';
      const limpeza = { situacao, vence: dataDe(ctx, vence), vencida, origem };
      for (const c of CRIT) {
        const w = W[c.k] || 0, x = v[c.k];
        if (x.st === 'falta') {
          pts[c.k] = null;
          if (P.falta === 'zero') { den += w; blk[c.b][1] += w; }
          continue;
        }
        num += w * x.s; den += w; blk[c.b][0] += w * x.s; blk[c.b][1] += w;
        conf += (x.st === 'real' ? 1 : 0.5) * w; pts[c.k] = w * x.s;
      }
      let score = den ? (100 * num) / den : 0;
      const segs = {};
      for (const b of BLOCOS) segs[b.k] = den ? (100 * blk[b.k][0]) / den : 0;
      const CH = blk.imp[1] + blk.his[1] ? (100 * (blk.imp[0] + blk.his[0])) / (blk.imp[1] + blk.his[1]) : 0;
      let UA = blk.man[1] ? (100 * blk.man[0]) / blk.man[1] : 0;
      const regras = [];
      let piso = 4, fila = 'Preventiva', status = 'Elegível', bonus = 0;
      if (ePlano) {
        bonus = Math.min(P.bonus, 100 - score);
        score += bonus; UA = Math.min(100, UA + P.bonus);
        regras.push({ id: 'A1', tipo: 'aumento', txt: 'Incluído no plano climático: +' + fmt1(bonus) + ' ponto(s)' });
      }
      if (f.bloq) {
        if (f.posBloq > 0) regras.push({ id: 'L2', tipo: 'alerta', txt: 'Reincidência após a limpeza de ' + dataDe(ctx, f.bloq.d) + ' (' + f.posBloq + ' evento[s]): investigar a causa antes de repetir o serviço' });
        else {
          status = 'Executado recentemente';
          regras.push({ id: 'B1', tipo: 'bloqueio', txt: 'Limpeza executada em ' + dataDe(ctx, f.bloq.d) + ' cobrindo ' + pct(f.bloq.f) + ' do trecho (carência T' + t.c + ' = ' + P.carencia[t.c] + ' meses)' });
        }
      }
      if (f.cart && status === 'Elegível') {
        status = 'Em carteira';
        regras.push({ id: 'B2', tipo: 'bloqueio', txt: 'OS aberta ' + f.cart.cod + ' já cobre ' + pct(f.cart.f) + ' do trecho' });
      }
      if (t.c === 1 && (f.meses >= 3 || f.n90 >= 2)) {
        piso = 1;
        regras.push({ id: 'F1', tipo: 'piso', txt: 'T1 com recorrência (' + f.meses + ' meses com evento, ' + f.n90 + ' nos últimos 90 dias): mínimo P1 e análise de causa' });
      } else if (f.meses >= 4) {
        piso = Math.min(piso, 2);
        regras.push({ id: 'F4', tipo: 'piso', txt: 'Recorrência em ' + f.meses + ' meses: mínimo P2' });
      }
      if (eGA) {
        piso = Math.min(piso, 2);
        regras.push({ id: 'F2', tipo: 'piso', txt: 'Clientes Grupo A no trecho: mínimo P2' });
      }
      const fScore = score >= P.lim.p1 ? 1 : score >= P.lim.p2 ? 2 : score >= P.lim.p3 ? 3 : 4;
      const faixa = Math.min(fScore, piso);
      const confR = conf / Wtot;
      if (confR < 0.6 && faixa <= 2) regras.push({ id: 'Q1', tipo: 'alerta', txt: 'Confiança ' + pct(confR) + ': confirmar em inspeção antes de programar' });
      if (t.km < 0.5 && f.n > 0) regras.push({ id: 'Q4', tipo: 'alerta', txt: 'Trecho curto (' + fmtN(t.km * 1000) + ' m) com ' + f.n + ' ocorrência(s): confirmar o local da falha antes de programar' });
      if (t.cf === 'revisar') regras.push({ id: 'Q3', tipo: 'alerta', txt: 'Segmentação deste trecho está marcada para revisão no cadastro' });
      return { t, f, v, pts, den, situacao, limpeza, score, segs, bonus, CH, UA, conf: confR, faixa, fScore, piso, fila, status, regras };
    });
    const ordemStatus = { 'Elegível': 0, 'Em carteira': 1, 'Executado recentemente': 2 };
    const ranked = res.slice().sort((a, b) => ordemStatus[a.status] - ordemStatus[b.status] || a.faixa - b.faixa || b.score - a.score);
    let k = 0;
    for (const r of ranked) r.pos = r.status === 'Elegível' ? ++k : null;
    return { res, ranked, R, med, ref };
  }

  function justificar(ctx, r, P, W) {
    const t = r.t, f = r.f, partes = [];
    partes.push(t.id + ' (T' + t.c + ', ' + fmtKm(t.km) + ' km, ' + t.mun + ', polo ' + t.polo + ').');
    partes.push('Prioridade P' + r.faixa + ' com score ' + fmtN(Math.floor(r.score)) + ' de 100 e confiança ' + pct(r.conf) + '.');
    if (r.faixa < r.fScore) partes.push('O score sozinho daria P' + r.fScore + '; a faixa subiu por regra.');
    if (f.n) partes.push('Histórico: ' + f.n + ' ocorrência(s) por vegetação nos últimos ' + P.janela + ' meses, em ' + f.meses + ' mês(es) distintos, somando ' + fmtN(Math.round(f.chi)) + ' consumidor·hora ponderados.');
    else partes.push('Histórico: nenhuma ocorrência por vegetação nos últimos ' + P.janela + ' meses.');
    if (f.cliMax) partes.push('Impacto: até ' + fmtN(f.cliMax) + ' consumidores interrompidos por evento.');
    const L = r.limpeza;
    partes.push('Limpeza de faixa ' + L.situacao + ' (' + (L.vencida ? 'venceu' : 'vence') + ' em ' + L.vence + '; ' + L.origem + ').');
    const top = CRIT.filter((c) => r.pts[c.k]).sort((a, b) => r.pts[b.k] - r.pts[a.k]).slice(0, 3);
    if (top.length) partes.push('Mais pesaram: ' + top.map((c) => c.nome).join('; ') + '.');
    for (const g of r.regras) partes.push('[' + g.id + '] ' + g.txt + '.');
    return partes.join(' ');
  }

  function hav(la1, lo1, la2, lo2) {
    const r = Math.PI / 180, dla = (la2 - la1) * r, dlo = (lo2 - lo1) * r;
    const h = Math.sin(dla / 2) ** 2 + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin(dlo / 2) ** 2;
    return 2 * 6371 * Math.asin(Math.sqrt(h));
  }

  /* Criticidade primeiro: o líder de cada pacote é o próximo trecho elegível do ranking. Vizinhos entram por
     proximidade; os de faixa inferior (aproveitamento) ficam limitados a uma fração da capacidade do pacote. */
  function pacotes(ctx, ranked, o) {
    const pool = ranked.filter((r) => r.status === 'Elegível' && r.faixa <= 3 && (o.polo === 'todos' || r.t.polo === o.polo));
    const usado = new Set(), out = [];
    for (const lider of pool) {
      if (out.length >= o.max) break;
      if (usado.has(lider.t.i)) continue;
      usado.add(lider.t.i);
      const pk = { lider, membros: [{ r: lider, aprov: false, dist: 0 }], km: lider.t.km, kmAprov: 0 };
      const cands = [];
      for (const c of pool) {
        if (usado.has(c.t.i) || c.t.polo !== lider.t.polo || c.score < o.scoreMin) continue;
        const d = hav(lider.t.la, lider.t.lo, c.t.la, c.t.lo);
        if (d <= o.raio) cands.push({ c, d });
      }
      cands.sort((a, b) => a.c.faixa - b.c.faixa || a.d - b.d);
      for (const { c, d } of cands) {
        if (pk.km + c.t.km > o.cap) continue;
        const aprov = c.faixa > lider.faixa;
        if (aprov && pk.kmAprov + c.t.km > o.limAprov * o.cap) continue;
        pk.membros.push({ r: c, aprov, dist: d });
        pk.km += c.t.km;
        if (aprov) pk.kmAprov += c.t.km;
        usado.add(c.t.i);
      }
      const a = ctx.alims[lider.t.a], bla = a[5], blo = a[6];
      let ind = 0;
      for (const m of pk.membros) ind += 2 * hav(bla, blo, m.r.t.la, m.r.t.lo);
      const rest = pk.membros.slice();
      let cla = bla, clo = blo, rota = 0;
      while (rest.length) {
        let bi = 0, bd = Infinity;
        rest.forEach((m, j) => { const dd = hav(cla, clo, m.r.t.la, m.r.t.lo); if (dd < bd) { bd = dd; bi = j; } });
        rota += bd; cla = rest[bi].r.t.la; clo = rest[bi].r.t.lo; rest.splice(bi, 1);
      }
      rota += hav(cla, clo, bla, blo);
      Object.assign(pk, { deslInd: ind * o.fator, deslPac: rota * o.fator, base: a[2], equipe: a[4] });
      out.push(pk);
    }
    return { pacotes: out, elegiveis: pool.length };
  }

  /* Teste retroativo: ranking calculado só com o que se sabia na data de corte, comparado com as ocorrências
     que aconteceram depois dela. */
  function retroativo(ctx, W, P, corte, fim) {
    const Pc = Object.assign({}, P, { ref: corte, planoPolos: [] });
    const { res } = avaliar(ctx, W, Pc, { ga: new Set(), plano: new Set() });
    const c0 = diaDe(ctx, corte), c1 = diaDe(ctx, fim);
    const futO = res.map((r) => r.t.oc.filter((o) => o[0] > c0 && o[0] <= c1));
    const fut = futO.map((l) => l.length);
    const futH = futO.map((l) => l.reduce((s, o) => s + (o[1] * o[2]) / 60, 0));
    const total = fut.reduce((s, x) => s + x, 0), totalH = futH.reduce((s, x) => s + x, 0);
    const kmTot = res.reduce((s, r) => s + r.t.km, 0);
    const passado = res.map((r) => r.f.n);
    const capt = (ordem, frac) => {
      const n = Math.round(res.length * frac);
      let oc = 0, km = 0, h = 0;
      for (let j = 0; j < n; j++) { oc += fut[ordem[j]]; h += futH[ordem[j]]; km += res[ordem[j]].t.km; }
      return { oc: total ? oc / total : 0, chi: totalH ? h / totalH : 0, km: km / kmTot, n };
    };
    const idx = res.map((_, i) => i);
    const porScore = idx.slice().sort((a, b) => res[b].score - res[a].score);
    const porNae = idx.slice().sort((a, b) => passado[b] - passado[a] || res[b].t.km - res[a].t.km);
    const porKm = idx.slice().sort((a, b) => res[b].t.km - res[a].t.km);
    const linhas = [0.01, 0.05, 0.1].map((q) => ({ q, score: capt(porScore, q), nae: capt(porNae, q), km: capt(porKm, q) }));
    return { total, totalH, linhas, n: res.length };
  }

  return { CRIT, BLOCOS, PERFIS, parametrosPadrao, preparar, avaliar, justificar, pacotes, retroativo, dataDe, diaDe, fmtN, fmt1, fmtKm, pct };
})();
if (typeof module !== 'undefined') module.exports = VERA;


'use strict';
(() => {
  const V = VERA, D = window.DADOS, ctx = V.preparar(D);
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const { fmtN, fmt1, fmtKm, pct } = V;
  const CHAVE_VAL = 'vera-prior-validacoes';
  let validacoes = {};
  try { validacoes = JSON.parse(localStorage.getItem(CHAVE_VAL) || '{}') || {}; } catch (e) { validacoes = {}; }
  const salvarVal = () => { try { localStorage.setItem(CHAVE_VAL, JSON.stringify(validacoes)); } catch (e) {} };

  const S = {
    perfil: 'padrao', W: Object.assign({}, V.PERFIS.padrao.w), P: V.parametrosPadrao(),
    flags: { ga: new Set(), plano: new Set() },
    f: { polo: 'todos', mun: 'todos', busca: '', classes: new Set([1, 2, 3]), faixa: null, ocultos: false, al: null },
    out: null, sel: null,
    pk: { polo: 'NORTE', raio: 10, cap: 20, limAprov: 30, scoreMin: 30, fator: 1.4, max: 12 },
  };
  const POLOS = ['NORTE', 'CENTRO', 'SUL', 'Sem polo'];
  const gaveta = matchMedia('(max-width:860px)');   // celular: a ficha do trecho abre por cima da página

  // ---------- controles ----------
  const perfilSel = $('#perfil');
  for (const [k, p] of Object.entries(V.PERFIS)) perfilSel.add(new Option(p.nome, k));
  function dicaPerfil() {
    const m = Number(S.P.ref.slice(5, 7));
    const sug = m >= 9 && m <= 11 ? 'Pré-chuva (set–nov)' : 'Padrão';
    $('#perfil-dica').textContent = 'Sugerido para ' + S.P.ref.split('-').reverse().join('/') + ': ' + sug + '.';
  }
  $('#ref').value = S.P.ref;
  const poloSel = $('#f-polo');
  poloSel.add(new Option('Todos', 'todos'));
  POLOS.forEach((p) => poloSel.add(new Option(p, p)));
  const munSel = $('#f-mun');
  munSel.add(new Option('Todos', 'todos'));
  [...new Set(ctx.trechos.map((t) => t.mun))].filter((m) => m !== '—').sort((a, b) => a.localeCompare(b, 'pt-BR')).forEach((m) => munSel.add(new Option(m, m)));
  const pkPolo = $('#pk-polo');
  pkPolo.add(new Option('Todos', 'todos'));
  POLOS.forEach((p) => pkPolo.add(new Option(p, p)));
  $('#plano-polos').innerHTML = POLOS.map((p) => '<label><input type="checkbox" value="' + esc(p) + '"> ' + esc(p) + '</label>').join('');

  const totalPesos = () => V.CRIT.reduce((a, c) => a + (S.W[c.k] || 0), 0);
  const pesosValidos = () => totalPesos() === 100;
  let Wvalido = null;
  const Wef = () => { if (pesosValidos()) Wvalido = Object.assign({}, S.W); return Wvalido; };
  const corGrupo = (c) => V.BLOCOS.find((b) => b.k === c.b).cor;
  const nomeCrit = (c) => (c.k === 'avenc' ? 'Limpeza de faixa a vencer em ' + S.P.aVencer + ' meses' : c.nome);
  function desenharPesos() {
    $('#pesos').innerHTML = V.CRIT.map((c) =>
      '<div class="peso"><label for="k-' + c.k + '"><span class="amostra" style="background:' + corGrupo(c) + '"></span>' + esc(nomeCrit(c)) + '</label>' +
      '<input type="range" id="k-' + c.k + '" data-k="' + c.k + '" min="0" max="50" step="1" value="' + Math.min(S.W[c.k], 50) + '">' +
      '<input type="number" id="nk-' + c.k + '" data-k="' + c.k + '" min="0" max="100" step="1" value="' + S.W[c.k] + '" aria-label="' + esc(c.nome) + ' em %"><span class="pct">%</span>' +
      (c.k === 'hier' ? '<div class="classes" id="hier-classes"></div>' : '') + '</div>').join('') +
      '<div class="total-pesos" id="total-pesos"><span>Total</span><b id="total-valor"></b></div>';
    atualizarSomas();
  }
  function atualizarSomas() {
    const tot = totalPesos(), ok = pesosValidos(), d = 100 - tot;
    $('#total-valor').textContent = fmtN(tot) + '%' + (d > 0 ? ' · faltam ' + fmtN(d) : d < 0 ? ' · sobram ' + fmtN(-d) : '');
    $('#total-pesos').classList.toggle('alerta', !ok);
    const av = $('#aviso-pesos');
    av.hidden = ok;
    if (!ok) av.textContent = 'Os pesos somam ' + fmtN(tot) + '%; precisam somar 100%. Enquanto isso, o ranking usa os últimos pesos válidos.';
    $('#distrib').innerHTML = V.CRIT.filter((c) => S.W[c.k] > 0).map((c) =>
      '<span style="width:' + (tot ? (100 * S.W[c.k]) / tot : 0).toFixed(2) + '%;background:' + corGrupo(c) + '" title="' + esc(c.curto) + ': ' + S.W[c.k] + '%"></span>').join('');
    atualizarHier();
    const p = V.PERFIS[S.perfil].w, padrao = V.parametrosPadrao().hier;
    const igual = V.CRIT.every((c) => S.W[c.k] === p[c.k]) && [1, 2, 3].every((c) => S.P.hier[c] === padrao[c]);
    $('#prem-resumo').textContent = V.CRIT.length + ' critérios · ' + (igual ? 'pesos do perfil ' + V.PERFIS[S.perfil].nome : 'pesos ajustados');
  }
  // Hierarquia do trecho: T1 recebe o peso inteiro do critério; T2 e T3 recebem uma parte dele (padrão 10, 5 e 3 pontos)
  const nfHier = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
  const pontosHier = (c) => Math.round(S.W.hier * S.P.hier[c] * 10) / 10;
  function atualizarHier() {
    const el = $('#hier-classes');
    if (!el) return;
    if (!el.children.length) {
      el.innerHTML = '<span>Pontos por classe:</span><span>T1 <b id="hier-1"></b></span>' +
        [2, 3].map((c) => '<label>T' + c + ' <input type="number" id="hier-' + c + '" data-h="' + c + '" min="0" step="0.5" aria-label="Pontos da hierarquia para T' + c + '"></label>').join('') +
        '<span>% do score</span>';
    }
    $('#hier-1').textContent = nfHier.format(pontosHier(1));
    for (const c of [2, 3]) {
      const inp = $('#hier-' + c);
      inp.max = S.W.hier; inp.disabled = !S.W.hier;
      if (document.activeElement !== inp) inp.value = pontosHier(c);
    }
  }
  function sincronizarControles(exceto) {
    for (const c of V.CRIT) {
      const rg = $('#k-' + c.k), nm = $('#nk-' + c.k);
      if (rg !== exceto) rg.value = Math.min(S.W[c.k], Number(rg.max));
      if (nm !== exceto) nm.value = S.W[c.k];
    }
  }
  function repartir(valores, alvo) {
    const tot = valores.reduce((a, v) => a + v, 0);
    const base = tot > 0 ? valores.map((v) => (v * alvo) / tot) : valores.map(() => alvo / valores.length);
    const r = base.map(Math.floor);
    let resto = alvo - r.reduce((a, v) => a + v, 0);
    base.map((v, i) => [v - r[i], i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (resto > 0) { r[i]++; resto--; } });
    return r;
  }
  function preencherParams() {
    $('#p-avenc').value = S.P.aVencer; $('#p-meia').value = S.P.meiaVida; $('#p-desc').value = S.P.desconto;
    $('#p-cob').value = S.P.cobBloqueio; $('#p-car').value = [1, 2, 3].map((c) => S.P.carencia[c]).join(' / ');
    $('#p-falta').value = S.P.falta; $('#p-bonus').value = S.P.bonus;
    for (const [k, v] of Object.entries(S.pk)) { const el = $('#pk-' + ({ limAprov: 'aprov', scoreMin: 'min' }[k] || k)); if (el) el.value = v; }
  }
  const tres = (s, def) => {
    const p = String(s).split(/[^\d.]+/).map(Number).filter((x) => !isNaN(x) && x >= 0);
    return p.length === 3 ? p : def;
  };

  let tmr = null;
  function agendar() { clearTimeout(tmr); tmr = setTimeout(recalcular, 140); }
  let recalcular = function () {
    const antes = new Map();
    if (S.out) for (const r of S.out.ranked) if (r.pos) antes.set(r.t.i, r.pos);
    S.out = V.avaliar(ctx, Wef(), S.P, S.flags);
    for (const r of S.out.ranked) r.mov = r.pos && antes.has(r.t.i) ? antes.get(r.t.i) - r.pos : r.pos && antes.size ? 'novo' : 0;
    renderRanking();
    if (S.sel !== null) abrirFicha(S.sel, true);
    if ($('#sec-pacotes').open) renderPacotes();
    retroPendente = true;
    if ($('#sec-dados').open) renderRetro();
  };

  function aplicarPerfil() {
    const p = V.PERFIS[S.perfil];
    S.W = Object.assign({}, p.w);
    desenharPesos(); agendar();
  }
  perfilSel.addEventListener('change', () => { S.perfil = perfilSel.value; aplicarPerfil(); });
  $('#restaurar').addEventListener('click', () => { S.P.hier = V.parametrosPadrao().hier; aplicarPerfil(); });
  $('#pesos').addEventListener('input', (e) => {
    const d = e.target.dataset;
    if (e.target.value === '' || isNaN(Number(e.target.value))) return;
    const v = Math.min(100, Math.max(0, Math.round(Number(e.target.value))));
    const k = d.k; if (!k) return;
    // os outros critérios se ajustam na proporção atual para o total ficar sempre em 100%
    const outros = V.CRIT.filter((c) => c.k !== k), ws = repartir(outros.map((c) => S.W[c.k]), 100 - v);
    outros.forEach((c, i) => { S.W[c.k] = ws[i]; });
    S.W[k] = v;
    sincronizarControles(e.target);
    atualizarSomas();
    if (pesosValidos()) agendar(); else renderRanking();
  });
  $('#pesos').addEventListener('change', (e) => {
    const c = e.target.dataset.h;
    if (!c) return;
    const v = Number(e.target.value);
    if (e.target.value !== '' && !isNaN(v) && S.W.hier > 0) S.P.hier[c] = Math.min(1, Math.max(0, v / S.W.hier));
    atualizarSomas();
    agendar();
  });
  $('#ref').addEventListener('change', (e) => { if (e.target.value) { S.P.ref = e.target.value; dicaPerfil(); agendar(); } });
  poloSel.addEventListener('change', () => { S.f.polo = poloSel.value; renderRanking(); });
  munSel.addEventListener('change', () => { S.f.mun = munSel.value; renderRanking(); });
  $('#f-busca').addEventListener('input', (e) => { S.f.busca = e.target.value.trim().toUpperCase(); clearTimeout(tmr); tmr = setTimeout(renderRanking, 160); });
  $('#f-classe').addEventListener('change', () => { S.f.classes = new Set([...document.querySelectorAll('#f-classe input:checked')].map((i) => Number(i.value))); renderRanking(); });
  $('#f-ocultos').addEventListener('change', (e) => { S.f.ocultos = e.target.checked; renderRanking(); });
  $('#plano-polos').addEventListener('change', () => { S.P.planoPolos = [...document.querySelectorAll('#plano-polos input:checked')].map((i) => i.value); agendar(); });
  const numParam = (id, fn) => $(id).addEventListener('change', (e) => { const v = Number(e.target.value); if (!isNaN(v)) { fn(v); agendar(); } });
  numParam('#p-meia', (v) => { S.P.meiaVida = Math.max(1, v); });
  numParam('#p-avenc', (v) => { S.P.aVencer = Math.min(12, Math.max(1, Math.round(v))); desenharPesos(); });
  numParam('#p-desc', (v) => { S.P.desconto = Math.min(1, Math.max(0, v)); });
  numParam('#p-cob', (v) => { S.P.cobBloqueio = Math.min(1, Math.max(0.1, v)); });
  numParam('#p-bonus', (v) => { S.P.bonus = Math.max(0, v); });
  $('#p-car').addEventListener('change', (e) => { const p = tres(e.target.value, [6, 9, 12]); S.P.carencia = { 1: p[0], 2: p[1], 3: p[2] }; agendar(); });
  $('#p-lim').addEventListener('change', (e) => { const p = tres(e.target.value, [70, 50, 30]); S.P.lim = { p1: p[0], p2: p[1], p3: p[2] }; agendar(); });
  $('#p-falta').addEventListener('change', (e) => { S.P.falta = e.target.value; agendar(); });
  for (const [k, id] of [['polo', 'polo'], ['raio', 'raio'], ['cap', 'cap'], ['limAprov', 'aprov'], ['scoreMin', 'min'], ['fator', 'fator'], ['max', 'max']]) {
    $('#pk-' + id).addEventListener('change', (e) => { S.pk[k] = k === 'polo' ? e.target.value : Number(e.target.value); renderPacotes(); });
  }

  // ---------- ranking ----------
  const FAIXA = (n) => '<span class="faixa f' + n + '"><span class="ponto"></span>P' + n + '</span>';
  function barra(r) {
    let h = '';
    for (const b of V.BLOCOS) if (r.segs[b.k] > 0.05) h += '<span style="width:' + r.segs[b.k].toFixed(2) + '%;background:' + b.cor + '"></span>';
    if (r.bonus > 0) h += '<span class="plano" style="width:' + r.bonus.toFixed(2) + '%"></span>';
    return '<div class="score"><div class="barra" role="img" aria-label="Score ' + Math.floor(r.score) + '">' + h + '</div><b>' + Math.floor(r.score) + '</b></div>';
  }
  function motivo(r) {
    if (r.status !== 'Elegível') return '<span class="chip estado">' + esc(r.status) + '</span>';
    const top = V.CRIT.filter((c) => r.pts[c.k] > 0.05).sort((a, b) => r.pts[b.k] - r.pts[a.k]).slice(0, 2).map((c) => c.curto);
    let h = esc(top.join(' · ') || '—');
    if (r.faixa < r.fScore) h += ' <span class="chip piso" title="' + esc(r.regras.filter((g) => g.tipo === 'piso').map((g) => g.txt).join('; ')) + '">subiu por regra</span>';
    const v = validacoes[r.t.id];
    if (v) h += ' <span class="chip">' + esc(v.decisao) + '</span>';
    return h;
  }
  function filtrar(semFaixa) {
    const f = S.f;
    return S.out.ranked.filter((r) => {
      const t = r.t;
      if (!f.ocultos && r.status !== 'Elegível') return false;
      if (f.polo !== 'todos' && t.polo !== f.polo) return false;
      if (f.al && t.al !== f.al) return false;
      if (f.mun !== 'todos' && t.mun !== f.mun) return false;
      if (!f.classes.has(t.c)) return false;
      if (f.busca && !t.id.toUpperCase().includes(f.busca)) return false;
      if (!semFaixa && f.faixa && r.faixa !== f.faixa) return false;
      return true;
    });
  }
  function renderRanking() {
    const base = filtrar(true), lista = filtrar(false);
    const cont = { 1: [0, 0], 2: [0, 0], 3: [0, 0], 4: [0, 0] };
    for (const r of base) if (r.status === 'Elegível') { cont[r.faixa][0]++; cont[r.faixa][1] += r.t.km; }
    const nomes = { 1: 'P1 · executar', 2: 'P2 · alta', 3: 'P3 · média', 4: 'P4 · ciclo' };
    $('#resumo').innerHTML = [1, 2, 3, 4].map((n) =>
      '<button type="button" class="tile' + (S.f.faixa === n ? ' on' : '') + '" data-faixa="' + n + '" aria-pressed="' + (S.f.faixa === n) + '"><span class="t f' + n + '"><span class="ponto"></span>' + nomes[n] + '</span><span class="v">' + fmtN(cont[n][0]) + '</span><span class="k">' + fmtN(cont[n][1]) + ' km</span></button>').join('');
    const MAX = 200;
    $('#corpo').innerHTML = lista.length ? lista.slice(0, MAX).map((r) => {
      const t = r.t;
      const mv = r.mov === 'novo' ? '<span class="mov sobe">novo</span>' : r.mov > 0 ? '<span class="mov sobe">▲ ' + r.mov + '</span>' : r.mov < 0 ? '<span class="mov desce">▼ ' + -r.mov + '</span>' : '';
      return '<tr data-i="' + t.i + '" tabindex="0"' + (S.sel === t.i ? ' class="sel"' : '') + '>' +
        '<td class="r num muted">' + (r.pos ?? '—') + mv + '</td>' +
        '<td><span class="trecho-id">' + esc(t.id) + '</span><span class="sub">T' + t.c + ' · ' + fmtKm(t.km) + ' km · ' + esc(t.mun) + '</span></td>' +
        '<td>' + FAIXA(r.faixa) + '</td><td>' + barra(r) + '</td><td class="motivo">' + motivo(r) + '</td></tr>';
    }).join('') : '<tr><td colspan="5" class="vazio">Nenhum trecho com esses filtros.</td></tr>';
    $('#rodape').textContent = fmtN(Math.min(MAX, lista.length)) + ' de ' + fmtN(lista.length) + ' trechos, por faixa e score. Clique num trecho para ver o porquê.' + (pesosValidos() ? '' : ' Pesos fora de 100%: ranking com os últimos pesos válidos.');
    // computador: a ficha da direita nunca fica vazia; abre o primeiro trecho da lista
    if (S.sel === null && lista.length && !gaveta.matches) abrirFicha(lista[0].t.i, true);
  }
  $('#resumo').addEventListener('click', (e) => {
    const b = e.target.closest('[data-faixa]'); if (!b) return;
    const n = Number(b.dataset.faixa); S.f.faixa = S.f.faixa === n ? null : n; renderRanking();
  });
  $('#legenda').innerHTML = V.BLOCOS.map((b) => '<span><span class="amostra" style="background:' + b.cor + '"></span>' + b.nome + '</span>').join('') +
    '<span><span class="amostra" style="background:repeating-linear-gradient(45deg,var(--muted) 0 2px,transparent 2px 4px)"></span>Plano climático</span>';
  $('#corpo').addEventListener('click', (e) => { const tr = e.target.closest('tr[data-i]'); if (tr) abrirFicha(Number(tr.dataset.i)); });
  $('#corpo').addEventListener('keydown', (e) => { if (e.key === 'Enter') { const tr = e.target.closest('tr[data-i]'); if (tr) abrirFicha(Number(tr.dataset.i)); } });

  $('#copiar').addEventListener('click', (e) => {
    const lista = filtrar(false).slice(0, 500);
    const q = (s) => '"' + String(s).replace(/"/g, '""') + '"';
    const linhas = ['posicao;trecho;classe;polo;municipio;km;score;ch;ua;confianca;faixa;fila;situacao;regras;justificativa'];
    for (const r of lista) linhas.push([r.pos ?? '', q(r.t.id), 'T' + r.t.c, q(r.t.polo), q(r.t.mun), fmtKm(r.t.km), Math.floor(r.score), Math.round(r.CH), Math.round(r.UA), pct(r.conf), 'P' + r.faixa, r.fila, q(r.status), q(r.regras.map((g) => g.id).join(' ')), q(V.justificar(ctx, r, S.P, S.W))].join(';'));
    const txt = linhas.join('\n'), btn = e.currentTarget;
    const ok = () => { btn.textContent = 'Copiado: ' + fmtN(lista.length) + ' linhas'; setTimeout(() => { btn.textContent = 'Copiar ranking (CSV)'; }, 2500); };
    const falha = () => {
      const ta = document.createElement('textarea'); ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); ok(); } catch (err) { btn.textContent = 'Não foi possível copiar'; }
      ta.remove();
    };
    try { navigator.clipboard.writeText(txt).then(ok, falha); } catch (err) { falha(); }
  });

  // ---------- ficha do trecho ----------
  const gav = $('#gaveta'), fundo = $('#fundo');
  let focoAnterior = null;
  function fecharFicha() {
    if (!gav.classList.contains('aberta')) return;
    gav.classList.remove('aberta'); fundo.hidden = true;
    if (focoAnterior) focoAnterior.focus();
  }
  fundo.addEventListener('click', fecharFicha);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && gav.classList.contains('aberta')) fecharFicha(); });
  gaveta.addEventListener('change', () => { if (!gaveta.matches) { fecharFicha(); if (S.sel === null) renderRanking(); } });
  function abrirFicha(i, manter) {
    const r = S.out.res[i], t = r.t, f = r.f;
    if (!manter) focoAnterior = document.activeElement;
    S.sel = i;
    document.querySelectorAll('#corpo tr').forEach((tr) => tr.classList.toggle('sel', Number(tr.dataset.i) === i));
    const stNome = { real: 'dado real', est: 'estimado', falta: 'sem dado' };
    const linhasCrit = V.CRIT.map((c) => {
      const x = r.v[c.k], p = r.pts[c.k];
      return '<tr><td>' + esc(nomeCrit(c)) + '</td><td class="st-' + x.st + '">' + esc(x.dado) + '</td><td class="r num">' + (x.st === 'falta' ? '—' : x.s.toFixed(2).replace('.', ',')) + '</td><td class="r num">' + S.W[c.k] + '</td><td class="r num">' + (p === null ? '—' : fmt1((100 * p) / r.den)) + '</td><td class="st-' + x.st + '">' + stNome[x.st] + '</td></tr>';
    }).join('');
    const ocs = f.usadas.slice().sort((a, b) => b.d - a.d);
    const rgNome = ['chave do trecho', 'vão mais próximo', 'abrangência DJ'];
    const evOc = ocs.length ? '<div class="lista-ev"><table class="tab-mini"><thead><tr><th>Data</th><th class="r">Consum.</th><th class="r">Min</th><th>Tipo</th><th>Associação</th><th class="r">Peso</th></tr></thead><tbody>' +
      ocs.map((o) => '<tr><td class="num">' + V.dataDe(ctx, o.d) + '</td><td class="r num">' + fmtN(o.cons) + '</td><td class="r num">' + fmtN(o.dur) + '</td><td>' + (o.col ? 'coletiva' : 'individual') + '</td><td>' + rgNome[o.rg] + '</td><td class="r num">' + fmt1(o.w) + (o.pre ? ' *' : '') + '</td></tr>').join('') +
      '</tbody></table></div>' + (ocs.some((o) => o.pre) ? '<p class="dica">* anterior à última limpeza efetiva: peso reduzido.</p>' : '') : '<p class="dica">Nenhuma ocorrência por vegetação na janela.</p>';
    const sitN = { 1: 'executada', 2: 'criada', 3: 'reprogramar', 9: 'outra' };
    const evOs = t.os.length ? '<div class="lista-ev"><table class="tab-mini"><thead><tr><th>Data</th><th>OS</th><th>Situação</th><th class="r">Cobertura</th></tr></thead><tbody>' +
      t.os.slice().sort((a, b) => b[0] - a[0]).map((o) => '<tr><td class="num">' + V.dataDe(ctx, o[0]) + '</td><td class="mono">' + esc(o[3]) + '</td><td>' + sitN[o[1]] + '</td><td class="r num">' + pct(o[2]) + '</td></tr>').join('') + '</tbody></table></div>' : '<p class="dica">Nenhuma OS de limpeza de faixa associada.</p>';
    const val = validacoes[t.id];
    gav.innerHTML =
      '<div class="g-cab"><div class="g-topo"><div><span class="eyebrow">' + esc(t.se) + ' · ' + esc(t.polo) + '</span><h2 id="g-titulo">' + esc(t.id) + '</h2></div><button class="fechar" type="button" id="fechar">Fechar</button></div>' +
      '<div class="chips">' + FAIXA(r.faixa) + '<span class="chip">T' + t.c + '</span><span class="chip">' + fmtKm(t.km) + ' km</span><span class="chip">' + esc(t.mun) + '</span><span class="chip">' + esc(r.fila) + '</span><span class="chip estado">' + esc(r.status) + (r.pos ? ' · #' + r.pos : '') + '</span></div></div>' +
      '<div class="kpis"><div class="kpi"><span>Score</span><b>' + Math.floor(r.score) + '</b></div><div class="kpi"><span>Criticidade histórica</span><b>' + Math.round(r.CH) + '</b></div><div class="kpi"><span>Urgência atual</span><b>' + Math.round(r.UA) + '</b></div><div class="kpi"><span>Confiança</span><b>' + pct(r.conf) + '</b></div></div>' +
      barra(r) +
      '<section><h3>Justificativa</h3><p class="just" style="margin-top:8px">' + esc(V.justificar(ctx, r, S.P, S.W)) + '</p></section>' +
      '<section><h3>Regras aplicadas</h3>' + (r.regras.length ? '<ul class="regras" style="margin-top:8px">' + r.regras.map((g) => '<li><span class="chip ' + g.tipo + '">' + g.id + '</span><span>' + esc(g.txt) + '</span></li>').join('') + '</ul>' : '<p class="dica" style="margin-top:8px">Nenhuma regra disparou; a faixa vem só do score.</p>') + '</section>' +
      '<section><h3>Critérios</h3><div class="tabela-wrap" style="margin-top:8px"><table class="tab-mini"><thead><tr><th>Critério</th><th>Dado</th><th class="r">0–1</th><th class="r">Peso %</th><th class="r">Pontos</th><th>Fonte</th></tr></thead><tbody>' + linhasCrit + '</tbody></table></div>' +
      '<p class="dica" style="margin-top:6px">Pontos = peso × valor 0–1 ÷ soma dos pesos com dado × 100. O score é a soma dos pontos' + (r.bonus ? ' mais o bônus do plano' : '') + '.</p></section>' +
      '<section class="excecoes"><h3>Testar exceções</h3>' +
      '<label><input type="checkbox" id="x-ga"' + (S.flags.ga.has(t.i) ? ' checked' : '') + '> Há cliente Grupo A ou essencial a jusante</label>' +
      '<label><input type="checkbox" id="x-plano"' + (S.flags.plano.has(t.i) ? ' checked' : '') + '> Incluir este trecho no plano climático</label></section>' +
      '<section><h3>Ocorrências usadas</h3><div style="margin-top:8px">' + evOc + '</div></section>' +
      '<section><h3>Limpezas de faixa</h3><div style="margin-top:8px">' + evOs + '</div></section>' +
      '<section class="validacao"><h3>Validação técnica</h3><div class="val-botoes">' +
      [['Aprovado', 'Aprovar'], ['Adiado', 'Adiar'], ['Rejeitado', 'Rejeitar']].map(([d, rot]) => '<button type="button" class="botao" data-dec="' + d + '" aria-pressed="' + Boolean(val && val.decisao === d) + '">' + rot + '</button>').join('') + '</div>' +
      '<div class="campo"><label for="v-motivo">Motivo</label><select id="v-motivo"><option>Confirmo a prioridade</option><option>Executado e não registrado</option><option>Sem acesso ou autorização</option><option>Aguardar inspeção</option><option>Dado incorreto</option><option>Outro</option></select></div>' +
      '<div class="campo"><label for="v-obs">Observação</label><input type="text" id="v-obs" value="' + esc(val ? val.obs : '') + '"></div>' +
      '<p class="val-reg">' + (val ? esc(val.decisao + ' em ' + val.quando + ' · ' + val.motivo + ' · score ' + val.score + ' · metodologia ' + val.perfil) : 'Registro guardado só neste navegador (teste). No sistema real vai para validacao_tecnica com usuário e data.') + '</p></section>';
    if (val) $('#v-motivo').value = val.motivo;
    if (gaveta.matches && !manter) { gav.classList.add('aberta'); fundo.hidden = false; $('#fechar').focus(); }
    $('#fechar').addEventListener('click', fecharFicha);
    $('#x-ga').addEventListener('change', (e) => { e.target.checked ? S.flags.ga.add(t.i) : S.flags.ga.delete(t.i); recalcular(); });
    $('#x-plano').addEventListener('change', (e) => { e.target.checked ? S.flags.plano.add(t.i) : S.flags.plano.delete(t.i); recalcular(); });
    gav.querySelectorAll('[data-dec]').forEach((b) => b.addEventListener('click', () => {
      validacoes[t.id] = { decisao: b.dataset.dec, motivo: $('#v-motivo').value, obs: $('#v-obs').value, quando: new Date().toLocaleString('pt-BR'), score: Math.floor(r.score), perfil: V.PERFIS[S.perfil].nome };
      salvarVal(); abrirFicha(i, true); renderRanking();
    }));
  }

  // ---------- pacotes ----------
  function renderPacotes() {
    const o = Object.assign({}, S.pk, { limAprov: S.pk.limAprov / 100 });
    const { pacotes, elegiveis } = V.pacotes(ctx, S.out.ranked, o);
    const totKm = pacotes.reduce((s, p) => s + p.km, 0), ind = pacotes.reduce((s, p) => s + p.deslInd, 0), pac = pacotes.reduce((s, p) => s + p.deslPac, 0);
    const nTre = pacotes.reduce((s, p) => s + p.membros.length, 0), nAp = pacotes.reduce((s, p) => s + p.membros.filter((m) => m.aprov).length, 0);
    $('#pk-resumo').innerHTML = '<span><b>' + fmtN(pacotes.length) + '</b> pacotes</span><span><b>' + fmtN(nTre) + '</b> trechos (' + fmtN(nAp) + ' por aproveitamento)</span><span><b>' + fmt1(totKm) + '</b> km de faixa</span><span>Deslocamento estimado <b>' + fmtN(pac) + ' km</b> contra ' + fmtN(ind) + ' km em visitas separadas</span><span>' + fmtN(elegiveis) + ' trechos P1–P3 elegíveis no polo</span>';
    $('#pk-lista').innerHTML = pacotes.length ? pacotes.map((p, j) => {
      const L = p.lider, efic = p.deslPac > 0 ? p.km / p.deslPac : 0;
      return '<article class="pk"><div class="pk-cab">' + FAIXA(L.faixa) + '<h3>Pacote ' + (j + 1) + ' · líder ' + esc(L.t.id) + ' (#' + L.pos + ', score ' + Math.floor(L.score) + ')</h3></div>' +
        '<div class="pk-meta"><span><b>' + fmt1(p.km) + '</b> km de faixa</span><span><b>' + p.membros.length + '</b> trecho(s)</span><span>Saída: <b>' + esc(p.base) + '</b></span><span>Equipe provável: <b>' + esc(p.equipe || '—') + '</b></span><span>Deslocamento <b>' + fmtN(p.deslPac) + ' km</b> (separado: ' + fmtN(p.deslInd) + ' km)</span><span>Eficiência <b>' + fmt1(efic) + '</b> km faixa/km estrada</span></div>' +
        '<div class="tabela-wrap"><table class="tab-mini"><thead><tr><th>Trecho</th><th>Município</th><th class="r">km</th><th class="r">Score</th><th>Faixa</th><th class="r">Dist. do líder</th><th>Entrada</th></tr></thead><tbody>' +
        p.membros.map((m) => '<tr data-i="' + m.r.t.i + '"><td class="trecho-id">' + esc(m.r.t.id) + '</td><td>' + esc(m.r.t.mun) + '</td><td class="r num">' + fmtKm(m.r.t.km) + '</td><td class="r num">' + Math.floor(m.r.score) + '</td><td>' + FAIXA(m.r.faixa) + '</td><td class="r num">' + (m.dist ? fmt1(m.dist) + ' km' : 'líder') + '</td><td>' + (m.dist === 0 && m.r === L ? 'prioridade' : m.aprov ? 'aproveitamento' : 'mesma faixa') + '</td></tr>').join('') +
        '</tbody></table></div></article>';
    }).join('') : '<p class="vazio">Nenhum trecho P1–P3 elegível neste polo.</p>';
  }
  $('#pk-lista').addEventListener('click', (e) => { const tr = e.target.closest('tr[data-i]'); if (tr) abrirFicha(Number(tr.dataset.i)); });

  // ---------- dados e validação ----------
  const E = D.estat;
  $('#fontes').innerHTML = [
    '<b>' + fmtN(D.alims.length) + '</b> alimentadores · ' + fmtN(E.T1 + E.T2 + E.T3) + ' trechos',
    'Crítica <b>jan–ago/2026</b> · ' + fmtN(Object.values(D.saz).reduce((a, b) => a + b, 0)) + ' ocorrências por vegetação',
    'OS de limpeza desde <b>' + D.os_inicio.split('-').reverse().slice(1).join('/') + '</b>',
  ].map((s) => '<li>' + s + '</li>').join('');
  const kmTot = E.km_T1 + E.km_T2 + E.km_T3;
  $('#tab-fontes').innerHTML = [
    ['Rede (GIS processado no protótipo /teste/)', fmtN(D.alims.length) + ' alimentadores, ' + fmtN(E.T1) + ' T1, ' + fmtN(E.T2) + ' T2, ' + fmtN(E.T3) + ' T3, ' + fmtN(kmTot) + ' km', 'Classe, extensão, município, polo, centro do trecho'],
    ['Crítica (causa árvore)', fmtN(Object.values(D.saz).reduce((a, b) => a + b, 0)) + ' ocorrências de jan a ago/2026; ' + fmtN(D.nae_fora) + ' sem trecho associado', 'NAE, DEC (consumidor·hora), FEC (consumidores interrompidos)'],
    ['OS de limpeza de faixa', 'Planilha de OS desde ' + D.os_inicio.split('-').reverse().join('/') + ', cobertura por vão estimada pela descrição', 'Última limpeza, carência, OS abertas'],
    ['Inspeções do app de campo', fmtN(D.insp_total) + ' registros (jul–ago/2026), ' + fmtN(D.insp_casadas) + ' ligados a um poste da rede MT', 'Fora do score: não há medição de distância confiável'],
    ['Sem fonte na base', 'Grupo A e essenciais, classe de vegetação, produtividade por tipo de equipe, disponibilidade de equipes, plano climático, emergências do centro de operação', 'Marcação manual no teste ou parâmetro'],
  ].map((l) => '<tr><td>' + l[0] + '</td><td>' + l[1] + '</td><td>' + l[2] + '</td></tr>').join('');
  $('#recorte').textContent = 'Recorte do teste: ' + fmtN(D.trechos.length) + ' trechos (todos os T1 e T2 e os T3 com ocorrência, OS ou inspeção). Ficaram de fora ' + fmtN(D.fora_recorte.n) + ' T3 (' + fmtN(D.fora_recorte.km) + ' km) sem nenhum desses sinais; no sistema real eles entram e caem em P4 pelo ciclo.';
  $('#qualidade').innerHTML = [
    'A distância à MT “0” aparece junto com distância à AT “0” em quase todos os registros, então foi lida como “não informado”. O formulário precisa separar “contato” de “não se aplica”.',
    'O app mostra a distância em “cm” na exportação e em “m” em uma das telas do histórico.',
    'As inspeções são quase todas de área urbana (Enecol Centro); o risco rural ainda não tem medição de campo.',
    fmtN(D.alims.filter((a) => !a[3]).length) + ' alimentadores sem polo no cadastro.',
    fmtN(D.nae_fora) + ' ocorrências (' + pct(D.nae_fora / Object.values(D.saz).reduce((a, b) => a + b, 0)) + ') sem trecho associado: ativo fora do cadastro atual.',
    'A OS não traz o traçado; a cobertura é estimada pelos ativos citados e pelos km da descrição.',
    'Nenhuma das 2.615 OS de limpeza informa o tipo de equipe (manual ou mecanizada) nem o tipo de vegetação. Só 267 trazem a categoria do defeito (galhos em contato, obstruindo a faixa, projeção de queda, dificultando acesso) com a severidade.',
    'Ocorrências com abrangência DJ caem no T1 inteiro; em T1 muito curto o local real da falha é incerto (alerta Q4).',
  ].map((s) => '<li>' + esc(s) + '</li>').join('');

  function grafSaz() {
    const meses = Object.keys(D.saz), vals = meses.map((m) => D.saz[m]);
    const NOMES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
    const W = 640, H = 240, ml = 44, mr = 12, mt = 26, mb = 30, max = 1200, iw = W - ml - mr, ih = H - mt - mb, bw = iw / vals.length;
    const y = (v) => mt + ih - (v / max) * ih;
    let s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Ocorrências por vegetação por mês em 2026">';
    for (const g of [0, 300, 600, 900, 1200]) s += '<line x1="' + ml + '" x2="' + (W - mr) + '" y1="' + y(g) + '" y2="' + y(g) + '"></line><text x="' + (ml - 6) + '" y="' + (y(g) + 4) + '" text-anchor="end">' + fmtN(g) + '</text>';
    vals.forEach((v, j) => {
      const x = ml + j * bw + bw * 0.18, w = bw * 0.64, h = mt + ih - y(v);
      s += '<rect class="b" data-j="' + j + '" x="' + x.toFixed(1) + '" y="' + y(v).toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + h.toFixed(1) + '" rx="3"></rect>';
      s += '<rect data-j="' + j + '" x="' + (ml + j * bw).toFixed(1) + '" y="' + mt + '" width="' + bw.toFixed(1) + '" height="' + ih + '" fill="transparent"></rect>';
      s += '<text x="' + (ml + j * bw + bw / 2).toFixed(1) + '" y="' + (H - 10) + '" text-anchor="middle">' + NOMES[Number(meses[j].slice(5)) - 1] + '</text>';
      if (j === 0 || j === vals.length - 1) s += '<text class="rotv" x="' + (ml + j * bw + bw / 2).toFixed(1) + '" y="' + (y(v) - 6).toFixed(1) + '" text-anchor="middle">' + fmtN(v) + '</text>';
    });
    s += '</svg>';
    const el = $('#graf-saz');
    el.innerHTML = '<h3 style="margin-bottom:8px">Ocorrências por vegetação por mês · Crítica 2026</h3>' + s + '<div class="valores">' + meses.map((m, j) => '<span>' + NOMES[Number(m.slice(5)) - 1] + ' ' + fmtN(vals[j]) + '</span>').join('') + '</div><p class="dica" style="margin-top:6px">Janeiro tem ' + fmt1(vals[0] / vals[vals.length - 1]) + ' vezes as ocorrências de agosto: o fim do período chuvoso concentra o risco.</p>';
    const tip = document.createElement('div'); tip.className = 'tip'; tip.hidden = true; el.appendChild(tip);
    const svg = el.querySelector('svg');
    svg.addEventListener('mousemove', (e) => {
      const r = e.target.closest('rect[data-j]');
      svg.querySelectorAll('rect.b').forEach((b) => b.classList.toggle('hover', r && b.dataset.j === r.dataset.j));
      if (!r) { tip.hidden = true; return; }
      const j = Number(r.dataset.j), tot = vals.reduce((a, b) => a + b, 0);
      tip.textContent = NOMES[Number(meses[j].slice(5)) - 1] + '/2026 · ' + fmtN(vals[j]) + ' ocorrências · ' + pct(vals[j] / tot) + ' do período';
      const box = el.getBoundingClientRect(); tip.hidden = false;
      tip.style.left = Math.min(e.clientX - box.left + 12, box.width - tip.offsetWidth - 8) + 'px'; tip.style.top = (e.clientY - box.top - 34) + 'px';
    });
    svg.addEventListener('mouseleave', () => { tip.hidden = true; svg.querySelectorAll('rect.b').forEach((b) => b.classList.remove('hover')); });
  }

  let retroPendente = true;
  function renderRetro() {
    if (!retroPendente) return;
    retroPendente = false;
    $('#tab-retro').innerHTML = '<tr><td colspan="6" class="vazio">Calculando…</td></tr>';
    setTimeout(() => {
      const rt = V.retroativo(ctx, Wef(), S.P, '2026-04-30', '2026-08-31');
      const nomes = { score: 'Score desta metodologia', nae: 'Só número de ocorrências', km: 'Só extensão' };
      $('#tab-retro').innerHTML = rt.linhas.map((l) => ['score', 'nae', 'km'].map((k, j) => {
        const x = l[k];
        return '<tr>' + (j === 0 ? '<td rowspan="3" class="num"><b>' + fmtN(l.q * 100) + '%</b><span class="sub">' + fmtN(x.n) + ' trechos</span></td>' : '') + '<td>' + (k === 'score' ? '<b>' + nomes[k] + '</b>' : nomes[k]) + '</td><td class="r num">' + fmt1(x.oc * 100) + '%</td><td class="r num">' + fmt1(x.chi * 100) + '%</td><td class="r num">' + fmt1(x.km * 100) + '%</td><td class="r num">' + fmt1(x.km ? x.chi / x.km : 0) + '</td></tr>';
      }).join('')).join('');
      $('#retro-nota').textContent = fmtN(rt.total) + ' ocorrências e ' + fmtN(rt.totalH) + ' consumidor·hora entre 01/05 e 31/08/2026 nos ' + fmtN(rt.n) + ' trechos do recorte. A última coluna mostra quanto consumidor·hora futuro cada % de extensão priorizada captou (1,0 = igual ao acaso por km). Limites: só 4 meses de janela futura, limpezas feitas no meio do período e associação aproximada da falha ao trecho.';
    }, 30);
  }

  // ---------- seções do rodapé ----------
  $('#sec-pacotes').addEventListener('toggle', (e) => { if (e.target.open) renderPacotes(); });
  $('#sec-dados').addEventListener('toggle', (e) => { if (e.target.open) renderRetro(); });
  function abrirSecao() {
    const sec = { premissas: 'sec-premissas', opcoes: 'sec-opcoes', pacotes: 'sec-pacotes', metodologia: 'sec-metodologia', dados: 'sec-dados' }[location.hash.slice(1)];
    if (sec) { const d = document.getElementById(sec); d.open = true; d.scrollIntoView(); }
  }
  window.addEventListener('hashchange', abrirSecao);


  // ---------- ranking de alimentadores por NAE (window.RANK de ranking-nae.js; ficava na página inicial) ----------
  // O mesmo ranking da página inicial antiga; clicar num alimentador filtra os trechos dele no centro.
  {
    const R = window.RANK, M = window.MUN, rank = $('#rank');
    const noSite = /(^|\.)github\.io$|^localhost$|^127\.0\.0\.1$/.test(location.hostname);
    const SITE = noSite ? '../' : 'https://lgrsv.github.io/vera-vegeta-o-back/teste/';
    const porCod = Object.fromEntries(((M && M.muns) || []).map((m) => [m.cod, m]));
    const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
    const rotMes = (m) => `${MES[+m.slice(5, 7) - 1]}/${m.slice(0, 4)}`;
    const nf = (n) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
    const ORD = {
      nae: { rot: 'NAE', val: (a) => a.nae, un: 'NAE' },
      cons: { rot: 'Consumidores', val: (a) => a.cons, un: 'cons.' },
      // NAE/100 km: a NAE da mesma rede dos km (nae_rede: onde o ativo está hoje no GIS, ferramentas/nae_rede.py)
      km: { rot: 'NAE/100 km', val: (a) => a.km ? (a.nae_rede ?? a.nae) / a.km * 100 : 0, un: '/100 km' },
    };
    let ord = 'nae', mostra = 10;
    const slugDe = (cod) => (porCod[cod] || {}).slug;
    const nomesDe = (a) => a.muns.map((c) => (porCod[c] || {}).nome || c);
    const hoje = new Date();
    const anosDesde = (d) => d ? (hoje - new Date(d + 'T00:00:00')) / 31557600000 : Infinity;
    const largo = matchMedia('(min-width:1340px)');          // coluna da esquerda: lista inteira com rolagem; senão, de 10 em 10
    const doAl = (cod) => R.als.find((a) => a.al === cod);
    function pintaRank() {
      const o = ORD[ord];
      const ls = R.als.slice().sort((a, b) => o.val(b) - o.val(a) || b.nae - a.nae);
      const vis = largo.matches ? ls : ls.slice(0, mostra);
      const max = Math.max(...ls.map(o.val), 1);
      rank.innerHTML = `<h2 class="pz-h2">Alimentadores com mais NAE<small>Árvore/eucalipto na rede · ${R.meses.length ? rotMes(R.meses[0]) + ' a ' + rotMes(R.meses[1]) : ''}${ord === 'km' ? ' · NAE contada no alimentador onde o ativo está hoje no GIS' : ''} · clique para ver os trechos</small></h2>
        <div class="mt-ord" role="group" aria-label="Ordenar por">${Object.entries(ORD).map(([k, x]) => `<button type="button" data-o="${k}" aria-pressed="${k === ord}">${x.rot}</button>`).join('')}</div>
        <ol class="mt-rl">${vis.map((a, i) => {
          const v = o.val(a), nomes = nomesDe(a);
          const velha = anosDesde(a.ult_limpeza) > 3;
          return `<li><button type="button" class="mt-ra${a.nae ? '' : ' zero'}" data-al="${esc(a.al)}" aria-pressed="${S.f.al === a.al}">
            <span class="p">${i + 1}º</span><b>${esc(a.al)}</b><span class="v">${nf(v)}<small>${o.un}</small></span>
            <span class="se">${esc(a.se)} · ${esc(nomes.slice(0, 3).join(', '))}${nomes.length > 3 ? ` e mais ${nomes.length - 3}` : ''}</span>
            <span class="bar"><i style="width:${100 * v / max}%"></i></span>
            <span class="ex">${a.nae} NAE${ord === 'km' && a.nae_rede !== undefined && a.nae_rede !== a.nae ? ` (${a.nae_rede} com o ativo nesta rede)` : ''} · ${a.cons.toLocaleString('pt-BR')} cons. · ${a.km >= 1 ? nf(a.km) : a.km.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} km · <span class="lp">limpeza: <em class="${velha ? 'velha' : ''}">${a.ult_limpeza ? a.ult_limpeza.split('-').reverse().join('/') : 'sem registro'}</em></span></span></button></li>`;
        }).join('')}</ol>${vis.length < ls.length ? `<button type="button" class="mt-mais" data-mais>Mostrar mais ${Math.min(20, ls.length - vis.length)} (de ${ls.length})</button>` : ''}`;
    }
    // chip do filtro na barra: o alimentador escolhido, quantos trechos dele estão na fila e o link para a página dele no site
    function chipAl() {
      const el = $('#f-al'), cod = S.f.al;
      el.hidden = !cod;
      if (!cod) { el.innerHTML = ''; return; }
      const a = doAl(cod), slug = a && a.muns.map(slugDe).find(Boolean);
      const n = S.out ? S.out.ranked.filter((r) => r.t.al === cod && r.status === 'Elegível').length : 0;
      el.innerHTML = '<span>Alimentador <b>' + esc(cod) + '</b> · ' + fmtN(n) + ' trecho' + (n === 1 ? '' : 's') + ' na fila</span>' +
        '<a href="' + SITE + 'alimentadores/' + esc(cod) + '/' + (slug ? '?m=' + esc(slug) : '') + '"' + (noSite ? '' : ' target="_blank" rel="noopener"') + '>Abrir no mapa</a>' +
        '<button type="button" data-tira aria-label="Tirar o filtro do alimentador">×</button>';
    }
    function filtraAl(cod) {
      S.f.al = cod && S.f.al !== cod ? cod : null;
      S.sel = null;
      pintaRank(); chipAl(); renderRanking();
      if (gaveta.matches && S.f.al) $('#pz-centro').scrollIntoView({ block: 'start' });
    }
    rank.addEventListener('click', (e) => {
      const b = e.target.closest('[data-o],[data-mais],[data-al]');
      if (!b) return;
      if (b.dataset.al) { filtraAl(b.dataset.al); rank.querySelector(`[data-al="${CSS.escape(b.dataset.al)}"]`)?.focus({ preventScroll: true }); return; }
      if (b.dataset.o) ord = b.dataset.o; else mostra += 20;
      pintaRank();
      if (b.hasAttribute('data-mais')) rank.querySelectorAll('.mt-ra')[mostra - 20]?.focus();   // foco no 1º item novo
      else rank.querySelector(`[data-o="${ord}"]`)?.focus();                                      // o botão escolhido continua com o foco
    });
    $('#f-al').addEventListener('click', (e) => { if (e.target.closest('[data-tira]')) { filtraAl(null); $('#f-busca').focus(); } });
    largo.addEventListener('change', pintaRank);
    if (R && R.als.length) pintaRank(); else rank.remove();
    const recalcularAntes = recalcular;
    recalcular = function () { recalcularAntes(); chipAl(); };
  }

  perfilSel.value = S.perfil;
  dicaPerfil(); desenharPesos(); preencherParams(); grafSaz();
  S.out = V.avaliar(ctx, Wef(), S.P, S.flags);
  renderRanking();
  abrirSecao();
})();
