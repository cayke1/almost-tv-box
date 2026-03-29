# Smart TV Electron App - Roadmap

Este documento é o roadmap principal do projeto. Cada fase está detalhada nos arquivos de especificação em `/docs/`.

---

## Fase 1: Base
**Arquivo:** `docs/baseapp.md`

- [ ] Setup Electron + React + TypeScript + Vite + TailwindCSS
- [ ] Fullscreen kiosk mode (sem bordas)
- [ ] App registry (JSON config)
- [ ] IPC setup (main/preload)
- [ ] App cards grid (Netflix, YouTube, Prime Video, Browser)
- [ ] Animações básicas (focus scale, glow)

**Entregáveis:**
- `src-electron/main.ts` - Electron main process
- `src-electron/preload.ts` - Preload script
- `src/types/index.ts` - Tipos compartilhados
- `src/config/apps.json` - Registry de apps

---

## Fase 2: Navegação
**Arquivo:** `docs/navigation.md`

- [ ] FocusContext com reducer
- [ ] focusUtils (algoritmo de navegação grid)
- [ ] useGridNavigation hook
- [ ] Componente Focusable (HOC)
- [ ] Componente FocusRing
- [ ] Integração com WebSocket (mobile events)

**Entregáveis:**
- `src/context/FocusContext.tsx`
- `src/hooks/useGridNavigation.ts`
- `src/utils/focusUtils.ts`
- `src/components/Focusable.tsx`

---

## Fase 3: Apps
**Arquivo:** `docs/apps.md`

- [ ] AppManager class (BrowserView lifecycle)
- [ ] app-registry.ts (main process)
- [ ] IPC handlers
- [ ] useAppManager hook
- [ ] AppView, AppLoading, AppError components
- [ ] Loading indicators e error fallback

**Entregáveis:**
- `src-electron/services/app-manager.ts`
- `src-electron/services/app-registry.ts`
- `src-electron/services/ipc-handlers.ts`
- `src/services/useAppManager.ts`
- `src/components/AppView.tsx`

---

## Fase 4: Mobile Controller
**Arquivo:** `docs/phone-controller.md`

- [ ] WebSocket server no main process
- [ ] HTTP server para servir mobile UI
- [ ] Mobile UI HTML/CSS/JS responsivo
- [ ] D-pad controls (arrows, select, back)
- [ ] Text input
- [ ] Connection status
- [ ] Exibir IP na TV
- [ ] Suporte a múltiplos devices

**Entregáveis:**
- `src-electron/services/websocket-server.ts`
- `src/mobile/index.html`
- `src/mobile/styles.css`
- `src/mobile/app.js`
- `src/components/ConnectionInfo.tsx`

---

## Fase 5: Touchpad
**Arquivo:** `docs/touchpad.md`

- [ ] TouchpadHandler class
- [ ] CursorManager com smooth interpolation
- [ ] Interpolator utilities
- [ ] Tap detection (single/double tap)
- [ ] Two-finger scroll
- [ ] Sensitivity slider
- [ ] CursorOverlay component

**Entregáveis:**
- `src-electron/services/touchpad-handler.ts`
- `src-electron/services/cursor-manager.ts`
- `src/utils/interpolation.ts`
- `src/components/CursorOverlay.tsx`

---

## Fase 6: UX
**Arquivo:** `docs/ux.md`

- [ ] useTransition hook
- [ ] ScreenContainer com animações
- [ ] App launch animations
- [ ] BackgroundBlur component
- [ ] RecentlyOpened row
- [ ] useQuickResume hook
- [ ] OnScreenKeyboard component
- [ ] Screensaver (idle mode)
- [ ] useIdleTimer hook
- [ ] CSS animations

**Entregáveis:**
- `src/hooks/useTransition.ts`
- `src/components/ScreenContainer.tsx`
- `src/components/OnScreenKeyboard.tsx`
- `src/components/Screensaver.tsx`
- `src/components/RecentlyOpened.tsx`
- `src/hooks/useIdleTimer.ts`
- `src/hooks/useRecentlyOpened.ts`
- `src/styles/animations.css`

---

## Estrutura Final do Projeto

```
tv-os/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.js
├── electron-builder.json
├── docs/
│   ├── baseapp.md
│   ├── navigation.md
│   ├── apps.md
│   ├── phone-controller.md
│   ├── touchpad.md
│   └── ux.md
├── src-electron/
│   ├── main.ts
│   ├── preload.ts
│   └── services/
│       ├── app-manager.ts
│       ├── app-registry.ts
│       ├── ipc-handlers.ts
│       ├── websocket-server.ts
│       ├── touchpad-handler.ts
│       └── cursor-manager.ts
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── index.css
│   ├── types/
│   │   └── index.ts
│   ├── config/
│   │   └── apps.json
│   ├── context/
│   │   └── FocusContext.tsx
│   ├── hooks/
│   │   ├── useGridNavigation.ts
│   │   ├── useTransition.ts
│   │   ├── useIdleTimer.ts
│   │   ├── useRecentlyOpened.ts
│   │   ├── useAppManager.ts
│   │   └── useWebSocketNavigation.ts
│   ├── components/
│   │   ├── AppCard.tsx
│   │   ├── AppView.tsx
│   │   ├── AppLoading.tsx
│   │   ├── AppError.tsx
│   │   ├── Focusable.tsx
│   │   ├── FocusRing.tsx
│   │   ├── ScreenContainer.tsx
│   │   ├── OnScreenKeyboard.tsx
│   │   ├── Screensaver.tsx
│   │   ├── RecentlyOpened.tsx
│   │   ├── CursorOverlay.tsx
│   │   └── ConnectionInfo.tsx
│   ├── mobile/
│   │   ├── index.html
│   │   ├── styles.css
│   │   └── app.js
│   ├── utils/
│   │   ├── focusUtils.ts
│   │   └── interpolation.ts
│   └── styles/
│       └── animations.css
└── public/
    └── index.html
```

---

## Ordem de Implementação Sugerida

```
1 → 2 → 3 → 4 → 5 → 6
```

**Nota:** As fases 4 e 5 podem ser desenvolvidas em paralelo, pois são independentes.

---

## Comandos para Desenvolvimento

```bash
# Install dependencies
npm install

# Development (React only)
npm run dev

# Development (Electron)
npm run electron:dev

# Production build
npm run electron:build
```

---

## Requisitos de Runtime

- Node.js 18+
- Electron 28+
- Windows 10+ (para kiosk mode)

---

## Fluxo de Eventos Principal

```
Mobile Controller
       │
       ▼ (WebSocket)
┌──────────────────┐
│  WebSocket       │
│  Server          │
└────────┬─────────┘
         │ IPC
         ▼
┌──────────────────┐
│  Main Process    │
│  (ipcMain)       │
└────────┬─────────┘
         │ IPC
         ▼
┌──────────────────┐
│  Renderer        │
│  (React)         │
└────────┬─────────┘
         │
         ├──► Focus Manager ──► UI Updates
         ├──► App Manager ──► BrowserViews
         └──► Touchpad ──► Cursor Position
```
