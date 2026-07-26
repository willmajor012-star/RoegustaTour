import { jsonResponse, type FunctionEvent, type FunctionResponse } from './_adminAuth';
import { badRequest, optionalString, runRows, withAdminSupabase } from './_adminSupabase';
import { installCourseTemplatesForTour } from './_courseTemplateInstaller';

type Handler = (event: FunctionEvent) => Promise<FunctionResponse>;

const availableTemplateSlugs = new Set(['faldo', 'oconnor', 'old-course']);

export const handler: Handler = (event) =>
  withAdminSupabase(event, 'POST', async (supabase, body) => {
    const tourId = optionalString(body.tourId);
    const templateSlugs = Array.isArray(body.templateSlugs)
      ? body.templateSlugs
          .map(optionalString)
          .filter((slug): slug is string => Boolean(slug))
      : [];
    if (!tourId) return badRequest('Tour ID is required.');
    if (
      templateSlugs.length === 0 ||
      templateSlugs.some((slug) => !availableTemplateSlugs.has(slug))
    ) {
      return badRequest('Choose one or more valid course-guide templates.');
    }
    const tours = await runRows<{ id: string }>(
      supabase.from('tours').select('id').eq('id', tourId).limit(1),
      'find template destination tour',
    );
    if (tours.length === 0) return badRequest('Tour must exist.');

    const installed = await installCourseTemplatesForTour(
      supabase,
      tourId,
      [...new Set(templateSlugs)],
      {
        published: body.published === true,
        showOnHome: body.showOnHome === true,
      },
    );
    return jsonResponse(200, { ok: true, ...installed });
  });
