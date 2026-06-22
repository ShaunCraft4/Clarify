# Clarify auth email templates

Supabase sends password-reset and signup emails by default with **Supabase Auth** branding. To use **Clarify** branding instead, you customize the templates in Supabase.

## Where to find it

Supabase Dashboard → **Authentication** → **Emails**

You should see two tabs:

| Tab | Purpose |
| --- | --- |
| **Templates** | Edit subject + HTML body (Reset password, Confirm signup, …) |
| **SMTP Settings** | Connect your mail provider |

It is **not** under Project Settings or the SQL editor.

## Important: SMTP required to edit templates

Supabase shows a banner: *“Set up custom SMTP to edit templates.”*

That means:

- **Without SMTP** — emails still work, but you get Supabase’s default look (“Supabase Auth”, “powered by Supabase”). Templates are **read-only**.
- **With SMTP** — you can click each template (e.g. **Reset password**), edit subject/body, and set sender name to **Clarify**.

So branded emails require **one-time SMTP setup first**, then paste the HTML below.

## 1. Set up SMTP (do this first)

1. Go to **Authentication → Emails → SMTP Settings**
2. Click **Set up SMTP** (or enable custom SMTP)
3. Fill in your provider’s details

### Easiest free option: Resend

1. Sign up at [resend.com](https://resend.com) (free tier is enough for personal use)
2. Create an API key
3. In Supabase SMTP Settings:

| Field | Value |
| --- | --- |
| Host | `smtp.resend.com` |
| Port | `465` (SSL) or `587` (TLS) |
| Username | `resend` |
| Password | Your Resend API key |
| Sender name | `Clarify` |
| Sender email | An address on a domain you verified in Resend (e.g. `onboarding@resend.dev` for testing) |

4. Save and send a test email if Supabase offers one

**Gmail** works too (App Password + `smtp.gmail.com`) — fine for solo local testing.

## 2. Reset password template

After SMTP is enabled:

1. **Authentication → Emails → Templates**
2. Click **Reset password**
3. Set **Subject** to:

   ```text
   Reset your Clarify password
   ```

4. Replace the **Message body** with the full contents of [`recovery.html`](./recovery.html)
5. Save

## 3. Confirm signup (optional)

Only if **Confirm email** is on under **Authentication → Sign In / Providers → Email**.

1. Click **Confirm sign up**
2. **Subject:** `Confirm your Clarify account`
3. **Body:** paste [`confirmation.html`](./confirmation.html)
4. Save

## Template variables

Do not remove these — Supabase fills them in:

| Variable | Purpose |
| --- | --- |
| `{{ .ConfirmationURL }}` | Reset / confirm link |
| `{{ .Email }}` | User’s email address |
| `{{ .SiteURL }}` | Your Site URL (`http://localhost:3000`) |

## Logo

Templates use a blue **“C”** mark so no hosted image is required. To use a real logo, host a PNG and replace the header with `<img src="…" alt="Clarify" width="120">`.

## Skip branding?

If you only use Clarify locally and don’t want SMTP setup, **forgot password still works** — users just get the default Supabase-styled email. Branding is optional polish, not required for the feature to function.
