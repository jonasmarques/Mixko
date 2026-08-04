# Contribuindo para o Mixko

Obrigado pelo seu interesse em contribuir para o Mixko. Este documento descreve o fluxo de trabalho de desenvolvimento, os padrões de codificação e o processo para envio de alterações.

---

## Configuração de Desenvolvimento

Siga a seção [Começando](README.md#começando) do README para configurar o projeto localmente antes de fazer qualquer alteração.

---

## Estratégia de Branching

- `main` é a branch estável. Todas as versões (releases) são geradas a partir dela.
- Branches de funcionalidades devem seguir o padrão `feature/<descricao-curta>`.
- Branches de correção de bugs devem seguir o padrão `fix/<descricao-curta>`.

Crie uma branch a partir da versão mais recente da `main`:

```bash
git checkout main
git pull
git checkout -b feature/minha-funcionalidade
```

---

## Antes de Enviar um Pull Request

Todo pull request deve passar pelas seguintes verificações antes de ser revisado.

### Backend (Go)

```bash
go build ./...
```

A compilação deve sair com código 0 e não produzir erros ou avisos.

### Frontend (TypeScript)

```bash
cd frontend
npm run build
```

O compilador TypeScript (`tsc`) e o empacotador Vite devem ser concluídos sem erros. Erros de tipo são tratados como problemas bloqueantes.

Não declare uma tarefa concluída ou abra um pull request sem executar os dois comandos e confirmar uma saída limpa.

---

## Padrões de Codificação em Go

### Tratamento de erros

Cada erro deve ser tratado explicitamente. Não descarte erros silenciosamente com o identificador em branco (`_`), a menos que a lógica circundante torne o descarte explicitamente intencional e isso seja documentado com um comentário explicando o motivo.

```go
// Aceitável: erro de logout do servidor não é crítico, o estado local é sempre limpo.
_ = s.clientMgr.WithClient(ctx, func(c *xrpc.Client) error {
    return atproto.ServerDeleteSession(ctx, c)
})
```

Sempre envolva os erros com contexto usando `fmt.Errorf`:

```go
return fmt.Errorf("falha ao salvar a sessão: %w", err)
```

### Dependências

Não introduza novas dependências de módulo Go sem discussão prévia. Prefira usar a biblioteca padrão e os pacotes já declarados em `go.mod`. Se uma nova dependência for genuinamente necessária, documente o motivo na descrição do pull request.

### Comentários

Não adicione comentários que reafirmem o que o código faz. Os comentários devem explicar a intenção, casos extremos ou decisões de design não óbvias. Não deixe blocos de código comentados em alterações enviadas.

---

## Padrões de Codificação em TypeScript

### Segurança de tipos

O tipo `any` é proibido. Toda variável, valor de retorno de função e carga útil (payload) de API deve ter um tipo explícito ou interface. Use os tipos DTO gerados pelo Wails ou defina novas interfaces no diretório `types/`.

```typescript
// Proibido
function render(post: any): void { ... }

// Obrigatório
function render(post: PostDTO): void { ... }
```

### Chamadas de serviço

Sempre chame funções do backend por meio das ligações geradas pelo Wails disponíveis em `frontend/wailsjs/`. Não construa chamadas de fetch manuais ou use `XMLHttpRequest` para se comunicar com o backend.

### Acesso ao DOM

Centralize as referências de elementos DOM em `config/dom.ts`. Não chame `document.getElementById` ou `document.querySelector` de forma improvisada ao longo dos arquivos dos controladores.

---

## Processo de Pull Request

1. Certifique-se de que sua branch está atualizada com a `main` antes de abrir o PR.
2. Execute `go build ./...` e `npm run build` e confirme a saída limpa.
3. Escreva uma descrição clara para o PR que explique o que a alteração faz e por que é necessária.
4. Faça referência a quaisquer issues relacionadas usando `Fixes #<issue>` ou `Closes #<issue>`.
5. Mantenha os pull requests focados. Uma alteração lógica por PR torna a revisão mais rápida.
6. Não adicione alterações de formatação ou refatorações não relacionadas a um PR funcional.

---

## Relatando Bugs

Abra uma issue no GitHub e inclua:

- Uma descrição do comportamento observado
- Passos para reproduzir
- Comportamento esperado
- Seu sistema operacional e versão do Go (`go version`)
- Qualquer saída de erro relevante do aplicativo ou terminal
