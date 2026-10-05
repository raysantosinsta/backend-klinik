# Documentação Técnica Completa - Klinik OS

Bem-vindo à documentação técnica do **Klinik OS**, uma plataforma integrada de atendimento automatizado via WhatsApp e gerenciamento inteligente para clínicas, impulsionada por IA (RAG e LLM). 

Este documento detalha o funcionamento interno, arquitetura e fluxos de dados do sistema, servindo como guia definitivo para integração de novos desenvolvedores.

---

## 1. Visão geral

O Klinik OS é um sistema full-stack que visa otimizar o atendimento de clínicas de estética e saúde. O núcleo de valor do projeto é um **Assistente Virtual de Inteligência Artificial** (Bot) integrado ao WhatsApp. Este assistente é capaz de:
- Tirar dúvidas dos clientes consumindo uma base de conhecimento da clínica (Documentos).
- Apresentar serviços disponíveis e seus preços.
- Capturar a intenção de agendamento.
- Realizar "transbordo" (fallback) para um atendente humano quando não souber a resposta.

O sistema possui uma interface administrativa (Dashboard) para gerenciar agendamentos, serviços, documentos de contexto (RAG) e configurar a integração com o WhatsApp.

---

## 2. Stack tecnológica

O projeto é moderno e utiliza tecnologias de ponta, focado na performance e uso de IA generativa.

### Backend
- **Framework:** NestJS (Node.js)
- **Linguagem:** TypeScript
- **Banco de Dados:** PostgreSQL
- **ORM:** Prisma
- **Vetorização e Busca Semântica:** Extensão `pgvector` no PostgreSQL
- **IA/LLM:** `@langchain/groq` (Groq API, modelo Qwen)
- **Embeddings Locais:** `@xenova/transformers` (modelo local `Xenova/all-MiniLM-L6-v2`)

### Frontend
- **Framework:** Next.js 16.3 (App Router)
- **Linguagem:** TypeScript, React 19
- **Estilização:** Tailwind CSS v4, Framer Motion
- **Ícones:** Lucide React
- **Autenticação:** Supabase JS

### Infra e Integrações
- **Mensageria WhatsApp:** Evolution API (via Webhooks)
- **Containerização:** Docker (docker-compose para DB)

---

## 3. Arquitetura

A arquitetura do sistema segue um modelo Cliente-Servidor clássico aliado a uma arquitetura orientada a eventos para o processamento do WhatsApp.

```text
Cliente (Paciente no WhatsApp)
   ↓ (Evolution API)
Webhooks / Backend (NestJS)
   ↓ (Geração de embeddings locais com Xenova)
Busca Semântica (PgVector / Prisma)
   ↓ (Montagem do Prompt RAG)
Regras de Negócio & LLM (Groq Langchain)
   ↓
Banco de Dados (PostgreSQL)
   ↓
Dashboard Frontend (Next.js)
   ↓ (Visualização e Gestão)
Usuário (Administrador da Clínica)
```

**Responsabilidades:**
- **Frontend:** Camada de apresentação e gestão. Renderiza interfaces responsivas e gerencia a sessão de autenticação usando Supabase.
- **Backend:** Centraliza a lógica de negócios, integração com o banco, processamento de RAG (Retrieval-Augmented Generation) e comunicação com a API do WhatsApp.
- **Banco de Dados:** Armazena entidades estruturadas (Serviços, Agendamentos) e vetores não estruturados (Chunks de documentos).

---

## 4. Estrutura do projeto

O repositório é um monorepo conceitual contendo pastas distintas para o frontend e backend.

### `/backend`
- `/src/whatsapp` - Recebimento de webhooks e conexão de instâncias.
- `/src/chat` - Motor de Inteligência Artificial, embeddings e LLM.
- `/src/documents` - Gerenciamento de documentos da clínica (fontes para RAG).
- `/src/appointments` - Gestão de agendamentos.
- `/src/services` - Catálogo de serviços da clínica.
- `/src/users` e `/src/business` - Gestão de multi-tenancy e usuários.
- `/prisma` - Schemas do banco de dados e migrações.

### `/frontend`
- `/app` - Estrutura de rotas do Next.js (App Router).
- `/app/dashboard` - Área autenticada, contendo as páginas principais de gestão.
- `/components` - Componentes React reutilizáveis (ex: `AuthProvider.tsx`, `DashboardHeader.tsx`).
- `/lib` - Funções utilitárias e clientes (ex: Supabase client).

---

## 5. Frontend

O frontend é construído com Next.js focado em Server Components e App Router.

### Páginas e rotas (Mapeamento Base)

| Rota | Acesso | Função |
|---|---|---|
| `/` | Público | Landing Page / Login (Inferido) |
| `/dashboard` | Autenticado | Visão geral da clínica |
| `/dashboard/appointments` | Autenticado | Gestão de agendamentos |
| `/dashboard/services` | Autenticado | Catálogo de serviços |
| `/dashboard/documents` | Autenticado | Base de conhecimento (Uploads RAG) |
| `/dashboard/whatsapp` | Autenticado | QR Code / Conexão com Evolution API |
| `/dashboard/chat-test` | Autenticado | Teste do bot internamente |

### Componentes Chave
- **`AuthProvider`**: Componente Client-Side que encapsula as rotas e injeta o contexto da sessão do Supabase, permitindo redirecionamentos e verificação de identidade.
- **`DashboardHeader`**: Navegação global da área restrita.

### Comunicação com API e Estado
O estado local costuma ser gerenciado via React Hooks padrão. A comunicação com o backend NestJS é feita através do protocolo HTTP padrão, provavelmente utilizando funções de fetch nativas do Next.js.
> ⚠️ **Hipótese baseada na implementação**: A autenticação para as chamadas à API do NestJS é feita injetando o JWT do Supabase nos headers (`Authorization: Bearer <token>`).

---

## 6. Backend

O backend NestJS segue o padrão arquitetural de módulos fortemente isolados.

### Módulos Principais
1. **WhatsappModule**: 
   - Recebe eventos (`messages.upsert`) da Evolution API via Webhook.
   - Fornece endpoints de controle de sessão (`connect`, `disconnect`, `status`).
2. **ChatModule**:
   - É o cérebro do sistema. O `ChatService` vetoriza mensagens de entrada, busca contexto relevante no PostgreSQL e estrutura um prompt para o modelo LLM extrair metadados e formular respostas.
3. **PrismaModule**:
   - Módulo global que exporta o `PrismaService` para interação com o banco de dados.

### Fluxo de uma requisição de Chat via WhatsApp

```text
Request (Webhook: POST /whatsapp/webhook)
↓
WhatsappController
↓
WhatsappService (Verifica existência do Business/Sessão)
↓
ChatService (processMessage)
↓
Extractor (Xenova local - Converte mensagem em Vetor)
↓
PrismaService (Busca top 3 chunks de Documentos por similaridade via PgVector)
↓
PrismaService (Busca Serviços Ativos e Histórico Recente de Mensagens)
↓
Langchain (ChatGroq invoca o Qwen3.8-27b com Structured Output)
↓
Response formatada (Resposta textual ou pedido de transbordo)
↓
Evolution API (Envia a mensagem de volta para o cliente no WhatsApp)
```

---

## 7. API

### Endpoints Principais (Exemplos Mapeados)

#### `POST /whatsapp/webhook`
**Objetivo:** Recebe payloads em tempo real das interações no WhatsApp disparadas pela Evolution API.
**Autenticação:** Aberto (A Evolution API envia para este webhook).
**Request:**
```json
{
  "event": "messages.upsert",
  "instance": "nome_instancia_clinica",
  "data": { ... }
}
```
**Efeitos:** Processa a mensagem, atualiza o histórico na tabela `Message`, gera a resposta por IA e envia via Evolution API.

#### `POST /whatsapp/connect/:businessId`
**Objetivo:** Solicita a criação/conexão de uma instância de WhatsApp na Evolution API.
**Retorna:** Status e (geralmente) o QR Code em base64 para o usuário ler.

#### `DELETE /whatsapp/disconnect/:businessId`
**Objetivo:** Desconecta e remove a sessão da Evolution API.

---

## 8. Banco de dados

Modelo relacional PostgreSQL gerenciado pelo Prisma.

### Principais Modelos / Tabelas

- **Business**: Entidade raiz. Uma clínica/empresa (`name`, `evolutionInstanceName`, `ownerPhone`).
- **User**: Funcionários/Administradores associados a um `Business`.
- **Service**: Procedimentos oferecidos pela clínica (`name`, `durationInMinutes`, `price`).
- **Document**: Arquivos carregados para treinamento da IA (`filename`, `storageUrl`).
- **DocumentChunk**: Pedaços do documento vetorizados. Campo crítico: `embedding Unsupported("vector(384)")`.
- **Conversation**: Agrupa mensagens de um paciente (`clientPhone`, `status` [BOT ou HUMAN]).
- **Message**: Armazena as falas (`role` [user ou assistant], `content`).
- **Appointment**: Agendamentos realizados (`clientName`, `date`, `status`, FK de `Service`).

```mermaid
erDiagram
    Business ||--o{ User : contains
    Business ||--o{ Service : offers
    Business ||--o{ Document : stores
    Document ||--|{ DocumentChunk : chunks
    Business ||--o{ Conversation : tracks
    Conversation ||--|{ Message : contains
    Business ||--o{ Appointment : manages
```

---

## 9. Autenticação e autorização

- **Provedor:** Supabase Auth (verificado no Frontend `package.json` e `AuthProvider.tsx`).
- O Frontend gerencia o ciclo de vida do usuário via contexto (`AuthProvider`). 
- Proteção de Rotas: O Next.js provavelmente verifica a existência da sessão ativa para liberar o acesso ao `/dashboard`.
- **No Backend:**
  > ⚠️ **Hipótese baseada na implementação**: O backend implementa Guards (NestJS) globais ou por rota, onde extrai o token JWT enviado no Header da requisição, valida sua assinatura (possivelmente via JWKS do Supabase) e identifica o usuário e seu `businessId` para segregar dados (Multi-tenant).

---

## 10. Regras de negócio

- **Isolamento de Dados (Multi-tenancy)**: Todas as tabelas principais possuem `businessId`. Nenhum dado de contexto, serviço ou histórico vaza entre diferentes clínicas.
- **RAG (Retrieval-Augmented Generation)**:
  - O Bot tenta responder apenas usando informações limitadas a 3 *chunks* do banco de dados + Serviços ativos.
  - **Transbordo Humano**: O modelo de IA avalia a chave de saída estruturada `needsHumanFallback`. Se o cliente pede algo fora de contexto ou quer falar com um atendente, o bot muda o fluxo (status de `Conversation` de BOT para HUMAN) e notifica o painel.
- **Intenção de Agendamento**:
  - A IA é orientada pelo prompt a forçar a coleta de: **Nome, Serviço e Data/Hora**.
  - Somente quando todos esses dados são preenchidos o retorno da IA conterá `isComplete: true`. 
  - *(Inferência)* Quando `isComplete` é verdadeiro, o Backend dispara a criação de um registro na tabela `Appointment`.

---

## 11. Integrações externas

1. **Evolution API**: 
   - Gerencia sessões de WhatsApp.
   - Usado no backend módulo `/whatsapp`.
2. **Groq / Llama / Qwen**: 
   - Provedor do LLM. Oferece alta velocidade de inferência. Utilizado em `chat.service.ts` com a chave `GROQ_API_KEY`.
3. **Supabase**: 
   - Utilizado no Frontend para Gestão de Sessões de Usuários (Login/Senha).

---

## 12. Webhooks, eventos e processamento assíncrono

- O sistema é altamente dependente do Webhook `/whatsapp/webhook`.
- O ciclo de vida de uma mensagem depende desse webhook, que enfileira/processa requisições sincronicamente na atual arquitetura, atualizando registros no PostgreSQL.

---

## 13. Configuração e ambiente

Variáveis críticas (`.env`):
```env
DATABASE_URL=postgresql://user:pass@host/klinik?schema=public
DIRECT_URL=postgresql://user:pass@host/klinik?schema=public
GROQ_API_KEY=gsk_...
PORT=3001
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

---

## 14. Execução local

### Pré-requisitos
- Node.js >= 20, NPM
- Docker e Docker Compose (para banco de dados e pgvector)

### Banco de dados
Na raiz do `/backend`:
```bash
docker-compose up -d
npx prisma generate
npx prisma db push
# Se existir, rodar seed para carregar os usuários admin
npx prisma db seed
```

### Backend
```bash
cd backend
npm install
npm run start:dev
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```
Acesse `http://localhost:3000`. O backend roda em `http://localhost:3001`.

---

## 15. Testes

- O backend foi gerado com os artefatos de teste do NestJS (ex: `chat.service.spec.ts`, `app.controller.spec.ts`).
- Para executar os testes no backend: `npm run test` (unitários) ou `npm run test:e2e` (Integração).
- Não há configuração explícita de testes mapeada no frontend (Jest/Cypress).

---

## 16. Deploy e infraestrutura

- **Banco de Dados**: O banco precisa ter a extensão `pgvector` ativa (como Supabase Postgres ou uma instância customizada na AWS/Render).
- **Backend**: Compilável via `npm run build` (`dist/main.js`). Pode ser hospedado no Render, Railway ou AWS ECS.
- **Frontend**: Aplicação Next.js pronta para Vercel.

---

## 17. Dependências

| Dependência (Backend) | Versão | Finalidade |
|---|---|---|
| `@nestjs/core`, `common` | ^11.0.1 | Framework Web e API |
| `@prisma/client` | ^5.22.0 | ORM de comunicação com o DB |
| `@langchain/groq`, `core` | ^1.3.1 | Orquestração da IA e Inferência |
| `@xenova/transformers` | ^2.17.2 | Execução de modelos de IA de Embeddings locais no Node.js |

| Dependência (Frontend) | Versão | Finalidade |
|---|---|---|
| `next` | 16.3.5 | Framework React |
| `tailwindcss` | ^4 | Sistema de Grid e Utility classes |
| `@supabase/supabase-js`| ^2.116 | Autenticação no Client |

---

## 18. Pontos críticos e riscos técnicos

- 🔴 **Performance de Embeddings em Node.js**: O uso de `@xenova/transformers` (`Xenova/all-MiniLM-L6-v2`) realiza a vetorização matemática *dentro do processo Node.js* (Event Loop). Em alto volume de requisições webhooks simultâneas, isso irá bloquear o CPU e travar a aplicação, derrubando o servidor NestJS.
- 🟡 **Filas e Concorrência**: Webhooks do WhatsApp podem chegar aos milhares. Atualmente o Controller processa tudo sincronamente. Se o Groq demorar a responder, o Webhook da Evolution API pode sofrer Timeouts.
- 🟡 **Ausência de Paginação em Históricos**: O banco busca histórico no Prisma sem paginação controlada para interface, embora para o RAG exista o `take: 6`.
- 🟢 **Dependência do Groq**: O limite gratuito de requisições por minuto na API Groq pode ser facilmente estourado no modelo em produção (Rate Limiting).

---

## 19. Melhorias recomendadas

### 🔴 Alta prioridade
- **Implementar Message Broker (Fila)**: Utilizar BullMQ ou RabbitMQ para recepcionar webhooks e enfileirar a interação da IA, evitando que o NestJS perca requisições.
- **Desacoplar Embeddings Locais**: Substituir a geração de embeddings via Xenova Node.js por um serviço de terceiros rápido (como OpenAI Text-Embedding-3-small) para não sufocar a CPU da API.

### 🟡 Média prioridade
- **Tratamento de Rate Limit de IA**: Adicionar um mecanismo de *Retry* exponencial no Langchain (atualmente o código falha via fallback se o Groq cair).

### 🟢 Baixa prioridade
- **Implementação de testes E2E**: Testar os fluxos com simulação de payloads do webhook da Evolution API.

---

## 20. Mapa geral do sistema

```text
SISTEMA KLINIK OS
│
├── Frontend (Next.js)
│   ├── Componentes Globais (Header, Auth)
│   ├── Login
│   └── Dashboard
│       ├── Appointments (Agendamentos)
│       ├── Services (Serviços)
│       ├── Documents (Documentos/RAG)
│       └── Whatsapp Configs
│
├── Backend (NestJS)
│   ├── Módulo de Autenticação / Usuários
│   ├── Módulo de Negócios (Business, Services, Appointments)
│   ├── Módulo de IA (Chat, RAG)
│   └── Módulo de Integração (WhatsApp Evolution API)
│
├── Database (Prisma Postgres)
│   ├── Dados Relacionais
│   └── Dados Vetoriais (pgvector)
│
└── Infraestrutura / APIs
    ├── Evolution API (Envio e Recebimento)
    └── Groq (Inferência de IA)
```

---

## 21. Glossário

- **RAG (Retrieval-Augmented Generation)**: Técnica que provê informações externas ao modelo de IA antes dele gerar a resposta, garantindo que ele não tenha "alucinações" sobre regras da clínica.
- **PgVector**: Extensão do PostgreSQL que permite realizar buscas de similaridade por distância matemática entre frases.
- **Embedding / Chunking**: O ato de quebrar um texto longo em partes e transformar essas partes num array de números que representa o significado da frase.
- **Groq**: Provedor de cloud especializado em rodar LLMs (como o Llama e o Qwen) em altíssima velocidade graças as suas NPUs customizadas.
- **Evolution API**: Uma plataforma open source famosa por emular o comportamento do WhatsApp Web via API para uso de chatbots.

---
*Gerado por análise automatizada do ecossistema do projeto.*
