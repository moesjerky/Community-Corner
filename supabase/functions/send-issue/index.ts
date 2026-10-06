// Emails a published issue to every active subscriber, using Resend.
// Called from /admin. Only admins can run it. Each issue is emailed once.
import { createClient } from "npm:@supabase/supabase-js@2";

const SITE = "https://community-corner.org";
const FROM = "Community Corner <news@community-corner.org>";
const REPLY_TO = "submissions@ourcommunitycorner.com";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const esc = (s: string) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

function emailHtml(issue: any, cover: string, pdf: string, unsub: string) {
  const title = `Issue #${issue.num}${issue.title ? ": " + issue.title : ""}`;
  const times = issue.yomtov
    ? `<p style="margin:0 0 18px;font:15px Arial,sans-serif;color:#24192E">Candle lighting <b style="color:#C3262E">${esc(issue.yomtov)}</b>${issue.tzais ? ` &nbsp;·&nbsp; Tzais <b style="color:#C3262E">${esc(issue.tzais)}</b>` : ""}</p>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#F5EEDC">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5EEDC"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFDF7;border:3px solid #24192E">
<tr><td style="background:#C3262E;padding:16px 20px"><img src="${SITE}/img/cc-logo.png" alt="Community Corner" width="160" style="display:block;height:auto"></td></tr>
<tr><td style="padding:24px 22px">
<p style="margin:0 0 6px;font:bold 13px Arial,sans-serif;letter-spacing:1px;color:#3F6B34;text-transform:uppercase">This week's paper is here</p>
<h1 style="margin:0 0 14px;font:bold 26px Arial,sans-serif;color:#24192E">${esc(title)}</h1>
${times}
<a href="${SITE}/#${issue.num}"><img src="${cover}" alt="Cover of issue ${issue.num}" width="516" style="display:block;width:100%;max-width:516px;height:auto;border:2px solid #24192E"></a>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:20px"><tr>
<td style="background:#24192E;padding:12px 20px"><a href="${SITE}/#${issue.num}" style="font:bold 16px Arial,sans-serif;color:#F5EEDC;text-decoration:none">Read online</a></td>
<td width="10"></td>
<td style="background:#C3262E;padding:12px 20px"><a href="${pdf}" style="font:bold 16px Arial,sans-serif;color:#fff;text-decoration:none">Download PDF</a></td>
</tr></table>
</td></tr>
<tr><td style="padding:14px 22px;border-top:1px solid #E0D2B4;font:12px Arial,sans-serif;color:#6A5D70">
You're getting this because you subscribed at community-corner.org. <a href="${unsub}" style="color:#6A5D70">Unsubscribe</a>
</td></tr></table></td></tr></table></body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const db = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) return json({ error: "RESEND_API_KEY secret is missing" }, 500);

    // Only admins
    const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const { data: u } = await db.auth.getUser(jwt);
    const me = u?.user?.email?.toLowerCase();
    if (!me) return json({ error: "Please log in again" }, 401);
    const { data: admin } = await db.from("admins").select("email").ilike("email", me).maybeSingle();
    if (!admin) return json({ error: "Not an admin" }, 403);

    const { num, test } = await req.json();
    const { data: issue } = await db.from("issues").select("*").eq("num", num).single();
    if (!issue) return json({ error: "Issue not found" }, 404);
    if (!test && !issue.published) return json({ error: "Publish the issue first" }, 400);
    if (!test && issue.emailed_at) return json({ error: "This issue was already emailed", emailed_at: issue.emailed_at }, 409);

    const subs = test
      ? [{ email: me, token: "00000000-0000-0000-0000-000000000000" }]
      : (await db.from("subscribers").select("email,token").eq("unsubscribed", false)).data ?? [];
    if (!subs.length) return json({ sent: 0 });

    const base = `${url}/storage/v1/object/public/issues/${num}`;
    const subject = `${test ? "[TEST] " : ""}Community Corner #${num}${issue.title ? ": " + issue.title : ""}`;
    let sent = 0;
    for (let i = 0; i < subs.length; i += 100) {
      const batch = subs.slice(i, i + 100).map((s: any) => {
        const unsub = `${SITE}/unsubscribe.html?t=${s.token}`;
        return {
          from: FROM, to: [s.email], reply_to: REPLY_TO, subject,
          html: emailHtml(issue, `${base}/cover.jpg`, `${base}/issue.pdf`, unsub),
          headers: { "List-Unsubscribe": `<${unsub}>` },
        };
      });
      const r = await fetch("https://api.resend.com/emails/batch", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(batch),
      });
      if (!r.ok) return json({ error: `Resend said: ${await r.text()}`, sent }, 502);
      sent += batch.length;
    }
    if (!test) await db.from("issues").update({ emailed_at: new Date().toISOString() }).eq("num", num);
    return json({ sent, test: !!test });
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
