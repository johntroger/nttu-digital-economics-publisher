import { readConfiguration } from './config.ts';
import type { Bindings } from './config.ts';

function json(value: unknown, status: number): Response {
  return Response.json(value, {
    status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}

export default {
  async fetch(request: Request, bindings: Bindings): Promise<Response> {
    let config;
    try {
      config = readConfiguration(bindings);
    } catch {
      return json({ code: 'CONFIGURATION_NOT_READY', message: 'Cấu hình chưa sẵn sàng.' }, 503);
    }
    const path = new URL(request.url).pathname;
    if (request.method === 'GET' && path === '/health') {
      // Liveness only. This does not assert database, scheduler or Meta readiness.
      return json({
        service: 'nttu-publisher', step: 1, environment: config.environment,
        integrationMode: config.integrationMode, publishingImplemented: false,
        databaseChecked: false, schedulerImplemented: false,
      }, 200);
    }
    if (path.startsWith('/api/')) {
      return json({ code: 'STEP_PENDING', message: 'Chức năng chưa được triển khai ở bước 1.' }, 501);
    }
    return json({ code: 'NOT_FOUND', message: 'Không tìm thấy đường dẫn.' }, 404);
  },
};
