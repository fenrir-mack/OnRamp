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
PGSSL=false
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

Se a conexão falhar, confira se o serviço PostgreSQL está ligado e se `PGHOST`, `PGPORT`, `PGUSER` e `PGPASSWORD` em `.env` correspondem à instalação local. Para um PostgreSQL hospedado que exige TLS, defina `PGSSL=true`.

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

Os arquivos enviados pelo RH e as fotos de perfil são armazenados localmente em `storage/files/`, fora do PostgreSQL, por padrão. Para usar Azure Blob Storage, crie um container privado e configure `ONRAMP_FILE_STORAGE_PROVIDER=azure`, `AZURE_STORAGE_ACCOUNT_NAME` e `AZURE_STORAGE_CONTAINER_NAME`. O backend usa `DefaultAzureCredential`: localmente, entre no Azure CLI com `az login`; no App Service, habilite uma identidade gerenciada e atribua a função **Storage Blob Data Contributor** ao container. Downloads e fotos de perfil passam por rotas autenticadas do OnRamp; não torne o container público e não coloque chaves de storage no código. O banco guarda metadados e a chave privada do objeto.

## Comandos úteis

| Comando | Para que serve |
| --- | --- |
| `npm run dev` | Inicia frontend e API juntos |
| `npm run dev:api` | Inicia somente a API |
| `npm start` | Inicia o Express para hospedagem |
| `npm run db:setup` | Cria/prepara o banco e carrega dados locais |
| `npm run build` | Gera a build de produção do frontend |
| `npm run preview` | Serve localmente a build de produção |
| `npm run format` | Formata os arquivos com oxfmt |

## Estrutura do banco

## Publicar no Azure App Service com PostgreSQL Flexible Server

O Express deste projeto serve a API e os arquivos compilados do Vite (`dist`) no mesmo domínio. Para essa configuração, publique como **Node.js App Service**, não como site estático isolado. A aplicação inicia com `npm start`, e o frontend é compilado com `npm run build`.

### 1. Permitir conexão ao banco

No portal Azure, abra o recurso **Azure Database for PostgreSQL flexible server** e copie o hostname exibido em **Overview** (formato `<servidor>.postgres.database.azure.com`). Em **Networking**, confira se ele está em acesso público com regras de firewall. Adicione o IP público do seu computador para poder rodar o setup. O firewall bloqueia conexões externas por padrão; libere somente os IPs necessários, na porta `5432`.

Use o usuário administrador do PostgreSQL. O script cria o banco `onramp` se ele ainda não existir. Se já criou o banco com outro nome, configure esse nome em `PGDATABASE`.

### 2. Criar tabelas e dados iniciais

No `.env` local (que não deve ser enviado ao Git), coloque os dados do Flexible Server:

```dotenv
PGHOST=<servidor>.postgres.database.azure.com
PGPORT=5432
PGDATABASE=onramp
PGUSER=<usuario-administrador>
PGPASSWORD=<senha-do-postgresql>
PGSSL=true
API_PORT=3000
ONRAMP_FILE_STORAGE_PATH=storage/files
```

No terminal, rode `npm run db:setup`. Isso cria o esquema e as tabelas, aplica as migrações até `016` e inclui os dados iniciais usados pelo app. O setup pode ser repetido para atualizar o banco.

### 3. Configurar o App Service

No portal, abra **App Services > seu aplicativo > Settings > Environment variables > App settings**. Cadastre `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD` e `PGSSL=true`. Para usar o Blob Storage, também configure `ONRAMP_FILE_STORAGE_PROVIDER=azure`, `AZURE_STORAGE_ACCOUNT_NAME=onramp` e `AZURE_STORAGE_CONTAINER_NAME=onramp-files`. Em **Identity**, habilite a identidade atribuída pelo sistema do App Service. Na Storage account, atribua a essa identidade **Storage Blob Data Contributor** no escopo do container `onramp-files`. Salve as configurações e reinicie o aplicativo. Não é necessário configurar uma chave da Storage account.

Publique o repositório pelo **Deployment Center**. No App Service, use Node.js 22 e ative o build durante a publicação (`SCM_DO_BUILD_DURING_DEPLOYMENT=true`) para instalar dependências e executar `npm run build`; o comando de inicialização é `npm start`. O App Service fornece a variável `PORT` que o Express utiliza.

No firewall do Flexible Server, permita também os IPs de saída mostrados em **App Service > Properties > Outbound IP addresses**. A conexão exige uma regra de firewall e credenciais válidas. Se o banco estiver configurado com acesso privado/VNet, essa etapa também exige integração de rede entre o App Service e a VNet.

### 4. Conferir a conexão

Abra `https://<seu-app>.azurewebsites.net/api/health`. A resposta `{"status":"ok","database":"onramp"}` confirma que a API conectou ao banco. Para conferir o armazenamento de arquivos, abra `https://<seu-app>.azurewebsites.net/api/health/storage`; com Azure configurado, a resposta deve incluir `{"status":"ok","storage":"azure"}`. Depois confira login, biblioteca e jornada na página.

As contas `fenrir1@gmail.com`, `fenrir2@gmail.com` e `fenrir3@gmail.com` têm senhas de demonstração conhecidas. Use-as apenas num ambiente privado de teste; antes de abrir o site publicamente, crie/defina credenciais fortes para as contas.

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
- `014-employee-organization.sql`: permite associar cada pessoa a várias áreas e equipes independentes.
- `015-team-hierarchies.sql`: permite equipes subordinadas e vários líderes por equipe.
- `016-employee-plan-progress.sql`: persiste conclusões de tarefas e problemas informados nas jornadas individuais.
