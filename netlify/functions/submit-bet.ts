type Handler = (event: { httpMethod: string; body: string | null }) => Promise<{ statusCode: number; body: string }>;
export const handler: Handler = async (event) => ({ statusCode: 202, body: JSON.stringify({ accepted: true, submitted: event.body ? JSON.parse(event.body) : null, todo: 'TODO: validate input and insert bet into Supabase. No payment handling.' }) });
