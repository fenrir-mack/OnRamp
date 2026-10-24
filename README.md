# OnRamp

Aplicação de onboarding feita com React, Vite, Tailwind CSS v4, Express e PostgreSQL.

## Requisitos

- Node.js na versão indicada em `.mise.toml` e npm.
- PostgreSQL local em execução.

## Configuração local

1. Instale as dependências:

   ```sh
   npm install
   ```

2. Copie `.env.example` para `.env` e informe as credenciais do PostgreSQL.

3. Crie/atualize o banco e carregue o schema e os dados locais:

   ```sh
   npm run db:setup
   ```

4. Inicie o frontend e a API:

   ```sh
   npm run dev
   ```

   O Vite fica disponível em `http://localhost:8443`; a API local usa a porta `3000`.

## Contas de teste

O seed local cria três usuários para testar o login:

| E-mail | Senha | Área |
| --- | --- | --- |
| `fenrir1@gmail.com` | `fenrir1` | Produto |
| `fenrir2@gmail.com` | `fenrir2` | Tecnologia |
| `fenrir3@gmail.com` | `fenrir3` | Pessoas & Cultura |

As contas são atualizadas de forma idempotente por `npm run db:setup`. As senhas ficam armazenadas no banco como hashes scrypt. Essas credenciais conhecidas são apenas para desenvolvimento e teste local; não as use em produção.

A conta `fenrir3@gmail.com` acessa somente o **Espaço do RH**, onde pode criar contas e configurar tarefas e materiais por etapa para cada pessoa. As contas comuns continuam vendo a jornada, conteúdos e diretório. A autorização é validada pela API por uma permissão explícita; Fenrir 1 e 2 não têm acesso ao RH.

## Banco de dados

- `database/postgresql/001-schema.sql`: tabelas e views.
- `database/postgresql/002-seed.sql`: departamentos, contas de teste, etapas e modelos de tarefas.
- `database/postgresql/003-local-resources.sql`: materiais de demonstração.
- `database/postgresql/004-auth.sql`: hashes de senha e sessões de login.
- `database/postgresql/005-employee-plans.sql`: tarefas de plano padrão por conta, gerenciadas pelo RH.
- `database/postgresql/006-hr-access.sql`: permissão de RH exclusiva para a conta Fenrir 3.
- `database/postgresql/007-employee-plan-resources.sql`: materiais escolhidos por conta e etapa.
- `database/postgresql/008-employee-plan-configurations.sql`: indica quando o RH salvou um plano personalizado.
- `database/postgresql/009-resource-files.sql`: metadados, checksum e nome original dos arquivos enviados pelo RH.
- `database/postgresql/011-hr-task-presets.sql`: pacotes de tarefas reutilizáveis criados pelo RH.
- `database/postgresql/012-task-responsible-people.sql`: associa tarefas a pessoas responsáveis da empresa.
- `database/postgresql/013-seed-pre-entry-presets.sql`: cria três pacotes iniciais de pré-entrada.

Arquivos enviados pelo RH ficam fora do PostgreSQL, em `storage/files/` (ignorada pelo Git); o banco guarda os metadados e a chave privada. A API autentica o acesso aos arquivos. Configure `ONRAMP_FILE_STORAGE_PATH` para escolher outra pasta local. Faça backup do banco e dessa pasta juntos.

## Comandos úteis

- `npm run dev`: inicia frontend e API.
- `npm run dev:api`: inicia somente a API.
- `npm run db:setup`: cria o banco quando necessário e reaplica dados locais.
- `npm run build`: gera a build de produção do frontend.
