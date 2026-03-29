# TV-OS - Smart TV OS

Smart TV OS com arquitetura separada: servidor (Docker) + app (Electron).

## Estrutura

```
tv-os/
├── server/           # Servidor WebSocket + HTTP (Docker/VPS)
│   ├── src/index.ts
│   ├── Dockerfile
│   ├── docker-compose.yml
│   └── .env.example
│
├── desktop/          # App Electron (roda no PC/TV)
│   ├── src/          # React frontend
│   ├── src-electron/ # Electron main process
│   ├── package.json
│   └── .env.example
│
├── docs/             # Documentação
└── README.md
```

## Quick Start

### 1. Servidor (Docker)

```bash
cd server
cp .env.example .env

# Development
npm install
npm run dev

# Production Docker
docker-compose up --build
```

### 2. Desktop (Electron)

```bash
cd desktop
npm install

# Development
npm run electron:dev

# Build
npm run electron:build
```

## Configuração

### server/.env
```env
ELECTRON_HOST=localhost      # IP do PC (ou host.docker.internal)
ELECTRON_WS_PORT=8081
PORT=8080
```

### desktop/.env
```env
SERVER_HOST=localhost        # IP do servidor Docker
SERVER_PORT=8080
LOCAL_WS_PORT=8081
```

## Cenários

| Cenário | server/.env | desktop/.env |
|---------|-------------|--------------|
| Same machine | ELECTRON_HOST=localhost | SERVER_HOST=localhost |
| Rede local | ELECTRON_HOST=192.168.x.x | SERVER_HOST=localhost |
| VPS | ELECTRON_HOST=<IP_PC> | SERVER_HOST=<IP_VPS> |
