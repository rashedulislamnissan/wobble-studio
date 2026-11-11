/** URL parameters: ?dev=blob|tints, ?renderer=webgl, ?object=<id>. */
export interface AppParams {
  dev: string | null;
  forceWebGL: boolean;
  object: string | null;
}

export function readParams(search = location.search): AppParams {
  const p = new URLSearchParams(search);
  return {
    dev: p.get('dev'),
    forceWebGL: p.get('renderer') === 'webgl',
    object: p.get('object'),
  };
}
