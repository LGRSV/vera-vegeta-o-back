"""Trechos (T1, T2, T2-A…, T3-A…) e NAE por trecho para um ou mais alimentadores, de ponta a ponta.

    python -m alimentador.gerar_trechos alimentador/entrada/SE-2ARS_Circ-LD0*110005.kml \\
        --postes ../vera-vegetacao/dados --critica 'crit/Critica-CHEIO_0*-2026.txt' --mes 2026-01 \\
        --site ../vera-vegeta-o-back --se-nome SE-2ARS='Arraias II'

Para cada KML (export do Daimon, nome SE-XXXX_Circ-<alimentador>.kml) grava em --saida/<alimentador>/:
    mapa-trechos.html            mapa com satélite, lista de trechos (início → fim) e NAE por mês
    <alimentador>-trechos.kmz    os mesmos trechos para o Google Earth / My Maps
Com --site, grava também <alimentador>.html e o KMZ na pasta do site e refaz o index.html (lista por SE).
"""
import argparse
import glob
import html
import json
import re
import shutil
import sys
from pathlib import Path

from . import critica, daimon, regras, trechos

MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']


def nomes(kml):
    """'SE-2ARS_Circ-LD01110005.kml' → ('SE-2ARS', 'LD01110005')."""
    m = re.match(r'(.+?)_Circ-(.+)\.kml$', Path(kml).name, re.I)
    if not m:
        raise SystemExit(f'nome de KML fora do padrão SE-XXXX_Circ-<alimentador>.kml: {kml}')
    return m.group(1), m.group(2)


def achar_postes(origem, al):
    """Lista {id, lat, lon} dos postes: arquivo JSON ou pasta onde procurar <alimentador>.json (vera-vegetacao/dados)."""
    if not origem:
        return None
    p = Path(origem)
    arq = p if p.is_file() else next(iter(sorted(p.rglob(f'{al}.json'))), None)
    if not arq:
        print(f'  {al}: sem arquivo de postes em {origem}; os nós ficam como N<número>')
        return None
    dados = json.load(open(arq, encoding='utf-8'))
    if isinstance(dados, dict):
        dados = dados.get('postes') or dados.get('features') or next(iter(dados.values()))
    return dados


def processar(kml, saida, postes, arquivos_critica, outros, mes=None):
    se, al = nomes(kml)
    nos, vaos, raiz, info = daimon.ler_circuito(kml, postes)
    res = regras.analisar(nos, vaos, raiz)
    ts = trechos.segmentar(nos, res)
    oc = None
    if arquivos_critica:
        pts_outros = {nomes(k)[1]: critica.pontos_kml(k) for k in outros if nomes(k)[1] != al}
        oc = critica.por_trecho(critica.ocorrencias(critica.ler(arquivos_critica, al)), res, ts,
                                critica.pontos_kml(kml), pts_outros)
    pasta = Path(saida) / al
    pasta.mkdir(parents=True, exist_ok=True)
    trechos.mapa(nos, res, al, pasta / 'mapa-trechos.html', interrupcoes=oc)
    trechos.kmz(nos, res, al, pasta / f'{al}-trechos.kmz')

    rls = [a for a in res['ativos'] if a['tipo'] == '79']
    print(f"{al} ({se}): {len(res['vaos'])} vãos · {res['total_m'] / 1000:.1f} km · {len(rls)} religador(es) · {len(ts)} trechos"
          f" · postes ligados {info['postes_ligados']}")
    for t in ts:
        if t['tipo'] != 'fusivel':
            print(f"  {t['nome']}: {t['inicio']} → {' / '.join(t['fim'])} ({t['ext'] / 1000:.2f} km)")
    print(f"  T3: {sum(t['tipo'] == 'fusivel' for t in ts)} trechos")
    for a in res['avisos']:
        print('  aviso:', a)
    if oc is not None:
        por_mes = {}
        for o in oc:
            m = por_mes.setdefault(o['mes'], [0, 0, 0])
            m[0 if o['coletiva'] else 1] += 1
            m[2] += o['trecho'] is None
        for m, (c, i, f) in sorted(por_mes.items()):
            print(f'  NAE {m}: {c} coletivas · {i} individuais · {f} fora dos trechos atuais')
        if mes:
            print(f'  NAE {mes} por trecho (coletivas · individuais):')
            ordem = {t['nome']: i for i, t in enumerate(ts)}
            grupos = {}
            for o in oc:
                if o['mes'] == mes:
                    nome = o['trecho'] or (o['fora'] if o['fora'].startswith('fora') else f"fora · {o['fora']}")
                    g = grupos.setdefault(nome, [0, 0])
                    g[0 if o['coletiva'] else 1] += 1
            for nome, (c, i) in sorted(grupos.items(), key=lambda g: ordem.get(g[0], len(ordem))):
                print(f'    {nome}: {c} · {i}')
            if not grupos:
                print('    nenhuma ocorrência')
    return se, al, pasta


LEAFLET = Path(__file__).resolve().parent / 'leaflet'      # Leaflet 1.9.4 (licença BSD em leaflet/LICENSE)
CDN = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/'


def pagina_site(pasta, al, se, se_nome, site):
    """Página do alimentador no site: Leaflet embutido (não depende de CDN), sem indexação, link para a lista e o KMZ."""
    h = (pasta / 'mapa-trechos.html').read_text(encoding='utf-8')
    rotulo = f'{se} {se_nome} · ' if se_nome else f'{se} · '
    meta = html.escape(f'{al}|{se}|{se_nome}')
    for a, b in [
        ('<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">',
         f'<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
         f'<meta name="robots" content="noindex, nofollow">\n<meta name="alimentador" content="{meta}">'),
        ('Chaves 88 não aparecem.', f'Chaves 88 não aparecem. <a href="{al}-trechos.kmz">Baixar o KMZ para o Google Earth</a>.'),
        ('<span class="eyebrow">', f'<a href="./" style="font-size:14px">← Todos os alimentadores</a>\n    '
                                   f'<span class="eyebrow">{html.escape(rotulo)}'),
        (f'<link rel="stylesheet" href="{CDN}leaflet.css">',
         '<style>\n' + (LEAFLET / 'leaflet.css').read_text(encoding='utf-8') + '\n</style>'),
        (f'<script src="{CDN}leaflet.js"></script>',
         '<script>\n' + (LEAFLET / 'leaflet.js').read_text(encoding='utf-8') + '\n</script>')]:
        assert h.count(a) == 1, a[:50]
        h = h.replace(a, b)
    (Path(site) / f'{al}.html').write_text(h, encoding='utf-8')
    shutil.copy(pasta / f'{al}-trechos.kmz', Path(site) / f'{al}-trechos.kmz')


def indice_site(site):
    """index.html com os alimentadores do site agrupados por SE (lê a meta 'alimentador' de cada página)."""
    grupos = {}
    for p in sorted(Path(site).glob('*.html')):
        h = p.read_text(encoding='utf-8')
        m = re.search(r'<meta name="alimentador" content="([^"]*)">', h)
        if not m:
            continue
        al, se, se_nome = html.unescape(m.group(1)).split('|')
        D = json.loads(re.search(r'const D = (\{.*?\});\n', h, re.S).group(1).replace('<\\/', '</'))
        nae = D.get('nae') or {'meses': [], 'oc': []}
        m0 = nae['meses'][0] if nae['meses'] else None
        grupos.setdefault((se, se_nome), []).append(dict(
            al=al, arq=p.name, km=sum(t['ext'] for t in D['trechos']) / 1000, trechos=len(D['trechos']),
            rl=sum(a['t'] == '79' for a in D['principais']), mes=m0,
            col=sum(1 for o in nae['oc'] if o['mes'] == m0 and o['col'])))
    num = lambda x: f'{x:,.1f}'.replace(',', 'X').replace('.', ',').replace('X', '.')
    blocos = []
    for (se, se_nome), als in sorted(grupos.items()):
        blocos.append(f'<section><h2>{html.escape(se)}{" · " + html.escape(se_nome) if se_nome else ""}</h2><div class="grade">')
        for r in als:
            mes = f"{MESES[int(r['mes'][5:7]) - 1]}/{r['mes'][:4]}" if r['mes'] else None
            nae = f'<span class="nae">NAE {mes}: <strong>{r["col"]}</strong> coletivas</span>' if mes else ''
            blocos.append(f'<a class="card" href="{r["arq"]}"><b>{html.escape(r["al"])}</b><span>{num(r["km"])} km · '
                          f'{r["trechos"]} trechos · {r["rl"]} religador{"es" if r["rl"] != 1 else ""}</span>{nae}</a>')
        blocos.append('</div></section>')
    modelo = (Path(__file__).resolve().parent / 'site_indice.html').read_text(encoding='utf-8')
    (Path(site) / 'index.html').write_text(modelo.replace('%%BLOCOS%%', ''.join(blocos)), encoding='utf-8')
    (Path(site) / '.nojekyll').touch()
    return sum(len(v) for v in grupos.values())


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('kml', nargs='+', help='KML do Daimon (SE-XXXX_Circ-<alimentador>.kml)')
    ap.add_argument('--saida', default='alimentador/saida', help='pasta das saídas (uma subpasta por alimentador)')
    ap.add_argument('--postes', help='JSON de postes ou pasta onde procurar <alimentador>.json (ex.: vera-vegetacao/dados)')
    ap.add_argument('--critica', action='append', default=[], help="Critica*.txt (aceita padrão entre aspas; repetir para vários)")
    ap.add_argument('--mes', help='imprime o NAE por trecho deste mês de competência (AAAA-MM)')
    ap.add_argument('--outros', action='append', default=[],
                    help='KML de alimentador vizinho, para dizer onde está hoje o ativo que saiu do cadastro')
    ap.add_argument('--site', help='pasta do site (GitHub Pages): grava <alimentador>.html, o KMZ e refaz o index.html')
    ap.add_argument('--se-nome', action='append', default=[], help="nome da SE para o site, ex.: SE-2ARS='Arraias II'")
    a = ap.parse_args(argv)
    if a.mes and not re.fullmatch(r'\d{4}-\d{2}', a.mes):
        raise SystemExit(f'--mes no formato AAAA-MM, ex.: 2026-01 (veio {a.mes})')
    arquivos_critica = sorted({f for padrao in a.critica for f in glob.glob(padrao)})
    if a.critica and not arquivos_critica:
        raise SystemExit(f'nenhum arquivo da Crítica encontrado em {a.critica}')
    se_nomes = dict(s.split('=', 1) for s in a.se_nome)
    a.kml = [f for p in a.kml for f in (sorted(glob.glob(p)) or [p])]      # padrão (pasta/*.kml) também no Windows
    for kml in a.kml:
        se, al, pasta = processar(kml, a.saida, achar_postes(a.postes, nomes(kml)[1]), arquivos_critica,
                                  a.outros + [k for k in a.kml if k != kml], a.mes)
        if a.site:
            pagina_site(pasta, al, se, se_nomes.get(se, ''), a.site)
    if a.site:
        print(f'site: {indice_site(a.site)} alimentador(es) no index.html de {a.site}')


if __name__ == '__main__':
    sys.exit(main())
