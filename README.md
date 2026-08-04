# Mixko

Mixko é um aplicativo multiplataforma alternativo para o Bluesky cujo foco principal é a acessibilidade para pessoas cegas e com baixa visão.

A ideia é fornecer navegação completa com teclas de atalho, recursos de ampliação e destaque e uma interface limpa e semanticamente organizada.


---

## Índice

- [Visão Geral](#visão-geral)
- [Downloads](#downloads)
- [Arquitetura](#arquitetura)
- [Pré-requisitos](#pré-requisitos)
- [Começando](#começando)
- [Licença](#licença)
- [Créditos e Agradecimentos](#créditos-e-agradecimentos)
- [Doe-me um café](#doe-me-um-café)

---

## Visão Geral

O Mixko é um cliente alternativo para a rede Bluesky com integração total ao AT Protocol e praticamente todas as funcionalidades do aplicativo oficial. Através dele, pessoas cegas e com baixa visão podem enviar postagens, responder, curtir, repostar, quotar posts, gerenciar DMs/chats e explorar feeds. O diferencial está no fato de que tudo isso é possível de ser feito utilizando apenas o teclado ou ambiente ampliado.

**Recursos principais:**

- Navegação na timeline e feeds personalizados
- Criação de postagens com suporte a texto, imagens, vídeos, citações (quote) e respostas
- Notificações em tempo real
- Mensagens diretas (Bluesky Chat / DMs)
- Visualização de perfis e gerenciamento de seguidores e bloqueios
- Gerenciamento de listas e pacotes iniciais (*starter packs*)
- Pesquisa de postagens e usuários
- Preferências de moderação de conteúdo e palavras silenciadas
- Suporte a atalhos de teclado em toda a interface (consulte o [atalhos.md](atalhos.md))

---

## Downloads

> **Nota 1 (macOS):** O pobre desenvolvedor de tão singela aplicação não possui um Mac OS para testá-la no ambiente, tampouco foi capaz de achar alguém que pudesse ser beta tester. Se você encontrar algum problema, reporte-o como PR e eu o corrigirei assim que possível.

> **Nota 2 (Windows):** O aplicativo é um encapsulado webview, porém não possui um certificado. Isso significa que muito provavelmente você verá a tela do SmartScreen do Windows ao abrir o app. Basta clicar em "Mais informações" e depois em "Executar assim mesmo". Não se preocupe, não há qualquer tipo de malware, apenas não pude pagar 99 USD por um certificado para o aplicativo.


O Mixko está disponível para Linux, Windows e Mac. [Baixe-o aqui](https://github.com/jonasmarques/Mixko/releases)




---

## Arquitetura

O Mixko utiliza o framework **Wails v2**, que incorpora o frontend como um pacote de ativos estáticos dentro do binário Go compilado. A camada Go expõe métodos tipados para o frontend por meio da ponte IPC do Wails. 

- **Backend:** Desenvolvido em Go 1.26 com suporte a persistência segura em SQLite criptografado (AES-256-GCM) usando `modernc.org/sqlite`.
- **Frontend:** Desenvolvido em Vite + TypeScript com suporte a leitores de tela e navegação por teclado.
- **Protocolo:** Integração com a rede Bluesky via biblioteca oficial [Indigo](https://github.com/bluesky-social/indigo).

---

## Pré-requisitos

| Ferramenta | Versão Mínima | Propósito |
|------------|---------------|-----------|
| Go | 1.22+ | Compilação do backend |
| Node.js | 18+ | Ferramentas de compilação do frontend |
| npm | 9+ | Gerenciamento de dependências do frontend |
| CLI do Wails | v2.12+ | Compilação do aplicativo |

Instale a CLI do Wails:

```bash
go install github.com/wailsapp/wails/v2/cmd/wails@latest
```

---

## Começando

### Clonar o repositório

```bash
git clone https://github.com/jonasmarques/Mixko.git
cd Mixko
```

### Instalar dependências do frontend

```bash
cd frontend
npm install
cd ..
```

### Executar em modo de desenvolvimento

```bash
wails dev
```

---

## Licença

Este software é licenciado sob a Licença MIT.

---

## Créditos e Agradecimentos

Agradecimentos especiais a todos os projetos de código aberto e colaboradores que tornam o Mixko possível:

- **[Bluesky Social & Projeto Indigo](https://github.com/bluesky-social/indigo):** Pelo desenvolvimento do [AT Protocol](https://atproto.com/) e pela biblioteca oficial `indigo` em Go.
- **[Wails Framework](https://wails.io/):** Pelo compilador e infraestrutura multiplataforma Go + Webview.
- **[ModernC SQLite](https://gitlab.com/cznic/sqlite):** Pela implementação do SQLite em Go puro.
- **[HLS.js](https://github.com/video-dev/hls.js/):** Pelo suporte a reprodução e streaming de vídeos HLS na interface.
- **[Vite](https://vitejs.dev/) & [TypeScript](https://www.typescriptlang.org/):** Pela infraestrutura de desenvolvimento do frontend.
- **Agradecimentos especiais:** Cassiano Abreu e Carla Marx pelos testes e feedbacks como beta testers.

---

## Doe-me um café

Este software é e sempre será gratuito e de código aberto.  Porém ele é desenvolvido no meu pouco  tempo  livre e talvez por isso não tenha o exato refinamento em estado da arte que eu gostaria. De todo modo, se você quiser e puder apoiar o projeto, quem sou eu para  te impedir. O apoio pode ser feito pelos seguintes meios:

- **Pix:** [Clique aqui para enviar um Pix](https://nubank.com.br/cobrar/futyp1/6a316637-8282-4bf0-b3d6-2c58cd82eed2)
- **Cartão de débito ou crédito:** [Clique aqui no Mercado Pago](https://link.mercadopago.com.br/mixco)