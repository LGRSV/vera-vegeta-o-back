"""Regras de zona, tronco/ramal e blocos de um alimentador de média tensão.

Entrada: a rede como árvore de vãos com raiz no DJ.

    nos  = {id: {'tipo': 'DJ' | '79' | '03' | '33' | '02' | '88' | … | 'P', 'nome': str, 'poste': str, 'lat': float, 'lon': float}}
           'P' é poste sem equipamento (passagem, derivação ou fim de linha). O tipo é o prefixo do código da chave.
    vaos = [(pai, filho), ...]   um vão por poste a poste, orientado a partir do DJ.

Regras (confirmadas com o usuário; as marcadas "a confirmar" seguem o exemplo aprovado até agora):
    - Zona: T1 do DJ ao 1º religador (79). Depois de qualquer 79 é T2, inclusive 79 em ramal e 79 depois do 2º:
      religador nunca cria T3. Depois de uma chave fusível (03/33/02) ou trip saver (40/41) é T3; fusível depois de fusível continua T3
      (não existe T4).
    - Tronco: caminho DJ → 1º 79 → 2º 79 e, depois do 2º 79, até os próximos ativos (79 ou fusível): o trecho
      entre dois ativos do tronco ainda é tronco. Pontas sem equipamento são ramal. Nunca tem T3.
      Se houver mais de um candidato a 2º 79, fica o que tem mais rede depois dele (a confirmar).
      Fusível no tronco (FTR): na linha principal (do 2º 79, ou do DJ sem 2º 79, até o fim, pelo lado que ainda tem
      religador com pelo menos RL_MIN_M de rede depois e, entre esses, pelo ramo que chega mais longe do DJ), só a
      1ª chave fusível depois do religador, se estiver a menos de FTR_MAX_M (300 m, pela rede) dele, não abre T3 nem
      muda a zona: o tronco segue como T2 até a próxima chave (decisão do usuário, AL01086016; limite de 300 m em
      out/2026, LD01020023). A 300 m ou mais, ou a chave seguinte na linha principal, já abre T3.
    - Ramal: todo o resto. Leva o nome do poste onde sai do tronco; depois do 2º 79 é "Ramal após <2º 79>".
    - Ativo de referência de um vão: o último DJ/79/03 antes dele, vindo do DJ. Ele engloba o vão e tudo depois.
    - Bloco: vãos com o mesmo ativo de referência e o mesmo ramal. Chaves 88 (e outras que não são DJ/79/fusível)
      não dividem bloco; são só listadas.
    - Chaves 02 e 33 contam como fusível (03), como no prompt original (a confirmar para 02).
    - Trip saver (código começando em 40 ou 41) é dispositivo de proteção e abre T3, como fusível.
    - Chave 03/33/02 com religador depois é seccionamento, não fusível: não muda a zona e só é listada (a confirmar).
"""
import math

FUSIVEIS = ('03', '33', '02', '40', '41')   # 40/41 = trip saver (dispositivo de proteção), abre T3
SECCIONAMENTO = 'SEC'   # 03/33/02 com religador depois
FUSIVEL_TRONCO = 'FTR'  # 03/33/02 na linha principal do tronco
RL_MIN_M = 100          # religador com menos de ~2 vãos de rede depois dele (toco) não puxa a linha principal
FTR_MAX_M = 300         # fusível no tronco só a menos desta distância (m, pela rede) do religador; None: sem limite
PROTECAO = ('DJ', '79') + FUSIVEIS
RAIO_TERRA = 6371000.0


def haversine(a, b):
    (la1, lo1), (la2, lo2) = a, b
    p1, p2 = math.radians(la1), math.radians(la2)
    dp, dl = p2 - p1, math.radians(lo2 - lo1)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * RAIO_TERRA * math.asin(math.sqrt(h))


def _posicao_rotulo(rs, pt):
    """Meio do primeiro trecho contínuo do bloco (onde o número do bloco aparece no mapa)."""
    cadeia = [rs[0]]
    for r in rs[1:]:
        if r['p'] != cadeia[-1]['c']:
            break
        cadeia.append(r)
    m = cadeia[len(cadeia) // 2]
    return tuple((pt(m['p'])[i] + pt(m['c'])[i]) / 2 for i in (0, 1))


class RedeInvalida(ValueError):
    pass


def analisar(nos, vaos, raiz):
    """Aplica as regras e devolve vãos, blocos, ativos e avisos."""
    if nos.get(raiz, {}).get('tipo') != 'DJ':
        raise RedeInvalida(f'a raiz {raiz!r} precisa ser o DJ')
    filhos, pai = {}, {}
    for p, c in vaos:
        if p not in nos or c not in nos:
            raise RedeInvalida(f'vão {p}→{c} usa nó inexistente')
        if c in pai:
            raise RedeInvalida(f'o nó {c} tem dois vãos chegando ({pai[c]} e {p}); a rede precisa ser uma árvore')
        pai[c] = p
        filhos.setdefault(p, []).append(c)
    alcancados, pilha = {raiz}, [raiz]
    while pilha:
        for c in filhos.get(pilha.pop(), []):
            if c in alcancados:
                raise RedeInvalida(f'laço na rede passando por {c}')
            alcancados.add(c)
            pilha.append(c)
    soltos = set(nos) - alcancados
    if soltos:
        raise RedeInvalida(f'{len(soltos)} nó(s) sem ligação com o DJ, ex.: {sorted(soltos)[:5]}')

    tipo_cad = lambda n: nos[n]['tipo']
    nome = lambda n: nos[n]['nome']
    pt = lambda n: (nos[n]['lat'], nos[n]['lon'])
    comp = {(p, c): haversine(pt(p), pt(c)) for p, c in vaos}

    # ordem da raiz para as pontas (sem recursão: redes reais têm milhares de vãos)
    ordem_nos = [raiz]
    for n in ordem_nos:
        ordem_nos.extend(filhos.get(n, []))

    # chave 03/33/02 com religador depois é seccionamento, não fusível: fusível não fica antes de religador
    rl_abaixo = {}
    for n in reversed(ordem_nos):
        rl_abaixo[n] = any(tipo_cad(c) == '79' or rl_abaixo[c] for c in filhos.get(n, []))
    secc = {n for n in ordem_nos if tipo_cad(n) in FUSIVEIS and rl_abaixo[n]}

    # religadores a montante de cada nó (sem contar o próprio) e o 2º religador do tronco
    rl_acima = {raiz: 0}
    for n in ordem_nos[1:]:
        rl_acima[n] = rl_acima[pai[n]] + (1 if tipo_cad(pai[n]) == '79' else 0)
    abaixo = {}
    for n in reversed(ordem_nos):
        abaixo[n] = sum(comp[(n, c)] + abaixo[c] for c in filhos.get(n, []))
    # 2º religador: um 79 com exatamente um 79 antes dele (fusível antes de religador é seccionamento)
    candidatos = [n for n in ordem_nos if tipo_cad(n) == '79' and rl_acima[n] == 1]
    fim_rl2 = max(candidatos, key=lambda n: abaixo[n]) if candidatos else None

    # linha principal do tronco: até o 2º religador e, dali (ou do DJ), sempre o lado que ainda tem religador (que não
    # seja toco) e, entre esses, o que chega mais longe do DJ, até o fim; fusível nela não abre T3 (fusível no tronco)
    alcance, rl_rel = {}, {}
    for n in reversed(ordem_nos):
        fs = filhos.get(n, [])
        alcance[n] = max((comp[(n, c)] + alcance[c] for c in fs), default=0)
        rl_rel[n] = any((tipo_cad(c) == '79' and abaixo[c] >= RL_MIN_M) or rl_rel[c] for c in fs)
    principal, x = [], fim_rl2
    while x is not None and x != raiz:
        principal.append((pai[x], x))
        x = pai[x]
    principal.reverse()
    n = fim_rl2 if fim_rl2 is not None else raiz
    while filhos.get(n):
        c = max(filhos[n], key=lambda k: ((tipo_cad(k) == '79' and abaixo[k] >= RL_MIN_M) or rl_rel[k], comp[(n, k)] + alcance[k]))
        principal.append((n, c))
        n = c
    ftr, depois_rl, desde_rl = set(), False, 0.0
    for p, c in principal:                          # só a 1ª chave fusível depois de cada religador
        desde_rl += comp[(p, c)]
        if tipo_cad(c) == '79':
            depois_rl, desde_rl = True, 0.0
        elif tipo_cad(c) in FUSIVEIS and c not in secc:
            if depois_rl and (FTR_MAX_M is None or desde_rl < FTR_MAX_M):
                ftr.add(c)
            depois_rl = False
    tipo = lambda n: SECCIONAMENTO if n in secc else FUSIVEL_TRONCO if n in ftr else tipo_cad(n)

    # zona de saída de cada nó
    zona = {raiz: 1}
    for n in ordem_nos[1:]:
        z = zona[pai[n]]
        zona[n] = max(z, 2) if tipo(n) == '79' else 3 if tipo(n) in FUSIVEIS else z

    # extensão T1/T2 pendurada em cada nó (escolha do tronco sem 2º religador)
    abaixo12 = {}
    for n in reversed(ordem_nos):
        abaixo12[n] = sum((comp[(n, c)] if zona[n] <= 2 else 0) + abaixo12[c] for c in filhos.get(n, []))

    avisos = []
    if secc:
        avisos.append(f'{len(secc)} chave(s) 03/33/02 com religador depois tratada(s) como seccionamento '
                      f'(não mudam a zona; entram na lista do bloco): ' + ', '.join(nome(n) for n in ordem_nos if n in secc))
    if ftr:
        avisos.append(f'{len(ftr)} 1ª(s) chave(s) fusível(is) depois do religador do tronco não abrem T3 (o tronco segue como T2): '
                      + ', '.join(nome(n) for n in ordem_nos if n in ftr))
    tronco = set()
    if candidatos:
        if len(candidatos) > 1:
            outros = ', '.join(nome(n) for n in candidatos if n != fim_rl2)
            avisos.append(f'Mais de um religador pode ser o 2º do tronco; escolhido {nome(fim_rl2)} '
                          f'(mais rede depois dele). Outros candidatos: {outros}.')
        x = fim_rl2
        while x != raiz:
            tronco.add((pai[x], x))
            x = pai[x]
    else:
        avisos.append('Alimentador sem 2º religador: o tronco seguiu o lado com mais rede T1/T2 e parou antes de chave 03.')
        n = raiz
        while True:
            # Preferir o ramo que ainda tem religador: com um único religador no
            # alimentador, escolher só por extensão fazia o tronco passar ao
            # lado dele, o T1 não terminava no 1º religador e ele era batizado
            # T2-A sem existir T2 (10 de 44 alimentadores com religador).
            opcoes = [c for c in filhos.get(n, []) if tipo(c) not in FUSIVEIS]
            com_rl = [c for c in opcoes if tipo_cad(c) == '79' or rl_rel[c]]
            if com_rl:
                opcoes = com_rl
            if not opcoes:
                break
            c = max(opcoes, key=lambda k: comp[(n, k)] * (zona[n] <= 2) + abaixo12[k])
            tronco.add((n, c))
            n = c
    if fim_rl2 is not None:
        # depois do 2º religador o tronco segue até os próximos ativos (vem depois de um ativo do tronco)
        tem_ativo = {}
        for n in reversed(ordem_nos):
            tem_ativo[n] = tipo(n) in PROTECAO or any(tem_ativo[c] for c in filhos.get(n, []))
        pilha = [fim_rl2]
        while pilha:
            n = pilha.pop()
            for c in filhos.get(n, []):
                if tem_ativo[c] and zona[n] <= 2:
                    tronco.add((n, c))
                    if tipo(c) not in PROTECAO:
                        pilha.append(c)
    nos_tronco = {x for v in tronco for x in v} or {raiz}   # DJ ligado direto a um 03: sem tronco
    if any(zona[p] > 2 for p, _ in tronco):
        raise RedeInvalida('regra violada: tronco com T3 ou mais')

    # ordem dos vãos: percurso a partir do DJ, entrando primeiro no tronco
    ordem_vaos, pilha = [], [(raiz, iter(sorted(filhos.get(raiz, []), key=lambda c: (raiz, c) not in tronco)))]
    while pilha:
        n, it = pilha[-1]
        c = next(it, None)
        if c is None:
            pilha.pop()
            continue
        ordem_vaos.append((n, c))
        pilha.append((c, iter(sorted(filhos.get(c, []), key=lambda k: (c, k) not in tronco))))
    idx_vao = {v: i for i, v in enumerate(ordem_vaos)}

    def listada(n):   # chave que não é DJ/79/fusível: só aparece na lista do bloco
        return tipo(n) not in PROTECAO and tipo(n) != 'P'

    def ref_de(n):
        while tipo(n) not in PROTECAO:
            n = pai[n]
        return n

    def saida_do_tronco(c):
        x = c
        while not (pai[x] in nos_tronco and (pai[x], x) not in tronco):
            x = pai[x]
        return pai[x]

    def caminho(n):
        out, x = [], n
        while True:
            if tipo(x) in PROTECAO:
                out.append(nome(x))
            if x == raiz:
                return out[::-1]
            x = pai[x]

    # ativos de proteção a jusante de cada nó (inclui o próprio), na ordem dos vãos
    jusante = {}
    for n in reversed(ordem_nos):
        fs = sorted(filhos.get(n, []), key=lambda c: idx_vao[(n, c)])
        jusante[n] = ([nome(n)] if tipo(n) in PROTECAO else []) + [a for c in fs for a in jusante[c]]

    dist = {raiz: 0.0}
    for n in ordem_nos[1:]:
        dist[n] = dist[pai[n]] + comp[(pai[n], n)]

    def nome_ramal(dep):
        # sai de um ativo no fim do tronco: "Ramal após <ativo>"; senão, poste de onde sai do tronco;
        # sem poste conhecido, o 1º equipamento do ramal
        if tipo(dep) in PROTECAO and dep != raiz:
            return f'Ramal após {nome(dep)}'
        if nos[dep].get('poste_real', True):
            return f'Ramal {nos[dep]["poste"]}'
        primeiro = next((a for c in filhos.get(dep, []) if (dep, c) not in tronco for a in jusante[c]), None)
        return f'Ramal do {primeiro}' if primeiro else f'Ramal {nos[dep]["poste"]}'

    registros = []
    for p, c in ordem_vaos:
        ref = ref_de(p)
        if (p, c) in tronco:
            ramal, dep = 'Tronco', None
        else:
            dep = saida_do_tronco(c)
            ramal = nome_ramal(dep)
        raiz_bloco = dep if (dep is not None and ref in nos_tronco) else ref
        registros.append(dict(p=p, c=c, ref=ref, ramal=ramal, dep=dep, raiz_bloco=raiz_bloco))

    # blocos: tronco primeiro, depois ramais na ordem em que saem do tronco
    chave_bloco = lambda r: (r['ref'], r['ramal'], r['raiz_bloco'])
    grupos = {}
    for r in registros:
        grupos.setdefault(chave_bloco(r), []).append(r)
    saida_ramal = {}   # ramal -> distância do DJ até o poste onde sai do tronco
    for r in registros:
        if r['dep'] is not None:
            saida_ramal.setdefault(r['ramal'], (dist[r['dep']], idx_vao[(r['p'], r['c'])]))
    ordem_bloco = sorted(grupos, key=lambda k: (k[1] != 'Tronco', saida_ramal.get(k[1], (-1, -1)),
                                                 idx_vao[(grupos[k][0]['p'], grupos[k][0]['c'])]))
    num_bloco = {k: i for i, k in enumerate(ordem_bloco, 1)}
    # vãos numerados na ordem dos blocos (e, dentro do bloco, a partir do ativo de referência)
    registros.sort(key=lambda r: (num_bloco[chave_bloco(r)], idx_vao[(r['p'], r['c'])]))

    saida_vaos = []
    for i, r in enumerate(registros, 1):
        p, c, ref = r['p'], r['c'], r['ref']
        saida_vaos.append(dict(
            id=f'TR-{i:03d}', ini=nos[p]['poste'], fim=nos[c]['poste'], a=pt(p), b=pt(c),
            ext=comp[(p, c)], dist_dj=dist[c], dist_ref=dist[c] - dist[ref],
            zona=zona[p], tronco=(p, c) in tronco, ramal=r['ramal'], bloco=num_bloco[chave_bloco(r)],
            ref=nome(ref), ref_tipo=tipo(ref), caminho=caminho(ref), posteriores=jusante[c],
            chave88_fim=nome(c) if listada(c) else '', _p=p, _c=c))

    blocos = []
    for k in ordem_bloco:
        ref, ramal, rb = k
        rs = grupos[k]
        fins, chaves88, post = [], [], []
        for r in rs:
            c = r['c']
            if tipo(c) in PROTECAO:
                fins.append(nome(c))
            elif listada(c):
                chaves88.append(nome(c))
            if not filhos.get(c):
                fins.append(f'fim {nos[c]["poste"]}')
            for a in jusante[c]:
                if a not in post:
                    post.append(a)
        blocos.append(dict(
            n=num_bloco[k], zona=zona[ref], ramal=ramal, tronco=ramal == 'Tronco', ref=nome(ref),
            de=nome(ref) if rb == ref else f'poste {nos[rb]["poste"]}', ate=fins, chaves88=chaves88,
            caminho=caminho(ref), posteriores=post, qtd=len(rs), ext=sum(comp[(r['p'], r['c'])] for r in rs),
            pos=_posicao_rotulo(rs, pt)))

    ativos = []
    bloco_do_vao_ate = {v['_c']: v['bloco'] for v in saida_vaos}
    pos_vao = {v['_c']: i for i, v in enumerate(saida_vaos)}
    for n in sorted(ordem_nos, key=lambda n: pos_vao.get(n, -1)):
        if tipo(n) == 'P':
            continue
        proprios = sorted({b['n'] for b in blocos if b['ref'] == nome(n)}) if tipo(n) in PROTECAO else []
        ativos.append(dict(
            nome=nome(n), tipo=tipo(n), poste=nos[n]['poste'], lat=nos[n]['lat'], lon=nos[n]['lon'],
            zona_antes=zona[pai[n]] if n != raiz else None, zona_depois=zona[n],
            caminho=caminho(n) if tipo(n) in PROTECAO else caminho(ref_de(n)),
            posteriores=jusante[n][1:] if tipo(n) in PROTECAO else jusante[n], blocos_proprios=proprios,
            bloco=bloco_do_vao_ate.get(n), no_tronco=n in nos_tronco))

    return dict(vaos=saida_vaos, blocos=blocos, ativos=ativos, avisos=avisos,
                total_m=sum(comp.values()), fim_tronco=nome(fim_rl2) if fim_rl2 else None)
