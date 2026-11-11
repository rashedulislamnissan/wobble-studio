/** ?dev=tints — every object × variant on its computed tint (built out in Phase 2). */
import { h } from './dom';

export function startTintBoard() {
  document.getElementById('ui')!.append(h('p', {}, 'Tint board arrives with the object registry.'));
}
