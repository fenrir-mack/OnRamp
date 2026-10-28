# OnRamp

Aplicação de onboarding feita com React 19, Vite, Tailwind CSS v4, Express e PostgreSQL.

Este guia explica como preparar um ambiente local do zero. Os comandos abaixo funcionam no PowerShell do Windows; quando houver diferença para macOS/Linux, ela estará indicada.

## 1. Instale os pré-requisitos

1. **Git** — necessário para clonar o projeto.
2. **Node.js 22** — o projeto fixa essa versão em `.mise.toml`. Instale Node.js 22 e npm, ou use o [mise](https://mise.jdx.dev/) para instalar a versão indicada.
3. **PostgreSQL** — instale e mantenha o serviço local em execução. Durante a instalação, defina a senha do usuário `postgres` e guarde-a; ela será usada na configuração abaixo.

Confirme que Node.js e npm estão disponíveis:

```powershell
node --version
npm --version
```

O Node deve mostrar a versão 22.x. Confirme também que o PostgreSQL está executando e escutando na porta `5432` (padrão).

## 2. Baixe o projeto

Se ainda não tiver o repositório:

```powershell
git clone <URL-DO-REPOSITORIO>
cd OnRamp
```

Se você já recebeu o projeto ou está com o repositório aberto, entre na pasta `OnRamp` e continue.

## 3. Instale as dependências

Na pasta que contém `package.json`, rode:

```powershell
npm install
```

## 4. Configure a conexão com o PostgreSQL

Crie seu arquivo local `.env` a partir do exemplo:

```powershell
Copy-Item .env.example .env
```

Abra `.env` e informe a senha definida para o usuário PostgreSQL. Exemplo para uma instalação local padrão:

```dotenv
PGHOST=127.0.0.1
PGPORT=5432
PGDATABASE=onramp
PGUSER=postgres
PGPASSWORD=sua_senha_do_postgres
API_PORT=3000
ONRAMP_FILE_STORAGE_PATH=storage/files
```

Não inclua aspas em volta dos valores. `.env` contém credenciais locais e não deve ser enviado ao Git. O usuário PostgreSQL informado precisa poder criar bancos; o script criará o banco `onramp` se ele ainda não existir. Se você usa outro host, porta, nome de banco ou usuário, ajuste os valores.

> No macOS/Linux, o comando para copiar o exemplo é `cp .env.example .env`.

## 5. Crie e prepare o banco

Com o serviço PostgreSQL ligado e o `.env` preenchido, rode:

```powershell
npm run db:setup
```

O comando cria o banco `onramp` quando necessário e aplica o schema, as migrações e os dados locais, incluindo as contas de teste e os pacotes iniciais de pré-entrada. Pode ser executado novamente para atualizar os dados de demonstração.

Se a conexão falhar, confira se o serviço PostgreSQL está ligado e se `PGHOST`, `PGPORT`, `PGUSER` e `PGPASSWORD` em `.env` correspondem à instalação local.

## 6. Inicie a aplicação

```powershell
npm run dev
```

Isso inicia a API Express e o frontend Vite. Abra **http://localhost:8443** no navegador. A API local fica em `http://localhost:3000`.

Para encerrar, volte ao terminal e pressione `Ctrl+C`.

## Contas de teste

O setup local cria estas contas:

| E-mail | Senha | Acesso |
| --- | --- | --- |
| `fenrir1@gmail.com` | `fenrir1` | Pessoa colaboradora |
| `fenrir2@gmail.com` | `fenrir2` | Pessoa colaboradora |
| `fenrir3@gmail.com` | `fenrir3` | Espaço do RH |

As senhas são armazenadas como hashes scrypt. Essas contas são apenas para desenvolvimento local; não as use em produção. A conta `fenrir3@gmail.com` tem acesso ao RH para gerenciar pessoas e jornadas. As contas 1 e 2 não têm permissão para acessar o espaço do RH.

## Arquivos enviados

Os arquivos enviados pelo RH são armazenados localmente em `storage/files/`, fora do PostgreSQL. O banco guarda os metadados e a referência privada. Essa pasta é ignorada pelo Git. Para escolher outro local, altere `ONRAMP_FILE_STORAGE_PATH` no `.env`. Faça backup da pasta de arquivos junto com o banco.

## Comandos úteis

| Comando | Para que serve |
| --- | --- |
| `npm run dev` | Inicia frontend e API juntos |
| `npm run dev:api` | Inicia somente a API |
| `npm run db:setup` | Cria/prepara o banco e carrega dados locais |
| `npm run build` | Gera a build de produção do frontend |
| `npm run preview` | Serve localmente a build de produção |
| `npm run format` | Formata os arquivos com oxfmt |

## Estrutura do banco

Os scripts SQL ficam em `database/postgresql/` e são aplicados por `npm run db:setup`:

- `001-schema.sql`: tabelas e views principais.
- `002-seed.sql`: departamentos, contas de teste, etapas e tarefas de demonstração.
- `003-local-resources.sql`: materiais locais de demonstração.
- `004-auth.sql`: senhas com hash e sessões de login.
- `005-employee-plans.sql` a `008-employee-plan-configurations.sql`: jornadas, tarefas e materiais configurados por pessoa.
- `009-resource-files.sql` e `010-remove-resource-estimated-minutes.sql`: metadados dos arquivos e ajuste do modelo de materiais.
- `011-hr-task-presets.sql` e `012-task-responsible-people.sql`: pacotes de tarefas e responsáveis.
- `013-seed-pre-entry-presets.sql`: pacotes iniciais de pré-entrada.
