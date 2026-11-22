import commission from '../../commission/index.html';
import { createPilot } from './pilot.mjs';

const serve = createPilot(commission);

export default {
  fetch(request, env, context) {
    context.passThroughOnException();
    return serve(request);
  },
};
