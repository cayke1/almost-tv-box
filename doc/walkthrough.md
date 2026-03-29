# Mobile Remote Integration Walkthrough

Este documento detalha as novas funcionalidades e a arquitetura implementada na branch `feature/mobile-remote-integration` para o projeto TV-OS.

## 🚀 Novas Funcionalidades

### 📺 Controle Remoto Direto (Plug & Play)
*   **Servidor Interno**: Integramos o servidor de controle remoto diretamente no processo principal do Electron. Não é mais necessário rodar um servidor separado via terminal.
*   **Descoberta mDNS**: O Desktop agora se anuncia na rede local como `TV-OS-Server`. O app Android encontra o computador automaticamente via mDNS, eliminando a configuração manual de IP.

### 📱 Aplicativo Android Modernizado
*   **Touchpad Dinâmico**: Controle o cursor do mouse na TV usando gestos de slide no celular.
*   **Teclado Remoto**: Digite textos no celular e envie instantaneamente para o campo de busca no YouTube ou no menu do TV-OS.
*   **Controles de Volume Nativo**: Botões de `Vol +`, `Vol -` e `Mudo` que controlam o volume do sistema do computador ou do app de streaming aberto.
*   **Navegação Inteligente**:
    *   **BACK**: Volta páginas e menus gradualmente dentro do YouTube ou interface.
    *   **HOME**: Fecha todos os apps e volta imediatamente para o menu principal.

### 🧠 Roteamento de Comandos Inteligente
*   O sistema agora "sabe" se você está no menu principal ou dentro de um app (como YouTube).
*   Os comandos do controle remoto (Setas, OK, Voltar, Teclado) são automaticamente redirecionados para o app aberto.
*   Correção de bugs de foco: Ao fechar um app, o controle volta a focar no menu principal sem travamentos.

---

## 🏗️ Arquitetura Técnica

### Desktop (Electron)
*   **`websocket-server.ts`**: Servidor bilingue (HTTP + WebSocket) com descoberta via `bonjour-service`.
*   **`main.ts`**: Cérebro central que recebe os comandos do celular e decide se deve enviá-los para a janela principal ou para o `BrowserView` ativo.
*   **`app-manager.ts`**: Gerenciador de janelas que injeta eventos de hardware (`sendInputEvent`) para garantir compatibilidade com sites e apps de streaming.

### Mobile (Android)
*   **`MainActivity.kt`**: Interface moderna construída com Jetpack Compose.
*   **`DiscoveryManager.kt`**: Logica de descoberta de rede local (NSD/mDNS).

---

## 🛠️ Manutenção e Organização
*   **Git**: O projeto agora está organizado em branches de feature.
*   **Gitignore**: Adicionado suporte para ignorar arquivos de build do Android Studio e Gradle.
