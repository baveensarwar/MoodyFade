// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function normalizePhoneToE164(raw: string) {
  const s = String(raw ?? "").trim();
  if (!s) return null;

  if (s.startsWith("+")) {
    const digits = "+" + s.slice(1).replace(/\D/g, "");
    return /^\+\d{8,15}$/.test(digits) ? digits : null;
  }

  const digits = s.replace(/\D/g, "");
  if (digits.length === 10) return "+1" + digits;
  if (digits.length === 11 && digits.startsWith("1")) return "+" + digits;
  return null;
}

function fmtBookingDate(isoDate: string) {
  const d = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString("en-CA", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function twilioHint(code: number | null) {
  if (code === 21608) return "Twilio trial can only send SMS to verified numbers. Verify this recipient in Twilio Console.";
  if (code === 21211) return "Phone number is invalid. Use full international format like +12365551234.";
  if (code === 21614) return "Destination phone cannot receive SMS (landline/unsupported).";
  if (code === 21606) return "Twilio sender is invalid. Check TWILIO_FROM_NUMBER or Messaging Service SID.";
  if (code === 20003) return "Twilio auth failed. Re-check TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN secrets.";
  return null;
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
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const twilioSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const twilioToken = Deno.env.get("TWILIO_AUTH_TOKEN");
    const twilioFrom = Deno.env.get("TWILIO_FROM_NUMBER");
    const twilioMsgServiceSid = Deno.env.get("TWILIO_MESSAGING_SERVICE_SID");

    if (!supabaseUrl || !serviceRoleKey || !twilioSid || !twilioToken) {
      return new Response(JSON.stringify({ error: "Missing required environment variables" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!twilioFrom && !twilioMsgServiceSid) {
      return new Response(
        JSON.stringify({ error: "Missing sender config: set TWILIO_FROM_NUMBER or TWILIO_MESSAGING_SERVICE_SID" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const body = await req.json().catch(() => ({}));
    const bookingId = String(body?.bookingId ?? "").trim();

    const admin = createClient(supabaseUrl, serviceRoleKey);

    let booking: {
      client_name: string | null;
      client_phone: string | null;
      service_name: string | null;
      service_price: number | null;
      date: string | null;
      time: string | null;
      staff_name: string | null;
      status?: string | null;
    } | null = null;

    if (bookingId) {
      const { data, error } = await admin
        .from("bookings")
        .select("client_name, client_phone, service_name, service_price, date, time, staff_name, status")
        .eq("id", bookingId)
        .single();
      if (error || !data) {
        return new Response(JSON.stringify({ error: "Booking not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      booking = data;
    } else {
      booking = {
        client_name: body?.clientName ?? null,
        client_phone: body?.clientPhone ?? null,
        service_name: body?.serviceName ?? null,
        service_price: body?.servicePrice ?? null,
        date: body?.date ?? null,
        time: body?.time ?? null,
        staff_name: body?.staffName ?? null,
        status: "confirmed",
      };
    }

    if (booking.status && booking.status !== "confirmed") {
      return new Response(JSON.stringify({ error: "Booking is not confirmed" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const to = normalizePhoneToE164(String(booking.client_phone ?? ""));
    if (!to) {
      return new Response(JSON.stringify({ error: "Client phone is missing or invalid" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!booking.service_name || !booking.date || !booking.time) {
      return new Response(JSON.stringify({ error: "Missing booking details for SMS" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const when = `${fmtBookingDate(String(booking.date))} at ${booking.time}`;
    const staffPart = booking.staff_name ? ` with ${booking.staff_name}` : "";
    const total = booking.service_price != null ? `$${booking.service_price} CAD` : "quoted in shop";

    const sms = `Moody Fade: Hi ${booking.client_name || "there"}, your booking is confirmed for ${booking.service_name} on ${when}${staffPart}. Total: ${total}.`;

    const auth = btoa(`${twilioSid}:${twilioToken}`);
    const form = new URLSearchParams({
      To: to,
      Body: sms,
    });

    if (twilioMsgServiceSid) {
      form.set("MessagingServiceSid", twilioMsgServiceSid);
    } else if (twilioFrom) {
      form.set("From", twilioFrom);
    }

    const twilioRes = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    });

    if (!twilioRes.ok) {
      const detailsRaw = await twilioRes.text();
      let details: any = null;
      try {
        details = detailsRaw ? JSON.parse(detailsRaw) : null;
      } catch (_e) {
        details = null;
      }

      const twilioCode = Number(details?.code ?? NaN);
      const hint = Number.isFinite(twilioCode) ? twilioHint(twilioCode) : null;

      return new Response(JSON.stringify({
        error: "Twilio request failed",
        message: details?.message || detailsRaw,
        code: Number.isFinite(twilioCode) ? twilioCode : null,
        status: details?.status || twilioRes.status,
        hint,
      }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const twilioData = await twilioRes.json();

    return new Response(JSON.stringify({ ok: true, sid: twilioData.sid }), {
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
