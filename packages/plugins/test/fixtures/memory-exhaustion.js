// Hostile fixture (L7 task 6): resource exhaustion via unbounded heap
// growth. Must trip the worker's real `resourceLimits.maxOldGenerationSizeMb`
// ceiling and terminate the worker — never allowed to OOM the host process.
const chunks = []
while (true) {
  chunks.push(new Array(1_000_000).fill('x'))
}
