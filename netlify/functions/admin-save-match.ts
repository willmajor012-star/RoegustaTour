import { adminPlaceholderHandler, type FunctionEvent, type FunctionResponse } from './_adminAuth';

type Handler = (event: FunctionEvent) => Promise<FunctionResponse>;

export const handler: Handler = (event) => adminPlaceholderHandler(event, 'admin-save-match');
