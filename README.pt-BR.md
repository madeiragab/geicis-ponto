# GEICIS Ponto

🇧🇷 **Português** | 🇺🇸 [English](README.md)

[![ci](https://github.com/madeiragab/geicis-ponto/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/madeiragab/geicis-ponto/actions/workflows/ci.yml)

Sistema de controle de horas de estágio para o **GEICIS — Grupo de Estudos em
Infraestrutura Computacional e Impacto Social**.

Os alunos batem entrada e saída. O sistema acumula as horas, monta um ranking, e
manda e-mail pra quem não bater o mínimo semanal toda sexta-feira às 23:59.

## Status

**Funcionando.** Backend e frontend estão implementados de acordo com o design
abaixo, com 58 testes de backend passando — [rodados pelo CI a cada push](https://github.com/madeiragab/geicis-ponto/actions/workflows/ci.yml),
junto com uma checagem de que nenhuma mudança de modelo ficou sem migração. O
modelo de domínio e o contrato da API foram fechados em `docs/` antes de
qualquer código ser escrito, então a implementação não teve nada pra adivinhar.

**Ainda não está em produção.** O sistema foi especificado com o GEICIS —
requisitos, regras e contrato da API vieram de um grupo real, com pessoas que
vão bater o ponto nele —, mas a implantação depende do NTI do campus, e o
pedido só sai quando a verba entrar. Não é um projeto de exercício esperando
usuário imaginário; é software pronto parado num processo institucional, que é
onde software costuma esperar.

## Rodando localmente

Backend — Django na porta `:8000`:

```bash
cd backend && python -m venv venv && venv/Scripts/pip install -r requirements.txt && venv/Scripts/python manage.py migrate && venv/Scripts/python manage.py runserver
```

Frontend — Vite na porta `:5173`, fazendo proxy de `/api` pro backend:

```bash
cd frontend && npm install && npm run dev
```

Dados de demonstração (só roda com `DEBUG=True`):

```bash
cd backend && venv/Scripts/python manage.py seed_demo
```

Isso cria três estágios, dois professores e sete alunos com oito semanas de
horas retroativas. Os logins são `coord@geicis.br`, `ana.correia@geicis.br` e
`maria.souza@geicis.br`, todos com a senha `GeicisDemo!2026`.

O job semanal, que o cron roda às `59 23 * * 5`:

```bash
cd backend && venv/Scripts/python manage.py send_weekly_alerts --dry-run
```

Testes:

```bash
cd backend && venv/Scripts/python manage.py test apps
```

## Stack

| Camada     | Escolha                                         |
| ---------- | ------------------------------------------------ |
| Backend    | Django + Django REST Framework                  |
| Login      | SimpleJWT (access 1h / refresh 7d)              |
| Banco      | SQLite em desenvolvimento, PostgreSQL em produção |
| Frontend   | React + Vite + Tailwind CSS                     |
| Agendamento| Comando de gerenciamento do Django disparado por cron |

Tudo que o frontend faz passa pela API REST. Não existem páginas renderizadas
pelo servidor no Django, além do admin.

## Documentação

| Documento                                             | O que cobre                                            |
| ------------------------------------------------------ | ------------------------------------------------------- |
| [architecture.md](docs/pt-br/architecture.md)          | Camadas, responsabilidades, estrutura do projeto, deploy |
| [data-model.md](docs/pt-br/data-model.md)              | Cada entidade, campo e constraint do banco              |
| [business-rules.md](docs/pt-br/business-rules.md)      | Regras de ponto, cálculo de horas, ranking, alerta semanal |
| [api.md](docs/pt-br/api.md)                            | Superfície REST completa, payloads, permissões, códigos de erro |
| [frontend-spec.md](docs/pt-br/frontend-spec.md)        | Telas, componentes, estados, direção visual             |
| [decisions.md](docs/pt-br/decisions.md)                | Por que cada escolha significativa foi feita, e o que não foi |

## Diagramas

| Diagrama                                                              | O que mostra                              |
| ------------------------------------------------------------------------ | ------------------------------------------ |
| [er-diagram.md](docs/pt-br/diagrams/er-diagram.md)                     | Esquema relacional e cardinalidades       |
| [class-diagram.md](docs/pt-br/diagrams/class-diagram.md)               | Classes de domínio e seu comportamento    |
| [sequence-diagrams.md](docs/pt-br/diagrams/sequence-diagrams.md)       | Bater ponto, ranking, alerta semanal       |
| [state-diagram.md](docs/pt-br/diagrams/state-diagram.md)               | Ciclos de vida de TimeEntry e StudentProfile |

Todos os diagramas são Mermaid dentro de Markdown, então renderizam direto no
GitHub e continuam revisáveis em diffs.

## As relações principais em uma respirada

- Um **professor** orienta vários **alunos**, e um aluno pode ter vários
  professores — muitos-para-muitos, através de `Supervision`.
- Um **estágio** hospeda vários **alunos**, e um aluno tem exatamente um
  estágio — um-para-muitos, `StudentProfile.internship` é a chave estrangeira.
- Um **aluno** registra vários **pontos**, no máximo um deles aberto por vez.

## Roteiro

1. ~~Modelagem de domínio e documentação~~
2. ~~Backend: models, migrations, admin~~
3. ~~Backend: autenticação e os endpoints de ponto~~
4. ~~Backend: ranking, resumos, comando de alerta semanal~~
5. ~~Frontend: autenticação, tela de bater ponto, ranking~~
6. ~~Frontend: painéis de professor e coordenador~~
7. Deploy ← você está aqui

O deploy ainda precisa de um host, uma instância PostgreSQL, credenciais SMTP
de verdade e a entrada de cron. Nada no código assume SQLite ou o backend de
e-mail de console — os dois são lidos do ambiente.
