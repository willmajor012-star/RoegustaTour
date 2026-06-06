type Handler = (event: { httpMethod: string; body: string | null }) => Promise<{ statusCode: number; body: string }>;
import { getBettingBundle, withLiveData } from './_publicData';

export const handler: Handler = async () => withLiveData(getBettingBundle);
