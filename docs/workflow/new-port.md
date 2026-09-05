---
read-when: a use case needs a capability the application does not have yet
related: [../architecture/ports, ../standards/testing, ../layers/infrastructure]
---

# Adding a port

1. Declare the interface in `packages/application/src/<component>/ports/<Name>.ts`, in the vocabulary of the use case.
2. Write the contract test suite in `packages/infrastructure/test/contracts/<Name>.contract.ts`. It exports a function that receives a factory for the implementation and registers the assertions.
3. Implement it in memory in `packages/infrastructure/src/memory/<Name>.ts`. Run the contract suite against it.
4. Implement it for the real provider in `packages/infrastructure/src/<provider>/<Name>.ts`. Run the contract suite against it, using the provider sandbox or a local service.
5. Wire both in `src/main`: memory for `test`, real for `production`, chosen by configuration for `development`.

A port without all five steps is not merged.
