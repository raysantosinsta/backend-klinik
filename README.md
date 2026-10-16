# 🏥 Klinik OS — Backend & AI Engine Architecture

> Plataforma integrada de atendimento inteligente, automação multicanal via WhatsApp e gestão clínica com IA Generativa, RAG (Retrieval-Augmented Generation) vetorial e arquitetura orientada a eventos.

---

## 🏛️ Visão Geral da Arquitetura

O **Klinik OS** adota uma arquitetura moderna distribuída em microsserviços especializados, separando a orquestração de negócios, filas assíncronas, motor cognitivo de IA e persistência relacional/vetorial:

![Arquitetura Geral Klinik OS](assets/architecture-overview.jpg)

```mermaid
flowchart TB
    subgraph CLIENTS ["📱 Camada de Clientes"]
        WA_USER["Paciente / Cliente<br/>(WhatsApp)"]
        WEB_USER["Equipe Clínica / Admin<br/>(Dashboard Next.js)"]
    end

    subgraph INGRESS ["🌐 Camada de Integração & Mensageria"]
        EVO["Evolution API v2<br/>(Render Cloud Gateway)"]
        NGROK["Ngrok Tunnel / SSL Gateway<br/>(Dev & Cloud Routing)"]
    end

    subgraph CORE_BACKEND ["⚙️ Backend Central (NestJS Core API)"]
        API_GATEWAY["NestJS HTTP Controller<br/>(/whatsapp, /chat, /documents)"]
        AUTH_GUARD["Guarda de Autenticação<br/>(Supabase Auth Context)"]
        PRISMA_SVC["Prisma ORM<br/>(@prisma/adapter-pg Node TLS)"]
        EMBED_SVC["Motor de Embeddings Local<br/>(Xenova/all-MiniLM-L6-v2)"]
    end

    subgraph QUEUE_LAYER ["⚡ Mensageria & Filas Assíncronas"]
        REDIS["Redis Cloud Broker<br/>(BullMQ Engine)"]
        WORKER["Worker Assíncrono<br/>(WhatsappProcessor)"]
    end

    subgraph AI_BRAIN ["🧠 Cérebro Cognitivo de IA (Python LangGraph)"]
        FASTAPI["FastAPI Orchestrator<br/>(POST /webhook)"]
        LANGGRAPH["LangGraph StateGraph<br/>(Raciocínio & Decisão)"]
        TOOL_RAG["Tool: consultar_base_conhecimento<br/>(Multi-tenant RAG)"]
        GROQ_LLM["Groq LPU Inference<br/>(LLM Llama-3 / Qwen)"]
    end

    subgraph DATA_LAYER ["💾 Camada de Persistência & Vetores"]
        PG_DB[("Supabase PostgreSQL")]
        PG_VECTOR[("pgvector Extension<br/>vector(384) Chunks")]
    end

    %% Relações e Fluxos
    WA_USER <-->|"Mensagens WhatsApp"| EVO
    EVO -->|"Webhook HTTP POST"| API_GATEWAY
    WEB_USER <-->|"REST API / Server Actions"| API_GATEWAY

    API_GATEWAY -->|"Enfileira Mensagem"| REDIS
    REDIS -->|"Consome Job"| WORKER
    WORKER -->|"Dispara Raciocínio"| FASTAPI

    FASTAPI --> LANGGRAPH
    LANGGRAPH <-->|"Tool Calling (RAG)"| TOOL_RAG
    TOOL_RAG -->|"Busca Semântica (/chat/context)"| API_GATEWAY
    API_GATEWAY -->|"Cálculo de Similaridade Cossenoidal"| PG_VECTOR

    LANGGRAPH <-->|"Prompt com Contexto + Histórico"| GROQ_LLM
    LANGGRAPH -->|"Resposta Gerada"| WORKER
    WORKER -->|"Envia Mensagem Final"| EVO
    EVO -->|"Entrega no WhatsApp"| WA_USER

    API_GATEWAY <--> PRISMA_SVC
    PRISMA_SVC <--> PG_DB
    EMBED_SVC -->|"Gera Vetores 384d"| PRISMA_SVC
```

---

## 🔄 Fluxos de Negócio e Ciclo de Dados

### 1. Fluxo de Atendimento Conversacional WhatsApp (End-to-End)

Este é o fluxo primário de comunicação automatizada. Todo o processamento é desacoplado por mensageria em fila para garantir tolerância a falhas, alta vazão e zero bloqueios no webhook:

```mermaid
sequenceDiagram
    autonumber
    actor Cliente as 📱 Paciente (WhatsApp)
    participant Evo as 📲 Evolution API (v2)
    participant Nest as ⚙️ NestJS Controller
    participant Redis as ⚡ Redis BullMQ
    participant Worker as 👷 Worker Processor
    participant Agent as 🧠 Agente Python (LangGraph)
    participant RAG as 📚 NestJS (/chat/context)
    participant VectorDB as 🗄️ Supabase (pgvector)
    participant Groq as 🤖 Groq LLM

    Cliente->>Evo: Envia mensagem: "Quais são os tratamentos e preços?"
    Evo->>Nest: POST /whatsapp/webhook (MESSAGES_UPSERT)
    Note over Nest: Validação rápida e sanitização do payload
    Nest->>Redis: Enfileira job na fila 'whatsapp_messages'
    Nest-->>Evo: 200 OK { success: true } (Retorno imediato)
    
    Redis->>Worker: Entrega job para processamento
    Worker->>Worker: Extrai telefone limpo e texto
    Worker->>Agent: POST /webhook { tenant_id, phone_number, message }
    
    activate Agent
    Agent->>Agent: LangGraph inicializa AgentState & Histórico
    Agent->>Groq: Avalia intenção com Tool Calling habilitado
    Groq-->>Agent: Requisita Tool: consultar_base_conhecimento(query)
    
    Agent->>RAG: POST /chat/context { businessId, query }
    RAG->>RAG: Gera embedding da dúvida (all-MiniLM-L6-v2)
    RAG->>VectorDB: Busca vetorial cosine (<=>) com filtro estrito de tenant
    VectorDB-->>RAG: Retorna top-K chunks de PDFs + Serviços
    RAG-->>Agent: Retorna { context, services, businessName }
    
    Agent->>Groq: Envia contexto factual dos PDFs oficiais
    Groq-->>Agent: Gera resposta personalizada e humanizada
    Agent-->>Worker: Retorna { status: 'success', reply: "Olá! Nossos tratamentos são..." }
    deactivate Agent

    Worker->>Evo: POST /message/sendText/{instance}
    Evo-->>Cliente: Entrega a resposta no WhatsApp do paciente 💬
```

---

### 2. Fluxo de Ingestão de Documentos e RAG (Knowledge Base Pipeline)

Permite que administradores façam upload de regulamentos, tabelas de preços, manuais e protocolos médicos em PDF, convertendo-os em vetores pesquisáveis por similaridade semântica com total isolamento multi-inquilino (*multi-tenancy*):

```mermaid
flowchart LR
    A["📄 Upload de PDF<br/>(Dashboard Next.js)"] --> B["⚙️ NestJS DocumentsController<br/>(Multer File Interceptor)"]
    B --> C["📝 Extração de Texto Puro<br/>(pdf-parse)"]
    C --> D["✂️ RecursiveCharacterTextSplitter<br/>(Tamanho: 1000 / Overlap: 200)"]
    
    subgraph EMBED_PIPELINE ["Embeddings Locais"]
        D --> E["🧠 Xenova/all-MiniLM-L6-v2<br/>(ONNX Runtime local no Node.js)"]
        E --> F["📐 Vetor Denso Normalizado<br/>vector(384)"]
    end

    subgraph STORAGE ["Supabase PostgreSQL"]
        F --> G["🗄️ Inserção no DocumentChunk<br/>- documentId<br/>- businessId (Tenant isolation)<br/>- content<br/>- embedding (pgvector)"]
    end
```

---

### 3. Fluxo de Conexão e Ciclo de Vida da Instância WhatsApp

Mecanismo de integração que cria a instância na Evolution API, recupera o QR Code para pareamento e configura automaticamente o webhook na URL oficial da aplicação:

```mermaid
sequenceDiagram
    autonumber
    actor Admin as 👨‍⚕️ Administrador Clínico
    participant Front as 🖥️ Dashboard Next.js
    participant Backend as ⚙️ Backend NestJS
    participant DB as 🗄️ PostgreSQL (Prisma)
    participant Evo as 📲 Evolution API

    Admin->>Front: Clica em "Conectar WhatsApp"
    Front->>Backend: POST /whatsapp/connect/{businessId}
    Backend->>DB: Verifica ou gera `evolutionInstanceName`
    Backend->>Evo: POST /instance/create { instanceName, qrcode: true }
    Evo-->>Backend: Retorna payload com { qrcode: base64 }
    
    Note over Backend,Evo: Configuração automática e resiliente do Webhook
    Backend->>Evo: POST /webhook/set/{instanceName}
    Note right of Evo: URL: https://backend-klinik.onrender.com/whatsapp/webhook<br/>Eventos: [MESSAGES_UPSERT]
    
    Backend-->>Front: Retorna { success: true, qrcode: "data:image/png..." }
    Front-->>Admin: Exibe QR Code na tela para escaneamento
    Admin->>Evo: Escaneia o QR Code com o aplicativo WhatsApp
    Evo->>Evo: Transiciona estado para "open" (Conectado)
    
    Front->>Backend: GET /whatsapp/status/{businessId}
    Backend->>Evo: GET /instance/connectionState/{instanceName}
    Evo-->>Backend: { instance: { state: "open" } }
    Backend-->>Front: { connected: true, status: "open" }
    Front-->>Admin: Exibe badge verde "🟢 Conectado"
```

---

## 🛠️ Tecnologias e Componentes do Backend

| Componente | Tecnologia | Papel no Sistema |
| :--- | :--- | :--- |
| **API Framework** | [NestJS 11](https://nestjs.com/) | API Gateway REST, injeção de dependência modular e controladores. |
| **Linguagem** | TypeScript 5 | Tipagem estática rigorosa para segurança em tempo de compilação. |
| **ORM & Driver** | Prisma 5.22 + `@prisma/adapter-pg` | Mapeamento relacional com driver nativo `node-postgres` (bypassa problemas de OpenSSL). |
| **Banco de Dados** | Supabase PostgreSQL | Banco relacional na nuvem com extensão `pgvector` ativada. |
| **Filas / Broker** | BullMQ + Redis Cloud | Processamento assíncrono e resiliente de webhooks de mensagens. |
| **Embeddings** | `@xenova/transformers` | Geração local no backend do modelo `Xenova/all-MiniLM-L6-v2` (384 dimensões). |
| **IA & LLMs** | LangGraph + LangChain + Groq | Agente autônomo com memória conversacional e chamada de ferramentas (*tool calling*). |
| **Mensageria** | Evolution API v2 | Gateway profissional de conexão direta à infraestrutura do WhatsApp. |

---

## ⚙️ Variáveis de Ambiente Essenciais

As seguintes variáveis configuram o ecossistema completo nos ambientes de desenvolvimento e produção:

```env
# Banco de Dados (Supabase Pooler IPv4)
DATABASE_URL="postgresql://postgres.[REF]:[PASS]@aws-0-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require&sslaccept=accept_invalid_certs"
DIRECT_URL="postgresql://postgres.[REF]:[PASS]@aws-0-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require&sslaccept=accept_invalid_certs"

# Supabase Auth & Storage
SUPABASE_URL="https://[PROJECT-REF].supabase.co"
SUPABASE_SERVICE_ROLE_KEY="eyJhbGciOi..."

# Provedor de IA (Groq Cloud)
GROQ_API_KEY="gsk_..."

# Gateway WhatsApp (Evolution API)
EVOLUTION_API_URL="https://evolution-api-latest-jf6y.onrender.com"
EVOLUTION_API_KEY="SuaSenhaSecreta123"
WEBHOOK_URL="https://backend-klinik.onrender.com"

# Broker de Mensageria (Redis Cloud)
REDIS_URL="redis://default:[PASS]@[HOST]:[PORT]"

# Agente Cognitivo Python
PYTHON_AGENT_URL="https://agente-klinik.onrender.com"
```

---

## 🚀 Como Executar o Backend Localmente

### 1. Instalar Dependências
```bash
npm install
```

### 2. Gerar o Prisma Client
```bash
npx prisma generate
```

### 3. Iniciar em Modo de Desenvolvimento
```bash
npm run start:dev
```

### 4. Build para Produção
```bash
npm run build
npm run start:prod
```

### 5. Health Check da Aplicação e Banco
Após iniciar o servidor, verifique a saúde da conexão com o banco e infraestrutura acessando:
```http
GET http://localhost:3001/health
```
**Resposta esperada:**
```json
{
  "status": "ok",
  "database": "connected",
  "timestamp": "2026-10-16T04:25:00.000Z"
}
```

---

## 🔒 Segurança e Isolamento Multi-Tenancy

- **Isolamento de Conhecimento:** Toda busca vetorial em `DocumentChunk` executa filtros estritos por `businessId`. Chunks ou tabelas de preços de uma clínica **nunca** são acessíveis ou vazam para outra organização.
- **TLS / SSL Sem Fricção:** O backend utiliza Driver Adapter com `rejectUnauthorized: false` estritamente mapeado no pooler de sessão, prevenindo falhas de cadeia de certificados em ambientes conteinerizados (Render/Docker/Kubernetes).
- **Validação de Webhooks:** Sanitização de remetente (`remoteJid`), normalização de números telefônicos internacionais e prevenção de loops com mensagens enviadas pelo próprio bot (`fromMe: false`).
