import express from 'express';
import cors from 'cors';

/** HTTP layer only: parses requests, calls the service, maps results to status codes. */
export function createApp({ dishService, corsOrigins = [] }) {
  const app = express();
  app.use(cors({ origin: corsOrigins }));
  app.use(express.json({ limit: '10kb' }));

  app.get('/dishes', (_req, res) => {
    res.json(dishService.listDishes());
  });

  app.patch('/dishes/:dishId', (req, res) => {
    const result = dishService.updateDish(req.params.dishId, req.body);
    switch (result.type) {
      case 'ok':
        return res.status(200).json(result.dish);
      case 'invalid':
        return res.status(400).json({ code: 'VALIDATION_FAILED', error: 'Validation failed', details: result.errors });
      case 'not_found':
        return res.status(404).json({ code: 'DISH_NOT_FOUND', error: `Dish "${req.params.dishId}" not found` });
      case 'conflict':
        return res.status(409).json({
          code: 'VERSION_CONFLICT',
          error: 'This dish was updated by someone else. Reload to see the latest version.',
          current: result.current,
        });
      default:
        throw new Error(`Unhandled result type: ${result.type}`);
    }
  });

  app.use((_req, res) => {
    res.status(404).json({ code: 'ROUTE_NOT_FOUND', error: 'Route not found' });
  });

  // Express recognises error handlers by their 4-argument signature.
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ code: 'MALFORMED_JSON', error: 'Request body is not valid JSON' });
    }
    if (err.type === 'entity.too.large') {
      return res.status(413).json({ code: 'PAYLOAD_TOO_LARGE', error: 'Request body is too large' });
    }
    console.error(err);
    res.status(500).json({ code: 'INTERNAL_ERROR', error: 'Unexpected server error' });
  });

  return app;
}
