// Relatório de Manutenção (pedido do usuário): no modo Limpeza de faixa (Ctrl+M, modo-faixa-rascunho.js), o que estiver
// escolhido no mapa (trechos inteiros ou a parte entre o ponto inicial e o final, ferramenta "Parte") com um período (mês
// de início e de fim) vira duas saídas:
//   · Dados (Excel): resumo, manutenções executadas, ocorrências, por mês e por ativo;
//   · Relatório (PDF): capa com o mapa do caminho, números, gráfico por mês, causas, serviços, ativos com mais registros
//     e as listas completas. Não havia modelo da distribuidora: o formato é este.
// Modo manutenção (Ctrl+I, pedido do usuário): o mesmo escolher do Ctrl+M, com este relatório embutido no painel do modo
// (painel(): período, números, Excel e PDF) e as manutenções e ocorrências do escolhido marcadas no mapa (passar o mouse
// mostra o que é), atualizados a cada trecho escolhido ou tirado.
// Este arquivo só é baixado quando o botão "Relatório de manutenção" do painel do modo é tocado (window.__relManut).
// Fontes: as OS executadas do alimentador (executadas.js, scripts/executadas.py: corretivas MC e preventivas MP) e as
// ocorrências de todas as causas da Crítica (ocorrencias.js do alimentador, scripts/ocorrencias.py), baixadas aqui.
// Regra de "no caminho" (pedido do usuário: só as localizadas nele): o ponto do ativo da OS ou da ocorrência fica a até
// TOL m da rede escolhida e não mais perto de outra parte da rede. Desligamento do alimentador inteiro (abrangência DJ ou
// SE) não tem lugar: fica fora e aparece contado à parte; OS sem ativo no mapa também. OS "NAE DEOP" (data padrão de
// 03/01/2025, executadas.js) ficam fora do período e contadas à parte. OS espelho (mesmo serviço aberto pela
// distribuidora e pela contratada: mesmo tipo, ativo, data e descrição) contam uma vez; o número das outras vai junto.
(function () {
  const D = window.D, M = (D && D.meta) || {};
  if (!D || !Array.isArray(D.vaos)) return;
  const V = D.vaos, T = D.trechos;
  const TOL = 60;                                                    // m da rede escolhida
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const nf = (n, d = 0) => (+n || 0).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
  const br = d => d ? d.slice(0, 10).split('-').reverse().join('/') : '—';
  const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const mesTxt = m => m ? `${MES[+m.slice(5, 7) - 1]}/${m.slice(0, 4)}` : '—';
  const mesCurto = m => `${MES[+m.slice(5, 7) - 1]}/${m.slice(2, 4)}`;
  const somaMes = (m, k) => { const d = new Date(+m.slice(0, 4), +m.slice(5, 7) - 1 + k, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
  const mesesEntre = (a, b) => { const r = []; for (let m = a; m <= b && r.length < 600; m = somaMes(m, 1)) r.push(m); return r; };
  const hojeTxt = () => { const d = new Date(); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`; };
  const arq = s => String(s ?? '').replace(/[^\w.-]+/g, '_');

  // ---------- dados do alimentador ----------
  const carrega = (src, nome) => window[nome] ? Promise.resolve(window[nome]) : new Promise(ok => {
    const s = document.createElement('script'); s.src = src;
    s.onload = s.onerror = () => ok(window[nome] || null);
    document.head.append(s);
  });
  const fontes = () => Promise.all([carrega('executadas.js', 'EXECUTADAS'), carrega('ocorrencias.js', 'OCORRENCIAS')]);

  // ---------- o escolhido no mapa e a regra de "no caminho" ----------
  // esc: { nomes, parte: {nome: true}, m, runs: [[vão, t0, t1]] } (window.__faixa.escolhaGeo, frações 0..1 do vão)
  function geometria(e) {
    const lat0 = V.length ? V[0][0] : 0, kx = 111320 * Math.cos(lat0 * Math.PI / 180), ky = 110540;
    const seg = (a, b) => [a[1] * kx, a[0] * ky, b[1] * kx, b[0] * ky];
    const ponto = (v, t) => [v[0] + (v[2] - v[0]) * t, v[1] + (v[3] - v[1]) * t];
    const sel = e.runs.map(([i, t0, t1]) => seg(ponto(V[i], t0), ponto(V[i], t1)));
    const todos = V.map(v => seg([v[0], v[1]], [v[2], v[3]]));
    const dist = (L, x, y) => {                                      // menor distância (m) do ponto aos segmentos de L
      let m = Infinity;
      for (const s of L) {
        if ((s[0] < x - m && s[2] < x - m) || (s[0] > x + m && s[2] > x + m) || (s[1] < y - m && s[3] < y - m) || (s[1] > y + m && s[3] > y + m)) continue;
        const dx = s[2] - s[0], dy = s[3] - s[1], l = dx * dx + dy * dy;
        let t = l ? ((x - s[0]) * dx + (y - s[1]) * dy) / l : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
        const d = Math.hypot(s[0] + t * dx - x, s[1] + t * dy - y); if (d < m) m = d;
      }
      return m;
    };
    const cache = new Map();
    // no caminho: até TOL m da escolha e não mais perto de outra parte da rede (1 m de folga)
    return (lat, lon) => {
      if (lat == null || lon == null || !isFinite(lat) || !isFinite(lon)) return false;
      const k = lat.toFixed(6) + ',' + lon.toFixed(6);
      if (cache.has(k)) return cache.get(k);
      const x = lon * kx, y = lat * ky, ds = dist(sel, x, y), r = ds <= TOL && ds <= dist(todos, x, y) + 1;
      cache.set(k, r); return r;
    };
  }

  // ---------- o que cai no caminho, no período ----------
  const NOME_AT = { poste: 'Poste', TR: 'Transformador', DJ: 'Disjuntor', 79: 'Religador', 40: 'Trip saver', 41: 'Trip saver', '03': 'Fusível', 33: 'Fusível', SEC: 'Fusível', 88: 'Chave', 80: 'Chave faca', '02': 'Chave' };
  const SIGLAS = /\b(rd|rdr|rdu|eed|mt|bt|se|at|ld|al|tr|uc|ii|iii)\b/g;   // siglas ficam em maiúsculas
  const nomeTipo = t => { const s = String(t).replace(/^M[CP] - /, '').replace(/\s+-\s*|\s*-\s+/g, ' - '); return (s.charAt(0) + s.slice(1).toLowerCase()).replace(SIGLAS, m => m.toUpperCase()).replace(/ - $/, ''); };
  const classe = t => String(t).startsWith('MP') ? 'Preventiva' : 'Corretiva';
  const ABR = { UC: 'UC', TR: 'Transformador', 'TR PART': 'Transformador particular', CH: 'Chave', 'CH FUS': 'Fusível', 'CH FUS REL': 'Fusível religador', 'CH REL': 'Religador',
    RL: 'Religador', 'CH FACA': 'Chave faca', 'CH BYPASS': 'Chave bypass', 'CH SEC': 'Seccionalizadora', DJ: 'Disjuntor', SE: 'Subestação' };
  const abrTxt = a => ABR[a] || String(a || '').charAt(0) + String(a || '').slice(1).toLowerCase();
  // o tipo do ATIVO da ocorrência (a abrangência UC é do transformador que atende a UC)
  const tipoAtivoOc = a => /^(UC|TR)\b/.test(a) ? 'Transformador' : /^(CH FUS|CH SEC)/.test(a) ? 'Fusível' : /^(RL|CH REL)$/.test(a) ? 'Religador' : abrTxt(a);
  // causa e subcausa num texto só ("Causa nao identificada · Causa nao identificada - especificar" fica só a subcausa)
  const causaTxt = o => !o.sub ? o.causa : o.sub.toUpperCase().startsWith(o.causa.toUpperCase()) ? o.sub : `${o.causa} · ${o.sub}`;
  function coleta(e, de, ate, EX, OC) {
    const no = geometria(e), r = { de, ate, os: [], oc: [], fora: { osSemLocal: 0, deop: 0, dj: 0, ocSemLocal: 0 } };
    if (EX) {
      const AT = EX.ativos, grupos = new Map();
      EX.os.forEach(o => {
        const deop = /\bNAE DEOP\b/i.test(o[5] || ''), m = (o[2] || '').slice(0, 7);
        if (deop) { if (o[4] >= 0 && no(AT[o[4]][3], AT[o[4]][4])) r.fora.deop++; return; }
        if (!m || m < de || m > ate) return;
        if (o[4] < 0) { r.fora.osSemLocal++; return; }
        const a = AT[o[4]]; if (!no(a[3], a[4])) return;
        const k = o[1] + '|' + o[2] + '|' + o[4] + '|' + o[5];          // serviço: as OS espelho contam uma vez
        const g = grupos.get(k);
        if (g) { g.espelho.push(o[0]); return; }
        const s = { os: o[0], espelho: [], tipo: EX.tipos[o[1]] || '', data: o[2], equipe: o[3] || '', desc: o[5] || '', crit: o[6] || '',
          ativo: a[0], tipoAt: NOME_AT[a[1]] || 'Chave', trecho: a[2] || '', lat: a[3], lon: a[4] };
        grupos.set(k, s); r.os.push(s);
      });
      r.os.sort((a, b) => a.data < b.data ? 1 : a.data > b.data ? -1 : 0);
    }
    if (OC) {
      OC.oc.forEach(x => {
        const m = x[0].slice(0, 7); if (m < de || m > ate) return;
        if (x[1] === 'DJ' || x[1] === 'SE') { r.fora.dj++; return; }
        if (x[10] == null) { r.fora.ocSemLocal++; return; }
        if (!no(x[10], x[9])) return;
        r.oc.push({ abert: x[0], abr: x[1], ativo: x[2], causa: OC.causas[x[3]] || '', sub: OC.subs[x[4]] || '', cons: x[5], dur: x[6], chi: x[7],
          trecho: x[8], lon: x[9], lat: x[10], col: !!(x[11] & 1), prog: !!(x[11] & 2), mom: !!(x[11] & 4), longa: !!(x[11] & 8) });
      });
      r.oc.sort((a, b) => a.abert < b.abert ? 1 : a.abert > b.abert ? -1 : 0);
    }
    // por mês, causas, serviços, ativos
    r.meses = mesesEntre(de, ate).map(m => ({ m, os: 0, oc: 0, cons: 0, chi: 0 }));
    const im = new Map(r.meses.map((x, i) => [x.m, i]));
    r.os.forEach(s => { const i = im.get(s.data.slice(0, 7)); if (i !== undefined) r.meses[i].os++; });
    r.oc.forEach(o => { const i = im.get(o.abert.slice(0, 7)); if (i !== undefined) { const x = r.meses[i]; x.oc++; x.cons += o.cons; x.chi += o.chi; } });
    const conta = (l, k, f) => { const m = new Map(); l.forEach(x => { const c = k(x); const y = m.get(c) || m.set(c, { k: c, n: 0, cons: 0, chi: 0 }).get(c); y.n++; if (f) f(y, x); }); return [...m.values()].sort((a, b) => b.n - a.n || b.chi - a.chi); };
    r.causas = conta(r.oc, causaTxt, (y, o) => { y.cons += o.cons; y.chi += o.chi; });
    r.servicos = conta(r.os, s => s.tipo);
    const at = new Map(), poe = (cod, tipo, trecho) => at.get(cod) || at.set(cod, { cod, tipo, trecho, os: 0, oc: 0, cons: 0, ultOs: '', ultOc: '' }).get(cod);
    r.os.forEach(s => { const a = poe(s.ativo, s.tipoAt, s.trecho); a.os++; if (s.data > a.ultOs) a.ultOs = s.data; });
    r.oc.forEach(o => { if (!o.ativo) return; const a = poe(o.ativo, tipoAtivoOc(o.abr), o.trecho); a.oc++; a.cons += o.cons; if (o.abert > a.ultOc) a.ultOc = o.abert; if (!a.trecho) a.trecho = o.trecho; });
    r.ativos = [...at.values()].sort((a, b) => (b.os + b.oc) - (a.os + a.oc) || b.oc - a.oc);
    r.tot = { os: r.os.length, osNum: r.os.reduce((n, s) => n + 1 + s.espelho.length, 0), corr: r.os.filter(s => classe(s.tipo) === 'Corretiva').length,
      oc: r.oc.length, col: r.oc.filter(o => o.col).length, cons: r.oc.reduce((n, o) => n + o.cons, 0), chi: r.oc.reduce((n, o) => n + o.chi, 0),
      durMed: r.oc.length ? r.oc.reduce((n, o) => n + o.dur, 0) / r.oc.length : 0 };
    r.tot.prev = r.tot.os - r.tot.corr;
    return r;
  }

  // ---------- informações do escolhido ----------
  function info(e) {
    const nomeMun = Object.fromEntries((M.municipios || []).map(m => [m.cod, m.nome]));
    const muns = [...new Set(e.nomes.flatMap(n => (M.trecho_mun || {})[n] || []))].map(c => nomeMun[c] || c);
    const lista = e.nomes.map(n => e.parte && e.parte[n] ? n + ' (parte)' : n);
    return { al: M.al || '', se: M.se_nome || M.se || '', polo: M.polo || '', muns, trechos: lista, km: e.m / 1000 };
  }

  // ---------- Excel (xlsx sem compressão, com várias abas) ----------
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = u => { let c = 0xFFFFFFFF; for (let i = 0; i < u.length; i++) c = CRC[(c ^ u[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  function zip(arqs, tipo) {
    const enc = new TextEncoder(), partes = [], central = [];
    let pos = 0;
    const d = new Date(), hora = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const data = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    arqs.forEach(([nome, dado]) => {
      const n = enc.encode(nome), crc = crc32(dado), h = new DataView(new ArrayBuffer(30));
      [[0, 0x04034b50, 4], [4, 20, 2], [6, 0x0800, 2], [8, 0, 2], [10, hora, 2], [12, data, 2], [14, crc, 4], [18, dado.length, 4], [22, dado.length, 4], [26, n.length, 2], [28, 0, 2]]
        .forEach(([o, v, t]) => t === 4 ? h.setUint32(o, v, true) : h.setUint16(o, v, true));
      const c = new DataView(new ArrayBuffer(46));
      [[0, 0x02014b50, 4], [4, 20, 2], [6, 20, 2], [8, 0x0800, 2], [10, 0, 2], [12, hora, 2], [14, data, 2], [16, crc, 4], [20, dado.length, 4], [24, dado.length, 4],
       [28, n.length, 2], [30, 0, 2], [32, 0, 2], [34, 0, 2], [36, 0, 2], [38, 0, 4], [42, pos, 4]]
        .forEach(([o, v, t]) => t === 4 ? c.setUint32(o, v, true) : c.setUint16(o, v, true));
      partes.push(new Uint8Array(h.buffer), n, dado); central.push(new Uint8Array(c.buffer), n);
      pos += 30 + n.length + dado.length;
    });
    const tam = central.reduce((s, u) => s + u.length, 0), fimz = new DataView(new ArrayBuffer(22));
    [[0, 0x06054b50, 4], [4, 0, 2], [6, 0, 2], [8, arqs.length, 2], [10, arqs.length, 2], [12, tam, 4], [16, pos, 4], [20, 0, 2]]
      .forEach(([o, v, t]) => t === 4 ? fimz.setUint32(o, v, true) : fimz.setUint16(o, v, true));
    return new Blob([...partes, ...central, new Uint8Array(fimz.buffer)], { type: tipo });
  }
  const xml = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' ');
  const col = i => { let s = ''; for (i++; i; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + (i - 1) % 26) + s; return s; };
  // aba: { nome, cols: [[título, largura, 'n' número | 'd' data | 't' texto]], linhas: [[...]] }; estilos: 1 cabeçalho, 2 data, 3 número com 2 casas, 4 título
  function aba(a) {
    const rows = [], ultima = col(a.cols.length - 1);
    let r = 1;
    if (a.titulo) { rows.push(`<row r="${r}"><c r="A${r}" t="inlineStr" s="4"><is><t>${xml(a.titulo)}</t></is></c></row>`); r += 2; }
    const cab = r;
    rows.push(`<row r="${r}">` + a.cols.map((c, i) => `<c r="${col(i)}${r}" t="inlineStr" s="1"><is><t>${xml(c[0])}</t></is></c>`).join('') + '</row>'); r++;
    a.linhas.forEach(l => {
      rows.push(`<row r="${r}">` + l.map((v, i) => {
        const ref = col(i) + r, tp = (a.cols[i] || [])[2] || 't';
        if (v === null || v === undefined || v === '') return '';
        if (tp === 'd' && /^\d{4}-\d{2}-\d{2}/.test(v)) {           // data (e hora) de verdade no Excel
          const [y, m, d] = [+v.slice(0, 4), +v.slice(5, 7), +v.slice(8, 10)], h = /\d{2}:\d{2}/.test(v.slice(11)) ? (+v.slice(11, 13) * 60 + +v.slice(14, 16)) / 1440 : 0;
          const serial = (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 864e5 + h;
          return `<c r="${ref}" s="${h ? 5 : 2}"><v>${serial}</v></c>`;
        }
        if (typeof v === 'number' && isFinite(v)) return `<c r="${ref}"${tp === 'n2' ? ' s="3"' : ''}><v>${v}</v></c>`;
        return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xml(v)}</t></is></c>`;
      }).join('') + '</row>');
      r++;
    });
    const larg = '<cols>' + a.cols.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c[1]}" customWidth="1"/>`).join('') + '</cols>';
    const filtro = a.linhas.length ? `<autoFilter ref="A${cab}:${ultima}${cab + a.linhas.length}"/>` : '';
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
      `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${cab}" topLeftCell="A${cab + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
      `${larg}<sheetData>${rows.join('')}</sheetData>${filtro}</worksheet>`;
  }
  function xlsx(abas) {
    const enc = new TextEncoder(), a = [];
    a.push(['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      abas.map((x, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') + '</Types>']);
    a.push(['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>']);
    a.push(['xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
      abas.map((x, i) => `<sheet name="${xml(x.nome)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') + '</sheets>' +
      '<definedNames>' + abas.map((x, i) => x.linhas.length ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${xml(x.nome)}'!$A$${x.titulo ? 3 : 1}:$${col(x.cols.length - 1)}$${(x.titulo ? 3 : 1) + x.linhas.length}</definedName>` : '').join('') + '</definedNames></workbook>']);
    a.push(['xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      abas.map((x, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
      `<Relationship Id="rId${abas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`]);
    a.push(['xl/styles.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<numFmts count="2"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/><numFmt numFmtId="165" formatCode="dd/mm/yyyy hh:mm"/></numFmts>' +
      '<fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><sz val="14"/><name val="Calibri"/></font></fonts>' +
      '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1B2024"/><bgColor indexed="64"/></patternFill></fill></fills>' +
      '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="6"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>' +
      '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
      '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs>' +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>']);
    abas.forEach((x, i) => a.push([`xl/worksheets/sheet${i + 1}.xml`, aba(x)]));
    return zip(a.map(([n, t]) => [n, enc.encode(t)]), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  }
  function planilha(e, r, EX, OC) {
    const i = info(e);
    const resumo = [
      ['Alimentador', i.al], ['Subestação', i.se], ['Trechos', i.trechos.join(', ')], ['Extensão escolhida (km)', +i.km.toFixed(3)],
      ['Municípios', i.muns.join(', ')], ['Período', `${mesTxt(r.de)} a ${mesTxt(r.ate)}`],
      ['Manutenções executadas (serviços)', r.tot.os], ['  OS (com as espelho)', r.tot.osNum], ['  Corretivas', r.tot.corr], ['  Preventivas', r.tot.prev],
      ['Ocorrências', r.tot.oc], ['  Coletivas', r.tot.col], ['Consumidores interrompidos', r.tot.cons], ['CHI (consumidor·hora)', +r.tot.chi.toFixed(1)],
      ['Duração média (min)', Math.round(r.tot.durMed)],
      ['Fora do relatório: OS sem ativo no mapa (alimentador, no período)', r.fora.osSemLocal],
      ['Fora do relatório: OS NAE DEOP com data padrão (no caminho)', r.fora.deop],
      ['Fora do relatório: desligamentos do alimentador inteiro (DJ/SE)', r.fora.dj],
      ['Fora do relatório: ocorrências sem ponto (alimentador, no período)', r.fora.ocSemLocal],
      ['Fonte das manutenções', EX ? `OS executadas (OS status), ${br(EX.de)} a ${br(EX.ate)}` : 'não disponível'],
      ['Fonte das ocorrências', OC ? `Crítica, ${mesTxt(OC.meses[0])} a ${mesTxt(OC.meses[OC.meses.length - 1])} (todas as causas)` : 'não disponível'],
      ['Critério', `Ativo a até ${TOL} m da rede escolhida e mais perto dela do que de outra parte da rede`],
      ['Gerado em', hojeTxt()]];
    return xlsx([
      { nome: 'Resumo', titulo: `Relatório de manutenção · ${i.al}`, cols: [['Item', 58], ['Valor', 70]], linhas: resumo },
      { nome: 'Manutenções', cols: [['Data de execução', 14, 'd'], ['OS', 24], ['OS espelho', 24], ['Tipo de serviço', 34], ['Classe', 11], ['Criticidade', 12], ['Equipe', 14],
        ['Ativo', 14], ['Tipo do ativo', 14], ['Trecho', 9], ['Descrição', 70], ['Latitude', 12], ['Longitude', 12]],
        linhas: r.os.map(s => [s.data, s.os, s.espelho.join(', '), nomeTipo(s.tipo), classe(s.tipo), s.crit, s.equipe, s.ativo, s.tipoAt, s.trecho, s.desc, s.lat, s.lon]) },
      { nome: 'Ocorrências', cols: [['Abertura', 17, 'd'], ['Abrangência', 16], ['Ativo', 14], ['Causa', 30], ['Subcausa', 44], ['Consumidores', 13], ['Duração (min)', 13],
        ['CHI (h)', 10, 'n2'], ['Coletiva', 9], ['Programada', 11], ['Momentânea', 12], ['Trecho', 9], ['Latitude', 12], ['Longitude', 12]],
        linhas: r.oc.map(o => [o.abert, abrTxt(o.abr), o.ativo, o.causa, o.sub, o.cons, o.dur, o.chi, o.col ? 'Sim' : 'Não', o.prog ? 'Sim' : 'Não', o.mom ? 'Sim' : 'Não', o.trecho, o.lat, o.lon]) },
      { nome: 'Por mês', cols: [['Mês', 10], ['Manutenções', 13], ['Ocorrências', 12], ['Consumidores', 13], ['CHI (h)', 10, 'n2']],
        linhas: r.meses.map(x => [mesTxt(x.m), x.os, x.oc, x.cons, +x.chi.toFixed(2)]) },
      { nome: 'Por ativo', cols: [['Ativo', 14], ['Tipo', 16], ['Trecho', 9], ['Manutenções', 13], ['Ocorrências', 12], ['Consumidores', 13], ['Última manutenção', 17, 'd'], ['Última ocorrência', 17, 'd']],
        linhas: r.ativos.map(a => [a.cod, a.tipo, a.trecho, a.os, a.oc, a.cons, a.ultOs, a.ultOc]) }]);
  }

  // ---------- figura: o caminho no satélite, com as manutenções e as ocorrências ----------
  const TILE = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/';
  const mx = lon => (lon + 180) / 360 * 256, my = lat => { const s = Math.sin(lat * Math.PI / 180); return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * 256; };
  async function figura(e, r, W, H) {
    const pt = (v, t) => [v[0] + (v[2] - v[0]) * t, v[1] + (v[3] - v[1]) * t];
    const segs = e.runs.map(([i, t0, t1]) => [pt(V[i], t0), pt(V[i], t1)]);
    const lls = segs.flat().concat(r.os.map(s => [s.lat, s.lon]), r.oc.map(o => [o.lat, o.lon]));
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    lls.forEach(([la, lo]) => { const x = mx(lo), y = my(la); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); });
    const pad = 0.08, uw = W * (1 - 2 * pad), uh = H * (1 - 2 * pad);
    const z = Math.min(18, Math.log2(Math.min(uw / Math.max(x1 - x0, 1e-9), uh / Math.max(y1 - y0, 1e-9))));
    const k = 2 ** z, ox = (x0 + x1) / 2 * k - W / 2, oy = (y0 + y1) / 2 * k - H / 2;
    const p = (la, lo) => [mx(lo) * k - ox, my(la) * k - oy];
    const novo = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
    let cv = novo(), ctx = cv.getContext('2d'), sat = false;
    try {
      const zt = Math.min(18, Math.ceil(z)), s = 2 ** (z - zt), tam = 256 * s, ped = [];
      for (let x = Math.floor(ox / tam); x <= Math.floor((ox + W) / tam); x++) for (let y = Math.floor(oy / tam); y <= Math.floor((oy + H) / tam); y++) {
        ped.push(new Promise((ok, erro) => {
          const im = new Image(); im.crossOrigin = 'anonymous';
          let n = 0; const t = setTimeout(() => erro(new Error('tempo')), 12000);
          const pede = () => { im.src = `${TILE}${zt - n}/${y >> n}/${x >> n}?blankTile=false`; };
          im.onload = () => { clearTimeout(t); const f = 2 ** n, l = 256 / f; ok([im, x, y, (x % f) * l, (y % f) * l, l]); };
          im.onerror = () => { if (++n <= 6 && zt - n >= 0) pede(); else { clearTimeout(t); erro(new Error('tile')); } };
          pede();
        }));
      }
      const ims = await Promise.all(ped);
      ims.forEach(([im, x, y, sx, sy, l]) => ctx.drawImage(im, sx, sy, l, l, x * tam - ox, y * tam - oy, tam + 0.5, tam + 0.5));
      ctx.getImageData(0, 0, 1, 1); sat = true;
    } catch (err) { cv = novo(); ctx = cv.getContext('2d'); ctx.fillStyle = '#eef0ec'; ctx.fillRect(0, 0, W, H); }
    if (sat) { ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(0, 0, W, H); }
    const traço = (lista, estilo) => { ctx.beginPath(); lista.forEach(([a, b]) => { const A = p(a[0], a[1]), B = p(b[0], b[1]); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); }); Object.assign(ctx, estilo); ctx.stroke(); };
    traço(V.map(v => [[v[0], v[1]], [v[2], v[3]]]), { strokeStyle: sat ? 'rgba(255,255,255,.45)' : 'rgba(60,70,80,.35)', lineWidth: 2, lineCap: 'round' });
    traço(segs, { strokeStyle: '#fff', lineWidth: 11, lineCap: 'round', lineJoin: 'round' });
    traço(segs, { strokeStyle: '#1d4ed8', lineWidth: 6, lineCap: 'round', lineJoin: 'round' });
    // marcadores: manutenção = losango laranja; ocorrência = círculo vermelho (o tamanho cresce com a quantidade no ponto)
    const junta = (l, ll) => { const m = new Map(); l.forEach(x => { const [a, b] = ll(x), c = a.toFixed(5) + ',' + b.toFixed(5); const y = m.get(c) || m.set(c, { ll: [a, b], n: 0 }).get(c); y.n++; }); return [...m.values()]; };
    // as ocorrências por cima das manutenções
    const pOs = new Set();
    junta(r.os, s => [s.lat, s.lon]).forEach(({ ll, n }) => {
      pOs.add(ll[0].toFixed(5) + ',' + ll[1].toFixed(5));
      const [x, y] = p(ll[0], ll[1]), rr = 8 + Math.min(9, Math.sqrt(n) * 2.5);
      ctx.beginPath(); ctx.moveTo(x, y - rr); ctx.lineTo(x + rr, y); ctx.lineTo(x, y + rr); ctx.lineTo(x - rr, y); ctx.closePath();
      ctx.fillStyle = '#f59e0b'; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = '#1b2024'; ctx.stroke();
      if (n > 1) { ctx.font = '700 13px Arial, sans-serif'; ctx.fillStyle = '#1b2024'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(n, x, y + 0.5); }
    });
    junta(r.oc, o => [o.lat, o.lon]).forEach(({ ll, n }) => {
      let [x, y] = p(ll[0], ll[1]); const rr = 7 + Math.min(9, Math.sqrt(n) * 2.5);
      if (pOs.has(ll[0].toFixed(5) + ',' + ll[1].toFixed(5))) { x += rr + 4; y -= rr + 4; }   // no mesmo ativo de uma OS: ao lado do losango
      ctx.beginPath(); ctx.arc(x, y, rr, 0, 2 * Math.PI); ctx.fillStyle = '#dc2626'; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = '#fff'; ctx.stroke();
      if (n > 1) { ctx.font = '700 13px Arial, sans-serif'; ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(n, x, y + 0.5); }
    });
    // escala gráfica
    const lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * (oy + H / 2) / k / 256))) * 180 / Math.PI, mpp = 156543.03392 * Math.cos(lat * Math.PI / 180) / k;
    const alvo = mpp * W * 0.2, ordem = 10 ** Math.floor(Math.log10(alvo)), m = [1, 2, 5, 10].map(x => x * ordem).filter(x => x <= alvo).pop(), px = m / mpp;
    ctx.save(); ctx.font = '600 18px Arial, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(0,0,0,.8)'; ctx.strokeRect(24, H - 30, px, 8); ctx.fillStyle = '#fff'; ctx.fillRect(24, H - 30, px, 8);
    const txt = m >= 1000 ? nf(m / 1000, m % 1000 ? 1 : 0) + ' km' : m + ' m'; ctx.strokeText(txt, 24, H - 40); ctx.fillText(txt, 24, H - 40); ctx.restore();
    if (sat) { ctx.font = '13px Arial, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.textAlign = 'right'; ctx.fillText('Imagem © Esri, Maxar, Earthstar Geographics', W - 10, H - 10); }
    return { cv, sat };
  }

  // ---------- PDF (escrito aqui: Helvetica, imagem JPEG, A4) ----------
  const CP = { '€': 128, '‚': 130, 'ƒ': 131, '„': 132, '…': 133, '†': 134, '‡': 135, 'ˆ': 136, '‰': 137, 'Š': 138, '‹': 139, 'Œ': 140, 'Ž': 142, '‘': 145, '’': 146, '“': 147, '”': 148, '•': 149, '–': 150, '—': 151, '˜': 152, '™': 153, 'š': 154, '›': 155, 'œ': 156, 'ž': 158, 'Ÿ': 159, '→': 155, '≥': 62, '≤': 60 };
  const win = s => { let o = ''; for (const ch of String(s ?? '')) { const c = ch.charCodeAt(0); o += c < 256 && !(c >= 128 && c < 160) ? (c < 32 ? ' ' : ch) : CP[ch] !== undefined ? String.fromCharCode(CP[ch]) : '?'; } return o; };
  const pdfStr = s => '(' + win(s).replace(/[\\()]/g, m => '\\' + m) + ')';
  const medidor = document.createElement('canvas').getContext('2d');
  const larg = (s, t, b) => { medidor.font = `${b ? 'bold ' : ''}100px Helvetica, Arial, "Liberation Sans", sans-serif`; return medidor.measureText(String(s ?? '')).width / 100 * t; };
  const corPdf = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255].map(x => +x.toFixed(3)).join(' '); };
  const W_PG = 595.28, H_PG = 841.89, MG = 40;
  const COR = { tinta: '#1b2024', fraco: '#5a636a', linha: '#d6dad6', fundo: '#f3f4f1', acento: '#b8431f', azul: '#1d4ed8', laranja: '#f59e0b', verm: '#dc2626', escuro: '#1b2024' };
  function Pdf() {
    const pags = [], imgs = [];
    let pg = null;
    const novaPg = () => { pg = { ops: [] }; pags.push(pg); return pg; };
    const Y = y => +(H_PG - y).toFixed(2);
    const api = {
      nova: novaPg,
      get pg() { return pg; },
      txt(x, y, s, t = 9, o = {}) {
        const c = o.cor || COR.tinta, b = !!o.b;
        let xx = x; const w = larg(s, t, b);
        if (o.al === 'r') xx = x - w; else if (o.al === 'c') xx = x - w / 2;
        pg.ops.push(`BT /${b ? 'F2' : 'F1'} ${t} Tf ${corPdf(c)} rg ${xx.toFixed(2)} ${Y(y)} Td ${pdfStr(s)} Tj ET`);
        return w;
      },
      ret(x, y, w, h, fill, stroke, lw = 0.6) {
        const r = `${x.toFixed(2)} ${Y(y + h)} ${w.toFixed(2)} ${h.toFixed(2)} re`;
        if (fill && stroke) pg.ops.push(`${corPdf(fill)} rg ${corPdf(stroke)} RG ${lw} w ${r} B`);
        else if (fill) pg.ops.push(`${corPdf(fill)} rg ${r} f`);
        else pg.ops.push(`${corPdf(stroke)} RG ${lw} w ${r} S`);
      },
      linha(x1, y1, x2, y2, cor = COR.linha, lw = 0.6) { pg.ops.push(`${corPdf(cor)} RG ${lw} w ${x1.toFixed(2)} ${Y(y1)} m ${x2.toFixed(2)} ${Y(y2)} l S`); },
      circ(x, y, r, fill, stroke) {                                       // círculo por 4 curvas
        const k = 0.5523 * r, yy = Y(y);
        const p = `${(x + r).toFixed(2)} ${yy} m ${(x + r).toFixed(2)} ${(yy + k).toFixed(2)} ${(x + k).toFixed(2)} ${(yy + r).toFixed(2)} ${x.toFixed(2)} ${(yy + r).toFixed(2)} c ` +
          `${(x - k).toFixed(2)} ${(yy + r).toFixed(2)} ${(x - r).toFixed(2)} ${(yy + k).toFixed(2)} ${(x - r).toFixed(2)} ${yy} c ${(x - r).toFixed(2)} ${(yy - k).toFixed(2)} ${(x - k).toFixed(2)} ${(yy - r).toFixed(2)} ${x.toFixed(2)} ${(yy - r).toFixed(2)} c ` +
          `${(x + k).toFixed(2)} ${(yy - r).toFixed(2)} ${(x + r).toFixed(2)} ${(yy - k).toFixed(2)} ${(x + r).toFixed(2)} ${yy} c`;
        pg.ops.push(`${fill ? corPdf(fill) + ' rg ' : ''}${stroke ? corPdf(stroke) + ' RG 1 w ' : ''}${p} ${fill && stroke ? 'B' : fill ? 'f' : 'S'}`);
      },
      losango(x, y, r, fill, stroke) { const yy = Y(y); pg.ops.push(`${corPdf(fill)} rg ${corPdf(stroke)} RG 0.8 w ${x} ${yy + r} m ${x + r} ${yy} l ${x} ${yy - r} l ${x - r} ${yy} l h B`); },
      img(jpeg, w, h, x, y, dw, dh) { imgs.push({ jpeg, w, h }); pg.ops.push(`q ${dw.toFixed(2)} 0 0 ${dh.toFixed(2)} ${x.toFixed(2)} ${Y(y + dh)} cm /Im${imgs.length} Do Q`); },
      async blob() {
        const enc = s => { const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i) & 255; return u; };
        const comprime = async u => {
          if (typeof CompressionStream === 'undefined') return null;
          const st = new Blob([u]).stream().pipeThrough(new CompressionStream('deflate'));
          return new Uint8Array(await new Response(st).arrayBuffer());
        };
        const objs = [];                                                 // [n] = Uint8Array do corpo do objeto n+1
        const poe = b => { objs.push(b); return objs.length; };
        const reserva = () => { objs.push(null); return objs.length; };
        const cat = reserva(), pagsN = reserva(), f1 = poe(enc('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>')),
          f2 = poe(enc('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'));
        const imN = [];
        for (const im of imgs) {
          const cab = enc(`<< /Type /XObject /Subtype /Image /Width ${im.w} /Height ${im.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.jpeg.length} >>\nstream\n`);
          const fim = enc('\nendstream');
          const u = new Uint8Array(cab.length + im.jpeg.length + fim.length); u.set(cab); u.set(im.jpeg, cab.length); u.set(fim, cab.length + im.jpeg.length);
          imN.push(poe(u));
        }
        const xo = imN.length ? `/XObject << ${imN.map((n, i) => `/Im${i + 1} ${n} 0 R`).join(' ')} >>` : '';
        const kids = [];
        for (const p of pags) {
          const bruto = enc(p.ops.join('\n')), z = await comprime(bruto);
          const corpo = z || bruto, cab = enc(`<< /Length ${corpo.length}${z ? ' /Filter /FlateDecode' : ''} >>\nstream\n`), fim = enc('\nendstream');
          const u = new Uint8Array(cab.length + corpo.length + fim.length); u.set(cab); u.set(corpo, cab.length); u.set(fim, cab.length + corpo.length);
          const cn = poe(u);
          kids.push(poe(enc(`<< /Type /Page /Parent ${pagsN} 0 R /MediaBox [0 0 ${W_PG} ${H_PG}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> ${xo} >> /Contents ${cn} 0 R >>`)));
        }
        objs[cat - 1] = enc(`<< /Type /Catalog /Pages ${pagsN} 0 R >>`);
        objs[pagsN - 1] = enc(`<< /Type /Pages /Kids [${kids.map(k => k + ' 0 R').join(' ')}] /Count ${kids.length} >>`);
        const info = poe(enc(`<< /Title ${pdfStr('Relatório de manutenção · ' + (M.al || ''))} /Producer ${pdfStr('ARGOS')} >>`));
        const partes = [enc('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n')], offs = [];
        let pos = partes[0].length;
        objs.forEach((b, i) => { const a = enc(`${i + 1} 0 obj\n`), z = enc('\nendobj\n'); offs.push(pos); partes.push(a, b, z); pos += a.length + b.length + z.length; });
        const xref = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('');
        partes.push(enc(xref + `trailer\n<< /Size ${objs.length + 1} /Root ${cat} 0 R /Info ${info} 0 R >>\nstartxref\n${pos}\n%%EOF\n`));
        return new Blob(partes, { type: 'application/pdf' });
      }
    };
    return api;
  }
  const corta = (s, w, t, b) => { s = String(s ?? ''); if (larg(s, t, b) <= w) return s; while (s.length > 1 && larg(s + '…', t, b) > w) s = s.slice(0, -1); return s + '…'; };
  function quebra(s, w, t, b, max = 99) {
    const pal = String(s ?? '').split(/\s+/).filter(Boolean), l = [];
    let a = '';
    for (const p of pal) { const x = a ? a + ' ' + p : p; if (larg(x, t, b) <= w) a = x; else { if (a) l.push(a); a = larg(p, t, b) > w ? corta(p, w, t, b) : p; } }
    if (a) l.push(a);
    if (l.length > max) { l.length = max; l[max - 1] = corta(l[max - 1] + ' …', w, t, b); }
    return l.length ? l : [''];
  }

  async function relatorioPdf(e, r, EX, OC) {
    const i = info(e), pdf = Pdf(), CW = W_PG - 2 * MG;
    let y = 0;
    const rodapes = [];
    const pagina = () => { pdf.nova(); rodapes.push(pdf.pg); y = MG; };
    const cabecalhoMenor = () => {                                       // páginas 2 em diante
      pdf.txt(MG, y + 8, 'ARGOS · Relatório de manutenção', 8, { cor: COR.fraco, b: true });
      pdf.txt(W_PG - MG, y + 8, `${i.al} · ${mesTxt(r.de)} a ${mesTxt(r.ate)}`, 8, { cor: COR.fraco, al: 'r' });
      pdf.linha(MG, y + 14, W_PG - MG, y + 14); y += 30;
    };
    const cabe = h => { if (y + h > H_PG - MG - 18) { pagina(); cabecalhoMenor(); return false; } return true; };
    const titulo = (s, sub) => {
      cabe(80);                                                           // o título vai junto com o cabeçalho e a 1ª linha da tabela
      pdf.ret(MG, y, 3, 14, COR.acento); pdf.txt(MG + 9, y + 11, s, 12.5, { b: true });
      if (sub) pdf.txt(W_PG - MG, y + 11, sub, 8, { cor: COR.fraco, al: 'r' });
      y += 22;
    };
    // tabela: cols [[título, largura, alinhamento 'r'|'l', b?]], linhas [[...]]; descrição longa quebra em até 3 linhas
    const tabela = (cols, linhas, o = {}) => {
      const t = o.t || 7.8, lh = t * 1.32, pad = 3.2;
      const desenhaCab = () => {
        pdf.ret(MG, y, CW, lh + 2 * pad, COR.escuro);
        let x = MG; cols.forEach(c => { const tx = c[2] === 'r' ? x + c[1] - pad : x + pad; pdf.txt(tx, y + pad + t, corta(c[0], c[1] - 2 * pad, t, true), t, { b: true, cor: '#ffffff', al: c[2] === 'r' ? 'r' : 'l' }); x += c[1]; });
        y += lh + 2 * pad;
      };
      cabe(lh * 3 + 4 * pad); desenhaCab();
      if (!linhas.length) { pdf.txt(MG + pad, y + pad + t, o.vazio || 'Nenhum registro no período.', t, { cor: COR.fraco }); y += lh + 2 * pad; return; }
      linhas.forEach((l, k) => {
        const cel = l.map((v, j) => cols[j][3] === 'w' ? quebra(v, cols[j][1] - 2 * pad, t, false, 3) : [corta(v, cols[j][1] - 2 * pad, t, cols[j][3] === 'b')]);
        const h = Math.max(...cel.map(c => c.length)) * lh + 2 * pad;
        if (y + h > H_PG - MG - 18) { pagina(); cabecalhoMenor(); desenhaCab(); }
        if (k % 2) pdf.ret(MG, y, CW, h, COR.fundo);
        let x = MG;
        cel.forEach((ls, j) => { const c = cols[j]; ls.forEach((s, n) => pdf.txt(c[2] === 'r' ? x + c[1] - pad : x + pad, y + pad + t + n * lh - 0.5, s, t, { b: c[3] === 'b', al: c[2] === 'r' ? 'r' : 'l' })); x += c[1]; });
        y += h;
      });
      pdf.linha(MG, y, W_PG - MG, y); y += 6;
    };

    // ----- página 1 -----
    pagina();
    pdf.ret(0, 0, W_PG, 92, COR.escuro);
    pdf.txt(MG, 30, 'ARGOS', 9, { b: true, cor: '#f08a5d' });
    pdf.txt(MG, 56, 'Relatório de manutenção', 22, { b: true, cor: '#ffffff' });
    pdf.txt(MG, 76, `Alimentador ${i.al}${i.se ? ' · ' + i.se : ''}${i.polo ? ' · Polo ' + i.polo : ''}`, 10.5, { cor: '#e7eaeb' });
    pdf.txt(W_PG - MG, 30, `Gerado em ${hojeTxt()}`, 8.5, { cor: '#9aa4ab', al: 'r' });
    pdf.txt(W_PG - MG, 76, `${mesTxt(r.de)} a ${mesTxt(r.ate)}`, 12, { b: true, cor: '#ffffff', al: 'r' });
    y = 112;
    // dados do escolhido (2 colunas)
    const campos = [['Trechos', i.trechos.join(', ')], ['Extensão escolhida', `${nf(i.km, 2)} km`], ['Municípios', i.muns.join(', ') || '—'],
      ['Período', `${mesTxt(r.de)} a ${mesTxt(r.ate)} (${r.meses.length} ${r.meses.length === 1 ? 'mês' : 'meses'})`]];
    campos.forEach(([k, v]) => {
      const ls = quebra(v, CW - 110, 9, false, k === 'Trechos' ? 3 : 2);
      pdf.txt(MG, y + 9, k, 8.5, { cor: COR.fraco }); ls.forEach((s, n) => pdf.txt(MG + 110, y + 9 + n * 12, s, 9, { b: n === 0 && k !== 'Trechos' }));
      y += 12 * ls.length + 4;
    });
    y += 6;
    // mapa
    const FW = 1600, FH = 860, fig = await figura(e, r, FW, FH);
    const jpg = new Uint8Array(await (await new Promise(ok => fig.cv.toBlob(ok, 'image/jpeg', 0.86))).arrayBuffer());
    const fh = CW * FH / FW;
    pdf.img(jpg, FW, FH, MG, y, CW, fh); pdf.ret(MG, y, CW, fh, null, COR.linha, 0.8);
    y += fh + 10;
    // legenda do mapa
    let lx = MG;
    pdf.ret(lx, y + 2, 16, 4, COR.azul); lx += 21; lx += pdf.txt(lx, y + 7, 'Rede escolhida', 8, { cor: COR.fraco }) + 14;
    pdf.losango(lx + 4, y + 4, 4.5, COR.laranja, COR.tinta); lx += 12; lx += pdf.txt(lx, y + 7, 'Manutenção executada', 8, { cor: COR.fraco }) + 14;
    pdf.circ(lx + 4, y + 4, 4, COR.verm, '#ffffff'); lx += 12; lx += pdf.txt(lx, y + 7, 'Ocorrência (o número é a quantidade no mesmo ponto)', 8, { cor: COR.fraco });
    y += 22;
    // números
    const cards = [['Manutenções executadas', nf(r.tot.os), `${nf(r.tot.corr)} corretiva${r.tot.corr === 1 ? '' : 's'} · ${nf(r.tot.prev)} preventiva${r.tot.prev === 1 ? '' : 's'}`],
      ['Ocorrências', nf(r.tot.oc), `${nf(r.tot.col)} coletiva${r.tot.col === 1 ? '' : 's'} · ${nf(r.tot.oc - r.tot.col)} individua${r.tot.oc - r.tot.col === 1 ? 'l' : 'is'}`],
      ['Consumidores', nf(r.tot.cons), 'interrompidos (soma)'],
      ['CHI (consumidor·hora)', nf(r.tot.chi, 1), `duração média ${nf(r.tot.durMed)} min`]];
    const cw = (CW - 3 * 8) / 4;
    cards.forEach(([k, v, s], j) => {
      const x = MG + j * (cw + 8);
      pdf.ret(x, y, cw, 62, COR.fundo); pdf.ret(x, y, cw, 3, j < 1 ? COR.laranja : COR.verm);
      pdf.txt(x + 9, y + 18, corta(k, cw - 18, 8, true), 8, { b: true, cor: COR.fraco });
      pdf.txt(x + 9, y + 40, v, 19, { b: true });
      pdf.txt(x + 9, y + 54, corta(s, cw - 18, 7, false), 7, { cor: COR.fraco });
    });
    y += 76;
    // gráfico por mês
    titulo('Por mês', 'manutenções executadas e ocorrências');
    const GH = 120, n = r.meses.length, gx = MG + 26, gw = CW - 26, mxv = Math.max(1, ...r.meses.map(x => Math.max(x.os, x.oc)));
    cabe(GH + 30);
    const passo = mxv <= 5 ? 1 : 10 ** Math.floor(Math.log10(mxv)) * (mxv / 10 ** Math.floor(Math.log10(mxv)) > 5 ? 2 : 1), topo = Math.ceil(mxv / passo) * passo;
    for (let v = 0; v <= topo; v += passo) { const yy = y + GH - v / topo * GH; pdf.linha(gx, yy, gx + gw, yy, v ? '#e5e7e3' : COR.fraco, v ? 0.4 : 0.6); pdf.txt(gx - 4, yy + 2.5, nf(v), 6.8, { cor: COR.fraco, al: 'r' }); }
    const bw = gw / Math.max(n, 1), b1 = Math.min(14, bw * 0.34);
    const cada = Math.ceil(n / 24);
    r.meses.forEach((x, j) => {
      const cx = gx + j * bw + bw / 2;
      if (x.os) pdf.ret(cx - b1 - 0.5, y + GH - x.os / topo * GH, b1, x.os / topo * GH, COR.laranja);
      if (x.oc) pdf.ret(cx + 0.5, y + GH - x.oc / topo * GH, b1, x.oc / topo * GH, COR.verm);
      if (j % cada === 0) pdf.txt(cx, y + GH + 10, mesCurto(x.m), 6.6, { cor: COR.fraco, al: 'c' });
    });
    y += GH + 16;
    lx = MG + 26; pdf.ret(lx, y, 9, 7, COR.laranja); lx += 13; lx += pdf.txt(lx, y + 6.5, 'Manutenções', 7.5, { cor: COR.fraco }) + 12;
    pdf.ret(lx, y, 9, 7, COR.verm); lx += 13; pdf.txt(lx, y + 6.5, 'Ocorrências', 7.5, { cor: COR.fraco });
    if (OC) {
      const sem = r.meses.filter(x => !OC.meses.includes(x.m)).map(x => x.m);
      if (sem.length) pdf.txt(W_PG - MG, y + 6.5, `Sem dados de ocorrências em ${sem.length === r.meses.length ? 'todo o período' : mesTxt(sem[0]) + (sem.length > 1 ? ' a ' + mesTxt(sem[sem.length - 1]) + ` (${sem.length} meses)` : '')}`, 7.2, { cor: COR.acento, al: 'r' });
    }
    y += 22;

    // ----- análises -----
    titulo('Principais causas das ocorrências', `${nf(r.causas.length)} causa${r.causas.length === 1 ? '' : 's'}`);
    tabela([['Causa · subcausa', CW - 210, 'l', 'w'], ['Ocorrências', 70, 'r'], ['Consumidores', 70, 'r'], ['CHI (h)', 70, 'r']],
      r.causas.slice(0, 12).map(c => [c.k, nf(c.n), nf(c.cons), nf(c.chi, 1)]));
    titulo('Serviços de manutenção executados', `${nf(r.servicos.length)} tipo${r.servicos.length === 1 ? '' : 's'}`);
    tabela([['Tipo de serviço', CW - 170, 'l'], ['Classe', 90, 'l'], ['Quantidade', 80, 'r']],
      r.servicos.slice(0, 12).map(s => [nomeTipo(s.k), classe(s.k), nf(s.n)]));
    titulo('Ativos com mais registros', 'manutenções e ocorrências no mesmo ativo');
    tabela([['Ativo', 78, 'l', 'b'], ['Tipo', 92, 'l'], ['Trecho', 50, 'l'], ['Manutenções', 62, 'r'], ['Ocorrências', 60, 'r'], ['Consumidores', 62, 'r'], ['Última ocorrência', CW - 404, 'r']],
      r.ativos.slice(0, 15).map(a => [a.cod, a.tipo, a.trecho, nf(a.os), nf(a.oc), nf(a.cons), a.ultOc ? br(a.ultOc) : '—']));

    // ----- listas -----
    titulo('Manutenções executadas', `${nf(r.tot.os)} serviço${r.tot.os === 1 ? '' : 's'} · ${nf(r.tot.osNum)} OS`);
    tabela([['Data', 46, 'l'], ['OS', 112, 'l'], ['Esp.', 24, 'r'], ['Serviço', 88, 'l', 'w'], ['Ativo', 56, 'l'], ['Trecho', 36, 'l'], ['Descrição', CW - 362, 'l', 'w']],
      r.os.map(s => [br(s.data), s.os, s.espelho.length ? '+' + s.espelho.length : '', `${nomeTipo(s.tipo)} (${classe(s.tipo).toLowerCase()})`, s.ativo, s.trecho, s.desc]), { vazio: 'Nenhuma manutenção executada no caminho, no período.' });
    titulo('Ocorrências', `${nf(r.tot.oc)} no caminho`);
    tabela([['Abertura', 72, 'l'], ['Abrangência', 80, 'l', 'w'], ['Ativo', 56, 'l'], ['Causa · subcausa', CW - 362, 'l', 'w'], ['Cons.', 32, 'r'], ['Dur. (min)', 44, 'r'], ['CHI (h)', 40, 'r'], ['Trecho', 38, 'l']],
      r.oc.map(o => [`${br(o.abert)} ${o.abert.slice(11, 16)}`, abrTxt(o.abr), o.ativo, causaTxt(o) + (o.prog ? ' (programada)' : ''), nf(o.cons), nf(o.dur), nf(o.chi, 1), o.trecho]),
      { vazio: 'Nenhuma ocorrência no caminho, no período.' });

    // ----- fontes e critérios -----
    titulo('Fontes e critérios');
    const notas = [
      `Manutenções: OS executadas (OS status, corretivas MC e preventivas MP)${EX ? `, de ${br(EX.de)} a ${br(EX.ate)}` : ' (sem dados neste alimentador)'}. OS espelho (o mesmo serviço aberto pela distribuidora e pela contratada: mesmo tipo, ativo, data e descrição) contam uma vez; a coluna "Esp." traz quantas espelho a OS tem (os números estão no Excel).`,
      `Ocorrências: Crítica, todas as causas${OC ? `, de ${mesTxt(OC.meses[0])} a ${mesTxt(OC.meses[OC.meses.length - 1])}` : ' (sem dados neste alimentador)'}. O ponto é o do ativo da ocorrência (chave da rede ou transformador do GIS).`,
      `No caminho: o ativo fica a até ${TOL} m da rede escolhida e não mais perto de outra parte da rede.`,
      `Fora do relatório (no período): ${nf(r.fora.dj)} desligamento(s) do alimentador inteiro (DJ/SE, sem lugar na rede); ${nf(r.fora.ocSemLocal)} ocorrência(s) do alimentador sem ponto; ${nf(r.fora.osSemLocal)} OS do alimentador sem ativo no mapa; ${nf(r.fora.deop)} OS "NAE DEOP" no caminho com data padrão (03/01/2025).`];
    const ln = notas.map(s => quebra(s, CW, 8, false));
    cabe(ln.reduce((h, ls) => h + ls.length * 11 + 4, 0));            // as notas ficam juntas na mesma página
    ln.forEach(ls => { ls.forEach(l => { pdf.txt(MG, y + 8, l, 8, { cor: COR.fraco }); y += 11; }); y += 4; });

    // rodapé com a página
    rodapes.forEach((p, k) => {
      p.ops.push(`BT /F1 7.5 Tf ${corPdf(COR.fraco)} rg ${MG} 22 Td ${pdfStr(`ARGOS · Relatório de manutenção · ${i.al}`)} Tj ET`);
      const s = `Página ${k + 1} de ${rodapes.length}`;
      p.ops.push(`BT /F1 7.5 Tf ${corPdf(COR.fraco)} rg ${(W_PG - MG - larg(s, 7.5)).toFixed(2)} 22 Td ${pdfStr(s)} Tj ET`);
    });
    return pdf.blob();
  }

  // ---------- janela ----------
  const css = document.createElement('style');
  css.textContent = `dialog.relm{border:1px solid var(--line);border-radius:var(--r3,14px);padding:0;width:min(560px,calc(100vw - 24px));max-height:calc(100dvh - 24px);background:var(--paper);color:var(--fg);box-shadow:var(--sh2,0 20px 60px rgba(0,0,0,.35))}
dialog.relm::backdrop{background:rgb(10 14 17 / .5)}
@media (prefers-reduced-motion:no-preference){dialog.relm[open]{animation:relm-entra var(--dur-l,220ms) var(--ease,ease)}}
@keyframes relm-entra{from{opacity:0;transform:translateY(6px)}}
.relm form{display:grid;gap:var(--s4,16px);padding:var(--s5,24px) var(--s5,24px) 0}
.relm .topo{display:flex;align-items:center;justify-content:space-between;gap:var(--s3,12px)}
.relm h2{margin:0;font:600 var(--t-xl,20px)/1.2 var(--f-display,var(--f-body,system-ui))}
.relm .fecha{flex:none;width:var(--alvo,40px);height:var(--alvo,40px);border:0;border-radius:var(--r2,10px);background:transparent;color:var(--muted);font-size:18px;cursor:pointer}
.relm .fecha:hover{background:var(--hover,transparent);color:var(--fg)}.relm .fecha:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.relm p{margin:0;font-size:var(--t-sm,13px);color:var(--muted)}
.relm dl{display:grid;grid-template-columns:auto 1fr;gap:var(--s1,4px) var(--s3,12px);margin:0;font-size:var(--t-sm,13px)}.relm dt{color:var(--muted)}.relm dd{margin:0;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
.relm .per{display:grid;grid-template-columns:1fr 1fr;gap:var(--s3,12px)}
.relm label{display:grid;gap:var(--s1,4px);font-size:var(--t-xs,12px);color:var(--muted)}
.relm select{font:var(--t-base,15px) var(--f-body,system-ui);color:var(--fg);background:var(--paper);border:1px solid var(--line-forte,var(--line));border-radius:var(--r2,10px);padding:0 var(--s3,12px);min-height:var(--alvo,40px);min-width:0;width:100%;box-sizing:border-box;color-scheme:light dark}
.relm select:focus-visible{outline:2px solid var(--accent);outline-offset:1px}
.relm .atalhos{display:flex;flex-wrap:wrap;gap:var(--s2,8px)}
.relm .atalhos button{font:600 var(--t-sm,13px) var(--f-body,system-ui);min-height:40px;padding:0 var(--s3,12px);border-radius:999px;border:1px solid var(--line-forte,var(--line));background:none;color:var(--fg);cursor:pointer}
.relm .atalhos button:hover{background:var(--hover)}.relm .atalhos button[aria-pressed=true]{border-color:var(--accent);color:var(--accent);background:color-mix(in srgb,var(--accent) 12%,transparent)}
.relm .nums{display:grid;grid-template-columns:repeat(4,1fr);gap:var(--s2,8px)}
.relm .nums div{padding:var(--s2,8px) var(--s3,12px);border-radius:var(--r2,10px);background:var(--hover)}
.relm .nums b{display:block;font:700 18px/1.2 var(--f-mono,monospace);font-variant-numeric:tabular-nums}.relm .nums span{font-size:var(--t-xs,12px);color:var(--muted)}
.relm .aviso{color:var(--accent)}.relm .baixou{color:var(--fg);font-weight:600}
.relm .acoes{position:sticky;bottom:0;display:flex;gap:var(--s2,8px);justify-content:flex-end;flex-wrap:wrap;margin:0 calc(-1 * var(--s5,24px));padding:var(--s3,12px) var(--s5,24px) var(--s4,16px);background:var(--paper);border-top:1px solid var(--line)}
.relm .acoes button{font:600 var(--t-md,14px) var(--f-body,system-ui);padding:0 var(--s4,16px);min-height:var(--alvo,40px);border-radius:var(--r2,10px);cursor:pointer;border:1px solid var(--line-forte,var(--line));background:var(--paper);color:var(--fg)}
.relm .acoes button.pdf{background:var(--accent);border-color:var(--accent);color:var(--on-accent,#fff)}.relm .acoes button:disabled{opacity:.6;cursor:progress}
@media (max-width:520px){.relm .acoes .lg{display:none}.relm form{padding:var(--s4,16px) var(--s4,16px) 0}.relm .nums{grid-template-columns:1fr 1fr}.relm .acoes{margin:0 calc(-1 * var(--s4,16px));padding:var(--s3,12px) var(--s4,16px)}.relm .acoes button{flex:1}.relm select{font-size:16px;min-height:44px}}`;
  document.head.append(css);

  const baixa = (blob, nome) => {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nome;
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 30000);
  };
  // e: o escolhido (window.__faixa.escolhaGeo())
  async function abre(e) {
    if (!e || !e.runs || !e.runs.length) return false;
    const [EX, OC] = await fontes();
    const i = info(e);
    // meses com dados: manutenção (EX.de..EX.ate) e ocorrências (OC.meses); o padrão são os 12 meses até o último com dado
    const ultimos = [EX && EX.ate && EX.ate.slice(0, 7), OC && OC.meses.length && OC.meses[OC.meses.length - 1]].filter(Boolean).sort();
    const fimDados = ultimos.length ? ultimos[ultimos.length - 1] : somaMes(new Date().toISOString().slice(0, 7), 0);
    const iniDados = [EX && EX.de && EX.de.slice(0, 7), OC && OC.meses[0]].filter(Boolean).sort()[0] || somaMes(fimDados, -11);
    const opMes = mesesEntre(iniDados, fimDados).reverse().map(m => `<option value="${m}">${mesTxt(m)}</option>`).join('');
    const dlg = document.createElement('dialog'); dlg.className = 'relm';
    dlg.innerHTML = `<form method="dialog">
      <div class="topo"><h2>Relatório de manutenção</h2><button type="button" class="fecha" aria-label="Fechar">✕</button></div>
      <p>O que foi escolhido no mapa, no período: manutenções executadas e ocorrências cujo ativo fica no caminho (até ${TOL} m da rede escolhida).</p>
      <dl><dt>Alimentador</dt><dd>${esc(i.al)}${i.se ? ' · ' + esc(i.se) : ''}</dd>
        <dt>Trecho${i.trechos.length > 1 ? 's' : ''}</dt><dd>${esc(i.trechos.length > 8 ? i.trechos.slice(0, 8).join(', ') + ` e mais ${i.trechos.length - 8}` : i.trechos.join(', '))}</dd>
        <dt>Extensão</dt><dd>${nf(i.km, 2)} km</dd>
        <dt>Dados</dt><dd>Manutenções ${EX ? `${br(EX.de)} a ${br(EX.ate)}` : '— (sem arquivo)'} · Ocorrências ${OC && OC.meses.length ? `${mesTxt(OC.meses[0])} a ${mesTxt(OC.meses[OC.meses.length - 1])}` : '— (sem arquivo)'}</dd></dl>
      <div class="per"><label>De<select name="de">${opMes}</select></label><label>Até<select name="ate">${opMes}</select></label></div>
      <div class="atalhos" role="group" aria-label="Períodos prontos">
        <button type="button" data-p="12">Últimos 12 meses</button><button type="button" data-p="ano">Ano ${fimDados.slice(0, 4)}</button><button type="button" data-p="oc">Meses com ocorrências</button><button type="button" data-p="tudo">Tudo</button></div>
      <div class="nums" aria-live="polite"><div><b class="n-os">–</b><span class="r-os">manutenções</span></div><div><b class="n-oc">–</b><span class="r-oc">ocorrências</span></div><div><b class="n-cons">–</b><span class="r-cons">consumidores</span></div><div><b class="n-chi">–</b><span>CHI (h)</span></div></div>
      <p class="aviso" hidden></p>
      <p class="baixou" role="status" hidden></p>
      <div class="acoes"><button type="button" class="cancela">Cancelar</button><button type="button" class="xls">Baixar <span class="lg">dados </span>(Excel)</button><button type="button" class="pdf">Baixar <span class="lg">relatório </span>(PDF)</button></div>
    </form>`;
    document.body.append(dlg);
    const f = dlg.querySelector('form'), q = s => dlg.querySelector(s);
    dlg.querySelectorAll('.fecha, .cancela').forEach(b => b.addEventListener('click', () => dlg.close()));
    dlg.addEventListener('close', () => dlg.remove());
    let r = null;
    const prende = m => !/^\d{4}-\d{2}$/.test(m) ? null : m < iniDados ? iniDados : m > fimDados ? fimDados : m;
    // o período na tela: vazio ou inválido volta ao limite, fora dos dados fica no limite, De depois do Até troca os dois
    const periodo = () => {
      let de = prende(f.de.value) || iniDados, ate = prende(f.ate.value) || fimDados, nota = '';
      if (de > ate) { [de, ate] = [ate, de]; nota = 'De e Até foram trocados. '; }
      if ((f.de.value && f.de.value !== de && f.de.value !== ate) || (f.ate.value && f.ate.value !== ate && f.ate.value !== de)) nota += `Período ajustado aos dados (${mesTxt(iniDados)} a ${mesTxt(fimDados)}). `;
      f.de.value = de; f.ate.value = ate;
      return [de, ate, nota];
    };
    const conta = () => {
      const [de, ate, nota] = periodo();
      r = coleta(e, de, ate, EX, OC);
      q('.n-os').textContent = nf(r.tot.os); q('.n-oc').textContent = nf(r.tot.oc); q('.n-cons').textContent = nf(r.tot.cons); q('.n-chi').textContent = nf(r.tot.chi, 1);
      q('.r-os').textContent = r.tot.os === 1 ? 'manutenção' : 'manutenções'; q('.r-oc').textContent = r.tot.oc === 1 ? 'ocorrência' : 'ocorrências';
      q('.r-cons').textContent = r.tot.cons === 1 ? 'consumidor' : 'consumidores';
      const sem = OC ? r.meses.filter(x => !OC.meses.includes(x.m)).length : r.meses.length, av = q('.aviso');
      const semOs = EX && EX.de && de < EX.de.slice(0, 7) ? `Manutenções só a partir de ${br(EX.de)}. ` : '';
      const txt = nota + semOs + (sem ? `Ocorrências: ${sem === r.meses.length ? 'não há dados da Crítica neste período' : `${sem} dos ${r.meses.length} meses sem dados da Crítica`} (há de ${OC && OC.meses.length ? mesTxt(OC.meses[0]) + ' a ' + mesTxt(OC.meses[OC.meses.length - 1]) : '—'}).` : '');
      av.hidden = !txt; av.textContent = txt;
      dlg.querySelectorAll('.atalhos button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.de === de && b.dataset.ate === ate)));
    };
    const prontos = { 12: [somaMes(fimDados, -11), fimDados], ano: [fimDados.slice(0, 4) + '-01', fimDados], tudo: [iniDados, fimDados],
      oc: OC && OC.meses.length ? [OC.meses[0], OC.meses[OC.meses.length - 1]] : [somaMes(fimDados, -11), fimDados] };
    dlg.querySelectorAll('.atalhos button').forEach(b => {
      const [de, ate] = prontos[b.dataset.p]; b.dataset.de = de < iniDados ? iniDados : de; b.dataset.ate = ate;
      b.addEventListener('click', () => { f.de.value = b.dataset.de; f.ate.value = b.dataset.ate; conta(); });
    });
    [f.de, f.ate].forEach(x => x.addEventListener('change', () => { q('.baixou').hidden = true; conta(); }));
    f.de.value = prontos[12][0] < iniDados ? iniDados : prontos[12][0]; f.ate.value = fimDados;
    conta();
    const nomeArq = ext => `RELATORIO_MANUTENCAO_${arq(i.al)}_${arq(e.nomes.length > 3 ? e.nomes.length + '_trechos' : e.nomes.join('-'))}_${r.de.replace('-', '')}-${r.ate.replace('-', '')}.${ext}`;
    const age = async (b, txt, faz) => {
      b.disabled = true; const t0 = b.innerHTML, ok = q('.baixou'); b.textContent = txt; ok.hidden = true;
      try { const nome = await faz(); ok.textContent = `Baixado: ${nome}`; ok.hidden = false; }
      catch (err) { alert('Não foi possível gerar: ' + err.message); } finally { b.disabled = false; b.innerHTML = t0; }
    };
    q('.xls').addEventListener('click', ev => age(ev.currentTarget, 'Gerando…', async () => { conta(); const n = nomeArq('xlsx'); baixa(planilha(e, r, EX, OC), n); return n; }));
    q('.pdf').addEventListener('click', ev => age(ev.currentTarget, 'Gerando…', async () => { conta(); const n = nomeArq('pdf'); baixa(await relatorioPdf(e, r, EX, OC), n); return n; }));
    f.addEventListener('submit', ev => ev.preventDefault());
    dlg.showModal();
    return true;
  }
  // ---------- modo manutenção: o relatório embutido no painel do modo e as marcas no mapa ----------
  const cssM = document.createElement('style');
  cssM.textContent = `.fx-mn{display:grid;gap:8px}
.fx-mn .mn-per{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.fx-mn label{display:grid;gap:3px;font-size:11.5px;color:var(--muted)}
.fx-mn select{font:500 13px var(--f-body);color:var(--fg);background:var(--paper);border:1.5px solid var(--line);border-radius:10px;padding:0 8px;min-height:36px;color-scheme:light dark}
.fx-mn .mn-at{display:flex;flex-wrap:wrap;gap:6px}
.fx-mn .mn-at button{font:600 12px var(--f-body);min-height:30px;padding:0 10px;border-radius:999px;border:1.5px solid var(--line);background:none;color:var(--fg);cursor:pointer}
.fx-mn .mn-at button[aria-pressed=true]{border-color:var(--accent);color:var(--accent)}
.fx-mn .mn-n{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}
.fx-mn .mn-n div{padding:6px 8px;border-radius:10px;background:var(--hover)}
.fx-mn .mn-n b{display:block;font:700 15px var(--f-mono);font-variant-numeric:tabular-nums}.fx-mn .mn-n span{font-size:11px;color:var(--muted)}
.fx-mn .mn-n i{display:inline-block;width:8px;height:8px;margin-right:4px;border-radius:2px;background:var(--c)}
.fx-mn .mn-av{margin:0;font-size:11.5px;color:var(--accent)}.fx-mn .mn-ok{margin:0;font-size:11.5px;font-weight:600}
.fx-mn .mn-ac{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.fx-mn .mn-ac button{display:flex;align-items:center;justify-content:center;min-height:40px;border-radius:12px;font:700 13px var(--f-body);cursor:pointer;border:1.5px solid var(--line);background:none;color:var(--fg)}
.fx-mn .mn-ac button.pdf{border:0;background:var(--accent);color:var(--on-accent)}.fx-mn .mn-ac button:disabled{opacity:.5;cursor:default}
@media (pointer:coarse){.fx-mn .mn-at button{min-height:40px}.fx-mn select{min-height:44px;font-size:16px}}`;
  document.head.append(cssM);
  // root: onde o painel entra; pegaE(): o escolhido agora (window.__faixa.escolhaGeo). Devolve {atualiza, fecha}
  async function painel(root, pegaE) {
    const [EX, OC] = await fontes(), map = window.__map;
    const ultimos = [EX && EX.ate && EX.ate.slice(0, 7), OC && OC.meses.length && OC.meses[OC.meses.length - 1]].filter(Boolean).sort();
    const fimDados = ultimos.length ? ultimos[ultimos.length - 1] : somaMes(new Date().toISOString().slice(0, 7), 0);
    const iniDados = [EX && EX.de && EX.de.slice(0, 7), OC && OC.meses[0]].filter(Boolean).sort()[0] || somaMes(fimDados, -11);
    const opMes = mesesEntre(iniDados, fimDados).reverse().map(m => `<option value="${m}">${mesTxt(m)}</option>`).join('');
    root.innerHTML = `<div class="mn-per"><label>De<select name="de">${opMes}</select></label><label>Até<select name="ate">${opMes}</select></label></div>
      <div class="mn-at" role="group" aria-label="Períodos prontos"><button type="button" data-p="12">12 meses</button><button type="button" data-p="ano">${fimDados.slice(0, 4)}</button><button type="button" data-p="oc">Com ocorrências</button><button type="button" data-p="tudo">Tudo</button></div>
      <div class="mn-n" aria-live="polite"><div><b class="n-os">–</b><span><i style="--c:#f59e0b"></i>manut.</span></div><div><b class="n-oc">–</b><span><i style="--c:#dc2626"></i>ocorr.</span></div><div><b class="n-cons">–</b><span>consum.</span></div><div><b class="n-chi">–</b><span>CHI (h)</span></div></div>
      <p class="mn-av" hidden></p><p class="mn-ok" role="status" hidden></p>
      <div class="mn-ac"><button type="button" class="xls">Excel</button><button type="button" class="pdf">Relatório PDF</button></div>`;
    const q = x => root.querySelector(x), sDe = q('[name=de]'), sAte = q('[name=ate]');
    const prontos = { 12: [somaMes(fimDados, -11), fimDados], ano: [fimDados.slice(0, 4) + '-01', fimDados], tudo: [iniDados, fimDados],
      oc: OC && OC.meses.length ? [OC.meses[0], OC.meses[OC.meses.length - 1]] : [somaMes(fimDados, -11), fimDados] };
    const lim = m => m < iniDados ? iniDados : m > fimDados ? fimDados : m;
    sDe.value = lim(prontos[12][0]); sAte.value = fimDados;
    // marcas no mapa: manutenção = quadrado laranja, ocorrência = círculo vermelho (no mesmo ativo, ao lado); o mouse mostra o que é
    map.createPane('mn-marcas').style.zIndex = 455;
    const ren = L.canvas({ pane: 'mn-marcas', tolerance: 6 }), cam = L.layerGroup().addTo(map);
    let r = null, e = null;
    const marcas = () => {
      cam.clearLayers();
      if (!r) return;
      const porPt = new Map(), k = (la, lo) => la.toFixed(5) + ',' + lo.toFixed(5);
      r.os.forEach(o => { const c = k(o.lat, o.lon); (porPt.get(c) || porPt.set(c, { ll: [o.lat, o.lon], os: [], oc: [] }).get(c)).os.push(o); });
      r.oc.forEach(o => { const c = k(o.lat, o.lon); (porPt.get(c) || porPt.set(c, { ll: [o.lat, o.lon], os: [], oc: [] }).get(c)).oc.push(o); });
      porPt.forEach(pt => {
        const lin = [...pt.os.slice(0, 6).map(o => `${br(o.data)} · ${esc(nomeTipo(o.tipo))} · ${esc(o.os)}`), pt.os.length > 6 ? `… e mais ${pt.os.length - 6} manutenção(ões)` : '',
          ...pt.oc.slice(0, 6).map(o => `${br(o.abert)} ${o.abert.slice(11, 16)} · ${esc(causaTxt(o))} · ${nf(o.cons)} UC`), pt.oc.length > 6 ? `… e mais ${pt.oc.length - 6} ocorrência(s)` : ''].filter(Boolean);
        const ativo = (pt.os[0] || pt.oc[0]).ativo, dica = `<b>${esc(ativo)}</b><br>${lin.join('<br>')}`;
        if (pt.os.length) L.circleMarker(pt.ll, { renderer: ren, pane: 'mn-marcas', radius: 6 + Math.min(6, pt.os.length), color: '#1b2024', weight: 2, fillColor: '#f59e0b', fillOpacity: 1 })
          .bindTooltip(dica, { direction: 'top', className: 'mn-dica' }).addTo(cam);
        if (pt.oc.length) L.circleMarker(pt.ll, { renderer: ren, pane: 'mn-marcas', radius: 5 + Math.min(6, pt.oc.length), color: '#fff', weight: 2, fillColor: '#dc2626', fillOpacity: 1 })
          .bindTooltip(dica, { direction: 'top', className: 'mn-dica', offset: [0, -4] }).addTo(cam);
      });
    };
    const conta = () => {
      let de = sDe.value, ate = sAte.value;
      if (de > ate) { [de, ate] = [ate, de]; sDe.value = de; sAte.value = ate; }
      e = pegaE();
      root.querySelectorAll('.mn-at button').forEach(b => { const [a, z] = prontos[b.dataset.p]; b.setAttribute('aria-pressed', String(lim(a) === de && z === ate)); });
      q('.mn-ok').hidden = true;
      if (!e || !e.runs || !e.runs.length) {
        r = null; ['.n-os', '.n-oc', '.n-cons', '.n-chi'].forEach(x => { q(x).textContent = '–'; });
        q('.xls').disabled = q('.pdf').disabled = true; q('.mn-av').hidden = true; marcas(); return;
      }
      r = coleta(e, de, ate, EX, OC);
      q('.n-os').textContent = nf(r.tot.os); q('.n-oc').textContent = nf(r.tot.oc); q('.n-cons').textContent = nf(r.tot.cons); q('.n-chi').textContent = nf(r.tot.chi, 1);
      q('.xls').disabled = q('.pdf').disabled = false;
      const sem = OC ? r.meses.filter(x => !OC.meses.includes(x.m)).length : r.meses.length;
      q('.mn-av').hidden = !sem;
      q('.mn-av').textContent = sem ? `Ocorrências só de ${OC && OC.meses.length ? mesTxt(OC.meses[0]) + ' a ' + mesTxt(OC.meses[OC.meses.length - 1]) : '—'} (${sem} dos ${r.meses.length} meses sem dados).` : '';
      marcas();
    };
    let t = 0;
    const atualiza = () => { clearTimeout(t); t = setTimeout(conta, 120); };
    sDe.addEventListener('change', conta); sAte.addEventListener('change', conta);
    root.querySelector('.mn-at').addEventListener('click', ev => { const b = ev.target.closest('button'); if (!b) return; const [a, z] = prontos[b.dataset.p]; sDe.value = lim(a); sAte.value = z; conta(); });
    const nomeArq = ext => `RELATORIO_MANUTENCAO_${arq(M.al)}_${arq(e.nomes.length > 3 ? e.nomes.length + '_trechos' : e.nomes.join('-'))}_${r.de.replace('-', '')}-${r.ate.replace('-', '')}.${ext}`;
    const age = async (b, faz) => {
      if (!r) return;
      b.disabled = true; const t0 = b.textContent; b.textContent = 'Gerando…';
      try { const n = nomeArq(b.classList.contains('pdf') ? 'pdf' : 'xlsx'); baixa(await faz(), n); q('.mn-ok').textContent = `Baixado: ${n}`; q('.mn-ok').hidden = false; }
      catch (err) { alert('Não foi possível gerar: ' + err.message); } finally { b.disabled = false; b.textContent = t0; }
    };
    q('.xls').addEventListener('click', ev => age(ev.currentTarget, async () => planilha(e, r, EX, OC)));
    q('.pdf').addEventListener('click', ev => age(ev.currentTarget, () => relatorioPdf(e, r, EX, OC)));
    conta();
    return { atualiza, conta, fecha: () => { clearTimeout(t); cam.remove(); root.innerHTML = ''; }, numeros: () => r && r.tot, marcas: () => cam.getLayers().length };
  }
  window.__relManut = { abre, painel, coleta: (e, de, ate) => fontes().then(([EX, OC]) => coleta(e, de, ate, EX, OC)),
    pdf: (e, de, ate) => fontes().then(async ([EX, OC]) => relatorioPdf(e, coleta(e, de, ate, EX, OC), EX, OC)),
    xlsx: (e, de, ate) => fontes().then(([EX, OC]) => planilha(e, coleta(e, de, ate, EX, OC), EX, OC)) };
})();
