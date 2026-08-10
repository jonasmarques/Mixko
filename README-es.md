 **Idioma / Language:** 🇪🇸 Español | [🇧🇷 Português](README.md) | [🇺🇸 English](README-en.md)

# Mixko

Mixko es una aplicación multiplataforma alternativa para Bluesky cuyo enfoque principal es la accesibilidad para personas ciegas y con baja visión.

La idea es proporcionar una navegación completa mediante atajos de teclado, funciones de ampliación y resalte, y una interfaz limpia y semánticamente organizada.


---

## Índice

- [Visión General](#visión-general)
- [Descargas](#descargas)
- [Arquitectura](#arquitectura)
- [Requisitos Previos](#requisitos-previos)
- [Primeros Pasos](#primeros-pasos)
- [Licencia](#licencia)
- [Créditos y Agradecimientos](#créditos-y-agradecimientos)
- [Invítame un café](#invítame-un-café)

---

## Visión General

Mixko es un cliente alternativo para la red Bluesky con integración total al AT Protocol y prácticamente todas las funcionalidades de la aplicación oficial. A través de él, las personas ciegas y con baja visión pueden enviar publicaciones, responder, dar me gusta, republicar, citar publicaciones, gestionar DMs/chats y explorar feeds. La diferencia radica en que todo esto se puede realizar utilizando únicamente el teclado o un entorno ampliado.

**Características principales:**

- Navegación en la línea de tiempo y feeds personalizados
- Creación de publicaciones con soporte para texto, imágenes, videos, citas (quote) y respuestas
- Notificaciones en tiempo real
- Mensajes directos (Bluesky Chat / DMs)
- Visualización de perfiles y gestión de seguidores y bloqueos
- Gestión de listas y paquetes de inicio (*starter packs*)
- Búsqueda de publicaciones y usuarios
- Preferencias de moderación de contenido y palabras silenciadas
- Soporte para atajos de teclado en toda la interfaz (consulte [atajos.md](atajos.md))

---

## Descargas

> **Nota 1 (macOS):** El pobre desarrollador de tan humilde aplicación no posee un Mac OS para probarla en ese entorno, ni fue capaz de encontrar a alguien que pudiera actuar como beta tester. Si encuentra algún problema, repórtelo como PR y lo corregiré lo antes posible.

> **Nota 2 (Windows):** La aplicación es un encapsulado webview, pero no cuenta con un certificado. Esto significa que es muy probable que vea la pantalla de SmartScreen de Windows al abrir la app. Simplemente haga clic en "Más información" y luego en "Ejecutar de todos modos". No se preocupe, no hay ningún tipo de malware, solo que no pude pagar 99 USD por un certificado para la aplicación.


Mixko está disponible para Linux, Windows y Mac. [Descárguelo aquí](https://github.com/jonasmarques/Mixko/releases)




---

## Arquitectura

Mixko utiliza el framework **Wails v2**, que incorpora el frontend como un paquete de recursos estáticos dentro del binario compilado de Go. La capa de Go expone métodos tipados al frontend a través del puente IPC de Wails. 

- **Backend:** Desarrollado en Go 1.26 con soporte para persistencia segura en SQLite encriptado (AES-256-GCM) usando `modernc.org/sqlite`.
- **Frontend:** Desarrollado en Vite + TypeScript con soporte para lectores de pantalla y navegación por teclado.
- **Protocolo:** Integración con la red Bluesky a través de la biblioteca oficial [Indigo](https://github.com/bluesky-social/indigo).

---

## Requisitos Previos

| Herramienta | Versión Mínima | Propósito |
|-------------|----------------|-----------|
| Go | 1.22+ | Compilación del backend |
| Node.js | 18+ | Herramientas de compilación del frontend |
| npm | 9+ | Gestión de dependencias del frontend |
| CLI de Wails | v2.12+ | Compilación de la aplicación |

Instale la CLI de Wails:

```bash
go install github.com/wailsapp/wails/v2/cmd/wails@latest
```

---

## Primeros Pasos

### Clonar el repositorio

```bash
git clone https://github.com/jonasmarques/Mixko.git
cd Mixko
```

### Instalar dependencias del frontend

```bash
cd frontend
npm install
cd ..
```

### Ejecutar en modo de desarrollo

```bash
wails dev
```

---

## Licencia

Este software está licenciado bajo la Licencia MIT.

---

## Créditos y Agradecimientos

Agradecimientos especiales a todos los proyectos de código abierto y colaboradores que hacen posible Mixko:

- **[Bluesky Social & Proyecto Indigo](https://github.com/bluesky-social/indigo):** Por el desarrollo del [AT Protocol](https://atproto.com/) y la biblioteca oficial `indigo` en Go.
- **[Wails Framework](https://wails.io/):** Por el compilador e infraestructura multiplataforma de Go + Webview.
- **[ModernC SQLite](https://gitlab.com/cznic/sqlite):** Por la implementación de SQLite en Go puro.
- **[HLS.js](https://github.com/video-dev/hls.js/):** Por el soporte de reproducción y streaming de videos HLS en la interfaz.
- **[Vite](https://vitejs.dev/) & [TypeScript](https://www.typescriptlang.org/):** Por la infraestructura de desarrollo del frontend.
- **Agradecimientos especiales:** Cassiano Abreu y Carla Marx por sus pruebas y comentarios como beta testers.

---

## Invítame un café

Este software es y siempre será gratuito y de código abierto. Sin embargo, se desarrolla en mi escaso tiempo libre y tal vez por esa razón no tenga el refinamiento de estado del arte exacto que me gustaría. De todos modos, si usted quiere y puede apoyar el proyecto, quién soy yo para impedírselo. El apoyo se puede realizar mediante los siguientes medios:

- **Pix:** [Haga clic aquí para enviar un Pix](https://nubank.com.br/cobrar/futyp1/6a316637-8282-4bf0-b3d6-2c58cd82eed2)
- **Tarjeta de débito o crédito:** [Haga clic aquí en Mercado Pago](https://link.mercadopago.com.br/mixco)
