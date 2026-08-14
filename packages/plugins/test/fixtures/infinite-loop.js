// Hostile fixture (L7 task 3): resource exhaustion via a synchronous
// infinite loop. Must be terminated by the sandbox's own vm timeout and/or
// the host's worker.terminate() — never allowed to hang the process.
while (true) {
  // spin
}
