type Handler = (event: { httpMethod: string; body: string | null }) => Promise<{ statusCode: number; body: string }>;

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed', todo: 'TODO: persist valid bets to Supabase in a future phase.' }),
    };
  }

  let submitted: unknown = null;
  if (event.body) {
    try {
      submitted = JSON.parse(event.body);
    } catch {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid JSON body' }),
      };
    }
  }

  return {
    statusCode: 202,
    body: JSON.stringify({
      accepted: true,
      submitted,
      todo: 'TODO: validate input and insert bet into Supabase. No payment handling, wallet, or money transfer.',
    }),
  };
};
