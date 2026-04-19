// supabase/functions/send-reservation-email/index.ts
// Triggered by a Supabase Database Webhook on UPDATE to the 'classes' table.
// Detects newly added entries in occupied_spots and sends a confirmation email via Resend.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY     = Deno.env.get("RESEND_API_KEY")!;
const SUPABASE_URL       = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const DAYS_ES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const MONTHS_ES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

serve(async (req) => {
  try {
    const payload = await req.json();

    // Supabase DB Webhook format: { type, table, schema, record, old_record }
    const { type, record: newClass, old_record: oldClass } = payload;

    // Only process UPDATE events
    if (type !== "UPDATE") {
      return new Response("OK — not an UPDATE event", { status: 200 });
    }

    const newSpots: any[] = newClass.occupied_spots || [];
    const oldSpots: any[] = oldClass?.occupied_spots || [];

    // Determine which users were NEWLY added to occupied_spots
    const oldUserIds = new Set(oldSpots.map((s: any) => s.userId).filter(Boolean));
    const newlyAdded = newSpots.filter((s: any) => s.userId && !oldUserIds.has(s.userId));

    if (newlyAdded.length === 0) {
      return new Response("No new reservations to notify", { status: 200 });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Parse class time from note field: [T:HH:mm]
    const timeMatch = newClass.note?.match(/\[T:(\d{2}:\d{2})\]/);
    const time24 = timeMatch ? timeMatch[1] : "00:00";
    const [hh, mm] = time24.split(":").map(Number);
    const hour12 = hh % 12 || 12;
    const ampm = hh >= 12 ? "PM" : "AM";
    const time12 = `${hour12}:${String(mm).padStart(2, "0")} ${ampm}`;

    // Format the date in Spanish
    const dateObj = new Date(newClass.date + "T12:00:00");
    const dayName = DAYS_ES[dateObj.getDay()];
    const monthName = MONTHS_ES[dateObj.getMonth()];
    const dateFormatted = `${dayName} ${dateObj.getDate()} de ${monthName} de ${dateObj.getFullYear()}`;

    // Send email for each newly added user
    const emailPromises = newlyAdded.map(async (spot: any) => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("email_fallback, full_name, nickname")
        .eq("id", spot.userId)
        .single();

      if (!profile?.email_fallback) {
        console.warn(`No email found for user ${spot.userId}, skipping.`);
        return;
      }

      const firstName = profile.full_name?.split(" ")[0] || profile.nickname || "Atleta";

      const emailRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "Mae Wellness Club <reservas@maewellnessclub.com.mx>",
          to: [profile.email_fallback],
          subject: `✅ Reserva Confirmada — ${newClass.discipline} · ${time12}`,
          html: buildEmailHTML(firstName, newClass.discipline, dateFormatted, time12, spot.spot),
        }),
      });

      if (!emailRes.ok) {
        const errBody = await emailRes.text();
        console.error(`Resend error for ${profile.email_fallback}:`, errBody);
      } else {
        console.log(`Email sent to ${profile.email_fallback}`);
      }
    });

    await Promise.allSettled(emailPromises);

    return new Response(`Emails processed for ${newlyAdded.length} new reservation(s)`, { status: 200 });

  } catch (err: any) {
    console.error("Edge Function error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});

function buildEmailHTML(firstName: string, discipline: string, date: string, time: string, spot: number): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reserva Confirmada — Mae Wellness Club</title>
</head>
<body style="margin:0; padding:0; background:#0a0a0a; font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width:520px; background:#141412; border-radius:16px; overflow:hidden; border:1px solid rgba(201,169,110,0.2);">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#c8a96e 0%,#9a7040 100%); padding:32px 40px; text-align:center;">
              <div style="font-size:1.8rem; font-weight:800; color:#fff; letter-spacing:1px;">MAE</div>
              <div style="font-size:0.75rem; color:rgba(255,255,255,0.8); letter-spacing:3px; margin-top:2px;">WELLNESS CLUB</div>
              <div style="margin-top:16px; font-size:1.15rem; color:#fff; font-weight:600;">¡Tu lugar está confirmado! 🎉</div>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px 36px;">
              <p style="margin:0 0 20px; color:#e0e0e0; font-size:1rem; line-height:1.6;">
                Hola, <strong style="color:#fff;">${firstName}</strong>. Tu reserva en Team Mae ha sido registrada exitosamente.
              </p>

              <!-- Class Details Box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(201,169,110,0.06); border:1px solid rgba(201,169,110,0.2); border-radius:12px; margin-bottom:24px;">
                <tr>
                  <td style="padding:20px 24px;">
                    <div style="display:flex; flex-direction:column; gap:10px;">
                      <div style="margin-bottom:8px;">
                        <span style="font-size:0.7rem; color:#c8a96e; text-transform:uppercase; letter-spacing:2px; font-weight:600;">Disciplina</span>
                        <div style="font-size:1.2rem; font-weight:700; color:#fff; margin-top:2px;">${discipline}</div>
                      </div>
                      <div style="border-top:1px solid rgba(255,255,255,0.07); padding-top:10px; margin-bottom:8px;">
                        <span style="font-size:0.7rem; color:#c8a96e; text-transform:uppercase; letter-spacing:2px; font-weight:600;">Fecha</span>
                        <div style="font-size:1rem; color:#e0e0e0; margin-top:2px;">${date}</div>
                      </div>
                      <div style="border-top:1px solid rgba(255,255,255,0.07); padding-top:10px; margin-bottom:8px;">
                        <span style="font-size:0.7rem; color:#c8a96e; text-transform:uppercase; letter-spacing:2px; font-weight:600;">Hora</span>
                        <div style="font-size:1rem; color:#e0e0e0; margin-top:2px;">${time} (GMT-5, Chetumal)</div>
                      </div>
                      <div style="border-top:1px solid rgba(255,255,255,0.07); padding-top:10px;">
                        <span style="font-size:0.7rem; color:#c8a96e; text-transform:uppercase; letter-spacing:2px; font-weight:600;">Tu Lugar</span>
                        <div style="font-size:1.5rem; font-weight:800; color:#c8a96e; margin-top:2px;">#${spot}</div>
                      </div>
                    </div>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 24px; color:#888; font-size:0.82rem; line-height:1.7; font-style:italic;">
                Si necesitas cancelar, hazlo desde la app con al menos 1 hora de anticipación antes de tu clase para recuperar tu crédito automáticamente.
              </p>

              <div style="text-align:center;">
                <a href="https://maewellnessclub.com.mx/#schedule"
                   style="display:inline-block; background:linear-gradient(135deg,#c8a96e,#9a7040); color:#fff; text-decoration:none; padding:14px 32px; border-radius:30px; font-weight:700; font-size:0.9rem; letter-spacing:0.5px;">
                  Ver Mis Clases
                </a>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:rgba(0,0,0,0.3); padding:20px 36px; text-align:center; border-top:1px solid rgba(255,255,255,0.05);">
              <p style="margin:0; font-size:0.72rem; color:#555;">
                © 2026 Mae Wellness Club · Chetumal, Quintana Roo, México<br>
                <a href="https://maewellnessclub.com.mx" style="color:#c8a96e; text-decoration:none;">maewellnessclub.com.mx</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
