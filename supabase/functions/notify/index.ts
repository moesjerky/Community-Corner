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

function shell(title: string, body: string) {
  return `<!doctype html><html><body style="margin:0;background:#F5EEDC;font:15px/1.5 Arial,sans-serif;color:#0B1F3A">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:20px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border:3px solid #0B1F3A">
<tr><td style="background:#0B1F3A;padding:14px 20px;font:bold 13px Arial;letter-spacing:2px;color:#F6E58D;text-transform:uppercase">Community Corner · ${esc(title)}</td></tr>
<tr><td style="padding:20px 22px">${body}</td></tr>
<tr><td style="padding:12px 22px;border-top:1px solid #E2E6EB;font:12px Arial;color:#667180"><a href="${SITE}/admin/" style="color:#0E4C8A">Open admin</a></td></tr>
</table></td></tr></table></body></html>`;
}
const row = (k: string, v: unknown) => v ? `<tr><td style="padding:4px 12px 4px 0;color:#667180;white-space:nowrap;vertical-align:top">${esc(k)}</td><td style="padding:4px 0"><b>${esc(v)}</b></td></tr>` : "";

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
      await send(key, `New subscriber: ${s.name || s.email}`, shell("New subscriber", `<h2 style="margin:0 0 12px;font-size:22px">Someone just subscribed</h2>
<table>${row("Name", s.name)}${row("Email", s.email)}${row("Phone", s.phone)}${row("Address", s.address)}${row("Shul", s.shul)}${row("Heard from", s.heard)}</table>`), s.email);
      await db.from("subscribers").update({ notified_at: new Date().toISOString() }).eq("email", s.email);
      out.subscribers++;
    }

    // 2) new messages from the website
    const msgs = (await db.from("submissions").select("*").is("notified_at", null).order("created_at").limit(20)).data ?? [];
    for (const m of msgs) {
      let photo = "";
      if (m.photo) { const u = await db.storage.from("submissions").createSignedUrl(m.photo, 60 * 60 * 24 * 7); if (u.data) photo = `<p><a href="${u.data.signedUrl}" style="color:#0E4C8A">See the photo they sent</a> (link works for 7 days)</p>`; }
      await send(key, `New message: ${m.kind} from ${m.name}`, shell("New message", `<h2 style="margin:0 0 12px;font-size:22px">${esc(m.kind)}</h2>
<table>${row("From", m.name)}${row("Contact", m.contact)}</table>
<div style="white-space:pre-wrap;margin:14px 0;padding:12px 14px;background:#F5F6F8;border-left:4px solid #0E4C8A">${esc(m.message)}</div>${photo}`), m.contact);
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
      const top = [...reads].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([p, n]) => `<li>Issue #${esc(p)}: ${n} read${n === 1 ? "" : "s"}</li>`).join("") || "<li>No issues opened</li>";
      const pdfs = visits.filter((v) => v.event === "pdf").length;
      const newSubs = (await db.from("subscribers").select("email", { count: "exact", head: true }).gte("created_at", since)).count ?? 0;
      const allSubs = (await db.from("subscribers").select("email", { count: "exact", head: true }).eq("unsubscribed", false)).count ?? 0;
      const newMsgs = (await db.from("submissions").select("id", { count: "exact", head: true }).gte("created_at", since)).count ?? 0;
      const big = (n: number, l: string) => `<td style="padding:10px 8px;text-align:center;border:2px solid #0B1F3A"><div style="font:bold 30px Arial;color:#0E4C8A">${n}</div><div style="font:bold 11px Arial;letter-spacing:1px;text-transform:uppercase;color:#667180">${l}</div></td>`;
      await send(key, `Yesterday on the site: ${people} visitor${people === 1 ? "" : "s"}, ${newSubs} new subscriber${newSubs === 1 ? "" : "s"}`, shell("Daily summary", `<h2 style="margin:0 0 14px;font-size:22px">The last 24 hours</h2>
<table width="100%" cellspacing="6"><tr>${big(people, "Visitors")}${big(visits.length, "Page views")}${big(newSubs, "New subs")}${big(newMsgs, "Messages")}</tr></table>
<p style="margin:16px 0 6px"><b>Most read</b></p><ul style="margin:0;padding-left:20px">${top}</ul>
<table style="margin-top:14px">${row("PDF downloads", pdfs)}${row("Views on phones", phones)}${row("Total subscribers", allSubs)}</table>`));
      await db.from("settings").upsert({ key: "notify_state", value: { ...st, summary: today } });
      out.summary = true;
    }
    return json(out);
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
