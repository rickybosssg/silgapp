import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { messageSid } = await req.json();

    if (!messageSid) {
      return Response.json({ error: 'messageSid requis' }, { status: 400 });
    }

    // Récupération du statut Twilio
    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');

    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages/${messageSid}.json`;

    const response = await fetch(url, {
      headers: {
        'Authorization': 'Basic ' + btoa(`${accountSid}:${authToken}`),
      },
    });

    if (!response.ok) {
      const error = await response.text();
      return Response.json({ error: `Twilio API error: ${error}` }, { status: response.status });
    }

    const data = await response.json();

    return Response.json({
      sid: data.sid,
      status: data.status,
      to: data.to,
      from: data.from,
      body: data.body,
      dateSent: data.dateSent,
      dateCreated: data.dateCreated,
      dateUpdated: data.dateUpdated,
      errorMessage: data.error_message,
      errorCode: data.error_code,
      direction: data.direction,
      price: data.price,
      priceUnit: data.priceUnit,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});