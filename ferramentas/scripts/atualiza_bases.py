"""Atualiza as bases do site a partir dos arquivos novos: é o que a automação do GitHub roda quando alguém envia um
arquivo pelo menu "Atualização de dados" (também roda à mão).

O tipo vem da pasta do arquivo:
  bases/critica/   Critica*.txt com MM-AAAA no nome (o mês do arquivo é trocado inteiro), ou .zip com eles
  bases/limpeza/   planilha de OS de limpeza de faixa (.xlsx, aba Dados)
  bases/inspecao/  base de inspeção (.xlsx, aba Dados)
  bases/manutencao/ OS de manutenção geradas pela inspeção (.xlsx, 1ª aba; as canceladas ficam de fora)
  bases/executadas/ OS_STATUS_Executadas (.zip com o .txt; o .txt sozinho passa do limite de envio do GitHub)
O que roda, na ordem: Crítica (atualiza_critica.py), limpeza (limpeza_faixa.py sem o acervo de KMZ: OS já publicada
mantém a posição), inspeção (inspecao.py), manutenção da inspeção (manutencao.py), manutenção executada
(executadas.py); depois a interface (gera_trechos --so-interface), o NAE/100 km da mesma rede
(teste/ferramentas/nae_rede.py) e a validação dos arquivos. Grava dados/bases.json (o que o menu mostra: data da última
atualização, enviado ou processado, e o período de cada base). Qualquer erro sai com código 1 e a automação não publica nada.

Uso:
  python scripts/atualiza_bases.py --site teste [--lista arquivos.txt] [arquivo ...]
  python scripts/atualiza_bases.py --copia-ferramentas <pasta>   (copia o que a automação usa para <pasta>)
"""
import argparse
import datetime as dt
import glob
import importlib.util
import json
import re
import shutil
import sys
import tempfile
import zipfile
from pathlib import Path

sys.dont_write_bytecode = True                     # nada de __pycache__ dentro do site publicado
AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))
sys.path.insert(0, str(AQUI.parent))

TIPOS = ('critica', 'limpeza', 'inspecao', 'manutencao', 'executadas')
NOMES = {'critica': 'Crítica (NAE)', 'limpeza': 'OS de limpeza de faixa', 'inspecao': 'Base de inspeção',
         'manutencao': 'OS de manutenção da inspeção', 'executadas': 'OS de manutenção executadas'}
MES = re.compile(r'(?<!\d)(0[1-9]|1[0-2])[-_.](20\d\d)(?!\d)')

# o que a automação precisa (pasta ferramentas/ do gh-pages): os scripts e a parte do pacote alimentador que eles usam
FERRAMENTAS = {
    'scripts': ['gera_trechos.py', 'atualiza_critica.py', 'ativos_gis.py', 'inspecao.py', 'limpeza_faixa.py',
                'manutencao.py', 'executadas.py', 'atualiza_bases.py', 'ativos_js.py', 'divisas.py'],
    'alimentador': ['__init__.py', 'critica.py', 'daimon.py', 'gerar_trechos.py', 'regras.py', 'trechos.py',
                    'mapa_trechos.html', 'site_indice.html', 'leaflet/leaflet.css', 'leaflet/leaflet.js',
                    'leaflet/LICENSE', 'site/*'],
}


def copia_ferramentas(destino):
    destino = Path(destino)
    if destino.exists():
        shutil.rmtree(destino)
    for pasta, arqs in FERRAMENTAS.items():
        for padrao in arqs:
            for f in sorted(glob.glob(str(AQUI.parent / pasta / padrao))):
                alvo = destino / pasta / Path(f).relative_to(AQUI.parent / pasta)
                alvo.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(f, alvo)
    (destino / 'LEIA-ME.md').write_text(
        '# Ferramentas da atualização automática\n\nCópia dos scripts que a automação `.github/workflows/'
        'atualiza-bases.yml` roda quando chega um arquivo em `bases/`. Não editar aqui: a cópia é refeita a cada '
        'publicação (`scripts/atualiza_bases.py --copia-ferramentas`).\n', encoding='utf-8')


def tipo_de(caminho):
    partes = Path(caminho).parts
    for i, p in enumerate(partes[:-1]):
        if p == 'bases' and partes[i + 1] in TIPOS:
            return partes[i + 1]
    return None


def arquivos_critica(arqs, tmp):
    """Critica*.txt dos arquivos enviados (abre os .zip); cada um precisa do MM-AAAA no nome."""
    txt = []
    for a in arqs:
        if a.suffix.lower() == '.zip':
            with zipfile.ZipFile(a) as z:
                for n in z.namelist():
                    nome = Path(n).name                 # só o nome: nada de caminho de dentro do zip
                    if nome.lower().endswith('.txt') and nome.lower().startswith('critica'):
                        alvo = Path(tmp) / nome
                        alvo.write_bytes(z.read(n))
                        txt.append(alvo)
        elif a.suffix.lower() == '.txt':
            txt.append(a)
    sem_mes = [t.name for t in txt if not MES.search(t.name)]
    if not txt:
        raise SystemExit('Crítica: nenhum arquivo Critica*.txt (nem dentro do .zip)')
    if sem_mes:
        raise SystemExit(f'Crítica: sem o mês (MM-AAAA) no nome: {", ".join(sem_mes)}')
    return txt


def roda(nome, f, *a):
    """Chama f(*a) mostrando a saída; levanta erro se f devolver código diferente de 0."""
    print(f'\n== {nome}', flush=True)
    r = f(*a)
    if isinstance(r, int) and r != 0:
        raise SystemExit(f'{nome}: terminou com erro ({r})')
    return r


def nae_rede(site):
    p = Path(site) / 'ferramentas' / 'nae_rede.py'
    if not p.exists():
        print('nae_rede.py não está no site: NAE/100 km fica com a NAE da Crítica')
        return
    spec = importlib.util.spec_from_file_location('nae_rede', p)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    saem = m.main(str(site))[0]
    print(f'NAE/100 km: {sum(saem.values())} NAE contadas no alimentador onde o ativo está hoje')


def le_js(p):
    if not p.exists():
        return None
    s = p.read_text(encoding='utf-8')
    return json.loads(s[s.index('=') + 1:].strip().rstrip(';'))


def estado(site, feitos, hoje):
    """dados/bases.json: para cada base, o arquivo e a data do último envio e o período que o site cobre."""
    site = Path(site)
    p = site / 'dados' / 'bases.json'
    est = json.loads(p.read_text(encoding='utf-8')) if p.exists() else {}
    for t, arqs in feitos.items():
        est.setdefault(t, {}).update(arquivo=', '.join(a.name for a in arqs), enviado=hoje)
    r = le_js(site / 'assets' / 'ranking-nae.js') or {}
    if r.get('meses'):
        est.setdefault('critica', {})['meses'] = r['meses']
    for t, arq in (('limpeza', 'limpeza.js'), ('inspecao', 'inspecao.js'), ('manutencao', 'manutencao.js'),
                   ('executadas', 'executadas.js')):
        oss, info = set(), None
        for f in sorted((site / 'alimentadores').glob(f'*/{arq}')):
            d = le_js(f)
            if d:                                       # a mesma OS em dois alimentadores conta uma vez
                oss |= {o[0] if isinstance(o, list) else o['os_completa'] for o in d['os']}   # executadas: OS em lista
                info = info or d
        if info:
            est.setdefault(t, {}).update(os=len(oss), processado=info.get('gerado'))
            est[t].setdefault('arquivo', info.get('fonte'))   # base que não veio pelo menu: o arquivo de origem gravado
            ate = info.get('ate') if t == 'executadas' else info.get('base_ate') if t in ('inspecao', 'manutencao') else None
            if ate:
                est[t]['ate'] = ate
    for t in TIPOS:
        est.setdefault(t, {})['nome'] = NOMES[t]
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(est, ensure_ascii=False, indent=1, sort_keys=True) + '\n', encoding='utf-8')
    return est


def atualiza(site, arquivos, hoje=None):
    hoje = hoje or dt.date.today().isoformat()
    site = Path(site)
    por = {t: [] for t in TIPOS}
    for a in arquivos:
        a = Path(a)
        if a.name.upper().startswith('LEIA-ME') or not a.exists():
            continue
        t = tipo_de(a)
        if t:
            por[t].append(a)
        else:
            print(f'ignorado (fora das pastas de bases/: {", ".join(TIPOS)}): {a}')
    feitos = {t: v for t, v in por.items() if v}
    if not feitos:
        print('nenhuma base nova para processar')
        return {}
    import gera_trechos as gt
    with tempfile.TemporaryDirectory() as tmp:
        if 'critica' in feitos:
            import atualiza_critica
            txt = arquivos_critica(feitos['critica'], tmp)
            args = ['--site', str(site)] + [x for t in txt for x in ('--critica', str(t))]
            roda('Crítica: ' + ', '.join(t.name for t in txt), atualiza_critica.main, args)
        if 'limpeza' in feitos:
            import limpeza_faixa
            limpeza_faixa.usa_site(site)
            for a in feitos['limpeza'][-1:]:          # a planilha traz todas as OS: vale a última enviada
                _, por_al = roda('Limpeza de faixa: ' + a.name, limpeza_faixa.main, str(a))
                print(f'{sum(len(v) for v in por_al.values())} OS em {sum(bool(v) for v in por_al.values())} alimentadores')
                feitos['limpeza'] = [a]
        if 'inspecao' in feitos:
            import inspecao
            for a in feitos['inspecao'][-1:]:         # a base traz todas as inspeções: vale a última enviada
                r = roda('Inspeção: ' + a.name, inspecao.main, str(a), str(site))
                print(f"{r['executadas']} executadas · {r['situacao']}")
                feitos['inspecao'] = [a]
        if 'manutencao' in feitos:
            import manutencao
            for a in feitos['manutencao'][-1:]:       # a base traz todas as OS: vale a última enviada
                r = roda('Manutenção: ' + a.name, manutencao.main, str(a), str(site))
                print(f"{r['validas']} OS (sem {r['canceladas']} canceladas) · {r['situacao']}")
                feitos['manutencao'] = [a]
        if 'executadas' in feitos:
            import executadas
            for a in feitos['executadas'][-1:]:       # a base traz todas as OS executadas: vale a última enviada
                r = roda('Manutenção executada: ' + a.name, executadas.main, str(a), str(site))
                print(f"{r['manutencao']} OS de manutenção (MC e MP) · {r['em_paginas']} no site · {r['situacao']}")
                feitos['executadas'] = [a]
    roda('Páginas e rankings', gt.main, ['--saida', str(site), '--so-interface'])
    print('\n== NAE/100 km da mesma rede', flush=True)
    nae_rede(site)
    roda('Validação', gt.main, ['--saida', str(site), '--validar'])
    est = estado(site, feitos, hoje)
    print('\n== Bases no site')
    for t in TIPOS:
        print(f"  {NOMES[t]}: {json.dumps({k: v for k, v in est[t].items() if k != 'nome'}, ensure_ascii=False)}")
    return feitos


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument('--site', help='pasta do site (teste/)')
    ap.add_argument('--lista', help='arquivo com um caminho por linha (o que a automação recebeu)')
    ap.add_argument('--copia-ferramentas', metavar='PASTA')
    ap.add_argument('arquivos', nargs='*')
    a = ap.parse_args(argv)
    if a.copia_ferramentas:
        copia_ferramentas(a.copia_ferramentas)
        return 0
    if not a.site:
        ap.error('--site é obrigatório')
    arqs = list(a.arquivos)
    if a.lista:
        arqs += [l.strip() for l in Path(a.lista).read_text(encoding='utf-8').splitlines() if l.strip()]
    atualiza(a.site, arqs)
    return 0


if __name__ == '__main__':
    sys.exit(main())
