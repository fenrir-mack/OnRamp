# Reestruturação da jornada de onboarding

## Objetivo

Fazer da pré-entrada um fluxo operacional para preparar a chegada da pessoa. RH e responsáveis de cada área acompanham e atualizam os itens; a pessoa contratada acompanha o próprio status, confirma o que já está pronto e sinaliza problemas.

## Decisões alinhadas

- A pré-entrada reúne somente itens de preparação da empresa: contas e aplicativos, computador e equipamentos, documentos e aprovações legais, transporte e logística do primeiro dia.
- A data de entrada da pessoa é a referência para calcular os prazos. Cada item pode vencer antes ou depois dessa data.
- Funcionários de áreas como Tecnologia e Jurídico podem receber permissão para atualizar os itens da sua área. Essa permissão é explícita e pode cobrir uma ou mais áreas.
- RH administra a preparação completa. Responsáveis autorizados atuam somente dentro das áreas permitidas.
- A pessoa contratada vê o andamento da sua própria preparação, pode sinalizar algo faltando ou incorreto e também pode confirmar que um item está pronto.
- A tela principal de gestão da preparação é para RH e responsáveis autorizados. A pessoa contratada recebe uma visão resumida do próprio onboarding.
- A preparação de uma entrega deve permitir acompanhar o computador e outros itens enviados.

## Fazer agora — primeira versão

### 1. Data de entrada e prazos relativos

- RH informa a data em que a pessoa começa a trabalhar.
- Cada item de preparação recebe um prazo configurável em relação a essa data, como cinco dias antes ou dois dias depois.
- O sistema calcula a data final do item e indica quando está atrasado.

### 2. Itens de preparação da empresa

Cada item deve ter, no mínimo:

- pessoa a quem pertence;
- categoria;
- título e instruções;
- área responsável e, opcionalmente, responsável individual;
- prazo relativo à data de entrada;
- estado e histórico de quem atualizou.

Categorias iniciais: contas e aplicativos, equipamento, documentos e aprovações legais, transporte e chegada no primeiro dia.

### 3. Estados e conclusão

Estados sugeridos para os itens:

- A iniciar
- Em andamento
- Aguardando terceiro
- Pronto

Atraso é calculado pelo prazo, não precisa ser um estado manual. Problemas sinalizados ficam ligados ao item e têm acompanhamento próprio até a resolução.

Um responsável autorizado pode marcar o item como pronto. A pessoa contratada também pode confirmar que algo já está pronto, por exemplo, quando recebeu e validou o computador ou conseguiu acessar uma conta. Antes de concluir, o sistema pede uma confirmação explícita de que o item está realmente pronto. O registro guarda quem confirmou e quando.

### 4. Sinalização e resolução de problemas

- A pessoa contratada pode sinalizar um item faltando, incorreto ou que não funciona.
- O problema fica visível para RH e para a área responsável pelo item.
- A área responsável registra o andamento e encerra o problema quando resolvido.
- A pessoa contratada consegue acompanhar o estado do problema.

### 5. Permissões e navegação

- **Pessoa contratada:** acompanha e atualiza somente a própria preparação; pode confirmar itens e relatar problemas.
- **Responsável de preparação:** recebe acesso explícito a uma ou mais áreas e atualiza somente itens dessas áreas.
- **RH admin:** vê e administra todos os itens, atribui áreas e responsáveis e acompanha atrasos.
- Criar no sidebar um espaço interno para administrar as novas admissões, visível ao RH e a funcionários com permissão de preparação. Nome recomendado: **Novas admissões**.
- Nesse espaço, organizar a fila por data de entrada, área responsável e itens atrasados. A pessoa contratada continua acompanhando seu próprio estado em **Minha jornada**.

### 6. Entregas na primeira versão

- Registrar transportadora, código e link de rastreio do computador ou de outro item enviado.
- Mostrar o link de rastreio à pessoa contratada e aos responsáveis autorizados.
- Atualizar os demais estados manualmente pelos responsáveis.

## Fazer no futuro

- Integrar com a transportadora escolhida para importar automaticamente movimentações e entrega.
- Automatizar fluxos específicos de transporte e benefícios conforme as políticas e localidades da empresa.
- Expandir a jornada após a entrada, com primeiro dia, primeira semana, capacitação, mentoria e check-ins dos primeiros meses.
- Adicionar notificações fora do painel, como e-mail ou Teams, se o acompanhamento interno não for suficiente.
- Desenvolver métricas de preparação por área, pessoa responsável, prazo e tipo de item.

## Mudanças necessárias em relação ao app atual

- Atualmente, a data de vencimento é calculada somando dias à data de entrada e a validação só aceita deslocamentos não negativos. A nova regra precisa aceitar prazos antes e depois da entrada.
- Hoje, a conclusão de uma tarefa da jornada é registrada pela própria pessoa contratada. O novo fluxo precisa suportar atualizações feitas por responsáveis de área, com permissão delimitada, além da confirmação da pessoa contratada.
- O sidebar atual separa principalmente RH admin e funcionário comum. O espaço **Novas admissões** deve também considerar permissões explícitas por área.

## Pontos para detalhar na implementação

- Quais categorias e modelos de preparação serão padrão para todas as admissões e quais dependem de cargo, área ou modalidade de trabalho.
- Quais campos de transporte e documentos são realmente necessários, limitando o acesso a dados pessoais ao mínimo.
- Como as mudanças na data de entrada recalculam prazos de itens ainda não concluídos.
- Qual transportadora será integrada automaticamente na fase futura.
