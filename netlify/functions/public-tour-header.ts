type Handler = (event: { httpMethod: string; body: string | null; headers?: Record<string, string | undefined> }) => Promise<{ statusCode: number; body: string }>;
import { getCurrentTour, withLiveData } from './_publicData';

export const handler: Handler = async (event) => withLiveData(event, async (supabase) => ({ tour: await getCurrentTour(supabase) }));
