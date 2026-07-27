# Referência da API

🇧🇷 **Português** | 🇺🇸 [English](../api.md)

URL base: `/api/`
Todas as requisições e respostas são JSON. Todos os timestamps são ISO 8601
com offset (`2026-07-24T14:03:00-03:00`). Todos os valores de horas são
números decimais com duas casas.

## Autenticação

JWT via `rest_framework_simplejwt`, a mesma configuração do projeto
`social-network`: token de acesso válido por **1 hora**, token de refresh por
**7 dias**.

Todo endpoint, exceto `POST /auth/token/`, `POST /auth/token/refresh/`, e
`POST /auth/register/`, exige:

```
Authorization: Bearer <access_token>
```

`DEFAULT_PERMISSION_CLASSES` é `IsAuthenticated`, então um decorador
esquecido falha fechado, não aberto.

### Reforços além do padrão do social-network

Registros de ponto são documentos auditáveis, então três configurações são
reforçadas:

| Configuração                | Valor  | Por quê                                                    |
| ----------------------------- | ------ | ------------------------------------------------------------- |
| `ROTATE_REFRESH_TOKENS`      | `True` | um refresh token roubado é invalidado no próximo uso legítimo  |
| `BLACKLIST_AFTER_ROTATION`   | `True` | torna a rotação significativa; habilita logout real            |
| Limite de tentativas no login | `5/min` por IP | resistência a força bruta no único endpoint de senha    |

Senhas são hasheadas pelo Django (PBKDF2-SHA256) e checadas contra os quatro
validadores padrão. Nunca são aceitas ou retornadas por nenhum endpoint de
leitura.

---

### `POST /auth/token/`

```json
{ "email": "aluno@geicis.br", "password": "..." }
```

**200**
```json
{
  "access": "eyJ...",
  "refresh": "eyJ...",
  "user": {
    "id": 12,
    "email": "aluno@geicis.br",
    "full_name": "Maria Souza",
    "role": "STUDENT"
  }
}
```

**401** `INVALID_CREDENTIALS` — mesma mensagem para e-mail errado e senha
errada, então o endpoint não confirma quais endereços existem.

### `POST /auth/token/refresh/`

```json
{ "refresh": "eyJ..." }
```
**200** → `{ "access": "eyJ...", "refresh": "eyJ..." }` (rotacionado)

### `POST /auth/logout/`

Coloca o refresh token fornecido na blacklist. **204**.

### `POST /auth/register/`

Público. Cria um `User` com papel `STUDENT` **e** seu `StudentProfile`, numa
única transação.

```json
{
  "email": "maria@geicis.br",
  "full_name": "Maria Souza",
  "password": "...",
  "password_confirm": "...",
  "registration_number": "20231044",
  "internship_id": 3,
  "required_hours": 300,
  "weekly_minimum_hours": 20,
  "started_at": "2026-08-01",
  "expected_end_at": "2026-12-15"
}
```

**201** → o usuário criado mais seu perfil.
**400** → erros de campo; veja [Erros](#erros).

`role` não é aceito aqui. Contas privilegiadas são criadas por um
coordenador através de `POST /users/`.

### `GET /auth/me/`

O usuário autenticado, com o perfil correspondente embutido e, para alunos,
o resumo calculado.

### `POST /auth/me/avatar/`

Multipart, campo `avatar`. Troca a foto de perfil. **200** com o usuário
atualizado. `DELETE` no mesmo caminho volta para a foto padrão.

### `POST /auth/me/password/`

```json
{ "current_password": "...", "new_password": "...", "new_password_confirm": "..." }
```
Exige a senha atual, valida a nova pelos quatro validadores do Django.
**204** no sucesso, **400** se a senha atual estiver errada ou a confirmação
não bater.

---

## Estágios

| Método   | Caminho                          | Quem        |
| -------- | ---------------------------------- | ----------- |
| `GET`    | `/internships/`                   | qualquer um |
| `POST`   | `/internships/`                   | coordenador |
| `GET`    | `/internships/{id}/`              | qualquer um |
| `PATCH`  | `/internships/{id}/`              | coordenador |
| `DELETE` | `/internships/{id}/`              | coordenador |
| `GET`    | `/internships/{id}/students/`     | qualquer um |

`GET /internships/` é público para usuários autenticados e também sem
paginação quando chamado com `?active=true&minimal=true`, porque o
formulário de cadastro precisa da lista completa num select.

Parâmetros de query: `?active=true|false`, `?search=<título ou instituição>`

**Objeto Internship**
```json
{
  "id": 3,
  "title": "Infraestrutura de Redes",
  "organization": "TRE-PE",
  "description": "Suporte à infraestrutura...",
  "supervisor_name": "Carlos Lima",
  "supervisor_email": "carlos@tre-pe.jus.br",
  "is_active": true,
  "student_count": 7,
  "created_at": "2026-03-01T09:00:00-03:00"
}
```

**409** `INTERNSHIP_HAS_STUDENTS` num `DELETE` enquanto alunos ainda o
referenciam.

---

## Alunos

| Método  | Caminho                       | Quem                           |
| ------- | ------------------------------- | -------------------------------- |
| `GET`   | `/students/`                   | qualquer um                     |
| `GET`   | `/students/{id}/`              | qualquer um                     |
| `PATCH` | `/students/{id}/`              | coordenador (veja abaixo)        |
| `GET`   | `/students/{id}/summary/`      | próprio, orientador, coordenador |
| `GET`   | `/students/{id}/professors/`   | qualquer um                     |

Um aluno pode dar `PATCH` no próprio `started_at` e campos de contato do
perfil. `required_hours`, `weekly_minimum_hours`, `internship`, e `status`
são exclusivos do coordenador — um aluno não pode diminuir a própria meta.

Parâmetros de query: `?internship=<id>`, `?status=ACTIVE`, `?professor=<id>`,
`?search=<nome ou matrícula>`

**Objeto Student**
```json
{
  "id": 12,
  "user": { "id": 12, "full_name": "Maria Souza", "email": "maria@geicis.br" },
  "registration_number": "20231044",
  "internship": { "id": 3, "title": "Infraestrutura de Redes", "organization": "TRE-PE" },
  "required_hours": 300,
  "weekly_minimum_hours": 20,
  "total_hours": 142.5,
  "remaining_hours": 157.5,
  "completion_percentage": 47.5,
  "current_week_hours": 12.0,
  "status": "ACTIVE",
  "started_at": "2026-08-01",
  "expected_end_at": "2026-12-15"
}
```

### `GET /students/{id}/summary/`

```json
{
  "student_id": 12,
  "total_hours": 142.5,
  "required_hours": 300,
  "remaining_hours": 157.5,
  "completion_percentage": 47.5,
  "current_week_hours": 12.0,
  "weekly_minimum_hours": 20,
  "weekly_target_met": false,
  "ranking_position": 4,
  "open_entry": null,
  "last_8_weeks": [
    { "week_start": "2026-06-01", "hours": 18.5, "target_met": false },
    { "week_start": "2026-06-08", "hours": 22.0, "target_met": true }
  ]
}
```

`last_8_weeks` é o que o gráfico do painel desenha. É retornado embutido
para manter o painel em uma única requisição.

---

## Professores e orientações

| Método   | Caminho                       | Quem        |
| -------- | -------------------------------- | ----------- |
| `GET`    | `/professors/`                  | qualquer um |
| `GET`    | `/professors/{id}/`             | qualquer um |
| `GET`    | `/professors/{id}/students/`    | qualquer um |
| `POST`   | `/users/`                       | coordenador |
| `GET`    | `/supervisions/`                | qualquer um |
| `POST`   | `/supervisions/`                | coordenador |
| `DELETE` | `/supervisions/{id}/`           | coordenador |

`POST /supervisions/`
```json
{ "professor_id": 5, "student_id": 12, "role": "ADVISOR" }
```

**409** `SUPERVISION_ALREADY_EXISTS` — aquele par já está vinculado.
**409** `STUDENT_ALREADY_HAS_ADVISOR` — papel `ADVISOR` quando já existe um.

---

## Registros de ponto

O núcleo do sistema.

| Método   | Caminho                        | Quem                            |
| -------- | --------------------------------- | ---------------------------------- |
| `POST`   | `/time-entries/check-in/`        | aluno (próprio)                    |
| `POST`   | `/time-entries/check-out/`       | aluno (próprio)                    |
| `GET`    | `/time-entries/current/`         | aluno (próprio)                    |
| `GET`    | `/time-entries/`                 | filtrado por papel                 |
| `GET`    | `/time-entries/{id}/`            | filtrado por papel                 |
| `PATCH`  | `/time-entries/{id}/`            | orientador ou coordenador          |
| `DELETE` | `/time-entries/{id}/`            | coordenador                        |

### `POST /time-entries/check-in/`

```json
{ "notes": "Configuração do rack" }
```
`notes` é opcional. **Nenhum timestamp é aceito** — o servidor usa seu
próprio relógio.

**201**
```json
{
  "id": 881,
  "student_id": 12,
  "check_in": "2026-07-24T13:02:11-03:00",
  "check_out": null,
  "duration_hours": null,
  "notes": "Configuração do rack",
  "is_open": true
}
```

**409** `ENTRY_ALREADY_OPEN` — o corpo carrega o registro aberto existente.
**403** `STUDENT_NOT_ACTIVE` — status do perfil não é `ACTIVE`.

### `POST /time-entries/check-out/`

Corpo vazio. Fecha o registro aberto de quem chama.

**200**
```json
{
  "entry": {
    "id": 881,
    "check_in": "2026-07-24T13:02:11-03:00",
    "check_out": "2026-07-24T17:31:40-03:00",
    "duration_hours": 4.49,
    "is_open": false
  },
  "summary": {
    "total_hours": 147.0,
    "current_week_hours": 16.49,
    "completion_percentage": 49.0,
    "ranking_position": 4
  }
}
```

Retornar o resumo atualizado junto com o registro significa que a tela de
bater saída atualiza os contadores e a barra de progresso sem uma segunda
ida ao servidor.

**409** `NO_OPEN_ENTRY`

### `GET /time-entries/current/`

**200** com o registro aberto, ou `{ "open_entry": null }`. É isso que a UI
consulta ao carregar para decidir entre renderizar "Bater entrada" ou um
timer rodando.

### `GET /time-entries/`

Filtrado automaticamente: um aluno vê só os próprios, um professor vê os
próprios mais os dos alunos que orienta, um coordenador vê tudo. Paginado,
20 por página, mais recentes primeiro.

Parâmetros de query: `?student=<id>`, `?from=YYYY-MM-DD`, `?to=YYYY-MM-DD`,
`?week=YYYY-MM-DD` (qualquer data dentro da semana), `?open=true`

### `PATCH /time-entries/{id}/`

```json
{
  "check_out": "2026-07-24T18:00:00-03:00",
  "adjustment_reason": "Aluno esqueceu de bater a saída"
}
```

`adjustment_reason` é **obrigatório** sempre que `check_in` ou `check_out`
muda. `adjusted_by` é marcado a partir do token. Um aluno enviando isso
recebe **403**; um aluno só pode dar `PATCH` em `notes` no próprio registro.

**400** `ADJUSTMENT_REASON_REQUIRED`
**400** `CHECKOUT_BEFORE_CHECKIN`

---

## Ranking

### `GET /ranking/`

Ordenado por horas totais, decrescente. Disponível para qualquer usuário
autenticado.

Parâmetros de query: `?internship=<id>`, `?professor=<id>`,
`?status=ACTIVE`, `?limit=<n>`

```json
{
  "generated_at": "2026-07-24T18:12:00-03:00",
  "results": [
    {
      "position": 1,
      "student_id": 7,
      "full_name": "João Ferreira",
      "avatar_url": "https://.../media/avatars/joao.jpg",
      "internship": "Infraestrutura de Redes",
      "total_hours": 210.0,
      "current_week_hours": 24.0,
      "required_hours": 300,
      "completion_percentage": 70.0,
      "status": "ACTIVE"
    }
  ]
}
```

Empates compartilham posição e a próxima posição pula de acordo.

### `GET /dashboard/`

Visão do coordenador, uma requisição: contagem de alunos por status, total
de horas registradas pelo grupo, alunos com ponto aberto agora, alunos
abaixo do mínimo semanal agora, e o top 5 do ranking.

---

## Alertas semanais

| Método | Caminho                 | Quem                                   |
| ------ | -------------------------- | ------------------------------------------ |
| `GET`  | `/weekly-alerts/`         | filtrado: próprio / orientados / todos     |
| `GET`  | `/weekly-alerts/{id}/`    | mesmo filtro                                |

Somente leitura via HTTP. Alertas são criados apenas pelo comando agendado —
não existe endpoint que manda um e-mail sob demanda, então a API não pode
virar uma ferramenta de disparo de e-mails.

Parâmetros de query: `?student=<id>`, `?week_start=YYYY-MM-DD`,
`?delivery_status=FAILED`

```json
{
  "id": 40,
  "student": { "id": 12, "full_name": "Maria Souza" },
  "week_start": "2026-07-20",
  "hours_logged": 12.0,
  "minimum_required": 20.0,
  "shortfall_hours": 8.0,
  "sent_at": "2026-07-24T23:59:04-03:00",
  "delivery_status": "SENT"
}
```

---

## Erros

Formato uniforme em toda a API:

```json
{
  "error": {
    "code": "ENTRY_ALREADY_OPEN",
    "message": "Você já tem um ponto aberto desde 24/07 às 13:02.",
    "details": { "open_entry_id": 881 }
  }
}
```

`message` é português voltado ao usuário e seguro para renderizar direto.
`code` é o que o frontend usa para ramificar a lógica.

| HTTP | Código                         | Significado                                   |
| ---- | -------------------------------- | ------------------------------------------------ |
| 400  | `VALIDATION_ERROR`              | erros de campo em `details`                      |
| 400  | `ADJUSTMENT_REASON_REQUIRED`    | timestamp mudou sem um motivo                    |
| 400  | `CHECKOUT_BEFORE_CHECKIN`       | intervalo invertido                              |
| 401  | `INVALID_CREDENTIALS`           | login falhou                                     |
| 401  | `TOKEN_EXPIRED`                 | token de acesso expirou — atualize e tente de novo |
| 403  | `PERMISSION_DENIED`             | o papel não permite                              |
| 403  | `STUDENT_NOT_ACTIVE`            | status do perfil bloqueia bater ponto             |
| 404  | `NOT_FOUND`                     | ausente, ou fora do escopo de quem chama          |
| 409  | `ENTRY_ALREADY_OPEN`            | existe um registro aberto                        |
| 409  | `NO_OPEN_ENTRY`                 | nada para fechar                                 |
| 409  | `SUPERVISION_ALREADY_EXISTS`    | vínculo professor-aluno duplicado                |
| 409  | `STUDENT_ALREADY_HAS_ADVISOR`   | segundo `ADVISOR` para o mesmo aluno              |
| 409  | `INTERNSHIP_HAS_STUDENTS`       | exclusão bloqueada por `PROTECT`                  |
| 429  | `THROTTLED`                     | limite de tentativas atingido                     |

`404` é retornado em vez de `403` para registros fora do escopo de quem
chama, então a API não confirma que um registro existe para alguém que não
tem permissão de vê-lo.

## Paginação

Paginação por número de página, 20 por página, igual aos padrões do
`social-network`.

```json
{ "count": 143, "next": "...?page=3", "previous": "...?page=1", "results": [] }
```

O ranking e `/internships/?minimal=true` são as exceções e retornam o
conjunto completo.
