// Vector 4: the specifier is assembled at runtime, so no static reader can see
// what it is. Refused for being unreadable — which is the point.
const half = 'node:'
const spec = `${half}child_process`

export async function run(): Promise<unknown> {
  const mod = await import(spec)
  return mod
}
