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

Crie seu arquivo local `.env.local` a partir do exemplo:

```powershell
Copy-Item .env.example .env.local
```

Abra `.env.local` e informe a senha definida para o usuário PostgreSQL. Exemplo para uma instalação local padrão:

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

Não inclua aspas em volta dos valores. `.env.local` contém credenciais locais e não deve ser enviado ao Git. O usuário PostgreSQL informado precisa poder criar bancos; o script criará o banco `onramp` se ele ainda não existir. Se você usa outro host, porta, nome de banco ou usuário, ajuste os valores.

> No macOS/Linux, o comando para copiar o exemplo é `cp .env.example .env.local`.

## 5. Crie e prepare o banco

Com o serviço PostgreSQL ligado e o `.env.local` preenchido, rode:

```powershell
npm run db:setup
```

O comando cria o banco `onramp` quando necessário e aplica o schema, as migrações e os dados locais, incluindo as contas e os pacotes iniciais de pré-entrada. Pode ser executado novamente para atualizar o ambiente local.

Se a conexão falhar, confira se o serviço PostgreSQL está ligado e se `PGHOST`, `PGPORT`, `PGUSER` e `PGPASSWORD` em `.env.local` correspondem à instalação local. Para um PostgreSQL hospedado que exige TLS, defina `PGSSL=true`.

Para aplicar o schema no banco da nuvem, configure as credenciais em `.env.cloud` e rode `npm run db:setup:cloud`. Esse comando executa o mesmo setup e os mesmos dados iniciais no servidor configurado ali; confira `PGHOST` e `PGDATABASE` antes de usá-lo.

## 6. Inicie a aplicação

```powershell
npm run dev
```

Isso inicia a API Express e o frontend Vite. Abra **http://localhost:8443** no navegador. A API local fica em `http://localhost:3000`.

Para encerrar, volte ao terminal e pressione `Ctrl+C`.

## Contas locais

`npm run db:setup` prepara o schema e as duas contas base. Depois, `npm run db:demo` cria o cenário local com 20 pessoas: uma admin de RH, uma pessoa mentora, estagiários, lideranças e profissionais de Produto, Tecnologia, Pessoas & Cultura, Jurídico e Financeiro. Só a conta admin tem acesso à página de configuração do RH.

| E-mail | Senha | Acesso |
| --- | --- | --- |
| `admin@senulora.com` | `fenrir3` | Única admin do RH |
| `joao.pedro@senulora.com` | `fenrir2` | Mentor de Pessoas & Cultura |
| `ana.martins@senulora.com` | `fenrir1` | Estagiária de Produto |
| `rafael.costa@senulora.com` | `fenrir1` | Estagiário de Tecnologia |
| `diego.santos@senulora.com` | `fenrir1` | Responsável de TI |
| `marina.alves@senulora.com` | `fenrir1` | Responsável do Jurídico |
| `carolina.mendes@senulora.com` | `fenrir1` | Gerente de Produto |
| `lucas.ferreira@senulora.com` | `fenrir1` | Designer de Produto Sênior |
| `beatriz.souza@senulora.com` | `fenrir1` | Analista de Produto Sênior |
| `pedro.almeida@senulora.com` | `fenrir1` | Engenheiro de Software Sênior |
| `fernanda.costa@senulora.com` | `fenrir1` | Engenheira de Software Sênior |
| `marcos.ribeiro@senulora.com` | `fenrir1` | Tech Lead |
| `andre.lima@senulora.com` | `fenrir1` | Analista de TI Sênior |
| `thiago.moraes@senulora.com` | `fenrir1` | Engenheiro de Segurança Sênior |
| `camila.rocha@senulora.com` | `fenrir1` | Parceira de Pessoas |
| `juliana.lopes@senulora.com` | `fenrir1` | Analista de Desenvolvimento Humano |
| `paula.nascimento@senulora.com` | `fenrir1` | Advogada Sênior |
| `daniela.barros@senulora.com` | `fenrir1` | Analista Jurídica |
| `rafaela.dias@senulora.com` | `fenrir1` | Analista Financeira |
| `roberto.silva@senulora.com` | `fenrir1` | Gerente Financeiro |

As senhas são armazenadas como hashes scrypt. Essas credenciais são para uso local; não as use em produção.

### Cenário local

O cenário local inclui jornadas em estados diferentes, dez jornadas concluídas de pessoas sêniores, preparação de pré-entrada, responsabilidades de TI e Jurídico, equipes e lideranças, check-ins, feedback, solicitações de suporte e conversas. A pessoa do Jurídico pode assumir tarefas da pré-entrada após receber acesso da admin do RH. A biblioteca começa sem materiais; o RH pode enviar arquivos pelo próprio sistema quando o armazenamento estiver configurado.

O setup prepara sete pacotes de tarefas: Acessos e ferramentas, Equipamento e segurança, Admissão e documentos, Primeira semana com a equipe, Trilha inicial de Produto, Trilha inicial de Tecnologia e Check-ins e primeiros objetivos.

`npm run db:demo` atualiza os registros de onboarding do ambiente local. `npm run db:demo:clear` remove as contas de onboarding e seus registros, mantendo tabelas, catálogos e as contas base de admin e mentoria.

Para apagar todos os registros do PostgreSQL local e reconstruir o cenário de 20 pessoas, rode `npm run db:reset:demo:local`. O comando exige que `.env.local` aponte para um PostgreSQL neste computador.

Para apagar todos os registros do banco PostgreSQL no Azure e recriar o cenário de 20 pessoas, rode `npm run db:reset:demo:cloud`. Essa operação preserva as tabelas e recria os catálogos, as contas, as jornadas e os dados de onboarding. Ela não apaga arquivos já existentes no Blob Storage; esses objetos precisam ser administrados separadamente.

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

No `.env.cloud` (que não deve ser enviado ao Git), coloque os dados do Flexible Server:

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

No terminal, rode `npm run db:setup:cloud`. Isso cria o esquema e as tabelas, aplica as migrações até `034` e inclui os dados iniciais usados pelo app. O setup pode ser repetido para atualizar o banco.

### 3. Configurar o App Service

No portal, abra **App Services > seu aplicativo > Settings > Environment variables > App settings**. Cadastre `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD` e `PGSSL=true`. Para usar o Blob Storage, também configure `ONRAMP_FILE_STORAGE_PROVIDER=azure`, `AZURE_STORAGE_ACCOUNT_NAME=onramp` e `AZURE_STORAGE_CONTAINER_NAME=onramp-files`. Em **Identity**, habilite a identidade atribuída pelo sistema do App Service. Na Storage account, atribua a essa identidade **Storage Blob Data Contributor** no escopo do container `onramp-files`. Salve as configurações e reinicie o aplicativo. Não é necessário configurar uma chave da Storage account.

Publique o repositório pelo **Deployment Center**. No App Service, use Node.js 22 e ative o build durante a publicação (`SCM_DO_BUILD_DURING_DEPLOYMENT=true`) para instalar dependências e executar `npm run build`; o comando de inicialização é `npm start`. O App Service fornece a variável `PORT` que o Express utiliza.

No firewall do Flexible Server, permita também os IPs de saída mostrados em **App Service > Properties > Outbound IP addresses**. A conexão exige uma regra de firewall e credenciais válidas. Se o banco estiver configurado com acesso privado/VNet, essa etapa também exige integração de rede entre o App Service e a VNet.

### 4. Conferir a conexão

Abra `https://<seu-app>.azurewebsites.net/api/health`. A resposta `{"status":"ok","database":"onramp"}` confirma que a API conectou ao banco. Para conferir o armazenamento de arquivos, abra `https://<seu-app>.azurewebsites.net/api/health/storage`; com Azure configurado, a resposta deve incluir `{"status":"ok","storage":"azure"}`. Depois confira login, biblioteca e jornada na página.

As contas locais listadas acima têm senhas conhecidas. Use-as apenas num ambiente privado; antes de abrir o site publicamente, defina credenciais fortes.

## Estrutura do banco

Os scripts SQL ficam em `database/postgresql/` e são aplicados por `npm run db:setup`:

- `001-schema.sql`: tabelas e views principais.
- `002-seed.sql`: departamentos, contas iniciais, etapas e tarefas base.
- `003-local-resources.sql`: ponto de extensão para materiais locais; não cria arquivos fictícios.
- `004-auth.sql`: senhas com hash e sessões de login.
- `005-employee-plans.sql` a `008-employee-plan-configurations.sql`: jornadas, tarefas e materiais configurados por pessoa.
- `009-resource-files.sql` e `010-remove-resource-estimated-minutes.sql`: metadados dos arquivos e ajuste do modelo de materiais.
- `011-hr-task-presets.sql` e `012-task-responsible-people.sql`: pacotes de tarefas e responsáveis.
- `013-seed-pre-entry-presets.sql`: pacotes iniciais de pré-entrada.
- `014-employee-organization.sql`: permite associar cada pessoa a várias áreas e equipes independentes.
- `015-team-hierarchies.sql`: permite equipes subordinadas e vários líderes por equipe.
- `016-employee-plan-progress.sql`: persiste conclusões de tarefas e problemas informados nas jornadas individuais.
- `017` a `019`: conversas, mensagens, leitura e confirmação da resolução de problemas.
- `020` a `023`: solicitações de suporte, chat, prazos de pré-entrada, histórico e acesso por área responsável.
- `024` a `029`: categorias de pré-entrada, status flexíveis, comentários, hierarquia e áreas que podem assumir tarefas.
- `030` e `031`: escopo e público dos materiais da biblioteca.
- `034-check-in-chat.sql`: conversas associadas a check-ins.
