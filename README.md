# Aura Barbearia — App de agendamento

App próprio da Aura Barbearia (substitui o app pago). Funciona no navegador e **instala no celular** como aplicativo (PWA), sem precisar de loja.

**Tecnologias:** React + Vite + Tailwind · Supabase (banco, login, Edge Functions) · Mercado Pago (PIX e cartão) · GitHub Pages (hospedagem grátis)

## O que o app faz

**Cliente**
- Cadastro (nome, e-mail, telefone) e login, recuperação de senha
- Página da barbearia: serviços com busca, detalhes (sobre, comodidades, horários, endereço, formas de pagamento, WhatsApp), profissionais
- Agendamento: serviço → profissional (ou “qualquer um”) → calendário com horários livres → confirmação
- Pagamento pelo app: **PIX** (QR Code + copia e cola, confirmação automática) ou **cartão de crédito/débito** (Checkout Mercado Pago), ou escolher pagar na barbearia
- Meus agendamentos: próximos / histórico, pagar, cancelar (respeitando a antecedência mínima)

**Administração** (`/admin`, ou botão “Gestão” na tela inicial)
- **Painel:** atendimentos do dia, recebido hoje/mês, valores a receber
- **Agenda:** calendário diário em colunas por profissional (ou lista), bloqueio de horários (folga, feriado), agendamento pelo balcão, inclusive para cliente sem cadastro
- **Dar baixa:** ao abrir um agendamento, registre o pagamento presencial (dinheiro, PIX, débito, crédito), com valor ajustável. O admin pode desfazer uma baixa.
- **Financeiro:** receitas, despesas, lucro, ticket médio, gráfico por dia, divisão por forma de pagamento e por profissional, despesas por categoria, lista “a receber”, exportação para CSV (Excel)
- **Clientes:** busca, histórico, total gasto, WhatsApp, permissões (Cliente / Barbeiro / Administrador)
- **Serviços** e **Equipe:** cadastrar, editar, ativar e desativar
- **Ajustes:** dados da barbearia, horário de funcionamento com intervalo, regras de agendamento, comodidades, liga/desliga pagamento online

Os 19 serviços do app atual já vêm cadastrados com os mesmos preços e durações.

**Perfis de acesso:** *Barbeiro* vê o painel, a agenda e os clientes, e pode dar baixa. *Administrador* tem acesso total, incluindo o financeiro e os ajustes.

---

## Passo a passo de instalação

### 1. Banco de dados (Supabase)
1. Abra o projeto da barbearia no Supabase → **SQL Editor** → **New query**
2. Cole todo o conteúdo de [`supabase/migrations/20261116000000_init.sql`](supabase/migrations/20261116000000_init.sql) e clique em **Run**
3. Em **Authentication → URL Configuration**:
   - **Site URL:** a URL do app (ex.: `https://SEU-USUARIO.github.io/aura-barbearia/`)
   - **Redirect URLs:** adicione a mesma URL e `http://localhost:5173/`
4. *(Opcional, recomendado)* Em **Authentication → Sign In / Providers → Email**, desative **Confirm email** para o cliente entrar logo após o cadastro, sem precisar confirmar o e-mail.

### 2. Criar o administrador
1. Abra o app e crie sua conta normalmente em **Cadastre-se**
2. No **SQL Editor** do Supabase, rode o comando abaixo (troque pelo seu e-mail):
   ```sql
   update public.profiles set role = 'admin' where email = 'SEU-EMAIL@exemplo.com';
   ```
3. Saia e entre de novo no app: aparecerá o botão **Gestão**.
4. Em **Equipe**, renomeie o “Profissional Aura” e cadastre os barbeiros. Em **Ajustes**, confira os horários (vêm como seg–sex 9h–19h e sáb 9h–18h) e informe o WhatsApp.

### 3. Pagamentos (Mercado Pago)
1. Acesse <https://www.mercadopago.com.br/developers/panel/app> → **Criar aplicação** (tipo: Pagamentos online / Checkout Pro)
2. Copie o **Access Token** (comece pelo de **teste**; depois troque pelo de **produção**)
3. Publique as Edge Functions. Pelo terminal, nesta pasta:
   ```bash
   npx supabase login
   npx supabase link --project-ref SEU_PROJECT_REF
   npx supabase functions deploy create-payment
   npx supabase functions deploy mp-webhook --no-verify-jwt
   npx supabase secrets set MP_ACCESS_TOKEN=APP_USR-xxxx SITE_URL=https://SEU-USUARIO.github.io/aura-barbearia
   ```
   *(Você também pode criar as funções pelo painel do Supabase, em Edge Functions → Deploy a new function, colando o código de `supabase/functions/*/index.ts`. No `mp-webhook`, desligue a opção “Verify JWT”.)*
4. No painel do Mercado Pago → sua aplicação → **Webhooks**:
   - URL: `https://SEU_PROJECT_REF.supabase.co/functions/v1/mp-webhook`
   - Evento: **Pagamentos**
   - Copie a **assinatura secreta** e rode `npx supabase secrets set MP_WEBHOOK_SECRET=xxxx`
5. Para receber PIX, a conta Mercado Pago precisa ter uma **chave PIX cadastrada**.

> Taxas: o Mercado Pago cobra por transação (PIX costuma ser a mais barata). Confira as tarifas na sua conta.

### 4. Publicar pelo GitHub (grátis)
1. Envie o código para o repositório:
   ```bash
   git remote add origin https://github.com/SEU-USUARIO/SEU-REPO.git
   git push -u origin main
   ```
2. No GitHub → **Settings → Secrets and variables → Actions → New repository secret**, crie:
   - `VITE_SUPABASE_URL` → Supabase › Project Settings › API › Project URL
   - `VITE_SUPABASE_ANON_KEY` → a chave **anon** / **publishable** (nunca a `service_role`)
3. **Settings → Pages → Source: GitHub Actions**
4. A cada `git push` na branch `main`, o app é publicado automaticamente em `https://SEU-USUARIO.github.io/SEU-REPO/`

### 5. Instalar no celular
Abra a URL do app → **iPhone:** Compartilhar › *Adicionar à Tela de Início* · **Android:** menu ⋮ › *Instalar app*.

---

## Rodar no computador (desenvolvimento)
```bash
cp .env.example .env    # preencha a URL e a anon key
npm install
npm run dev             # http://localhost:5173
```

## Estrutura
```
src/
  pages/            telas do cliente (Home, Book, MyAppointments, Profile, Auth)
  pages/admin/      painel (Dashboard, Agenda, Finance, Clients, Services, Team, Settings)
  components/       UI, calendário, pagamento, layouts
  lib/              supabase, tipos, formatação, cálculo de horários
supabase/
  migrations/       schema + segurança (RLS) + dados iniciais
  functions/        create-payment (gera PIX/checkout) e mp-webhook (confirma pagamento)
```

## Segurança
- Toda tabela tem **Row Level Security**: cada cliente só vê os próprios agendamentos e pagamentos
- Preço e duração do agendamento são calculados **no banco**, nunca vêm do aplicativo
- O banco impede dois agendamentos no mesmo horário para o mesmo profissional
- Pagamentos online só são marcados como pagos depois de consultar o Mercado Pago (o webhook não confia no conteúdo da notificação)
- Só o administrador altera permissões de usuários
