type Handler = (event: { httpMethod: string; body: string | null; headers?: Record<string, string | undefined> }) => Promise<{ statusCode: number; body: string }>;
import { getPublicCourseBundle, withLiveData } from './_publicData';

export const handler: Handler = async (event) => withLiveData(event, getPublicCourseBundle);
