import type { APIRoute } from 'astro';

export const prerender = false;

async function getAccessToken(clientId: string, clientSecret: string, refreshToken: string): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) {
    throw new Error(`Token exchange failed: ${res.status}`);
  }
  const { access_token } = await res.json() as { access_token: string };
  return access_token;
}

async function runReport(propertyId: string, token: string, body: object) {
  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GA API error ${res.status}: ${text}`);
  }
  return res.json();
}

export const GET: APIRoute = async ({ request: _request }) => {
  const clientId     = import.meta.env.GA_CLIENT_ID;
  const clientSecret = import.meta.env.GA_CLIENT_SECRET;
  const refreshToken = import.meta.env.GA_REFRESH_TOKEN;
  const propertyId   = import.meta.env.GA_PROPERTY_ID;

  // TEMP DEBUG
  console.error('[analytics] env check — GA_CLIENT_ID:', !!clientId, 'GA_CLIENT_SECRET:', !!clientSecret, 'GA_REFRESH_TOKEN:', !!refreshToken, 'GA_PROPERTY_ID:', !!propertyId);

  if (!clientId || !clientSecret || !refreshToken || !propertyId) {
    return new Response(JSON.stringify({ error: 'GA env vars not configured' }), { status: 500 });
  }

  let token: string;
  try {
    token = await getAccessToken(clientId, clientSecret, refreshToken);
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500 });
  }

  try {
    const [pageviews, topPages] = await Promise.all([
      runReport(propertyId, token, {
        dateRanges: [{ startDate: '28daysAgo', endDate: 'today' }],
        dimensions: [{ name: 'date' }],
        metrics: [{ name: 'screenPageViews' }],
        orderBys: [{ dimension: { dimensionName: 'date' } }],
      }),
      runReport(propertyId, token, {
        dateRanges: [{ startDate: '28daysAgo', endDate: 'today' }],
        dimensions: [{ name: 'pagePath' }],
        metrics: [{ name: 'screenPageViews' }, { name: 'averageSessionDuration' }],
        orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
        limit: 10,
      }),
    ]);

    return new Response(
      JSON.stringify({ pageviews, topPages }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500 });
  }
};
