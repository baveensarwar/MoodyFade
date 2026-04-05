// @ts-nocheck
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function fmtBookingDate(isoDate: string) {
  const d = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString("en-CA", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const fromEmail = Deno.env.get("FROM_EMAIL") || "Moody Fade <bookings@moodyfade.ca>";

    if (!resendApiKey) {
      return new Response(JSON.stringify({ error: "Missing RESEND_API_KEY environment variable" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const { clientName, clientEmail, serviceName, servicePrice, date, time, staffName, notes } = body;

    if (!clientEmail || !serviceName || !date || !time) {
      return new Response(JSON.stringify({ error: "Missing required booking details" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const when = `${fmtBookingDate(String(date))} at ${time}`;
    const staffPart = staffName ? `with ${staffName}` : "with any available barber";
    const total = servicePrice != null ? `$${servicePrice} CAD` : "quoted in shop";
    const notesPart = notes ? `<tr><td style="padding:6px 0;color:#888;font-size:13px;font-weight:600;width:120px">Notes</td><td style="padding:6px 0;color:#fff;font-size:13px">${notes}</td></tr>` : "";

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Booking Confirmed – Moody Fade</title>
</head>
<body style="margin:0;padding:0;background:#0A0A0A;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0A0A0A;padding:40px 16px">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#111;border-radius:12px;border:1px solid #272727;overflow:hidden">

        <!-- Header -->
        <tr>
          <td style="background:#111;border-bottom:3px solid #FFCB05;padding:32px 36px 28px;text-align:center">
            <div style="font-size:22px;font-weight:800;color:#FFCB05;letter-spacing:2px;text-transform:uppercase">MOODY FADE</div>
            <div style="font-size:11px;color:#606060;letter-spacing:3px;text-transform:uppercase;margin-top:4px">Barbershop · Vancouver</div>
          </td>
        </tr>

        <!-- Check + title -->
        <tr>
          <td style="padding:36px 36px 0;text-align:center">
            <div style="display:inline-block;width:52px;height:52px;background:rgba(255,203,5,.1);border-radius:50%;line-height:52px;font-size:22px;margin-bottom:16px">✓</div>
            <h1 style="margin:0 0 6px;font-size:22px;font-weight:700;color:#fff">Booking Confirmed</h1>
            <p style="margin:0;font-size:14px;color:#888">Hey ${clientName || "there"}, you're all set.</p>
          </td>
        </tr>

        <!-- Details card -->
        <tr>
          <td style="padding:28px 36px">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#191919;border-radius:10px;border:1px solid #272727;padding:20px 22px">
              <tr>
                <td style="padding-bottom:14px;border-bottom:1px solid #272727" colspan="2">
                  <div style="font-size:11px;color:#606060;letter-spacing:2px;text-transform:uppercase;margin-bottom:4px">Appointment</div>
                  <div style="font-size:17px;font-weight:700;color:#FFCB05">${when}</div>
                </td>
              </tr>
              <tr><td height="14"></td></tr>
              <tr>
                <td style="padding:6px 0;color:#888;font-size:13px;font-weight:600;width:120px">Service</td>
                <td style="padding:6px 0;color:#fff;font-size:13px">${serviceName}</td>
              </tr>
              <tr>
                <td style="padding:6px 0;color:#888;font-size:13px;font-weight:600">Barber</td>
                <td style="padding:6px 0;color:#fff;font-size:13px">${staffName || "Any Available"}</td>
              </tr>
              <tr>
                <td style="padding:6px 0;color:#888;font-size:13px;font-weight:600">Location</td>
                <td style="padding:6px 0;color:#fff;font-size:13px">2255 E Hastings St, Vancouver</td>
              </tr>
              <tr>
                <td style="padding:6px 0;color:#888;font-size:13px;font-weight:600">Total</td>
                <td style="padding:6px 0;color:#FFCB05;font-size:13px;font-weight:700">${total}</td>
              </tr>
              ${notesPart}
            </table>
          </td>
        </tr>

        <!-- CTA note -->
        <tr>
          <td style="padding:0 36px 28px;text-align:center">
            <p style="margin:0;font-size:12px;color:#606060;line-height:1.6">Need to cancel or reschedule? Call or text us at<br><span style="color:#FFCB05">+1 (236) 480-4026</span></p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#0A0A0A;border-top:1px solid #272727;padding:18px 36px;text-align:center">
            <p style="margin:0;font-size:11px;color:#444">© Moody Fade Barbershop · 2255 E Hastings St, Vancouver, BC</p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

    const text = `Moody Fade – Booking Confirmed\n\nHey ${clientName || "there"}, your booking is confirmed!\n\nService: ${serviceName}\nBarber: ${staffName || "Any Available"}\nWhen: ${when}\nLocation: 2255 E Hastings St, Vancouver\nTotal: ${total}${notes ? `\nNotes: ${notes}` : ""}\n\nNeed to cancel? Call/text +1 (236) 480-4026.\n\n– Moody Fade Barbershop`;

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [clientEmail],
        subject: `Booking Confirmed – ${serviceName} on ${fmtBookingDate(String(date))}`,
        html,
        text,
      }),
    });

    if (!resendRes.ok) {
      const details = await resendRes.text();
      let parsed: any = null;
      try { parsed = JSON.parse(details); } catch (_) { parsed = null; }
      return new Response(JSON.stringify({
        error: "Resend request failed",
        message: parsed?.message || details,
        statusCode: resendRes.status,
      }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await resendRes.json();
    return new Response(JSON.stringify({ ok: true, id: data.id }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
