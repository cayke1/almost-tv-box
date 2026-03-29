# Project Overview: TV-OS (Almost-TV-Box)

This project is a custom TV OS interface built with **Electron + React** and a **Node.js/Express** backend that enables remote control via a mobile web interface.

## Current Architecture: Unified Long-Polling

The project initially used WebSockets for the TV-to-Server connection, but it was replaced by a **100% Long-Polling model** to ensure guaranteed connectivity across complex network environments (Docker, firewalls, etc.) while maintaining high responsiveness.

### 1. The Server (`/server`)
- **Bridge Role**: Acts as the central hub between the TV and mobile remotes.
- **Auto-Discovery (mDNS)**: Announces itself as `TV-OS-Server` using the Bonjour protocol, allowing clients to find the IP/Port automatically.
- **Long-Polling Engine**: Uses a `Node.js EventEmitter` to hold incoming `/api/poll` requests. When a command is received, the server immediately releases the pending poll with the data.
- **Unified Queue**: All commands (Navigation, Select, Back, Text) are placed in a global `messageQueue`.
- **Status Tracking**: Monitors "Connected" status based on the last poll timestamp from the TV (`clientId: television`).

### 2. The TV App (`/desktop`)
- **Frontend**: React-based UI with grid navigation.
- **Main Process (Electron)**: Acts as a **Polling Client**. 
- **Recursive Polling**: It initiates a poll, waits for the server (which might hold the request for up to 30s), and **immediately re-polls** as soon as it gets a response.
- **Command Execution**: Decodes incoming poll messages (e.g., `NAVIGATION`, `SELECT`) and injects them into the Electron window as UI events.

### 3. Mobile Remote
- **Web UI**: A simple HTML/JS interface provided by the server at the root URL (`/`).
- **Native Android App (`/mobile`)**: A Kotlin/Jetpack Compose APK that uses `NsdManager` to auto-discover the TV and provides a tactile D-Pad interface.
- **Communication**: Sends commands via POST to `/api/command` with `clientId: 'mobile-remote'`.

## Key Features & Benefits
- **Zero Configuration**: No need for manual IP setup or firewall port opening (standard HTTP only).
- **Near-Instant Response**: Latency is < 50ms on LAN despite being "polling" due to the hold-and-release mechanic.
- **Robustness**: Automatically handles reconnections and works through any proxy or Docker networking setup.

## Current State
- **Core Navigation**: Working perfectly via polling.
- **Responsiveness**: Optimized and feels like real-time.
- **Connectivity**: Stable and avoids all previous `ECONNREFUSED` issues.
