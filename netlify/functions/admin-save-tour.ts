type Handler = (event: { httpMethod: string; body: string | null }) => Promise<{ statusCode: number; body: string }>;

export const handler: Handler = async (event) => ({
  statusCode: 202,
  body: JSON.stringify({
    functionName: 'admin-save-tour',
    method: event.httpMethod,
    placeholder: true,
    todo: 'TODO: verify shared admin PIN/session, perform Supabase write with service role key server-side only, and insert audit_log row.'
  }),
});
