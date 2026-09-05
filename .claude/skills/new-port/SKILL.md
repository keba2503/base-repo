---
name: new-port
description: Create a port with its five mandatory pieces: interface, contract suite, memory implementation, real implementation, wiring in main. Use when a use case needs a capability outside memory.
argument-hint: [PortName] [provider]
---

Port: $0. Provider: $1.

Follow docs/workflow/new-port.md and docs/architecture/ports.md exactly. Do not skip the memory implementation even if the provider one is trivial. Run the contract suite against both before wiring in main. Report the five files created.
