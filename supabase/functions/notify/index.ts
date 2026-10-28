// Sends the team alerts by email (through Resend):
//   - every new subscriber and every message sent from the website, as they come in
//   - one summary each morning: visitors, top pages, new subscribers, messages
// Called every few minutes by a database timer (pg_cron). Safe to call by anyone: it only sends what hasn't been sent yet,
// and the summary at most once a day.
import { createClient } from "npm:@supabase/supabase-js@2";

const TO = ["moshbeils@gmail.com", "submissions@ourcommunitycorner.com"];
const FROM = "Community Corner <news@community-corner.org>";
const SITE = "https://community-corner.org";
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });

// every alert uses the same frame: navy banner with the logo, white card, gold label, and a button to the admin
function shell(label: string, body: string, button = { text: "Open admin", href: `${SITE}/admin/` }) {
  return `<!doctype html><html><head><meta name="color-scheme" content="light"></head>
<body style="margin:0;padding:0;background:#EDE5D0">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EDE5D0"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
<tr><td style="background:#0B1F3A;padding:22px 26px;border-bottom:5px solid #F6E58D">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
    <td><img src="${SITE}/img/cc-logo.png" width="150" alt="The Community Corner" style="display:block;height:auto;border:0"></td>
    <td align="right" style="font:bold 11px Arial,sans-serif;letter-spacing:2px;text-transform:uppercase;color:#F6E58D">${esc(label)}</td>
  </tr></table></td></tr>
<tr><td style="background:#ffffff;padding:30px 28px 26px;font:15px/1.55 Arial,sans-serif;color:#0B1F3A">${body}
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:26px"><tr>
    <td style="background:#0E4C8A"><a href="${button.href}" style="display:inline-block;padding:13px 24px;font:bold 15px Arial,sans-serif;color:#ffffff;text-decoration:none">${esc(button.text)} &rarr;</a></td>
  </tr></table></td></tr>
<tr><td style="padding:16px 6px;font:12px/1.5 Arial,sans-serif;color:#6A5D70;text-align:center">Sent by the community-corner.org alert robot</td></tr>
</table></td></tr></table></body></html>`;
}
const head = (kick: string, big: string) =>
  `<div style="font:bold 12px Arial,sans-serif;letter-spacing:2px;text-transform:uppercase;color:#C3262E">${esc(kick)}</div><div style="font:bold 28px/1.15 Arial,sans-serif;color:#0B1F3A;margin:6px 0 18px">${big}</div>`;
const row = (k: string, v: unknown) => v ? `<tr><td style="padding:9px 14px 9px 0;border-top:1px solid #EEF0F3;color:#667180;font:13px Arial,sans-serif;white-space:nowrap;vertical-align:top;width:110px">${esc(k)}</td><td style="padding:9px 0;border-top:1px solid #EEF0F3;font:bold 15px Arial,sans-serif;color:#0B1F3A">${esc(v)}</td></tr>` : "";
const facts = (rows: string) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-bottom:1px solid #EEF0F3">${rows}</table>`;

async function send(key: string, subject: string, html: string, replyTo?: string) {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to: TO, subject, html, ...(replyTo && /@/.test(replyTo) ? { reply_to: replyTo } : {}) }),
  });
  if (!r.ok) throw new Error(`Resend: ${await r.text()}`);
  await new Promise((ok) => setTimeout(ok, 600)); // Resend allows 2 a second
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type" } });
  try {
    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const key = Deno.env.get("RESEND_API_KEY");
    if (!key) return json({ error: "RESEND_API_KEY missing" }, 500);
    const out = { subscribers: 0, messages: 0, summary: false };

    // 1) new subscribers
    const subs = (await db.from("subscribers").select("*").is("notified_at", null).order("created_at").limit(20)).data ?? [];
    for (const s of subs) {
      await send(key, `New subscriber: ${s.name || s.email}`, shell("New subscriber",
        head("New subscriber", `${esc(s.name || s.email)} just signed up`) +
        facts(`${row("Name", s.name)}${row("Email", s.email)}${row("Phone", s.phone)}${row("Address", s.address)}${row("Shul", s.shul)}${row("Heard from", s.heard)}`) +
        `<p style="margin:16px 0 0;font:14px Arial,sans-serif;color:#667180">Hit Reply to write back to them.</p>`,
        { text: "See all subscribers", href: `${SITE}/admin/` }), s.email);
      await db.from("subscribers").update({ notified_at: new Date().toISOString() }).eq("email", s.email);
      out.subscribers++;
    }

    // 2) new messages from the website
    const msgs = (await db.from("submissions").select("*").is("notified_at", null).order("created_at").limit(20)).data ?? [];
    for (const m of msgs) {
      let photo = "";
      if (m.photo) { const u = await db.storage.from("submissions").createSignedUrl(m.photo, 60 * 60 * 24 * 7); if (u.data) photo = `<p style="margin:16px 0 0"><a href="${u.data.signedUrl}"><img src="${u.data.signedUrl}" width="220" alt="Photo they sent" style="display:block;border:3px solid #0B1F3A;max-width:100%;height:auto"></a><span style="font:12px Arial,sans-serif;color:#667180">Photo link works for 7 days</span></p>`; }
      await send(key, `New message: ${m.kind} from ${m.name}`, shell("New message",
        head(m.kind, `From ${esc(m.name)}`) + facts(`${row("Contact", m.contact)}`) +
        `<div style="white-space:pre-wrap;margin:18px 0 0;padding:16px 18px;background:#F5F6F8;border-left:5px solid #F6E58D;font:15px/1.6 Arial,sans-serif;color:#0B1F3A">${esc(m.message)}</div>${photo}`,
        { text: "Open the Inbox", href: `${SITE}/admin/` }), m.contact);
      await db.from("submissions").update({ notified_at: new Date().toISOString() }).eq("id", m.id);
      out.messages++;
    }

    // 3) morning summary, once a day, at 8 AM New York time or later
    const ny = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
    const today = ny.toISOString().slice(0, 10);
    const st = (await db.from("settings").select("value").eq("key", "notify_state").maybeSingle()).data?.value ?? {};
    if (ny.getHours() >= 8 && st.summary !== today) {
      const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const visits = (await db.from("visits").select("event,path,vid,mobile").gte("at", since).limit(20000)).data ?? [];
      const people = new Set(visits.map((v) => v.vid).filter(Boolean)).size;
      const phones = visits.filter((v) => v.mobile).length;
      const reads = new Map<string, number>();
      visits.filter((v) => v.event === "read").forEach((v) => reads.set(v.path, (reads.get(v.path) || 0) + 1));
      const top = [...reads].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([p, n]) => `<li><b>Issue #${esc(p)}</b> <span style="color:#667180">· ${n} read${n === 1 ? "" : "s"}</span></li>`).join("") || "<li>No issues opened</li>";
      const pdfs = visits.filter((v) => v.event === "pdf").length;
      const newSubs = (await db.from("subscribers").select("email", { count: "exact", head: true }).gte("created_at", since)).count ?? 0;
      const allSubs = (await db.from("subscribers").select("email", { count: "exact", head: true }).eq("unsubscribed", false)).count ?? 0;
      const newMsgs = (await db.from("submissions").select("id", { count: "exact", head: true }).gte("created_at", since)).count ?? 0;
      const big = (n: number, l: string, bg: string, fg: string) => `<td width="25%" style="padding:4px"><div style="background:${bg};padding:16px 6px 12px;text-align:center"><div style="font:bold 34px/1 Arial,sans-serif;color:${fg}">${n}</div><div style="font:bold 10px Arial,sans-serif;letter-spacing:1.5px;text-transform:uppercase;color:${fg};margin-top:6px">${l}</div></div></td>`;
      const dateTxt = ny.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
      await send(key, `Yesterday on the site: ${people} visitor${people === 1 ? "" : "s"}, ${newSubs} new subscriber${newSubs === 1 ? "" : "s"}`, shell("Daily summary",
        head(dateTxt, "The last 24 hours") +
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${big(people, "Visitors", "#0B1F3A", "#F6E58D")}${big(visits.length, "Page views", "#0E4C8A", "#ffffff")}${big(newSubs, "New subs", "#C3262E", "#ffffff")}${big(newMsgs, "Messages", "#F6E58D", "#0B1F3A")}</tr></table>
        <div style="font:bold 12px Arial,sans-serif;letter-spacing:2px;text-transform:uppercase;color:#C3262E;margin:24px 0 8px">Most read</div>
        <ol style="margin:0 0 14px;padding-left:22px;font:15px/1.8 Arial,sans-serif">${top}</ol>` +
        facts(`${row("PDF downloads", pdfs)}${row("On phones", phones ? `${phones} views` : "")}${row("Subscribers", allSubs)}`),
        { text: "Open Analytics", href: `${SITE}/admin/` }));
      await db.from("settings").upsert({ key: "notify_state", value: { ...st, summary: today } });
      out.summary = true;
    }
    return json(out);
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
