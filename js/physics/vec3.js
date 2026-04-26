// 3D vector utilities operating on plain [x,y,z] arrays.
export function v3dot(a, b) { return a[0]*b[0] + a[1]*b[1] + a[2]*b[2]; }
export function v3cross(a, b) {
  return [a[1]*b[2] - a[2]*b[1], a[2]*b[0] - a[0]*b[2], a[0]*b[1] - a[1]*b[0]];
}
export function v3mag(a) { return Math.sqrt(a[0]*a[0] + a[1]*a[1] + a[2]*a[2]); }
export function v3scale(a, s) { return [a[0]*s, a[1]*s, a[2]*s]; }
export function v3add(a, b) { return [a[0]+b[0], a[1]+b[1], a[2]+b[2]]; }
export function v3sub(a, b) { return [a[0]-b[0], a[1]-b[1], a[2]-b[2]]; }
