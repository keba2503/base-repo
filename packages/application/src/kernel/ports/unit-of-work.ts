export type UnitOfWork = {
  run<Value>(work: () => Promise<Value>): Promise<Value>;
};
