export type SoftDeletable = {
  readonly deletedAt: Date | null;
};

export function isDeleted(entity: SoftDeletable): boolean {
  return entity.deletedAt !== null;
}
