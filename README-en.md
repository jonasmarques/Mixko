**Language / Idioma:** 🇺🇸 English | [🇧🇷 Português](README.md) | [🇪🇸 Español](README-es.md)

# Mixko

Mixko is an alternative cross-platform application for Bluesky whose main focus is accessibility for blind and low-vision individuals.

The idea is to provide full navigation with keyboard shortcuts, magnification and highlight features, and a clean, semantically organized interface.


---

## Table of Contents

- [Overview](#overview)
- [Downloads](#downloads)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
- [License](#license)
- [Credits and Acknowledgments](#credits-and-acknowledgments)
- [Buy me a coffee](#buy-me-a-coffee)

---

## Overview

Mixko is an alternative client for the Bluesky network with full integration with the AT Protocol and practically all features of the official application. Through it, blind and low-vision people can send posts, reply, like, repost, quote posts, manage DMs/chats, and explore feeds. The differentiator lies in the fact that all of this can be done using only the keyboard or a magnified environment.

**Main features:**

- Timeline navigation and custom feeds
- Post creation supporting text, images, videos, quotes, and replies
- Real-time notifications
- Direct messages (Bluesky Chat / DMs)
- Profile viewing and follower/block management
- Management of lists and starter packs
- Post and user search
- Content moderation preferences and muted words
- Keyboard shortcut support across the entire interface (see [shortcuts.md](shortcuts.md))

---

## Downloads

> **Note 1 (macOS):** The poor developer of such a humble application does not own a Mac OS to test it in that environment, nor was able to find anyone who could be a beta tester. If you find any issue, please report it as a PR and I will fix it as soon as possible.

> **Note 2 (Windows):** The application is a webview wrapper, but does not have a certificate. This means you will very likely see the Windows SmartScreen screen when opening the app. Simply click on "More info" and then "Run anyway". Don't worry, there is no malware whatsoever, I just couldn't afford $99 USD for a certificate for the application.


Mixko is available for Linux, Windows, and Mac. [Download it here](https://github.com/jonasmarques/Mixko/releases)




---

## Architecture

Mixko uses the **Wails v2** framework, which embeds the frontend as a static asset bundle inside the compiled Go binary. The Go layer exposes typed methods to the frontend via the Wails IPC bridge. 

- **Backend:** Developed in Go 1.26 with support for secure persistence in encrypted SQLite (AES-256-GCM) using `modernc.org/sqlite`.
- **Frontend:** Developed in Vite + TypeScript with support for screen readers and keyboard navigation.
- **Protocol:** Integration with the Bluesky network via the official [Indigo](https://github.com/bluesky-social/indigo) library.

---

## Prerequisites

| Tool | Minimum Version | Purpose |
|------|-----------------|---------|
| Go | 1.22+ | Backend compilation |
| Node.js | 18+ | Frontend build tools |
| npm | 9+ | Frontend dependency management |
| Wails CLI | v2.12+ | Application compilation |

Install the Wails CLI:

```bash
go install github.com/wailsapp/wails/v2/cmd/wails@latest
```

---

## Getting Started

### Clone the repository

```bash
git clone https://github.com/jonasmarques/Mixko.git
cd Mixko
```

### Install frontend dependencies

```bash
cd frontend
npm install
cd ..
```

### Run in development mode

```bash
wails dev
```

---

## License

This software is licensed under the MIT License.

---

## Credits and Acknowledgments

Special thanks to all open-source projects and contributors that make Mixko possible:

- **[Bluesky Social & Project Indigo](https://github.com/bluesky-social/indigo):** For developing the [AT Protocol](https://atproto.com/) and the official `indigo` library in Go.
- **[Wails Framework](https://wails.io/):** For the Go + Webview cross-platform compiler and infrastructure.
- **[ModernC SQLite](https://gitlab.com/cznic/sqlite):** For the pure Go SQLite implementation.
- **[HLS.js](https://github.com/video-dev/hls.js/):** For supporting HLS video playback and streaming in the interface.
- **[Vite](https://vitejs.dev/) & [TypeScript](https://www.typescriptlang.org/):** For the frontend development infrastructure.
- **Special thanks:** Cassiano Abreu and Carla Marx for testing and feedback as beta testers.

---

## Buy me a coffee

This software is and always will be free and open source. However, it is developed in my scarce free time and perhaps for that reason it may not have the exact state-of-the-art refinement I would like. Regardless, if you want and can support the project, who am I to stop you. Support can be made through the following means:

- **Pix:** [Click here to send a Pix](https://nubank.com.br/cobrar/futyp1/6a316637-8282-4bf0-b3d6-2c58cd82eed2)
- **Debit or credit card:** [Click here on Mercado Pago](https://link.mercadopago.com.br/mixco)
