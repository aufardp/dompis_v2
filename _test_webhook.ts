import { dispatchRegulerWebhook } from './app/libs/integrations/dispatchRegulerWebhook';

dispatchRegulerWebhook()
  .then((r) => console.log(JSON.stringify(r, null, 2)))
  .catch(console.error);
