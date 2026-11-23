// SDF modeli koji se pretvaraju u mreže u workeru.

import { robotHeadModel, robotBodyModel } from './robotModels.js';

export function createModel(name, params) {
  switch (name) {
    case 'robotHead':
      return robotHeadModel(params);
    case 'robotBody':
      return robotBodyModel(params);
    default:
      throw new Error(`Nepoznat SDF model: ${name}`);
  }
}
